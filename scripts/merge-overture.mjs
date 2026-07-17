// Merge Overture Maps building footprints into the game data.
//
// OSM (via fetch-osm.mjs) has good names/types but covers only ~1/3 of
// Clewiston's buildings. Overture conflates OSM with Microsoft's ML-extracted
// footprints, so buildings sourced from "Microsoft ML Buildings" are exactly
// the ones OSM is missing. We add those and keep our OSM set untouched.
//
// Regenerate the input with:
//   pip install overturemaps
//   overturemaps download --bbox=-80.96,26.72,-80.88,26.78 -f geojson \
//     --type=building -o data-src/clewiston-overture.geojson
// Then: node scripts/merge-overture.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const GAME_DATA = new URL('../public/data/clewiston.json', import.meta.url);
const OVERTURE = new URL('../data-src/clewiston-overture.geojson', import.meta.url);

const LAT0 = 26.754, LON0 = -80.9335;
const M_PER_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const M_PER_LAT = 110540;
const project = ([lon, lat]) => [
  Math.round((lon - LON0) * M_PER_LON * 100) / 100,
  Math.round(-(lat - LAT0) * M_PER_LAT * 100) / 100,
];

const SUBTYPE_TO_TYPE = {
  residential: 'house',
  commercial: 'commercial',
  industrial: 'industrial',
  education: 'school',
  religious: 'church',
  civic: 'civic',
  medical: 'civic',
  outbuilding: 'shed',
  agricultural: 'barn',
};

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return Math.abs(a / 2);
}

const game = JSON.parse(readFileSync(GAME_DATA, 'utf8'));
const overture = JSON.parse(readFileSync(OVERTURE, 'utf8'));

// Merged Overture buildings get negative ids; drop any from a previous run
// so the script is idempotent.
const osmBuildings = game.buildings
  .filter((b) => b.id > 0)
  .map((b) => ({ ...b, sourceId: b.sourceId ?? `osm:way/${b.id}` }));

// Coarse spatial index of existing OSM buildings for the safety overlap check.
const CELL = 50;
const grid = new Map();
for (const b of osmBuildings) {
  for (const [x, z] of b.poly) {
    grid.set(`${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`, true);
  }
}
const nearOsm = (x, z) => grid.has(`${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`);

let added = 0, skippedOsm = 0, skippedDup = 0, skippedTiny = 0, mlHeights = 0;
const newBuildings = [];

for (const f of overture.features) {
  const p = f.properties || {};
  const sources = p.sources || [];
  // Anything with an OSM source (even partially) is already in our OSM set.
  if (sources.some((s) => s.dataset === 'OpenStreetMap')) {
    skippedOsm++;
    continue;
  }
  let rings;
  if (f.geometry.type === 'Polygon') rings = [f.geometry.coordinates[0]];
  else if (f.geometry.type === 'MultiPolygon') rings = f.geometry.coordinates.map((c) => c[0]);
  else continue;

  for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
    const ring = rings[ringIndex];
    let poly = ring.map(project);
    // GeoJSON rings repeat the closing point; the game format does not.
    if (poly.length > 1 && poly[0][0] === poly[poly.length - 1][0] && poly[0][1] === poly[poly.length - 1][1]) {
      poly = poly.slice(0, -1);
    }
    if (poly.length < 3) continue;
    const area = polyArea(poly);
    if (area < 8) { skippedTiny++; continue; }

    // Safety net in case Overture's conflation missed an overlap: skip if the
    // centroid lands inside an existing OSM footprint.
    let cx = 0, cz = 0;
    for (const [x, z] of poly) { cx += x; cz += z; }
    cx /= poly.length; cz /= poly.length;
    if (nearOsm(cx, cz)) {
      const hit = osmBuildings.some((b) => pointInPoly(cx, cz, b.poly));
      if (hit) { skippedDup++; continue; }
    }

    const id = -(1_000_000 + added);
    let height = typeof p.height === 'number' ? p.height : null;
    if (height) {
      height = Math.max(2.6, Math.min(14, height));
      mlHeights++;
    } else {
      const fract = Math.abs(id * 0.6180339887) % 1;
      height = 4 * (0.9 + 0.2 * fract);
    }
    const type = SUBTYPE_TO_TYPE[p.subtype] || (area < 45 ? 'shed' : 'yes');
    const sourceId = `overture:${f.id}${rings.length > 1 ? `#${ringIndex}` : ''}`;
    const building = {
      id,
      sourceId,
      poly,
      height: Math.round(height * 100) / 100,
      type,
    };
    // Preserve the appearance fields supported by Overture even when this
    // particular extract contains few of them. Future data refreshes can then
    // improve the town without changing the runtime schema.
    if (typeof p.num_floors === 'number') building.numFloors = p.num_floors;
    if (p.facade_color) building.facadeColor = p.facade_color;
    if (p.facade_material) building.facadeMaterial = p.facade_material;
    if (p.roof_color) building.roofColor = p.roof_color;
    if (p.roof_material) building.roofMaterial = p.roof_material;
    if (p.roof_shape) building.roofShape = p.roof_shape;
    newBuildings.push(building);
    added++;
  }
}

game.buildings = [...osmBuildings, ...newBuildings];
writeFileSync(GAME_DATA, JSON.stringify(game));

console.log(`OSM buildings kept:        ${osmBuildings.length}`);
console.log(`Overture(ML) added:        ${added}`);
console.log(`  skipped (OSM-sourced):   ${skippedOsm}`);
console.log(`  skipped (overlap OSM):   ${skippedDup}`);
console.log(`  skipped (tiny <8m²):     ${skippedTiny}`);
console.log(`Total buildings:           ${game.buildings.length}`);
console.log(`New buildings w/ ML height: ${mlHeights}`);
