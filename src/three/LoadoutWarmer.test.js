import { loadoutKeys } from './LoadoutWarmer';

test('loadout keys cover seated boards and dice once each', () => {
  const cosmetics = [
    { marble: 'marble.galaxy', board: 'board.oak', dice: 'dice.arcade', fx: 'fx.bolt' },
    null,
    { board: 'board.oak', dice: 'dice.halloween' },
    { board: 'board.supporter' },
  ];
  expect(loadoutKeys(cosmetics)).toEqual(['board:board.oak', 'dice:dice.arcade', 'dice:dice.halloween', 'board:board.supporter']);
  expect(loadoutKeys([])).toEqual([]);
});
