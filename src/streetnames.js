import * as THREE from 'three';

// Street name signage:
//  - Green blade signs on poles at every intersection of two differently-named
//    roads (blade runs parallel to the street it names, like real US signs).
//  - Painted names on the pavement of major roads, repeating along the road.
// Textures are canvas-drawn and cached per street name; sign/paint visibility
// is distance-culled on a throttle so draw calls stay low.

const SIGN_DIST = 260;
const PAINT_DIST = 420;
const PAINT_SPACING = 90;

const bladeTexCache = new Map();
const paintTexCache = new Map();

function bladeTexture(name) {
  let tex = bladeTexCache.get(name);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1e6b3c';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#e8f0e8';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, c.width - 12, c.height - 12);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 56;
  ctx.font = `bold ${size}px 'Arial Narrow', Arial, sans-serif`;
  const label = name.toUpperCase();
  while (ctx.measureText(label).width > c.width - 40 && size > 22) {
    size -= 4;
    ctx.font = `bold ${size}px 'Arial Narrow', Arial, sans-serif`;
  }
  ctx.fillText(label, c.width / 2, c.height / 2 + 2);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  bladeTexCache.set(name, tex);
  return tex;
}

function paintTexture(name) {
  let tex = paintTexCache.get(name);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(245, 245, 235, 0.92)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 96;
  ctx.font = `bold ${size}px 'Arial Narrow', Arial, sans-serif`;
  const label = name.toUpperCase();
  while (ctx.measureText(label).width > c.width - 60 && size > 40) {
    size -= 8;
    ctx.font = `bold ${size}px 'Arial Narrow', Arial, sans-serif`;
  }
  ctx.fillText(label, c.width / 2, c.height / 2);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  paintTexCache.set(name, tex);
  return tex;
}

const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 3.0, 6);
const poleMat = new THREE.MeshLambertMaterial({ color: '#8a8f96' });

function makeBlade(name, dir, y) {
  const tex = bladeTexture(name);
  const w = 1.5, h = 0.28;
  const group = new THREE.Group();
  for (const flip of [0, Math.PI]) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    mesh.rotation.y = Math.atan2(-dir[1], dir[0]) + flip;
    mesh.position.y = y;
    group.add(mesh);
  }
  return group;
}

export class StreetNames {
  constructor(scene, roads) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = []; // { obj, x, z, dist }
    this.cooldown = 0;

    this._buildSigns(roads);
    this._buildPaint(roads);
    for (const it of this.items) it.obj.visible = false;
  }

  _buildSigns(roads) {
    // Map each (rounded) path vertex to the named roads passing through it.
    const nodeMap = new Map();
    for (const r of roads) {
      if (!r.name || r.kind === 'service' || r.kind === 'track') continue;
      for (let i = 0; i < r.path.length; i++) {
        const [x, z] = r.path[i];
        const key = `${Math.round(x * 2)}:${Math.round(z * 2)}`;
        let entry = nodeMap.get(key);
        if (!entry) { entry = { x, z, names: new Map() }; nodeMap.set(key, entry); }
        if (!entry.names.has(r.name)) {
          const j = i < r.path.length - 1 ? i + 1 : i - 1;
          const dx = r.path[j][0] - x, dz = r.path[j][1] - z;
          const len = Math.hypot(dx, dz) || 1;
          entry.names.set(r.name, [dx / len, dz / len]);
        }
      }
    }

    // One sign pole per intersection of >=2 distinct street names,
    // deduped on a coarse grid so parallel ways don't double-post.
    const posted = new Set();
    let count = 0;
    for (const { x, z, names } of nodeMap.values()) {
      if (names.size < 2) continue;
      const cellKey = `${Math.round(x / 18)}:${Math.round(z / 18)}`;
      if (posted.has(cellKey)) continue;
      posted.add(cellKey);

      const dirs = [...names.values()];
      // Offset the pole off the pavement, diagonally from the corner.
      let ox = -dirs[0][1] + -dirs[1][1], oz = dirs[0][0] + dirs[1][0];
      const olen = Math.hypot(ox, oz);
      if (olen < 0.3) { ox = 1; oz = 1; }
      const s = 7 / (Math.hypot(ox, oz) || 1);

      const sign = new THREE.Group();
      sign.position.set(x + ox * s, 0, z + oz * s);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 1.5;
      sign.add(pole);
      let y = 2.85;
      for (const [name, dir] of names) {
        sign.add(makeBlade(name, dir, y));
        y -= 0.34;
        if (y < 2.1) break; // cap at 3 blades
      }
      this.group.add(sign);
      this.items.push({ obj: sign, x: sign.position.x, z: sign.position.z, dist: SIGN_DIST });
      count++;
    }
    console.log(`street signs: ${count} intersections posted`);
  }

  _buildPaint(roads) {
    const PAINT_KINDS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
    let count = 0;
    for (const r of roads) {
      if (!r.name || !PAINT_KINDS.has(r.kind)) continue;
      const tex = paintTexture(r.name);
      const wide = Math.min(r.width * 0.42, 3.2);
      const long = wide * 8; // canvas is 8:1
      let next = PAINT_SPACING / 2;
      let traveled = 0;
      for (let i = 0; i < r.path.length - 1; i++) {
        const [ax, az] = r.path[i];
        let dx = r.path[i + 1][0] - ax, dz = r.path[i + 1][1] - az;
        const segLen = Math.hypot(dx, dz);
        if (segLen < 0.01) continue;
        dx /= segLen; dz /= segLen;
        while (next < traveled + segLen) {
          const t = next - traveled;
          const px = ax + dx * t, pz = az + dz * t;
          const geo = new THREE.PlaneGeometry(long, wide);
          geo.rotateX(-Math.PI / 2);
          const mesh = new THREE.Mesh(
            geo,
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
          );
          mesh.rotation.y = Math.atan2(-dz, dx);
          mesh.position.set(px, 0.11, pz);
          this.group.add(mesh);
          this.items.push({ obj: mesh, x: px, z: pz, dist: PAINT_DIST });
          next += PAINT_SPACING;
          count++;
        }
        traveled += segLen;
      }
    }
    console.log(`street paint: ${count} name markings`);
  }

  update(dt, playerPos) {
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    this.cooldown = 0.5;
    for (const it of this.items) {
      const dx = it.x - playerPos.x, dz = it.z - playerPos.z;
      it.obj.visible = dx * dx + dz * dz < it.dist * it.dist;
    }
  }
}
