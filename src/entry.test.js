import fs from 'fs';
import path from 'path';

const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
const HEAVY = /^(three|@react-three)(\/|$)/;

const resolve = (from, spec) => {
  const base = path.resolve(path.dirname(from), spec);
  return [base, `${base}.js`, path.join(base, 'index.js')].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
};

// Follows static imports only, which is exactly what webpack puts in the entry chunk
function heavyImports(entry) {
  const seen = new Set();
  const found = [];
  const walk = (file) => {
    if (seen.has(file) || !file.endsWith('.js')) return;
    seen.add(file);
    for (const [, a, b] of fs.readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const spec = a || b;
      if (HEAVY.test(spec)) found.push(`${path.relative(__dirname, file)} -> ${spec}`);
      else if (spec.startsWith('.')) {
        const next = resolve(file, spec);
        if (next) walk(next);
      }
    }
  };
  walk(entry);
  return found;
}

test('the entry chunk never pulls in three.js', () => {
  expect(heavyImports(path.join(__dirname, 'App.js'))).toEqual([]);
});
