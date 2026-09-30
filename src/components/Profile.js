import React, { useEffect, useState } from 'react';
import { api } from '../net/api';
import { ITEMS, SLOTS, SLOT_KEYS, canUse, collectible } from '../game/catalog';
import { ItemThumb, Nameplate, TagBadges } from './Economy';
import { StatGrid, MatchHistory, LuckiestPanel } from './Stats';
import { Close } from './Icons';

export default function Profile({ account, onClose, onLocker, onReport, history }) {
  const [matches, setMatches] = useState(history || null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Match history piggybacks on the public player endpoint, same one other players see
  useEffect(() => {
    if (history) return undefined;
    let cancelled = false;
    api(`/players/${encodeURIComponent(account.id)}`)
      .then((res) => !cancelled && setMatches(res.matches))
      .catch(() => !cancelled && setMatches([]));
    return () => {
      cancelled = true;
    };
  }, [account.id, history]);

  const { stats } = account;
  const pool = collectible(account);
  const collected = pool.filter((item) => canUse(account, item.id)).length;

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

        <StatGrid stats={stats} />

        <LuckiestPanel lucky={account.lucky} />

        <h3 className="profile-section">Match history</h3>
        <MatchHistory matches={matches} meId={account.id} />

        <h3 className="profile-section">Loadout</h3>
        <div className="profile-loadout">
          {SLOT_KEYS.map((slot) => {
            const item = ITEMS[account.equipped[slot]];
            return (
              <div key={slot} className="profile-slot">
                <span className="profile-slot-thumb">
                  <ItemThumb itemId={item.id} />
                </span>
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
          {onReport && (
            <button className="btn link" onClick={onReport}>
              Found a bug?
            </button>
          )}
          <button className="btn secondary" onClick={onLocker}>
            Open locker
          </button>
        </div>
      </div>
    </div>
  );
}
