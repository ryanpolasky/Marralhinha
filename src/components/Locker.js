import React, { useEffect, useState } from 'react';
import { SLOTS, SLOT_KEYS, ITEMS, TAGS, itemsForSlot, canUse, collectible } from '../game/catalog';
import { SEAT_COLORS } from '../game/geometry';
import { ItemCard, PreviewStage, RarityTag, TagBadge } from './Economy';
import { warmBoardSkin } from '../game/skinWarm';
import { Close } from './Icons';

export default function Locker({ account, onClose, onEquip, onShop }) {
  const [slot, setSlot] = useState('marble');
  const [selected, setSelected] = useState(account.equipped.marble);
  const [seat, setSeat] = useState(0);

  useEffect(() => setSelected(account.equipped[slot]), [slot]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (slot === 'board') warmBoardSkin();
  }, [slot]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

        <div className="tabs">
          {SLOT_KEYS.map((key) => (
            <button key={key} className={`tab${slot === key ? ' active' : ''}`} onClick={() => setSlot(key)}>
              {SLOTS[key].label}
              <span className="tab-count">
                {slotItems(key).filter((i) => owns(i.id)).length}/{slotItems(key).length}
              </span>
            </button>
          ))}
        </div>

        <div className="locker-body">
          <div className="locker-preview">
            {item && (
              <>
                <PreviewStage itemId={item.id} seat={seat} playerName={account.name} />
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
            {itemsForSlot(slot).map((i) => (
              <ItemCard key={i.id} itemId={i.id} seat={seat} owned={owns(i.id)} equipped={account.equipped[slot] === i.id} selected={selected === i.id} onClick={() => setSelected(i.id)} onPointerEnter={slot === 'board' ? () => warmBoardSkin(i.id) : undefined} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
