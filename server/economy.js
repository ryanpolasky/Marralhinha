const { randomInt, createHash } = require('crypto');
const { transaction } = require('./db');
const { levelInfo } = require('./accounts');
const { catalog, ITEMS, BOXES, DROPPABLE, itemsOfRarity, REWARDS } = require('./catalog');

class EconomyError extends Error {}

const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const prevDay = (day) => utcDay(Date.parse(`${day}T00:00:00Z`) - 86400000);
const parse = (json) => {
  try {
    return JSON.parse(json) || {};
  } catch {
    return {};
  }
};

function weightedPick(weights, rand = (n) => randomInt(n)) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const scale = 1000;
  const total = entries.reduce((sum, [, w]) => sum + Math.round(w * scale), 0);
  let roll = rand(total);
  for (const [key, w] of entries) {
    roll -= Math.round(w * scale);
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}

function featuredFor(day) {
  let seed = parseInt(createHash('sha256').update(`featured:${day}`).digest('hex').slice(0, 8), 16);
  const rand = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const pool = [...DROPPABLE];
  const picks = [];
  const fancy = pool.filter((i) => i.rarity === 'epic' || i.rarity === 'legendary');
  picks.push(fancy[rand(fancy.length)]);
  while (picks.length < catalog.featured.count) {
    const item = pool[rand(pool.length)];
    if (!picks.includes(item)) picks.push(item);
  }
  return picks.map((item) => ({ id: item.id, price: catalog.featured.prices[item.rarity] }));
}

class Economy {
  constructor(db, accounts) {
    this.db = db;
    this.accounts = accounts;
    this.q = {
      addCoins: db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?'),
      addXp: db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?'),
      ledger: db.prepare('INSERT INTO ledger (user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)'),
      daily: db.prepare('UPDATE users SET daily_day = ?, streak = ? WHERE id = ?'),
      counters: db.prepare('UPDATE users SET counter_day = ?, bot_games_today = ?, won_today = ? WHERE id = ?'),
      stats: db.prepare('UPDATE users SET games = games + 1, wins = wins + ?, captures = captures + ?, sixes = sixes + ?, captured = captured + ?, shortcuts = shortcuts + ?, marbles_home = marbles_home + ? WHERE id = ?'),
      pity: db.prepare('UPDATE users SET pity = ?, boxes_opened = boxes_opened + 1 WHERE id = ?'),
      addItem: db.prepare('INSERT OR IGNORE INTO inventory (user_id, item_id, acquired_at) VALUES (?, ?, ?)'),
    };
  }

  user(userId) {
    const user = this.accounts.getUser(userId);
    if (!user) throw new EconomyError('Account not found');
    return user;
  }

  credit(userId, delta, reason) {
    if (!delta) return;
    this.q.addCoins.run(delta, userId);
    this.q.ledger.run(userId, delta, reason, Date.now());
  }

  spend(user, price, reason) {
    if (user.coins < price) throw new EconomyError(`You need ${price - user.coins} more ${catalog.currency}`);
    this.credit(user.id, -price, reason);
  }

  dailyStatus(user, now = Date.now()) {
    const today = utcDay(now);
    const available = user.daily_day !== today;
    const streak = !available ? user.streak : user.daily_day === prevDay(today) ? user.streak + 1 : 1;
    const { base, perStreakDay, maxStreakBonus } = REWARDS.daily;
    return { available, streak, reward: base + perStreakDay * Math.min(streak - 1, maxStreakBonus) };
  }

  claimDaily(userId, now = Date.now()) {
    return transaction(this.db, () => {
      const user = this.user(userId);
      const status = this.dailyStatus(user, now);
      if (!status.available) throw new EconomyError('Already claimed today, come back tomorrow!');
      this.q.daily.run(utcDay(now), status.streak, userId);
      this.credit(userId, status.reward, `daily:${status.streak}`);
      return { reward: status.reward, streak: status.streak };
    });
  }

  awardGame({ game, players, botGame, now = Date.now() }) {
    const today = utcDay(now);
    const results = {};
    transaction(this.db, () => {
      for (const { seat, userId } of players) {
        const user = this.accounts.getUser(userId);
        if (!user) continue;
        const fresh = user.counter_day === today;
        let botGames = fresh ? user.bot_games_today : 0;
        let wonToday = fresh ? user.won_today : 0;
        const won = game.winners.includes(seat);
        const stats = game.stats[seat];
        // Sixes and captures the bot or a covering partner made for this seat aren't yours (keeps Luckiest honest)
        const played = game.played?.[seat];
        const ownCaptures = Math.max(0, stats.captures - (played?.coveredCaptures || 0));
        const ownSixes = Math.max(0, (stats.sixes || 0) - (played?.coveredSixes || 0));
        // The bot played most of your turns (away, timed out, disconnected): no rewards, unless you're Dev
        const botCarried = !!played && played.botRolls * 2 > played.rolls && !this.accounts.isAdmin(user);
        const captures = Math.min(ownCaptures, REWARDS.maxCaptures);
        const home = game.marbles[seat].filter((p) => p.zone === 'home').length;

        let lines = [{ label: 'Game finished', amount: REWARDS.finish }];
        if (won) lines.push({ label: 'Victory', amount: REWARDS.win });
        if (captures) lines.push({ label: `Captures ×${captures}`, amount: captures * REWARDS.perCapture });
        if (home) lines.push({ label: `Marbles home ×${home}`, amount: home * REWARDS.perMarbleHome });
        if (won && !wonToday) lines.push({ label: 'First win of the day', amount: REWARDS.firstWinOfDay });

        let note = null;
        if (botCarried) {
          lines = [];
          note = 'The bot played most of your turns, so no rewards this game.';
        } else if (botGame) {
          if (botGames >= REWARDS.botGamesPerDay) {
            lines = [];
            note = `Daily bot-game rewards used up (${REWARDS.botGamesPerDay}/${REWARDS.botGamesPerDay}). Play with friends for more!`;
          } else {
            lines = lines.map((l) => ({ ...l, amount: Math.floor(l.amount * REWARDS.botGameMultiplier) }));
            botGames += 1;
            note = `Bot game: half rewards (${botGames}/${REWARDS.botGamesPerDay} today)`;
          }
        }
        const variantMultiplier = REWARDS.variantMultiplier?.[game.variant] ?? 1;
        if (variantMultiplier !== 1 && lines.length) {
          lines = lines.map((l) => (l.label === 'First win of the day' ? l : { ...l, amount: Math.floor(l.amount * variantMultiplier) }));
          note = `${note ? `${note} · ` : ''}Blitz: ${Math.round(variantMultiplier * 100)}% rewards (shorter game)`;
        }
        if (won && lines.length) wonToday = 1;

        const earned = lines.reduce((sum, l) => sum + l.amount, 0);
        const before = levelInfo(user.xp).level;
        const after = levelInfo(user.xp + earned).level;
        if (after > before) lines.push({ label: `Level up! (Lv ${after})`, amount: REWARDS.levelUpBonus * (after - before), levelUp: true });
        const total = lines.reduce((sum, l) => sum + l.amount, 0);

        this.credit(userId, total, `game:${won ? 'win' : 'finish'}`);
        this.q.addXp.run(earned, userId);
        this.q.stats.run(won && !botCarried ? 1 : 0, ownCaptures, ownSixes, stats.captured || 0, stats.shortcuts || 0, home, userId);
        this.q.counters.run(today, botGames, wonToday, userId);
        results[seat] = { total, xp: earned, lines, note, level: after, leveledUp: after > before, botCarried };
      }
    });
    return results;
  }

  // The shared "shake the chest" half of openBox and grantBox: pity counters, the weighted roll and the item
  rollBox(user, box, rand) {
    const pity = parse(user.pity);
    const counters = pity[box.id] || { epic: 0, legendary: 0 };
    const sinceEpic = counters.epic + 1;
    const sinceLegendary = counters.legendary + 1;

    let rarity;
    if (sinceLegendary >= box.pity.legendary) rarity = 'legendary';
    else if (sinceEpic >= box.pity.epic) rarity = weightedPick({ epic: box.weights.epic, legendary: box.weights.legendary }, rand);
    else rarity = weightedPick(box.weights, rand);

    pity[box.id] = {
      epic: rarity === 'epic' || rarity === 'legendary' ? 0 : sinceEpic,
      legendary: rarity === 'legendary' ? 0 : sinceLegendary,
    };
    this.q.pity.run(JSON.stringify(pity), user.id);

    const pool = itemsOfRarity(rarity);
    const item = pool[rand(pool.length)];
    const duplicate = this.accounts.owns(user.id, item.id);
    const refund = duplicate ? catalog.rarities[rarity].dupe : 0;
    if (duplicate) this.credit(user.id, refund, `dupe:${item.id}`);
    else this.q.addItem.run(user.id, item.id, Date.now());
    return { item: item.id, rarity, duplicate, refund };
  }

  openBox(userId, boxId, rand = (n) => randomInt(n)) {
    const box = BOXES.get(boxId);
    if (!box) throw new EconomyError('Unknown box');
    return transaction(this.db, () => {
      const user = this.user(userId);
      this.spend(user, box.price, `box:${box.id}`);
      return this.rollBox(user, box, rand);
    });
  }

  // A chest handed out for free (a thank-you gift attached to a report, event prizes): same odds, no cost
  grantBox(userId, boxId, rand = (n) => randomInt(n)) {
    const box = BOXES.get(boxId);
    if (!box) throw new EconomyError('Unknown box');
    return transaction(this.db, () => this.rollBox(this.user(userId), box, rand));
  }

  shop(now = Date.now()) {
    const day = utcDay(now);
    const refreshAt = Date.parse(`${day}T00:00:00Z`) + 86400000;
    return { featured: featuredFor(day), refreshAt };
  }

  buyFeatured(userId, itemId, now = Date.now()) {
    const offer = featuredFor(utcDay(now)).find((f) => f.id === itemId);
    if (!offer) throw new EconomyError("That item isn't in today's shop");
    return transaction(this.db, () => {
      const user = this.user(userId);
      if (this.accounts.owns(userId, itemId)) throw new EconomyError('You already own that');
      this.spend(user, offer.price, `buy:${itemId}`);
      this.q.addItem.run(userId, itemId, now);
      return { item: itemId };
    });
  }
}

function botCosmetics(seed) {
  const pick = (slot, i) => {
    const pool = DROPPABLE.filter((item) => item.slot === slot && ['common', 'rare'].includes(item.rarity));
    return pool[(seed * 7 + i * 13) % pool.length].id;
  };
  return { marble: pick('marble', 1), dice: pick('dice', 2), nameplate: pick('nameplate', 3), board: pick('board', 4) };
}

module.exports = { Economy, EconomyError, featuredFor, botCosmetics, utcDay, weightedPick, ITEMS };
