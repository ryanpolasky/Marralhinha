import React, { useEffect, useState } from 'react';
import { api } from '../net/api';
import { ITEMS, SLOT_KEYS, SLOTS } from '../game/catalog';
import { ItemThumb, Nameplate, TagBadges } from './Economy';
import { StatGrid, MatchHistory } from './Stats';
import { Close } from './Icons';

// The "peek at another player" card: their look, lifetime stats and recent games.
// `hint` can carry what we already know from the room (name, cosmetics, level) so it opens instantly.
export default function PlayerCard({ userId, hint, data, onClose }) {
  const [info, setInfo] = useState(data || null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (data || !userId) return undefined;
    let cancelled = false;
    api(`/players/${encodeURIComponent(userId)}`)
      .then((res) => !cancelled && setInfo(res))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [userId, data]);

  const player = info?.player || hint;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal player-card" role="dialog" aria-modal="true" aria-label={player ? `${player.name}'s profile` : 'Player profile'} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{player?.name || 'Player'}</h2>
          <button className="icon-close" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </div>

        {error && <p className="muted center">{error}</p>}
        {player && (
          <>
            <Nameplate plate={player.equipped?.nameplate} className="account-plate profile-plate">
              <span className="level-badge">{player.level}</span>
              <span className="account-info">
                <span className="account-name-row">
                  <span className="account-name">{player.name}</span>
                  <TagBadges tags={player.tags} small />
                </span>
              </span>
            </Nameplate>
            {player.createdAt && <p className="profile-xp muted">Level {player.level} · playing since {new Date(player.createdAt).toLocaleDateString()}</p>}

            {player.stats && <StatGrid stats={player.stats} />}

            {player.equipped && (
              <div className="profile-loadout peek">
                {SLOT_KEYS.map((slot) => {
                  const item = ITEMS[player.equipped[slot]];
                  return item ? (
                    <div key={slot} className="profile-slot" title={SLOTS[slot].label}>
                      <span className="profile-slot-thumb">
                        <ItemThumb itemId={item.id} />
                      </span>
                    </div>
                  ) : null;
                })}
              </div>
            )}
          </>
        )}

        <h3 className="profile-section">Recent games</h3>
        {info ? <MatchHistory matches={info.matches} meId={userId} /> : !error && <div className="muted small-text center match-empty">Loading…</div>}
      </div>
    </div>
  );
}
