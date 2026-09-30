import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

// CRA resets jest.fn mocks between tests, so plain functions it is
jest.mock('./net/socket', () => ({
  socket: { on: () => {}, off: () => {}, connect: () => {}, disconnect: () => {} },
  request: () => Promise.resolve({}),
}));
jest.mock('./net/api', () => ({
  api: (path) => Promise.resolve(path === '/reports' ? { reports: [{ id: 1, kind: 'bug', status: 'open', text: 'Example report', createdAt: Date.now() }] } : { discord: false }),
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
