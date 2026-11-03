const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDb } = require('./db');
const { parseNote, composeNotes, splitMessage, listNotes, postPatchNotes, FOOTER } = require('./patchnotes');

const tmpDir = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-'));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
};

const okFetch = (calls) => async (url, init) => {
  calls.push({ url, body: JSON.parse(init.body) });
  return { ok: true, status: 204 };
};

test('a single note keeps its title and intro and gets the bug footer', () => {
  const text = composeNotes([parseNote('# Patch Notes: Painter\n\nNew pack.\n\n**Cosmetics**\n- Painter Pack\n')]);
  assert.equal(text, `# Patch Notes: Painter\n\nNew pack.\n\n**Cosmetics**\n- Painter Pack\n\n${FOOTER}`);
});

test('several notes merge into one post with sections combined', () => {
  const text = composeNotes([
    parseNote('# A\n\nIntro A\n\n**Gameplay**\n- one\n\n**Packs** (optional)\n- pack'),
    parseNote('# B\n\n**gameplay**\n- two\n- one\n\n**Fixes**\n- fix'),
  ]);
  assert.equal(text, `# Patch Notes\n\n**Gameplay**\n- one\n- two\n\n**Packs** (optional)\n- pack\n\n**Fixes**\n- fix\n\n${FOOTER}`);
});

test('bold words inside bullets stay bullets', () => {
  assert.deepEqual(parseNote('**Gameplay**\n- **Blitz** mode').sections, [{ name: 'Gameplay', suffix: '', items: ['- **Blitz** mode'] }]);
});

test('long posts split on section boundaries under the Discord limit', () => {
  const parts = splitMessage(['# T', 'a'.repeat(1500), 'b'.repeat(1500)].join('\n\n'));
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => p.length <= 2000));
  assert.equal(parts[1], 'b'.repeat(1500));
});

test('posts unposted notes once and remembers them', async () => {
  const db = openDb(':memory:');
  const dir = tmpDir({ '2026-11-01-a.md': '# A\n\n**Gameplay**\n- one', 'readme.txt': 'ignored' });
  const calls = [];
  assert.deepEqual(await postPatchNotes(db, { webhookUrl: 'https://hook', dir, fetchImpl: okFetch(calls) }), ['2026-11-01-a.md']);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.allowed_mentions, { parse: [] });
  assert.deepEqual(await postPatchNotes(db, { webhookUrl: 'https://hook', dir, fetchImpl: okFetch(calls) }), []);
  fs.writeFileSync(path.join(dir, '2026-11-02-b.md'), '# B\n\n**Fixes**\n- fix');
  assert.deepEqual(await postPatchNotes(db, { webhookUrl: 'https://hook', dir, fetchImpl: okFetch(calls) }), ['2026-11-02-b.md']);
  assert.match(calls[1].body.content, /^# B/);
});

test('without a webhook or after a failed post nothing is marked posted', async () => {
  const db = openDb(':memory:');
  const dir = tmpDir({ 'a.md': '# A\n\n**Fixes**\n- fix' });
  assert.deepEqual(await postPatchNotes(db, { webhookUrl: '', dir }), []);
  await assert.rejects(postPatchNotes(db, { webhookUrl: 'https://hook', dir, fetchImpl: async () => ({ ok: false, status: 500 }) }));
  const calls = [];
  assert.deepEqual(await postPatchNotes(db, { webhookUrl: 'https://hook', dir, fetchImpl: okFetch(calls) }), ['a.md']);
});

test('the real patch notes parse and fit in one post', () => {
  const dir = path.join(__dirname, '..', 'patch-notes');
  for (const file of listNotes(dir)) {
    const note = parseNote(fs.readFileSync(path.join(dir, file), 'utf8'));
    assert.ok(note.title, `${file} has a # title`);
    assert.ok(note.sections.length, `${file} has **sections**`);
    assert.equal(splitMessage(composeNotes([note])).length, 1, `${file} fits in 2000 chars`);
  }
});
