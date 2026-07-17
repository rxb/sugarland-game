// Convert Mapillary Tools' image-description JSON into this project's common
// imagery index. Keep the images and description file together in:
//   data-src/imagery/<source-name>/
//
// First create metadata (this does not upload anything):
//   mapillary_tools process data-src/imagery/clewiston-field-2026 \
//     --desc_path data-src/imagery/clewiston-field-2026/mapillary_image_description.json
// Then import it:
//   node scripts/import-capture.mjs data-src/imagery/clewiston-field-2026

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

const LAT0 = 26.754, LON0 = -80.9335;
const M_PER_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const M_PER_LAT = 110540;
const toGame = (lat, lon) => [
  Math.round((lon - LON0) * M_PER_LON * 100) / 100,
  Math.round(-(lat - LAT0) * M_PER_LAT * 100) / 100,
];

const captureArg = process.argv[2];
if (!captureArg) {
  console.error('Usage: node scripts/import-capture.mjs data-src/imagery/<source-name> [description.json]');
  process.exit(1);
}
const captureDir = resolve(captureArg);
const descriptionPath = resolve(process.argv[3] ?? `${captureDir}/mapillary_image_description.json`);
if (!existsSync(descriptionPath)) {
  console.error(`Missing Mapillary image description: ${descriptionPath}`);
  process.exit(1);
}

const source = basename(captureDir);
const description = JSON.parse(readFileSync(descriptionPath, 'utf8'));
if (!Array.isArray(description)) throw new Error('Mapillary image description must be a JSON array');

const headingOf = (item) => {
  const value = item.MAPCompassHeading;
  if (typeof value === 'number') return value;
  return value?.TrueHeading ?? value?.MagneticHeading ?? null;
};

const index = [];
let skippedErrors = 0, skippedHeading = 0, skippedOutside = 0;
for (const item of description) {
  if (item.error) { skippedErrors++; continue; }
  const lat = Number(item.MAPLatitude), lon = Number(item.MAPLongitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) { skippedErrors++; continue; }
  const projectionValue = String(item.MAPProjectionType ?? '').toLowerCase();
  const projection = projectionValue.includes('equirect') ? 'equirectangular' : 'flat';
  const headingValue = headingOf(item);
  const parsedHeading = headingValue == null ? NaN : Number(headingValue);
  const compass = Number.isFinite(parsedHeading) ? parsedHeading : projection === 'equirectangular' ? 0 : NaN;
  if (!Number.isFinite(compass)) { skippedHeading++; continue; }
  const absoluteImage = resolve(dirname(descriptionPath), item.filename);
  let file = relative(captureDir, absoluteImage).replaceAll('\\', '/');
  if (file.startsWith('../') || file === '..') { skippedOutside++; continue; }
  const [x, z] = toGame(lat, lon);
  index.push({
    file,
    id: item.MAPSequenceUUID ? `${item.MAPSequenceUUID}:${basename(file)}` : basename(file),
    source,
    lat,
    lon,
    x,
    z,
    compass,
    projection,
    horizontalFov: projection === 'equirectangular' ? 360 : 90,
    capturedAt: item.MAPCaptureTime ?? null,
    creator: 'self-collected',
    camera: [item.MAPCameraMake, item.MAPCameraModel].filter(Boolean).join(' ') || null,
    license: 'project-owned; confirm release policy before redistribution',
    note: projection === 'flat' ? 'horizontalFov defaults to 90; replace when camera metadata is known' : undefined,
  });
}

writeFileSync(`${captureDir}/index.json`, JSON.stringify(index, null, 2));
console.log(`${index.length} frames imported to ${captureDir}/index.json`);
console.log(`skipped: ${skippedErrors} metadata errors, ${skippedHeading} without heading, ${skippedOutside} outside capture directory`);
