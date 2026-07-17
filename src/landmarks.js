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

function cylinderBetween(a, b, radius, material, radialSegments = 6) {
  const delta = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, delta.length(), radialSegments),
    material
  );
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  mesh.castShadow = true;
  return mesh;
}

function buildDowntownTower() {
  const tower = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: '#878b89' });
  const paleSteel = new THREE.MeshLambertMaterial({ color: '#c5c8c5' });
  const height = 49;
  const tiers = 7;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const at = (corner, tier) => {
    const t = tier / tiers;
    const half = THREE.MathUtils.lerp(2.15, 0.48, t);
    return new THREE.Vector3(corner[0] * half, height * t, corner[1] * half);
  };

  for (let tier = 0; tier < tiers; tier++) {
    for (let i = 0; i < corners.length; i++) {
      const next = (i + 1) % corners.length;
      const a0 = at(corners[i], tier);
      const a1 = at(corners[i], tier + 1);
      const b0 = at(corners[next], tier);
      const b1 = at(corners[next], tier + 1);
      tower.add(cylinderBetween(a0, a1, 0.11, steel));
      tower.add(cylinderBetween(a0, b0, 0.065, steel));
      tower.add(cylinderBetween(a0, b1, 0.055, steel));
      tower.add(cylinderBetween(b0, a1, 0.055, steel));
    }
  }
  for (let i = 0; i < corners.length; i++) {
    tower.add(cylinderBetween(at(corners[i], tiers), at(corners[(i + 1) % corners.length], tiers), 0.055, steel));
  }

  // The clustered rectangular antennas and small dishes are the features that
  // make the tower read correctly from Sugarland Highway at game scale.
  for (const [y, angle] of [[30, 0], [34, 90], [38, 180], [42, 270], [44, 45]]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.35, 0.18), paleSteel);
    const r = 1.05;
    const a = THREE.MathUtils.degToRad(angle);
    panel.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
    panel.rotation.y = a;
    panel.castShadow = true;
    tower.add(panel);
  }
  for (const [y, angle] of [[25, 35], [31, 215], [36, 115]]) {
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.18, 16), paleSteel);
    const a = THREE.MathUtils.degToRad(angle);
    dish.position.set(Math.sin(a) * 1.25, y, Math.cos(a) * 1.25);
    dish.rotation.z = Math.PI / 2;
    dish.rotation.y = a;
    tower.add(dish);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 8), paleSteel);
  mast.position.y = height + 3;
  tower.add(mast);
  tower.userData.topHeight = height + 6;
  return tower;
}

function buildCivicGazebo() {
  const gazebo = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: '#f2f0e7' });
  const roofMat = new THREE.MeshLambertMaterial({ color: '#d8d5ca' });
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.35, 8), white);
  deck.position.y = 0.18;
  deck.receiveShadow = true;
  gazebo.add(deck);

  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 3.9, 8), white);
    column.position.set(Math.sin(a) * 4.15, 2.28, Math.cos(a) * 4.15);
    column.castShadow = true;
    gazebo.add(column);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.8, 2.15, 8), roofMat);
  roof.position.y = 5.25;
  roof.castShadow = true;
  gazebo.add(roof);

  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.9, 8), white);
  cupola.position.y = 6.55;
  gazebo.add(cupola);
  const cupolaRoof = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.8, 8), roofMat);
  cupolaRoof.position.y = 7.35;
  gazebo.add(cupolaRoof);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial({ color: '#54534f' }));
  finial.position.y = 7.86;
  gazebo.add(finial);
  gazebo.userData.landmark = 'civic-park-gazebo';
  return gazebo;
}

function buildCivicMemorial() {
  const memorial = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ color: '#e6e3da' });
  const darkStone = new THREE.MeshLambertMaterial({ color: '#817c72' });
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 11), stone);
  plaza.position.y = 0.06;
  plaza.receiveShadow = true;
  memorial.add(plaza);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.55, 1.8), darkStone);
  plinth.position.set(0, 0.32, -2.6);
  memorial.add(plinth);
  const marker = new THREE.Mesh(new THREE.BoxGeometry(2.35, 3.2, 0.55), stone);
  marker.position.set(0, 2.05, -2.6);
  marker.castShadow = true;
  memorial.add(marker);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.22, 0.8), darkStone);
  cap.position.set(0, 3.72, -2.6);
  memorial.add(cap);
  for (const x of [-2.8, 0, 2.8]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 8, 8), darkStone);
    pole.position.set(x, 4, 2.8);
    memorial.add(pole);
  }
  memorial.userData.landmark = 'british-cadet-memorial';
  return memorial;
}

function buildMottPoolComplex() {
  const pool = new THREE.Group();
  const concrete = new THREE.MeshLambertMaterial({ color: '#dedbd1' });
  const water = new THREE.MeshPhongMaterial({ color: '#3b9ec1', transparent: true, opacity: 0.82, shininess: 90 });
  const greenMetal = new THREE.MeshLambertMaterial({ color: '#315f4d' });

  const deck = new THREE.Mesh(new THREE.BoxGeometry(38, 0.18, 21), concrete);
  deck.position.y = 0.09;
  deck.receiveShadow = true;
  pool.add(deck);
  const basin = new THREE.Mesh(new THREE.BoxGeometry(33.5, 0.12, 16.5), water);
  basin.position.y = 0.21;
  pool.add(basin);
  for (const z of [-4, 0, 4]) {
    const lane = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 32.5, 6),
      new THREE.MeshBasicMaterial({ color: z === 0 ? '#f1e8cf' : '#cf5144' })
    );
    lane.rotation.z = Math.PI / 2;
    lane.position.set(0, 0.34, z);
    pool.add(lane);
  }

  const splash = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 0.14, 32), new THREE.MeshLambertMaterial({ color: '#76c7df' }));
  splash.scale.set(1.25, 1, 0.72);
  splash.position.set(-4, 0.08, -38);
  splash.receiveShadow = true;
  pool.add(splash);
  const sprayColors = ['#d34d3f', '#e8c72f', '#2d8f68', '#654fa3'];
  for (let i = 0; i < 5; i++) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 2.2 + (i % 2) * 0.7, 8),
      new THREE.MeshLambertMaterial({ color: sprayColors[i % sprayColors.length] })
    );
    pole.position.set(-12 + i * 4, pole.geometry.parameters.height / 2, -38 + (i % 2 ? 3 : -2));
    pool.add(pole);
  }

  const shelterRoof = new THREE.Mesh(new THREE.BoxGeometry(24, 0.35, 5.5), greenMetal);
  shelterRoof.position.set(0, 3.2, 14);
  shelterRoof.castShadow = true;
  pool.add(shelterRoof);
  for (const x of [-10, -3.4, 3.4, 10]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.1, 0.16), greenMetal);
    post.position.set(x, 1.55, 14);
    pool.add(post);
  }
  pool.userData.landmark = 'cs-mott-pool';
  return pool;
}

function buildStMargaretTower() {
  const tower = new THREE.Group();
  const cream = new THREE.MeshLambertMaterial({ color: '#e9e4d8' });
  const brown = new THREE.MeshLambertMaterial({ color: '#493d36' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(9.2, 12.6, 7.8), cream);
  body.position.y = 6.3;
  body.castShadow = true;
  tower.add(body);
  for (const y of [5.1, 9.45, 12.45]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(9.65, 0.34, 8.25), brown);
    band.position.y = y;
    tower.add(band);
  }
  for (const x of [-2.55, 0, 2.55]) {
    const window = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.15), brown);
    window.position.set(x, 10.7, -3.92);
    tower.add(window);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.8), brown);
  door.position.set(0, 1.45, -3.93);
  tower.add(door);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.65, 0.18), brown);
  crossV.position.set(0, 6.8, -4);
  tower.add(crossV);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.18), brown);
  crossH.position.set(0, 7.05, -4);
  tower.add(crossH);
  for (const x of [-3.65, -1.2, 1.2, 3.65]) {
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.85, 8), brown);
    finial.position.set(x, 13.05, 0);
    tower.add(finial);
  }
  tower.userData.landmark = 'st-margaret-tower';
  return tower;
}

function hipRoofMesh(width, depth, rise, material) {
  const hw = width / 2, hd = depth / 2;
  const ridge = Math.max(0, hw - hd);
  const a = [-hw, 0, -hd], b = [hw, 0, -hd], c = [hw, 0, hd], d = [-hw, 0, hd];
  const r1 = [-ridge, rise, 0], r2 = [ridge, rise, 0];
  const verts = [
    a, b, r2, a, r2, r1,
    d, r1, r2, d, r2, c,
    a, r1, d,
    b, c, r2,
  ].flat();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

function gableRoofMesh(depth, width, rise, material) {
  const hd = depth / 2, hw = width / 2;
  const verts = [
    [-hd, 0, -hw], [hd, 0, -hw], [hd, rise, 0],
    [-hd, 0, -hw], [hd, rise, 0], [-hd, rise, 0],
    [-hd, rise, 0], [hd, rise, 0], [hd, 0, hw],
    [-hd, rise, 0], [hd, 0, hw], [-hd, 0, hw],
  ].flat();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

function landmarkTextPlane(label, width, height, color = '#252a27', font = '700 64px Arial, sans-serif') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2, canvas.width - 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false })
  );
}

function buildClewistonInnAccents() {
  const inn = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: '#f1efe8' });
  const green = new THREE.MeshLambertMaterial({ color: '#285b43' });
  const glass = new THREE.MeshBasicMaterial({ color: '#526b72', toneMapped: false });
  const iron = new THREE.MeshLambertMaterial({ color: '#252a27' });

  const nameCanvas = document.createElement('canvas');
  nameCanvas.width = 768;
  nameCanvas.height = 96;
  const nameCtx = nameCanvas.getContext('2d');
  nameCtx.clearRect(0, 0, nameCanvas.width, nameCanvas.height);
  nameCtx.fillStyle = '#20362b';
  nameCtx.font = '600 52px Georgia, serif';
  nameCtx.textAlign = 'center';
  nameCtx.textBaseline = 'middle';
  nameCtx.fillText('CLEWISTON INN', nameCanvas.width / 2, nameCanvas.height / 2);
  const nameTexture = new THREE.CanvasTexture(nameCanvas);
  nameTexture.colorSpace = THREE.SRGBColorSpace;
  const nameMaterial = new THREE.MeshBasicMaterial({
    map: nameTexture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });

  // The source footprint is a U: two long hotel wings and a shorter rear
  // connector. These shallow hip roofs cover the generic flat roof caps.
  for (const [x, z, width, depth, rise] of [
    [58.0, -60.8, 45.2, 19.3, 2.15],
    [57.7, -88.4, 44.4, 19.4, 2.15],
    [68.6, -74.8, 23.4, 22.2, 1.7],
  ]) {
    const roof = hipRoofMesh(width, depth, rise, green);
    roof.position.set(x, 6.8, z);
    inn.add(roof);
  }

  // Full-height front-gabled portico on the west elevation. Local x runs from
  // the entrance wall (0) toward Civic Park (negative).
  const portico = new THREE.Group();
  portico.position.set(30.9, 0, -74.55);
  const porticoDepth = 9.2, porticoWidth = 14.2;
  for (const z of [-5.4, -1.8, 1.8, 5.4]) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.62, 6.55, 0.62), white);
    column.position.set(-8.05, 3.28, z);
    column.castShadow = true;
    portico.add(column);
  }
  for (const z of [-6.35, 6.35]) {
    const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.42, 6.45, 0.82), white);
    pilaster.position.set(-0.18, 3.23, z);
    portico.add(pilaster);
  }
  const entablature = new THREE.Mesh(new THREE.BoxGeometry(porticoDepth, 0.48, porticoWidth), white);
  entablature.position.set(-porticoDepth / 2, 6.52, 0);
  portico.add(entablature);
  const porchRoof = gableRoofMesh(porticoDepth + 0.7, porticoWidth + 0.7, 2.25, green);
  porchRoof.position.set(-porticoDepth / 2, 6.76, 0);
  portico.add(porchRoof);

  const pedimentShape = new THREE.Shape();
  pedimentShape.moveTo(-porticoWidth / 2, 0);
  pedimentShape.lineTo(porticoWidth / 2, 0);
  pedimentShape.lineTo(0, 2.25);
  pedimentShape.closePath();
  const pediment = new THREE.Mesh(new THREE.ShapeGeometry(pedimentShape), white);
  pediment.rotation.y = -Math.PI / 2;
  pediment.position.set(-porticoDepth - 0.36, 6.76, 0);
  portico.add(pediment);
  const oculus = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.55, 20), iron);
  oculus.rotation.y = -Math.PI / 2;
  oculus.position.set(-porticoDepth - 0.39, 7.52, 0);
  portico.add(oculus);

  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 2.7), iron);
  door.rotation.y = -Math.PI / 2;
  door.position.set(-0.12, 1.36, 0);
  portico.add(door);
  const fanlight = new THREE.Mesh(new THREE.CircleGeometry(1.08, 20, 0, Math.PI), glass);
  fanlight.rotation.y = -Math.PI / 2;
  fanlight.rotation.x = Math.PI;
  fanlight.position.set(-0.14, 2.72, 0);
  portico.add(fanlight);
  for (const z of [-1.65, 1.65]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd87f', toneMapped: false }));
    lamp.position.set(-0.28, 2.75, z);
    portico.add(lamp);
  }
  const nameplate = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 0.46), nameMaterial);
  nameplate.rotation.y = -Math.PI / 2;
  nameplate.position.set(-0.2, 3.55, 0);
  portico.add(nameplate);
  inn.add(portico);

  // Five-bay west facade: the center is the portico; paired window stacks
  // establish the symmetrical hotel rhythm on the flanking wings.
  for (const z of [-91.5, -85.4, -63.7, -57.7]) {
    for (const [y, h] of [[1.45, 2.15], [5.05, 1.75]]) {
      const window = new THREE.Mesh(new THREE.PlaneGeometry(1.45, h), glass);
      window.rotation.y = -Math.PI / 2;
      window.position.set(35.42, y, z);
      inn.add(window);
      const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, 0.06), white);
      mullionV.position.set(35.32, y, z);
      inn.add(mullionV);
      const mullionH = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.45), white);
      mullionH.position.set(35.32, y, z);
      inn.add(mullionH);
    }
  }
  inn.userData.landmark = 'clewiston-inn';
  return inn;
}

function buildHamptonInnAccents() {
  const hotel = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: '#e9e8e2' });
  const warm = new THREE.MeshLambertMaterial({ color: '#d49a75' });
  const brown = new THREE.MeshLambertMaterial({ color: '#b36f55' });
  const gray = new THREE.MeshLambertMaterial({ color: '#7a858d' });
  const glass = new THREE.MeshBasicMaterial({ color: '#263b46', toneMapped: false });

  // The north elevation faces Sugarland Highway. Cover its generic wall with
  // the hotel's observed warm ground-floor band and taller accent volumes.
  const groundBand = new THREE.Mesh(new THREE.BoxGeometry(68.8, 3.15, 0.22), warm);
  groundBand.position.set(-310.3, 1.58, -84.39);
  hotel.add(groundBand);
  const brownBay = new THREE.Mesh(new THREE.BoxGeometry(15.2, 9.45, 0.28), brown);
  brownBay.position.set(-301.5, 7.88, -84.34);
  hotel.add(brownBay);
  const verticalFin = new THREE.Mesh(new THREE.BoxGeometry(1.35, 13.75, 0.34), gray);
  verticalFin.position.set(-291.7, 6.88, -84.29);
  hotel.add(verticalFin);

  // A raised center parapet makes this read as the unusually tall downtown
  // hotel even from several blocks away.
  const raisedParapet = new THREE.Mesh(new THREE.BoxGeometry(30, 1.05, 15.45), white);
  raisedParapet.position.set(-322.2, 14.1, -92.72);
  raisedParapet.castShadow = true;
  hotel.add(raisedParapet);

  const addWindow = (x, y, width = 1.65, height = 1.5) => {
    const recess = new THREE.Mesh(new THREE.BoxGeometry(width + 0.55, height + 0.48, 0.1), white);
    recess.position.set(x, y, -84.2);
    hotel.add(recess);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), glass);
    pane.position.set(x, y, -84.13);
    hotel.add(pane);
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.07, height, 0.06), gray);
    mullion.position.set(x, y, -84.08);
    hotel.add(mullion);
  };
  const windowXs = [-340, -333.4, -326.8, -320.2, -313.6, -307, -300.4, -293.8, -287.2, -280.6];
  for (const y of [4.65, 7.75, 10.85]) {
    for (const x of windowXs) addWindow(x, y);
  }
  for (const x of [-339, -331.5, -324, -316.5, -309, -301.5, -279.5]) addWindow(x, 1.55, 2, 1.65);

  // The porte-cochere is nearly as important as the four-story wall in the
  // official exterior view: a deep white slab on square columns.
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(18.5, 0.58, 7.5), white);
  canopy.position.set(-287.5, 3.45, -80.65);
  canopy.castShadow = true;
  hotel.add(canopy);
  for (const x of [-295.3, -279.7]) {
    for (const z of [-83.65, -77.75]) {
      const column = new THREE.Mesh(new THREE.BoxGeometry(0.58, 3.2, 0.58), white);
      column.position.set(x, 1.6, z);
      column.castShadow = true;
      hotel.add(column);
    }
  }
  const entry = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.45), glass);
  entry.position.set(-287.5, 1.25, -84.11);
  hotel.add(entry);

  const signCanvas = document.createElement('canvas');
  signCanvas.width = 768;
  signCanvas.height = 128;
  const signCtx = signCanvas.getContext('2d');
  signCtx.clearRect(0, 0, signCanvas.width, signCanvas.height);
  signCtx.fillStyle = '#f06436';
  signCtx.font = 'italic 700 68px Georgia, serif';
  signCtx.textAlign = 'center';
  signCtx.textBaseline = 'middle';
  signCtx.fillText('Hampton Inn', signCanvas.width / 2, signCanvas.height / 2);
  const signTexture = new THREE.CanvasTexture(signCanvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(8.2, 1.35),
    new THREE.MeshBasicMaterial({ map: signTexture, transparent: true, depthWrite: false, toneMapped: false })
  );
  sign.position.set(-322.2, 11.85, -84.08);
  hotel.add(sign);

  hotel.userData.landmark = 'hampton-inn';
  return hotel;
}

function buildSugarHeadquartersAccents() {
  const office = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: '#f3f0e7' });
  const green = new THREE.MeshLambertMaterial({ color: '#3e7759' });
  const brick = new THREE.MeshLambertMaterial({ color: '#87513f' });
  const glass = new THREE.MeshBasicMaterial({ color: '#35474d', toneMapped: false });

  // The H-shaped footprint is composed of two deep wings joined by a center
  // range. Three green roof masses restore the headquarters silhouette.
  for (const [x, z, width, depth, rise] of [
    [-199.5, -73.2, 24.5, 49.5, 2.1],
    [-242.7, -72.5, 25.5, 49.8, 2.1],
    [-221.2, -72.6, 35.5, 18.5, 1.65],
  ]) {
    const roof = hipRoofMesh(width, depth, rise, green);
    roof.position.set(x, 10.2, z);
    office.add(roof);
  }

  // Classical south portico, seen across the headquarters lawn.
  const portico = new THREE.Group();
  portico.position.set(-223, 0, -97.25);
  portico.rotation.y = -Math.PI / 2;
  for (const z of [-5.7, -1.9, 1.9, 5.7]) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.55, 8.4, 0.55), white);
    column.position.set(-5.1, 4.2, z);
    column.castShadow = true;
    portico.add(column);
  }
  const entablature = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.45, 13.6), white);
  entablature.position.set(-3.1, 8.35, 0);
  portico.add(entablature);
  const porchRoof = gableRoofMesh(6.8, 14.2, 1.8, green);
  porchRoof.position.set(-3.4, 8.58, 0);
  portico.add(porchRoof);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 3), glass);
  door.rotation.y = -Math.PI / 2;
  door.position.set(-0.15, 1.5, 0);
  portico.add(door);
  office.add(portico);

  // The freestanding brick-and-white corporate sign is a major part of the
  // view from Sugarland Highway and helps identify the campus at driving speed.
  const signBase = new THREE.Mesh(new THREE.BoxGeometry(12, 2.8, 0.8), brick);
  signBase.position.set(-222, 1.4, -111.2);
  office.add(signBase);
  const signFace = new THREE.Mesh(new THREE.BoxGeometry(9.8, 2.35, 0.16), white);
  signFace.position.set(-222, 3.15, -111.65);
  office.add(signFace);
  const signText = landmarkTextPlane('UNITED STATES SUGAR', 8.8, 0.7, '#1f3530', '700 56px Arial, sans-serif');
  signText.position.set(-222, 3.15, -111.75);
  office.add(signText);
  office.userData.landmark = 'us-sugar-headquarters';
  return office;
}

function buildLibraryAccents() {
  const library = new THREE.Group();
  const pale = new THREE.MeshLambertMaterial({ color: '#ece9e1' });
  const trim = new THREE.MeshLambertMaterial({ color: '#cfc9bd' });
  const glass = new THREE.MeshBasicMaterial({ color: '#768f94', toneMapped: false });
  const doorMat = new THREE.MeshBasicMaterial({ color: '#35444a', toneMapped: false });

  const parapet = new THREE.Mesh(new THREE.BoxGeometry(38, 0.8, 2.1), pale);
  parapet.position.set(-100.8, 5.55, -144.2);
  library.add(parapet);
  const raised = new THREE.Mesh(new THREE.BoxGeometry(18, 1.15, 2.25), pale);
  raised.position.set(-100.5, 6.15, -144.15);
  library.add(raised);
  const trimBand = new THREE.Mesh(new THREE.BoxGeometry(39, 0.18, 0.2), trim);
  trimBand.position.set(-100.8, 4.48, -142.38);
  library.add(trimBand);

  for (const x of [-116, -110.5, -90.5, -85]) {
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 3.15), glass);
    bay.position.set(x, 2.25, -142.28);
    library.add(bay);
    for (const y of [1.2, 2.25, 3.3]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.055, 0.05), trim);
      bar.position.set(x, y, -142.2);
      library.add(bar);
    }
  }
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.38, 3.7), pale);
  canopy.position.set(-100.5, 3.45, -140.8);
  canopy.castShadow = true;
  library.add(canopy);
  for (const x of [-105.6, -95.4]) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.42, 3.25, 0.42), pale);
    column.position.set(x, 1.63, -139.45);
    library.add(column);
  }
  const entrance = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.55), doorMat);
  entrance.position.set(-100.5, 1.28, -142.24);
  library.add(entrance);
  const name = landmarkTextPlane('HARRY T. VAUGHN LIBRARY', 13.5, 0.72, '#635f55', '700 48px Arial, sans-serif');
  name.position.set(-100.5, 4.75, -142.18);
  library.add(name);
  library.userData.landmark = 'harry-t-vaughn-library';
  return library;
}

function buildDixieCrystalTheatreAccents() {
  const theatre = new THREE.Group();
  const teal = new THREE.MeshLambertMaterial({ color: '#24a9ad' });
  const gray = new THREE.MeshLambertMaterial({ color: '#4f565b' });
  const white = new THREE.MeshLambertMaterial({ color: '#f0eee7' });
  const glass = new THREE.MeshBasicMaterial({ color: '#273a42', toneMapped: false });

  for (const [x, h] of [[-50.35, 8.5], [-43.2, 8.9]]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.7, h, 0.55), teal);
    wing.position.set(x, h / 2, -8.92);
    theatre.add(wing);
  }
  const centerShape = new THREE.Shape();
  centerShape.moveTo(-2.55, 0);
  centerShape.lineTo(-2.55, 8.05);
  centerShape.quadraticCurveTo(0, 9.6, 2.55, 8.05);
  centerShape.lineTo(2.55, 0);
  centerShape.closePath();
  const center = new THREE.Mesh(new THREE.ShapeGeometry(centerShape), gray);
  center.position.set(-46.78, 0, -9.24);
  theatre.add(center);
  for (const x of [-50.5, -48.3, -45.25, -43.05]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.65, 2.05, 0.12), white);
    frame.position.set(x, 1.75, -9.28);
    theatre.add(frame);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.65), glass);
    pane.position.set(x, 1.75, -9.36);
    theatre.add(pane);
  }
  const entry = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.45), glass);
  entry.position.set(-46.78, 1.25, -9.38);
  theatre.add(entry);
  const entryCanopy = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.34, 1.25), gray);
  entryCanopy.position.set(-46.78, 3.08, -9.75);
  theatre.add(entryCanopy);
  const name = landmarkTextPlane('CAPTIVATING DENTAL CARE', 8.7, 0.72, '#ffffff', '700 45px Arial, sans-serif');
  name.position.set(-46.78, 5.15, -9.4);
  theatre.add(name);
  theatre.userData.landmark = 'dixie-crystal-theatre';
  return theatre;
}

function buildFirstBaptistAccents() {
  const church = new THREE.Group();
  const cream = new THREE.MeshLambertMaterial({ color: '#e9e6db' });
  const gray = new THREE.MeshLambertMaterial({ color: '#9ba2a1' });
  const dark = new THREE.MeshBasicMaterial({ color: '#394449', toneMapped: false });

  const tower = new THREE.Mesh(new THREE.BoxGeometry(7.2, 10.2, 7.2), cream);
  tower.position.set(-33.3, 5.1, 204.1);
  tower.castShadow = true;
  church.add(tower);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(8, 0.7, 8), cream);
  cap.position.set(-33.3, 10.35, 204.1);
  church.add(cap);
  const belfry = new THREE.Mesh(new THREE.BoxGeometry(5.5, 3.1, 5.5), cream);
  belfry.position.set(-33.3, 12.25, 204.1);
  church.add(belfry);
  for (const [x, z, ry] of [[-33.3, 201.3, 0], [-30.5, 204.1, Math.PI / 2]]) {
    const vent = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.5), dark);
    vent.position.set(x, 12.25, z);
    vent.rotation.y = ry;
    church.add(vent);
  }
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.45, 8.2, 4), gray);
  spire.position.set(-33.3, 17.9, 204.1);
  spire.rotation.y = Math.PI / 4;
  spire.castShadow = true;
  church.add(spire);
  const entrance = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.7), dark);
  entrance.position.set(-33.3, 1.4, 200.45);
  church.add(entrance);
  church.userData.landmark = 'first-baptist-church';
  return church;
}

function buildEvangelChurchAccents() {
  const church = new THREE.Group();
  const roofMat = new THREE.MeshLambertMaterial({ color: '#77736c' });
  const white = new THREE.MeshLambertMaterial({ color: '#eeeae1' });
  const stone = new THREE.MeshLambertMaterial({ color: '#756c60' });
  const dark = new THREE.MeshBasicMaterial({ color: '#323b3d', toneMapped: false });

  const roof = hipRoofMesh(58, 58, 4.2, roofMat);
  roof.position.set(-1422.6, 6.0, 284.1);
  church.add(roof);
  const clerestory = new THREE.Mesh(new THREE.BoxGeometry(12, 4.1, 12), white);
  clerestory.position.set(-1423.5, 8.05, 283.5);
  church.add(clerestory);
  const oculus = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.58, 18), dark);
  oculus.rotation.y = Math.PI / 2;
  oculus.position.set(-1417.42, 8.3, 283.5);
  church.add(oculus);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.65, 5.3, 8), white);
  spire.position.set(-1423.5, 12.75, 283.5);
  church.add(spire);
  const entryPylon = new THREE.Mesh(new THREE.BoxGeometry(0.7, 6.3, 10.5), stone);
  entryPylon.position.set(-1393.25, 3.15, 282.5);
  church.add(entryPylon);
  const entryCanopy = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.42, 22), roofMat);
  entryCanopy.position.set(-1391.2, 3.55, 283.5);
  church.add(entryCanopy);
  for (const z of [274.5, 283.5, 292.5]) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.42, 3.3, 0.42), white);
    column.position.set(-1389.2, 1.65, z);
    church.add(column);
  }
  const name = landmarkTextPlane('EVANGEL', 7.8, 0.9, '#ffffff', '700 64px Arial, sans-serif');
  name.rotation.y = Math.PI / 2;
  name.position.set(-1392.85, 3.5, 282.5);
  church.add(name);
  church.userData.landmark = 'evangel-assembly-of-god';
  return church;
}

function buildCityHallAccents() {
  const hall = new THREE.Group();
  const pale = new THREE.MeshLambertMaterial({ color: '#dfd6c6' });
  const white = new THREE.MeshLambertMaterial({ color: '#eceae2' });
  const dark = new THREE.MeshBasicMaterial({ color: '#354146', toneMapped: false });

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.38, 3.4), white);
  canopy.position.set(-137.2, 3.5, 154.65);
  hall.add(canopy);
  for (const x of [-141.8, -132.6]) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.25, 0.4), white);
    column.position.set(x, 1.63, 155.7);
    hall.add(column);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.55), dark);
  door.position.set(-137.2, 1.3, 153.63);
  hall.add(door);
  const name = landmarkTextPlane('CITY HALL', 6.6, 0.72, '#4b4d49', '700 62px Arial, sans-serif');
  name.position.set(-137.2, 4.05, 153.66);
  hall.add(name);

  // Decorative concrete screen blocks are the facade's strongest mid-century
  // cue. Open cells keep the pattern legible without a heavy solid wall.
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      const cx = -151.1 + col * 1.35, cy = 1.05 + row * 1.15;
      for (const dx of [-0.52, 0.52]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.18), pale);
        bar.position.set(cx + dx, cy, 153.7);
        hall.add(bar);
      }
      for (const dy of [-0.42, 0.42]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.12, 0.18), pale);
        bar.position.set(cx, cy + dy, 153.7);
        hall.add(bar);
      }
    }
  }
  for (const [x, flagColor] of [[-147.5, '#b63232'], [-141.8, '#2d5d91']]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 11, 8), white);
    pole.position.set(x, 5.5, 160.2);
    hall.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.3), new THREE.MeshBasicMaterial({ color: flagColor, side: THREE.DoubleSide }));
    flag.position.set(x + 1.2, 9.55, 160.2);
    hall.add(flag);
  }
  hall.userData.landmark = 'clewiston-city-hall';
  return hall;
}

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
    this.towerLights = [];

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

    // ---- Downtown civic cluster ----
    // Civic Park occupies the landscaped block between the U.S. Sugar offices
    // and the Clewiston Inn. Mapillary frames 743255202092314 and
    // 756274680305946 establish the gazebo's octagonal white form and cupola.
    const clewistonInn = buildClewistonInnAccents();
    scene.add(clewistonInn);
    const hamptonInn = buildHamptonInnAccents();
    scene.add(hamptonInn);
    const sugarHeadquarters = buildSugarHeadquartersAccents();
    scene.add(sugarHeadquarters);
    const publicLibrary = buildLibraryAccents();
    scene.add(publicLibrary);
    const dixieCrystalTheatre = buildDixieCrystalTheatreAccents();
    scene.add(dixieCrystalTheatre);
    const firstBaptist = buildFirstBaptistAccents();
    scene.add(firstBaptist);
    const evangelChurch = buildEvangelChurchAccents();
    scene.add(evangelChurch);
    const cityHall = buildCityHallAccents();
    scene.add(cityHall);
    const civicGazebo = buildCivicGazebo();
    civicGazebo.position.set(-139, 0.1, -83);
    scene.add(civicGazebo);
    const civicMemorial = buildCivicMemorial();
    civicMemorial.position.set(-68, 0.1, -78);
    scene.add(civicMemorial);

    // The city gallery establishes the rectangular pool, green-roof shade
    // shelter, and irregular blue splash pad south of W Osceola Avenue.
    const mottPool = buildMottPoolComplex();
    mottPool.position.set(-72, 0.1, -214);
    scene.add(mottPool);

    // Overture splits St. Margaret's sanctuary and entrance tower into several
    // small footprints, so the distinctive square tower is authored over them.
    const stMargaretTower = buildStMargaretTower();
    stMargaretTower.position.set(152, 0.1, -171);
    scene.add(stMargaretTower);

    // ---- Downtown communications tower ----
    // Placement is triangulated approximately from the Sugarland Highway
    // Mapillary sequence. The lattice, antenna clusters, and obstruction lights
    // are supported by frames 720414930338745 and 1461251455223630.
    const downtownTower = buildDowntownTower();
    downtownTower.position.set(-34, 0.1, 42);
    scene.add(downtownTower);
    const redLightMaterial = new THREE.MeshBasicMaterial({ color: '#ff332b', toneMapped: false });
    for (const y of [25, downtownTower.userData.topHeight]) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(y > 30 ? 0.28 : 0.2, 8, 6), redLightMaterial);
      light.position.set(downtownTower.position.x, y, downtownTower.position.z);
      scene.add(light);
      this.towerLights.push(light);
    }

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
    console.log('landmarks: downtown hotels, civic buildings, churches, and U.S. Sugar headquarters accents placed');
    console.log('landmarks: downtown communications tower placed');
  }

  update(dt, time) {
    const towerLightsOn = Math.floor(time * 1.5) % 2 === 0;
    for (const light of this.towerLights) light.visible = towerLightsOn;
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
