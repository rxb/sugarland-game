// Select a geographically diverse Mapillary download batch using greedy set cover.
//
// Each unenhanced building asks for two useful views. Candidate quality combines
// camera distance and how close the building is to the image center. Sequence and
// 100 m cell penalties prevent a dense drive from consuming the whole batch.
//
// Usage: node scripts/plan-imagery-download.mjs [--limit 150]

import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../data-src/imagery/', import.meta.url);
const coverage = JSON.parse(readFileSync(new URL('coverage.json', ROOT), 'utf8'));
const availability = JSON.parse(readFileSync(new URL('mapillary/availability.json', ROOT), 'utf8'));
const downloaded = JSON.parse(readFileSync(new URL('mapillary/index.json', ROOT), 'utf8'));
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : 150;
if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
  throw new Error('--limit must be an integer from 1 to 1000');
}

const downloadedIds = new Set(downloaded.map((frame) => String(frame.id)));
const imagesById = new Map(availability.images.map((image) => [String(image.id), image]));
const targetBuildings = coverage.buildingLedger.filter((building) => building.state === 'available');
const frameCandidates = new Map();
for (const building of targetBuildings) {
  for (const candidate of building.bestAvailableFrames ?? []) {
    const imageId = String(candidate.imageId);
    if (downloadedIds.has(imageId) || !imagesById.has(imageId)) continue;
    const distanceQuality = Math.max(0, 1 - candidate.distanceM / 110);
    const angleQuality = Math.max(0, 1 - candidate.relativeAngleDeg / 55);
    const quality = 0.55 * distanceQuality + 0.45 * angleQuality;
    if (quality < 0.12) continue;
    if (!frameCandidates.has(imageId)) frameCandidates.set(imageId, []);
    frameCandidates.get(imageId).push({
      buildingId: building.buildingId,
      buildingSourceId: building.buildingSourceId,
      quality,
      distanceM: candidate.distanceM,
      relativeAngleDeg: candidate.relativeAngleDeg,
    });
  }
}

const selected = [];
const selectedIds = new Set();
const buildingViews = new Map();
const sequenceSelections = new Map();
const cellSelections = new Map();
for (let pick = 0; pick < limit; pick++) {
  let best = null;
  for (const [imageId, candidates] of frameCandidates) {
    if (selectedIds.has(imageId)) continue;
    const image = imagesById.get(imageId);
    const sequenceId = image.sequenceId ?? 'unknown';
    const sequenceCount = sequenceSelections.get(sequenceId) ?? 0;
    if (sequenceCount >= 18) continue;
    const cell = `${Math.floor(image.x / 100)},${Math.floor(image.z / 100)}`;
    const cellCount = cellSelections.get(cell) ?? 0;
    let benefit = 0;
    for (const candidate of candidates) {
      const currentViews = buildingViews.get(String(candidate.buildingId)) ?? 0;
      if (currentViews >= 2) continue;
      benefit += candidate.quality * (currentViews === 0 ? 1 : 0.62);
    }
    benefit /= (1 + sequenceCount * 0.22) * (1 + cellCount * 0.38);
    if (!best || benefit > best.benefit || (benefit === best.benefit && imageId < best.imageId)) {
      best = { imageId, image, candidates, sequenceId, cell, benefit };
    }
  }
  if (!best || best.benefit <= 0) break;
  selectedIds.add(best.imageId);
  sequenceSelections.set(best.sequenceId, (sequenceSelections.get(best.sequenceId) ?? 0) + 1);
  cellSelections.set(best.cell, (cellSelections.get(best.cell) ?? 0) + 1);
  for (const candidate of best.candidates) {
    const key = String(candidate.buildingId);
    if ((buildingViews.get(key) ?? 0) < 2) buildingViews.set(key, (buildingViews.get(key) ?? 0) + 1);
  }
  selected.push({
    imageId: best.imageId,
    sequenceId: best.image.sequenceId ?? null,
    cameraAt: [best.image.x, best.image.z],
    capturedAt: best.image.capturedAt ?? null,
    creator: best.image.creator ?? null,
    selectionBenefit: Number(best.benefit.toFixed(4)),
    candidateBuildings: best.candidates
      .sort((a, b) => b.quality - a.quality)
      .map((candidate) => ({
        buildingId: candidate.buildingId,
        buildingSourceId: candidate.buildingSourceId,
        quality: Number(candidate.quality.toFixed(3)),
        distanceM: candidate.distanceM,
        relativeAngleDeg: candidate.relativeAngleDeg,
      })),
  });
}

const coveredOnce = [...buildingViews.values()].filter((count) => count >= 1).length;
const coveredTwice = [...buildingViews.values()].filter((count) => count >= 2).length;
const plan = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  method: 'greedy two-view building set cover with sequence and 100 m cell diversity penalties',
  requestedFrameLimit: limit,
  targetBuildingCount: targetBuildings.length,
  candidateFrameCount: frameCandidates.size,
  selectedFrameCount: selected.length,
  selectedSequenceCount: sequenceSelections.size,
  selectedCellCount: cellSelections.size,
  buildingsCoveredOnce: coveredOnce,
  buildingsCoveredTwice: coveredTwice,
  selected,
};
writeFileSync(new URL('download-plan.json', ROOT), JSON.stringify(plan, null, 2));
console.log(`${selected.length} frames selected from ${frameCandidates.size} candidates across ${sequenceSelections.size} sequences and ${cellSelections.size} cells`);
console.log(`${coveredOnce}/${targetBuildings.length} target buildings receive a view; ${coveredTwice} receive two views`);
