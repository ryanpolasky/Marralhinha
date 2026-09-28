import catalog from '../shared/cosmetics.json';

export { catalog };
export const CURRENCY = catalog.currency;
export const RARITIES = catalog.rarities;
export const TAGS = catalog.tags;
export const TAG_KEYS = Object.keys(catalog.tags);
export const SLOTS = catalog.slots;
export const SLOT_KEYS = Object.keys(catalog.slots);
export const ITEMS = Object.fromEntries(catalog.items.map((item) => [item.id, item]));
export const BOXES = catalog.boxes;
export const DEFAULT_COSMETICS = Object.fromEntries(SLOT_KEYS.map((slot) => [slot, catalog.slots[slot].default]));
export const RARITY_ORDER = ['default', 'common', 'rare', 'epic', 'legendary', 'exclusive'];
export const DROPPABLE = catalog.items.filter((item) => item.rarity !== 'default' && !item.tag);

export const itemsForSlot = (slot) =>
  catalog.items.filter((item) => item.slot === slot).sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));

// Tag-exclusive items borrow their tag's color and label ("Dev exclusive") instead of the generic rarity
export const rarityOf = (item) => {
  const base = RARITIES[item.rarity];
  if (!item.tag) return base;
  const tag = TAGS[item.tag];
  return { ...base, label: `${tag.label} exclusive`, short: tag.label, color: tag.color };
};

// Whether a profile (with `inventory` and `tags`) can use an item
export const canUse = (account, itemId) => {
  const item = ITEMS[itemId];
  if (!item) return false;
  if (item.rarity === 'default') return true;
  if (item.tag) return (account.tags || []).includes(item.tag);
  return account.inventory.includes(itemId);
};

// Items that count towards "collected": everything obtainable, plus exclusives you actually have access to
export const collectible = (account) => catalog.items.filter((item) => !item.tag || (account.tags || []).includes(item.tag));

export const skinKey = (id) => (id || '').split('.')[1] || '';
export const cosmeticsOf = (seat) => ({ ...DEFAULT_COSMETICS, ...(seat?.cosmetics || {}) });
