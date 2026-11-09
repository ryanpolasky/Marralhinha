/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import React from 'react';
import { render } from '@testing-library/react';
import { StartWheel } from './Game';

const palette = [{ main: '#ff0000' }, { main: '#00ff00', rainbow: true }];
const props = { contenders: [0, 1], palette, target: 1700, spun: true, landed: false, elapsedAtMount: 0 };

test('the wheel paints static slices and cycles only the rainbow layer with CSS', () => {
  jest.useFakeTimers();
  const { container, rerender, unmount } = render(<StartWheel {...props} />);
  const wheel = container.querySelector('.start-wheel');
  const rainbow = container.querySelector('.start-wheel-rainbow');
  expect(wheel.style.transform).toBe('rotate(1700deg)');
  expect(wheel.style.transition).toContain('transform');
  expect(rainbow.style.maskImage).toContain('180deg 360deg');
  expect(jest.getTimerCount()).toBe(0);
  rerender(<StartWheel {...props} landed />);
  expect(wheel.style.transition).toBe('none');
  expect(container.querySelector('.start-wheel-rainbow')).toBe(rainbow);
  unmount();
  jest.useRealTimers();
});

test('a plain wheel has no animated slice layers', () => {
  const { container } = render(<StartWheel {...props} palette={[palette[0], { main: '#0000ff' }]} spun={false} />);
  expect(container.querySelector('.start-wheel').style.transform).toBe('rotate(0deg)');
  expect(container.querySelector('.start-wheel-rainbow')).toBeNull();
});

test('missing seat colors fall back without adding rainbow layers', () => {
  const { container } = render(<StartWheel {...props} palette={[]} />);
  expect(container.querySelector('.start-wheel-rainbow')).toBeNull();
});
