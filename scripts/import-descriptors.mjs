// Validate vision/human descriptor results and merge them into the runtime
// appearance file. Input may be a single descriptor, an array, or an object
// keyed by numeric building id.
//
// Usage: node scripts/import-descriptors.mjs path/to/results.json

import { readFileSync, writeFileSync } from 'node:fs';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/import-descriptors.mjs path/to/results.json');
  process.exit(1);
}
const dataUrl = new URL('../public/data/clewiston.json', import.meta.url);
const detailsUrl = new URL('../public/data/building-details.json', import.meta.url);
const game = JSON.parse(readFileSync(dataUrl, 'utf8'));
const current = JSON.parse(readFileSync(detailsUrl, 'utf8'));
const raw = JSON.parse(readFileSync(inputPath, 'utf8'));
const replaceExisting = process.argv.includes('--replace');
const descriptors = Array.isArray(raw)
  ? raw
  : raw.buildingId != null || raw.buildingSourceId ? [raw] : Object.values(raw);

const byId = new Map(game.buildings.map((b) => [String(b.id), b]));
const bySource = new Map(game.buildings.filter((b) => b.sourceId).map((b) => [b.sourceId, b]));
const hex = /^#[0-9a-f]{6}$/i;
const allowedConfidence = new Set(['high', 'medium', 'low', 'needs-confirmation']);
const cleanColor = (value, field) => {
  if (value == null) return undefined;
  if (!hex.test(value)) throw new Error(`${field} must be a six-digit hex color, got ${value}`);
  return value.toLowerCase();
};

let imported = 0;
for (const descriptor of descriptors) {
  const building = descriptor.buildingId != null
    ? byId.get(String(descriptor.buildingId))
    : bySource.get(descriptor.buildingSourceId);
  if (!building) throw new Error(`Unknown building: ${descriptor.buildingId ?? descriptor.buildingSourceId}`);
  if (descriptor.buildingSourceId && building.sourceId !== descriptor.buildingSourceId) {
    throw new Error(`Stable id mismatch for building ${building.id}`);
  }
  if (descriptor.confidence && !allowedConfidence.has(descriptor.confidence)) {
    throw new Error(`Invalid confidence for building ${building.id}`);
  }
  if (descriptor.stories != null && (!Number.isInteger(descriptor.stories) || descriptor.stories < 1 || descriptor.stories > 20)) {
    throw new Error(`Invalid stories for building ${building.id}`);
  }
  const facades = (descriptor.facades ?? []).map((facade) => {
    if (!Number.isInteger(facade.edgeIndex) || facade.edgeIndex < 0 || facade.edgeIndex >= building.poly.length) {
      throw new Error(`Invalid facade edge ${facade.edgeIndex} for building ${building.id}`);
    }
    for (const door of facade.doors ?? []) {
      if (door.position < 0 || door.position > 1) throw new Error(`Door position must be 0..1 for building ${building.id}`);
    }
    return facade;
  });
  const cleaned = {
    ...descriptor,
    buildingId: undefined,
    buildingSourceId: building.sourceId ?? descriptor.buildingSourceId ?? null,
    wall: cleanColor(descriptor.wall, 'wall'),
    trim: cleanColor(descriptor.trim, 'trim'),
    roof: descriptor.roof ? { ...descriptor.roof, color: cleanColor(descriptor.roof.color, 'roof.color') } : undefined,
    facades,
  };
  for (const key of Object.keys(cleaned)) if (cleaned[key] === undefined) delete cleaned[key];
  current[building.id] = { ...(replaceExisting ? {} : current[building.id] ?? {}), ...cleaned };
  imported++;
}

writeFileSync(detailsUrl, `${JSON.stringify(current, null, 2)}\n`);
console.log(`${imported} descriptor(s) merged into public/data/building-details.json`);
