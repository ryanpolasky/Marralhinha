import React, { useEffect, useState } from 'react';
import { BOXES, ITEMS, RARITIES, CURRENCY } from '../game/catalog';
import { api, post } from '../net/api';
import { sfx } from '../game/sound';
import { Coins, ItemCard, PreviewStage, RarityTag, Coin } from './Economy';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SHAKE_MS = 1500;
const BURST_MS = 450;

function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, (target || 0) - now);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export function BoxArt({ box, shaking = false, glow }) {
  return (
    <div className={`box-art ${box.id.replace('.', '-')}${shaking ? ' shaking' : ''}`} style={glow ? { '--glow': glow } : undefined}>
      <div className="box-lid" />
      <div className="box-body">
        <div className="box-lock" />
      </div>
    </div>
  );
}

function BoxOpening({ opening, account, onAgain, onEquip, onDone }) {
  const { box, phase, result } = opening;
  const item = result && ITEMS[result.item];
  const rarity = result ? RARITIES[result.rarity] : null;
  const canAgain = account.coins >= box.price;
  const equipped = item && account.equipped[item.slot] === item.id;
  return (
    <div className={`opening phase-${phase}`} style={{ '--rarity': rarity?.color || '#ffd166' }}>
      {phase !== 'reveal' && (
        <div className="opening-stage">
          <BoxArt box={box} shaking glow={phase === 'burst' ? rarity?.color : undefined} />
          <div className="opening-hint">{phase === 'shaking' ? 'Opening…' : ''}</div>
        </div>
      )}
      {phase === 'burst' && <div className="opening-flash" />}
      {phase === 'reveal' && item && <div className="reveal-rays" />}
      {phase === 'reveal' && item && (
        <div className={`reveal-card rarity-${result.rarity}`}>
          <RarityTag rarity={result.rarity} />
          <PreviewStage itemId={item.id} playerName={account.name} />
          <h2 className="reveal-name">{item.name}</h2>
          <p className="reveal-desc">{item.desc}</p>
          {result.duplicate ? (
            <div className="reveal-dupe">
              Duplicate! Converted to <Coins amount={result.refund} animate={false} />
            </div>
          ) : (
            <div className="reveal-new">NEW!</div>
          )}
          <div className="row center">
            {!result.duplicate && !equipped && (
              <button className="btn secondary" onClick={() => onEquip(item)}>
                Equip
              </button>
            )}
            <button className="btn primary" disabled={!canAgain} onClick={onAgain}>
              Open another <Coin size={16} /> {box.price}
            </button>
            <button className="btn ghost" onClick={onDone}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Shop({ account, onClose, onProfile, onEquip, notify }) {
  const [shop, setShop] = useState(null);
  const [opening, setOpening] = useState(null);
  const [showRates, setShowRates] = useState(null);
  const [buying, setBuying] = useState(null);
  const refreshIn = useCountdown(shop?.refreshAt);

  useEffect(() => {
    api('/shop')
      .then(setShop)
      .catch((err) => notify(err.message));
  }, [notify]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !opening && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, opening]);

  const openBox = async (box) => {
    if (account.coins < box.price) return notify(`You need ${box.price - account.coins} more ${CURRENCY}`);
    setOpening({ box, phase: 'shaking' });
    sfx.boxShake();
    try {
      const [res] = await Promise.all([post('/shop/open', { box: box.id }), wait(SHAKE_MS)]);
      setOpening({ box, phase: 'burst', result: res.result });
      sfx.reveal(res.result.rarity);
      await wait(BURST_MS);
      setOpening({ box, phase: 'reveal', result: res.result });
      onProfile(res.profile);
      if (res.result.duplicate) setTimeout(sfx.coins, 400);
    } catch (err) {
      setOpening(null);
      notify(err.message);
    }
    return undefined;
  };

  const buy = async (offer) => {
    setBuying(offer.id);
    try {
      const res = await post('/shop/buy', { item: offer.id });
      onProfile(res.profile);
      sfx.reveal(ITEMS[offer.id].rarity);
      notify(`${ITEMS[offer.id].name} is yours!`, 'good');
    } catch (err) {
      notify(err.message);
    } finally {
      setBuying(null);
    }
  };

  return (
    <div className="modal-backdrop shop-backdrop" onClick={opening ? undefined : onClose}>
      <div className="panel modal shop-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Shop">
        <div className="modal-head">
          <h2>Shop</h2>
          <Coins amount={account.coins} className="coins-pill" />
          <button className="icon-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="boxes">
          {BOXES.map((box) => {
            const pity = account.pity?.[box.id] || { epic: 0, legendary: 0 };
            const epicIn = box.pity.epic - pity.epic;
            const legendaryIn = box.pity.legendary - pity.legendary;
            return (
              <div key={box.id} className={`box-card ${box.id.replace('.', '-')}`}>
                <BoxArt box={box} />
                <h3>{box.name}</h3>
                <p className="muted">{box.blurb}</p>
                <div className="pity">
                  <span>
                    Epic+ guaranteed in <b>{epicIn}</b>
                  </span>
                  <span>
                    Legendary in <b>{legendaryIn}</b>
                  </span>
                </div>
                <button className="btn primary big block" disabled={account.coins < box.price || !!opening} onClick={() => openBox(box)}>
                  Open <Coin /> {box.price}
                </button>
                <button className="btn link" onClick={() => setShowRates(showRates === box.id ? null : box.id)}>
                  {showRates === box.id ? 'Hide drop rates' : 'Drop rates'}
                </button>
                {showRates === box.id && (
                  <ul className="rates">
                    {Object.entries(box.weights)
                      .filter(([, w]) => w > 0)
                      .map(([rarity, w]) => (
                        <li key={rarity}>
                          <RarityTag rarity={rarity} /> <span>{w}%</span>
                        </li>
                      ))}
                    <li className="muted small-text">Duplicates convert to {CURRENCY}.</li>
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        <div className="featured-head">
          <h3>Today's featured</h3>
          <span className="muted">New items in {refreshIn}</span>
        </div>
        <div className="item-grid featured">
          {(shop?.featured || []).map((offer) => {
            const owned = account.inventory.includes(offer.id);
            return (
              <ItemCard
                key={offer.id}
                itemId={offer.id}
                owned
                footer={
                  owned ? (
                    <span className="item-price owned">Owned</span>
                  ) : (
                    <span
                      className={`item-price${account.coins < offer.price ? ' short' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!buying) buy(offer);
                      }}
                    >
                      <Coin size={15} /> {offer.price.toLocaleString()}
                    </span>
                  )
                }
                onClick={() => !owned && !buying && buy(offer)}
              />
            );
          })}
        </div>
        <p className="muted small-text center">Everything here is cosmetic and bought with {CURRENCY} you earn by playing. No real money, ever.</p>
      </div>

      {opening && (
        <BoxOpening
          opening={opening}
          account={account}
          onAgain={() => openBox(opening.box)}
          onEquip={async (item) => {
            await onEquip(item.slot, item.id);
            setOpening(null);
          }}
          onDone={() => setOpening(null)}
        />
      )}
    </div>
  );
}
