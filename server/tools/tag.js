#!/usr/bin/env node
// Grant or remove a tag from the command line, handy for bootstrapping the first Dev account.
//   npm run tag -- <user id | discord id | name> dev
//   npm run tag -- <user id | discord id | name> beta --remove
//   npm run tag -- --list
const { openDb } = require('../db');
const { Accounts } = require('../accounts');
const { TAG_KEYS } = require('../catalog');

const args = process.argv.slice(2);
const db = openDb();
const accounts = new Accounts(db);

if (args.includes('--list')) {
  const users = accounts.search('#tagged', 200);
  if (!users.length) console.log('Nobody has a tag yet.');
  for (const u of users) console.log(`${u.id}  ${u.name.padEnd(16)}  ${accounts.tags(u).join(', ')}`);
  process.exit(0);
}

const [query, tag] = args;
const remove = args.includes('--remove');
if (!query || !TAG_KEYS.includes(tag)) {
  console.error(`Usage: npm run tag -- <user id | discord id | name> <${TAG_KEYS.join('|')}> [--remove]\n       npm run tag -- --list`);
  process.exit(1);
}

const matches = accounts.search(query, 10);
const exact = matches.filter((u) => u.id === query || u.discord_id === query || u.name.toLowerCase() === query.toLowerCase());
const user = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null;
if (!user) {
  console.error(matches.length ? `Ambiguous, matched ${matches.length} accounts:\n${matches.map((u) => `  ${u.id}  ${u.name}`).join('\n')}\nUse the id instead.` : 'No account matched.');
  process.exit(1);
}

const current = accounts.tags(user);
const next = remove ? current.filter((t) => t !== tag) : [...current, tag];
accounts.setTags(user.id, next);
console.log(`${user.name} (${user.id}) tags: ${accounts.tags(accounts.getUser(user.id)).join(', ') || 'none'}`);
console.log('Have them reload the page and the change shows up.');
