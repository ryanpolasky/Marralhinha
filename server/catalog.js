const catalog = require('../src/shared/cosmetics.json');

const ITEMS = new Map(catalog.items.map((item) => [item.id, item]));
const BOXES = new Map(catalog.boxes.map((box) => [box.id, box]));
const SLOTS = Object.keys(catalog.slots);
const DEFAULTS = Object.fromEntries(SLOTS.map((slot) => [slot, catalog.slots[slot].default]));
const TAGS = catalog.tags;
const TAG_KEYS = Object.keys(TAGS);
const ADMIN_TAGS = TAG_KEYS.filter((key) => TAGS[key].admin);
// Tags the server hands out on its own (e.g. Luckiest); never stored or toggled by admins
const AUTO_TAGS = TAG_KEYS.filter((key) => TAGS[key].auto);
// Tag-exclusive items never drop from boxes or show up in the featured shop
const DROPPABLE = catalog.items.filter((item) => item.rarity !== 'default' && !item.tag);
const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic'];

const itemsOfRarity = (rarity) => DROPPABLE.filter((item) => item.rarity === rarity);

module.exports = { catalog, ITEMS, BOXES, SLOTS, DEFAULTS, TAGS, TAG_KEYS, ADMIN_TAGS, AUTO_TAGS, DROPPABLE, RARITY_ORDER, itemsOfRarity, REWARDS: catalog.rewards };
