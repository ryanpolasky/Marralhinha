import { render } from '@testing-library/react';
import FrameCap from './FrameCap';

const mockAdvance = jest.fn();
jest.mock('@react-three/fiber', () => ({ useThree: (select) => select({ advance: mockAdvance, size: { width: 800, height: 600 } }) }));

// Drives rAF at 120Hz for a second and counts how many frames got through the cap
const framesAt = (fps) => {
  mockAdvance.mockClear();
  const queue = [];
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => queue.push(cb));
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const nowSpy = jest.spyOn(performance, 'now');
  let now = 0;
  nowSpy.mockImplementation(() => now);
  const { unmount } = render(<FrameCap fps={fps} />);
  for (let i = 0; i < 120; i++) {
    now += 1000 / 120;
    const cb = queue.shift();
    cb(now);
  }
  unmount();
  jest.restoreAllMocks();
  return mockAdvance.mock.calls.length;
};

test('caps a 120Hz screen at 60 by default and 30 on phones', () => {
  expect(framesAt(60)).toBeGreaterThanOrEqual(58);
  expect(framesAt(60)).toBeLessThanOrEqual(61);
  expect(framesAt(30)).toBeGreaterThanOrEqual(28);
  expect(framesAt(30)).toBeLessThanOrEqual(31);
});
