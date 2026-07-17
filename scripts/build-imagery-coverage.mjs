// Build a provenance-aware ledger of Mapillary enhancement coverage.
//
// The ledger distinguishes four separate states:
//   available: Mapillary metadata says a useful camera view may exist;
//   downloaded: the frame exists in the local source cache;
//   analyzed: deterministic facade matching has considered the local frame;
//   enhanced: a reviewed Mapillary-backed descriptor is active in the game.
//
// Outputs:
//   data-src/imagery/coverage.json     compact summary and per-building ledger
//   data-src/imagery/coverage.geojson map-ready 50 m cells and building points

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../data-src/imagery/', import.meta.url);
const PUBLIC_COVERAGE = new URL('../public/data/imagery-coverage.json', import.meta.url);
const GAME = new URL('../public/data/clewiston.json', import.meta.url);
const DETAILS = new URL('../public/data/building-details.json', import.meta.url);
const AVAILABILITY = new URL('mapillary/availability.json', ROOT);
const DOWNLOADED = new URL('mapillary/index.json', ROOT);
const OBSERVATIONS = new URL('observations.json', ROOT);
const REVIEW_DECISIONS = new URL('review-decisions.json', ROOT);
const LAT0 = 26.754;
const LON0 = -80.9335;
const M_PER_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const M_PER_LAT = 110540;
const CELL_M = 50;
const MAX_VIEW_M = 110;
const HALF_FOV_DEG = 55;

for (const input of [AVAILABILITY, DOWNLOADED, OBSERVATIONS]) {
  if (!existsSync(input)) throw new Error(`missing input: ${input.pathname}`);
}

const availability = JSON.parse(readFileSync(AVAILABILITY, 'utf8'));
const downloadedIndex = JSON.parse(readFileSync(DOWNLOADED, 'utf8'));
const observations = JSON.parse(readFileSync(OBSERVATIONS, 'utf8'));
const game = JSON.parse(readFileSync(GAME, 'utf8'));
const details = existsSync(DETAILS) ? JSON.parse(readFileSync(DETAILS, 'utf8')) : {};
const reviewDecisions = existsSync(REVIEW_DECISIONS)
  ? JSON.parse(readFileSync(REVIEW_DECISIONS, 'utf8')).decisions ?? {}
  : {};

const downloadedIds = new Set(downloadedIndex.map((frame) => String(frame.id)));
const analyzedFiles = new Set(
  (observations.frames ?? [])
    .filter((frame) => frame.source === 'mapillary')
    .map((frame) => frame.file),
);
const enhancedIds = new Set(
  Object.entries(details)
    .filter(([, detail]) => (detail.evidence ?? []).some((item) => item.source === 'mapillary'))
    .map(([id]) => String(id)),
);

const round = (number, places = 3) => Number(number.toFixed(places));
const angleDelta = (degrees) => ((degrees + 540) % 360) - 180;
const bearing = (dx, dz) => (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
const toLonLat = (x, z) => [LON0 + x / M_PER_LON, LAT0 - z / M_PER_LAT];
function centroid(poly) {
  let x = 0;
  let z = 0;
  for (const point of poly) { x += point[0]; z += point[1]; }
  return [x / poly.length, z / poly.length];
}

const cells = new Map();
function cellFor(x, z) {
  const cx = Math.floor(x / CELL_M);
  const cz = Math.floor(z / CELL_M);
  const key = `${cx},${cz}`;
  if (!cells.has(key)) {
    cells.set(key, {
      key,
      cx,
      cz,
      availableImageIds: new Set(),
      downloadedImageIds: new Set(),
      analyzedImageIds: new Set(),
      enhancedBuildingIds: new Set(),
    });
  }
  return cells.get(key);
}

const catalogFrames = availability.images.filter((frame) =>
  Number.isFinite(frame.x) && Number.isFinite(frame.z),
);
const availableById = new Map(catalogFrames.map((frame) => [String(frame.id), {
  ...frame,
  id: String(frame.id),
  catalogListed: true,
}]));
for (const frame of downloadedIndex) {
  if (!Number.isFinite(frame.x) || !Number.isFinite(frame.z) || frame.id == null) continue;
  const id = String(frame.id);
  availableById.set(id, {
    ...frame,
    ...(availableById.get(id) ?? {}),
    id,
    locallyCached: true,
  });
}
const availableFrames = [...availableById.values()];
for (const frame of availableFrames) {
  const cell = cellFor(frame.x, frame.z);
  const id = String(frame.id);
  cell.availableImageIds.add(id);
  if (downloadedIds.has(id)) cell.downloadedImageIds.add(id);
  if (analyzedFiles.has(`${id}.jpg`)) cell.analyzedImageIds.add(id);
}

const buildingLedger = [];
for (const building of game.buildings) {
  const [x, z] = centroid(building.poly);
  const candidates = [];
  for (const frame of availableFrames) {
    if (!Number.isFinite(frame.compass)) continue;
    const dx = x - frame.x;
    const dz = z - frame.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 2 || distance > MAX_VIEW_M) continue;
    const relativeAngle = Math.abs(angleDelta(bearing(dx, dz) - frame.compass));
    if (relativeAngle > HALF_FOV_DEG) continue;
    candidates.push({
      imageId: String(frame.id),
      distanceM: round(distance, 1),
      relativeAngleDeg: round(relativeAngle, 1),
      downloaded: downloadedIds.has(String(frame.id)),
    });
  }
  candidates.sort((a, b) => a.distanceM - b.distanceM || a.relativeAngleDeg - b.relativeAngleDeg);
  const observed = observations.buildings?.[String(building.id)]?.frames ?? [];
  const enhanced = enhancedIds.has(String(building.id));
  const reviewDecision = reviewDecisions[String(building.id)] ?? null;
  if (!candidates.length && !observed.length && !enhanced) continue;
  if (enhanced) cellFor(x, z).enhancedBuildingIds.add(String(building.id));
  const state = enhanced
    ? 'enhanced'
    : reviewDecision?.status === 'rejected'
      ? 'rejected'
      : reviewDecision?.status === 'needs-confirmation'
        ? 'needs-confirmation'
        : observed.length
          ? 'downloaded-and-matched'
          : 'available';
  buildingLedger.push({
    buildingId: building.id,
    buildingSourceId: building.sourceId ?? null,
    name: building.name ?? null,
    type: building.type ?? null,
    center: [round(x, 2), round(z, 2)],
    state,
    reviewDecision,
    availableCandidateFrames: candidates.length,
    downloadedCandidateFrames: candidates.filter((candidate) => candidate.downloaded).length,
    matchedObservations: observed.length,
    enhancedFromMapillary: enhanced,
    bestAvailableFrames: candidates.slice(0, 5),
  });
}

buildingLedger.sort((a, b) =>
  ['enhanced', 'needs-confirmation', 'rejected', 'downloaded-and-matched', 'available'].indexOf(a.state)
  - ['enhanced', 'needs-confirmation', 'rejected', 'downloaded-and-matched', 'available'].indexOf(b.state)
  || b.availableCandidateFrames - a.availableCandidateFrames
);

const cellLedger = [...cells.values()].map((cell) => ({
  key: cell.key,
  x: cell.cx * CELL_M,
  z: cell.cz * CELL_M,
  availableFrames: cell.availableImageIds.size,
  downloadedFrames: cell.downloadedImageIds.size,
  analyzedFrames: cell.analyzedImageIds.size,
  enhancedBuildings: cell.enhancedBuildingIds.size,
  state: cell.enhancedBuildingIds.size
    ? 'enhanced'
    : cell.analyzedImageIds.size
      ? 'analyzed'
      : cell.downloadedImageIds.size
        ? 'downloaded'
        : 'available',
}));

const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  definitions: {
    available: `Mapillary camera metadata is within ${MAX_VIEW_M} m and approximately faces the building`,
    downloaded: 'at least one candidate frame exists in the local image cache',
    analyzed: 'the deterministic facade matcher has processed the local frame',
    enhanced: 'a reviewed Mapillary-backed descriptor is active in building-details.json',
    needsConfirmation: 'visual review found useful evidence but could not safely confirm the footprint/facade identity',
    rejected: 'visual review found that the evidence should not be attached to this footprint',
  },
  sourceBbox: availability.bbox,
  gridCellMeters: CELL_M,
  images: {
    catalogListed: catalogFrames.length,
    availableIncludingLocalCache: availableFrames.length,
    downloaded: downloadedIndex.length,
    analyzed: downloadedIndex.filter((frame) => analyzedFiles.has(frame.file)).length,
    cachedButMissingFromBboxCatalog: downloadedIndex.filter((frame) => !availability.images.some((item) => String(item.id) === String(frame.id))).length,
  },
  buildings: {
    availableOrFurther: buildingLedger.length,
    enhanced: buildingLedger.filter((item) => item.state === 'enhanced').length,
    downloadedAndMatched: buildingLedger.filter((item) => item.state === 'downloaded-and-matched').length,
    needsConfirmation: buildingLedger.filter((item) => item.state === 'needs-confirmation').length,
    rejected: buildingLedger.filter((item) => item.state === 'rejected').length,
    availableOnly: buildingLedger.filter((item) => item.state === 'available').length,
  },
  cells: cellLedger,
  buildingLedger,
};
writeFileSync(new URL('coverage.json', ROOT), JSON.stringify(summary, null, 2));
writeFileSync(PUBLIC_COVERAGE, JSON.stringify(summary));

const features = [];
for (const cell of cellLedger) {
  const west = cell.x;
  const east = west + CELL_M;
  const north = cell.z;
  const south = north + CELL_M;
  features.push({
    type: 'Feature',
    properties: {
      featureType: 'coverage-cell',
      state: cell.state,
      availableFrames: cell.availableFrames,
      downloadedFrames: cell.downloadedFrames,
      analyzedFrames: cell.analyzedFrames,
      enhancedBuildings: cell.enhancedBuildings,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        toLonLat(west, north),
        toLonLat(east, north),
        toLonLat(east, south),
        toLonLat(west, south),
        toLonLat(west, north),
      ]],
    },
  });
}
for (const building of buildingLedger) {
  features.push({
    type: 'Feature',
    properties: {
      featureType: 'building',
      state: building.state,
      buildingId: building.buildingId,
      buildingSourceId: building.buildingSourceId,
      name: building.name,
      reviewReason: building.reviewDecision?.reason ?? null,
      availableCandidateFrames: building.availableCandidateFrames,
      matchedObservations: building.matchedObservations,
    },
    geometry: { type: 'Point', coordinates: toLonLat(...building.center) },
  });
}
writeFileSync(
  new URL('coverage.geojson', ROOT),
  JSON.stringify({ type: 'FeatureCollection', features }, null, 2),
);

console.log(`${summary.images.catalogListed} Mapillary images catalog-listed; ${summary.images.availableIncludingLocalCache} available including cache`);
console.log(`${summary.images.downloaded} downloaded; ${summary.images.analyzed} analyzed; ${summary.images.cachedButMissingFromBboxCatalog} cached IDs absent from the bbox listing`);
console.log(`${summary.buildings.enhanced} enhanced buildings; ${summary.buildings.downloadedAndMatched} downloaded/matched; ${summary.buildings.availableOnly} available-only candidates`);
console.log(`${summary.buildings.needsConfirmation} need confirmation; ${summary.buildings.rejected} rejected by visual review`);
