import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import Shop from './components/Shop';
import Lobby from './components/Lobby';
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

test('locker lists ordinary rarities before Luckiest, Supporter, Beta and Dev', () => {
  const tiers = ['default', 'common', 'rare', 'epic', 'legendary', 'lucky', 'supporter', 'beta', 'dev'];
  for (const slot of ['marble', 'board', 'dice', 'nameplate']) {
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
  expect(screen.getByRole('img', { name: /Tideglass marble and Beacon die/i })).toHaveAttribute('width', '680');
  expect(document.querySelector('.item-grid.featured').compareDocumentPosition(document.querySelector('.supporter-shop')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  rerender(<Shop account={{ ...account, tags: ['supporter'] }} onClose={() => {}} onProfile={() => {}} onEquip={() => {}} notify={() => {}} />);
  expect(canUse({ ...account, tags: ['supporter'] }, 'marble.supporter')).toBe(true);
  expect(screen.getByText(/your Supporter set is waiting/i)).toBeInTheDocument();
});

test('Discord lobby keeps seats and controls in a fitted two-column panel', () => {
  const room = { activity: true, code: 'DEMO', hostId: 'p1', seats: [{ id: 'p1', name: 'Host', connected: true }, { id: 'p2', name: 'Guest', connected: true }, null, null], spectators: [], swapOffers: [], teams: false, variant: 'classic', turnSeconds: 30 };
  const { container } = render(<Lobby room={room} playerId="p1" onAction={() => {}} onLeave={null} />);
  const panel = container.querySelector('.activity-lobby');
  expect(container.querySelector('.activity-lobby-screen')).toBeInTheDocument();
  expect(panel.querySelector('.lobby-table .seats')).toBeInTheDocument();
  expect(panel.querySelector('.lobby-controls')).toContainElement(screen.getByRole('button', { name: 'Start game' }));
  expect(panel.querySelector('.lobby-controls')).toContainElement(screen.getByRole('slider', { name: 'Turn timer' }));
});

test('signs in as a guest and renders the home screen with the account bar', async () => {
  render(<App />);
  expect(await screen.findByRole('button', { name: /quick play/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/room code/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /shop/i })).toBeInTheDocument();
  expect(screen.getByText('Tester')).toBeInTheDocument();
  expect(document.querySelector('.account-actions .report-btn')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Report & ideas' }));
  expect(screen.getByRole('dialog', { name: /report/i })).toBeInTheDocument();
  expect(await screen.findByText('Example report')).toBeInTheDocument();
});
