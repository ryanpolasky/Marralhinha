import React, { useEffect } from 'react';
import { ITEMS, SLOTS, SLOT_KEYS, canUse, collectible } from '../game/catalog';
import { ItemThumb, Nameplate, TagBadge, TagBadges } from './Economy';
import { Close } from './Icons';

function luckyLine({ lucky, stats }) {
  if (lucky?.holder) return "You've rolled more sixes than anyone, ever. The tag is yours until someone passes you.";
  if (!lucky?.holderSixes) return 'Roll a six in any game to claim the Luckiest tag.';
  const needed = lucky.holderSixes - (stats.sixes || 0) + 1;
  return `${needed.toLocaleString()} more six${needed === 1 ? '' : 'es'} to take the Luckiest tag.`;
}

export default function Profile({ account, onClose, onLocker }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { stats } = account;
  const pool = collectible(account);
  const collected = pool.filter((item) => canUse(account, item.id)).length;
  const winRate = stats.games ? Math.round((stats.wins / stats.games) * 100) : 0;
  const tiles = [
    ['Games', stats.games],
    ['Wins', stats.wins],
    ['Win rate', `${winRate}%`],
    ['Captures', stats.captures],
    ['Sixes', stats.sixes || 0],
    ['Chests', stats.boxes],
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal profile-modal" role="dialog" aria-modal="true" aria-label="Your profile" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Profile</h2>
          <button className="icon-close" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </div>

        <Nameplate plate={account.equipped.nameplate} className="account-plate profile-plate">
          <span className="level-badge">{account.level}</span>
          <span className="account-info">
            <span className="account-name-row">
              <span className="account-name">{account.name}</span>
              <TagBadges tags={account.tags} small />
            </span>
            <span className="xp-bar" title={`${account.into} / ${account.need} XP`}>
              <span style={{ width: `${Math.min(100, (account.into / account.need) * 100)}%` }} />
            </span>
          </span>
        </Nameplate>
        <p className="profile-xp muted">
          Level {account.level} · {account.into.toLocaleString()} / {account.need.toLocaleString()} XP to level {account.level + 1}
        </p>

        <div className="profile-stats">
          {tiles.map(([label, value]) => (
            <div key={label} className="profile-stat">
              <b>{typeof value === 'number' ? value.toLocaleString() : value}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className={`profile-lucky${account.lucky?.holder ? ' holder' : ''}`}>
          <TagBadge tag="lucky" small />
          <span>{luckyLine(account)}</span>
        </div>

        <h3 className="profile-section">Loadout</h3>
        <div className="profile-loadout">
          {SLOT_KEYS.map((slot) => {
            const item = ITEMS[account.equipped[slot]];
            return (
              <div key={slot} className="profile-slot">
                <ItemThumb itemId={item.id} />
                <span className="profile-slot-name">{item.name}</span>
                <span className="muted small-text">{SLOTS[slot].label}</span>
              </div>
            );
          })}
        </div>

        <div className="profile-footer">
          <span className="muted">
            {collected} / {pool.length} cosmetics collected
          </span>
          <button className="btn secondary" onClick={onLocker}>
            Open locker
          </button>
        </div>
      </div>
    </div>
  );
}
