import React, { useEffect, useRef, useState } from 'react';
import { BOXES, ITEMS, RARITIES, CURRENCY, catalog, canUse } from '../game/catalog';
import { api, post } from '../net/api';
import { sfx } from '../game/sound';
import { Coins, ItemCard, ItemThumb, PreviewStage, RarityTag, Coin } from './Economy';
import { Chevron, Close } from './Icons';
import { purchaseDiscordSku, startDiscordLogin } from '../net/auth';
import { IS_ACTIVITY } from '../net/config';

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

const PACKS = {
  supporter: {
    thanks: 'Thank you for supporting Marralhinha! Your set is ready in the locker.',
    missing: 'No Supporter purchase found yet. If you just bought it, wait a moment and try again.',
  },
  halloween: {
    thanks: 'Welcome to the séance! Your Haunted set is ready in the locker.',
    missing: 'No Halloween Pack purchase found yet. If you just bought it, wait a moment and try again.',
  },
};

const PACK_SLOTS = ['marble', 'board', 'dice', 'plate', 'fx'];

function PackItems({ kind }) {
  return (
    <div className="pack-items">
      {PACK_SLOTS.map((slot) => {
        const item = ITEMS[`${slot}.${kind}`];
        return (
          <span key={item.id} className="pack-item">
            <ItemThumb itemId={item.id} />
            {item.name}
            <small>{catalog.slots[item.slot].label.replace(/s$/, '')}</small>
          </span>
        );
      })}
    </div>
  );
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
  const [syncing, setSyncing] = useState(null);
  const [slide, setSlide] = useState(0);
  const swipeStart = useRef(null);
  const refreshIn = useCountdown(shop?.refreshAt);
  const slides = 2;
  const go = (next) => setSlide(Math.max(0, Math.min(slides - 1, next)));

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

  const refreshPack = async (kind) => {
    setSyncing(kind);
    try {
      const { profile } = await post(`/shop/${kind}/refresh`);
      onProfile(profile);
      notify(profile.tags.includes(kind) ? PACKS[kind].thanks : PACKS[kind].missing, 'good');
    } catch (err) {
      notify(err.message);
    } finally {
      setSyncing(null);
    }
  };

  const purchasePack = async (kind) => {
    if (!account.discordLinked) return startDiscordLogin().catch((err) => notify(err.message));
    const offer = shop?.[kind];
    if (!offer?.skuId || offer.open === false) return undefined;
    try {
      const purchasedInActivity = await purchaseDiscordSku(offer.clientId, offer.skuId);
      if (purchasedInActivity) await refreshPack(kind);
    } catch (err) {
      notify(err.message);
    }
    return undefined;
  };

  const hasSupporter = account.tags.includes('supporter');
  const hasHalloween = account.tags.includes('halloween');
  const halloweenOpen = shop?.halloween?.open;
  const supporterLabel = !shop?.supporter ? 'Discord checkout coming soon' : IS_ACTIVITY ? 'Purchase pack' : account.discordLinked ? 'Support the game on Discord' : 'Link Discord to support';
  const halloweenLabel = !shop ? 'Loading…' : !halloweenOpen ? 'Back next October' : !shop.halloween.skuId ? 'Discord checkout coming soon' : IS_ACTIVITY ? 'Purchase pack' : account.discordLinked ? 'Get the Halloween Pack' : 'Link Discord to get it';
  const onCarouselKey = (e) => {
    if (e.key === 'ArrowLeft') go(slide - 1);
    else if (e.key === 'ArrowRight') go(slide + 1);
  };
  const onSwipeEnd = (e) => {
    if (swipeStart.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeStart.current;
    if (Math.abs(dx) > 50) go(slide + (dx < 0 ? 1 : -1));
    swipeStart.current = null;
  };
  const slideProps = (i) => (i === slide ? {} : { 'aria-hidden': true, inert: '' });

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

        <div className="shop-carousel" role="group" aria-roledescription="carousel" aria-label="Packs" onKeyDown={onCarouselKey}>
          <div className="carousel-viewport" onTouchStart={(e) => (swipeStart.current = e.touches[0].clientX)} onTouchEnd={onSwipeEnd}>
            <div className="carousel-track" style={{ transform: `translateX(-${slide * 100}%)` }}>
              <div className="carousel-slide" role="group" aria-roledescription="slide" aria-label="Supporter Pack, 1 of 2" {...slideProps(0)}>
                <section className="supporter-shop" aria-label="Support the game">
                  <picture>
                    <source media="(prefers-reduced-motion: reduce)" srcSet="/supporter-pack-still.png" />
                    <img className="supporter-art" src="/supporter-pack.gif" alt="The Tideglass marble and Beacon die floating above a moonlit table" width="680" height="240" />
                  </picture>
                  <div className="supporter-shop-body">
                    <div className="supporter-shop-head"><span className="supporter-eyebrow">A little light for the table</span><h3>Supporter Pack</h3><span className="supporter-price">$5.99 USD · one time</span></div>
                    <p>A permanent Supporter badge and exclusive cosmetics: the Tideglass marble, Moonwake board, Beacon die, Keepsake nameplate, Riptide kill effect, and more to come! Only the look changes; never the gameplay.</p>
                    <PackItems kind="supporter" />
                    <p className="supporter-thanks">From the bottom of my heart: thank you for choosing to support this tiny game. Every person who sits down at this table makes it feel more alive. Your help means I get to keep building this game for more to enjoy, and it genuinely means the world to me. Love ya!</p>
                    <div className="supporter-actions">
                      {hasSupporter ? <span className="supporter-owned">Your Supporter set is waiting in the locker. Thank you.</span> : (
                        <button className="btn primary" disabled={!shop?.supporter || !!syncing} onClick={() => purchasePack('supporter')}>
                          {supporterLabel}
                        </button>
                      )}
                      {shop?.supporter && account.discordLinked && !hasSupporter && <button className="btn secondary" disabled={!!syncing} onClick={() => refreshPack('supporter')}>{syncing === 'supporter' ? 'Checking…' : 'Already purchased? Check access'}</button>}
                      <span className="supporter-signature">— Ryan :)</span>
                    </div>
                    <span className="muted small-text">Checkout and payment are handled by Discord. Access is granted only after Discord confirms the purchase.</span>
                  </div>
                </section>
              </div>

              <div className="carousel-slide" role="group" aria-roledescription="slide" aria-label="Halloween Pack, 2 of 2" {...slideProps(1)}>
                <section className="halloween-shop" aria-label="Halloween Pack">
                  <div className="halloween-art-wrap">
                    <picture>
                      <source media="(prefers-reduced-motion: reduce)" srcSet="/halloween-pack-still.png" />
                      <img className="halloween-art" src="/halloween-pack.gif" alt="A crystal ball and a candlelit die on a séance table under a crescent moon" width="680" height="240" loading="lazy" />
                    </picture>
                    <span className={`halloween-ribbon${shop && !halloweenOpen ? ' closed' : ''}`}>{shop && !halloweenOpen ? 'Gone until next October' : 'Only available in October!'}</span>
                  </div>
                  <div className="halloween-shop-body">
                    <div className="halloween-shop-head"><span className="halloween-eyebrow">Pull up a chair</span><h3>Halloween Pack</h3><span className="halloween-price">$3.99 USD · one time</span></div>
                    <p>The spirits gather round the table, and so do you. A permanent Haunted badge and five candlelit cosmetics, kill effect included. Only the look changes; never the gameplay.</p>
                    <PackItems kind="halloween" />
                    <p className="halloween-note">The candles are lit and there's a seat at the table with your name on it. Thank you for spending October here; the spirits (and I) are glad you came.</p>
                    <div className="halloween-actions">
                      {hasHalloween ? <span className="halloween-owned">Your Haunted set is waiting in the locker. Welcome to the séance.</span> : (
                        <button className="btn primary" disabled={!shop || !halloweenOpen || !shop.halloween.skuId || !!syncing} onClick={() => purchasePack('halloween')}>{halloweenLabel}</button>
                      )}
                      {shop?.halloween?.skuId && account.discordLinked && !hasHalloween && <button className="btn secondary" disabled={!!syncing} onClick={() => refreshPack('halloween')}>{syncing === 'halloween' ? 'Checking…' : 'Already purchased? Check access'}</button>}
                    </div>
                    <span className="small-text halloween-fine">Checkout and payment are handled by Discord. Access is granted only after Discord confirms the purchase.</span>
                  </div>
                </section>
              </div>
            </div>
          </div>
          <button type="button" className="carousel-arrow prev" aria-label="Previous pack" disabled={slide === 0} onClick={() => go(slide - 1)}><Chevron dir="left" /></button>
          <button type="button" className="carousel-arrow next" aria-label="Next pack" disabled={slide === slides - 1} onClick={() => go(slide + 1)}><Chevron /></button>
          <div className="carousel-dots">
            <button type="button" className={`carousel-dot sp${slide === 0 ? ' on' : ''}`} aria-label="Show the Supporter Pack" aria-current={slide === 0 || undefined} onClick={() => go(0)}>Supporter</button>
            <button type="button" className={`carousel-dot hw${slide === 1 ? ' on' : ''}`} aria-label="Show the Halloween Pack" aria-current={slide === 1 || undefined} onClick={() => go(1)}>Halloween</button>
          </div>
        </div>
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
