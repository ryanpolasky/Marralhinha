const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { markdownToHtml } = require('./legal');

test('renders the Markdown the legal docs use', () => {
  const html = markdownToHtml('# Title\n**Bold**\nSecond line\n\n## Section\n- one [link](https://example.com)\n- two `code`\n\nSee the [Privacy Policy](PRIVACY.md).');
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<p><strong>Bold<\/strong><br>Second line<\/p>/);
  assert.match(html, /<h2>Section<\/h2>/);
  assert.match(html, /<ul><li>one <a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">link<\/a><\/li><li>two <code>code<\/code><\/li><\/ul>/);
  assert.match(html, /<a href="\/privacy">Privacy Policy<\/a>/);
});

test('escapes HTML so the docs cannot inject markup', () => {
  assert.equal(markdownToHtml('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
});

test('both real legal docs render with their headings', () => {
  for (const file of ['TERMS.md', 'PRIVACY.md']) {
    const html = markdownToHtml(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
    assert.match(html, /<h1>/);
    assert.ok((html.match(/<h2>/g) || []).length >= 5, `${file} has its sections`);
  }
});
