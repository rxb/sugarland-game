#!/usr/bin/env node
// Fetch OpenStreetMap data for Clewiston, FL from the Overpass API and
// convert it into game-ready JSON for the Three.js walking sim.
//
// Plain Node, no dependencies. Uses global fetch (Node 18+).

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(PROJECT_ROOT, "public", "data", "clewiston.json");

const BBOX = { south: 26.72, west: -80.96, north: 26.78, east: -80.88 };

const ORIGIN = { lat: 26.754, lon: -80.9335 };

const PRIMARY_ENDPOINT = "https://overpass-api.de/api/interpreter";
const FALLBACK_ENDPOINT = "https://overpass.kumi.systems/api/interpreter";

const QUERY = `
[out:json][timeout:120];
(
  way["building"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  way["highway"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  way["natural"="water"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  way["waterway"~"^(canal|river|ditch|stream)$"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  way["leisure"~"^(park|pitch|golf_course|playground)$"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  node["name"]["amenity"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  node["name"]["shop"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  node["name"]["tourism"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
);
out geom;
`.trim();

// ---------- Networking ----------

async function postOverpass(endpoint, query) {
  const body = "data=" + encodeURIComponent(query);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "*/*",
      "User-Agent":
        "sugarland-clewiston-game-data-pipeline/1.0 (contact: boenigk@gmail.com)",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Overpass request to ${endpoint} failed: ${res.status} ${res.statusText}\n${text.slice(0, 500)}`
    );
  }
  return res.json();
}

async function fetchOsmData() {
  // Try primary endpoint, then retry once, then fall back.
  try {
    console.log(`Requesting Overpass data from ${PRIMARY_ENDPOINT} ...`);
    return await postOverpass(PRIMARY_ENDPOINT, QUERY);
  } catch (err) {
    console.warn(`First attempt against primary endpoint failed: ${err.message}`);
    console.warn("Retrying primary endpoint once...");
    try {
      return await postOverpass(PRIMARY_ENDPOINT, QUERY);
    } catch (err2) {
      console.warn(`Retry against primary endpoint failed: ${err2.message}`);
      console.warn(`Falling back to ${FALLBACK_ENDPOINT} ...`);
      return await postOverpass(FALLBACK_ENDPOINT, QUERY);
    }
  }
}

// ---------- Projection ----------

const lat0Rad = (ORIGIN.lat * Math.PI) / 180;

function project(lat, lon) {
  const x = (lon - ORIGIN.lon) * 111320 * Math.cos(lat0Rad);
  const z = -(lat - ORIGIN.lat) * 110540;
  return [round2(x), round2(z)];
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---------- Helpers ----------

function fract(n) {
  return n - Math.floor(n);
}

function projectWayGeometry(way) {
  // way.geometry is an array of {lat, lon} from `out geom;`
  if (!Array.isArray(way.geometry)) return null;
  return way.geometry
    .filter((pt) => pt && typeof pt.lat === "number" && typeof pt.lon === "number")
    .map((pt) => project(pt.lat, pt.lon));
}

function closePolyDropDuplicate(points) {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return points.slice(0, -1);
  }
  return points;
}

function centroid(points) {
  let sx = 0;
  let sz = 0;
  for (const [x, z] of points) {
    sx += x;
    sz += z;
  }
  return [round2(sx / points.length), round2(sz / points.length)];
}

// ---------- Building classification ----------

const HEIGHT_BY_TYPE = {
  house: 4,
  detached: 4,
  residential: 4,
  static_caravan: 4,
  mobile_home: 4,
  garage: 2.8,
  shed: 2.8,
  carport: 2.8,
  church: 8,
  place_of_worship: 8,
  school: 5.5,
  public: 5.5,
  civic: 5.5,
  commercial: 5,
  retail: 5,
  supermarket: 5,
  industrial: 7,
  warehouse: 7,
  hangar: 7,
  apartments: 7,
  hotel: 7,
  motel: 7,
};

function classifyBuildingType(tags) {
  const building = tags.building;
  if (building === "yes") {
    if (tags.amenity === "place_of_worship") return "church";
    if (tags.shop || tags.amenity) return "commercial";
  }
  return building;
}

function baseHeightForType(type) {
  return HEIGHT_BY_TYPE[type] !== undefined ? HEIGHT_BY_TYPE[type] : 4.2;
}

function computeBuildingHeight(way, type) {
  const tags = way.tags || {};
  let height;
  if (tags.height) {
    const parsed = parseFloat(tags.height);
    if (!Number.isNaN(parsed)) height = parsed;
  }
  if (height === undefined && tags["building:levels"]) {
    const levels = parseFloat(tags["building:levels"]);
    if (!Number.isNaN(levels)) height = levels * 3.2;
  }
  if (height === undefined) {
    height = baseHeightForType(type);
  }
  const variation = 0.9 + 0.2 * fract(way.id * 0.6180339887);
  height *= variation;
  return round2(height);
}

// ---------- Road classification ----------

const SKIP_HIGHWAY_KINDS = new Set([
  "footway",
  "path",
  "steps",
  "cycleway",
  "pedestrian",
  "bridleway",
  "corridor",
  "proposed",
  "construction",
]);

const ROAD_WIDTH_BY_KIND = {
  motorway: 15,
  trunk: 15,
  primary: 13,
  secondary: 11,
  tertiary: 9,
  residential: 7,
  unclassified: 7,
  service: 4.5,
  track: 3.5,
};

const MAJOR_ROAD_KINDS = new Set(["motorway", "trunk", "primary", "secondary"]);

function roadWidthForKind(kind) {
  return ROAD_WIDTH_BY_KIND[kind] !== undefined ? ROAD_WIDTH_BY_KIND[kind] : 6;
}

// ---------- Waterway classification ----------

const CANAL_WIDTH_BY_KIND = {
  river: 14,
  canal: 10,
  stream: 5,
  ditch: 3,
};

function canalWidthForKind(kind) {
  return CANAL_WIDTH_BY_KIND[kind] !== undefined ? CANAL_WIDTH_BY_KIND[kind] : 6;
}

// ---------- Main processing ----------

function processElements(elements) {
  const buildings = [];
  const roads = [];
  const water = [];
  const canals = [];
  const green = [];
  const pois = [];

  const poiNames = new Set();

  let skippedWays = 0;

  // Separate nodes and ways for clarity.
  const ways = elements.filter((el) => el.type === "way");
  const nodes = elements.filter((el) => el.type === "node");

  // Named nodes -> POIs first (dedupe by name, keep first).
  for (const node of nodes) {
    const tags = node.tags || {};
    const name = tags.name;
    if (!name) continue;
    if (poiNames.has(name)) continue;
    const kind = tags.amenity || tags.shop || tags.tourism;
    if (!kind) continue;
    if (typeof node.lat !== "number" || typeof node.lon !== "number") {
      skippedWays++;
      continue;
    }
    const [x, z] = project(node.lat, node.lon);
    pois.push({ pos: [x, z], name, kind });
    poiNames.add(name);
  }

  for (const way of ways) {
    const tags = way.tags || {};
    const rawPoints = projectWayGeometry(way);

    if (!rawPoints || rawPoints.length === 0) {
      skippedWays++;
      continue;
    }

    // Buildings
    if (tags.building) {
      if (rawPoints.length < 3) {
        skippedWays++;
      } else {
        const poly = closePolyDropDuplicate(rawPoints);
        if (poly.length < 3) {
          skippedWays++;
        } else {
          const type = classifyBuildingType(tags);
          const height = computeBuildingHeight(way, type);
          const building = {
            id: way.id,
            poly,
            height,
            type,
          };
          if (tags.name) building.name = tags.name;
          buildings.push(building);

          // Named building -> POI (unless a POI with that name already exists)
          if (tags.name && !poiNames.has(tags.name)) {
            const pos = centroid(poly);
            pois.push({ pos, name: tags.name, kind: type });
            poiNames.add(tags.name);
          }
        }
      }
    }

    // Roads
    if (tags.highway) {
      const kind = tags.highway;
      if (SKIP_HIGHWAY_KINDS.has(kind)) {
        // skip silently, not a geometry error
      } else if (rawPoints.length < 2) {
        skippedWays++;
      } else {
        const road = {
          path: rawPoints,
          width: roadWidthForKind(kind),
          kind,
          major: MAJOR_ROAD_KINDS.has(kind),
        };
        if (tags.name) road.name = tags.name;
        roads.push(road);
      }
    }

    // Water (natural=water)
    if (tags.natural === "water") {
      if (rawPoints.length < 3) {
        skippedWays++;
      } else {
        const poly = closePolyDropDuplicate(rawPoints);
        if (poly.length < 3) {
          skippedWays++;
        } else {
          water.push({ poly });
        }
      }
    }

    // Canals / waterways
    if (tags.waterway && /^(canal|river|ditch|stream)$/.test(tags.waterway)) {
      if (rawPoints.length < 2) {
        skippedWays++;
      } else {
        canals.push({ path: rawPoints, width: canalWidthForKind(tags.waterway) });
      }
    }

    // Green / leisure
    if (tags.leisure && /^(park|pitch|golf_course|playground)$/.test(tags.leisure)) {
      if (rawPoints.length < 3) {
        skippedWays++;
      } else {
        const poly = closePolyDropDuplicate(rawPoints);
        if (poly.length < 3) {
          skippedWays++;
        } else {
          green.push({ poly, kind: tags.leisure });
        }
      }
    }
  }

  return { buildings, roads, water, canals, green, pois, skippedWays };
}

// ---------- Summary / verification ----------

function extentsOf(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

function collectAllPoints(data) {
  const pts = [];
  for (const b of data.buildings) pts.push(...b.poly);
  for (const r of data.roads) pts.push(...r.path);
  for (const w of data.water) pts.push(...w.poly);
  for (const c of data.canals) pts.push(...c.path);
  for (const g of data.green) pts.push(...g.poly);
  for (const p of data.pois) pts.push(p.pos);
  return pts;
}

async function main() {
  const osmData = await fetchOsmData();
  const elements = osmData.elements || [];
  console.log(`Received ${elements.length} elements from Overpass.`);

  const { buildings, roads, water, canals, green, pois, skippedWays } =
    processElements(elements);

  const output = {
    origin: ORIGIN,
    buildings,
    roads,
    water,
    canals,
    green,
    pois,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const json = JSON.stringify(output);
  await writeFile(OUTPUT_PATH, json, "utf8");

  // ---- Verification ----
  const stat = await import("node:fs/promises").then((fs) => fs.stat(OUTPUT_PATH));
  const fileSizeMB = stat.size / (1024 * 1024);

  const raw = await import("node:fs/promises").then((fs) =>
    fs.readFile(OUTPUT_PATH, "utf8")
  );
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("ERROR: output file does not parse as valid JSON:", err.message);
    process.exitCode = 1;
    return;
  }

  const allPoints = collectAllPoints(parsed);
  const { minX, maxX, minZ, maxZ } = extentsOf(allPoints);

  console.log("\n=== Clewiston OSM data pipeline summary ===");
  console.log(`Output file: ${OUTPUT_PATH}`);
  console.log(`File size: ${fileSizeMB.toFixed(3)} MB`);
  console.log("Counts by category:");
  console.log(`  buildings: ${parsed.buildings.length}`);
  console.log(`  roads:     ${parsed.roads.length}`);
  console.log(`  water:     ${parsed.water.length}`);
  console.log(`  canals:    ${parsed.canals.length}`);
  console.log(`  green:     ${parsed.green.length}`);
  console.log(`  pois:      ${parsed.pois.length}`);
  console.log(`Ways skipped due to bad/insufficient geometry: ${skippedWays}`);
  console.log(
    `Extents: x [${minX.toFixed(2)}, ${maxX.toFixed(2)}], z [${minZ.toFixed(2)}, ${maxZ.toFixed(2)}]`
  );
  console.log("Sample POI names:");
  for (const p of parsed.pois.slice(0, 5)) {
    console.log(`  - ${p.name} (${p.kind})`);
  }
  console.log("=== Done ===");
}

main().catch((err) => {
  console.error("Fatal error running fetch-osm.mjs:", err);
  process.exitCode = 1;
});
