import * as THREE from 'three';

// Deterministic seeded RNG so the town generates identically every run.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1];
    const xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return Math.abs(a / 2);
}

export function polyCentroid(poly) {
  let x = 0, z = 0;
  for (const p of poly) { x += p[0]; z += p[1]; }
  return [x / poly.length, z / poly.length];
}

// Uniform-cell spatial hash for polygon lookups (collision, tree placement).
export class SpatialGrid {
  constructor(cell = 24) {
    this.cell = cell;
    this.map = new Map();
  }
  _key(cx, cz) { return cx * 100000 + cz; }
  insertPoly(poly, item) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of poly) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const c = this.cell;
    for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++) {
      for (let cz = Math.floor(minZ / c); cz <= Math.floor(maxZ / c); cz++) {
        const k = this._key(cx, cz);
        let arr = this.map.get(k);
        if (!arr) { arr = []; this.map.set(k, arr); }
        arr.push(item);
      }
    }
  }
  markPoint(x, z) {
    const k = this._key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    this.map.set(k, true);
  }
  isMarked(x, z) {
    return this.map.has(this._key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
  }
  query(x, z) {
    return this.map.get(this._key(Math.floor(x / this.cell), Math.floor(z / this.cell))) || [];
  }
}

export function lerpColor(out, a, b, t) {
  return out.copy(a).lerp(b, t);
}

export const tmpColor = new THREE.Color();
