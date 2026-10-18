import reactions from '../shared/reactions';

const REACTION_STYLES = {
  nice: { label: 'Nice!', hint: 'Nice one!', color: '#3fc1b0', tilt: -4 },
  ouch: { label: 'Ouch!', hint: 'That hurt', color: '#ff5a5f', tilt: 3 },
  haha: { label: 'Haha!', hint: 'Haha!', color: '#ffd166', tilt: -2 },
  hurry: { label: 'Hurry up!', hint: 'Your turn, pal', color: '#ff8a3d', tilt: 4 },
  lucky: { label: 'So lucky!', hint: 'Suspicious dice...', color: '#b98cff', tilt: -3 },
  gg: { label: 'GG', hint: 'Good game', color: '#8cc2ff', tilt: 2 },
};
export const REACTIONS = reactions.REACTION_KEYS.map((key) => ({ key, ...REACTION_STYLES[key] }));
export const REACTION_BY_KEY = Object.fromEntries(REACTIONS.map((r) => [r.key, r]));

const FIRST = ['Captain', 'Lucky', 'Speedy', 'Sneaky', 'Mighty', 'Turbo', 'Little', 'Big', 'Sir', 'Dr.', 'Grandma', 'Professor'];
const SECOND = ['Marble', 'Six', 'Pebble', 'Shooter', 'Noodle', 'Pickle', 'Walrus', 'Biscuit', 'Waffle', 'Dice', 'Nugget', 'Moose'];

export function randomNickname() {
  for (;;) {
    const name = `${FIRST[Math.floor(Math.random() * FIRST.length)]} ${SECOND[Math.floor(Math.random() * SECOND.length)]}`;
    if (name.length <= 16) return name;
  }
}

const MAX_AWARDS_PER_SEAT = 2;

export const AWARD_POOL = [
  { title: 'Marble Hunter', blurb: 'most captures', score: (s) => s.captures || 0 },
  { title: 'Six Machine', blurb: 'most sixes rolled', score: (s) => s.sixes || 0 },
  { title: 'Shortcut Fan', blurb: 'most center jumps', score: (s) => s.shortcuts || 0 },
  { title: 'Hot Hands', blurb: 'best average roll', score: (s) => (s.rolls >= 4 ? s.pips / s.rolls : 0), min: 0.1, format: (v) => v.toFixed(1) },
  { title: 'Punching Bag', blurb: 'got captured the most', score: (s) => s.captured || 0 },
  { title: 'Eviction Notice', blurb: 'most center captures', score: (s) => s.evictions || 0 },
  { title: 'Squatter', blurb: 'longest stay in the center', score: (s) => s.longestCenter || 0, min: 2 },
  { title: 'Heartbreaker', blurb: 'most captures near home', score: (s) => s.heartbreaks || 0 },
  { title: 'Hot Streak', blurb: 'most sixes in a row', score: (s) => s.bestStreak || 0, min: 2 },
  { title: 'Cold Hands', blurb: 'lowest average roll', score: (s) => (s.rolls >= 4 && s.pips / s.rolls < 3.2 ? 6 - s.pips / s.rolls : 0), min: 0.1, format: (v) => (6 - v).toFixed(1) },
  { title: 'Boxed In', blurb: 'most rolls with no move', score: (s) => s.noMoves || 0, min: 2 },
  { title: 'Marathoner', blurb: 'most steps moved', score: (s) => s.steps || 0, min: 15 },
];

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function computeAwards(game) {
  if (!game?.stats) return [];
  const seats = game.active;
  const candidates = [];
  AWARD_POOL.forEach(({ title, blurb, score, min = 1, format = (v) => v }) => {
    let best = null;
    let tops = [];
    seats.forEach((s) => {
      const v = score(game.stats[s] || {});
      if (v < min) return;
      if (best === null || v > best) {
        best = v;
        tops = [s];
      } else if (v === best) tops.push(s);
    });
    if (best !== null) candidates.push({ title, blurb, value: format(best), seats: shuffle(tops) });
  });
  shuffle(candidates);
  const counts = {};
  const awards = [];
  candidates.forEach(({ title, blurb, value, seats: tops }) => {
    const open = tops.filter((s) => (counts[s] || 0) < MAX_AWARDS_PER_SEAT);
    if (!open.length) return;
    open.sort((a, b) => (counts[a] || 0) - (counts[b] || 0));
    const seat = open[0];
    counts[seat] = (counts[seat] || 0) + 1;
    awards.push({ title, blurb, seat, value });
  });
  return shuffle(awards);
}
