import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Feed from './Feed';

test('compact feed can be opened to start a conversation even when empty', () => {
  const onToggle = jest.fn();
  const props = { entries: [], onToggle, onSend: jest.fn(), isMine: () => false };
  const { rerender } = render(<Feed {...props} open={false} />);
  expect(screen.getByRole('button', { name: 'View all' })).toHaveAttribute('aria-disabled', 'true');
  rerender(<Feed {...props} open={false} compact />);
  const toggle = screen.getByRole('button', { name: 'View all' });
  expect(toggle).toHaveAttribute('aria-disabled', 'false');
  fireEvent.click(toggle);
  expect(onToggle).toHaveBeenCalledTimes(1);
  rerender(<Feed {...props} open compact />);
  expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('textbox', { name: 'Chat message' })).toBeInTheDocument();
});
