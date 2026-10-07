import React, { useState } from 'react';
import { SEAT_COLORS } from '../game/geometry';

// 2v2: Tab or the pill switches Team/All, "/t msg" or "/a msg" sends one message without switching
function ChatInput({ onSend, teams = false }) {
  const [text, setText] = useState('');
  const [channel, setChannel] = useState('all');
  const active = teams ? channel : 'all';
  const toggle = () => setChannel((c) => (c === 'team' ? 'all' : 'team'));
  const submit = async (e) => {
    e.preventDefault();
    let message = text.trim();
    let target = active;
    const shortcut = teams && message.match(/^\/(t|a)\s+(.+)/i);
    if (shortcut) {
      target = shortcut[1].toLowerCase() === 't' ? 'team' : 'all';
      message = shortcut[2].trim();
    }
    if (!message) return;
    if (await onSend(message, target)) setText((current) => (current.trim() === text.trim() ? '' : current));
  };
  return (
    <form className={`chat-form${active === 'team' ? ' team' : ''}`} onSubmit={submit}>
      {teams && (
        <button type="button" className={`chat-channel ${active}`} onClick={toggle} title="Switch between team and all chat (Tab)" aria-label={`Chatting to ${active === 'team' ? 'your team' : 'everyone'}, click to switch`}>
          {active === 'team' ? 'Team' : 'All'}
        </button>
      )}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (teams && e.key === 'Tab') {
            e.preventDefault();
            toggle();
          }
        }}
        maxLength={280}
        placeholder={active === 'team' ? 'Message your team… (Tab: all)' : teams ? 'Message everyone… (Tab: team)' : 'Say something…'}
        aria-label={active === 'team' ? 'Team chat message' : 'Chat message'}
      />
      <button className="chat-send" type="submit" disabled={!text.trim()} aria-label="Send message">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12h15M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );
}

export default function Feed({ entries, open, onToggle, showLogs, onToggleLogs, unread, isMine, teams, onSend, lifted = false, docked = false }) {
  const shown = open || docked ? entries : entries.slice(0, 4);
  return (
    <div className={`feed${open || docked ? ' open' : ''}${lifted ? ' lifted' : ''}${docked ? ' docked' : ''}`}>
      <div className="feed-tools">
        {docked ? (
          <span className="sheet-label">{onToggleLogs ? 'Chat & log' : 'Chat'}</span>
        ) : (
          <button type="button" className="feed-toggle" onClick={onToggle} aria-expanded={open} aria-controls="feed-list">
            {open ? 'Hide' : onToggleLogs ? 'Chat & log' : 'Chat'}
            {unread > 0 && <span className="unread">{unread}</span>}
          </button>
        )}
        {onToggleLogs && (
          <button type="button" className={`feed-logs${showLogs ? ' on' : ''}`} onClick={onToggleLogs} aria-pressed={showLogs} title="Show moves, rolls and captures in the chat">
            {showLogs ? 'Hide logs' : 'Show logs'}
          </button>
        )}
      </div>
      <div className="feed-list" id="feed-list">
        {docked && !shown.length && <div className="feed-empty">No messages yet. Say hi!</div>}
        {shown.map((entry, i) => (
          <div
            key={`${entry.t}-${i}`}
            className={`feed-entry${entry.chat ? ' chat' : ''}${entry.team ? ' team' : ''}`}
            style={{ '--seat': entry.seat === null ? '#8aa' : SEAT_COLORS[entry.seat].main }}
          >
            {entry.chat && (
              <b className="chat-name">
                {entry.team && <span className="chat-team-tag">Team</span>}
                {entry.spectator && '👻 '}
                {isMine(entry) ? 'You' : entry.name}
                {' '}
              </b>
            )}
            {entry.text}
          </div>
        ))}
      </div>
      <ChatInput teams={teams} onSend={onSend} />
    </div>
  );
}
