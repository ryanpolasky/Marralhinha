import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { StuntOverlay } from './Stunt';
import { UFO, UFO_SCRIPT, stuntClock } from '../game/stunts';
import { sfx } from '../game/sound';

jest.mock('../game/sound');
jest.mock('../game/music');
jest.mock('../game/stunts', () => ({
  ...jest.requireActual('../game/stunts'),
  stuntClock: jest.fn(),
}));

const advance = (seconds) => act(() => jest.advanceTimersByTime(seconds * 1000));
const stunt = (id, age = 0) => ({ id, kind: 'ufo', seat: 0, marble: 0, age });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  stuntClock.mockImplementation((s) => s.age / 1000);
});

afterEach(() => {
  jest.useRealTimers();
});

test('every alien line appears in the letterboxed overlay with its speaker, then clears', () => {
  render(<StuntOverlay stunts={[stunt('dialogue')]} />);
  let t = 0;
  UFO_SCRIPT.forEach((line) => {
    advance(line.at - t + 0.001);
    const bubble = screen.getByText(line.text).closest('.ufo-dialogue');
    expect(document.querySelectorAll('.ufo-dialogue')).toHaveLength(1);
    expect(bubble.closest('.stunt-overlay.cine')).not.toBeNull();
    expect(bubble.textContent).toContain(line.who === 0 ? 'Zorp' : 'Klarg');
    expect(bubble.classList.contains(`speaker-${line.who}`)).toBe(true);
    advance(line.until - line.at);
    expect(screen.queryByText(line.text)).toBeNull();
    t = line.until + 0.001;
  });
  advance(UFO.end - t + 0.01);
  expect(document.querySelector('.ufo-dialogue')).toBeNull();
  expect(document.body.classList.contains('stunt-ufo')).toBe(false);
});

test('joining mid-line restores the dialogue without replaying its voice', () => {
  const line = UFO_SCRIPT[0];
  render(<StuntOverlay stunts={[stunt('late-dialogue', (line.at + 0.5) * 1000)]} />);
  expect(screen.getByText(line.text)).not.toBeNull();
  expect(sfx.alienVoice).not.toHaveBeenCalled();
  advance(line.until - line.at - 0.5 + 0.01);
  expect(screen.queryByText(line.text)).toBeNull();
});

test('cutting in the ship removes dialogue and cancels upcoming lines', () => {
  const s = stunt('cut-dialogue', (UFO.specimen + 0.5) * 1000);
  const { rerender } = render(<StuntOverlay stunts={[s]} />);
  expect(screen.getByText(UFO_SCRIPT[0].text)).not.toBeNull();
  rerender(<StuntOverlay stunts={[{ ...s, cut: true }]} />);
  expect(document.querySelector('.ufo-dialogue')).toBeNull();
  expect(document.body.classList.contains('stunt-ufo')).toBe(false);
  advance(UFO.end);
  expect(document.querySelector('.ufo-dialogue')).toBeNull();
  expect(sfx.alienVoice).not.toHaveBeenCalled();
});

test('StrictMode and unmount leave no dialogue timers or grading behind', () => {
  const { unmount } = render(
    <React.StrictMode>
      <StuntOverlay stunts={[stunt('strict-dialogue', (UFO.specimen + 0.5) * 1000)]} />
    </React.StrictMode>
  );
  expect(screen.getAllByText(UFO_SCRIPT[0].text)).toHaveLength(1);
  unmount();
  expect(jest.getTimerCount()).toBe(0);
  expect(document.body.className).not.toMatch(/stunt-ufo|ufo-lab|ufo-night|ufo-sitcom/);
});

test('replacing a bit clears the old effects before starting the new scene', () => {
  const { rerender } = render(<StuntOverlay stunts={[stunt('old-bit', (UFO.specimen + 0.5) * 1000)]} />);
  rerender(<StuntOverlay stunts={[stunt('new-bit', (UFO.thinking + 0.1) * 1000)]} />);
  expect(document.body.classList.contains('stunt-ufo')).toBe(true);
  expect(document.body.classList.contains('ufo-sitcom')).toBe(true);
  expect(document.body.classList.contains('ufo-lab')).toBe(false);
  expect(screen.getByText("...It's thinking.")).not.toBeNull();
  expect(screen.queryByText(UFO_SCRIPT[0].text)).toBeNull();
});

test.each([
  ['location', 0.5, UFO.lift, ['TERCEIRA, A\u00c7ORES', '23:47']],
  ['return', UFO.stamp, UFO.end - 0.1, ['SUBJECT RETURNED.', 'MEMORY: WIPED.']],
])('%s stamp finishes both lines and holds the full text before clearing', (_, from, until, lines) => {
  render(<StuntOverlay stunts={[stunt(`stamp-${from}`, from * 1000)]} />);
  const finish = Math.max(...lines.map((text) => {
    const el = screen.getByText(text);
    return parseFloat(el.style.getPropertyValue('--delay')) + parseFloat(el.style.getPropertyValue('--duration'));
  }));
  expect(until - from - finish).toBeGreaterThanOrEqual(1.25);
  advance(finish + 1);
  lines.forEach((text) => expect(screen.getByText(text)).not.toBeNull());
  advance(until - from - finish - 1 + 0.01);
  lines.forEach((text) => expect(screen.queryByText(text)).toBeNull());
});

test('a late arrival resumes the stamp reveal instead of restarting it', () => {
  render(<StuntOverlay stunts={[stunt('late-stamp', (UFO.stamp + 2.5) * 1000)]} />);
  ['SUBJECT RETURNED.', 'MEMORY: WIPED.'].forEach((text) => {
    const el = screen.getByText(text);
    const delay = parseFloat(el.style.getPropertyValue('--delay'));
    const duration = parseFloat(el.style.getPropertyValue('--duration'));
    expect(delay + duration).toBeLessThan(0);
  });
});

test.each([
  ['enter', UFO.kitchen, 'ufo-sitcom'],
  ['return', UFO.lab2, 'ufo-lab'],
])('the %s dream ripple spans the camera cut and cleans up afterward', (_, cut, grade) => {
  render(<StuntOverlay stunts={[stunt(`dream-${cut}`, (cut - 0.8) * 1000)]} />);
  expect(document.querySelector('.stunt-overlay .ufo-dream')).toBeNull();
  expect(document.body.classList.contains('ufo-dream')).toBe(true);
  advance(0.9);
  expect(document.body.classList.contains(grade)).toBe(true);
  expect(document.body.classList.contains('ufo-dream')).toBe(true);
  advance(0.91);
  expect(document.querySelector('.stunt-overlay .ufo-dream')).toBeNull();
  expect(document.querySelector('#ufo-dream-filter')).toBeNull();
  expect(document.body.classList.contains('ufo-dream')).toBe(false);
});

test('cutting a dream transition removes its grading immediately', () => {
  const s = stunt('cut-dream', (UFO.kitchen - 0.5) * 1000);
  const { rerender, unmount } = render(<StuntOverlay stunts={[s]} />);
  expect(document.body.classList.contains('ufo-dream')).toBe(true);
  rerender(<StuntOverlay stunts={[{ ...s, cut: true }]} />);
  expect(document.querySelector('#ufo-dream-filter')).toBeNull();
  expect(document.body.classList.contains('ufo-dream')).toBe(false);
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

test('the harmless poke has no scare sound or shock reaction cue', () => {
  render(<StuntOverlay stunts={[stunt('harmless-poke', (UFO.poke1 - 0.1) * 1000)]} />);
  advance(UFO.nothing - UFO.poke1 + 0.2);
  expect(sfx.boing.mock.calls).toEqual([[0], [1], [2]]);
  expect(sfx.gasp).not.toHaveBeenCalled();
  expect(sfx.squeak).not.toHaveBeenCalled();
});
