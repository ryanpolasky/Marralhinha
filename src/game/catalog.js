import catalog from '../shared/cosmetics.json';

export { catalog };
export const CURRENCY = catalog.currency;
export const RARITIES = catalog.rarities;
export const SLOTS = catalog.slots;
export const SLOT_KEYS = Object.keys(catalog.slots);
export const ITEMS = Object.fromEntries(catalog.items.map((item) => [item.id, item]));
export const BOXES = catalog.boxes;
export const DEFAULT_COSMETICS = Object.fromEntries(SLOT_KEYS.map((slot) => [slot, catalog.slots[slot].default]));
export const RARITY_ORDER = ['default', 'common', 'rare', 'epic', 'legendary'];

export const itemsForSlot = (slot) =>
  catalog.items.filter((item) => item.slot === slot).sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));

export const skinKey = (id) => (id || '').split('.')[1] || '';
export const cosmeticsOf = (seat) => ({ ...DEFAULT_COSMETICS, ...(seat?.cosmetics || {}) });
