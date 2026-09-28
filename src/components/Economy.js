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

export function TagBadge({ tag, small = false, title }) {
  const info = TAGS[tag];
  if (!info) return null;
  return (
    <span className={`tag-badge tag-${tag}${small ? ' small' : ''}`} style={{ '--tag': info.color }} title={title ?? info.blurb}>
      {tag === 'dev' && <svg className="tag-code-icon" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3 1 8l5 5M18 3l5 5-5 5M14 1l-4 14" /></svg>}
      {info.label}
    </span>
  );
}

export const TagBadges = ({ tags, small }) => (tags || []).map((tag) => <TagBadge key={tag} tag={tag} small={small} />);

export function ItemThumb({ itemId, seat = 0 }) {
  const item = ITEMS[itemId];
  const key = skinKey(itemId);
  const color = SEAT_COLORS[seat];
  return (
    <span className={`thumb thumb-${item.slot} skin-${key}`} style={{ '--seat': color.main, '--seat-light': color.light, '--seat-dark': color.dark }}>
      {item.slot === 'nameplate' && <Nameplate plate={itemId}>Aa</Nameplate>}
      {item.slot === 'dice' && <span className="thumb-pips" />}
    </span>
  );
}

export function PreviewStage({ itemId, seat = 0, playerName }) {
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
  return (
    <div className="preview-stage">
      <Suspense fallback={<ItemThumb itemId={itemId} seat={seat} />}>
        <ItemPreview itemId={itemId} seat={seat} />
      </Suspense>
    </div>
  );
}

export function ItemCard({ itemId, owned = true, equipped = false, selected = false, onClick, footer, seat = 0 }) {
  const item = ITEMS[itemId];
  const rarity = rarityOf(item);
  return (
    <button
      className={`item-card rarity-${item.rarity}${item.tag ? ` tag-${item.tag}` : ''}${owned ? '' : ' locked'}${equipped ? ' equipped' : ''}${selected ? ' selected' : ''}`}
      style={{ '--rarity': rarity.color }}
      onClick={onClick}
      title={item.desc}
    >
      <ItemThumb itemId={itemId} seat={seat} />
      <span className="item-name">{item.name}</span>
      <span className="item-rarity">{rarity.short || rarity.label}</span>
      {equipped && <span className="item-badge">Equipped</span>}
      {!owned && !footer && <span className="item-lock">{item.tag ? `${rarity.short} only` : 'Locked'}</span>}
      {footer}
    </button>
  );
}
