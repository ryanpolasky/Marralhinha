import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { ITEMS, CURRENCY, TAGS, skinKey, rarityOf } from '../game/catalog';
import { SEAT_COLORS } from '../game/geometry';

const ItemPreview = lazy(() => import('../three/Preview'));

export const Coin = ({ size = 18 }) => (
  <svg className="coin-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10.5" fill="#f6c343" stroke="#a8740f" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="7.2" fill="none" stroke="#fff0b8" strokeWidth="1.2" opacity="0.8" />
    <circle cx="12" cy="12" r="4" fill="#d99a1c" />
    <circle cx="10.7" cy="10.6" r="1.3" fill="#fff6d0" />
  </svg>
);

export function useCountUp(value, duration = 700) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const initial = from.current;
    if (initial === value) return undefined;
    let frame;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(initial + (value - initial) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      from.current = value;
    };
  }, [value, duration]);
  return shown;
}

export function Coins({ amount, animate = true, className = '' }) {
  const shown = useCountUp(amount);
  return (
    <span className={`coins ${className}`} title={CURRENCY}>
      <Coin />
      {(animate ? shown : amount).toLocaleString()}
    </span>
  );
}

export function Nameplate({ plate, children, className = '', style }) {
  return (
    <span className={`plate plate-${skinKey(plate) || 'basic'} ${className}`} style={style}>
      {children}
    </span>
  );
}

export function RarityTag({ rarity, item }) {
  const r = item ? rarityOf(item) : rarityOf({ rarity });
  return (
    <span className={`rarity-tag rarity-${item?.rarity || rarity}${item?.tag ? ` tag-${item.tag}` : ''}`} style={{ '--rarity': r.color }}>
      {r.label}
    </span>
  );
}

export function TagBadge({ tag, small = false, icon = false, title }) {
  const info = TAGS[tag];
  if (!info) return null;
  return (
    <span className={`tag-badge tag-${tag}${small ? ' small' : ''}${icon ? ' icon-only' : ''}`} style={{ '--tag': info.color }} title={title ?? (icon ? info.label : info.blurb)} aria-label={icon ? info.label : undefined}>
      {tag === 'dev' && <svg className="tag-code-icon" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3 1 8l5 5M18 3l5 5-5 5M14 1l-4 14" /></svg>}
      {tag === 'supporter' && <svg className="tag-supporter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-9-5.7-9-11.6a5 5 0 0 1 9-3.1 5 5 0 0 1 9 3.1C21 15.3 12 21 12 21Z" /></svg>}
      {tag === 'halloween' && <svg className="tag-halloween-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a8 8 0 0 0-8 8v11l2.7-2 2.6 2 2.7-2 2.7 2 2.6-2 2.7 2V10a8 8 0 0 0-8-8Z" /><circle cx="9" cy="10" r="1.7" fill="#2b1100" /><circle cx="15" cy="10" r="1.7" fill="#2b1100" /></svg>}
      {tag === 'lucky' && (
        <svg className="tag-lucky-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
        </svg>
      )}
      {icon ? tag === 'beta' && info.label[0] : info.label}
    </span>
  );
}

export const visibleTags = (tags) => (tags || []).filter((tag) => TAGS[tag] && !(tag === 'beta' && tags.includes('dev')));

export const SHOWN_TAGS = 3;

export const shownTags = (tags) => {
  const all = visibleTags(tags);
  const head = all.slice(0, SHOWN_TAGS);
  return all.includes('lucky') && !head.includes('lucky') ? [...head, 'lucky'] : head;
};

export const TagBadges = ({ tags, small, full = false }) =>
  (full ? visibleTags(tags) : shownTags(tags)).map((tag, i) => <TagBadge key={tag} tag={tag} small={small} icon={!full && i > 0} />);

export function EmoteGlyph({ emote }) {
  if (!emote) return null;
  return emote.img ? <img className="emote-glyph" src={emote.img} alt={emote.hint || ''} draggable={false} /> : <span className="emote-glyph">{emote.emoji}</span>;
}

const preloaded = new Set();
export function preloadEmoteImages() {
  Object.values(ITEMS).forEach((item) => {
    (item.emotes || []).forEach((e) => {
      if (!e.img || preloaded.has(e.img)) return;
      preloaded.add(e.img);
      new Image().src = e.img;
    });
  });
}

const LOADER_DELAY = 180;
const LOADER_MIN = 400;

export function PreviewLoader({ out = false }) {
  return (
    <div className={`preview-loader${out ? ' out' : ''}`} role="status" aria-label="Loading preview">
      <span className="preview-loader-marble" />
    </div>
  );
}

export function ItemThumb({ itemId, seat = 0 }) {
  const item = ITEMS[itemId];
  const key = skinKey(itemId);
  const color = SEAT_COLORS[seat];
  return (
    <span className={`thumb thumb-${item.slot} skin-${key}`} style={{ '--seat': color.main, '--seat-light': color.light, '--seat-dark': color.dark }}>
      {item.slot === 'nameplate' && <Nameplate plate={itemId}>Aa</Nameplate>}
      {item.slot === 'dice' && <span className="thumb-pips" />}
      {item.slot === 'emotes' && (
        <span className="emote-quad">
          {(item.emotes || []).slice(0, 4).map((e) => (
            <EmoteGlyph key={e.key} emote={e} />
          ))}
        </span>
      )}
    </span>
  );
}

export function PreviewStage({ itemId, seat = 0, playerName, replay = 0 }) {
  const item = ITEMS[itemId];
  if (!item) return null;
  if (item.slot === 'nameplate') {
    return (
      <div className="preview-stage plate-preview">
        <Nameplate plate={itemId} className="big">
          <span className="avatar" style={{ '--seat': SEAT_COLORS[seat].main, '--seat-light': SEAT_COLORS[seat].light }}>
            {(playerName || '?').slice(0, 1).toUpperCase()}
          </span>
          <span>{playerName || 'Player'}</span>
        </Nameplate>
      </div>
    );
  }
  if (item.slot === 'emotes') {
    return (
      <div className="preview-stage emote-preview">
        {(item.emotes || []).map((e) => (
          <span key={e.key} className="emote-sample" title={e.hint}>
            <EmoteGlyph emote={e} />
          </span>
        ))}
      </div>
    );
  }
  return <ModelStage itemId={itemId} seat={seat} replay={replay} />;
}

function ModelStage({ itemId, seat, replay }) {
  const [ready, setReady] = useState(false);
  const [loaderOn, setLoaderOn] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    setReady(false);
    setLoaderOn(false);
    setRevealed(false);
    const t = setTimeout(() => {
      shownAt.current = Date.now();
      setLoaderOn(true);
    }, LOADER_DELAY);
    return () => clearTimeout(t);
  }, [itemId]);

  useEffect(() => {
    if (!ready) return undefined;
    const wait = loaderOn ? Math.max(0, LOADER_MIN - (Date.now() - shownAt.current)) : 0;
    const t = setTimeout(() => setRevealed(true), wait);
    return () => clearTimeout(t);
  }, [ready, loaderOn]);

  return (
    <div className="preview-stage">
      <div className={`preview-fade${revealed ? ' in' : ''}`}>
        <Suspense fallback={null}>
          <ItemPreview itemId={itemId} seat={seat} replay={replay} onReady={() => setReady(true)} />
        </Suspense>
      </div>
      {loaderOn && <PreviewLoader out={revealed} />}
    </div>
  );
}

export function ItemCard({ itemId, owned = true, equipped = false, selected = false, onClick, onPointerEnter, onPointerLeave, onFocus, onBlur, footer, seat = 0, label, disabled = false, thumbLoading = false }) {
  const item = ITEMS[itemId];
  const rarity = rarityOf(item);
  return (
    <button
      type="button"
      className={`item-card rarity-${item.rarity}${item.tag ? ` tag-${item.tag}` : ''}${owned ? '' : ' locked'}${equipped ? ' equipped' : ''}${selected ? ' selected' : ''}`}
      style={{ '--rarity': rarity.color }}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      title={item.desc}
      aria-label={label}
      aria-disabled={disabled || undefined}
    >
      <span className="item-thumb-slot">{thumbLoading ? <span className="thumb thumb-loading" /> : <ItemThumb itemId={itemId} seat={seat} />}</span>
      <span className="item-name">{item.name}</span>
      <span className="item-rarity">{rarity.short || rarity.label}</span>
      {equipped && <span className="item-badge">Equipped</span>}
      {!owned && !footer && <span className="item-lock">{item.id === 'dice.lucky' ? '7 days as Luckiest' : item.tag ? `${rarity.short} only` : 'Locked'}</span>}
      {footer}
    </button>
  );
}
