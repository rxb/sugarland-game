// Query the official USGS National Map catalog for current Hendry County 3DEP
// point-cloud tiles and optionally download them into the local cache.
//
// Usage:
//   node scripts/fetch-lidar.mjs --pilot             # manifest for top 5 imagery tasks
//   node scripts/fetch-lidar.mjs --pilot --download  # also cache the LAZ files
//   node scripts/fetch-lidar.mjs                     # manifest for the full game extent

import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = new URL('../', import.meta.url);
const OUT_DIR = new URL('../data-src/lidar/', import.meta.url);
const CATALOG = 'https://tnmaccess.nationalmap.gov/api/v1/products';
const DATASET = 'FL_Peninsular_FDEM_2018_D19_DRRA';
const WORK_UNITS = [
  'FL_Peninsular_FDEM_Glades_2018',
  'FL_Peninsular_FDEM_Hendry_2018',
  'FL_Peninsular_FDEM_PalmBeach_2019',
];
const pilot = process.argv.includes('--pilot');
const download = process.argv.includes('--download');

const LAT0 = 26.754, LON0 = -80.9335;
const M_PER_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const M_PER_LAT = 110540;
const toLonLat = ([x, z]) => [LON0 + x / M_PER_LON, LAT0 - z / M_PER_LAT];

const game = JSON.parse(readFileSync(new URL('../public/data/clewiston.json', import.meta.url), 'utf8'));
let buildings = game.buildings;
let scope = 'full-town';
if (pilot) {
  const tasks = JSON.parse(readFileSync(new URL('../data-src/imagery/descriptor-tasks.json', import.meta.url), 'utf8'));
  const ids = new Set(tasks.tasks.slice(0, 5).map((task) => task.buildingId));
  buildings = buildings.filter((building) => ids.has(building.id));
  scope = 'top-five-imagery-tasks';
}
if (!buildings.length) throw new Error('No buildings selected for LiDAR query');

let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
for (const building of buildings) {
  for (const point of building.poly) {
    const [lon, lat] = toLonLat(point);
    west = Math.min(west, lon); south = Math.min(south, lat);
    east = Math.max(east, lon); north = Math.max(north, lat);
  }
}
const margin = 0.00015;
west -= margin; south -= margin; east += margin; north += margin;

const params = new URLSearchParams({
  datasets: 'Lidar Point Cloud (LPC)',
  bbox: [west, south, east, north].join(','),
  prodFormats: 'LAZ',
  max: '500',
  outputFormat: 'JSON',
});
const catalogUrl = `${CATALOG}?${params}`;
const response = await fetch(catalogUrl);
if (!response.ok) throw new Error(`USGS catalog request failed: ${response.status}`);
const result = await response.json();
if (result.errors?.length) throw new Error(result.errors.join('; '));

const tiles = (result.items ?? [])
  .filter((item) => item.title?.includes(DATASET) && WORK_UNITS.some((unit) => item.downloadURL?.includes(`/${unit}/`)))
  .map((item) => ({
    id: item.sourceId,
    title: item.title,
    file: basename(new URL(item.downloadURL).pathname),
    url: item.downloadURL,
    bytes: item.sizeInBytes,
    boundingBox: item.boundingBox,
    publicationDate: item.publicationDate,
    metadataUrl: item.metaUrl,
    workUnit: WORK_UNITS.find((unit) => item.downloadURL.includes(`/${unit}/`)),
  }))
  .sort((a, b) => a.file.localeCompare(b.file));
if (!tiles.length) throw new Error(`No current Peninsular FDEM LAZ tiles found for ${west},${south},${east},${north}`);

mkdirSync(OUT_DIR, { recursive: true });
const manifest = {
  schemaVersion: 1,
  source: 'USGS 3D Elevation Program / The National Map',
  project: DATASET,
  workUnits: [...new Set(tiles.map((tile) => tile.workUnit))],
  acquisition: '2018-2019',
  scope,
  buildingIds: pilot ? buildings.map((building) => building.id) : undefined,
  queryBbox: [west, south, east, north],
  catalogUrl,
  totalBytes: tiles.reduce((sum, tile) => sum + tile.bytes, 0),
  tiles,
};
if (manifest.buildingIds === undefined) delete manifest.buildingIds;
writeFileSync(new URL('manifest.json', OUT_DIR), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${tiles.length} tile(s) across ${manifest.workUnits.join(', ')}, ${(manifest.totalBytes / 1e6).toFixed(1)} MB, manifest written`);

if (download) {
  if (manifest.totalBytes > 2_000_000_000 && !process.argv.includes('--allow-large-download')) {
    throw new Error(`Refusing ${(manifest.totalBytes / 1e9).toFixed(1)} GB download without --allow-large-download`);
  }
  for (const [index, tile] of tiles.entries()) {
    const destination = new URL(tile.file, OUT_DIR);
    const partial = new URL(`${tile.file}.part`, OUT_DIR);
    if (existsSync(destination)) {
      console.log(`[${index + 1}/${tiles.length}] cached ${tile.file}`);
      continue;
    }
    rmSync(partial, { force: true });
    console.log(`[${index + 1}/${tiles.length}] downloading ${tile.file} (${(tile.bytes / 1e6).toFixed(1)} MB)`);
    const tileResponse = await fetch(tile.url);
    if (!tileResponse.ok || !tileResponse.body) throw new Error(`Download failed for ${tile.file}: ${tileResponse.status}`);
    await pipeline(Readable.fromWeb(tileResponse.body), createWriteStream(partial));
    renameSync(partial, destination);
  }
}
