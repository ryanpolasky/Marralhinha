const { ITEMS, BOXES } = require('./catalog');

class ReportError extends Error {}

const KINDS = ['bug', 'idea'];
const MAX_LEN = 600;
// An open-report cap per player so one person can't bury the queue
const MAX_OPEN = 8;
const MAX_COIN_GIFT = 100000;
const PACKS = ['supporter', 'halloween'];

const cleanText = (text) =>
  String(text ?? '')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LEN);

// A resolution gift: coins, a chest, or a specific cosmetic. Anything else is rejected here so
// claiming can never hand out something unintended
function cleanGift(gift) {
  if (gift == null) return null;
  if (gift.type === 'coins') {
    const amount = Math.trunc(Number(gift.amount));
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_COIN_GIFT) throw new ReportError('Coin gifts go up to 100,000');
    return { type: 'coins', amount };
  }
  if (gift.type === 'box') {
    const box = BOXES.get(gift.box);
    if (!box) throw new ReportError('Unknown chest');
    return { type: 'box', box: box.id };
  }
  if (gift.type === 'item') {
    const item = ITEMS.get(gift.item);
    if (!item || item.rarity === 'default' || item.tag) throw new ReportError('Pick a giftable cosmetic');
    return { type: 'item', item: item.id };
  }
  if (gift.type === 'pack') {
    if (!PACKS.includes(gift.pack)) throw new ReportError('Unknown pack');
    return { type: 'pack', pack: gift.pack };
  }
  throw new ReportError('Unknown gift type');
}

const parse = (json) => {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};

class Reports {
  constructor(db) {
    this.db = db;
    this.q = {
      insert: db.prepare('INSERT INTO reports (user_id, kind, text, created_at) VALUES (?, ?, ?, ?)'),
      countOpen: db.prepare("SELECT COUNT(*) AS n FROM reports WHERE user_id = ? AND status = 'open'"),
      mine: db.prepare('SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'),
      byId: db.prepare('SELECT * FROM reports WHERE id = ?'),
      open: db.prepare(
        "SELECT r.*, u.name AS user_name FROM reports r LEFT JOIN users u ON u.id = r.user_id WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 200"
      ),
      all: db.prepare(
        "SELECT r.*, u.name AS user_name FROM reports r LEFT JOIN users u ON u.id = r.user_id ORDER BY (r.status = 'open') DESC, r.created_at DESC LIMIT 200"
      ),
      resolve: db.prepare("UPDATE reports SET status = 'resolved', response = ?, gift = ?, resolved_at = ? WHERE id = ?"),
      reopen: db.prepare("UPDATE reports SET status = 'open', response = NULL, gift = NULL, resolved_at = NULL, seen_at = NULL, claimed_at = NULL WHERE id = ?"),
      pending: db.prepare("SELECT * FROM reports WHERE user_id = ? AND status = 'resolved' AND seen_at IS NULL ORDER BY resolved_at"),
      markSeen: db.prepare('UPDATE reports SET seen_at = ? WHERE id = ? AND user_id = ?'),
      claim: db.prepare('UPDATE reports SET claimed_at = ?, seen_at = ? WHERE id = ? AND user_id = ? AND claimed_at IS NULL'),
    };
  }

  view(row) {
    if (!row) return null;
    return {
      id: row.id,
      kind: row.kind,
      text: row.text,
      status: row.status,
      response: row.response,
      gift: parse(row.gift),
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      claimed: !!row.claimed_at,
      userId: row.user_id,
      userName: row.user_name,
    };
  }

  get(id) {
    return this.q.byId.get(Number(id)) || null;
  }

  file(userId, kind, text) {
    if (!KINDS.includes(kind)) throw new ReportError('Pick bug report or feature idea');
    const clean = cleanText(text);
    if (clean.length < 5) throw new ReportError('Tell me a little more than that');
    if (this.q.countOpen.get(userId).n >= MAX_OPEN) throw new ReportError("You've got a few open reports already â let's resolve those first");
    const info = this.q.insert.run(userId, kind, clean, Date.now());
    return this.view(this.q.byId.get(info.lastInsertRowid));
  }

  mine(userId) {
    return this.q.mine.all(userId).map((row) => this.view(row));
  }

  list({ includeResolved = false } = {}) {
    return (includeResolved ? this.q.all : this.q.open).all().map((row) => this.view(row));
  }

  // Mark resolved with an optional player-facing note and a thank-you gift. Re-resolving just edits it.
  resolve(id, response, gift) {
    const row = this.get(id);
    if (!row) throw new ReportError('Report not found');
    const clean = cleanGift(gift);
    const note = cleanText(response) || null;
    this.q.resolve.run(note, clean ? JSON.stringify(clean) : null, Date.now(), row.id);
    return this.view(this.q.byId.get(row.id));
  }

  reopen(id) {
    const row = this.get(id);
    if (!row) throw new ReportError('Report not found');
    this.q.reopen.run(row.id);
    return this.view(this.q.byId.get(row.id));
  }

  // Resolved reports the player hasn't been shown yet â the "you've got mail" pile for next login
  pendingReplies(userId) {
    return this.q.pending.all(userId).map((row) => this.view(row));
  }

  dismiss(id, userId) {
    this.q.markSeen.run(Date.now(), Number(id), userId);
  }

  // Take the attached gift, exactly once. Returns the gift to grant, or null when there's none.
  takeGift(id, userId) {
    const row = this.get(id);
    if (!row || row.user_id !== userId || row.status !== 'resolved') throw new ReportError('Report not found');
    const gift = parse(row.gift);
    if (!gift) {
      this.q.markSeen.run(Date.now(), row.id, userId);
      return null;
    }
    const res = this.q.claim.run(Date.now(), Date.now(), row.id, userId);
    if (!res.changes) throw new ReportError('Already claimed');
    return gift;
  }
}

module.exports = { Reports, ReportError };
