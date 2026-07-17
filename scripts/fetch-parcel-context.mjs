// Fetch non-owner Florida DOR cadastral attributes and associate them with
// building footprints by parcel containment. Parcel facts inform descriptor
// review; they do not directly override facade geometry because one parcel can
// contain several buildings and construction fields describe the predominant
// improvement.
//
// Usage: node scripts/fetch-parcel-context.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const ENDPOINT = 'https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query';
const BBOX = [-80.96, 26.72, -80.88, 26.78];
const PAGE_SIZE = 2000;
const FIELDS = [
  'PARCEL_ID', 'DOR_UC', 'PA_UC', 'IMP_QUAL', 'CONST_CLAS',
  'EFF_YR_BLT', 'ACT_YR_BLT', 'TOT_LVG_AR', 'NO_BULDNG',
  'SPEC_FEAT_', 'PHY_ADDR1', 'PHY_ADDR2', 'PHY_CITY', 'PHY_ZIPCD',
];

const LAT0 = 26.754, LON0 = -80.9335;
const M_PER_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const M_PER_LAT = 110540;
const project = ([lon, lat]) => [(lon - LON0) * M_PER_LON, -(lat - LAT0) * M_PER_LAT];

const constructionClasses = {
  1: 'fireproof-steel',
  2: 'reinforced-concrete',
  3: 'masonry',
  4: 'wood-or-steel-studs',
  5: 'steel-frame-incombustible-envelope',
};
const improvementQuality = {
  1: 'minimum-low-cost', 2: 'below-average', 3: 'average',
  4: 'above-average', 5: 'excellent', 6: 'superior',
};

const paramsFor = (offset) => new URLSearchParams({
  where: '1=1',
  geometry: BBOX.join(','),
  geometryType: 'esriGeometryEnvelope',
  inSR: '4326',
  outSR: '4326',
  spatialRel: 'esriSpatialRelIntersects',
  outFields: FIELDS.join(','),
  returnGeometry: 'true',
  resultOffset: String(offset),
  resultRecordCount: String(PAGE_SIZE),
  f: 'geojson',
});

const features = [];
for (let offset = 0; ; offset += PAGE_SIZE) {
  const response = await fetch(`${ENDPOINT}?${paramsFor(offset)}`);
  if (!response.ok) throw new Error(`Florida cadastral request failed: ${response.status}`);
  const page = await response.json();
  if (page.error) throw new Error(page.error.message ?? JSON.stringify(page.error));
  features.push(...(page.features ?? []));
  if ((page.features?.length ?? 0) < PAGE_SIZE) break;
}

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function polygonContains(x, z, polygon) {
  if (!pointInRing(x, z, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(x, z, hole));
}

const parcels = features.map((feature) => {
  const sourcePolys = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
  const polygons = sourcePolys.map((polygon) => polygon.map((ring) => ring.map(project)));
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const polygon of polygons) for (const ring of polygon) for (const [x, z] of ring) {
    minX = Math.min(minX, x); minZ = Math.min(minZ, z); maxX = Math.max(maxX, x); maxZ = Math.max(maxZ, z);
  }
  return { properties: feature.properties, polygons, box: { minX, minZ, maxX, maxZ } };
});

const CELL = 120;
const grid = new Map();
const key = (x, z) => `${x}:${z}`;
for (const parcel of parcels) {
  for (let cx = Math.floor(parcel.box.minX / CELL); cx <= Math.floor(parcel.box.maxX / CELL); cx++) {
    for (let cz = Math.floor(parcel.box.minZ / CELL); cz <= Math.floor(parcel.box.maxZ / CELL); cz++) {
      const k = key(cx, cz);
      const bucket = grid.get(k) ?? [];
      bucket.push(parcel);
      grid.set(k, bucket);
    }
  }
}

const game = JSON.parse(readFileSync(new URL('../public/data/clewiston.json', import.meta.url), 'utf8'));
const parcelFacts = {};
const buildingParcels = {};
let matched = 0;
for (const building of game.buildings) {
  let x = 0, z = 0;
  for (const p of building.poly) { x += p[0]; z += p[1]; }
  x /= building.poly.length; z /= building.poly.length;
  const candidates = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [];
  const parcel = candidates.find((candidate) => candidate.polygons.some((polygon) => polygonContains(x, z, polygon)));
  if (!parcel) continue;
  const p = parcel.properties;
  const clean = (value) => value === null || value === '' || value === 0 ? undefined : value;
  const parcelId = clean(p.PARCEL_ID);
  if (!parcelId) continue;
  const addressLines = [p.PHY_ADDR1, p.PHY_ADDR2]
    .map((value) => String(value ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const city = String(p.PHY_CITY ?? '').replace(/\s+/g, ' ').trim();
  const zip = clean(p.PHY_ZIPCD);
  const item = {
    parcelId,
    physicalAddress: [...addressLines, city, zip].filter(Boolean).join(', ') || undefined,
    dorUseCode: clean(p.DOR_UC),
    appraiserUseCode: clean(p.PA_UC),
    improvementQuality: improvementQuality[p.IMP_QUAL] ?? clean(p.IMP_QUAL),
    constructionClass: constructionClasses[p.CONST_CLAS] ?? clean(p.CONST_CLAS),
    effectiveYearBuilt: clean(p.EFF_YR_BLT),
    actualYearBuilt: clean(p.ACT_YR_BLT),
    totalLivingAreaSqFt: clean(p.TOT_LVG_AR),
    buildingsOnParcel: clean(p.NO_BULDNG),
    specialFeatureValue: clean(p.SPEC_FEAT_),
    note: 'Parcel-level predominant-improvement data; do not assume every field describes this footprint when buildingsOnParcel > 1',
  };
  for (const name of Object.keys(item)) if (item[name] === undefined) delete item[name];
  parcelFacts[parcelId] = item;
  buildingParcels[building.id] = parcelId;
  matched++;
}

const output = {
  schemaVersion: 1,
  source: 'Florida Department of Revenue FDOR Cadastral 2025',
  sourceUrl: ENDPOINT.replace(/\/query$/, ''),
  privacy: 'Only physical/property and improvement fields were requested; owner fields were intentionally excluded.',
  stats: { parcels: parcels.length, buildingsMatched: matched, buildingsTotal: game.buildings.length },
  parcels: parcelFacts,
  buildingParcels,
};
writeFileSync(new URL('../data-src/building-context.json', import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log(`${parcels.length} parcels fetched; ${matched}/${game.buildings.length} building centroids matched`);
