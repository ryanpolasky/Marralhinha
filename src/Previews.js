import React, { Suspense, useState } from 'react';
import './App.css';
import Profile from './components/Profile';
import PlayerCard from './components/PlayerCard';
import Leaderboard from './components/Leaderboard';
import { ReportModal, RepliesModal } from './components/Reports';
import { Feed, ReactionBar } from './components/Game';
import { PreviewStage } from './components/Economy';
import { StatGrid, MatchHistory } from './components/Stats';
import { Eye, Coffee } from './components/Icons';

// ---------------------------------------------------------------------------
// Dummy data — everything below is fake so these pages render without a server
// ---------------------------------------------------------------------------

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const now = Date.now();

const ME = {
  id: 'demo-me',
  name: 'Zé Miguel',
  discordLinked: true,
  coins: 4820,
  xp: 4120,
  level: 9,
  into: 220,
  need: 750,
  admin: false,
  equipped: { marble: 'marble.galaxy', board: 'board.azulejo', dice: 'dice.jade', nameplate: 'plate.royal' },
  inventory: ['marble.galaxy', 'marble.pearl', 'board.azulejo', 'dice.jade', 'plate.royal', 'plate.waves'],
  tags: ['beta'],
  stats: { games: 128, wins: 61, captures: 341, captured: 210, sixes: 402, shortcuts: 37, home: 402, boxes: 23 },
  lucky: { holder: false, holderSixes: 512 },
  daily: { available: true, streak: 4, reward: 105 },
};

const FRIENDS = [
  { id: 'demo-ana', name: 'Ana', level: 14, tags: ['beta', 'lucky'], equipped: { marble: 'marble.gold', board: 'board.neon', dice: 'dice.gold', nameplate: 'plate.diamond' }, stats: { games: 312, wins: 168, captures: 902, captured: 431, sixes: 512, shortcuts: 88, home: 1045, boxes: 61 }, createdAt: now - 300 * DAY },
  { id: 'demo-rui', name: 'Rui', level: 11, tags: [], equipped: { marble: 'marble.camo', board: 'board.cork', dice: 'dice.obsidian', nameplate: 'plate.forest' }, stats: { games: 240, wins: 102, captures: 655, captured: 502, sixes: 389, shortcuts: 54, home: 812, boxes: 34 }, createdAt: now - 200 * DAY },
  { id: 'demo-inês', name: 'Inês', level: 10, tags: ['beta'], equipped: { marble: 'marble.frost', board: 'board.ocean', dice: 'dice.glow', nameplate: 'plate.aurora' }, stats: { games: 196, wins: 88, captures: 512, captured: 388, sixes: 341, shortcuts: 41, home: 690, boxes: 27 }, createdAt: now - 180 * DAY },
  { id: 'demo-tiago', name: 'Tiago', level: 8, tags: [], equipped: { marble: 'marble.lava', board: 'board.basalt', dice: 'dice.lava', nameplate: 'plate.lava' }, stats: { games: 142, wins: 54, captures: 377, captured: 355, sixes: 268, shortcuts: 29, home: 512, boxes: 19 }, createdAt: now - 150 * DAY },
  { id: 'demo-mara', name: 'Mara', level: 7, tags: [], equipped: { marble: 'marble.aurora', board: 'board.terrazzo', dice: 'dice.candy', nameplate: 'plate.candy' }, stats: { games: 117, wins: 49, captures: 299, captured: 281, sixes: 221, shortcuts: 25, home: 431, boxes: 15 }, createdAt: now - 120 * DAY },
  { id: 'demo-joão', name: 'João', level: 6, tags: [], equipped: { marble: 'marble.metal', board: 'board.slate', dice: 'dice.copper', nameplate: 'plate.slate' }, stats: { games: 98, wins: 38, captures: 240, captured: 256, sixes: 180, shortcuts: 19, home: 352, boxes: 11 }, createdAt: now - 100 * DAY },
];

const ME_ROW = { id: ME.id, name: ME.name, level: ME.level, tags: ME.tags, ...ME.stats, xp: ME.xp };
const boardRows = (key, dir = -1) => [...FRIENDS.map((f) => ({ id: f.id, name: f.name, level: f.level, tags: f.tags, ...f.stats, xp: f.stats.games * 34 })), ME_ROW].sort((a, b) => dir * (a[key] - b[key]));

const BOARDS = {
  wins: boardRows('wins'),
  winRate: boardRows('wins').filter((u) => u.games >= 5).sort((a, b) => b.wins / b.games - a.wins / a.games),
  sixes: boardRows('sixes'),
  captures: boardRows('captures'),
  home: boardRows('home'),
  level: boardRows('level'),
};

const MATCHES = [
  {
    id: 9,
    mode: 'teams',
    players: 4,
    bots: 0,
    turns: 74,
    endedAt: now - 2 * HOUR,
    mySeat: 0,
    won: true,
    seats: [
      { seat: 0, name: 'Zé Miguel', userId: ME.id, bot: false, won: true, home: 5, captures: 4, sixes: 5 },
      { seat: 2, name: 'Ana', userId: 'demo-ana', bot: false, won: true, home: 5, captures: 3, sixes: 4 },
      { seat: 1, name: 'Rui', userId: 'demo-rui', bot: false, won: false, home: 3, captures: 5, sixes: 3 },
      { seat: 3, name: 'Inês', userId: 'demo-inês', bot: false, won: false, home: 2, captures: 2, sixes: 2 },
    ],
  },
  {
    id: 8,
    mode: 'solo',
    players: 3,
    bots: 1,
    turns: 58,
    endedAt: now - 1 * DAY,
    mySeat: 0,
    won: false,
    seats: [
      { seat: 0, name: 'Zé Miguel', userId: ME.id, bot: false, won: false, home: 3, captures: 2, sixes: 3 },
      { seat: 1, name: 'Tiago', userId: 'demo-tiago', bot: false, won: true, home: 5, captures: 6, sixes: 5 },
      { seat: 2, name: 'Mara', userId: 'demo-mara', bot: false, won: false, home: 2, captures: 1, sixes: 1 },
      { seat: 3, name: 'Bot Tobias', userId: null, bot: true, won: false, home: 1, captures: 3, sixes: 2 },
    ],
  },
  {
    id: 7,
    mode: 'solo',
    players: 2,
    bots: 0,
    turns: 91,
    endedAt: now - 3 * DAY,
    mySeat: 1,
    won: true,
    seats: [
      { seat: 0, name: 'Rui', userId: 'demo-rui', bot: false, won: false, home: 4, captures: 4, sixes: 4 },
      { seat: 1, name: 'Zé Miguel', userId: ME.id, bot: false, won: true, home: 5, captures: 3, sixes: 6 },
    ],
  },
];

const MY_REPORTS = [
  {
    id: 41,
    kind: 'idea',
    text: 'A chocolate-mint marble for the holiday event? Dark green swirl with little chips.',
    status: 'open',
    response: null,
    gift: null,
    createdAt: now - 3 * HOUR,
    resolvedAt: null,
    claimed: false,
  },
  {
    id: 38,
    kind: 'bug',
    text: 'Captured marble kept its old highlight ring after going back to base.',
    status: 'resolved',
    response: 'Good eye! The ring flag was never cleared on capture — fixed for the next build. Have a chest on me.',
    gift: { type: 'box', box: 'box.basic' },
    createdAt: now - 2 * DAY,
    resolvedAt: now - 1 * DAY,
    claimed: true,
  },
];

const REPLIES = [
  {
    id: 44,
    kind: 'bug',
    text: 'My turn timer froze after I tabbed back into the game.',
    status: 'resolved',
    response: 'Fixed! The clock now resyncs on reconnect instead of trusting the stale deadline.',
    gift: { type: 'coins', amount: 500 },
    createdAt: now - 4 * DAY,
    resolvedAt: now - 5 * HOUR,
    claimed: false,
  },
  {
    id: 43,
    kind: 'idea',
    text: 'Feature idea: a constellation nameplate for the winter event?',
    status: 'resolved',
    response: 'Loved it — shipped it early just for you. Enjoy!',
    gift: { type: 'item', item: 'plate.galaxy' },
    createdAt: now - 6 * DAY,
    resolvedAt: now - 2 * HOUR,
    claimed: false,
  },
];

const FEED_ENTRIES = [
  { t: now - 26000, seat: 2, chat: true, name: 'Ana', text: 'that was CRUEL' },
  { t: now - 24000, seat: 0, text: 'Zé Miguel captured Ana’s marble' },
  { t: now - 18000, seat: 1, chat: true, team: true, name: 'Rui', text: 'go for the shortcut, trust me' },
  { t: now - 12000, seat: 3, text: 'Inês rolled a 6!' },
  { t: now - 8000, seat: 3, text: 'Inês took the shortcut' },
  { t: now - 4000, seat: 1, chat: true, name: 'Rui', text: 'gg, well played' },
];

const noop = () => {};
const back = () => {
  window.location.hash = 'preview';
};

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function FeedDemo() {
  const [open, setOpen] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const entries = showLogs ? FEED_ENTRIES : FEED_ENTRIES.filter((e) => e.chat);
  return (
    <div className="preview-stage-plain" style={{ maxWidth: 380 }}>
      <Feed entries={entries} open={open} onToggle={() => setOpen((o) => !o)} showLogs={showLogs} onToggleLogs={() => setShowLogs((s) => !s)} unread={2} isMine={() => false} teams={false} onSend={noop} />
      <p className="preview-note">Chat messages always show; rolls/moves/captures only appear once "Show logs" is on. The setting sticks in Settings.</p>
    </div>
  );
}

function ReactionsDemo() {
  const [away, setAway] = useState(false);
  const [spectators, setSpectators] = useState(true);
  return (
    <div className="preview-stage-plain">
      <div className="hud" style={{ position: 'relative', height: 300 }}>
        <div className="hud-bottom" style={{ position: 'absolute', inset: 'auto 0 0 0', display: 'flex', justifyContent: 'flex-end' }}>
          <div className="hud-right">
            {spectators && (
              <span className="icon-btn spectators-btn" title="Spectators (demo)" style={{ display: 'grid', placeItems: 'center' }}>
                <Eye />
                <span className="spectators-count">3</span>
              </span>
            )}
            <button
              className={`icon-btn away-btn${away ? ' on' : ''}`}
              onClick={() => setAway((a) => !a)}
              title="Step away (demo)"
              style={{ width: 52, height: 52, borderRadius: 18 }}
            >
              <Coffee />
            </button>
            <ReactionBar onReact={noop} />
          </div>
        </div>
      </div>
      <p className="preview-note">
        Open the reactions — the sticker panel now floats above instead of shoving "Step away" and the spectator eye sideways.{' '}
        <button className="btn tiny ghost" onClick={() => setSpectators((s) => !s)}>
          Toggle spectator button
        </button>
      </p>
    </div>
  );
}

function DiceDemo() {
  return (
    <div className="preview-stage-plain" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
      {['dice.jade', 'dice.ivory', 'dice.obsidian'].map((id) => (
        <div key={id} style={{ width: 180 }}>
          <Suspense fallback={<div className="muted center">Loading…</div>}>
            <PreviewStage itemId={id} />
          </Suspense>
        </div>
      ))}
      <p className="preview-note" style={{ width: '100%' }}>
        Jade got a deeper body and dark green pips — compare with Ivory and Obsidian.
      </p>
    </div>
  );
}

function StatsDemo() {
  return (
    <div className="preview-stage-plain" style={{ maxWidth: 560 }}>
      <StatGrid stats={ME.stats} />
      <h3 className="profile-section">Match history</h3>
      <MatchHistory matches={MATCHES} meId={ME.id} />
    </div>
  );
}

const PAGES = {
  '': null,
  profile: () => <Profile account={ME} history={MATCHES} onClose={back} onLocker={noop} onReport={noop} />,
  card: () => <PlayerCard userId={FRIENDS[0].id} data={{ player: { ...FRIENDS[0], createdAt: FRIENDS[0].createdAt }, matches: MATCHES.map((m) => ({ ...m, won: m.seats.find((s) => s.name === 'Ana')?.won ?? false })) }} onClose={back} />,
  boards: () => <Leaderboard meId={ME.id} boards={BOARDS} onClose={back} onPlayer={(u) => { window.location.hash = 'preview/card'; }} />,
  report: () => <ReportModal reports={MY_REPORTS} onClose={back} notify={noop} />,
  replies: () => <RepliesModal replies={REPLIES} onClose={back} onClaim={noop} />,
  feed: FeedDemo,
  reactions: ReactionsDemo,
  dice: DiceDemo,
  stats: StatsDemo,
};

const INDEX = [
  ['profile', 'Your profile', 'Expanded stats, match history and the centered nameplate'],
  ['card', 'Another player’s card', 'What you see when you right-click a nameplate or an end-screen row'],
  ['boards', 'Leaderboards', 'Six ranked tabs — click a row to peek at that player'],
  ['report', 'Report a bug / suggest a feature', 'The player-facing form plus your own report statuses'],
  ['replies', 'Dev replies (mail)', 'Resolution notes with claimable thank-you gifts'],
  ['feed', 'Chat & log feed', 'Logs hidden by default behind "Show logs"'],
  ['reactions', 'Reactions overlay', 'The sticker panel floats instead of pushing buttons'],
  ['dice', 'Jade die', 'The darkened jade skin with readable pips'],
  ['stats', 'Stats & history blocks', 'The shared pieces used on profiles and cards'],
];

export default function Previews() {
  const page = (window.location.hash.replace(/^#preview\/?/, '') || '').split('?')[0];
  const Page = PAGES[page];
  if (!Page) {
    return (
      <div className="preview-shell">
        <h1>Preview gallery</h1>
        <p className="muted">Dummy data, no server needed. Pick a page:</p>
        <div className="preview-grid">
          {INDEX.map(([key, title, blurb]) => (
            <a key={key} href={`#preview/${key}`}>
              {title}
              <span>{blurb}</span>
            </a>
          ))}
        </div>
        <p className="preview-note">
          These routes also work on the live build: append <code>#preview</code> to the URL.
        </p>
      </div>
    );
  }
  return (
    <div className="preview-shell">
      <p className="muted" style={{ marginBottom: 14 }}>
        <a href="#preview" style={{ color: 'inherit' }}>← all previews</a>
      </p>
      <Page />
    </div>
  );
}
