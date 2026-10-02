import { onBoardSkinWarm, warmBoardSkin } from './skinWarm';

test('board skin warming reaches live subscribers only', () => {
  const one = jest.fn();
  const two = jest.fn();
  const offOne = onBoardSkinWarm(one);
  const offTwo = onBoardSkinWarm(two);

  warmBoardSkin('board.supporter');
  expect(one).toHaveBeenCalledWith('board.supporter');
  expect(two).toHaveBeenCalledWith('board.supporter');

  one.mockClear();
  offOne();
  warmBoardSkin('board.dev');
  expect(one).not.toHaveBeenCalled();
  expect(two).toHaveBeenCalledWith('board.dev');

  offTwo();
  expect(() => warmBoardSkin()).not.toThrow();
});
