import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsButton } from './Settings';

jest.mock('../net/config', () => ({ ...jest.requireActual('../net/config'), IS_ACTIVITY: true }));

test('Discord Activity players still get the server invite in Settings', () => {
  render(<SettingsButton />);
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(screen.getByRole('link', { name: /Join the Marralhinha server/ })).toHaveAttribute('href', 'https://discord.gg/T4Efqprrd8');
});
