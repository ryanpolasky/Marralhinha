const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MEDIA = path.join(ROOT, 'build', 'static', 'media');
const LOGO_COLORS = ['#e03a3e', '#2f7de1', '#f4b400', '#2e9e55'];

function logoFontUrl() {
  try {
    const file = fs.readdirSync(MEDIA).find((name) => /^fredoka-latin-700-normal\.[a-f0-9]+\.woff2$/.test(name));
    return file ? `/static/media/${file}` : null;
  } catch {
    return null;
  }
}
const SITE = 'https://marralhinha.app';
const PAGES = {
  '/how-to-play': { file: 'RULES.md', title: 'How to Play Marralhinha', description: 'Learn the rules of Marralhinha, the traditional marble board game from Terceira, Açores: leaving your dish, capturing, the center shortcut, the home stretch, Blitz, 2v2 teams, and pass and play.' },
  '/terms': { file: 'TERMS.md', title: 'Terms of Service', description: 'The terms of service for Marralhinha Online, the free marble board game from the Azores.' },
  '/privacy': { file: 'PRIVACY.md', title: 'Privacy Policy', description: 'What Marralhinha Online collects, why, and what you can do about it. No ads and no trackers.' },
};
const DOC_LINKS = Object.fromEntries(Object.entries(PAGES).map(([route, page]) => [page.file, route]));

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      const url = DOC_LINKS[href] || href;
      const external = /^https?:/.test(url);
      return `<a href="${url}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
    });
}

// Only the handful of Markdown features the legal docs use: headings, paragraphs, lists, bold, code and links
function markdownToHtml(markdown) {
  const out = [];
  let paragraph = [];
  let list = null;
  const flush = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    if (list) out.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
    paragraph = [];
    list = null;
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (!line) flush();
    else if (heading) {
      flush();
      out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    } else if (line.startsWith('- ')) {
      if (paragraph.length) flush();
      list = list || [];
      list.push(line.slice(2));
    } else {
      if (list) flush();
      paragraph.push(line);
    }
  }
  flush();
  return out.join('\n');
}

const logo = [...'Marralhinha!'].map((ch, i) => `<span style="--c:${LOGO_COLORS[i % 4]};--d:${(i * 0.07).toFixed(2)}s">${ch}</span>`).join('');

const jsonLd = (route, title, description) => ({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebPage', '@id': `${SITE}${route}#page`, url: `${SITE}${route}`, name: title, description, inLanguage: 'en', isPartOf: { '@id': `${SITE}/#website` }, about: { '@id': `${SITE}/#game` }, author: { '@id': `${SITE}/#author` } },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Marralhinha Online', item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: title, item: `${SITE}${route}` }] },
  ],
});

const page = (route, title, description, body, links, fontUrl) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#0b1f24" />
<title>${title} - Marralhinha Online</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${SITE}${route}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Marralhinha Online" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${SITE}${route}" />
<meta property="og:image" content="${SITE}/og-image.jpg" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${SITE}/og-image.jpg" />
<script type="application/ld+json">${JSON.stringify(jsonLd(route, title, description)).replace(/</g, '\\u003c')}</script>
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" href="/icon.svg" type="image/svg+xml" />
<style>
  ${fontUrl ? `@font-face { font-family: 'Fredoka'; font-style: normal; font-weight: 700; font-display: swap; src: url(${fontUrl}) format('woff2'); }` : ''}
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: radial-gradient(ellipse at 50% 0%, #1f5a4f 0%, #0b1f24 60%) fixed; color: #fff6e8; font: 17px/1.65 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  header, main, footer { width: min(760px, 100% - 32px); margin: 0 auto; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 22px 0; }
  .logo { margin: 0; font-family: 'Fredoka', 'Trebuchet MS', system-ui, sans-serif; font-size: clamp(40px, 9vw, 56px); font-weight: 700; letter-spacing: -0.01em; line-height: 1; text-decoration: none; }
  .logo span { display: inline-block; color: var(--c); text-shadow: 0 3px 0 rgba(0, 0, 0, 0.35), 0 0 24px color-mix(in srgb, var(--c) 45%, transparent); animation: letter-bounce 2.8s ease-in-out infinite; animation-delay: var(--d); }
  @keyframes letter-bounce { 0%, 70%, 100% { transform: translateY(0); } 80% { transform: translateY(-8px); } }
  h1, h2, h3, .play { font-family: 'Fredoka', 'Trebuchet MS', system-ui, sans-serif; }
  .play { padding: 9px 18px; border-radius: 12px; background: #ff8a3d; color: #1b1208; font-weight: 700; text-decoration: none; box-shadow: 0 4px 0 #b3561a; }
  main { padding: 34px clamp(20px, 5vw, 48px); border-radius: 22px; background: rgba(8, 20, 24, 0.82); border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35); }
  h1 { margin: 0 0 6px; font-size: clamp(30px, 5vw, 40px); line-height: 1.15; color: #ffd166; }
  h1 + p { margin-top: 0; color: #b9cbc7; }
  h2 { margin: 34px 0 8px; font-size: 22px; color: #ffd166; }
  h3 { margin: 22px 0 6px; font-size: 18px; }
  p, ul { margin: 0 0 14px; }
  ul { padding-left: 22px; }
  li { margin-bottom: 6px; }
  li::marker { color: #ffd166; }
  a { color: #8cd6ff; }
  code { padding: 1px 6px; border-radius: 6px; background: rgba(255, 255, 255, 0.08); font-size: 0.92em; }
  strong { color: #fff; }
  footer { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 18px; padding: 26px 0 40px; color: #b9cbc7; font-size: 14px; }
  footer a { color: #b9cbc7; }
  ::-webkit-scrollbar { width: 12px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background-color: rgba(255, 209, 102, 0.35); background-clip: padding-box; border: 3px solid transparent; border-radius: 99px; }
  @supports not selector(::-webkit-scrollbar) { html { scrollbar-width: thin; scrollbar-color: rgba(255, 209, 102, 0.45) transparent; } }
</style>
</head>
<body>
<header>
  <a class="logo" href="/" aria-label="Marralhinha home">${logo}</a>
  <a class="play" href="/">Play</a>
</header>
<main>
${body}
</main>
<footer>
  <a href="/">Back to the game</a>
  ${links}
  <span>Made with ♥ by Ryan Polasky</span>
</footer>
</body>
</html>`;

function legalRoutes(app) {
  Object.entries(PAGES).forEach(([route, { file, title, description }]) => {
    const links = Object.entries(PAGES).filter(([r]) => r !== route).map(([r, p]) => `<a href="${r}">${p.title}</a>`).join('');
    app.get(route, (req, res, next) => {
      fs.readFile(path.join(ROOT, file), 'utf8', (err, markdown) => {
        if (err) return next();
        res.type('html').set('Cache-Control', 'public, max-age=300').send(page(route, title, description, markdownToHtml(markdown), links, logoFontUrl()));
      });
    });
  });
}

module.exports = { legalRoutes, markdownToHtml };
