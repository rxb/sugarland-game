import * as THREE from 'three';

// Keyframes over the 24h clock: sky color, sun strength, ambient strength.
const KEYS = [
  { h: 0.0, sky: '#0b1026', sun: 0.0, hemi: 0.22 },
  { h: 5.0, sky: '#141a3a', sun: 0.0, hemi: 0.24 },
  { h: 6.0, sky: '#e8956b', sun: 0.35, hemi: 0.45 },
  { h: 7.5, sky: '#9fd0e8', sun: 1.05, hemi: 0.85 },
  { h: 12.0, sky: '#8ecae6', sun: 1.25, hemi: 0.95 },
  { h: 17.0, sky: '#a3cde0', sun: 1.0, hemi: 0.85 },
  { h: 19.0, sky: '#f2905e', sun: 0.35, hemi: 0.5 },
  { h: 20.5, sky: '#141a3a', sun: 0.0, hemi: 0.26 },
  { h: 24.0, sky: '#0b1026', sun: 0.0, hemi: 0.22 },
];
const KEY_COLORS = KEYS.map((k) => new THREE.Color(k.sky));
const SUN_LOW = new THREE.Color('#ffb56b');
const SUN_HIGH = new THREE.Color('#fff4e0');

export class DayNight {
  constructor(scene) {
    this.scene = scene;
    this.hours = 9.5;
    this.auto = false;
    this.autoSpeed = 24 / 240; // full day in 4 minutes of auto-cycling

    this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = 90;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 20, far: 420 });
    this.sun.shadow.bias = -0.0004;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.moon = new THREE.DirectionalLight(0xb8c4e8, 0.0);
    this.moon.position.set(60, 120, 40);
    scene.add(this.moon);

    this.hemi = new THREE.HemisphereLight(0xbfd8e8, 0x8fb573, 0.8);
    scene.add(this.hemi);

    this.skyColor = new THREE.Color();
    // Far enough that the sugar mill (~2km south of downtown) stays on the skyline.
    scene.fog = new THREE.Fog(0x8ecae6, 300, 2600);
    scene.background = this.skyColor;
  }

  sample(h) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h < h) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = Math.max(0, Math.min(1, (h - a.h) / (b.h - a.h)));
    return {
      sky: KEY_COLORS[i].clone().lerp(KEY_COLORS[i + 1], t),
      sun: a.sun + (b.sun - a.sun) * t,
      hemi: a.hemi + (b.hemi - a.hemi) * t,
    };
  }

  update(dt, playerPos) {
    if (this.auto) {
      this.hours = (this.hours + dt * this.autoSpeed) % 24;
    }
    const h = this.hours;
    const k = this.sample(h);

    this.skyColor.copy(k.sky);
    this.scene.fog.color.copy(k.sky);

    // Sun arc: rises in the east (+x), sets west, over 6:00–20:00.
    const t = Math.max(0, Math.min(1, (h - 6) / 14));
    const elev = Math.sin(Math.PI * t) * 1.15 + 0.06;
    const az = Math.PI * (1 - t);
    const dir = new THREE.Vector3(
      Math.cos(az) * Math.cos(elev),
      Math.sin(elev),
      -Math.cos(elev) * 0.35
    ).normalize();

    this.sun.intensity = k.sun;
    const warm = Math.max(0, Math.min(1, dir.y * 2.2));
    this.sun.color.copy(SUN_LOW).lerp(SUN_HIGH, warm);
    this.sun.position.copy(playerPos).addScaledVector(dir, 200);
    this.sun.target.position.copy(playerPos);

    this.moon.intensity = k.sun < 0.05 ? 0.14 : 0;
    this.hemi.intensity = k.hemi;
  }

  timeLabel() {
    const h24 = Math.floor(this.hours);
    const m = Math.floor((this.hours - h24) * 60);
    const ampm = h24 < 12 ? 'AM' : 'PM';
    const h12 = ((h24 + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }
}
