// Convert Overture Maps places (businesses/POIs) into game-ready signage data.
//
// Regenerate the input with:
//   overturemaps download --bbox=-80.96,26.72,-80.88,26.78 -f geojson \
//     --type=place -o data-src/clewiston-places.geojson
// Then: node scripts/process-places.mjs
//
// Output: public/data/places.json — merged with the OSM POIs already in
// clewiston.json (OSM wins on name collisions; it's usually better curated).

import { readFileSync, writeFileSync } from 'node:fs';

const MIN_CONFIDENCE = 0.65;
// Recurring events can be geocoded to their host address even though they are
// not permanent venues and should not become year-round building signage.
const NON_PLACE_NAMES = new Set([
  'clewistonsugarfestival',
]);

const LAT0 = 26.754, LON0 = -80.9335;
const M_PER_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const project = ([lon, lat]) => [
  Math.round((lon - LON0) * M_PER_LON * 100) / 100,
  Math.round(-(lat - LAT0) * 110540 * 100) / 100,
];

const game = JSON.parse(readFileSync(new URL('../public/data/clewiston.json', import.meta.url), 'utf8'));
const overture = JSON.parse(readFileSync(new URL('../data-src/clewiston-places.geojson', import.meta.url), 'utf8'));

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const seen = new Set();
const out = [];

// OSM POIs first — better curated names.
for (const poi of game.pois) {
  out.push({ name: poi.name, kind: poi.kind, pos: poi.pos, source: 'osm' });
  seen.add(norm(poi.name));
}

let added = 0, skippedConf = 0, skippedDup = 0, skippedNonPlace = 0;
for (const f of overture.features) {
  const p = f.properties || {};
  const name = p.names?.primary;
  const conf = p.confidence ?? 0;
  if (!name || conf < MIN_CONFIDENCE) { skippedConf++; continue; }
  const n = norm(name);
  if (NON_PLACE_NAMES.has(n)) { skippedNonPlace++; continue; }
  if (seen.has(n)) { skippedDup++; continue; }
  seen.add(n);
  out.push({
    name,
    kind: p.categories?.primary ?? 'place',
    pos: project(f.geometry.coordinates),
    source: 'overture',
    confidence: Math.round(conf * 100) / 100,
  });
  added++;
}

writeFileSync(new URL('../public/data/places.json', import.meta.url), JSON.stringify(out));
console.log(`places: ${out.length} total (${game.pois.length} OSM + ${added} Overture; skipped ${skippedConf} low-confidence, ${skippedDup} duplicates, ${skippedNonPlace} non-places)`);
