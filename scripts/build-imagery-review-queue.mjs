// Rank matched, unreviewed buildings for visual descriptor work.
//
// The score rewards strong geometric matches, a large target region, multiple
// views, and one-building parcels. It does not make visual claims; reviewers
// still verify identity, occlusion, and facade completeness from the images.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../data-src/imagery/', import.meta.url);
const TASKS = new URL('descriptor-tasks.json', ROOT);
const DETAILS = new URL('../public/data/building-details.json', import.meta.url);
const DECISIONS = new URL('review-decisions.json', ROOT);
const tasks = JSON.parse(readFileSync(TASKS, 'utf8')).tasks;
const details = JSON.parse(readFileSync(DETAILS, 'utf8'));
const decisions = existsSync(DECISIONS)
  ? JSON.parse(readFileSync(DECISIONS, 'utf8')).decisions ?? {}
  : {};

const residentialCodes = new Set(['000', '001', '002', '003', '008']);
const civicCodes = new Set(['070', '071', '072', '073', '074', '075', '076', '077', '078', '079']);
const queue = [];
for (const task of tasks) {
  const id = String(task.buildingId);
  if (details[id] || decisions[id]) continue;
  const evidence = task.evidence ?? [];
  if (!evidence.length) continue;
  const best = evidence[0];
  const parcel = task.currentModel?.parcelContext ?? {};
  const regionWidth = best.imageRegion
    ? Math.abs(best.imageRegion.right - best.imageRegion.left)
    : 0;
  const parcelConfidence = parcel.buildingsOnParcel === 1 ? 1 : parcel.buildingsOnParcel ? 0.25 : 0.5;
  const score = 0.58 * (best.score ?? 0)
    + 0.2 * Math.min(1, regionWidth)
    + 0.12 * Math.min(1, evidence.length / 3)
    + 0.1 * parcelConfidence;
  const useCode = parcel.dorUseCode ?? null;
  const mappedType = task.currentModel?.type ?? null;
  const category = civicCodes.has(useCode) || mappedType === 'church'
    ? 'civic-religious'
    : residentialCodes.has(useCode)
      ? 'residential'
      : 'commercial-industrial-mixed';
  queue.push({
    rank: null,
    reviewScore: Number(score.toFixed(4)),
    category,
    buildingId: task.buildingId,
    buildingSourceId: task.buildingSourceId,
    mappedType,
    address: parcel.physicalAddress ?? null,
    useCode,
    actualYearBuilt: parcel.actualYearBuilt ?? null,
    buildingsOnParcel: parcel.buildingsOnParcel ?? null,
    evidenceCount: evidence.length,
    bestEvidence: {
      file: best.file,
      facadeEdge: best.facadeEdge,
      score: best.score,
      distance: best.distance,
      imageRegion: best.imageRegion,
    },
  });
}
queue.sort((a, b) => b.reviewScore - a.reviewScore || String(a.buildingId).localeCompare(String(b.buildingId)));
queue.forEach((item, index) => { item.rank = index + 1; });
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  method: 'geometric match + target region + view count + parcel uniqueness; visual verification still required',
  count: queue.length,
  categoryCounts: Object.fromEntries(
    [...new Set(queue.map((item) => item.category))]
      .map((category) => [category, queue.filter((item) => item.category === category).length]),
  ),
  queue,
};
writeFileSync(new URL('review-queue.json', ROOT), JSON.stringify(output, null, 2));
console.log(`${queue.length} unreviewed matched buildings ranked`);
for (const category of Object.keys(output.categoryCounts)) {
  const top = queue.filter((item) => item.category === category).slice(0, 5).map((item) => item.buildingId);
  console.log(`${category}: ${output.categoryCounts[category]} candidates; top ${top.join(', ')}`);
}
