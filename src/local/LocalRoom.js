import rules from '../shared/rules';
import bot from '../shared/bot';
import timing from '../shared/timing';
import BOARDS from '../shared/boards.json';
import { NO_MOVES_HOLD_MS } from '../game/moves';

export const LOCAL_KEY = 'marralhinha:local';
export const LOCAL_CODE = 'LOCAL';
const BOT_DELAY_MS = 450;
const BOT_NAMES = ['Rollo', 'Pebbles', 'Dicey', 'Clink'];

const newId = () => Math.random().toString(36).slice(2, 10);
const human = (n) => ({ id: newId(), name: `Player ${n}`, isBot: false, connected: true });
const botSeat = (seat) => ({ id: newId(), name: BOT_NAMES[seat], isBot: true, connected: true });
const defaultSeats = () => [human(1), null, human(2), null];

export function loadLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY));
    return saved && Array.isArray(saved.seats) ? saved : null;
  } catch {
    return null;
  }
}

export const savedGameExists = () => {
  const saved = loadLocal();
  return !!saved?.game && saved.game.phase !== 'over';
};

export class LocalRoom {
  constructor(saved = null) {
    const keep = saved || {};
    this.seats = keep.seats || defaultSeats();
    this.variant = keep.variant || 'classic';
    this.teams = !!keep.teams;
    this.table = !!keep.table;
    this.game = keep.game || null;
    this.lastHuman = keep.lastHuman || null;
    this.skin = null;
    this.listeners = new Set();
    this.timer = null;
    this.schedule();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setSkin(skin) {
    this.skin = skin;
  }

  dispose() {
    clearTimeout(this.timer);
    this.listeners.clear();
  }

  active() {
    return [0, 1, 2, 3].filter((s) => this.seats[s]);
  }

  humans() {
    return this.seats.filter((p) => p && !p.isBot);
  }

  activePlayerId() {
    const { game } = this;
    if (game) {
      const seat = game.phase === 'over' ? game.winners?.[0] : game.turn;
      const p = this.seats[seat];
      if (p && !p.isBot) this.lastHuman = p.id;
    }
    const known = this.seats.find((p) => p && p.id === this.lastHuman);
    return (known || this.humans()[0] || this.seats.find(Boolean))?.id ?? null;
  }

  view() {
    const activePlayerId = this.activePlayerId();
    return {
      code: LOCAL_CODE,
      local: true,
      table: this.table,
      hostId: activePlayerId,
      activePlayerId,
      activity: false,
      teams: this.teams,
      variant: this.game?.variant || this.variant,
      turnSeconds: null,
      turnEndsIn: null,
      seats: this.seats.map((p) => p && { ...p, cosmetics: p.isBot ? undefined : this.skin || undefined, tags: [], devices: 1, coverGrace: 0 }),
      spectators: [],
      swapOffers: [],
      rematch: null,
      chat: [],
      game: this.game,
    };
  }

  persist() {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ seats: this.seats, variant: this.variant, teams: this.teams, table: this.table, game: this.game, lastHuman: this.lastHuman }));
    } catch {}
  }

  changed() {
    this.persist();
    this.schedule();
    const view = this.view();
    this.listeners.forEach((fn) => fn(view));
  }

  action(event, payload = {}) {
    switch (event) {
      case 'local:seat':
        return this.setSeat(payload.seat, payload.kind);
      case 'local:rename':
        return this.rename(payload.seat, payload.name);
      case 'local:table':
        this.table = !!payload.table;
        return this.changed();
      case 'lobby:teams':
        this.teams = !!payload.teams;
        return this.changed();
      case 'lobby:variant':
        if (!BOARDS[payload.variant]) throw new Error('Unknown board variant');
        this.variant = payload.variant;
        return this.changed();
      case 'game:start':
        return this.start();
      case 'game:roll':
        return this.roll();
      case 'game:move':
        return this.move(payload.moveId);
      case 'game:rematch':
        return this.start(true);
      case 'local:menu':
        this.game = null;
        return this.changed();
      default:
        return undefined;
    }
  }

  setSeat(seat, kind) {
    if (this.game || !Number.isInteger(seat) || seat < 0 || seat > 3) return;
    const current = this.seats[seat];
    if (kind === 'empty') this.seats[seat] = null;
    else if (kind === 'bot') this.seats[seat] = botSeat(seat);
    else if (!current || current.isBot) this.seats[seat] = human(this.humans().length + 1);
    this.changed();
  }

  rename(seat, name) {
    const p = this.seats[seat];
    if (!p || p.isBot) return;
    p.name = String(name ?? '').replace(/\s+/g, ' ').slice(0, 16) || `Player ${seat + 1}`;
    this.changed();
  }

  start(rematch = false) {
    if (this.game && !rematch) throw new Error('The game has already started');
    if (this.active().length < 2) throw new Error('You need at least 2 players');
    if (!this.humans().length) throw new Error('Seat at least one human');
    const last = rematch ? this.game?.winners?.[0] : null;
    const starter = last !== undefined && last !== null && this.seats[last] ? { seat: last, reason: 'winner' } : { seat: this.active()[Math.floor(Math.random() * this.active().length)], reason: 'wheel' };
    this.game = rules.createGame(this.seats, { teams: this.teams, starter, boardSeat: null, variant: this.variant });
    this.changed();
  }

  requireHumanTurn(phase) {
    const { game } = this;
    if (!game || game.phase !== phase) throw new Error(phase === 'roll' ? 'Pick a marble to move first' : 'Roll the dice first');
    if (this.seats[game.turn]?.isBot) throw new Error("It's not your turn");
  }

  roll() {
    this.requireHumanTurn('roll');
    rules.roll(this.game);
    this.changed();
  }

  move(moveId) {
    this.requireHumanTurn('move');
    if (!this.game.legalMoves.some((m) => m.id === moveId)) throw new Error("That move isn't allowed");
    rules.move(this.game, moveId);
    this.changed();
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = null;
    const { game } = this;
    if (!game || game.phase === 'over' || !this.seats[game.turn]?.isBot) return;
    const deadRoll = game.lastRoll?.noMoves && Date.now() - game.lastRoll.t < 250;
    const delay = BOT_DELAY_MS + Math.floor(Math.random() * 400) + timing.animationMs(game) + (deadRoll ? NO_MOVES_HOLD_MS : 0);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.game !== game || game.phase === 'over') return;
      if (game.phase === 'roll') rules.roll(game);
      else rules.move(game, bot.chooseMove(game).id);
      this.changed();
    }, delay);
  }

  resume() {
    if (this.game && !this.timer) this.schedule();
  }
}
