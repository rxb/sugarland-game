import * as THREE from 'three';

const QUALIFYING_KINDS = new Set([
  'primary',
  'secondary',
  'tertiary',
  'residential',
  'unclassified',
]);

const BOUNDS = { minX: -2600, maxX: 2400, minZ: -850, maxZ: 2850 };

const RIBBON_WIDTH = 1.5;
const SIDEWALK_GAP = 1.9; // gap between road edge and sidewalk inner edge
const BASE_Y = 0.06;

const BASE_COLOR = { r: 0xcf / 255, g: 0xcc / 255, b: 0xc2 / 255 };

function inBounds(p) {
  return (
    p[0] >= BOUNDS.minX &&
    p[0] <= BOUNDS.maxX &&
    p[1] >= BOUNDS.minZ &&
    p[1] <= BOUNDS.maxZ
  );
}

// Split a path into runs of consecutive in-bounds points.
function splitIntoRuns(path) {
  const runs = [];
  let current = [];
  for (const p of path) {
    if (inBounds(p)) {
      current.push(p);
    } else {
      if (current.length >= 2) runs.push(current);
      current = [];
    }
  }
  if (current.length >= 2) runs.push(current);
  return runs;
}

// Deterministic hash of a point -> [0, 1)
function hashPoint(x, z) {
  let h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  h = h - Math.floor(h);
  return h;
}

// Simple RGB -> HSL -> RGB lightness scaling
function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp >= 0 && hp < 1) {
    r1 = c;
    g1 = x;
  } else if (hp >= 1 && hp < 2) {
    r1 = x;
    g1 = c;
  } else if (hp >= 2 && hp < 3) {
    g1 = c;
    b1 = x;
  } else if (hp >= 3 && hp < 4) {
    g1 = x;
    b1 = c;
  } else if (hp >= 4 && hp < 5) {
    r1 = x;
    b1 = c;
  } else if (hp >= 5 && hp < 6) {
    r1 = c;
    b1 = x;
  }
  const m = l - c / 2;
  return [r1 + m, g1 + m, b1 + m];
}

function colorForRoad(firstPoint) {
  const h = hashPoint(firstPoint[0], firstPoint[1]);
  const lightnessMul = 0.96 + h * 0.08; // 0.96 - 1.04
  const [hue, sat, light] = rgbToHsl(BASE_COLOR.r, BASE_COLOR.g, BASE_COLOR.b);
  const newLight = Math.min(1, Math.max(0, light * lightnessMul));
  const [r, g, b] = hslToRgb(hue, sat, newLight);
  return { r, g, b, hash: h };
}

// Build an offset polyline (miter-style) for a run of points, offset by `dist`
// along the perpendicular direction (perp = (-dz, dx) of averaged adjacent
// segment directions).
function buildOffsetPath(points, dist) {
  const n = points.length;
  const offset = new Array(n);

  // Precompute normalized segment directions.
  const segDirs = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    const dz = points[i + 1][1] - points[i][1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) {
      segDirs.push(null);
    } else {
      segDirs.push([dx / len, dz / len]);
    }
  }

  for (let i = 0; i < n; i++) {
    let dPrev = i > 0 ? segDirs[i - 1] : null;
    let dNext = i < n - 1 ? segDirs[i] : null;

    // Fallback if a neighboring segment direction is degenerate.
    if (dPrev === null) dPrev = dNext;
    if (dNext === null) dNext = dPrev;

    if (dPrev === null && dNext === null) {
      // Entirely degenerate point; no direction info, skip offsetting.
      offset[i] = [points[i][0], points[i][1]];
      continue;
    }

    let avgX = dPrev[0] + dNext[0];
    let avgZ = dPrev[1] + dNext[1];
    let avgLen = Math.hypot(avgX, avgZ);
    if (avgLen < 1e-9) {
      // Opposite directions (sharp turn-back); use dNext as fallback.
      avgX = dNext[0];
      avgZ = dNext[1];
      avgLen = Math.hypot(avgX, avgZ) || 1;
    }
    avgX /= avgLen;
    avgZ /= avgLen;

    // perpendicular = (-dz, dx)
    const perpX = -avgZ;
    const perpZ = avgX;

    offset[i] = [points[i][0] + perpX * dist, points[i][1] + perpZ * dist];
  }

  return offset;
}

// Sample points along a polyline every ~stepMeters.
function samplePolyline(points, stepMeters) {
  const samples = [];
  let accumulated = 0;
  samples.push(points[0]);
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    const segLen = Math.hypot(x1 - x0, z1 - z0);
    if (segLen < 1e-9) continue;
    let dist = accumulated > 0 ? stepMeters - accumulated : stepMeters;
    while (dist < segLen) {
      const t = dist / segLen;
      samples.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
      dist += stepMeters;
    }
    accumulated = (accumulated + segLen) % stepMeters;
  }
  const last = points[points.length - 1];
  const lastSample = samples[samples.length - 1];
  if (!lastSample || lastSample[0] !== last[0] || lastSample[1] !== last[1]) {
    samples.push(last);
  }
  return samples;
}

// Build ribbon geometry data (positions, normals, colors) for a centerline
// (an offset path already positioned at ribbon center), given a half-width.
function buildRibbon(centerPath, halfWidth, y, color, positions, normals, colors) {
  const n = centerPath.length;
  if (n < 2) return;

  const leftEdge = new Array(n);
  const rightEdge = new Array(n);

  const segDirs = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = centerPath[i + 1][0] - centerPath[i][0];
    const dz = centerPath[i + 1][1] - centerPath[i][1];
    const len = Math.hypot(dx, dz);
    segDirs.push(len < 1e-9 ? null : [dx / len, dz / len]);
  }

  for (let i = 0; i < n; i++) {
    let dPrev = i > 0 ? segDirs[i - 1] : null;
    let dNext = i < n - 1 ? segDirs[i] : null;
    if (dPrev === null) dPrev = dNext;
    if (dNext === null) dNext = dPrev;

    if (dPrev === null && dNext === null) {
      leftEdge[i] = [centerPath[i][0], centerPath[i][1]];
      rightEdge[i] = [centerPath[i][0], centerPath[i][1]];
      continue;
    }

    let avgX = dPrev[0] + dNext[0];
    let avgZ = dPrev[1] + dNext[1];
    let avgLen = Math.hypot(avgX, avgZ);
    if (avgLen < 1e-9) {
      avgX = dNext[0];
      avgZ = dNext[1];
      avgLen = Math.hypot(avgX, avgZ) || 1;
    }
    avgX /= avgLen;
    avgZ /= avgLen;

    const perpX = -avgZ;
    const perpZ = avgX;

    leftEdge[i] = [
      centerPath[i][0] + perpX * halfWidth,
      centerPath[i][1] + perpZ * halfWidth,
    ];
    rightEdge[i] = [
      centerPath[i][0] - perpX * halfWidth,
      centerPath[i][1] - perpZ * halfWidth,
    ];
  }

  // Build two triangles per segment between left/right edges.
  for (let i = 0; i < n - 1; i++) {
    const l0 = leftEdge[i];
    const l1 = leftEdge[i + 1];
    const r0 = rightEdge[i];
    const r1 = rightEdge[i + 1];

    // Guard degenerate segment (zero length centerline segment).
    const segLen = Math.hypot(
      centerPath[i + 1][0] - centerPath[i][0],
      centerPath[i + 1][1] - centerPath[i][1]
    );
    if (segLen < 1e-9) continue;

    // Triangle 1: r0, l0, l1
    pushVertex(positions, normals, colors, r0, y, color);
    pushVertex(positions, normals, colors, l0, y, color);
    pushVertex(positions, normals, colors, l1, y, color);

    // Triangle 2: r0, l1, r1
    pushVertex(positions, normals, colors, r0, y, color);
    pushVertex(positions, normals, colors, l1, y, color);
    pushVertex(positions, normals, colors, r1, y, color);
  }
}

function pushVertex(positions, normals, colors, xz, y, color) {
  positions.push(xz[0], y, xz[1]);
  normals.push(0, 1, 0);
  colors.push(color.r, color.g, color.b);
}

export function buildSidewalks(roads) {
  const positions = [];
  const normals = [];
  const colors = [];
  const walkPoints = [];

  for (const road of roads) {
    if (!road || !QUALIFYING_KINDS.has(road.kind)) continue;
    if (!Array.isArray(road.path) || road.path.length < 2) continue;

    const runs = splitIntoRuns(road.path);
    if (runs.length === 0) continue;

    const halfRoadWidth = (road.width || 6) / 2;
    const sidewalkOffset = halfRoadWidth + SIDEWALK_GAP;
    const ribbonHalfWidth = RIBBON_WIDTH / 2;

    for (const run of runs) {
      const color = colorForRoad(run[0]);
      const yJitter = BASE_Y + color.hash * 0.015;

      // Left ribbon (+perpendicular offset), right ribbon (-perpendicular).
      const leftCenter = buildOffsetPath(run, sidewalkOffset);
      const rightCenter = buildOffsetPath(run, -sidewalkOffset);

      buildRibbon(
        leftCenter,
        ribbonHalfWidth,
        yJitter,
        color,
        positions,
        normals,
        colors
      );
      buildRibbon(
        rightCenter,
        ribbonHalfWidth,
        yJitter,
        color,
        positions,
        normals,
        colors
      );

      // Walk points sampled every ~6m along each sidewalk centerline.
      const leftSamples = samplePolyline(leftCenter, 6);
      const rightSamples = samplePolyline(rightCenter, 6);
      for (const p of leftSamples) walkPoints.push([p[0], p[1]]);
      for (const p of rightSamples) walkPoints.push([p[0], p[1]]);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);

  return { mesh, walkPoints };
}
