import { act, fireEvent, render } from '@testing-library/react';
import Toast, { TOAST_MS } from './Toast';

jest.useFakeTimers();

const toast = { id: 't1', tone: 'bad', text: 'oops' };
const advance = (ms) => act(() => jest.advanceTimersByTime(ms));

test('auto-dismisses after TOAST_MS + outro', () => {
  const onDone = jest.fn();
  render(<Toast toast={toast} onDone={onDone} />);
  advance(TOAST_MS - 1);
  expect(onDone).not.toHaveBeenCalled();
  advance(1);
  advance(300);
  expect(onDone).toHaveBeenCalledWith('t1');
});

test('click plays outro then reports done', () => {
  const onDone = jest.fn();
  const { container } = render(<Toast toast={toast} onDone={onDone} />);
  fireEvent.click(container.firstChild);
  advance(300);
  expect(onDone).toHaveBeenCalledWith('t1');
});

test('hover pauses the countdown', () => {
  const onDone = jest.fn();
  const { container } = render(<Toast toast={toast} onDone={onDone} />);
  advance(2000);
  fireEvent.pointerEnter(container.firstChild);
  advance(60000);
  expect(onDone).not.toHaveBeenCalled();
  fireEvent.pointerLeave(container.firstChild);
  advance(TOAST_MS - 2000);
  advance(300);
  expect(onDone).toHaveBeenCalledWith('t1');
});
