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
      {tag === 'supporter' && <svg className="tag-supporter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-9-5.7-9-11.6a5 5 0 0 1 9-3.1 5 5 0 0 1 9 3.1C21 15.3 12 21 12 21Z" /></svg>}
      {tag === 'halloween' && <svg className="tag-halloween-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a8 8 0 0 0-8 8v11l2.7-2 2.6 2 2.7-2 2.7 2 2.6-2 2.7 2V10a8 8 0 0 0-8-8Z" /><circle cx="9" cy="10" r="1.7" fill="#2b1100" /><circle cx="15" cy="10" r="1.7" fill="#2b1100" /></svg>}
      {tag === 'lucky' && (
        <svg className="tag-lucky-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
        </svg>
      )}
      {info.label}
    </span>
  );
}

export const TagBadges = ({ tags, small }) => {
  const visible = (tags || []).filter((tag) => !(tag === 'beta' && tags.includes('dev')));
  return visible.map((tag) => <TagBadge key={tag} tag={tag} small={small} />);
};

export function EmoteGlyph({ emote }) {
  if (!emote) return null;
  return emote.img ? <img className="emote-glyph" src={emote.img} alt={emote.hint || ''} draggable={false} /> : <span className="emote-glyph">{emote.emoji}</span>;
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
  return (
    <div className="preview-stage">
      <Suspense fallback={<ItemThumb itemId={itemId} seat={seat} />}>
        <ItemPreview itemId={itemId} seat={seat} replay={replay} />
      </Suspense>
    </div>
  );
}

export function ItemCard({ itemId, owned = true, equipped = false, selected = false, onClick, onPointerEnter, footer, seat = 0, label, disabled = false }) {
  const item = ITEMS[itemId];
  const rarity = rarityOf(item);
  return (
    <button
      type="button"
      className={`item-card rarity-${item.rarity}${item.tag ? ` tag-${item.tag}` : ''}${owned ? '' : ' locked'}${equipped ? ' equipped' : ''}${selected ? ' selected' : ''}`}
      style={{ '--rarity': rarity.color }}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      title={item.desc}
      aria-label={label}
      aria-disabled={disabled || undefined}
    >
      <ItemThumb itemId={itemId} seat={seat} />
      <span className="item-name">{item.name}</span>
      <span className="item-rarity">{rarity.short || rarity.label}</span>
      {equipped && <span className="item-badge">Equipped</span>}
      {!owned && !footer && <span className="item-lock">{item.id === 'dice.lucky' ? '7 days as Luckiest' : item.tag ? `${rarity.short} only` : 'Locked'}</span>}
      {footer}
    </button>
  );
}
