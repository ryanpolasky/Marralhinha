const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('./db');
const { Accounts, AccountError } = require('./accounts');
const { nameBlocked } = require('./namefilter');

const BLOCKED = [
  'nigger', 'NIGGER', 'N1gg3r', 'n i g g e r', 'níggèr', 'niiiiggerrr', 'n!gga', 'NiBBa', 'kneeGrow', 'SandNigger', 'Niglet',
  'niggrpants', 'niggr', 'N1ggz', 'nigg',
  'fag', 'f4g', 'f.a.g.', 'faggot', 'FAGGOT', 'f a g g o t', 'kike', 'chink', 'gook', 'wop', 'wetback', 'beaner',
  'tranny', 'retard', 'shemale', 'porchmonkey', 'towelhead', 'raghead', 'pajeet', 'jigaboo', 'pickaninny',
  'tarbaby', 'redskin', 'chingchong', 'cameljockey', 'golliwog', 'zipperhead', 'injun',
  'nazi', 'nazis', 'n.a.z.i', 'hitler', 'mussolini', 'swastika', 'klan', 'taliban',
  'paneleiro', 'maricas', 'panasca', 'maricon', 'sudaca', 'traveco', 'viadinho',
  'jap', 'j.a.p', 'spic', 's p i c', 'spics', 'spick', 'coon', 'c-o-o-n', 'coons', 'sambo', 'dago', 'honky',
  'kkk', 'k.k.k', 'k k k', 'paki', 'kraut', 'heeb', 'squaw', 'fenian', 'dyke', 'bicha', 'viado', 'nig', 'wog',
  'pikey', 'gyp', 'lesbo',
];

const ALLOWED = [
  'Nigeria', 'Niger', 'Nigel', 'Enigma', 'Japan', 'Japanese', 'Spicy', 'Spice', 'SpickAndSpan', 'Jape',
  'MaineCoon', 'Cocoon', 'Coonhound', 'Dagobah', 'HonkyTonk', 'HeebieJeebies', 'Krautrock', 'Pakistan',
  'Pakistani', 'Pollywog', 'Viaduto', 'Bichano', 'VanDyke', 'Lesbos', 'Egypt', 'Gypsy', 'Sambodhi', 'Spikey',
  'SquawkBox', 'kkkk', 'kkkkk', 'KkkkZueiro', 'Macaco', 'Negro', 'Gay', 'Lesbian', 'DarkLord', 'Mick',
  'Whopping', 'Fagundes', 'Fagote', 'Nazir', 'NazirKhan', 'Cunt', 'Merda', 'Puta', 'Player', 'Captain Marble', 'Grandma Noodle',
];

test('slurs are blocked even through leetspeak, accents, spacing and repeats', () => {
  for (const name of BLOCKED) assert.equal(nameBlocked(name), true, `blocked: ${name}`);
});

test('ordinary names and words containing lookalike pieces are allowed', () => {
  for (const name of ALLOWED) assert.equal(nameBlocked(name), false, `allowed: ${name}`);
});

test('blocked names cannot reach the profile through rename, guests or Discord', () => {
  const accounts = new Accounts(openDb(':memory:'));
  const { id } = accounts.createUser({ name: 'Ryan' });
  accounts.rename(id, 'Marble Ryan');
  assert.equal(accounts.getUser(id).name, 'Marble Ryan');
  assert.throws(() => accounts.rename(id, 'faggot'), AccountError);
  assert.equal(accounts.getUser(id).name, 'Marble Ryan', 'a rejected rename keeps the old name');
  assert.equal(accounts.createUser({ name: 'n1gg3r' }).name, 'Player');
  assert.equal(accounts.loginDiscord({ id: 'd1', username: 'Paki' }).name, 'Player');
  assert.equal(accounts.loginDiscord({ id: 'd2', username: 'Spicy' }).name, 'Spicy');
});
