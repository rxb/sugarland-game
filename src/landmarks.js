import * as THREE from 'three';

// Clewiston's skyline landmarks:
//  - The Herbert Hoover Dike: a ~9m grass berm along the lake rim, swept
//    along the real dike paths (they're in the road data, named ways LD-1/2).
//  - The sugar mill south of town: stacks, silos, and a drifting steam plume
//    anchored to the real industrial footprint cluster.

const DIKE_HEIGHT = 9;
const DIKE_TOP_HALF = 6;
const DIKE_BASE_HALF = 24;
const GRASS = new THREE.Color('#84ab68');
const CREST = new THREE.Color('#9aa093');

function sweepDike(path) {
  // Cross-section, swept along the path with mitered perpendiculars.
  const profile = [
    { off: -DIKE_BASE_HALF, y: 0.0, color: GRASS },
    { off: -DIKE_TOP_HALF, y: DIKE_HEIGHT, color: GRASS },
    { off: -DIKE_TOP_HALF + 1.5, y: DIKE_HEIGHT, color: CREST },
    { off: DIKE_TOP_HALF - 1.5, y: DIKE_HEIGHT, color: CREST },
    { off: DIKE_TOP_HALF, y: DIKE_HEIGHT, color: GRASS },
    { off: DIKE_BASE_HALF, y: 0.0, color: GRASS },
  ];
  const pos = [], col = [];
  const rings = [];
  for (let i = 0; i < path.length; i++) {
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(path.length - 1, i + 1)];
    let dx = next[0] - prev[0], dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const px = -dz, pz = dx;
    rings.push(profile.map((p) => [
      path[i][0] + px * p.off, p.y, path[i][1] + pz * p.off, p.color,
    ]));
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    for (let j = 0; j < profile.length - 1; j++) {
      const quad = [a[j], b[j], b[j + 1], a[j], b[j + 1], a[j + 1]];
      for (const [x, y, z, c] of quad) {
        pos.push(x, y, z);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  return { pos, col };
}

function makeSteamTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.6, 'rgba(250,250,248,0.35)');
  g.addColorStop(1, 'rgba(250,250,248,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Landmarks {
  constructor(scene, data) {
    this.steam = [];

    // ---- Dike ----
    const dikePaths = data.roads.filter((r) => r.name === 'Herbert Hoover Dike');
    const pos = [], col = [];
    for (const r of dikePaths) {
      if (r.path.length < 2) continue;
      const swept = sweepDike(r.path);
      pos.push(...swept.pos);
      col.push(...swept.col);
    }
    if (pos.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
      );
      mesh.receiveShadow = true;
      scene.add(mesh);
      console.log(`landmarks: dike built from ${dikePaths.length} paths`);
    }

    // ---- Sugar mill (anchored to the real industrial cluster) ----
    const mill = new THREE.Group();
    const metal = new THREE.MeshLambertMaterial({ color: '#c9ccc9' });
    const stackMat = new THREE.MeshLambertMaterial({ color: '#b0aca0' });

    const stack = (x, z, h, r) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r, h, 12), stackMat);
      m.position.set(x, h / 2, z);
      m.castShadow = true;
      mill.add(m);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.84, r * 0.84, h * 0.08, 12),
        new THREE.MeshLambertMaterial({ color: '#6e2f2a' })
      );
      band.position.set(x, h * 0.96, z);
      mill.add(band);
      return { x, z, top: h };
    };
    const silo = (x, z, h, r) => {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), metal);
      body.position.set(x, h / 2, z);
      body.castShadow = true;
      mill.add(body);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, r * 0.6, 14), metal);
      cone.position.set(x, h + r * 0.3, z);
      mill.add(cone);
    };

    // Stacks west of the big shed, silo row to the east.
    const s1 = stack(-70, 1930, 52, 2.6);
    const s2 = stack(-58, 1938, 42, 2.2);
    silo(200, 1985, 24, 8);
    silo(219, 1985, 24, 8);
    silo(238, 1985, 24, 8);
    // Conveyor gantry from shed roofline up to the first silo.
    const gantry = new THREE.Mesh(new THREE.BoxGeometry(90, 1.6, 2.4), metal);
    gantry.position.set(150, 16, 1990);
    gantry.rotation.z = 0.18;
    mill.add(gantry);
    scene.add(mill);

    // Steam plume off the tall stack.
    const steamTex = makeSteamTexture();
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: steamTex, transparent: true, depthWrite: false, opacity: 0.5,
      }));
      sp.userData.phase = i / 6;
      sp.userData.sx = s1.x;
      sp.userData.sz = s1.z;
      sp.userData.top = s1.top;
      scene.add(sp);
      this.steam.push(sp);
    }
    console.log('landmarks: sugar mill placed');
  }

  update(dt, time) {
    for (const sp of this.steam) {
      const t = (time * 0.05 + sp.userData.phase) % 1;
      const drift = t * 30;
      sp.position.set(
        sp.userData.sx + drift * 0.6 + Math.sin(t * 9) * 1.5,
        sp.userData.top + t * 42,
        sp.userData.sz - drift * 0.25
      );
      const s = 6 + t * 26;
      sp.scale.set(s, s, 1);
      sp.material.opacity = 0.5 * (1 - t) * (0.35 + 0.65 * Math.min(1, t * 5));
    }
  }
}
