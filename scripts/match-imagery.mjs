// Match Mapillary frames to building footprints.
//
// Each frame has a camera position (game x/z) and a compass heading
// (degrees, 0 = north). We cast a ray from the camera along the heading and
// take the first building footprint edge it hits within MAX_DIST meters.
// Output: data-src/imagery/matches.json  { buildingId: [frames...] } sorted
// by distance, so the closest/clearest frames come first.
//
// Usage: node scripts/match-imagery.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const MAX_DIST = 80;

const game = JSON.parse(readFileSync(new URL('../public/data/clewiston.json', import.meta.url), 'utf8'));
const index = JSON.parse(readFileSync(new URL('../data-src/imagery/mapillary/index.json', import.meta.url), 'utf8'));

// Ray (px,pz)+(dx,dz)t vs segment (ax,az)-(bx,bz); returns t or null.
function raySegment(px, pz, dx, dz, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az;
  const denom = dx * ez - dz * ex;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((ax - px) * ez - (az - pz) * ex) / denom;
  const u = ((ax - px) * dz - (az - pz) * dx) / -denom;
  if (t > 0.5 && u >= 0 && u <= 1) return t;
  return null;
}

const matches = new Map();
let unmatched = 0;

for (const frame of index) {
  // Compass: 0 = north = -z in game space, 90 = east = +x.
  const rad = (frame.compass * Math.PI) / 180;
  const dx = Math.sin(rad), dz = -Math.cos(rad);
  let best = null;
  for (const b of game.buildings) {
    // Cheap reject: centroid too far.
    const c = b.poly[0];
    if ((c[0] - frame.x) ** 2 + (c[1] - frame.z) ** 2 > (MAX_DIST + 120) ** 2) continue;
    for (let i = 0; i < b.poly.length; i++) {
      const j = (i + 1) % b.poly.length;
      const t = raySegment(frame.x, frame.z, dx, dz, b.poly[i][0], b.poly[i][1], b.poly[j][0], b.poly[j][1]);
      if (t !== null && t <= MAX_DIST && (!best || t < best.t)) {
        best = { t, id: b.id, type: b.type, name: b.name };
      }
    }
  }
  if (!best) { unmatched++; continue; }
  if (!matches.has(best.id)) matches.set(best.id, { name: best.name ?? null, type: best.type, frames: [] });
  matches.get(best.id).frames.push({
    file: frame.file,
    dist: Math.round(best.t * 10) / 10,
    cameraAt: [frame.x, frame.z],
    heading: Math.round(frame.compass),
  });
}

const out = {};
for (const [id, m] of matches) {
  m.frames.sort((a, b) => a.dist - b.dist);
  out[id] = m;
}
writeFileSync(new URL('../data-src/imagery/matches.json', import.meta.url), JSON.stringify(out, null, 2));

const ranked = [...matches.entries()].sort((a, b) => b[1].frames.length - a[1].frames.length);
console.log(`${index.length} frames -> ${matches.size} buildings matched, ${unmatched} unmatched`);
for (const [id, m] of ranked.slice(0, 20)) {
  console.log(`  ${id} (${m.name ?? m.type}): ${m.frames.length} frames, nearest ${m.frames[0].dist}m [${m.frames[0].file}]`);
}
