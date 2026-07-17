// Package facade observations into deterministic, source-neutral vision tasks.
// The resulting file is deliberately model-agnostic: a local model, hosted
// vision model, Codex task, or human review UI can all consume the same input.
//
// Usage: node scripts/build-descriptor-tasks.mjs

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const observations = JSON.parse(readFileSync(new URL('../data-src/imagery/observations.json', import.meta.url), 'utf8'));
const game = JSON.parse(readFileSync(new URL('../public/data/clewiston.json', import.meta.url), 'utf8'));
const existing = JSON.parse(readFileSync(new URL('../public/data/building-details.json', import.meta.url), 'utf8'));
const contextUrl = new URL('../data-src/building-context.json', import.meta.url);
const contextData = existsSync(contextUrl) ? JSON.parse(readFileSync(contextUrl, 'utf8')) : {};
const parcelContext = (id) => contextData.parcels?.[contextData.buildingParcels?.[id]] ?? null;
const byId = new Map(game.buildings.map((b) => [String(b.id), b]));

const schema = {
  buildingId: 'number',
  buildingSourceId: 'string|null',
  confidence: 'high|medium|low|needs-confirmation',
  stories: 'integer|null',
  height: 'meters|null',
  wall: 'hex color|null',
  wallMaterial: 'stucco|brick|wood-siding|metal|concrete-block|glass|mixed|unknown',
  trim: 'hex color|null',
  roof: { type: 'flat|gable|hip|shed|mansard|complex|unknown', color: 'hex color|null', material: 'string|null' },
  style: 'short architectural description|null',
  signage: [{ text: 'exact visible wording', facadeEdge: 'integer|null', confidence: 'high|medium|low' }],
  facades: [{
    edgeIndex: 'integer',
    floors: [{ level: 'integer starting at 1', windows: 'integer|null', windowPattern: 'string|null' }],
    doors: [{ position: '0..1 from first edge vertex to second', type: 'string', color: 'hex|null' }],
    lighting: [{ position: '0..1', type: 'sconce|gooseneck|strip|flood|canopy|other' }],
    notes: ['observable facade features'],
  }],
  evidence: [{ source: 'directory name', file: 'filename', facadeEdge: 'integer', supports: ['fields supported by this image'] }],
  notes: ['uncertainties; do not turn guesses into facts'],
};

const prompt = [
  'Describe only the target building facade identified by facadeEdge and imageRegion.',
  'imageRegion left/right are normalized horizontal coordinates in the source image; they are approximate because camera FOV metadata may be estimated.',
  'Use multiple images to resolve occlusion. Do not copy features from adjacent buildings.',
  'Record visible signage verbatim. Use null/unknown and lower confidence whenever evidence is insufficient.',
  'Counts should describe each indicated footprint edge, not an imagined symmetric facade.',
  'Return one JSON object matching outputSchema; do not add prose.',
].join(' ');

const tasks = [];
for (const [id, observed] of Object.entries(observations.buildings)) {
  const building = byId.get(id);
  if (!building) continue;
  const bestByEdge = new Map();
  for (const frame of observed.frames) {
    const list = bestByEdge.get(frame.facadeEdge) ?? [];
    if (list.length < 4) list.push(frame);
    bestByEdge.set(frame.facadeEdge, list);
  }
  const evidence = [...bestByEdge.values()].flat()
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((f) => ({
      source: f.source,
      file: f.file,
      path: `data-src/imagery/${f.source}/${f.file}`,
      facadeEdge: f.facadeEdge,
      imageRegion: f.imageRegion,
      distance: f.distance,
      visibility: f.visibility,
      score: f.score,
    }));
  tasks.push({
    taskId: `building:${id}`,
    buildingId: building.id,
    buildingSourceId: building.sourceId ?? null,
    footprint: building.poly,
    currentModel: {
      type: building.type,
      height: building.height,
      numFloors: building.numFloors ?? null,
      existingDescriptor: existing[id] ?? null,
      parcelContext: parcelContext(id),
    },
    evidence,
    reviewStatus: existing[id]?.confidence === 'high' ? 'verify-existing' : 'needs-description',
  });
}
tasks.sort((a, b) => {
  const aBest = a.evidence[0]?.score ?? 0, bBest = b.evidence[0]?.score ?? 0;
  return bBest - aBest;
});

const out = {
  schemaVersion: 1,
  prompt,
  outputSchema: schema,
  taskCount: tasks.length,
  tasks,
};
writeFileSync(new URL('../data-src/imagery/descriptor-tasks.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(`${tasks.length} descriptor tasks written; ${tasks.filter((t) => t.reviewStatus === 'verify-existing').length} already have high-confidence details`);
