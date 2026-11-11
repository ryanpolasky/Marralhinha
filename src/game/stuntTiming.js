import shared from '../shared/stunts';
import { hitClock, samePos, sinceClock } from './hits';

export const { DICE_STORM_COUNT, FLASH, UFO, ROCKY_JUMPS, rockyTiming, boardCrossSDF, dishSDF, boardSurfaceY, stuntSeconds } = shared;
export const stuntClock = hitClock;
export const stuntLive = (s, now) => !!s && !s.cut && stuntClock(s, now) < stuntSeconds(s);
export const liveStunt = (stunts) => (stunts || []).find((s) => stuntLive(s)) || null;
export const burnClock = (stuntId, die, now) => (die.burned ? sinceClock(`${stuntId}:burn:${die.id}`, die.burnedAge, now) : null);
// The game moving the marble for real ends its part in the bit
export const starOf = (stunt, board) => !!stunt && stunt.kind !== 'dice' && samePos(stunt.at, board.marbles[stunt.seat]?.[stunt.marble]);

// who 0 is Zorp (the small one with the tablet), who 1 is Klarg (the tall one with the probe); low = said from the floor
export const UFO_SCRIPT = [
  { who: 0, at: UFO.specimen, until: UFO.ball - 0.15, text: "Specimen 4,071. Earth's apex predator." },
  { who: 1, at: UFO.ball, until: UFO.menace - 0.15, text: "...It's a ball." },
  { who: 0, at: UFO.menace, until: UFO.toaster - 0.15, text: 'A PERFECT ball. Look at the menace.' },
  { who: 1, at: UFO.toaster, until: UFO.whipOut - 0.05, text: 'Remember the toaster?' },
  { who: 1, at: UFO.leader, until: UFO.tick - 0.1, text: 'Take us to your leader.' },
  { who: 0, at: UFO.thinking, until: UFO.ding - 0.05, text: "...It's thinking." },
  { who: 0, at: UFO.armed, until: UFO.abort - 0.1, text: "IT'S ARMED!" },
  { who: 1, at: UFO.abort, until: UFO.whipBack - 0.05, text: 'ABORT! ABORT!', low: true },
  { who: 1, at: UFO.classic, until: UFO.cried - 0.15, text: 'Hahaha. Classic.' },
  { who: 0, at: UFO.cried, until: UFO.cord - 0.15, text: 'You cried for a week.' },
  { who: 1, at: UFO.cord, until: UFO.pokeIt - 0.15, text: 'It had a CORD, Zorp.' },
  { who: 0, at: UFO.pokeIt, until: UFO.poke1 + 0.25, text: 'Anyway. Poke it.' },
  { who: 1, at: UFO.nothing, until: UFO.tossIt - 0.15, text: 'Nothing. Zero threat.' },
  { who: 0, at: UFO.tossIt, until: UFO.button + 0.15, text: 'Toss it.' },
];
export const ufoTalking = (who, t) => UFO_SCRIPT.some((l) => l.who === who && t >= l.at && t < l.until);
