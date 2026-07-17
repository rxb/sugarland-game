// Inventory Mapillary imagery metadata without downloading image thumbnails.
//
// This is deliberately separate from fetch-imagery.mjs: discovering coverage is
// cheap, while downloading and reviewing every frame is not. The output feeds
// build-imagery-coverage.mjs, which decides where imagery is available and what
// has already moved through the local enhancement pipeline.
//
// Usage:
//   node scripts/inventory-mapillary.mjs
//   node scripts/inventory-mapillary.mjs west south east north

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const LAT0 = 26.754;
const LON0 = -80.9335;
const M_PER_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const M_PER_LAT = 110540;
const DEFAULT_BBOX = [-80.96, 26.72, -80.88, 26.78];
const TILE_DEGREES = 0.01;
const bbox = process.argv.length >= 6
  ? process.argv.slice(2, 6).map(Number)
  : DEFAULT_BBOX;

if (bbox.some((value) => !Number.isFinite(value))) {
  throw new Error('bbox must be four numbers: west south east north');
}

let token = process.env.MAPILLARY_TOKEN;
const tokenFile = new URL('../data-src/.mapillary_token', import.meta.url);
if (!token && existsSync(tokenFile)) token = readFileSync(tokenFile, 'utf8').trim();
if (!token) {
  throw new Error('Mapillary token missing; use MAPILLARY_TOKEN or data-src/.mapillary_token');
}

const fields = [
  'id',
  'computed_geometry',
  'computed_compass_angle',
  'captured_at',
  'camera_type',
  'creator',
  'sequence',
].join(',');

const images = new Map();
let pages = 0;
let tileCount = 0;
let splitTileCount = 0;

async function inventoryTile(tile, depth = 0) {
  const firstUrl = new URL('https://graph.mapillary.com/images');
  firstUrl.searchParams.set('access_token', token);
  firstUrl.searchParams.set('bbox', tile.join(','));
  firstUrl.searchParams.set('fields', fields);
  firstUrl.searchParams.set('limit', '500');
  let next = firstUrl.toString();
  let tilePages = 0;
  let tileResults = 0;
  let hadPagination = false;
  while (next) {
    pages++;
    tilePages++;
    if (tilePages > 200) throw new Error(`Mapillary pagination exceeded 200 pages for tile ${tile.join(',')}`);
    const response = await fetch(next);
    const body = await response.json();
    if (!response.ok || body.error) {
      throw new Error(`Mapillary API error for tile ${tile.join(',')}: ${body.error?.message ?? response.statusText}`);
    }
    const pageImages = body.data ?? [];
    tileResults += pageImages.length;
    for (const image of pageImages) {
      const [lon, lat] = image.computed_geometry?.coordinates ?? [];
      if (!image.id || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const x = Math.round((lon - LON0) * M_PER_LON * 100) / 100;
      const z = Math.round(-(lat - LAT0) * M_PER_LAT * 100) / 100;
      images.set(String(image.id), {
        id: String(image.id),
        lat,
        lon,
        x,
        z,
        compass: Number.isFinite(image.computed_compass_angle)
          ? image.computed_compass_angle
          : null,
        capturedAt: image.captured_at ?? null,
        cameraType: image.camera_type ?? null,
        creator: image.creator?.username ?? null,
        sequenceId: image.sequence?.id ?? image.sequence ?? null,
      });
    }
    hadPagination ||= Boolean(body.paging?.next);
    next = body.paging?.next ?? null;
  }

  // The images endpoint can return exactly the requested limit without a next
  // link. Treat that as a saturated spatial query and subdivide so old imagery
  // is not silently omitted behind newer results.
  const width = tile[2] - tile[0];
  const height = tile[3] - tile[1];
  if (tileResults >= 500 && !hadPagination && depth < 7 && Math.max(width, height) > 0.0002) {
    splitTileCount++;
    const midLon = (tile[0] + tile[2]) / 2;
    const midLat = (tile[1] + tile[3]) / 2;
    for (const child of [
      [tile[0], tile[1], midLon, midLat],
      [midLon, tile[1], tile[2], midLat],
      [tile[0], midLat, midLon, tile[3]],
      [midLon, midLat, tile[2], tile[3]],
    ]) await inventoryTile(child, depth + 1);
  }
}

for (let south = bbox[1]; south < bbox[3]; south += TILE_DEGREES) {
  for (let west = bbox[0]; west < bbox[2]; west += TILE_DEGREES) {
    tileCount++;
    const tile = [
      west,
      south,
      Math.min(bbox[2], west + TILE_DEGREES),
      Math.min(bbox[3], south + TILE_DEGREES),
    ];
    await inventoryTile(tile);
    console.log(`mapillary inventory: tile ${tileCount}, ${images.size} unique images`);
  }
}

const sorted = [...images.values()].sort((a, b) =>
  (a.sequenceId ?? '').localeCompare(b.sequenceId ?? '')
  || (a.capturedAt ?? 0) - (b.capturedAt ?? 0)
  || a.id.localeCompare(b.id)
);
const sequences = new Set(sorted.map((image) => image.sequenceId).filter(Boolean));
const out = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: 'Mapillary Graph API',
  bbox,
  tileDegrees: TILE_DEGREES,
  tileCount,
  splitTileCount,
  pages,
  imageCount: sorted.length,
  sequenceCount: sequences.size,
  images: sorted,
};

const output = new URL('../data-src/imagery/mapillary/availability.json', import.meta.url);
mkdirSync(new URL('.', output), { recursive: true });
writeFileSync(output, JSON.stringify(out, null, 2));
console.log(`${sorted.length} available images in ${sequences.size} sequences -> ${output.pathname}`);
