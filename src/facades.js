import * as THREE from 'three';

// Procedural facade texture modules. Each canvas tile represents a wall
// module MODULE.width x MODULE.height meters and tiles horizontally (and
// vertically for multi-story walls). Textures are drawn in near-grayscale on
// white so the per-building wall tint (vertex color) multiplies through:
// white = wall color, darker pixels = windows/shadow/detail.

export const MODULE = { width: 4.0, height: 3.4 };

const SIZE = 256;

function makeCanvas(draw) {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function gray(v) {
  const n = Math.round(v * 255);
  return `rgb(${n},${n},${n})`;
}

// Deterministic small noise, used for stucco.
function noise(ctx, amount, cell = 4) {
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let y = 0; y < SIZE; y += cell) {
    for (let x = 0; x < SIZE; x += cell) {
      const v = 1 - amount * rnd();
      ctx.fillStyle = gray(v);
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x, y, cell, cell);
    }
  }
  ctx.globalAlpha = 1;
}

function drawWindow(ctx, x, y, w, h) {
  // light outer frame, dark glass, sash bar, sill shadow
  ctx.fillStyle = gray(0.96);
  ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
  ctx.fillStyle = gray(0.34);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = gray(0.55);
  ctx.fillRect(x, y + h / 2 - 2, w, 4);
  ctx.fillRect(x + w / 2 - 2, y, 4, h);
  ctx.fillStyle = gray(0.62);
  ctx.fillRect(x - 6, y + h + 5, w + 12, 4);
}

// One-story house wall: lap siding + a window per 4m module.
function houseTile(ctx) {
  for (let y = 14; y < SIZE; y += 18) {
    ctx.fillStyle = gray(0.86);
    ctx.fillRect(0, y, SIZE, 2);
  }
  drawWindow(ctx, 88, 74, 80, 104);
  // eave shadow at top of the wall
  const grad = ctx.createLinearGradient(0, 0, 0, 22);
  grad.addColorStop(0, gray(0.72));
  grad.addColorStop(1, gray(1));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, 22);
}

// Commercial upper wall: stucco + a wider window.
function commercialTile(ctx) {
  noise(ctx, 0.07, 5);
  drawWindow(ctx, 70, 70, 116, 100);
  ctx.fillStyle = gray(0.8);
  ctx.fillRect(0, 0, SIZE, 8); // floor line
}

// Ground-floor storefront band: kick panel, big glass, mullions, sign band.
function storefrontTile(ctx) {
  noise(ctx, 0.05, 6);
  // sign band across the top (real signage overlays later)
  ctx.fillStyle = gray(0.58);
  ctx.fillRect(0, 6, SIZE, 50);
  ctx.fillStyle = gray(0.5);
  ctx.fillRect(0, 52, SIZE, 4);
  // glass from under the band to the kick panel
  ctx.fillStyle = gray(0.38);
  ctx.fillRect(10, 66, SIZE - 20, 150);
  // mullions
  ctx.fillStyle = gray(0.88);
  for (const mx of [10, 90, 168, 246 - 4]) {
    ctx.fillRect(mx, 66, 6, 150);
  }
  // faint interior/awning shadow at glass top
  ctx.fillStyle = gray(0.28);
  ctx.fillRect(10, 66, SIZE - 20, 16);
  // kick panel
  ctx.fillStyle = gray(0.52);
  ctx.fillRect(0, 216, SIZE, 40);
}

// Industrial: vertical metal panels + a high window strip.
function industrialTile(ctx) {
  for (let x = 0; x < SIZE; x += 26) {
    ctx.fillStyle = gray(0.88);
    ctx.fillRect(x, 0, 3, SIZE);
  }
  ctx.fillStyle = gray(0.42);
  ctx.fillRect(14, 26, SIZE - 28, 34);
  ctx.fillStyle = gray(0.85);
  for (let mx = 14; mx < SIZE - 28; mx += 40) {
    ctx.fillRect(mx, 26, 4, 34);
  }
}

// Plain: sheds, garages — just a hint of texture.
function plainTile(ctx) {
  noise(ctx, 0.06, 6);
  ctx.fillStyle = gray(0.8);
  ctx.fillRect(0, 0, SIZE, 10);
}

let cached = null;

export function facadeMaterials() {
  if (cached) return cached;
  const mat = (draw) =>
    new THREE.MeshLambertMaterial({
      map: makeCanvas(draw),
      vertexColors: true,
      side: THREE.DoubleSide,
    });
  cached = {
    house: mat(houseTile),
    commercial: mat(commercialTile),
    storefront: mat(storefrontTile),
    industrial: mat(industrialTile),
    plain: mat(plainTile),
  };
  return cached;
}
