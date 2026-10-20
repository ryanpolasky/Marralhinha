import React, { useState } from 'react';
import { post } from '../net/api';
import { ITEMS } from '../game/catalog';
import { Coins, ItemCard, PreviewStage, TagBadge } from './Economy';

export const LUCKY_FULL_SET_COINS = 2500;

export default function LuckyClaim({ account, onClaimed, onLater, notify }) {
  const claim = account.lucky.pending[0];
  const set = account.lucky.set;
  const open = set.filter((id) => !account.lucky.setOwned.includes(id));
  const [pick, setPick] = useState(open[0] || null);
  const [busy, setBusy] = useState(false);
  const chosen = open.includes(pick) ? pick : open[0] || null;
  const shown = chosen || set[0];

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await post('/me/luckiest/claim', { month: claim.month, item: chosen });
      onClaimed(res.profile);
      notify?.(res.claim.item ? `${ITEMS[res.claim.item].name} is yours for good` : `${res.claim.coins.toLocaleString()} coins added`);
    } catch (err) {
      notify?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="panel modal lucky-claim" role="dialog" aria-modal="true" aria-label="Pick your Luckiest reward">
        <div className="lucky-claim-head">
          <TagBadge tag="lucky" />
          <h2>{claim.granted ? 'You got a Luckiest pick!' : `Luckiest of ${claim.monthName}!`}</h2>
          <p className="muted">
            {!claim.granted && `${claim.sixes} sixes in ${claim.rolls} rolls (${((claim.sixes / claim.rolls) * 100).toFixed(1)}%) was the luckiest game of the month. `}
            {chosen ? 'Pick a piece of the Luckiest set to keep forever.' : 'You already own the whole set, so this one pays out in coins.'}
          </p>
        </div>
        <div className="lucky-claim-body">
          <div className="lucky-claim-stage">
            <PreviewStage itemId={shown} playerName={account.name} />
            <h3>{ITEMS[shown].name}</h3>
            <p className="muted small-text">{ITEMS[shown].desc}</p>
          </div>
          <div className="lucky-claim-grid">
            {set.map((id) => {
              const owned = !open.includes(id);
              return (
                <ItemCard
                  key={id}
                  itemId={id}
                  owned
                  selected={id === chosen}
                  disabled={owned || busy}
                  onClick={() => setPick(id)}
                  label={owned ? `${ITEMS[id].name}, already owned` : `Pick ${ITEMS[id].name}`}
                  footer={owned ? <span className="item-price owned">Owned</span> : null}
                />
              );
            })}
          </div>
        </div>
        <div className="row center lucky-claim-actions">
          <button className="btn ghost" disabled={busy} onClick={onLater}>Later</button>
          <button className="btn primary" disabled={busy} onClick={confirm}>
            {busy ? 'Claiming…' : chosen ? `Claim ${ITEMS[chosen].name}` : <>Collect <Coins amount={LUCKY_FULL_SET_COINS} animate={false} /></>}
          </button>
        </div>
        {account.lucky.pending.length > 1 && <p className="muted small-text center">{account.lucky.pending.length - 1} more pick{account.lucky.pending.length > 2 ? 's' : ''} after this one</p>}
      </div>
    </div>
  );
}
