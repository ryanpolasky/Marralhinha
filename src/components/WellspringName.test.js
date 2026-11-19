import React from 'react';
import { render, screen } from '@testing-library/react';
import WellspringName, { bitmapName, WELL_FONT } from './WellspringName';

test('names use the actual Wellspring glyphs, including lowercase names', () => {
  expect(WELL_FONT.A).toBe('010101111101101');
  expect(bitmapName('Ryan').text).toBe('RYAN');
  expect(decodeURIComponent(bitmapName('A').src)).toContain('M1 0h1v1h-1z');
  render(<WellspringName name="Ryan" />);
  expect(screen.getByAltText('Ryan').getAttribute('src')).toMatch(/^data:image\/svg\+xml,/);
});

test('long names truncate on whole pixels and retain their accessible full name', () => {
  const bitmap = bitmapName('AN EXTREMELY LONG WIZARD NAME', 117);
  expect(bitmap.width).toBeLessThanOrEqual(117);
  expect(bitmap.text).toBe('AN EXTR...');
  expect(bitmapName('LONG', 9).text).toBe('.');
});

test('empty names get a bitmap default and unsupported names use native text', () => {
  expect(bitmapName('').text).toBe('PLAYER');
  expect(bitmapName('魔法 🪄')).toBeNull();
  render(<WellspringName name="魔法 🪄" />);
  expect(screen.getByText('魔法 🪄')).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
});
