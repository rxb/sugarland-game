import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, hash01, pointInPoly, polyArea, SpatialGrid } from './util.js';
import { facadeMaterials, MODULE } from './facades.js';
import { buildSidewalks } from './sidewalks.js';

const HOUSE_TYPES = new Set(['house', 'detached', 'residential', 'yes', 'static_caravan', 'mobile_home', 'bungalow']);

const HOUSE_WALLS = ['#f7f3e8', '#f2d8a7', '#eab6a2', '#bfd8c2', '#cfd9e8', '#f5efe0', '#e8c9b8', '#d9e4d0', '#f0e2c8'];
const HOUSE_ROOFS = ['#7a5b47', '#6b6f76', '#8a4f3d', '#5d6b5d', '#54575e', '#75524a'];
const COMMERCIAL_WALLS = ['#e8dcc0', '#d9c6a5', '#cfae88', '#e0d5c5', '#d6c3b0'];

const COLORS = {
  grass: new THREE.Color('#8fb573'),
  green: new THREE.Color('#7fae62'),
  golf: new THREE.Color('#83bd6a'),
  water: new THREE.Color('#4d9ec4'),
  asphalt: new THREE.Color('#565a61'),
  asphaltMinor: new THREE.Color('#63666d'),
  service: new THREE.Color('#8d8f94'),
  centerLine: new THREE.Color('#e8c04a'),
  palmTrunk: new THREE.Color('#a08050'),
  palmFrond: new THREE.Color('#3e8948'),
  oakCrown: new THREE.Color('#4f9146'),
};

function wallColorFor(b) {
  const h = hash01(b.id);
  const t = b.type;
  if (t === 'church' || t === 'place_of_worship') return new THREE.Color('#faf7ef');
  if (t === 'industrial' || t === 'warehouse' || t === 'hangar') return new THREE.Color('#c8cbd0');
  if (t === 'commercial' || t === 'retail' || t === 'supermarket' || t === 'school' || t === 'public' || t === 'civic') {
    return new THREE.Color(COMMERCIAL_WALLS[Math.floor(h * COMMERCIAL_WALLS.length)]);
  }
  return new THREE.Color(HOUSE_WALLS[Math.floor(h * HOUSE_WALLS.length)]);
}

function roofColorFor(b) {
  const h = hash01(b.id * 7 + 3);
  if (b.type === 'church' || b.type === 'place_of_worship') return new THREE.Color('#5a616e');
  if (b.type === 'industrial' || b.type === 'warehouse') return new THREE.Color('#9aa0a8');
  return new THREE.Color(HOUSE_ROOFS[Math.floor(h * HOUSE_ROOFS.length)]);
}



// Minimum-area oriented rectangle over the footprint, for gable roof placement.
function orientedRect(poly) {
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const dx = poly[j][0] - poly[i][0], dz = poly[j][1] - poly[i][1];
    const len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    const ux = dx / len, uz = dz / len;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [x, z] of poly) {
      const u = x * ux + z * uz;
      const v = -x * uz + z * ux;
      if (u < minU) minU = u; if (u > maxU) maxU = u;
      if (v < minV) minV = v; if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) {
      best = { area, ux, uz, minU, maxU, minV, maxV };
    }
  }
  if (!best) return null;
  const cu = (best.minU + best.maxU) / 2, cv = (best.minV + best.maxV) / 2;
  // Back to world: p = u*(ux,uz) + v*(-uz,ux)
  const cx = cu * best.ux - cv * best.uz;
  const cz = cu * best.uz + cv * best.ux;
  let halfL = (best.maxU - best.minU) / 2, halfW = (best.maxV - best.minV) / 2;
  let ux = best.ux, uz = best.uz;
  if (halfW > halfL) {
    // Swap so u is always the long (ridge) axis.
    [halfL, halfW] = [halfW, halfL];
    const t = ux; ux = -uz; uz = t;
  }
  return { cx, cz, ux, uz, halfL, halfW };
}

// Simple gabled roof prism sitting on top of the walls.
function gableRoofGeometry(rect, wallTop, roofColor) {
  const { cx, cz, ux, uz, halfL, halfW } = rect;
  const vx = -uz, vz = ux;
  const L = halfL + 0.35, W = halfW + 0.35;
  const rise = Math.min(halfW * 0.75, 2.4);
  const p = (u, v, y) => [cx + u * ux + v * vx, y, cz + u * uz + v * vz];
  const a = p(-L, -W, wallTop), b = p(L, -W, wallTop);
  const c = p(L, W, wallTop), d = p(-L, W, wallTop);
  const r1 = p(-L, 0, wallTop + rise), r2 = p(L, 0, wallTop + rise);
  const tris = [
    a, b, r2, a, r2, r1,      // slope 1
    c, d, r1, c, r1, r2,      // slope 2
    b, c, r2,                 // gable end
    d, a, r1,                 // gable end
    b, a, d, b, d, c,         // underside cap (rarely visible)
  ];
  const pos = new Float32Array(tris.length * 3);
  const col = new Float32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++) {
    pos.set(tris[i], i * 3);
    col[i * 3] = roofColor.r; col[i * 3 + 1] = roofColor.g; col[i * 3 + 2] = roofColor.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

// Triangulated ribbon along a polyline. Returns raw positions at height y.
function ribbonPositions(path, width, y) {
  if (path.length < 2) return [];
  const half = width / 2;
  const left = [], right = [];
  for (let i = 0; i < path.length; i++) {
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(path.length - 1, i + 1)];
    let dx = next[0] - prev[0], dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const px = -dz, pz = dx;
    left.push([path[i][0] + px * half, path[i][1] + pz * half]);
    right.push([path[i][0] - px * half, path[i][1] - pz * half]);
  }
  const out = [];
  for (let i = 0; i < path.length - 1; i++) {
    out.push(
      left[i][0], y, left[i][1], right[i][0], y, right[i][1], left[i + 1][0], y, left[i + 1][1],
      right[i][0], y, right[i][1], right[i + 1][0], y, right[i + 1][1], left[i + 1][0], y, left[i + 1][1],
    );
  }
  return out;
}

// Dashed center-line quads along a path, for major roads.
function dashPositions(path, y) {
  const out = [];
  const dashLen = 4, gapLen = 6, halfW = 0.22;
  let carry = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const ax = path[i][0], az = path[i][1];
    let dx = path[i + 1][0] - ax, dz = path[i + 1][1] - az;
    const segLen = Math.hypot(dx, dz);
    if (segLen < 0.01) continue;
    dx /= segLen; dz /= segLen;
    const px = -dz, pz = dx;
    let s = carry;
    while (s + dashLen < segLen) {
      const x0 = ax + dx * s, z0 = az + dz * s;
      const x1 = ax + dx * (s + dashLen), z1 = az + dz * (s + dashLen);
      out.push(
        x0 + px * halfW, y, z0 + pz * halfW, x0 - px * halfW, y, z0 - pz * halfW, x1 + px * halfW, y, z1 + pz * halfW,
        x0 - px * halfW, y, z0 - pz * halfW, x1 - px * halfW, y, z1 - pz * halfW, x1 + px * halfW, y, z1 + pz * halfW,
      );
      s += dashLen + gapLen;
    }
    carry = Math.max(0, s - segLen);
  }
  return out;
}

function flatPolyGeometry(poly, y, color) {
  const shape = new THREE.Shape();
  shape.moveTo(poly[0][0], -poly[0][1]);
  for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i][0], -poly[i][1]);
  shape.closePath();
  let geo = new THREE.ShapeGeometry(shape);
  geo = geo.toNonIndexed(); // keep all flat geometry non-indexed so it merges with ribbons
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  geo.deleteAttribute('uv');
  const count = geo.getAttribute('position').count;
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function meshFromPositions(positionsArrays, colors) {
  let total = 0;
  for (const p of positionsArrays) total += p.length;
  const pos = new Float32Array(total);
  const col = new Float32Array(total);
  let off = 0;
  for (let k = 0; k < positionsArrays.length; k++) {
    const p = positionsArrays[k];
    const c = colors[k];
    pos.set(p, off);
    for (let i = 0; i < p.length; i += 3) {
      col[off + i] = c.r; col[off + i + 1] = c.g; col[off + i + 2] = c.b;
    }
    off += p.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildTrees(scene, data, collisionGrid, roadMask, rng, treeData = []) {
  const palmMats = [], oakMats = [], cypressMats = [];

  // Canal / water proximity — cypress country.
  const canalGrid = new SpatialGrid(45);
  for (const c of data.canals) {
    for (let i = 0; i < c.path.length - 1; i++) {
      const [ax, az] = c.path[i], [bx, bz] = c.path[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 20));
      for (let s = 0; s <= steps; s++) {
        canalGrid.markPoint(ax + (bx - ax) * (s / steps), az + (bz - az) * (s / steps));
      }
    }
  }
  for (const w of data.water) for (const [x, z] of w.poly) canalGrid.markPoint(x, z);

  const nearRoad = (x, z) => {
    for (const [ox, oz] of [[0, 0], [9, 0], [-9, 0], [0, 9], [0, -9]]) {
      if (roadMask.isMarked(x + ox, z + oz)) return true;
    }
    return false;
  };

  const place = (mats, x, z, sxz, sy, rot) => {
    const m = new THREE.Matrix4();
    m.makeRotationY(rot);
    m.scale(new THREE.Vector3(sxz, sy, sxz));
    m.setPosition(x, 0, z);
    mats.push(m);
  };

  if (treeData.length) {
    // Real trees from NAIP canopy detection; species by simple habitat rules.
    for (const [x, z, r] of treeData) {
      if (roadMask.isMarked(x, z)) continue;
      let blocked = false;
      for (const b of collisionGrid.query(x, z)) {
        if (pointInPoly(x, z, b.poly)) { blocked = true; break; }
      }
      if (blocked) continue;
      const h = hash01(x * 13.37 + z * 7.77);
      const rot = h * Math.PI * 2;
      if (canalGrid.isMarked(x, z) && h < 0.6) {
        place(cypressMats, x, z, Math.min(1.8, Math.max(0.7, r / 1.7)), 0.85 + h * 0.5, rot);
      } else if (r < 2.4 && (nearRoad(x, z) ? h < 0.6 : h < 0.25)) {
        place(palmMats, x, z, 0.85 + h * 0.3, 0.8 + h * 0.6, rot);
      } else {
        place(oakMats, x, z, Math.min(2.1, Math.max(0.6, r / 2.4)), 0.85 + h * 0.4, rot);
      }
    }
  } else {
    // Fallback: deterministic scatter (pre-NAIP behavior).
    for (let i = 0; i < 9000; i++) {
      const x = -2500 + rng() * 4850, z = -800 + rng() * 3600;
      if (roadMask.isMarked(x, z)) continue;
      let blocked = false;
      for (const b of collisionGrid.query(x, z)) {
        if (pointInPoly(x, z, b.poly)) { blocked = true; break; }
      }
      if (blocked || rng() > 0.16) continue;
      const s = 0.75 + rng() * 0.7;
      place(rng() < 0.6 ? palmMats : oakMats, x, z, s, s * (0.85 + rng() * 0.4), rng() * Math.PI * 2);
    }
  }

  // Royal palms lining BOTH sides of US 27 through town — real, but their
  // thin bright fronds evade RGB canopy detection, so they're planted
  // explicitly in the verges (between roadway and sidewalk).
  const palmClear = (x, z) => {
    if (roadMask.isMarked(x, z)) return false;
    for (const b of collisionGrid.query(x, z)) {
      if (pointInPoly(x, z, b.poly)) return false;
    }
    return true;
  };
  for (const road of data.roads) {
    if (road.kind !== 'trunk') continue;
    const off = road.width / 2 + 2.6;
    let carry = 17;
    for (let i = 0; i < road.path.length - 1; i++) {
      const [ax, az] = road.path[i], [bx, bz] = road.path[i + 1];
      const segLen = Math.hypot(bx - ax, bz - az);
      if (segLen < 0.01) continue;
      const dx = (bx - ax) / segLen, dz = (bz - az) / segLen;
      const nx = -dz, nz = dx;
      let s = carry;
      while (s < segLen) {
        const cx = ax + dx * s, cz = az + dz * s;
        if (Math.abs(cx) < 1500 && Math.abs(cz) < 600) {
          for (const side of [1, -1]) {
            const px = cx + nx * off * side, pz = cz + nz * off * side;
            if (!palmClear(px, pz)) continue;
            const h = hash01(px + pz);
            place(palmMats, px, pz, 1.15, 1.55 + h * 0.35, h * Math.PI * 2);
          }
        }
        s += 34;
      }
      carry = s - segLen;
    }
  }

  // Palm: bare trunk + starburst of drooping fronds.
  const palmTrunk = new THREE.CylinderGeometry(0.14, 0.26, 5.2, 6);
  palmTrunk.translate(0, 2.6, 0);
  const frondPieces = [];
  for (let i = 0; i < 6; i++) {
    const f = new THREE.BoxGeometry(2.6, 0.08, 0.5);
    f.translate(1.2, 0, 0);
    const m = new THREE.Matrix4().makeRotationY((i / 6) * Math.PI * 2);
    m.multiply(new THREE.Matrix4().makeRotationZ(-0.45));
    f.applyMatrix4(m);
    f.translate(0, 5.3, 0);
    frondPieces.push(f);
  }
  const palmCrown = mergeGeometries(frondPieces);

  // Oak: chunky trunk + squashed sphere crown.
  const oakTrunk = new THREE.CylinderGeometry(0.22, 0.34, 2.4, 6);
  oakTrunk.translate(0, 1.2, 0);
  const oakCrown = new THREE.SphereGeometry(2.4, 8, 6);
  oakCrown.scale(1, 0.75, 1);
  oakCrown.translate(0, 3.4, 0);

  // Cypress: buttressed trunk + tall feathery cone.
  const cypressTrunk = new THREE.CylinderGeometry(0.16, 0.42, 3.2, 6);
  cypressTrunk.translate(0, 1.6, 0);
  const cypressCrown = new THREE.ConeGeometry(1.7, 8.5, 7);
  cypressCrown.translate(0, 6.9, 0);

  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const groups = [
    [palmTrunk, palmMats, mat(COLORS.palmTrunk)],
    [palmCrown, palmMats, mat(COLORS.palmFrond)],
    [oakTrunk, oakMats, mat(new THREE.Color('#7a5f42'))],
    [oakCrown, oakMats, mat(COLORS.oakCrown)],
    [cypressTrunk, cypressMats, mat(new THREE.Color('#6e5844'))],
    [cypressCrown, cypressMats, mat(new THREE.Color('#5a7c4a'))],
  ];
  for (const [geo, mats, material] of groups) {
    if (!mats.length) continue;
    const im = new THREE.InstancedMesh(geo, material, mats.length);
    for (let i = 0; i < mats.length; i++) im.setMatrixAt(i, mats[i]);
    im.castShadow = true;
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
  }
  return palmMats.length + oakMats.length + cypressMats.length;
}

const DOOR_COLORS = ['#5a3a2e', '#3a4a6b', '#6e2f2a', '#2f4f3f', '#e8e4da', '#8a2f2a'];

// Which facade texture a building gets.
function archetypeFor(b, height, area) {
  const t = b.type;
  if (t === 'shed' || t === 'garage' || t === 'carport') return 'plain';
  if (t === 'industrial' || t === 'warehouse' || t === 'hangar' || t === 'barn') return 'industrial';
  if (t === 'commercial' || t === 'retail' || t === 'supermarket') return 'storefront';
  if (t === 'school' || t === 'public' || t === 'civic' || t === 'church' || t === 'place_of_worship') return 'commercial';
  if (area > 450 || height > 6.8) return 'commercial';
  return 'house';
}

// Append one vertical wall quad (two triangles) with tiling facade UVs.
function addWall(bucket, ax, az, bx, bz, y0, y1, color, uPerM, v0, v1) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.05) return;
  let nx = bz - az, nz = -(bx - ax);
  const nl = Math.hypot(nx, nz);
  nx /= nl; nz /= nl;
  const u1 = len * uPerM;
  const verts = [
    [ax, y0, az, 0, v0], [bx, y0, bz, u1, v0], [bx, y1, bz, u1, v1],
    [ax, y0, az, 0, v0], [bx, y1, bz, u1, v1], [ax, y1, az, 0, v1],
  ];
  for (const [x, y, z, u, v] of verts) {
    bucket.pos.push(x, y, z);
    bucket.nor.push(nx, 0, nz);
    bucket.uv.push(u, v);
    bucket.col.push(color.r, color.g, color.b);
  }
}

export function buildWorld(scene, data, details = {}, roofColors = {}, trees = []) {
  const rng = mulberry32(1928); // year Clewiston incorporated
  const collisionGrid = new SpatialGrid(24);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(50000, 50000),
    new THREE.MeshLambertMaterial({ color: COLORS.grass })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Buildings — textured facade walls bucketed by archetype, plus a merged
  // untextured mesh for roof caps, gables, and door decals.
  const materials = facadeMaterials();
  const buckets = {};
  for (const key of Object.keys(materials)) {
    buckets[key] = { pos: [], nor: [], uv: [], col: [] };
  }
  const roofGeos = [];
  const doorBucket = { pos: [], nor: [], uv: null, col: [] };
  let builtCount = 0, skippedCount = 0;

  for (const b of data.buildings) {
    if (b.poly.length < 3) { skippedCount++; continue; }
    // Appearance overrides: photo-derived details, then NAIP roof colors.
    const det = details[b.id];
    const wall = det?.wall ? new THREE.Color(det.wall) : wallColorFor(b);
    const roof = det?.roof?.color
      ? new THREE.Color(det.roof.color)
      : roofColors[b.id]
        ? new THREE.Color(roofColors[b.id])
        : roofColorFor(b);
    const height = det?.height ?? (det?.stories ? det.stories * 3.4 : b.height);
    const area = polyArea(b.poly);
    const arch = archetypeFor(b, height, area);
    const uPerM = 1 / MODULE.width;

    try {
      // Walls, edge by edge.
      for (let i = 0; i < b.poly.length; i++) {
        const [ax, az] = b.poly[i];
        const [bx, bz] = b.poly[(i + 1) % b.poly.length];
        if (arch === 'storefront' && height > 4.4) {
          // Ground-floor storefront band + stucco upper floors.
          addWall(buckets.storefront, ax, az, bx, bz, 0, 3.4, wall, uPerM, 0, 1);
          // Whole window rows only: stretch the module rather than clipping it.
          const upperFloors = Math.max(1, Math.round((height - 3.4) / MODULE.height));
          addWall(buckets.commercial, ax, az, bx, bz, 3.4, height, wall, uPerM, 0, upperFloors);
        } else {
          const floors = Math.max(1, Math.round(height / MODULE.height));
          addWall(buckets[arch], ax, az, bx, bz, 0, height, wall, uPerM, 0, floors);
        }
      }

      // Roof cap + optional gable.
      roofGeos.push(flatPolyGeometry(b.poly, height, roof));
      const wantGable = det?.roof?.type
        ? det.roof.type === 'gable'
        : HOUSE_TYPES.has(b.type) && area < 350 && b.poly.length <= 10;
      if (wantGable) {
        const rect = orientedRect(b.poly);
        if (rect && rect.halfW > 1.2) roofGeos.push(gableRoofGeometry(rect, height, roof));
      }

      // Front door decal on houses: longest edge, centered.
      if (arch === 'house' || arch === 'plain') {
        let bi = 0, bl = 0;
        for (let i = 0; i < b.poly.length; i++) {
          const [ax, az] = b.poly[i];
          const [bx, bz] = b.poly[(i + 1) % b.poly.length];
          const l = Math.hypot(bx - ax, bz - az);
          if (l > bl) { bl = l; bi = i; }
        }
        if (bl > 3) {
          const [ax, az] = b.poly[bi];
          const [bx, bz] = b.poly[(bi + 1) % b.poly.length];
          const mx = (ax + bx) / 2, mz = (az + bz) / 2;
          let dx = (bx - ax) / bl, dz = (bz - az) / bl;
          let nx = dz, nz = -dx;
          const doorColor = new THREE.Color(DOOR_COLORS[Math.floor(hash01(b.id * 3 + 1) * DOOR_COLORS.length)]);
          // Quad 1.1m wide x 2.25m tall pushed 6cm out from both wall sides.
          for (const side of [1, -1]) {
            const ox = mx + nx * 0.06 * side, oz = mz + nz * 0.06 * side;
            const hw = 0.55;
            const q = [
              [ox - dx * hw, 0, oz - dz * hw], [ox + dx * hw, 0, oz + dz * hw], [ox + dx * hw, 2.25, oz + dz * hw],
              [ox - dx * hw, 0, oz - dz * hw], [ox + dx * hw, 2.25, oz + dz * hw], [ox - dx * hw, 2.25, oz - dz * hw],
            ];
            for (const [x, y, z] of q) {
              doorBucket.pos.push(x, y, z);
              doorBucket.nor.push(nx * side, 0, nz * side);
              doorBucket.col.push(doorColor.r, doorColor.g, doorColor.b);
            }
          }
        }
      }
      builtCount++;
    } catch (e) {
      skippedCount++;
      continue; // skip degenerate footprints
    }
    collisionGrid.insertPoly(b.poly, b);
  }

  console.log(`buildings: ${builtCount}/${data.buildings.length} built, ${skippedCount} skipped`);

  for (const [key, bucket] of Object.entries(buckets)) {
    if (!bucket.pos.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bucket.pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(bucket.nor), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bucket.uv), 2));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(bucket.col), 3));
    const mesh = new THREE.Mesh(geo, materials[key]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  for (const g of roofGeos) { g.deleteAttribute('uv'); }
  const roofsMesh = new THREE.Mesh(
    mergeGeometries(roofGeos),
    new THREE.MeshLambertMaterial({ vertexColors: true, side: 2 })
  );
  roofsMesh.castShadow = true;
  roofsMesh.receiveShadow = true;
  scene.add(roofsMesh);

  if (doorBucket.pos.length) {
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(doorBucket.pos), 3));
    dg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(doorBucket.nor), 3));
    dg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(doorBucket.col), 3));
    scene.add(new THREE.Mesh(dg, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  // Roads — flat ribbons; mask cells so trees don't spawn on pavement.
  const roadMask = new SpatialGrid(9);
  const roadPos = [], roadCol = [], linePos = [];
  for (const r of data.roads) {
    const y = 0.05 + hash01(r.path[0][0] + r.path[0][1]) * 0.02;
    roadPos.push(ribbonPositions(r.path, r.width, y));
    roadCol.push(r.kind === 'service' || r.kind === 'track' ? COLORS.service
      : r.major ? COLORS.asphalt : COLORS.asphaltMinor);
    if (r.major) linePos.push(dashPositions(r.path, y + 0.03));
    for (let i = 0; i < r.path.length - 1; i++) {
      const [ax, az] = r.path[i], [bx, bz] = r.path[i + 1];
      const segLen = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(segLen / 6));
      for (let s = 0; s <= steps; s++) {
        roadMask.markPoint(ax + (bx - ax) * (s / steps), az + (bz - az) * (s / steps));
      }
    }
  }
  const roadsMesh = new THREE.Mesh(
    meshFromPositions(roadPos, roadCol),
    new THREE.MeshLambertMaterial({ vertexColors: true, side: 2 })
  );
  roadsMesh.receiveShadow = true;
  scene.add(roadsMesh);

  // Sidewalks along the town grid; mark them so trees stay off the pavement.
  const { mesh: sidewalkMesh, walkPoints } = buildSidewalks(data.roads);
  sidewalkMesh.receiveShadow = true;
  scene.add(sidewalkMesh);
  for (const [wx, wz] of walkPoints) roadMask.markPoint(wx, wz);
  if (linePos.length) {
    const linesMesh = new THREE.Mesh(
      meshFromPositions(linePos, linePos.map(() => COLORS.centerLine)),
      new THREE.MeshBasicMaterial({ vertexColors: true, side: 2 })
    );
    scene.add(linesMesh);
  }

  // Water bodies + canals
  const waterGeos = [];
  for (const w of data.water) {
    if (w.poly.length < 3) continue;
    try { waterGeos.push(flatPolyGeometry(w.poly, 0.03, COLORS.water)); } catch (e) { /* skip */ }
  }
  const canalPos = data.canals.map((c) => ribbonPositions(c.path, c.width, 0.03));
  if (canalPos.length) {
    const canalGeo = meshFromPositions(canalPos, canalPos.map(() => COLORS.water));
    waterGeos.push(canalGeo);
  }
  if (waterGeos.length) {
    for (const g of waterGeos) g.deleteAttribute('uv');
    const waterMesh = new THREE.Mesh(
      mergeGeometries(waterGeos),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: 2 })
    );
    scene.add(waterMesh);
  }

  // Parks / pitches / the golf course
  const greenGeos = [];
  for (const g of data.green) {
    if (g.poly.length < 3) continue;
    const c = g.kind === 'golf_course' ? COLORS.golf : COLORS.green;
    try { greenGeos.push(flatPolyGeometry(g.poly, 0.02, c)); } catch (e) { /* skip */ }
  }
  if (greenGeos.length) {
    for (const g of greenGeos) g.deleteAttribute('uv');
    const greenMesh = new THREE.Mesh(
      mergeGeometries(greenGeos),
      new THREE.MeshLambertMaterial({ vertexColors: true })
    );
    greenMesh.receiveShadow = true;
    scene.add(greenMesh);
  }

  const treeCount = buildTrees(scene, data, collisionGrid, roadMask, rng, trees);
  console.log(`trees: ${treeCount} planted (${trees.length ? 'NAIP canopy data' : 'procedural scatter'})`);

  return { collisionGrid, treeCount };
}
