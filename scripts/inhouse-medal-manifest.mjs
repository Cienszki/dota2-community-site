#!/usr/bin/env node
// Which medal artwork is present, and which is still missing.
//
// The catalogue is the source of truth for the filenames, so this cannot drift
// from it — add a medal and it shows up here as missing until the file lands.
//
//   node scripts/inhouse-medal-manifest.mjs

import fs from 'node:fs';

const src = fs.readFileSync('src/lib/inhouse/medal-catalogue.ts', 'utf8');
const ids = [...src.matchAll(/\{ id: '([^']+)', label: '([^']+)'/g)].map((m) => ({
  id: m[1],
  label: m[2],
}));

const dir = 'public/images/medals';
const present = new Set(
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, '')) : [],
);

const missing = ids.filter((m) => !present.has(m.id));
const found = ids.filter((m) => present.has(m.id));

console.log(`\n${found.length}/${ids.length} medal images present\n`);
if (missing.length) {
  console.log('Missing — save each as public/images/medals/<id>.png:\n');
  for (const m of missing) console.log(`  ${m.id.padEnd(30)} ${m.label}`);
  console.log('');
}
const extra = [...present].filter((f) => !ids.some((m) => m.id === f));
if (extra.length) console.log(`Not in the catalogue: ${extra.join(', ')}\n`);
