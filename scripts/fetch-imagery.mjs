// Fetch geotagged reference imagery for building-appearance descriptions.
//
// Sources (all legally automatable, unlike Google Street View):
//  - Wikimedia Commons: geotagged, freely-licensed photos (no key needed)
//  - Mapillary: crowdsourced street-level imagery, CC-BY-SA (free token)
//
// Token: put your Mapillary access token in data-src/.mapillary_token
// (single line) or set the MAPILLARY_TOKEN env var.
//
// Output: data-src/imagery/{commons,mapillary}/ with images plus an
// index.json per source recording position (game x/z), compass angle,
// license, and attribution for each frame.
//
// Usage: node scripts/fetch-imagery.mjs [west south east north]
// Default bbox is the downtown Sugarland Highway validation slice.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const LAT0 = 26.754, LON0 = -80.9335;
const M_PER_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const M_PER_LAT = 110540;
const toGame = (lat, lon) => [
  Math.round((lon - LON0) * M_PER_LON * 100) / 100,
  Math.round(-(lat - LAT0) * M_PER_LAT * 100) / 100,
];

// Default: downtown core, Sugarland Hwy between roughly W Ventura and the park.
const [west, south, east, north] = process.argv.length > 2
  ? process.argv.slice(2, 6).map(Number)
  : [-80.9395, 26.7515, -80.9285, 26.7565];

const outRoot = new URL('../data-src/imagery/', import.meta.url).pathname;

async function fetchCommons() {
  const dir = outRoot + 'commons/';
  mkdirSync(dir, { recursive: true });
  const clat = (south + north) / 2, clon = (west + east) / 2;
  const radius = Math.min(10000, Math.round(Math.max(
    (north - south) * M_PER_LAT, (east - west) * M_PER_LON) / 2) + 200);
  const geo = await (await fetch(
    `https://commons.wikimedia.org/w/api.php?action=query&list=geosearch` +
    `&gscoord=${clat}%7C${clon}&gsradius=${radius}&gsnamespace=6&gslimit=100&format=json`,
    { headers: { 'User-Agent': 'sugarland-game-dev/0.1 (hobby project)' } }
  )).json();
  const hits = geo.query?.geosearch ?? [];
  const index = [];
  for (const h of hits) {
    const info = await (await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(h.title)}` +
      `&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=1200&format=json`,
      { headers: { 'User-Agent': 'sugarland-game-dev/0.1 (hobby project)' } }
    )).json();
    const page = Object.values(info.query.pages)[0];
    const ii = page?.imageinfo?.[0];
    if (!ii?.thumburl || !/\.(jpe?g|png)$/i.test(h.title)) continue;
    const meta = ii.extmetadata ?? {};
    const fileName = h.title.replace(/^File:/, '').replace(/[^\w.-]+/g, '_');
    const img = await fetch(ii.thumburl, { headers: { 'User-Agent': 'sugarland-game-dev/0.1' } });
    writeFileSync(dir + fileName, Buffer.from(await img.arrayBuffer()));
    const [x, z] = toGame(h.lat, h.lon);
    index.push({
      file: fileName,
      source: h.title,
      lat: h.lat, lon: h.lon, x, z,
      license: meta.LicenseShortName?.value ?? 'unknown',
      artist: (meta.Artist?.value ?? '').replace(/<[^>]*>/g, ''),
      note: 'geotag is usually the CAMERA position, not the subject',
    });
    console.log(`commons: ${fileName} [${meta.LicenseShortName?.value}]`);
  }
  writeFileSync(dir + 'index.json', JSON.stringify(index, null, 2));
  console.log(`commons: ${index.length} images -> ${dir}`);
}

async function fetchMapillary() {
  let token = process.env.MAPILLARY_TOKEN;
  const tokenFile = new URL('../data-src/.mapillary_token', import.meta.url).pathname;
  if (!token && existsSync(tokenFile)) token = readFileSync(tokenFile, 'utf8').trim();
  if (!token) {
    console.log('mapillary: SKIPPED - no token. Put it in data-src/.mapillary_token or MAPILLARY_TOKEN env.');
    return;
  }
  const dir = outRoot + 'mapillary/';
  mkdirSync(dir, { recursive: true });
  const fields = 'id,computed_geometry,computed_compass_angle,thumb_1024_url,captured_at,creator';
  const url = `https://graph.mapillary.com/images?access_token=${token}` +
    `&bbox=${west},${south},${east},${north}&fields=${fields}&limit=200`;
  const res = await (await fetch(url)).json();
  if (res.error) {
    console.error('mapillary: API error:', res.error.message ?? res.error);
    return;
  }
  const index = [];
  for (const im of res.data ?? []) {
    const [lon, lat] = im.computed_geometry?.coordinates ?? [];
    if (lon == null) continue;
    const file = `${im.id}.jpg`;
    const img = await fetch(im.thumb_1024_url);
    writeFileSync(dir + file, Buffer.from(await img.arrayBuffer()));
    const [x, z] = toGame(lat, lon);
    index.push({
      file,
      id: im.id,
      lat, lon, x, z,
      compass: im.computed_compass_angle, // degrees, 0 = north: ray toward the visible facade
      capturedAt: im.captured_at,
      creator: im.creator?.username,
      license: 'CC-BY-SA 4.0 (Mapillary)',
    });
    console.log(`mapillary: ${file} @ (${x},${z}) heading ${Math.round(im.computed_compass_angle)}deg`);
  }
  writeFileSync(dir + 'index.json', JSON.stringify(index, null, 2));
  console.log(`mapillary: ${index.length} images -> ${dir}`);
}

await fetchCommons();
await fetchMapillary();
