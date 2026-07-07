import * as THREE from 'three';
import { hash01, polyCentroid } from './util.js';

// Business signage: for every named place, find its building footprint and
// mount a canvas-text sign on the wall nearest the place's position. Strip
// malls work naturally — each store's point sits near its own storefront
// section, so signs distribute along the shared building.

const SIGN_DIST = 240;
const SIGN_Y = 3.0;          // centered on the storefront band
const MAX_SIGN_W = 7.5;
const SIGN_H = 0.72;

// A few storefront palettes, picked per business by name hash.
const PALETTES = [
  { bg: '#a83232', fg: '#ffffff' },
  { bg: '#f2ede0', fg: '#333333' },
  { bg: '#2a4a7a', fg: '#ffffff' },
  { bg: '#1e6b3c', fg: '#f5e9c8' },
  { bg: '#333333', fg: '#f2c744' },
  { bg: '#ffffff', fg: '#a83232' },
];

const texCache = new Map();

function signTexture(name, palette) {
  const key = name + '|' + palette.bg;
  let entry = texCache.get(key);
  if (entry) return entry;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = palette.fg;
  ctx.globalAlpha = 0.5;
  ctx.strokeRect(3, 3, c.width - 6, c.height - 6);
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 40;
  const label = name.toUpperCase();
  ctx.font = `bold ${size}px 'Arial Narrow', Arial, sans-serif`;
  while (ctx.measureText(label).width > c.width - 30 && size > 16) {
    size -= 3;
    ctx.font = `bold ${size}px 'Arial Narrow', Arial, sans-serif`;
  }
  ctx.fillText(label, c.width / 2, c.height / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // aspect of the drawn label, for sizing the quad
  entry = { tex, textW: Math.min(1, (ctx.measureText(label).width + 40) / c.width) };
  texCache.set(key, entry);
  return entry;
}

// Nearest point on the polygon boundary to (x,z); returns the edge too.
function nearestEdgePoint(poly, x, z) {
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    const ex = bx - ax, ez = bz - az;
    const len2 = ex * ex + ez * ez;
    if (len2 < 0.01) continue;
    let t = ((x - ax) * ex + (z - az) * ez) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + ex * t, pz = az + ez * t;
    const d2 = (px - x) ** 2 + (pz - z) ** 2;
    if (!best || d2 < best.d2) {
      best = { d2, px, pz, ax, az, bx, bz, t, edgeLen: Math.sqrt(len2) };
    }
  }
  return best;
}

export class Signage {
  constructor(scene, buildings, places, details = {}) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = [];

    // Coarse index of buildings for nearest-footprint lookup.
    const cells = new Map();
    const CELL = 40;
    const key = (cx, cz) => cx * 100000 + cz;
    for (const b of buildings) {
      if (b.poly.length < 3) continue;
      const [cx, cz] = polyCentroid(b.poly);
      const k = key(Math.round(cx / CELL), Math.round(cz / CELL));
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(b);
    }
    const nearbyBuildings = (x, z) => {
      const out = [];
      const cx = Math.round(x / CELL), cz = Math.round(z / CELL);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const arr = cells.get(key(cx + i, cz + j));
          if (arr) out.push(...arr);
        }
      }
      return out;
    };

    const mounted = new Set(); // avoid stacking identical signs
    let count = 0;

    for (const place of places) {
      if (!place.name || place.name.length < 2) continue;
      const [x, z] = place.pos;
      // Building whose boundary is closest to the place point (within 35m).
      let best = null, bestB = null;
      for (const b of nearbyBuildings(x, z)) {
        const e = nearestEdgePoint(b.poly, x, z);
        if (e && e.d2 < 35 * 35 && (!best || e.d2 < best.d2)) { best = e; bestB = b; }
      }
      if (!best) continue;

      const dedupe = `${place.name}|${bestB.id}`;
      if (mounted.has(dedupe)) continue;
      mounted.add(dedupe);

      // Sign wall segment: edge direction + outward normal (away from centroid).
      const ex = best.bx - best.ax, ez = best.bz - best.az;
      const el = Math.hypot(ex, ez);
      const dx = ex / el, dz = ez / el;
      let nx = dz, nz = -dx;
      const [ccx, ccz] = polyCentroid(bestB.poly);
      if ((best.px - ccx) * nx + (best.pz - ccz) * nz < 0) { nx = -nx; nz = -nz; }

      const palette = PALETTES[Math.floor(hash01(place.name.length * 7 + place.name.charCodeAt(0)) * PALETTES.length)];
      const { tex, textW } = signTexture(place.name, palette);
      const w = Math.min(MAX_SIGN_W, Math.max(2.2, textW * MAX_SIGN_W), best.edgeLen - 0.5);
      if (w < 1.5) continue;

      // Keep the sign fully on its wall segment.
      const half = w / 2;
      const tMin = half / best.edgeLen, tMax = 1 - half / best.edgeLen;
      const t = Math.max(tMin, Math.min(tMax, best.t));
      const sx = best.ax + ex * t, sz = best.az + ez * t;
      const y = Math.min(SIGN_Y, Math.max(2.2, (bestB.height ?? 4) - 0.6));

      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, SIGN_H),
        new THREE.MeshBasicMaterial({ map: tex })
      );
      mesh.position.set(sx + nx * 0.09, y, sz + nz * 0.09);
      mesh.rotation.y = Math.atan2(nx, nz);
      mesh.visible = false;
      this.group.add(mesh);
      this.items.push({ obj: mesh, x: sx, z: sz });
      count++;
    }

    this.cooldown = 0;
    console.log(`signage: ${count} business signs mounted`);
  }

  update(dt, playerPos) {
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    this.cooldown = 0.5;
    for (const it of this.items) {
      const dx = it.x - playerPos.x, dz = it.z - playerPos.z;
      it.obj.visible = dx * dx + dz * dz < SIGN_DIST * SIGN_DIST;
    }
  }
}
