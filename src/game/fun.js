// Keep these keys in sync with REACTIONS in server/rooms.js
export const REACTIONS = [
  { key: 'nice', label: 'Nice!', hint: 'Nice one!', color: '#3fc1b0', tilt: -4 },
  { key: 'ouch', label: 'Ouch!', hint: 'That hurt', color: '#ff5a5f', tilt: 3 },
  { key: 'haha', label: 'Haha!', hint: 'Haha!', color: '#ffd166', tilt: -2 },
  { key: 'hurry', label: 'Hurry up!', hint: 'Your turn, pal', color: '#ff8a3d', tilt: 4 },
  { key: 'lucky', label: 'So lucky!', hint: 'Suspicious dice...', color: '#b98cff', tilt: -3 },
  { key: 'gg', label: 'GG', hint: 'Good game', color: '#8cc2ff', tilt: 2 },
];
export const REACTION_BY_KEY = Object.fromEntries(REACTIONS.map((r) => [r.key, r]));

const FIRST = ['Captain', 'Lucky', 'Speedy', 'Sneaky', 'Mighty', 'Turbo', 'Little', 'Big', 'Sir', 'Dr.', 'Grandma', 'Professor'];
const SECOND = ['Marble', 'Six', 'Pebble', 'Shooter', 'Noodle', 'Pickle', 'Walrus', 'Biscuit', 'Waffle', 'Dice', 'Nugget', 'Moose'];

export function randomNickname() {
  for (;;) {
    const name = `${FIRST[Math.floor(Math.random() * FIRST.length)]} ${SECOND[Math.floor(Math.random() * SECOND.length)]}`;
    if (name.length <= 16) return name;
  }
}

export function computeAwards(game) {
  if (!game.stats) return [];
  const seats = game.active;
  const best = (score, min = 1) => {
    let top = null;
    seats.forEach((s) => {
      const v = score(game.stats[s]);
      if (v >= min && (top === null || v > top.v)) top = { seat: s, v };
    });
    return top;
  };
  const awards = [];
  const add = (title, blurb, top, format = (v) => v) => top && awards.push({ title, blurb, seat: top.seat, value: format(top.v) });
  add('Marble Hunter', 'most captures', best((s) => s.captures));
  add('Six Machine', 'most sixes rolled', best((s) => s.sixes));
  add('Shortcut Fan', 'most center jumps', best((s) => s.shortcuts));
  add('Hot Hands', 'best average roll', best((s) => (s.rolls >= 4 ? s.pips / s.rolls : 0), 0.1), (v) => v.toFixed(1));
  add('Punching Bag', 'got captured the most', best((s) => s.captured));
  return awards;
}
