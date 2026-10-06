import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import Shop from './components/Shop';
import Lobby from './components/Lobby';
import Game from './components/Game';
import { SettingsButton } from './components/Settings';
import { DialogHost } from './components/Dialog';
import { LuckiestPanel } from './components/Stats';
import { canUse, collectible, itemsForSlot } from './game/catalog';

// CRA resets jest.fn mocks between tests, so plain functions it is
jest.mock('./net/socket', () => ({
  socket: { on: () => {}, off: () => {}, connect: () => {}, disconnect: () => {} },
  request: () => Promise.resolve({}),
}));
jest.mock('./net/api', () => ({
  api: (path) => path === '/shop' ? new Promise(() => {}) : Promise.resolve(path === '/reports' ? { reports: [{ id: 1, kind: 'bug', status: 'open', text: 'Example report', createdAt: Date.now() }] } : { discord: false }),
  post: () => Promise.resolve({}),
  setToken: () => {},
}));
jest.mock('./net/auth', () => ({
  bootstrapAuth: () =>
    Promise.resolve({
      profile: {
        id: 'u1',
        name: 'Tester',
        coins: 300,
        level: 1,
        into: 0,
        need: 200,
        equipped: { marble: 'marble.classic', board: 'board.oak', dice: 'dice.ivory', nameplate: 'plate.basic' },
        inventory: [],
        pity: {},
        daily: { available: true, streak: 1, reward: 60 },
      },
    }),
  startDiscordLogin: () => Promise.resolve(),
  onPreviewMode: () => () => {},
}));
jest.mock('./three/Scene', () => () => null);
jest.mock('./game/music', () => ({ startMusic: () => {} }));

test('holding Luckiest alone does not unlock the Golden Die', () => {
  const account = { tags: ['lucky'], inventory: [], lucky: { goldenDieUnlocked: false } };
  expect(canUse(account, 'dice.lucky')).toBe(false);
  expect(collectible(account).some((item) => item.id === 'dice.lucky')).toBe(false);
  account.lucky.goldenDieUnlocked = true;
  expect(canUse(account, 'dice.lucky')).toBe(true);
  expect(collectible(account).some((item) => item.id === 'dice.lucky')).toBe(true);
});

test('Luckiest starts collapsed with a ten-game bar and reveals readable stats on demand', () => {
  const lucky = { games: 1, requiredGames: 10, holder: false, eligible: false, rolls: 12, sixes: 2, rate: 1 / 6, expectedRate: 1 / 6, score: null, totalSeconds: 0, longestSeconds: 0, reignCount: 0, goldenDieUnlocked: false, goldenDieRequiredSeconds: 259200, goldenDieRemainingSeconds: 259200 };
  const { container, rerender } = render(<LuckiestPanel lucky={lucky} />);
  const panel = container.querySelector('details.profile-lucky');
  expect(panel).not.toHaveAttribute('open');
  expect(screen.getByText('1 / 10 games')).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'Games toward Luckiest eligibility' })).toHaveAttribute('aria-valuenow', '1');
  expect(panel.querySelector('.profile-lucky-details')).toBeInTheDocument();
  fireEvent.click(panel.querySelector('summary'));
  expect(panel).toHaveAttribute('open');
  expect(screen.getByText('9 more games to qualify')).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'Golden Die reign time' })).toHaveAttribute('aria-valuemax', '259200');
  expect(screen.getByRole('progressbar', { name: 'Golden Die reign time' })).toHaveAttribute('aria-valuenow', '0');
  fireEvent.click(panel.querySelector('summary'));
  rerender(<LuckiestPanel lucky={{ ...lucky, games: 10, eligible: false }} />);
  expect(screen.getByText('Play a game to requalify')).toBeInTheDocument();
  rerender(<LuckiestPanel lucky={{ ...lucky, games: 10, eligible: true, score: 1.42 }} />);
  expect(screen.getByText('10 / 10 games')).toBeInTheDocument();
});

test('locker lists ordinary rarities before Luckiest, Supporter, Haunted, Beta and Dev', () => {
  const tiers = ['default', 'common', 'rare', 'epic', 'legendary', 'mythic', 'lucky', 'supporter', 'halloween', 'beta', 'dev'];
  for (const slot of ['marble', 'board', 'dice', 'nameplate', 'fx', 'trail']) {
    const order = itemsForSlot(slot).map((item) => item.tag || item.rarity);
    expect(order).toEqual([...order].sort((a, b) => tiers.indexOf(a) - tiers.indexOf(b)));
  }
});

test('Supporter pack does not unlock until the profile carries a verified tag', async () => {
  const account = { name: 'Tester', coins: 300, pity: {}, tags: [], inventory: [], discordLinked: false };
  expect(canUse(account, 'marble.supporter')).toBe(false);
  const { rerender } = render(<Shop account={account} onClose={() => {}} onProfile={() => {}} onEquip={() => {}} notify={() => {}} />);
  expect(screen.getByRole('button', { name: /Discord checkout coming soon/i })).toBeDisabled();
  expect(screen.getByText(/from the bottom of my heart/i)).toBeInTheDocument();
  expect(screen.getByText('— Ryan :)')).toHaveClass('supporter-signature');
  expect(screen.getByText('— Ryan :)').closest('.supporter-actions')).toContainElement(screen.getByRole('button', { name: /Discord checkout coming soon/i }));
  expect(screen.getByRole('img', { name: /Tideglass marble and Beacon die/i })).toHaveAttribute('width', '680');
  expect(document.querySelector('.item-grid.featured').compareDocumentPosition(document.querySelector('.supporter-shop')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  rerender(<Shop account={{ ...account, tags: ['supporter'] }} onClose={() => {}} onProfile={() => {}} onEquip={() => {}} notify={() => {}} />);
  expect(canUse({ ...account, tags: ['supporter'] }, 'marble.supporter')).toBe(true);
  expect(screen.getByText(/your Supporter set is waiting/i)).toBeInTheDocument();
});

test('shop carousel starts on the Supporter Pack and flips to the October-only Halloween Pack', () => {
  const account = { name: 'Tester', coins: 300, pity: {}, tags: [], inventory: [], discordLinked: false };
  expect(canUse(account, 'marble.halloween')).toBe(false);
  expect(canUse({ ...account, tags: ['halloween'] }, 'dice.halloween')).toBe(true);
  expect(canUse({ ...account, tags: ['supporter'] }, 'dice.halloween')).toBe(false);
  render(<Shop account={account} onClose={() => {}} onProfile={() => {}} onEquip={() => {}} notify={() => {}} />);
  const slides = document.querySelectorAll('.carousel-slide');
  expect(slides).toHaveLength(2);
  expect(slides[0]).not.toHaveAttribute('aria-hidden');
  expect(slides[1]).toHaveAttribute('aria-hidden', 'true');
  expect(screen.getByRole('button', { name: 'Previous pack' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Next pack' }));
  expect(slides[0]).toHaveAttribute('aria-hidden', 'true');
  expect(slides[1]).not.toHaveAttribute('aria-hidden');
  expect(screen.getByRole('button', { name: 'Next pack' })).toBeDisabled();
  expect(screen.getByText('Only available in October!')).toBeInTheDocument();
  expect(screen.getByText('$3.99 USD · one time')).toBeInTheDocument();
  expect(screen.getByText('Crystal Ball')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
  fireEvent.keyDown(document.querySelector('.shop-carousel'), { key: 'ArrowLeft' });
  expect(slides[0]).not.toHaveAttribute('aria-hidden');
});

test('Discord lobby keeps seats and controls in a fitted two-column panel', () => {
  const onReport = jest.fn();
  const room = { activity: true, code: 'DEMO', hostId: 'p1', seats: [{ id: 'p1', name: 'Host', connected: true }, { id: 'p2', name: 'Guest', connected: true }, null, null], spectators: [], swapOffers: [], teams: false, variant: 'classic', turnSeconds: 30 };
  const { container } = render(<Lobby room={room} playerId="p1" onAction={() => {}} onLeave={null} onReport={onReport} />);
  const panel = container.querySelector('.activity-lobby');
  expect(container.querySelector('.activity-lobby-screen')).toBeInTheDocument();
  expect(panel.querySelector('.lobby-table .seats')).toBeInTheDocument();
  expect(panel.querySelector('.lobby-controls')).toContainElement(screen.getByRole('button', { name: 'Start game' }));
  expect(panel.querySelector('.lobby-controls')).toContainElement(screen.getByRole('slider', { name: 'Turn timer' }));
  expect(screen.getByRole('button', { name: 'Report & ideas' })).toHaveClass('home-report');
  fireEvent.click(screen.getByRole('button', { name: 'Report & ideas' }));
  expect(onReport).toHaveBeenCalledTimes(1);
});

test('end-game player markers have both colors and open the other player card', () => {
  const onPlayerStats = jest.fn();
  const room = { activity: true, code: 'TEST', hostId: 'p1', spectators: [], seats: [{ id: 'p1', name: 'Ana', userId: 'a', connected: true }, { id: 'p2', name: 'Rui', userId: 'b', connected: true }, null, null], game: {
    phase: 'over', mode: 'solo', turn: 0, active: [0, 1], winners: [1], marbles: [[], [], [], []], log: [], rewards: {},
  } };
  const { container } = render(<Game room={room} playerId="p1" onAction={() => {}} onPlayerStats={onPlayerStats} onShop={() => {}} onResetView={() => {}} />);
  const row = container.querySelector('.win-player:not(.quiet)');
  expect(container.querySelector('.activity-win-card .win-social')).toContainElement(row);
  expect(container.querySelector('.activity-win-card .win-actions')).toContainElement(screen.getByRole('button', { name: 'Play again' }));
  expect(row.style.getPropertyValue('--seat')).toBe('#2f7de1');
  expect(row.style.getPropertyValue('--seat-light')).toBe('#8cc2ff');
  fireEvent.click(row);
  expect(onPlayerStats).toHaveBeenCalledWith(room.seats[1]);
});

test('in-game reporting lives in Settings', () => {
  const onReport = jest.fn();
  render(<SettingsButton onReport={onReport} />);
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Report & ideas' }));
  expect(onReport).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
});

test('Discord host can end a game after confirmation while guests cannot', async () => {
  const onAction = jest.fn();
  const onReport = jest.fn();
  const room = { activity: true, code: 'TEST', hostId: 'p1', seats: [{ id: 'p1', name: 'Ana', connected: true }, { id: 'p2', name: 'Rui', connected: true }, null, null], spectators: [], game: {
    phase: 'roll', mode: 'solo', turn: 0, active: [0, 1], marbles: [[], [], [], []], log: [],
  } };
  const { rerender } = render(<><Game room={room} playerId="p1" onAction={onAction} onReport={onReport} onResetView={() => {}} /><DialogHost /></>);
  expect(screen.queryByRole('button', { name: 'Report a bug or suggest a feature' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('button', { name: 'Report & ideas' }));
  expect(onReport).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'End game for everyone' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent('Everyone returns to the lobby');
  fireEvent.click(screen.getByRole('button', { name: 'Keep playing' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'End game for everyone' }));
  fireEvent.click(screen.getByRole('button', { name: 'End game' }));
  await waitFor(() => expect(onAction).toHaveBeenCalledWith('game:endTable'));
  expect(onAction).toHaveBeenCalledTimes(1);
  rerender(<><Game room={room} playerId="p2" onAction={onAction} onResetView={() => {}} /><DialogHost /></>);
  expect(screen.queryByRole('button', { name: 'End game for everyone' })).not.toBeInTheDocument();
});

test('hidden tab titles the game Your turn until the turn passes', () => {
  let hiddenNow = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hiddenNow });
  const room = { code: 'T', hostId: 'p2', spectators: [], seats: [{ id: 'p1', name: 'Ana', connected: true }, { id: 'p2', name: 'Rui', connected: true }, null, null], game: {
    phase: 'roll', mode: 'solo', turn: 0, active: [0, 1], marbles: [[], [], [], []], log: [],
  } };
  const { rerender } = render(<Game room={room} playerId="p1" onAction={() => {}} onResetView={() => {}} />);
  expect(document.title).toBe('Marralhinha Online');
  hiddenNow = true;
  fireEvent(document, new Event('visibilitychange'));
  expect(document.title).toBe('Your turn · Marralhinha Online');
  rerender(<Game room={{ ...room, game: { ...room.game, turn: 1 } }} playerId="p1" onAction={() => {}} onResetView={() => {}} />);
  expect(document.title).toBe('Marralhinha Online');
  delete document.hidden;
});

test('signs in as a guest and renders the home screen with the account bar', async () => {
  render(<App />);
  expect(await screen.findByRole('button', { name: /vs\. bots/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Local' })).toBeInTheDocument();
  expect(screen.getByLabelText(/room code/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /shop/i })).toBeInTheDocument();
  expect(screen.getByText('Tester')).toBeInTheDocument();
  expect(document.querySelector('.account-actions .report-btn')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Report & ideas' }));
  expect(screen.getByRole('dialog', { name: /report/i })).toBeInTheDocument();
  expect(await screen.findByText('Example report')).toBeInTheDocument();
});
