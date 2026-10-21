// webpack only emits preload hints for chunks loaded from other async chunks, so the table's chunks
// (the lazy Scene import) get their <link rel="preload"> tags stamped into build/index.html here
const fs = require('fs');
const path = require('path');

const build = path.join(__dirname, '..', 'build');
const jsDir = path.join(build, 'static', 'js');
const main = fs.readdirSync(jsDir).find((f) => /^main\.[0-9a-f]+\.js$/.test(f));
const runtime = fs.readFileSync(path.join(jsDir, main), 'utf8');

const hashes = Object.fromEntries([...runtime.matchAll(/(\d+):"([0-9a-f]+)"/g)].map(([, id, hash]) => [id, hash]));
const fileOf = (id) => `/static/js/${id}.${hashes[id]}.chunk.js`;
const groups = [...runtime.matchAll(/Promise\.all\(\[((?:\w+\.e\(\d+\),?)+)\]\)/g)].map(([, list]) => [...list.matchAll(/\.e\((\d+)\)/g)].map(([, id]) => id));
const size = (id) => fs.statSync(path.join(build, fileOf(id))).size;
const scene = groups.sort((a, b) => b.reduce((s, id) => s + size(id), 0) - a.reduce((s, id) => s + size(id), 0))[0];
if (!scene) throw new Error('no multi-chunk import found in the main bundle');

const indexPath = path.join(build, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
const links = scene.map((id) => `<link rel="preload" as="script" href="${fileOf(id)}">`).join('');
fs.writeFileSync(indexPath, html.replace(/<script defer="defer" src="\/static\/js\/main\.[0-9a-f]+\.js">/, (tag) => links + tag));
console.log(`Preloading ${scene.map(fileOf).join(', ')}`);
