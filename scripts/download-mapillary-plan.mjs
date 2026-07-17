// Download the metadata-only selection produced by plan-imagery-download.mjs.
// Existing cached frames are preserved and the normalized Mapillary index is
// merged by image ID so the operation is safe to repeat.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../data-src/imagery/', import.meta.url);
const PLAN = new URL('download-plan.json', ROOT);
const DIR = new URL('mapillary/', ROOT);
const INDEX = new URL('index.json', DIR);
const HISTORY_DIR = new URL('download-history/', ROOT);
const LAT0 = 26.754;
const LON0 = -80.9335;
const M_PER_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const M_PER_LAT = 110540;
const CONCURRENCY = 6;

if (!existsSync(PLAN)) throw new Error('missing data-src/imagery/download-plan.json; run imagery:plan first');
let token = process.env.MAPILLARY_TOKEN;
const tokenFile = new URL('../data-src/.mapillary_token', import.meta.url);
if (!token && existsSync(tokenFile)) token = readFileSync(tokenFile, 'utf8').trim();
if (!token) throw new Error('Mapillary token missing; use MAPILLARY_TOKEN or data-src/.mapillary_token');

const plan = JSON.parse(readFileSync(PLAN, 'utf8'));
const current = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : [];
const byId = new Map(current.map((frame) => [String(frame.id), frame]));
mkdirSync(DIR, { recursive: true });

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function fetchWithRetry(url, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < attempts) await wait(400 * (attempt + 1));
  }
  throw lastError;
}

async function download(item) {
  const id = String(item.imageId);
  const file = `${id}.jpg`;
  const path = new URL(file, DIR);
  if (byId.has(id) && existsSync(path)) return { status: 'cached', id };
  const metadataUrl = new URL(`https://graph.mapillary.com/${id}`);
  metadataUrl.searchParams.set('access_token', token);
  metadataUrl.searchParams.set('fields', 'id,computed_geometry,computed_compass_angle,thumb_1024_url,captured_at,camera_type,creator,sequence');
  const metadataResponse = await fetchWithRetry(metadataUrl);
  const metadata = await metadataResponse.json();
  if (!metadata.thumb_1024_url) throw new Error(`${id} has no 1024px thumbnail URL`);
  const imageResponse = await fetchWithRetry(metadata.thumb_1024_url);
  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  if (bytes.length < 1000) throw new Error(`${id} returned an implausibly small image`);
  const part = new URL(`${file}.part`, DIR);
  writeFileSync(part, bytes);
  renameSync(part, path);
  const [lon, lat] = metadata.computed_geometry?.coordinates ?? [];
  byId.set(id, {
    file,
    id,
    source: 'mapillary',
    lat,
    lon,
    x: Math.round((lon - LON0) * M_PER_LON * 100) / 100,
    z: Math.round(-(lat - LAT0) * M_PER_LAT * 100) / 100,
    compass: metadata.computed_compass_angle,
    projection: metadata.camera_type === 'spherical' ? 'equirectangular' : 'flat',
    horizontalFov: metadata.camera_type === 'spherical' ? 360 : 90,
    capturedAt: metadata.captured_at ?? null,
    cameraType: metadata.camera_type ?? null,
    creator: metadata.creator?.username ?? null,
    sequenceId: metadata.sequence?.id ?? metadata.sequence ?? item.sequenceId ?? null,
    license: 'CC-BY-SA 4.0 (Mapillary)',
    selectionBatch: plan.generatedAt,
    targetBuildingIds: item.candidateBuildings.map((building) => building.buildingId),
    note: 'selected by coverage-aware two-view set cover; horizontalFov remains conservative for flat imagery',
  });
  return { status: 'downloaded', id, bytes: bytes.length };
}

let downloaded = 0;
let cached = 0;
let failed = 0;
let bytes = 0;
for (let offset = 0; offset < plan.selected.length; offset += CONCURRENCY) {
  const batch = plan.selected.slice(offset, offset + CONCURRENCY);
  const results = await Promise.allSettled(batch.map(download));
  for (const result of results) {
    if (result.status === 'rejected') {
      failed++;
      console.error(`mapillary download failed: ${result.reason?.message ?? result.reason}`);
    } else if (result.value.status === 'cached') {
      cached++;
    } else {
      downloaded++;
      bytes += result.value.bytes;
    }
  }
  console.log(`mapillary download: ${Math.min(offset + batch.length, plan.selected.length)}/${plan.selected.length}`);
}

const merged = [...byId.values()].sort((a, b) =>
  (a.capturedAt ?? 0) - (b.capturedAt ?? 0) || String(a.id).localeCompare(String(b.id)),
);
writeFileSync(INDEX, JSON.stringify(merged, null, 2));
mkdirSync(HISTORY_DIR, { recursive: true });
const historyName = `${plan.generatedAt.replace(/[:.]/g, '-')}.json`;
const completedFrameCount = plan.selected.filter((item) => byId.has(String(item.imageId))).length;
writeFileSync(new URL(historyName, HISTORY_DIR), JSON.stringify({
  ...plan,
  completedAt: new Date().toISOString(),
  result: {
    downloadedThisRun: downloaded,
    cachedThisRun: cached,
    failedThisRun: failed,
    bytesDownloadedThisRun: bytes,
    completedFrameCount,
  },
}, null, 2));
console.log(`${downloaded} downloaded (${(bytes / 1024 / 1024).toFixed(1)} MiB), ${cached} cached, ${failed} failed; ${merged.length} total indexed frames`);
if (failed) process.exitCode = 1;
