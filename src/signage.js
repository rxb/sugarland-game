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
const freestandingTexCache = new Map();

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

function freestandingPanelTexture(panel) {
  const bg = panel.bg ?? '#f2ede0';
  const fg = panel.fg ?? '#252525';
  const accent = panel.accent ?? '';
  const key = `${panel.text}|${bg}|${fg}|${accent}`;
  let tex = freestandingTexCache.get(key);
  if (tex) return tex;

  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  if (accent) {
    ctx.fillStyle = accent;
    ctx.fillRect(0, c.height - 18, c.width, 18);
  }
  ctx.strokeStyle = panel.border ?? fg;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, c.width - 8, c.height - 8);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = String(panel.text ?? '').toUpperCase();
  let size = 78;
  ctx.font = `bold ${size}px 'Arial Narrow', Arial, sans-serif`;
  while (ctx.measureText(label).width > c.width - 42 && size > 30) {
    size -= 4;
    ctx.font = `bold ${size}px 'Arial Narrow', Arial, sans-serif`;
  }
  ctx.fillText(label, c.width / 2, c.height / 2 - (accent ? 7 : 0));
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  freestandingTexCache.set(key, tex);
  return tex;
}

function buildFreestandingSign(definition) {
  const group = new THREE.Group();
  const width = Math.max(1.2, definition.width ?? 3.6);
  const depth = Math.max(0.12, definition.depth ?? 0.32);
  const panels = Array.isArray(definition.panels) && definition.panels.length
    ? definition.panels
    : [{ text: definition.text ?? '', height: definition.panelHeight ?? 1.2 }];
  const gap = definition.panelGap ?? 0.12;
  const panelTotal = panels.reduce((sum, panel) => sum + Math.max(0.35, panel.height ?? 1), 0)
    + gap * Math.max(0, panels.length - 1);
  const top = Math.max(panelTotal + 0.3, definition.height ?? 7);
  const panelBottom = top - panelTotal;
  const supportColor = definition.supportColor ?? '#686b69';

  if (definition.style === 'monument') {
    const baseHeight = Math.max(0.45, panelBottom);
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.75, baseHeight, depth + 0.5),
      new THREE.MeshLambertMaterial({ color: definition.baseColor ?? '#b8a98f' })
    );
    base.position.y = baseHeight / 2;
    base.castShadow = true;
    group.add(base);
  } else {
    const supportCount = definition.supports ?? (definition.style === 'pylon' ? 2 : 1);
    const supportHeight = Math.max(0.4, panelBottom);
    const supportMat = new THREE.MeshLambertMaterial({ color: supportColor });
    for (let i = 0; i < supportCount; i++) {
      const spread = supportCount === 1 ? 0 : (i / (supportCount - 1) - 0.5) * width * 0.58;
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(definition.supportWidth ?? 0.2, supportHeight, definition.supportDepth ?? 0.2),
        supportMat
      );
      pole.position.set(spread, supportHeight / 2, 0);
      pole.castShadow = true;
      group.add(pole);
    }
  }

  let y = top;
  for (const panel of panels) {
    const h = Math.max(0.35, panel.height ?? 1);
    const w = Math.max(1, width * (panel.widthScale ?? 1));
    y -= h;
    const backer = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, depth),
      new THREE.MeshLambertMaterial({ color: panel.edge ?? supportColor })
    );
    backer.position.y = y + h / 2;
    backer.castShadow = true;
    group.add(backer);

    const faceMaterial = new THREE.MeshBasicMaterial({ map: freestandingPanelTexture(panel), toneMapped: false });
    for (const side of [-1, 1]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, h - 0.08), faceMaterial);
      face.position.set(0, y + h / 2, side * (depth / 2 + 0.006));
      face.rotation.y = side < 0 ? Math.PI : 0;
      group.add(face);
    }
    y -= gap;
  }

  const [x, z] = definition.pos;
  group.position.set(x, definition.groundY ?? 0.1, z);
  group.rotation.y = THREE.MathUtils.degToRad(definition.rotation ?? 0);
  group.visible = false;
  group.userData.structureType = 'freestanding-sign';
  group.userData.signId = definition.id;
  return group;
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
  constructor(scene, buildings, places, details = {}, freestandingSigns = []) {
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

    const mountSign = (name, building, edge, t = 0.5, paletteHint = null, yHint = null) => {
      const dedupe = `${name}|${building.id}`;
      if (mounted.has(dedupe)) return;
      mounted.add(dedupe);
      const [ax, az] = building.poly[edge];
      const [bx, bz] = building.poly[(edge + 1) % building.poly.length];
      const ex = bx - ax, ez = bz - az, edgeLen = Math.hypot(ex, ez);
      if (edgeLen < 1.5) return;
      let nx = ez / edgeLen, nz = -ex / edgeLen;
      const [ccx, ccz] = polyCentroid(building.poly);
      const px = ax + ex * t, pz = az + ez * t;
      if ((px - ccx) * nx + (pz - ccz) * nz < 0) { nx = -nx; nz = -nz; }
      const palette = paletteHint ?? PALETTES[Math.floor(hash01(name.length * 7 + name.charCodeAt(0)) * PALETTES.length)];
      const { tex, textW } = signTexture(name, palette);
      const w = Math.min(MAX_SIGN_W, Math.max(2.2, textW * MAX_SIGN_W), edgeLen - 0.5);
      if (w < 1.5) return;
      const half = w / 2;
      const clampedT = Math.max(half / edgeLen, Math.min(1 - half / edgeLen, t));
      const sx = ax + ex * clampedT, sz = az + ez * clampedT;
      const detailHeight = details[building.id]?.height ?? (details[building.id]?.stories ? details[building.id].stories * 3.4 : null);
      const y = Number.isFinite(yHint)
        ? yHint
        : Math.min(SIGN_Y, Math.max(2.2, (detailHeight ?? building.height ?? 4) - 0.6));
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, SIGN_H), new THREE.MeshBasicMaterial({ map: tex }));
      mesh.position.set(sx + nx * 0.09, y, sz + nz * 0.09);
      mesh.rotation.y = Math.atan2(nx, nz);
      mesh.visible = false;
      this.group.add(mesh);
      this.items.push({ obj: mesh, x: sx, z: sz });
      count++;
    };

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
      if (details[bestB.id]?.suppressPlaceSignage) continue;

      const palette = PALETTES[Math.floor(hash01(place.name.length * 7 + place.name.charCodeAt(0)) * PALETTES.length)];
      const edgeIndex = bestB.poly.findIndex(([x, z]) => x === best.ax && z === best.az);
      mountSign(place.name, bestB, Math.max(0, edgeIndex), best.t, palette);
    }

    // Photo/model descriptors can provide exact wording even when OSM has no
    // business point. Explicit facadeEdge wins; otherwise use the longest wall.
    const buildingById = new Map(buildings.map((b) => [String(b.id), b]));
    for (const [id, detail] of Object.entries(details)) {
      const building = buildingById.get(id);
      if (!building || !detail.signage) continue;
      const signs = typeof detail.signage === 'string'
        ? [{ text: detail.signage }]
        : detail.signage;
      if (!Array.isArray(signs)) continue;
      let longestEdge = 0, longest = 0;
      for (let i = 0; i < building.poly.length; i++) {
        const a = building.poly[i], b = building.poly[(i + 1) % building.poly.length];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length > longest) { longest = length; longestEdge = i; }
      }
      for (const sign of signs) {
        if (!sign?.text) continue;
        const edge = Number.isInteger(sign.facadeEdge) ? sign.facadeEdge : longestEdge;
        if (edge < 0 || edge >= building.poly.length) continue;
        const palette = {
          bg: sign.bg ?? detail.trim ?? '#f2ede0',
          fg: sign.fg ?? '#202020',
        };
        mountSign(sign.text, building, edge, sign.position ?? 0.5, palette, sign.y);
      }
    }

    let freestandingCount = 0;
    for (const definition of freestandingSigns) {
      if (definition?.type !== 'freestanding-sign' || !Array.isArray(definition.pos)) continue;
      const sign = buildFreestandingSign(definition);
      this.group.add(sign);
      this.items.push({
        obj: sign,
        x: definition.pos[0],
        z: definition.pos[1],
        maxDistance: definition.maxDistance ?? SIGN_DIST,
      });
      freestandingCount++;
    }

    this.cooldown = 0;
    console.log(`signage: ${count} wall signs and ${freestandingCount} freestanding signs mounted`);
  }

  update(dt, playerPos) {
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    this.cooldown = 0.5;
    for (const it of this.items) {
      const dx = it.x - playerPos.x, dz = it.z - playerPos.z;
      const maxDistance = it.maxDistance ?? SIGN_DIST;
      it.obj.visible = dx * dx + dz * dz < maxDistance * maxDistance;
    }
  }
}
