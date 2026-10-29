import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BOXES, ITEMS, RARITIES, CURRENCY, SETS, catalog, canUse } from '../game/catalog';
import { api, post } from '../net/api';
import { sfx } from '../game/sound';
import { Coins, ItemCard, ItemThumb, PreviewStage, RarityTag, Coin, preloadEmoteImages } from './Economy';
import { Close } from './Icons';
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
  painter: {
    thanks: 'The brush is yours! Sit at any table and tap your marble to paint.',
    missing: 'No Painter purchase found yet. If you just bought it, wait a moment and try again.',
  },
  halloween: {
    thanks: 'Welcome to the séance! Your Haunted set is ready in the locker.',
    missing: 'No Halloween Pack purchase found yet. If you just bought it, wait a moment and try again.',
  },
};

const PACK_SLOTS = ['marble', 'board', 'dice', 'plate', 'fx', 'trail'];

function usePeek() {
  const [peek, setPeek] = useState(null);
  const touch = useRef(false);
  const close = useCallback(() => setPeek(null), []);
  const open = (id, el, via, offer) => setPeek({ id, via, offer, el, rect: el.getBoundingClientRect() });

  useEffect(() => {
    if (peek?.via !== 'tap') return undefined;
    const away = (e) => !e.target.closest?.('.featured-peek') && !peek.el.contains(e.target) && close();
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      close();
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
    };
  }, [peek, close]);

  const bind = (id) => ({
    onPointerEnter: (e) => {
      touch.current = e.pointerType !== 'mouse';
      if (!touch.current) open(id, e.currentTarget, 'hover');
    },
    onPointerLeave: (e) => e.pointerType === 'mouse' && setPeek((p) => (p?.via === 'hover' ? null : p)),
    onFocus: (e) => e.currentTarget.matches(':focus-visible') && open(id, e.currentTarget, 'focus'),
    onBlur: () => setPeek((p) => (p?.via === 'focus' ? null : p)),
  });

  const tapped = (id, el, offer) => {
    if (!touch.current) return false;
    if (peek?.id === id && peek.via === 'tap') close();
    else open(id, el, 'tap', offer);
    return true;
  };

  return { peek, bind, tapped, close };
}

function PeekPop({ peek, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const { rect } = peek;
    const gap = 8;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    const above = rect.top - h - gap >= gap || rect.top > window.innerHeight - rect.bottom;
    const top = above ? rect.top - h - gap : rect.bottom + gap;
    el.style.top = `${Math.max(gap, Math.min(window.innerHeight - h - gap, top))}px`;
    el.style.left = `${Math.max(gap, Math.min(window.innerWidth - w - gap, rect.left + rect.width / 2 - w / 2))}px`;
  });
  const tap = peek.via === 'tap';
  return createPortal(
    <div ref={ref} className={`featured-peek${tap ? ' tap' : ''}`} aria-hidden={tap ? undefined : true}>
      {children}
    </div>,
    document.body
  );
}

function PackItems({ kind, peek }) {
  const rowRef = useRef(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;

    const updateFades = () => {
      const maxScroll = row.scrollWidth - row.clientWidth;
      if (maxScroll <= 2) {
        delete row.dataset.fadeL;
        delete row.dataset.fadeR;
        return;
      }
      if (row.scrollLeft > 2) row.dataset.fadeL = '';
      else delete row.dataset.fadeL;
      if (row.scrollLeft < maxScroll - 2) row.dataset.fadeR = '';
      else delete row.dataset.fadeR;
    };

    const measure = () => {
      const style = getComputedStyle(row);
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const paddingRight = parseFloat(style.paddingRight) || 0;
      const gap = parseFloat(style.columnGap) || 0;
      const count = row.children.length;
      const available = row.clientWidth - paddingLeft;
      const baseWidth = 96;
      const fits = count * baseWidth + (count - 1) * gap <= available - paddingRight;
      if (fits) {
        row.style.removeProperty('--pack-item-w');
      } else {
        const candidates = Array.from({ length: Math.max(1, count - 1) }, (_, i) => {
          const k = i + 1;
          return (available - k * gap) / (k + 0.5);
        });
        const valid = candidates.filter((width) => width >= 72 && width <= 110);
        const source = valid.length ? valid[valid.length - 1] : [...candidates].sort((a, b) => Math.abs(a - baseWidth) - Math.abs(b - baseWidth))[0];
        const width = Math.max(72, Math.min(110, source));
        row.style.setProperty('--pack-item-w', `${Math.round(width * 100) / 100}px`);
      }
      updateFades();
    };

    const onWheel = (e) => {
      if (row.scrollWidth <= row.clientWidth || !e.deltaY) return;
      e.preventDefault();
      row.scrollLeft += e.deltaY;
    };

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(row);
    row.addEventListener('scroll', updateFades, { passive: true });
    row.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer?.disconnect();
      row.removeEventListener('scroll', updateFades);
      row.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <div ref={rowRef} className="pack-items">
      {PACK_SLOTS.map((slot) => {
        const item = ITEMS[`${slot}.${kind}`];
        return (
          <button key={item.id} type="button" className="pack-item" aria-label={`Preview ${item.name}`} {...peek.bind(item.id)} onClick={(e) => peek.tapped(item.id, e.currentTarget)}>
            <ItemThumb itemId={item.id} />
            {item.name}
            <small>{catalog.slots[item.slot].label.replace(/s$/, '')}</small>
          </button>
        );
      })}
    </div>
  );
}

function PackArtwork({ kind, shop, className }) {
  const reduced = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);
  const videoRef = useRef(null);
  const artwork = {
    supporter: {
      still: '/supporter-pack-still.png',
      animated: '/supporter-pack.mp4',
      alt: 'The Tideglass marble and Beacon die floating above a moonlit table',
    },
    painter: {
      still: '/painter-pack-still.png',
      animated: '/painter-pack.mp4',
      alt: 'Four marbles hopping on a pedestal, each repainted a new colour as it lands',
    },
    halloween: {
      still: '/halloween-pack-still.png',
      animated: '/halloween-pack.mp4',
      alt: 'A crystal ball and a candlelit die on a séance table under a crescent moon',
    },
  }[kind];
  const lazy = kind === 'supporter' ? {} : { loading: 'lazy' };
  const halloweenClosed = shop && !shop.halloween?.open;
  useEffect(() => {
    videoRef.current?.play()?.catch(() => {});
  }, []);

  return (
    <div className={`pack-art ${className}`}>
      {reduced ? (
        <img className="pack-hero" src={artwork.still} alt={artwork.alt} width="680" height="240" {...lazy} />
      ) : (
        <video ref={videoRef} className="pack-hero" src={artwork.animated} poster={artwork.still} width="680" height="240" autoPlay muted loop playsInline preload="auto" aria-label={artwork.alt} />
      )}
      {kind === 'halloween' && <span className={`halloween-ribbon${halloweenClosed ? ' closed' : ''}`}>{halloweenClosed ? 'Gone until next October' : 'Only available in October!'}</span>}
    </div>
  );
}

function PeekInfo({ itemId, offer, owned, buying, onBuy }) {
  const item = ITEMS[itemId];
  return (
    <div className="peek-info">
      <div className="peek-title">
        <b>{item.name}</b>
        <RarityTag item={item} />
      </div>
      {item.desc && <p>{item.desc}</p>}
      {offer && (owned ? (
        <span className="item-price owned">Owned</span>
      ) : (
        <button type="button" className="btn primary block" disabled={!!buying} onClick={onBuy}>
          Buy <Coin size={16} /> {offer.price.toLocaleString()}
        </button>
      ))}
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

function SetReveal({ result, account }) {
  const set = SETS[result.set];
  const [focus, setFocus] = useState(() => result.items.find((id) => ITEMS[id].slot === 'board') || result.items[0]);
  const fresh = result.items.filter((id) => !result.owned.includes(id));
  return (
    <>
      <PreviewStage itemId={focus} playerName={account.name} />
      <h2 className="reveal-name">{set.name} set</h2>
      <p className="reveal-desc">{result.duplicate ? 'You already had every piece.' : fresh.length === result.items.length ? 'Every piece, all at once.' : `${fresh.length} new pieces to finish the set.`}</p>
      <div className="reveal-set-grid">
        {result.items.map((id) => (
          <ItemCard key={id} itemId={id} selected={focus === id} onClick={() => setFocus(id)} footer={<span className={`set-piece-state${fresh.includes(id) ? '' : ' dupe'}`}>{fresh.includes(id) ? 'NEW' : 'Had it'}</span>} />
        ))}
      </div>
      {result.refund > 0 && (
        <div className="reveal-dupe">
          {result.duplicate ? 'Duplicate set!' : 'Pieces you had:'} converted to <Coins amount={result.refund} animate={false} />
        </div>
      )}
    </>
  );
}

function BoxOpening({ opening, account, onAgain, onEquip, onEquipSet, onDone }) {
  const { box, phase, result } = opening;
  const item = result && ITEMS[result.item];
  const isSet = !!result?.set;
  const setWorn = isSet && result.items.every((id) => account.equipped[ITEMS[id].slot] === id);
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
      {phase === 'reveal' && (item || isSet) && <div className="reveal-rays" />}
      {phase === 'reveal' && isSet && (
        <div className="reveal-card reveal-set rarity-mythic">
          <SetReveal key={result.set} result={result} account={account} />
          <div className="row center">
            {!result.duplicate && !setWorn && (
              <button className="btn secondary" onClick={() => onEquipSet(result.items)}>
                Equip set
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
  const [showRates, setShowRates] = useState({});
  const [buying, setBuying] = useState(null);
  const [syncing, setSyncing] = useState(null);
  const [pack, setPack] = useState(null);
  const peeker = usePeek();
  const { peek } = peeker;
  const packTrigger = useRef(null);
  const packSheetRef = useRef(null);
  const refreshIn = useCountdown(shop?.refreshAt);

  useEffect(() => {
    preloadEmoteImages();
  }, []);

  useEffect(() => {
    api('/shop')
      .then(setShop)
      .catch((err) => notify(err.message));
  }, [notify]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (pack) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setPack(null);
      } else if (!opening) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, opening, pack]);

  useEffect(() => {
    if (!pack) return undefined;
    packSheetRef.current?.focus();
    return () => {
      if (packTrigger.current?.isConnected) packTrigger.current.focus();
      packTrigger.current = null;
    };
  }, [pack]);

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
  const hasPainter = account.tags.includes('painter');
  const halloweenOpen = shop?.halloween?.open;
  const supporterLabel = !shop?.supporter ? 'Discord checkout coming soon' : IS_ACTIVITY ? 'Purchase pack' : account.discordLinked ? 'Support the game on Discord' : 'Link Discord to support';
  const halloweenLabel = !shop ? 'Loading…' : !halloweenOpen ? 'Back next October' : !shop.halloween.skuId ? 'Discord checkout coming soon' : IS_ACTIVITY ? 'Purchase pack' : account.discordLinked ? 'Get the Halloween Pack' : 'Link Discord to get it';
  const painterLabel = !shop?.painter ? 'Discord checkout coming soon' : IS_ACTIVITY ? 'Purchase pack' : account.discordLinked ? 'Get the Painter Pack' : 'Link Discord to get it';
  const openPack = (kind, e) => {
    packTrigger.current = e.currentTarget;
    setPack(kind);
  };
  const closePack = (e) => {
    e?.stopPropagation();
    setPack(null);
  };
  const packNames = { supporter: 'Supporter', painter: 'Painter', halloween: 'Halloween' };

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
                <div className="rates-wrap">
                  <button className="btn link" aria-expanded={!!showRates[box.id]} onClick={() => setShowRates((s) => ({ ...s, [box.id]: !s[box.id] }))}>
                    {showRates[box.id] ? 'Hide drop rates' : 'Drop rates'}
                  </button>
                  {showRates[box.id] && (
                    <ul className="rates rates-pop">
                      {Object.entries(box.weights)
                        .filter(([, w]) => w > 0)
                        .map(([rarity, w]) => (
                          <li key={rarity}>
                            <RarityTag rarity={rarity} /> <span>{rarity === 'mythic' ? `${w}% (full set)` : `${w}%`}</span>
                          </li>
                        ))}
                      <li className="muted small-text">Duplicates convert to {CURRENCY}.</li>
                    </ul>
                  )}
                </div>
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
                {...peeker.bind(offer.id)}
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
                onClick={(e) => !peeker.tapped(offer.id, e.currentTarget, offer) && !owned && !buying && buy(offer)}
              />
            );
          })}
        </div>
        {peek && (
          <PeekPop peek={peek}>
            <PreviewStage itemId={peek.id} playerName={account.name} />
            {peek.via === 'tap' && <PeekInfo itemId={peek.id} offer={peek.offer} owned={peek.offer && canUse(account, peek.id)} buying={buying} onBuy={() => { peeker.close(); buy(peek.offer); }} />}
          </PeekPop>
        )}
        <p className="muted small-text center">Featured items and chests use {CURRENCY} earned by playing. No pay-to-win.</p>

        <div className="pack-shelf" aria-label="Packs">
          <button type="button" className="pack-card sp" aria-label={`Supporter Pack, ${hasSupporter ? 'owned' : '$5.99'}`} onClick={(e) => openPack('supporter', e)}>
            <PackArtwork kind="supporter" shop={shop} className="pack-card-art" />
            <div className="pack-card-body">
              <div className="pack-card-row"><h3>Supporter Pack</h3><span className="pack-card-price">{hasSupporter ? 'Owned' : '$5.99'}</span></div>
              <span className="pack-card-blurb">A badge and 6 Tideglass cosmetics. Keeps the lights on.</span>
            </div>
          </button>
          <button type="button" className="pack-card pt" aria-label={`Painter Pack, ${hasPainter ? 'owned' : '$2.99'}`} onClick={(e) => openPack('painter', e)}>
            <PackArtwork kind="painter" shop={shop} className="pack-card-art" />
            <div className="pack-card-body">
              <div className="pack-card-row"><h3>Painter Pack</h3><span className="pack-card-price">{hasPainter ? 'Owned' : '$2.99'}</span></div>
              <span className="pack-card-blurb">Everyone at your table picks their own colour.</span>
            </div>
          </button>
          <button type="button" className="pack-card hw" aria-label={`Halloween Pack, ${hasHalloween ? 'owned' : '$3.99'}`} onClick={(e) => openPack('halloween', e)}>
            <PackArtwork kind="halloween" shop={shop} className="pack-card-art" />
            <div className="pack-card-body">
              <div className="pack-card-row"><h3>Halloween Pack</h3><span className="pack-card-price">{hasHalloween ? 'Owned' : '$3.99'}</span></div>
              <span className="pack-card-blurb">Haunted badge and 6 candlelit cosmetics. October only.</span>
            </div>
          </button>
        </div>
      </div>

      {pack && createPortal(
        <div className="modal-backdrop pack-sheet-backdrop" onClick={closePack}>
          <div
            ref={packSheetRef}
            className={`panel modal pack-sheet ${pack === 'supporter' ? 'sp' : pack === 'painter' ? 'pt' : 'hw'}`}
            role="dialog"
            aria-modal="true"
            aria-label={`${packNames[pack]} Pack`}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pack-sheet-grab" aria-hidden="true" />
            <button type="button" className="icon-close pack-sheet-close" aria-label="Close" onClick={closePack}>
              <Close />
            </button>
            <PackArtwork kind={pack} shop={shop} className="pack-sheet-art" />
            {pack === 'supporter' && (
              <div className="supporter-shop-body pack-sheet-body">
                <div className="supporter-shop-head"><span className="supporter-eyebrow">A little light for the table</span><h3>Supporter Pack</h3><span className="supporter-price">$5.99 USD · one time</span></div>
                <p>A permanent Supporter badge and exclusive cosmetics: the Tideglass marble, Moonwake board, Beacon die, Keepsake nameplate, Riptide kill effect, Wake trail, and more to come! Only the look changes; never the gameplay.</p>
                <PackItems kind="supporter" peek={peeker} />
                <p className="supporter-thanks">From the bottom of my heart: thank you for choosing to support this tiny game. Every person who sits down at this table makes it feel more alive. Your help means I get to keep building this game for more to enjoy, and it genuinely means the world to me. Love ya!</p>
                <div className="supporter-actions">
                  {hasSupporter ? <span className="supporter-owned">Your Supporter set is waiting in the locker. Thank you.</span> : (
                    <button className="btn primary" disabled={!shop?.supporter || !!syncing} onClick={() => purchasePack('supporter')}>
                      {supporterLabel}
                    </button>
                  )}
                  {shop?.supporter && account.discordLinked && !hasSupporter && <button className="btn secondary" disabled={!!syncing} onClick={() => refreshPack('supporter')}>{syncing === 'supporter' ? 'Checking…' : 'Already purchased? Check access'}</button>}
                  <span className="supporter-signature">- Ryan :)</span>
                </div>
                <span className="muted small-text">Checkout and payment are handled by Discord. Access is granted only after Discord confirms the purchase.</span>
              </div>
            )}
            {pack === 'painter' && (
              <div className="painter-shop-body pack-sheet-body">
                <div className="painter-shop-head"><span className="painter-eyebrow">Bring your own paint</span><h3>Painter Pack</h3><span className="painter-price">$2.99 USD · one time</span></div>
                <ul className="pack-perks">
                  <li><i aria-hidden="true" style={{ background: '#7ab8ff' }} />Everyone seated picks a colour from 18, kept far enough apart that nobody blends in</li>
                  <li><i aria-hidden="true" style={{ background: '#ff7a8a' }} />You get any custom hex, and can take a colour someone else is using</li>
                  <li><i aria-hidden="true" style={{ background: '#c9adff' }} />Permanent Painter badge</li>
                </ul>
                <div className="painter-actions">
                  {hasPainter ? <span className="painter-owned">The brush is yours. Sit at any table and tap your marble.</span> : (
                    <button className="btn primary" disabled={!shop?.painter || !!syncing} onClick={() => purchasePack('painter')}>{painterLabel}</button>
                  )}
                  {shop?.painter && account.discordLinked && !hasPainter && <button className="btn secondary" disabled={!!syncing} onClick={() => refreshPack('painter')}>{syncing === 'painter' ? 'Checking…' : 'Already purchased? Check access'}</button>}
                </div>
                <span className="muted small-text">Checkout and payment are handled by Discord. Access is granted only after Discord confirms the purchase.</span>
              </div>
            )}
            {pack === 'halloween' && (
              <div className="halloween-shop-body pack-sheet-body">
                <div className="halloween-shop-head"><span className="halloween-eyebrow">Pull up a chair</span><h3>Halloween Pack</h3><span className="halloween-price">$3.99 USD · one time</span></div>
                <p>The spirits gather round the table, and so do you. A permanent Haunted badge and six candlelit cosmetics, kill effect included. Only the look changes; never the gameplay.</p>
                <PackItems kind="halloween" peek={peeker} />
                <p className="halloween-note">The candles are lit and there's a seat at the table with your name on it. Thank you for spending October here; the spirits (and I) are glad you came.</p>
                <div className="halloween-actions">
                  {hasHalloween ? <span className="halloween-owned">Your Haunted set is waiting in the locker. Welcome to the séance.</span> : (
                    <button className="btn primary" disabled={!shop || !halloweenOpen || !shop.halloween.skuId || !!syncing} onClick={() => purchasePack('halloween')}>{halloweenLabel}</button>
                  )}
                  {shop?.halloween?.skuId && account.discordLinked && !hasHalloween && <button className="btn secondary" disabled={!!syncing} onClick={() => refreshPack('halloween')}>{syncing === 'halloween' ? 'Checking…' : 'Already purchased? Check access'}</button>}
                </div>
                <span className="small-text halloween-fine">Checkout and payment are handled by Discord. Access is granted only after Discord confirms the purchase.</span>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {opening && (
        <BoxOpening
          opening={opening}
          account={account}
          onAgain={() => openBox(opening.box)}
          onEquip={async (item) => {
            await onEquip(item.slot, item.id);
            setOpening(null);
          }}
          onEquipSet={async (ids) => {
            for (const id of ids) await onEquip(ITEMS[id].slot, id);
            setOpening(null);
          }}
          onDone={() => setOpening(null)}
        />
      )}
    </div>
  );
}
