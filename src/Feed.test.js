import React from 'react';
import { render } from '@testing-library/react';
import { Feed } from './components/Game';

const noop = () => {};

function renderFeed(entries, extra = {}) {
  return render(
    <Feed entries={entries} open showLogs onSend={noop} isMine={() => false} onToggle={noop} onToggleLogs={noop} {...extra} />
  );
}

test('chat entries separate the name from the message with a real space', () => {
  const { container } = renderFeed([
    { t: 1, seat: 0, chat: true, name: 'Ana', text: 'hello everyone' },
    { t: 2, seat: 1, chat: true, team: true, name: 'Rui', text: 'team only' },
    { t: 3, seat: 2, chat: true, name: 'Zé', spectator: true, text: 'watching you' },
  ]);
  const [all, team, watching] = container.querySelectorAll('.feed-entry');
  expect(all.textContent).toBe('Ana hello everyone');
  expect(team.textContent).toBe('TeamRui team only');
  expect(team.querySelector('.chat-team-tag').textContent).toBe('Team');
  expect(watching.textContent).toBe('👻 Zé watching you');
});

test('the logs toggle reflects and reports its state', () => {
  let calls = 0;
  const { container, rerender } = render(
    <Feed entries={[]} open showLogs={false} onSend={noop} isMine={() => false} onToggle={noop} onToggleLogs={() => calls++} />
  );
  const logsBtn = container.querySelector('.feed-logs');
  expect(logsBtn.textContent).toBe('Show logs');
  expect(logsBtn.getAttribute('aria-pressed')).toBe('false');
  logsBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(calls).toBe(1);
});
