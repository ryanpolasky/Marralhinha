const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'patch-notes');
const META_KEY = 'patch_notes_posted';
const LIMIT = 2000;
const FOOTER = '-# Spotted a bug? Post in `#bugs-and-suggestions` or use the in-game report button.';

function parseNote(text) {
  const note = { title: null, intro: [], sections: [] };
  let section = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const title = line.match(/^#\s+(.+)/);
    const heading = line.match(/^\*\*([^*]+)\*\*(.*)$/);
    if (title && !note.title) note.title = title[1].trim();
    else if (heading && !line.startsWith('- ')) note.sections.push(section = { name: heading[1].trim(), suffix: heading[2], items: [] });
    else if (section) section.items.push(line);
    else note.intro.push(line);
  }
  return note;
}

function composeNotes(notes) {
  if (!notes.length) return '';
  const merged = [];
  for (const note of notes) {
    for (const { name, suffix, items } of note.sections) {
      const into = merged.find((s) => s.name.toLowerCase() === name.toLowerCase());
      if (into) into.items.push(...items.filter((item) => !into.items.includes(item)));
      else merged.push({ name, suffix, items: [...items] });
    }
  }
  const single = notes.length === 1 ? notes[0] : null;
  const blocks = [`# ${single?.title || 'Patch Notes'}`];
  if (single?.intro.length) blocks.push(single.intro.join('\n'));
  for (const { name, suffix, items } of merged) blocks.push([`**${name}**${suffix}`, ...items].join('\n'));
  blocks.push(FOOTER);
  return blocks.join('\n\n');
}

function splitMessage(text, limit = LIMIT) {
  const messages = [];
  let current = '';
  for (const block of text.split('\n\n')) {
    const next = current ? `${current}\n\n${block}` : block;
    if (next.length <= limit) current = next;
    else {
      if (current) messages.push(current);
      current = block.length <= limit ? block : block.slice(0, limit);
    }
  }
  if (current) messages.push(current);
  return messages;
}

const listNotes = (dir = DIR) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : []);

async function postPatchNotes(db, { webhookUrl = process.env.DISCORD_PATCH_NOTES_WEBHOOK_URL || '', dir = DIR, fetchImpl = fetch } = {}) {
  const files = listNotes(dir);
  const posted = JSON.parse(db.prepare('SELECT value FROM meta WHERE key = ?').get(META_KEY)?.value || '[]');
  const pending = files.filter((f) => !posted.includes(f));
  if (!pending.length || !webhookUrl) return [];
  const text = composeNotes(pending.map((f) => parseNote(fs.readFileSync(path.join(dir, f), 'utf8'))));
  for (const content of splitMessage(text)) {
    const res = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
    if (!res.ok) throw new Error(`Patch notes webhook failed (${res.status})`);
  }
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(META_KEY, JSON.stringify([...posted, ...pending]));
  return pending;
}

module.exports = { parseNote, composeNotes, splitMessage, listNotes, postPatchNotes, FOOTER };
