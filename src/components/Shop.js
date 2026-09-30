import React, { useEffect, useState } from 'react';
import { BOXES, ITEMS, RARITIES, CURRENCY, catalog, canUse } from '../game/catalog';
import { api, post } from '../net/api';
import { sfx } from '../game/sound';
import { Coins, ItemCard, PreviewStage, RarityTag, Coin } from './Economy';
import { Close } from './Icons';
import { purchaseDiscordSku, startDiscordLogin } from '../net/auth';

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
      <div className="box-body" />
      <div className="box-lock" />
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
  const [syncingSupporter, setSyncingSupporter] = useState(false);
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

  const refreshSupporter = async () => {
    setSyncingSupporter(true);
    try {
      const { profile } = await post('/shop/supporter/refresh');
      onProfile(profile);
      notify(profile.tags.includes('supporter') ? 'Thank you for supporting Marralhinha! Your set is ready in the locker.' : 'No Supporter purchase found yet. If you just bought it, wait a moment and try again.', 'good');
    } catch (err) {
      notify(err.message);
    } finally {
      setSyncingSupporter(false);
    }
  };

  const purchaseSupporter = async () => {
    if (!account.discordLinked) return startDiscordLogin().catch((err) => notify(err.message));
    if (!shop?.supporter) return undefined;
    try {
      const purchasedInActivity = await purchaseDiscordSku(shop.supporter.clientId, shop.supporter.skuId);
      if (purchasedInActivity) await refreshSupporter();
    } catch (err) {
      notify(err.message);
    }
    return undefined;
  };

  return (
    <div className="modal-backdrop shop-backdrop" onClick={opening ? undefined : onClose}>
      <div className="panel modal shop-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Shop">
        <div className="modal-head">
          <h2>Shop</h2>
          <Coins amount={account.coins} className="coins-pill" />
          <button className="icon-close" onClick={onClose} aria-label="Close">
            <Close />
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
          {!shop &&
            Array.from({ length: catalog.featured.count }, (_, i) => (
              <div key={i} className="item-card skeleton" aria-hidden="true">
                <span className="thumb" />
                <span className="item-name">&nbsp;</span>
                <span className="item-rarity">&nbsp;</span>
                <span className="item-price">&nbsp;</span>
              </div>
            ))}
          {(shop?.featured || []).map((offer) => {
            const owned = canUse(account, offer.id);
            return (
              <ItemCard
                key={offer.id}
                itemId={offer.id}
                owned
                footer={
                  owned ? (
                    <span className="item-price owned">Owned</span>
                  ) : (
                    <span className={`item-price${account.coins < offer.price ? ' short' : ''}`}>
                      <Coin size={15} /> {buying === offer.id ? '…' : offer.price.toLocaleString()}
                    </span>
                  )
                }
                label={owned ? `${ITEMS[offer.id].name}, owned` : `Buy ${ITEMS[offer.id].name} for ${offer.price.toLocaleString()} ${CURRENCY}`}
                disabled={owned || !!buying}
                onClick={() => !owned && !buying && buy(offer)}
              />
            );
          })}
        </div>
        <p className="muted small-text center">Featured items and chests use {CURRENCY} earned by playing. No pay-to-win.</p>

        <section className="supporter-shop" aria-label="Support the game">
          <picture>
            <source media="(prefers-reduced-motion: reduce)" srcSet="/supporter-pack-still.png" />
            <img className="supporter-art" src="/supporter-pack.gif" alt="The Tideglass marble and Beacon die floating above a moonlit table" width="680" height="240" />
          </picture>
          <div className="supporter-shop-body">
            <div className="supporter-shop-head"><span className="supporter-eyebrow">A little light for the table</span><h3>Supporter Pack</h3><span className="supporter-price">$5.99 USD · one time</span></div>
            <p>A permanent Supporter badge and exclusive cosmetics: the Tideglass marble, Moonwake board, Beacon die, Keepsake nameplate, and more to come! Only the look changes; never the gameplay.</p>
            <p className="supporter-thanks">From the bottom of my heart: thank you for choosing to support this tiny game. Every person who sits down at this table makes it feel more alive. Your help means I get to keep building this game for more to enjoy, and it genuinely means the world to me. Love ya!</p>
            <div className="supporter-actions">
              {account.tags.includes('supporter') ? <span className="supporter-owned">Your Supporter set is waiting in the locker. Thank you.</span> : (
                <button className="btn primary" disabled={!shop?.supporter || syncingSupporter} onClick={purchaseSupporter}>
                  {!shop?.supporter ? 'Discord checkout coming soon' : account.discordLinked ? 'Support the game on Discord' : 'Link Discord to support'}
                </button>
              )}
              {shop?.supporter && account.discordLinked && !account.tags.includes('supporter') && <button className="btn secondary" disabled={syncingSupporter} onClick={refreshSupporter}>{syncingSupporter ? 'Checking…' : 'Already purchased? Check access'}</button>}
              <span className="supporter-signature">— Ryan :)</span>
            </div>
            <span className="muted small-text">Checkout and payment are handled by Discord. Access is granted only after Discord confirms the purchase.</span>
          </div>
        </section>
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
