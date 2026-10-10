import React, { useEffect, useRef, useState } from 'react';
import { SLOTS, SLOT_KEYS, ITEMS, TAGS, TAG_KEYS, itemsForSlot, canUse, collectible } from '../game/catalog';
import { SEAT_COLORS } from '../game/geometry';
import { ItemCard, PreviewStage, RarityTag, TagBadge, visibleTags, shownTags } from './Economy';
import { warmBoardSkin } from '../game/skinWarm';
import { Close } from './Icons';

const THUMB_BATCH = 6;
const TAGS_TAB = 'tags';
const MAX_SHORTHANDS = 2;

export default function Locker({ account, onClose, onEquip, onTagLoadout, onShop }) {
  const [slot, setSlot] = useState('marble');
  const [selected, setSelected] = useState(account.equipped.marble);
  const [seat, setSeat] = useState(0);
  const [replay, setReplay] = useState(0);
  const pick = (id) => {
    setSelected(id);
    setReplay((r) => r + 1);
  };

  useEffect(() => setSelected(account.equipped[slot]), [slot]); // eslint-disable-line react-hooks/exhaustive-deps
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    let frame;
    let n = 0;
    const total = itemsForSlot(slot).length;
    const step = () => {
      n += THUMB_BATCH;
      setShown(n);
      if (n < total) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [slot]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tabsRef = useRef(null);
  useEffect(() => {
    const el = tabsRef.current;
    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth || !e.deltaY) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const ownedTags = visibleTags(account.tags);
  const owns = (id) => canUse(account, id);
  const pool = collectible(account);
  const collected = pool.filter((i) => owns(i.id)).length;
  const item = ITEMS[selected];
  const isEquipped = account.equipped[slot] === selected;
  const slotItems = (key) => itemsForSlot(key).filter((i) => pool.includes(i));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal locker-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Locker">
        <div className="modal-head">
          <h2>Locker</h2>
          <span className="muted">
            {collected} / {pool.length} collected
          </span>
          <button className="icon-close" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </div>

        <div className="tabs" ref={tabsRef}>
          {SLOT_KEYS.map((key) => (
            <button key={key} className={`tab${slot === key ? ' active' : ''}`} onClick={() => setSlot(key)}>
              {SLOTS[key].label}
              <span className="tab-count">
                {slotItems(key).filter((i) => owns(i.id)).length}/{slotItems(key).length}
              </span>
            </button>
          ))}
          <button className={`tab${slot === TAGS_TAB ? ' active' : ''}`} onClick={() => setSlot(TAGS_TAB)}>
            Tags
            <span className="tab-count">
              {(account.tags || []).includes('dev') ? TAG_KEYS.length : (account.tags || []).filter((t) => TAGS[t]).length}/{TAG_KEYS.length}
            </span>
          </button>
        </div>

        {slot === TAGS_TAB ? (
          <TagsPane account={account} ownedTags={ownedTags} onTagLoadout={onTagLoadout} />
        ) : (
        <div className="locker-body">
          <div className="locker-preview">
            {item && (
              <>
                <PreviewStage itemId={item.id} seat={seat} playerName={account.name} replay={replay} />
                {slot === 'marble' && (
                  <div className="seat-picker" aria-label="Preview color">
                    {SEAT_COLORS.map((c, i) => (
                      <button key={i} className={`marble-dot mini${seat === i ? ' active' : ''}`} style={{ '--seat': c.main, '--seat-light': c.light }} onClick={() => setSeat(i)} aria-label={c.name} />
                    ))}
                  </div>
                )}
                <div className="locker-item-info">
                  <RarityTag item={item} />
                  <h3>{item.name}</h3>
                  <p className="muted">{item.desc}</p>
                  {owns(item.id) ? (
                    <button className="btn primary block" disabled={isEquipped} onClick={() => onEquip(slot, item.id)}>
                      {isEquipped ? 'Equipped' : 'Equip'}
                    </button>
                  ) : item.tag ? (
                    <div className="exclusive-note">
                      <TagBadge tag={item.tag} /> {TAGS[item.tag].unlock || `Only players with the ${TAGS[item.tag].label} tag can wear this.`}
                    </div>
                  ) : (
                    <button className="btn secondary block" onClick={onShop}>
                      Find it in the shop
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="item-grid">
            {itemsForSlot(slot).map((i, idx) => (
              <ItemCard key={i.id} thumbLoading={idx >= shown} itemId={i.id} seat={seat} owned={owns(i.id)} equipped={account.equipped[slot] === i.id} selected={selected === i.id} onClick={() => pick(i.id)} onPointerEnter={slot === 'board' ? () => warmBoardSkin(i.id) : undefined} />
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

function TagsPane({ account, ownedTags, onTagLoadout }) {
  const [selected, setSelected] = useState(ownedTags[0] || TAG_KEYS[0]);
  const isDev = (account.tags || []).includes('dev');
  const held = (tag) => isDev || (account.tags || []).includes(tag);
  const hidden = (tag) => isDev && tag === 'beta';
  const featured = ownedTags[0];
  const shown = shownTags(account.tags);
  const { main, shorthands } = account.tagLoadout || { main: null, shorthands: [] };
  const roleOf = (tag) => (featured === tag ? 'Main' : shorthands.includes(tag) ? 'Shorthand' : tag === 'lucky' && shown.includes(tag) ? 'Always shown' : shown.includes(tag) ? 'Showing' : held(tag) ? 'Owned' : 'Locked');
  const full = shorthands.length >= MAX_SHORTHANDS;
  const info = TAGS[selected];
  return (
    <div className="locker-body">
      <div className="locker-preview">
        <div className="tag-preview">
          <TagBadge tag={selected} />
          <TagBadge tag={selected} small icon />
        </div>
        <div className="locker-item-info">
          <h3>{info.label}</h3>
          <p className="muted">{info.source}</p>
          {hidden(selected) ? (
            <div className="exclusive-note">Hidden while you carry the Dev tag.</div>
          ) : (
            held(selected) && (
              <>
                <button className="btn primary block" disabled={main === selected} onClick={() => onTagLoadout(selected, shorthands.filter((t) => t !== selected))}>
                  {main === selected ? 'Main tag' : 'Make main tag'}
                </button>
                {featured !== selected && (
                  <button className="btn secondary block" disabled={full && !shorthands.includes(selected)} onClick={() => onTagLoadout(main, shorthands.includes(selected) ? shorthands.filter((t) => t !== selected) : [...shorthands, selected])}>
                    {shorthands.includes(selected) ? 'Remove shorthand' : full ? `Shorthands full (${MAX_SHORTHANDS}/${MAX_SHORTHANDS})` : 'Add as shorthand'}
                  </button>
                )}
                {selected === 'lucky' && <p className="muted">Always shown while you hold it.</p>}
              </>
            )
          )}
        </div>
      </div>
      <div className="item-grid">
        {[...TAG_KEYS].reverse().map((tag) => (
          <button key={tag} className={`item-card tag-card${held(tag) ? '' : ' locked'}${selected === tag ? ' selected' : ''}${featured === tag ? ' equipped' : ''}`} style={{ '--rarity': TAGS[tag].color }} onClick={() => setSelected(tag)}>
            <TagBadge tag={tag} />
            <span className="item-name">{TAGS[tag].label}</span>
            <span className="muted tag-card-state">{roleOf(tag)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
