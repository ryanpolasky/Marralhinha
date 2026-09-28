import React, { useEffect, useState } from 'react';
import { SLOTS, SLOT_KEYS, ITEMS, itemsForSlot, catalog } from '../game/catalog';
import { SEAT_COLORS } from '../game/geometry';
import { ItemCard, PreviewStage, RarityTag } from './Economy';
import { Close } from './Icons';

export default function Locker({ account, onClose, onEquip, onShop }) {
  const [slot, setSlot] = useState('marble');
  const [selected, setSelected] = useState(account.equipped.marble);
  const [seat, setSeat] = useState(0);

  useEffect(() => setSelected(account.equipped[slot]), [slot]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const owns = (id) => ITEMS[id].rarity === 'default' || account.inventory.includes(id);
  const collected = catalog.items.filter((i) => owns(i.id)).length;
  const item = ITEMS[selected];
  const isEquipped = account.equipped[slot] === selected;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal locker-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Locker">
        <div className="modal-head">
          <h2>Locker</h2>
          <span className="muted">
            {collected} / {catalog.items.length} collected
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
                {itemsForSlot(key).filter((i) => owns(i.id)).length}/{itemsForSlot(key).length}
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
                  <RarityTag rarity={item.rarity} />
                  <h3>{item.name}</h3>
                  <p className="muted">{item.desc}</p>
                  {owns(item.id) ? (
                    <button className="btn primary block" disabled={isEquipped} onClick={() => onEquip(slot, item.id)}>
                      {isEquipped ? 'Equipped' : 'Equip'}
                    </button>
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
              <ItemCard key={i.id} itemId={i.id} seat={seat} owned={owns(i.id)} equipped={account.equipped[slot] === i.id} selected={selected === i.id} onClick={() => setSelected(i.id)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
