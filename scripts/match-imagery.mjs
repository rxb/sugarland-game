// Associate every usable street-level frame with the plausible building
// facades in its field of view. This intentionally keeps multiple targets per
// image: a street photo normally contains more than the building at its center.
//
// Any directory under data-src/imagery with an index.json can participate.
// Frames need x/z (meters in game coordinates), compass (0=north, 90=east),
// and file. Optional horizontalFov and projection fields improve matching.
//
// Outputs:
//   data-src/imagery/observations.json  source-neutral facade observations
//   data-src/imagery/matches.json       compact backwards-compatible view

// Usage: node scripts/match-imagery.mjs

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../data-src/imagery/', import.meta.url);
const GAME = new URL('../public/data/clewiston.json', import.meta.url);
const MAX_DIST = 110;
const MAX_TARGETS_PER_FRAME = 12;
const DEFAULT_FOV = 90;

const game = JSON.parse(readFileSync(GAME, 'utf8'));

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const round = (n, places = 3) => Number(n.toFixed(places));
const angleDelta = (degrees) => ((degrees + 540) % 360) - 180;
const bearing = (dx, dz) => (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;

function centroid(poly) {
  let x = 0, z = 0;
  for (const p of poly) { x += p[0]; z += p[1]; }
  return [x / poly.length, z / poly.length];
}

function bbox(poly) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) {
    minX = Math.min(minX, x); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxZ = Math.max(maxZ, z);
  }
  return { minX, minZ, maxX, maxZ };
}

// Parameter along segment A->B where it intersects C->D, or null.
function segmentHit(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const denom = rx * sz - rz * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const qx = cx - ax, qz = cz - az;
  const t = (qx * sz - qz * sx) / denom;
  const u = (qx * rz - qz * rx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

const prepared = game.buildings.map((building) => ({
  building,
  center: centroid(building.poly),
  box: bbox(building.poly),
}));

function sampleVisibility(frame, target, edge) {
  let visible = 0;
  for (const along of [0.2, 0.5, 0.8]) {
    const tx = edge.a[0] + (edge.b[0] - edge.a[0]) * along;
    const tz = edge.a[1] + (edge.b[1] - edge.a[1]) * along;
    let blocked = false;
    const rayMinX = Math.min(frame.x, tx), rayMaxX = Math.max(frame.x, tx);
    const rayMinZ = Math.min(frame.z, tz), rayMaxZ = Math.max(frame.z, tz);
    for (const other of prepared) {
      if (other.building.id === target.building.id) continue;
      if (other.box.maxX < rayMinX || other.box.minX > rayMaxX || other.box.maxZ < rayMinZ || other.box.minZ > rayMaxZ) continue;
      const poly = other.building.poly;
      for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length;
        const t = segmentHit(frame.x, frame.z, tx, tz, poly[i][0], poly[i][1], poly[j][0], poly[j][1]);
        if (t !== null && t > 0.01 && t < 0.97) { blocked = true; break; }
      }
      if (blocked) break;
    }
    if (!blocked) visible++;
  }
  return visible / 3;
}

function bestFacade(frame, target, fov) {
  const poly = target.building.poly;
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const vx = mx - frame.x, vz = mz - frame.z;
    const distance = Math.hypot(vx, vz);
    if (distance < 2 || distance > MAX_DIST) continue;

    const relativeAngle = angleDelta(bearing(vx, vz) - frame.compass);
    const endpointAngles = [a, b].map(([x, z]) => angleDelta(bearing(x - frame.x, z - frame.z) - frame.compass));
    const closestAngle = Math.min(Math.abs(relativeAngle), ...endpointAngles.map(Math.abs));
    if (closestAngle > fov / 2 + 4) continue;

    const ex = b[0] - a[0], ez = b[1] - a[1], edgeLength = Math.hypot(ex, ez);
    if (edgeLength < 1) continue;
    // Pick the edge normal that points away from the footprint center.
    let nx = ez / edgeLength, nz = -ex / edgeLength;
    if (nx * (target.center[0] - mx) + nz * (target.center[1] - mz) > 0) { nx *= -1; nz *= -1; }
    const facing = (nx * (frame.x - mx) + nz * (frame.z - mz)) / distance;
    if (facing < 0.12) continue;

    const centrality = fov >= 359 ? 1 : clamp(1 - Math.abs(relativeAngle) / (fov / 2 + 8), 0, 1);
    const proximity = clamp(1 - distance / MAX_DIST, 0, 1);
    const angularWidth = 2 * Math.atan(edgeLength / (2 * distance)) * 180 / Math.PI;
    const size = clamp(angularWidth / 28, 0, 1);
    const preliminary = 0.35 * proximity + 0.25 * centrality + 0.25 * facing + 0.15 * size;
    if (!best || preliminary > best.preliminary) {
      const normalized = endpointAngles.map((angle) => clamp(0.5 + angle / fov, 0, 1)).sort((x, y) => x - y);
      const wraps = fov >= 359 && normalized[1] - normalized[0] > 0.5;
      const horizontal = wraps ? [normalized[1], normalized[0]] : normalized;
      best = {
        edgeIndex: i,
        a,
        b,
        distance,
        bearing: bearing(vx, vz),
        relativeAngle,
        facing,
        angularWidth,
        horizontal,
        wraps,
        preliminary,
      };
    }
  }
  return best;
}

function sourceFrames() {
  const sources = [];
  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const indexUrl = new URL(`${entry.name}/index.json`, ROOT);
    if (!existsSync(indexUrl)) continue;
    const frames = JSON.parse(readFileSync(indexUrl, 'utf8'))
      .filter((f) => Number.isFinite(f.x) && Number.isFinite(f.z) && Number.isFinite(f.compass) && f.file)
      .map((f) => ({ ...f, source: f.source || entry.name, sourceDir: entry.name }));
    if (frames.length) sources.push({ key: entry.name, frames });
  }
  return sources;
}

const sources = sourceFrames();
const observations = {};
const frameSummaries = [];
let usableFrames = 0, unmatchedFrames = 0;

for (const source of sources) {
  for (const frame of source.frames) {
    usableFrames++;
    const fov = frame.projection === 'equirectangular' ? 360 : Number(frame.horizontalFov) || DEFAULT_FOV;
    const candidates = [];
    for (const target of prepared) {
      const dx = target.center[0] - frame.x, dz = target.center[1] - frame.z;
      if (dx * dx + dz * dz > (MAX_DIST + 80) ** 2) continue;
      const facade = bestFacade(frame, target, fov);
      if (facade) candidates.push({ target, facade });
    }
    candidates.sort((a, b) => b.facade.preliminary - a.facade.preliminary);

    let kept = 0;
    for (const candidate of candidates.slice(0, MAX_TARGETS_PER_FRAME * 2)) {
      const visibility = sampleVisibility(frame, candidate.target, candidate.facade);
      const score = candidate.facade.preliminary * (0.35 + 0.65 * visibility);
      if (visibility === 0 || score < 0.16) continue;
      const b = candidate.target.building;
      const key = String(b.id);
      observations[key] ??= {
        buildingId: b.id,
        buildingSourceId: b.sourceId ?? null,
        name: b.name ?? null,
        type: b.type,
        frames: [],
      };
      observations[key].frames.push({
        source: source.key,
        file: frame.file,
        imageId: frame.id ?? null,
        cameraAt: [frame.x, frame.z],
        heading: round(frame.compass, 1),
        horizontalFov: fov,
        facadeEdge: candidate.facade.edgeIndex,
        edge: [candidate.facade.a, candidate.facade.b],
        distance: round(candidate.facade.distance, 1),
        relativeAngle: round(candidate.facade.relativeAngle, 1),
        imageRegion: {
          left: round(candidate.facade.horizontal[0]),
          right: round(candidate.facade.horizontal[1]),
          ...(candidate.facade.wraps ? { wraps: true } : {}),
        },
        facing: round(candidate.facade.facing),
        visibility: round(visibility),
        score: round(score),
        capturedAt: frame.capturedAt ?? null,
        creator: frame.creator ?? frame.artist ?? null,
        license: frame.license ?? null,
      });
      kept++;
      if (kept >= MAX_TARGETS_PER_FRAME) break;
    }
    frameSummaries.push({ source: source.key, file: frame.file, targets: kept });
    if (!kept) unmatchedFrames++;
  }
}

for (const item of Object.values(observations)) {
  item.frames.sort((a, b) => b.score - a.score || a.distance - b.distance);
}

const output = {
  schemaVersion: 1,
  assumptions: { maxDistanceMeters: MAX_DIST, defaultHorizontalFovDegrees: DEFAULT_FOV },
  sources: sources.map((s) => ({ key: s.key, frameCount: s.frames.length })),
  stats: { usableFrames, unmatchedFrames, buildings: Object.keys(observations).length },
  buildings: observations,
  frames: frameSummaries,
};
writeFileSync(new URL('observations.json', ROOT), JSON.stringify(output, null, 2));

const compact = {};
for (const [id, item] of Object.entries(observations)) {
  compact[id] = {
    name: item.name,
    type: item.type,
    sourceId: item.buildingSourceId,
    frames: item.frames.slice(0, 20).map((f) => ({
      file: f.file,
      source: f.source,
      dist: f.distance,
      facadeEdge: f.facadeEdge,
      score: f.score,
      cameraAt: f.cameraAt,
      heading: f.heading,
    })),
  };
}
writeFileSync(new URL('matches.json', ROOT), JSON.stringify(compact, null, 2));

console.log(`${usableFrames} usable frames from ${sources.length} source(s)`);
console.log(`${Object.keys(observations).length} buildings observed; ${unmatchedFrames} frames had no credible target`);
const ranked = Object.values(observations).sort((a, b) => b.frames.length - a.frames.length);
for (const item of ranked.slice(0, 20)) {
  console.log(`  ${item.buildingId} (${item.name ?? item.type}): ${item.frames.length} observations, best ${item.frames[0].score}`);
}
