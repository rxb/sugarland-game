const WALK_RADIUS = 270;
const DRIVE_RADIUS = 520;

function boundsOf(points) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

function overlaps(bounds, minX, maxX, minZ, maxZ) {
  return bounds.maxX >= minX && bounds.minX <= maxX
    && bounds.maxZ >= minZ && bounds.minZ <= maxZ;
}

export class Minimap {
  constructor(canvas, data, places = []) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.radius = WALK_RADIUS;
    this.elapsed = 1;

    this.roads = (data.roads || []).map((road) => ({
      ...road,
      bounds: boundsOf(road.path),
    }));
    this.canals = (data.canals || []).map((canal) => ({
      ...canal,
      bounds: boundsOf(canal.path),
    }));
    this.green = (data.green || []).map((area) => ({
      ...area,
      bounds: boundsOf(area.poly),
    }));
    this.water = (data.water || []).map((area) => ({
      ...area,
      bounds: boundsOf(area.poly),
    }));

    const landmarkNames = new Set([
      'Clewiston Inn', 'First Bank', 'United States Sugar Corporation',
      'Clewiston Public Library', 'Hampton Inn', 'Walmart Supercenter',
      "McDonald's", 'Roland Martin Marine Center',
    ]);
    this.landmarks = places.filter((place) => landmarkNames.has(place.name) && place.pos);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  update(dt, player) {
    const targetRadius = player.driving ? DRIVE_RADIUS : WALK_RADIUS;
    this.radius += (targetRadius - this.radius) * (1 - Math.exp(-dt * 4));

    // The map does not need the 3D scene's full frame rate, but keeping the
    // player arrow near 30 fps makes steering feel immediate.
    this.elapsed += dt;
    if (this.elapsed < 1 / 30) return;
    this.elapsed = 0;
    this.draw(player);
  }

  draw(player) {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    const centerX = player.pos.x;
    const centerZ = player.pos.z;
    const scale = Math.min(width, height) / (this.radius * 2);
    const minX = centerX - this.radius;
    const maxX = centerX + this.radius;
    const minZ = centerZ - this.radius;
    const maxZ = centerZ + this.radius;
    const toScreen = ([x, z]) => [
      width / 2 + (x - centerX) * scale,
      height / 2 + (z - centerZ) * scale,
    ];

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#91a778';
    ctx.fillRect(0, 0, width, height);

    const fillAreas = (areas, color) => {
      ctx.fillStyle = color;
      for (const area of areas) {
        if (!overlaps(area.bounds, minX, maxX, minZ, maxZ) || area.poly.length < 3) continue;
        ctx.beginPath();
        const [sx, sy] = toScreen(area.poly[0]);
        ctx.moveTo(sx, sy);
        for (let i = 1; i < area.poly.length; i++) {
          const [x, y] = toScreen(area.poly[i]);
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      }
    };
    fillAreas(this.green, '#779867');
    fillAreas(this.water, '#72a8b7');

    const traceLine = (item) => {
      ctx.beginPath();
      const [sx, sy] = toScreen(item.path[0]);
      ctx.moveTo(sx, sy);
      for (let i = 1; i < item.path.length; i++) {
        const [x, y] = toScreen(item.path[i]);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const canal of this.canals) {
      if (!overlaps(canal.bounds, minX, maxX, minZ, maxZ)) continue;
      ctx.strokeStyle = '#72a8b7';
      ctx.lineWidth = Math.max(1.5, canal.width * scale);
      traceLine(canal);
    }

    const visibleRoads = this.roads.filter((road) => overlaps(road.bounds, minX, maxX, minZ, maxZ));
    for (const road of visibleRoads) {
      ctx.strokeStyle = '#4f5857';
      ctx.lineWidth = Math.max(2.2, road.width * scale + 1.5);
      traceLine(road);
    }
    for (const road of visibleRoads) {
      ctx.strokeStyle = road.kind === 'service' || road.kind === 'track' ? '#78807a' : '#656d6b';
      ctx.lineWidth = Math.max(1.2, road.width * scale);
      traceLine(road);
      if (road.major) {
        ctx.strokeStyle = '#e8c650';
        ctx.lineWidth = 1;
        traceLine(road);
      }
    }

    // A few landmark pins provide stable town references without turning the
    // small map into a field of labels.
    for (const place of this.landmarks) {
      const [x, y] = toScreen(place.pos);
      if (x < 4 || x > width - 4 || y < 4 || y > height - 4) continue;
      ctx.beginPath();
      ctx.arc(x, y, 2.3, 0, Math.PI * 2);
      ctx.fillStyle = '#f4dc65';
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,25,28,0.75)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (!player.driving) this.drawCartMarker(player, toScreen, width, height);

    const heading = player.driving ? player.cart.heading : player.heading;
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(Math.PI - heading);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 7);
    ctx.lineTo(0, 4.5);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fillStyle = player.driving ? '#f4c641' : '#28b9ad';
    ctx.fill();
    ctx.strokeStyle = '#f8f3df';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // A light vignette keeps the moving map readable against the HUD glass.
    const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.2, width / 2, height / 2, width * 0.72);
    vignette.addColorStop(0, 'rgba(12,18,34,0)');
    vignette.addColorStop(1, 'rgba(12,18,34,0.28)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(12,18,34,0.76)';
    ctx.fillRect(0, 0, width, 22);
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2ede3';
    ctx.fillText(player.driving ? 'CLEWISTON  ·  DRIVING' : 'CLEWISTON  ·  WALKING', 7, 11.5);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f4dc65';
    ctx.fillText('N', width - 8, 11.5);
    ctx.textAlign = 'left';

    const distance = this.radius < 400 ? 100 : 200;
    const barWidth = distance * scale;
    const barY = height - 10;
    ctx.strokeStyle = '#f2ede3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, barY - 4);
    ctx.lineTo(8, barY);
    ctx.lineTo(8 + barWidth, barY);
    ctx.lineTo(8 + barWidth, barY - 4);
    ctx.stroke();
    ctx.font = '600 8px system-ui, sans-serif';
    ctx.fillStyle = '#f2ede3';
    ctx.fillText(`${distance} m`, 9, barY - 7);
  }

  drawCartMarker(player, toScreen, width, height) {
    const ctx = this.ctx;
    const dx = player.cart.pos.x - player.pos.x;
    const dz = player.cart.pos.z - player.pos.z;
    const distance = Math.hypot(dx, dz);
    const edgeRadius = Math.min(width, height) * 0.42;
    let [x, y] = toScreen([player.cart.pos.x, player.cart.pos.z]);
    let onEdge = false;

    if (distance > this.radius * 0.84) {
      const angle = Math.atan2(dz, dx);
      x = width / 2 + Math.cos(angle) * edgeRadius;
      y = height / 2 + Math.sin(angle) * edgeRadius;
      onEdge = true;
    }

    ctx.save();
    ctx.translate(x, y);
    if (onEdge) ctx.rotate(Math.atan2(dz, dx) + Math.PI / 2);
    ctx.fillStyle = '#f4c641';
    ctx.strokeStyle = '#273033';
    ctx.lineWidth = 1.3;
    if (onEdge) {
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(4, 3);
      ctx.lineTo(-4, 3);
      ctx.closePath();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
