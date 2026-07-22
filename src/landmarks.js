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

function addPavedPath(group, points, width, material, y = 0.045) {
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const dx = bx - ax, dz = bz - az;
    const length = Math.hypot(dx, dz);
    if (length < 0.01) continue;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(length, 0.04, width), material);
    slab.position.set((ax + bx) / 2, y, (az + bz) / 2);
    slab.rotation.y = -Math.atan2(dz, dx);
    slab.receiveShadow = true;
    group.add(slab);
  }
  for (let i = 1; i < points.length - 1; i++) {
    const [x, z] = points[i];
    const join = new THREE.Mesh(new THREE.CylinderGeometry(width / 2, width / 2, 0.04, 16), material);
    join.position.set(x, y, z);
    join.receiveShadow = true;
    group.add(join);
  }
}

// Civic Park's old bald cypresses are much broader than the narrow conical
// canal cypress used by the procedural tree system. Low branching trunks and
// overlapping irregular crowns create their huge, room-like shade canopy.
function buildSpreadingCypress(scale = 1, phase = 0) {
  const tree = new THREE.Group();
  const bark = new THREE.MeshLambertMaterial({ color: '#62513f' });
  const foliage = [
    new THREE.MeshLambertMaterial({ color: '#436f43' }),
    new THREE.MeshLambertMaterial({ color: '#527f48' }),
    new THREE.MeshLambertMaterial({ color: '#628d53' }),
  ];

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.98, 6.4, 8), bark);
  trunk.position.y = 3.2;
  trunk.castShadow = true;
  tree.add(trunk);
  for (let i = 0; i < 5; i++) {
    const a = phase + (i / 5) * Math.PI * 2;
    const buttress = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.8, 4), bark);
    buttress.position.set(Math.cos(a) * 0.68, 0.88, Math.sin(a) * 0.68);
    buttress.rotation.y = -a + Math.PI / 4;
    buttress.scale.set(0.72, 1, 1.65);
    tree.add(buttress);
  }

  for (let i = 0; i < 7; i++) {
    const a = phase + (i / 7) * Math.PI * 2;
    const reach = 3.4 + (i % 3) * 0.55;
    tree.add(cylinderBetween(
      new THREE.Vector3(0, 4.7 + (i % 2) * 0.45, 0),
      new THREE.Vector3(Math.cos(a) * reach, 7.9 + (i % 3) * 0.35, Math.sin(a) * reach),
      0.16 + (i % 2) * 0.035,
      bark,
      6
    ));
  }

  const crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  const crownBlobs = [
    [0, 10.4, 0, 4.2, 2.35, 4.0],
    [-3.45, 8.75, 0.65, 3.65, 1.95, 3.25],
    [3.35, 8.95, -0.65, 3.7, 2.05, 3.35],
    [0.35, 8.55, 3.45, 3.25, 1.8, 3.45],
    [-0.4, 8.45, -3.35, 3.35, 1.85, 3.35],
    [-2.5, 10.35, -2.35, 3.0, 1.8, 2.9],
    [2.55, 10.15, 2.25, 3.1, 1.85, 3.0],
    [0, 12.1, 0, 2.8, 1.85, 2.7],
  ];
  for (let i = 0; i < crownBlobs.length; i++) {
    const [x, y, z, sx, sy, sz] = crownBlobs[i];
    const crown = new THREE.Mesh(crownGeometry, foliage[(i + Math.round(phase * 10)) % foliage.length]);
    crown.position.set(x, y, z);
    crown.scale.set(sx, sy, sz);
    crown.rotation.y = phase + i * 0.71;
    crown.castShadow = true;
    crown.receiveShadow = true;
    tree.add(crown);
  }
  tree.scale.setScalar(scale);
  tree.userData.treeType = 'spreading-bald-cypress';
  return tree;
}

function buildCivicParkGrounds() {
  const park = new THREE.Group();
  const pathMat = new THREE.MeshLambertMaterial({ color: '#d7d2c3' });
  const grassMat = new THREE.MeshLambertMaterial({ color: '#82ac67' });
  const courtRed = new THREE.MeshLambertMaterial({ color: '#a9564f' });
  const courtGreen = new THREE.MeshLambertMaterial({ color: '#4f8868' });
  const lineMat = new THREE.MeshBasicMaterial({ color: '#eee9d7', toneMapped: false });
  const fenceMat = new THREE.MeshLambertMaterial({ color: '#56615d' });
  const meshMat = new THREE.MeshBasicMaterial({
    color: '#6f7a76', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
  });

  // A low, broad rise in the middle of the park. The radial paths meet a
  // paved loop around its base instead of cutting through the mound.
  const hill = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    grassMat
  );
  hill.position.set(-110, 0.025, -68);
  hill.scale.set(18, 1.3, 13);
  hill.receiveShadow = true;
  park.add(hill);
  const hillLoop = new THREE.Mesh(new THREE.RingGeometry(15.2, 17.6, 48), pathMat);
  hillLoop.rotation.x = -Math.PI / 2;
  hillLoop.position.set(-110, 0.07, -68);
  hillLoop.scale.set(1.22, 0.86, 1);
  hillLoop.receiveShadow = true;
  park.add(hillLoop);

  // The aerial shows a loose spoke-and-loop walk rather than a formal grid.
  for (const points of [
    [[-176, -79], [-148, -82], [-145, -82]],
    [[-133, -82], [-127, -79]],
    [[-93, -80], [-75, -79], [-72, -78]],
    [[-64, -78], [-39, -73], [-16, -70]],
    [[-111, -35], [-110, -52]],
    [[-104, -126], [-106, -98], [-108, -83]],
    [[-171, -126], [-157, -108], [-146, -89]],
    [[-62, -94], [-65, -86], [-67, -84]],
    [[-41, -94], [-53, -88], [-63, -83]],
  ]) addPavedPath(park, points, 2.35, pathMat);

  // Two north-south courts in the northeast corner, including their red
  // apron, green playing surfaces, nets, low chain-link fence, and lights.
  const courtCenterX = -41, courtCenterZ = -117;
  const courtApron = new THREE.Mesh(new THREE.BoxGeometry(40, 0.12, 44), courtRed);
  courtApron.position.set(courtCenterX, 0.075, courtCenterZ);
  courtApron.receiveShadow = true;
  park.add(courtApron);
  const addCourtLine = (x, z, width, depth) => {
    const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.025, depth), lineMat);
    line.position.set(x, 0.16, z);
    park.add(line);
  };
  for (const offsetX of [-8.1, 8.1]) {
    const x = courtCenterX + offsetX;
    const playing = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.035, 33.2), courtGreen);
    playing.position.set(x, 0.14, courtCenterZ);
    playing.receiveShadow = true;
    park.add(playing);
    addCourtLine(x, courtCenterZ - 16.25, 13.6, 0.11);
    addCourtLine(x, courtCenterZ + 16.25, 13.6, 0.11);
    addCourtLine(x - 6.75, courtCenterZ, 0.11, 32.5);
    addCourtLine(x + 6.75, courtCenterZ, 0.11, 32.5);
    addCourtLine(x, courtCenterZ - 6.35, 13.6, 0.11);
    addCourtLine(x, courtCenterZ + 6.35, 13.6, 0.11);
    addCourtLine(x, courtCenterZ, 0.11, 12.7);

    const net = new THREE.Mesh(new THREE.PlaneGeometry(13.9, 0.92), meshMat);
    net.position.set(x, 0.55, courtCenterZ);
    park.add(net);
    for (const postX of [x - 7.05, x + 7.05]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 1.15, 7), fenceMat);
      post.position.set(postX, 0.59, courtCenterZ);
      park.add(post);
    }
  }

  const fenceHalfX = 20, fenceHalfZ = 22, fenceHeight = 3.45;
  for (const z of [courtCenterZ - fenceHalfZ, courtCenterZ + fenceHalfZ]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(fenceHalfX * 2, fenceHeight), meshMat);
    panel.position.set(courtCenterX, fenceHeight / 2, z);
    park.add(panel);
    park.add(cylinderBetween(
      new THREE.Vector3(courtCenterX - fenceHalfX, fenceHeight, z),
      new THREE.Vector3(courtCenterX + fenceHalfX, fenceHeight, z), 0.045, fenceMat, 6
    ));
    for (let x = courtCenterX - fenceHalfX; x <= courtCenterX + fenceHalfX; x += 6.6) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, fenceHeight, 6), fenceMat);
      post.position.set(x, fenceHeight / 2, z);
      park.add(post);
    }
  }
  for (const x of [courtCenterX - fenceHalfX, courtCenterX + fenceHalfX]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(fenceHalfZ * 2, fenceHeight), meshMat);
    panel.rotation.y = Math.PI / 2;
    panel.position.set(x, fenceHeight / 2, courtCenterZ);
    park.add(panel);
    park.add(cylinderBetween(
      new THREE.Vector3(x, fenceHeight, courtCenterZ - fenceHalfZ),
      new THREE.Vector3(x, fenceHeight, courtCenterZ + fenceHalfZ), 0.045, fenceMat, 6
    ));
    for (let z = courtCenterZ - fenceHalfZ; z <= courtCenterZ + fenceHalfZ; z += 7.2) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, fenceHeight, 6), fenceMat);
      post.position.set(x, fenceHeight / 2, z);
      park.add(post);
    }
  }
  for (const [x, z] of [
    [courtCenterX - 18.2, courtCenterZ - 20.2], [courtCenterX + 18.2, courtCenterZ - 20.2],
    [courtCenterX - 18.2, courtCenterZ + 20.2], [courtCenterX + 18.2, courtCenterZ + 20.2],
  ]) {
    const lightPole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 10, 8), fenceMat);
    lightPole.position.set(x, 5, z);
    lightPole.castShadow = true;
    park.add(lightPole);
    const lamps = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.32, 0.48), lineMat);
    lamps.position.set(x, 9.9, z);
    park.add(lamps);
  }

  // The explicit grove supplements NAIP's merged-canopy detections, which
  // otherwise reduce these landmark trees to a handful of ordinary oaks.
  const cypresses = [
    [-163, -119, 1.08, 0.2], [-132, -121, 1.18, 1.1], [-91, -125, 1.08, 2.2],
    [-164, -99, 1.12, 2.8], [-132, -100, 1.05, 0.8], [-91, -94, 1.12, 1.8],
    [-169, -61, 1.15, 2.4], [-148, -48, 1.08, 0.4], [-123, -42, 1.2, 1.4],
    [-88, -43, 1.15, 2.9], [-54, -49, 1.12, 0.9], [-24, -59, 1.05, 2.0],
    [-51, -86, 1.08, 2.6], [-18, -87, 1.02, 1.5],
  ];
  for (const [x, z, scale, phase] of cypresses) {
    const tree = buildSpreadingCypress(scale, phase);
    tree.position.set(x, 0.03, z);
    tree.rotation.y = phase;
    park.add(tree);
  }

  park.userData.landmark = 'civic-park-grounds';
  return park;
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

  // From W Osceola Avenue the splash pad sits to the right (east) of the main
  // pool, rather than beyond its far end.
  const splash = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 0.14, 32), new THREE.MeshLambertMaterial({ color: '#76c7df' }));
  splash.scale.set(1.25, 1, 0.72);
  splash.position.set(40, 0.08, 0);
  splash.receiveShadow = true;
  pool.add(splash);
  const sprayColors = ['#d34d3f', '#e8c72f', '#2d8f68', '#654fa3'];
  for (let i = 0; i < 5; i++) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 2.2 + (i % 2) * 0.7, 8),
      new THREE.MeshLambertMaterial({ color: sprayColors[i % sprayColors.length] })
    );
    pole.position.set(32 + i * 4, pole.geometry.parameters.height / 2, (i % 2 ? 3 : -2));
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

function capsuleOutline2D(halfStraight, radius, reverse = false, steps = 24) {
  const points = [];
  if (!reverse) {
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / steps;
      points.push(new THREE.Vector2(halfStraight + Math.cos(a) * radius, Math.sin(a) * radius));
    }
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI / 2 + (Math.PI * i) / steps;
      points.push(new THREE.Vector2(-halfStraight + Math.cos(a) * radius, Math.sin(a) * radius));
    }
  } else {
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI / 2 - (Math.PI * i) / steps;
      points.push(new THREE.Vector2(halfStraight + Math.cos(a) * radius, Math.sin(a) * radius));
    }
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 - (Math.PI * i) / steps;
      points.push(new THREE.Vector2(-halfStraight + Math.cos(a) * radius, Math.sin(a) * radius));
    }
  }
  return points;
}

function buildBleachers(width, rows, side, material, darkMaterial, sections = 3, includeRisers = true) {
  const stands = new THREE.Group();
  const gap = sections > 1 ? 1.25 : 0;
  const sectionWidth = (width - gap * (sections - 1)) / sections;
  for (let row = 0; row < rows; row++) {
    const y = 0.34 + row * 0.38;
    const z = side * row * 0.62;
    for (let section = 0; section < sections; section++) {
      const sectionX = (section - (sections - 1) / 2) * (sectionWidth + gap);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(sectionWidth, 0.13, 0.52), material);
      bench.position.set(sectionX, y, z);
      bench.castShadow = true;
      stands.add(bench);
      if (includeRisers) {
        const riser = new THREE.Mesh(new THREE.BoxGeometry(sectionWidth, y, 0.08), darkMaterial);
        riser.position.set(sectionX, y / 2, z + side * 0.22);
        stands.add(riser);
      }
    }
  }
  const rearRail = new THREE.Mesh(new THREE.BoxGeometry(width + 1, 0.08, 0.08), darkMaterial);
  rearRail.position.set(0, rows * 0.38 + 0.75, side * ((rows - 1) * 0.62 + 0.35));
  stands.add(rearRail);
  for (const x of [-width / 2, 0, width / 2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, rows * 0.38 + 0.75, 0.07), darkMaterial);
    post.position.set(x, (rows * 0.38 + 0.75) / 2, side * ((rows - 1) * 0.62 + 0.35));
    stands.add(post);
  }
  return stands;
}

function buildCaneField() {
  const stadium = new THREE.Group();
  const grass = new THREE.MeshLambertMaterial({ color: '#4f813e' });
  const stripeA = new THREE.MeshLambertMaterial({ color: '#568843' });
  const stripeB = new THREE.MeshLambertMaterial({ color: '#4a793b' });
  const trackMat = new THREE.MeshLambertMaterial({ color: '#777d82', side: THREE.DoubleSide });
  const trackLineMat = new THREE.LineBasicMaterial({ color: '#c8cbca', transparent: true, opacity: 0.72 });
  const white = new THREE.MeshBasicMaterial({ color: '#ececdf', toneMapped: false });
  const blue = new THREE.MeshLambertMaterial({ color: '#174675' });
  const gold = new THREE.MeshLambertMaterial({ color: '#d7aa32' });
  const cream = new THREE.MeshLambertMaterial({ color: '#e8dfc5' });
  const creamShadow = new THREE.MeshLambertMaterial({ color: '#cfc4a5' });
  const aluminum = new THREE.MeshLambertMaterial({ color: '#c2c8c9' });
  const steel = new THREE.MeshLambertMaterial({ color: '#6c7376' });
  const glass = new THREE.MeshBasicMaterial({ color: '#344c5a', toneMapped: false });

  // The OSM pitch is 113m x 52m and its long edge is rotated about 0.6 degrees.
  // The cached NAIP aerial establishes a compact six-lane oval around it.
  const outer = capsuleOutline2D(31, 44);
  const inner = capsuleOutline2D(31, 36, true);
  const trackShape = new THREE.Shape();
  trackShape.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i++) trackShape.lineTo(outer[i].x, outer[i].y);
  trackShape.closePath();
  const trackHole = new THREE.Path();
  trackHole.moveTo(inner[0].x, inner[0].y);
  for (let i = 1; i < inner.length; i++) trackHole.lineTo(inner[i].x, inner[i].y);
  trackHole.closePath();
  trackShape.holes.push(trackHole);
  const trackGeo = new THREE.ShapeGeometry(trackShape);
  trackGeo.rotateX(-Math.PI / 2);
  const track = new THREE.Mesh(trackGeo, trackMat);
  track.position.y = 0.045;
  track.receiveShadow = true;
  stadium.add(track);

  for (let lane = 0; lane <= 6; lane++) {
    const radius = 36 + lane * (8 / 6);
    const points = capsuleOutline2D(31, radius, false, 32)
      .map((p) => new THREE.Vector3(p.x, 0.075, p.y));
    stadium.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), trackLineMat));
  }

  const field = new THREE.Mesh(new THREE.BoxGeometry(112.5, 0.08, 51.2), grass);
  field.position.y = 0.065;
  field.receiveShadow = true;
  stadium.add(field);
  for (let i = 0; i < 12; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(9.25, 0.012, 50.8), i % 2 ? stripeA : stripeB);
    stripe.position.set(-50.875 + i * 9.25, 0.113, 0);
    stadium.add(stripe);
  }

  const fieldLine = (width, depth, x, z) => {
    const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.018, depth), white);
    line.position.set(x, 0.127, z);
    stadium.add(line);
  };
  fieldLine(109.7, 0.13, 0, -24.4);
  fieldLine(109.7, 0.13, 0, 24.4);
  for (let i = -6; i <= 6; i++) {
    const x = i * 9.144;
    fieldLine(0.13, 48.8, x, 0);
    if (i > -6 && i < 6) {
      fieldLine(0.42, 1.6, x, -16.2);
      fieldLine(0.42, 1.6, x, 16.2);
    }
  }
  fieldLine(0.14, 48.8, -54.85, 0);
  fieldLine(0.14, 48.8, 54.85, 0);

  // Cane Field also hosts soccer; its center circle and penalty boxes are
  // visible in the aerial beneath the football striping.
  const centerCircle = new THREE.Mesh(new THREE.RingGeometry(9.08, 9.22, 48), white);
  centerCircle.rotation.x = -Math.PI / 2;
  centerCircle.position.y = 0.132;
  stadium.add(centerCircle);
  for (const side of [-1, 1]) {
    fieldLine(16.5, 0.12, side * 46.6, -20.15);
    fieldLine(16.5, 0.12, side * 46.6, 20.15);
    fieldLine(0.12, 40.3, side * 38.35, 0);
  }

  // High-school goalposts stand behind each football end zone.
  for (const side of [-1, 1]) {
    const x = side * 57.3;
    stadium.add(cylinderBetween(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, 3.25, 0), 0.11, gold, 8));
    stadium.add(cylinderBetween(new THREE.Vector3(x, 3.25, -3.7), new THREE.Vector3(x, 3.25, 3.7), 0.1, gold, 8));
    for (const z of [-3.55, 3.55]) {
      stadium.add(cylinderBetween(new THREE.Vector3(x, 3.25, z), new THREE.Vector3(x, 11.2, z), 0.085, gold, 8));
    }
  }

  // The home grandstand is three distinct banks in the field-facing photo:
  // two broad aluminum stands flank a cream center bank that climbs the press
  // tower. Their open undersides remain visible from the parking-lot side.
  const homeLeft = buildBleachers(27.5, 13, 1, aluminum, steel, 1, false);
  homeLeft.position.set(-27.2, 0, 40.7);
  stadium.add(homeLeft);
  const homeRight = buildBleachers(27.5, 13, 1, aluminum, steel, 1, false);
  homeRight.position.set(18.8, 0, 40.7);
  stadium.add(homeRight);
  const homeCenter = buildBleachers(20.5, 14, 1, cream, creamShadow, 1);
  homeCenter.position.set(-4.2, 0, 35.1);
  stadium.add(homeCenter);

  // Dark center steps and aluminum handrails are strong visual dividers in
  // the photographed center bank.
  for (let row = 0; row < 14; row++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.09, 0.58), blue);
    step.position.set(-4.2, 0.42 + row * 0.38, 35.1 + row * 0.62);
    stadium.add(step);
  }
  for (const x of [-13.25, 4.55, 5.05, -40.95, 32.55]) {
    stadium.add(cylinderBetween(
      new THREE.Vector3(x, 0.6, 39.8),
      new THREE.Vector3(x, 5.6, 48.6),
      0.045,
      steel,
      6
    ));
  }

  // Sparse diagonal bracing gives the two side banks their open aluminum
  // scaffold silhouette when approached from the school parking lot.
  for (const x of [-39, -30, -21, -15.5, 6.5, 12, 21, 30.5]) {
    stadium.add(cylinderBetween(
      new THREE.Vector3(x, 0.1, 49.1),
      new THREE.Vector3(x, 4.8, 41.2),
      0.055,
      steel,
      6
    ));
    stadium.add(cylinderBetween(
      new THREE.Vector3(x, 0.1, 41.2),
      new THREE.Vector3(x, 4.8, 49.1),
      0.055,
      steel,
      6
    ));
  }

  const visitors = buildBleachers(56, 7, -1, aluminum, steel);
  visitors.position.z = -48;
  stadium.add(visitors);

  // A tall cream masonry tower fully envelops the mapped generic center
  // footprint. The parking-side photograph establishes its plain rear wall,
  // base door, upper lettering, and press/camera levels above.
  const pressTower = new THREE.Mesh(new THREE.BoxGeometry(17.3, 9.2, 12.2), cream);
  pressTower.position.set(-4.2, 4.6, 48.2);
  pressTower.castShadow = true;
  stadium.add(pressTower);
  const rearDoor = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.8), blue);
  rearDoor.position.set(-4.2, 1.42, 54.32);
  stadium.add(rearDoor);

  const rearCane = landmarkTextPlane('CANE', 6.1, 1.8, '#174675', '800 120px Arial, sans-serif');
  rearCane.position.set(-8.25, 6.35, 54.34);
  stadium.add(rearCane);
  const rearField = landmarkTextPlane('FIELD', 6.1, 1.8, '#174675', '800 120px Arial, sans-serif');
  rearField.position.set(-0.15, 6.35, 54.34);
  stadium.add(rearField);
  const rearCrest = new THREE.Mesh(new THREE.CircleGeometry(1.08, 24), gold);
  rearCrest.position.set(-4.2, 6.35, 54.35);
  stadium.add(rearCrest);
  const rearCrestInset = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), blue);
  rearCrestInset.position.set(-4.2, 6.35, 54.37);
  stadium.add(rearCrestInset);
  const rearTiger = landmarkTextPlane('T', 1.1, 0.9, '#e8dfc5', '800 82px Georgia, serif');
  rearTiger.position.set(-4.2, 6.35, 54.39);
  stadium.add(rearTiger);

  // Glazed press booth at the top front of the tower.
  const pressBox = new THREE.Mesh(new THREE.BoxGeometry(17.3, 2.8, 4.4), cream);
  pressBox.position.set(-4.2, 10.35, 44.25);
  pressBox.castShadow = true;
  stadium.add(pressBox);
  const pressRoof = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.25, 5), blue);
  pressRoof.position.set(-4.2, 11.88, 44.25);
  stadium.add(pressRoof);
  for (const x of [-6.6, -4.4, -2.2, 0, 2.2, 4.4, 6.6]) {
    const window = new THREE.Mesh(new THREE.PlaneGeometry(1.82, 1.18), glass);
    window.rotation.y = Math.PI;
    window.position.set(x - 4.2, 10.45, 42.03);
    stadium.add(window);
  }

  // Small open camera deck and canopy above the glazed booth.
  for (const x of [-7.3, -1.1]) {
    for (const z of [43, 45.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 2.15, 6), steel);
      post.position.set(x, 13, z);
      stadium.add(post);
    }
  }
  const cameraCanopy = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.22, 3.2), cream);
  cameraCanopy.position.set(-4.2, 14.08, 44.25);
  stadium.add(cameraCanopy);

  // Blue-and-gold mural wall along the field edge, simplified from the
  // photographed community artwork while preserving its main wordmarks.
  const mural = new THREE.Mesh(new THREE.BoxGeometry(84, 1.75, 0.5), blue);
  mural.position.set(-4.2, 0.88, 36.65);
  mural.castShadow = true;
  stadium.add(mural);
  const clewistonWord = landmarkTextPlane('CLEWISTON', 22, 1.05, '#e2b83d', '800 68px Arial, sans-serif');
  clewistonWord.rotation.y = Math.PI;
  clewistonWord.position.set(23.5, 1.02, 36.38);
  stadium.add(clewistonWord);
  const caneFieldWord = landmarkTextPlane('CANE FIELD', 17, 0.95, '#f1eee4', '800 64px Arial, sans-serif');
  caneFieldWord.rotation.y = Math.PI;
  caneFieldWord.position.set(1.2, 1.02, 36.37);
  stadium.add(caneFieldWord);
  const tigersWord = landmarkTextPlane('Tigers', 17, 1.12, '#e2b83d', 'italic 700 72px Georgia, serif');
  tigersWord.rotation.y = Math.PI;
  tigersWord.position.set(-20.2, 1.02, 36.38);
  stadium.add(tigersWord);
  const homeWord = landmarkTextPlane('HOME OF THE TIGERS', 13, 0.72, '#f1eee4', '700 45px Arial, sans-serif');
  homeWord.rotation.y = Math.PI;
  homeWord.position.set(-34.5, 1.02, 36.37);
  stadium.add(homeWord);
  for (const x of [39, -8, -41.5]) {
    const medallion = new THREE.Mesh(new THREE.CircleGeometry(0.72, 20), gold);
    medallion.rotation.y = Math.PI;
    medallion.position.set(x, 0.98, 36.35);
    stadium.add(medallion);
    const inset = new THREE.Mesh(new THREE.CircleGeometry(0.46, 20), blue);
    inset.rotation.y = Math.PI;
    inset.position.set(x, 0.98, 36.32);
    stadium.add(inset);
  }

  // West-end scoreboard, oriented toward the field and locker-room approach.
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.55, 5.8, 10.2), blue);
  board.position.set(-73.5, 6.1, -27);
  board.castShadow = true;
  stadium.add(board);
  for (const z of [-30.5, -23.5]) {
    const support = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 4, 8), steel);
    support.position.set(-73.5, 2, z);
    stadium.add(support);
  }
  const boardTitle = landmarkTextPlane('CANE FIELD', 8.7, 1.1, '#e2b83d', '700 62px Arial, sans-serif');
  boardTitle.rotation.y = Math.PI / 2;
  boardTitle.position.set(-73.19, 7.25, -27);
  stadium.add(boardTitle);
  const boardTeam = landmarkTextPlane('CLEWISTON TIGERS', 8.7, 0.78, '#f1eee4', '700 48px Arial, sans-serif');
  boardTeam.rotation.y = Math.PI / 2;
  boardTeam.position.set(-73.18, 5.45, -27);
  stadium.add(boardTeam);

  // Three light standards per sideline keep the silhouette legible from the
  // neighborhood streets without making this compact stadium feel oversized.
  for (const z of [-57.5, 61.5]) {
    for (const x of [-43, 0, 43]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 22, 8), steel);
      pole.position.set(x, 11, z);
      pole.castShadow = true;
      stadium.add(pole);
      const lampBar = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.18, 0.18), steel);
      lampBar.position.set(x, 22, z);
      stadium.add(lampBar);
      for (const lx of [-2.4, -1.2, 0, 1.2, 2.4]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.55, 0.28), aluminum);
        lamp.position.set(x + lx, 21.75, z - Math.sign(z) * 0.18);
        lamp.rotation.x = Math.sign(z) * 0.22;
        stadium.add(lamp);
      }
    }
  }

  // Low perimeter fencing follows the oval, leaving the existing west-side
  // locker-room building and school circulation visible.
  const fencePoints = capsuleOutline2D(32, 46, false, 18);
  for (let i = 0; i < fencePoints.length; i += 3) {
    const p = fencePoints[i];
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.3, 6), steel);
    post.position.set(p.x, 1.15, p.y);
    stadium.add(post);
  }

  stadium.rotation.y = 0.0104;
  stadium.position.set(-695.7, 0.035, -340.04);
  stadium.userData.landmark = 'cane-field';
  return stadium;
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
    window.rotation.y = Math.PI;
    window.position.set(x, 10.7, -3.92);
    tower.add(window);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.8), brown);
  door.rotation.y = Math.PI;
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
    a, r2, b, a, r1, r2,
    d, r2, r1, d, c, r2,
    a, d, r1,
    b, r2, c,
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
    [-hd, 0, -hw], [hd, rise, 0], [hd, 0, -hw],
    [-hd, 0, -hw], [-hd, rise, 0], [hd, rise, 0],
    [-hd, rise, 0], [hd, 0, hw], [hd, rise, 0],
    [-hd, rise, 0], [-hd, 0, hw], [hd, 0, hw],
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
  // The entrance bay projects beyond the two hotel wings. Extend only the
  // rear of its roof into the wing roofs so the portico keeps its real depth
  // while the gable surfaces meet cleanly from both side views.
  const porchRoofDepth = porticoDepth + 5.2;
  const porchRoof = gableRoofMesh(porchRoofDepth, porticoWidth + 0.7, 2.25, green);
  porchRoof.position.set((-porticoDepth + 4.5) / 2, 6.76, 0);
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
  const pale = new THREE.MeshLambertMaterial({ color: '#efeee9' });
  const white = new THREE.MeshLambertMaterial({ color: '#f7f6f1' });
  const trim = new THREE.MeshLambertMaterial({ color: '#a8aaa4' });
  const roofMat = new THREE.MeshLambertMaterial({ color: '#c8cac7' });
  const glass = new THREE.MeshBasicMaterial({ color: '#758d8f', toneMapped: false });
  const doorMat = new THREE.MeshBasicMaterial({ color: '#35444a', toneMapped: false });
  const mulchMat = new THREE.MeshLambertMaterial({ color: '#8a4d3e' });
  const shrubMat = new THREE.MeshLambertMaterial({ color: '#3f7446' });
  const walkMat = new THREE.MeshLambertMaterial({ color: '#d1cec4' });

  // The photographed Osceola Avenue elevation has two shallow footprint
  // offsets, but reads as one low Art Deco facade. Smooth overlays replace
  // the generic textured walls while respecting both mapped street edges.
  const westWall = new THREE.Mesh(new THREE.BoxGeometry(18.2, 5.05, 0.28), pale);
  westWall.position.set(-110.05, 2.53, -186.2);
  westWall.receiveShadow = true;
  library.add(westWall);
  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(16.45, 5.05, 0.28), pale);
  eastWall.position.set(-90.9, 2.53, -183.53);
  eastWall.receiveShadow = true;
  library.add(eastWall);
  for (const [x, z, width] of [[-110.05, -186.37, 18.15], [-90.9, -183.7, 16.4]]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(width, 0.18, 0.12), trim);
    band.position.set(x, 3.88, z);
    library.add(band);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.35, 0.24, 0.55), white);
    cap.position.set(x, 5.08, z + 0.1);
    library.add(cap);
  }

  // The larger auditorium/stack volume and intermediate roof step are clearly
  // visible above the low street facade in the elevated reference image.
  const rearUpper = new THREE.Mesh(new THREE.BoxGeometry(30.5, 2.05, 17.5), pale);
  rearUpper.position.set(-100.5, 5.65, -164.8);
  rearUpper.castShadow = true;
  library.add(rearUpper);
  const rearCap = new THREE.Mesh(new THREE.BoxGeometry(31.2, 0.22, 18.1), white);
  rearCap.position.set(-100.5, 6.77, -164.8);
  library.add(rearCap);
  const middleStep = new THREE.Mesh(new THREE.BoxGeometry(25.2, 0.62, 10.8), roofMat);
  middleStep.position.set(-98.7, 5.06, -176.5);
  middleStep.castShadow = true;
  library.add(middleStep);

  const addGlassBlockBay = (x, z) => {
    const surround = new THREE.Mesh(new THREE.BoxGeometry(1.62, 3.48, 0.13), white);
    surround.position.set(x, 2.2, z);
    library.add(surround);
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 3.02), glass);
    bay.rotation.y = Math.PI;
    bay.position.set(x, 2.2, z - 0.075);
    library.add(bay);
    for (const y of [1.3, 2.2, 3.1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.045, 0.055), trim);
      bar.position.set(x, y, z - 0.1);
      library.add(bar);
    }
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.045, 3.02, 0.055), trim);
    mullion.position.set(x, 2.2, z - 0.1);
    library.add(mullion);

    // Small clipped gables form the distinctive sawtooth frieze above each
    // narrow glass-block opening.
    const accentShape = new THREE.Shape();
    accentShape.moveTo(-0.82, 0);
    accentShape.lineTo(-0.23, 0);
    accentShape.lineTo(0, 0.38);
    accentShape.lineTo(0.23, 0);
    accentShape.lineTo(0.82, 0);
    accentShape.closePath();
    const accent = new THREE.Mesh(new THREE.ShapeGeometry(accentShape), trim);
    accent.rotation.y = Math.PI;
    accent.position.set(x, 3.96, z - 0.12);
    library.add(accent);
  };
  for (const x of [-90.2, -87.7, -85.2, -83.15]) addGlassBlockBay(x, -183.72);
  for (const x of [-116.1, -111.9]) addGlassBlockBay(x, -186.39);

  const nameTop = landmarkTextPlane('HARRY T. VAUGHN', 8.5, 0.76, '#3f4140', '800 74px Georgia, serif');
  nameTop.rotation.y = Math.PI;
  nameTop.position.set(-95.45, 2.95, -183.75);
  library.add(nameTop);
  const nameBottom = landmarkTextPlane('LIBRARY', 5.4, 0.7, '#3f4140', '800 76px Georgia, serif');
  nameBottom.rotation.y = Math.PI;
  nameBottom.position.set(-95.45, 2.2, -183.76);
  library.add(nameBottom);

  // Small gabled entrance porch at the junction of the two facade runs. It
  // projects to the sidewalk, unlike the previous broad flat canopy.
  const porchCenterX = -103.25;
  const porchBackZ = -184.0;
  const porchFrontZ = -191.3;
  const porchCenterZ = (porchBackZ + porchFrontZ) / 2;
  const porchFloor = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.12, 7.6), walkMat);
  porchFloor.position.set(porchCenterX, 0.07, porchCenterZ);
  porchFloor.receiveShadow = true;
  library.add(porchFloor);
  const porchEntablature = new THREE.Mesh(new THREE.BoxGeometry(6.75, 0.3, 7.75), white);
  porchEntablature.position.set(porchCenterX, 3.15, porchCenterZ);
  library.add(porchEntablature);
  const porchRoof = gableRoofMesh(7.9, 7.15, 1.05, roofMat);
  porchRoof.rotation.y = Math.PI / 2;
  porchRoof.position.set(porchCenterX, 3.29, porchCenterZ);
  library.add(porchRoof);
  for (const x of [porchCenterX - 2.45, porchCenterX + 2.45]) {
    for (const z of [porchFrontZ + 0.72, -186.55]) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 3.05, 10), white);
      column.position.set(x, 1.58, z);
      column.castShadow = true;
      library.add(column);
      const capital = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.17, 0.62), white);
      capital.position.set(x, 3.03, z);
      library.add(capital);
    }
  }
  const pedimentShape = new THREE.Shape();
  pedimentShape.moveTo(-3.58, 0);
  pedimentShape.lineTo(3.58, 0);
  pedimentShape.lineTo(0, 1.05);
  pedimentShape.closePath();
  const pediment = new THREE.Mesh(new THREE.ShapeGeometry(pedimentShape), white);
  pediment.rotation.y = Math.PI;
  pediment.position.set(porchCenterX, 3.29, porchFrontZ - 0.06);
  library.add(pediment);
  const entrance = new THREE.Mesh(new THREE.PlaneGeometry(2.45, 2.58), doorMat);
  entrance.rotation.y = Math.PI;
  entrance.position.set(porchCenterX, 1.31, -186.38);
  library.add(entrance);

  // Short paved approach, book-return pedestal, wall light, and clipped
  // foundation shrubs complete the street-level cues in the supplied photos.
  const approach = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.05, 8.2), walkMat);
  approach.position.set(porchCenterX, 0.045, -195.35);
  approach.receiveShadow = true;
  library.add(approach);
  const bookDrop = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.2, 0.72), trim);
  bookDrop.position.set(porchCenterX + 3.05, 0.62, porchFrontZ + 0.45);
  bookDrop.castShadow = true;
  library.add(bookDrop);
  const bookSlot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.04), doorMat);
  bookSlot.position.set(porchCenterX + 3.05, 0.88, porchFrontZ + 0.07);
  library.add(bookSlot);
  const wallLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshBasicMaterial({ color: '#f6df9b', toneMapped: false })
  );
  wallLight.position.set(-100.05, 3.35, -183.78);
  library.add(wallLight);

  const mulch = new THREE.Mesh(new THREE.BoxGeometry(17.3, 0.035, 2.25), mulchMat);
  mulch.position.set(-90.8, 0.035, -185.35);
  mulch.receiveShadow = true;
  library.add(mulch);
  for (const [x, sx, sy, sz] of [
    [-97.1, 1.7, 0.8, 1.2], [-92.5, 1.8, 0.86, 1.25],
    [-87.7, 1.75, 0.82, 1.2], [-82.9, 1.55, 0.75, 1.1],
  ]) {
    const shrub = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), shrubMat);
    shrub.position.set(x, sy, -185.55);
    shrub.scale.set(sx, sy, sz);
    shrub.castShadow = true;
    library.add(shrub);
  }
  library.userData.landmark = 'harry-t-vaughn-library';
  return library;
}

function buildYouthCenterChickee() {
  const chickee = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: '#775b3c' });
  const darkWood = new THREE.MeshLambertMaterial({ color: '#4f3c2b' });
  const thatch = new THREE.MeshLambertMaterial({ color: '#b79b61', side: THREE.DoubleSide });
  const floorMat = new THREE.MeshLambertMaterial({ color: '#cbc2ae' });

  const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.25, 4.25, 0.16, 8), floorMat);
  floor.position.y = 0.09;
  floor.receiveShadow = true;
  chickee.add(floor);
  for (const [x, z] of [[-2.7, -2.7], [2.7, -2.7], [-2.7, 2.7], [2.7, 2.7]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 3.4, 7), wood);
    post.position.set(x, 1.78, z);
    post.castShadow = true;
    chickee.add(post);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.15, 3.25, 8), thatch);
  roof.position.y = 4.85;
  roof.rotation.y = Math.PI / 8;
  roof.castShadow = true;
  chickee.add(roof);
  const fringe = new THREE.Mesh(new THREE.CylinderGeometry(4.82, 5.14, 0.42, 8, 1, true), thatch);
  fringe.position.y = 3.25;
  fringe.rotation.y = Math.PI / 8;
  chickee.add(fringe);

  const table = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.18, 1.05), darkWood);
  table.position.y = 1.05;
  chickee.add(table);
  for (const z of [-1.15, 1.15]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.16, 0.48), wood);
    bench.position.set(0, 0.62, z);
    chickee.add(bench);
  }
  chickee.userData.landmark = 'youth-center-chickee';
  return chickee;
}

function buildYouthCenterAccents() {
  const center = new THREE.Group();
  const wall = new THREE.MeshLambertMaterial({ color: '#c9cbc7' });
  const pale = new THREE.MeshLambertMaterial({ color: '#eeede7' });
  const roofMat = new THREE.MeshLambertMaterial({ color: '#d9dbd8' });
  const trim = new THREE.MeshLambertMaterial({ color: '#5e6865' });
  const gridMat = new THREE.MeshLambertMaterial({ color: '#9da3a0' });
  const greenMetal = new THREE.MeshLambertMaterial({ color: '#315b4d' });
  const glass = new THREE.MeshBasicMaterial({ color: '#28383a', toneMapped: false });
  const stone = new THREE.MeshLambertMaterial({ color: '#aaa9a2' });
  const brick = new THREE.MeshLambertMaterial({ color: '#a75d4d' });
  const walk = new THREE.MeshLambertMaterial({ color: '#d1cec4' });
  const mulch = new THREE.MeshLambertMaterial({ color: '#8c4a3b' });
  const hedgeMat = new THREE.MeshLambertMaterial({ color: '#3e7042' });

  // The two street wings sit at slightly different depths in the mapped
  // footprint. Their recessed junction forms the photographed entrance bay.
  const westWall = new THREE.Mesh(new THREE.BoxGeometry(16.55, 4.25, 0.3), wall);
  westWall.position.set(-45.82, 2.13, -181.67);
  westWall.receiveShadow = true;
  center.add(westWall);
  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(12.2, 4.25, 0.3), wall);
  eastWall.position.set(-31.65, 2.13, -183.39);
  eastWall.receiveShadow = true;
  center.add(eastWall);

  const addBlockGrid = (cx, z, width) => {
    const faceZ = z - 0.175;
    for (const y of [1.05, 2.05, 3.05]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(width - 0.15, 0.035, 0.045), gridMat);
      seam.position.set(cx, y, faceZ);
      center.add(seam);
    }
    for (let x = cx - width / 2 + 1.7; x < cx + width / 2; x += 1.7) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.035, 3.9, 0.045), gridMat);
      seam.position.set(x, 2.05, faceZ);
      center.add(seam);
    }
  };
  addBlockGrid(-45.82, -181.67, 16.45);
  addBlockGrid(-31.65, -183.39, 12.1);

  // Four broad shallow roof sections create the low folded silhouette seen
  // in the aerial views, with generous white overhangs on every wing.
  for (const [x, z, width, depth, rise] of [
    [-46.0, -176.2, 20.2, 14.9, 1.15],
    [-31.6, -178.1, 15.6, 13.7, 0.95],
    [-41.1, -160.8, 14.4, 20.5, 1.05],
    [-40.1, -170.4, 13.8, 13.1, 0.9],
  ]) {
    const roof = hipRoofMesh(width, depth, rise, roofMat);
    roof.position.set(x, 4.75, z);
    center.add(roof);
  }

  const addRibbonWindow = (x, z, width) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.45, 1.15, 0.14), trim);
    frame.position.set(x, 2.72, z);
    center.add(frame);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.68), glass);
    pane.rotation.y = Math.PI;
    pane.position.set(x, 2.74, z - 0.085);
    center.add(pane);
  };
  addRibbonWindow(-43.55, -181.87, 3.35);
  addRibbonWindow(-35.15, -183.59, 3.8);

  // Recessed dark entry and the small classical canopy centered between the
  // two roof wings. The green metal strip is visible behind the pediment.
  const entranceX = -39.75;
  const entrance = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 3.0), glass);
  entrance.rotation.y = Math.PI;
  entrance.position.set(entranceX, 1.52, -182.08);
  center.add(entrance);
  const entryAwning = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.2, 1.45), greenMetal);
  entryAwning.position.set(entranceX, 3.25, -182.55);
  center.add(entryAwning);
  const entryCenterZ = -184.05;
  const entryEntablature = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.34, 4.5), pale);
  entryEntablature.position.set(entranceX, 3.48, entryCenterZ);
  center.add(entryEntablature);
  const entryRoof = gableRoofMesh(4.8, 7.5, 0.82, stone);
  entryRoof.rotation.y = Math.PI / 2;
  entryRoof.position.set(entranceX, 3.62, entryCenterZ);
  center.add(entryRoof);
  const pedimentShape = new THREE.Shape();
  pedimentShape.moveTo(-3.75, 0);
  pedimentShape.lineTo(3.75, 0);
  pedimentShape.lineTo(0, 0.82);
  pedimentShape.closePath();
  const pediment = new THREE.Mesh(new THREE.ShapeGeometry(pedimentShape), stone);
  pediment.rotation.y = Math.PI;
  pediment.position.set(entranceX, 3.62, -186.48);
  center.add(pediment);
  for (const x of [entranceX - 2.65, entranceX + 2.65]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.72, 0.68), stone);
    base.position.set(x, 0.38, -185.72);
    center.add(base);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 2.9, 10), pale);
    column.position.set(x, 1.82, -185.72);
    column.castShadow = true;
    center.add(column);
    const capital = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.62), pale);
    capital.position.set(x, 3.25, -185.72);
    center.add(capital);
  }
  const address = landmarkTextPlane('110  W OSCEOLA AVE', 3.5, 0.42, '#303532', '700 54px Arial, sans-serif');
  address.rotation.y = Math.PI;
  address.position.set(entranceX, 4.04, -186.51);
  center.add(address);

  const nameTop = landmarkTextPlane('CHARLES E. WEATHERALD', 9.2, 0.72, '#383b39', '700 61px Georgia, serif');
  nameTop.rotation.y = Math.PI;
  nameTop.position.set(-49.35, 2.55, -181.92);
  center.add(nameTop);
  const nameBottom = landmarkTextPlane('YOUTH CENTER', 7.2, 0.72, '#383b39', '700 68px Georgia, serif');
  nameBottom.rotation.y = Math.PI;
  nameBottom.position.set(-49.35, 1.88, -181.93);
  center.add(nameBottom);

  // Brick threshold, concrete approach, and a compact crosswalk align the
  // entry directly with Osceola Avenue as shown in the frontal photograph.
  const threshold = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.06, 2.6), brick);
  threshold.position.set(entranceX, 0.055, -187.2);
  threshold.receiveShadow = true;
  center.add(threshold);
  const approach = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.045, 6.5), walk);
  approach.position.set(entranceX, 0.04, -191.45);
  approach.receiveShadow = true;
  center.add(approach);
  for (let i = 0; i < 7; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.025, 0.34), pale);
    stripe.position.set(entranceX, 0.125, -195.0 - i * 1.18);
    center.add(stripe);
  }

  // Tall civic flagpole immediately east of the entrance.
  const poleX = -47.1, poleZ = -188.35;
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 15.5, 10), stone);
  flagPole.position.set(poleX, 7.75, poleZ);
  flagPole.castShadow = true;
  center.add(flagPole);
  const flagRed = new THREE.MeshLambertMaterial({ color: '#a83c3c' });
  const flagWhite = new THREE.MeshBasicMaterial({ color: '#f2f0e9', toneMapped: false });
  for (let i = 0; i < 7; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 0.035), i % 2 ? flagWhite : flagRed);
    stripe.position.set(poleX - 0.95, 14.55 - i * 0.14, poleZ);
    center.add(stripe);
  }
  const canton = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.56, 0.04), greenMetal);
  canton.material = new THREE.MeshBasicMaterial({ color: '#2f4d7d', toneMapped: false });
  canton.position.set(poleX - 1.52, 14.34, poleZ - 0.005);
  center.add(canton);

  // Low clipped hedges and red mulch wrap the long front wall.
  for (const [x, z, width] of [[-48.0, -183.15, 11.5], [-28.8, -184.83, 6.2]]) {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(width, 0.035, 1.8), mulch);
    bed.position.set(x, 0.03, z);
    center.add(bed);
    for (let hx = x - width / 2 + 1.0; hx < x + width / 2; hx += 2.0) {
      const hedge = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 6), hedgeMat);
      hedge.position.set(hx, 0.57, z - 0.12);
      hedge.scale.set(1.15, 0.58, 0.72);
      hedge.castShadow = true;
      center.add(hedge);
    }
  }

  const chickee = buildYouthCenterChickee();
  chickee.position.set(-59.8, 0.04, -158.3);
  center.add(chickee);
  center.userData.landmark = 'charles-e-weatherald-youth-center';
  return center;
}

function buildFirstBankAccents() {
  const bank = new THREE.Group();
  const cream = new THREE.MeshLambertMaterial({ color: '#e8dec4' });
  const white = new THREE.MeshLambertMaterial({ color: '#f2efe7' });
  const green = new THREE.MeshLambertMaterial({ color: '#326448' });
  const dark = new THREE.MeshBasicMaterial({ color: '#263638', toneMapped: false, side: THREE.DoubleSide });
  const black = new THREE.MeshLambertMaterial({ color: '#242826' });
  const concrete = new THREE.MeshLambertMaterial({ color: '#c9c7bf' });
  const yellow = new THREE.MeshLambertMaterial({ color: '#e2aa29' });
  const brick = new THREE.MeshLambertMaterial({ color: '#8e4b3d' });
  const planting = new THREE.MeshLambertMaterial({ color: '#315e3a' });

  const addBox = (width, height, depth, material, x, y, z, parent = bank) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const archedPane = (width, height) => {
    const shape = new THREE.Shape();
    const hw = width / 2, hh = height / 2, shoulder = hh - Math.min(width * 0.42, height * 0.34);
    shape.moveTo(-hw, -hh);
    shape.lineTo(hw, -hh);
    shape.lineTo(hw, shoulder);
    shape.quadraticCurveTo(hw, hh, 0, hh);
    shape.quadraticCurveTo(-hw, hh, -hw, shoulder);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  };

  const frontWindow = (x, y, width = 1.25, height = 1.85, arched = false, frontZ = -10.93) => {
    addBox(width + 0.34, height + 0.34, 0.14, white, x, y, frontZ);
    const pane = new THREE.Mesh(arched ? archedPane(width, height) : new THREE.PlaneGeometry(width, height), dark);
    pane.position.set(x, y, frontZ - 0.085);
    pane.rotation.y = Math.PI;
    bank.add(pane);
    if (width > 1.5) addBox(0.07, height * 0.88, 0.08, white, x, y, -11.07);
  };

  const westWindow = (z, y, width = 1.25, height = 1.85) => {
    addBox(0.14, height + 0.34, width + 0.34, white, 142.83, y, z);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), dark);
    pane.position.set(142.74, y, z);
    pane.rotation.y = -Math.PI / 2;
    bank.add(pane);
  };

  // The mapped footprint is almost square, but the street elevation reads as
  // a long two-story civic facade. A low green roof band ties its tower bays
  // and smaller pediments into a single composition.
  addBox(32.1, 6.45, 30.85, cream, 158.94, 3.225, 4.61);
  addBox(32.45, 0.72, 31.2, white, 158.94, 0.36, 4.61);
  addBox(32.5, 0.34, 31.25, white, 158.94, 6.28, 4.61);
  const mainRoof = hipRoofMesh(33.5, 32.2, 1.65, green);
  mainRoof.position.set(158.94, 6.48, 4.61);
  bank.add(mainRoof);
  addBox(14.8, 0.9, 0.36, green, 159.0, 6.55, -10.86);
  addBox(0.36, 0.9, 22.0, green, 142.86, 6.55, 7.2);

  const towerPositions = [
    { x: 147.65, z: -5.55, bay: 'arched' },
    { x: 170.15, z: -5.55, bay: 'plain' },
  ];
  for (const tower of towerPositions) {
    addBox(8.15, 7.0, 10.65, cream, tower.x, 3.5, tower.z);
    addBox(8.55, 0.35, 11.0, white, tower.x, 6.6, tower.z);
    addBox(7.35, 2.45, 8.2, cream, tower.x, 7.85, tower.z + 0.9);
    addBox(7.78, 0.34, 8.62, white, tower.x, 6.75, tower.z + 0.9);
    addBox(7.9, 0.34, 8.72, white, tower.x, 9.02, tower.z + 0.9);
    const towerRoof = hipRoofMesh(8.45, 9.2, 0.95, green);
    towerRoof.position.set(tower.x, 9.2, tower.z + 0.9);
    bank.add(towerRoof);

    for (const dx of [-1.45, 1.45]) {
      frontWindow(tower.x + dx, 7.88, 1.15, 1.72, false, tower.z - 4.2);
    }
  }

  // Southwest tower: the paired rows of dark arched glazing are its strongest
  // recognizable feature from the westbound highway approach.
  for (const dx of [-2.15, 0, 2.15]) {
    frontWindow(147.65 + dx, 1.75, 1.48, 2.0, false);
    frontWindow(147.65 + dx, 4.35, 1.48, 2.15, true);
  }

  // Center facade rhythm: repeated narrow bays, shallow projections, and
  // cream pediments edged in green standing seam metal.
  for (const x of [153.6, 157.5, 161.4, 165.3]) {
    frontWindow(x, 1.72, 1.12, 1.72, false);
    frontWindow(x, 4.12, 1.12, 1.62, x === 165.3);
    addBox(0.32, 5.6, 0.34, white, x - 1.55, 3.15, -10.98);

    const pedimentShape = new THREE.Shape();
    pedimentShape.moveTo(-1.72, 0);
    pedimentShape.lineTo(1.72, 0);
    pedimentShape.lineTo(0, 1.18);
    pedimentShape.closePath();
    const pediment = new THREE.Mesh(new THREE.ShapeGeometry(pedimentShape), cream);
    pediment.position.set(x, 6.14, -11.1);
    pediment.rotation.y = Math.PI;
    bank.add(pediment);
    const slope = Math.atan2(1.18, 1.72);
    for (const side of [-1, 1]) {
      const edge = addBox(2.12, 0.13, 0.18, green, x + side * 0.82, 6.78, -11.2);
      edge.rotation.z = -side * slope;
    }
  }

  // Southeast tower doors and upper windows, framed more plainly than the
  // curved west bay in the reference photographs.
  for (const x of [168.35, 171.95]) frontWindow(x, 1.7, 1.3, 2.0, false);
  for (const x of [168.35, 171.95]) frontWindow(x, 4.3, 1.25, 1.9, false);

  // Recessed central entrance with a shallow white surround.
  addBox(3.1, 2.85, 0.32, white, 164.9, 1.48, -11.12);
  const entry = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 2.45), dark);
  entry.position.set(164.9, 1.42, -11.31);
  entry.rotation.y = Math.PI;
  bank.add(entry);
  addBox(4.4, 0.28, 1.15, white, 164.9, 3.15, -11.5);

  // West elevation faces Deane Duff and carries the drive-through service bays.
  for (const z of [-4.0, 0.5, 15.6]) {
    westWindow(z, 1.75, 1.35, 2.0);
    westWindow(z, 4.25, 1.35, 1.85);
  }
  addBox(0.2, 1.65, 1.45, white, 142.7, 1.45, 7.3);
  const teller = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 1.3), dark);
  teller.position.set(142.58, 1.48, 7.3);
  teller.rotation.y = -Math.PI / 2;
  bank.add(teller);
  const tellerAwning = addBox(1.25, 0.22, 2.15, green, 142.18, 2.42, 7.3);
  tellerAwning.rotation.z = 0.08;

  // Black gooseneck fixtures punctuate the pediments and east tower.
  for (const x of [153.6, 161.4, 168.3]) {
    const arm = cylinderBetween(
      new THREE.Vector3(x, 5.65, -11.13),
      new THREE.Vector3(x, 5.85, -11.72),
      0.045,
      black,
      7
    );
    bank.add(arm);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.25, 9), black);
    shade.position.set(x, 5.55, -11.78);
    shade.rotation.z = Math.PI;
    bank.add(shade);
  }

  // Deane Duff-side drive-up: a shallow shelter protects the ATM embedded in
  // the wall while cars follow a loop around a landscaped center island.
  const driveShape = new THREE.Shape();
  driveShape.moveTo(142.8, -3.0);
  driveShape.lineTo(132.0, -3.0);
  driveShape.quadraticCurveTo(125.0, -2.0, 124.5, 4.0);
  driveShape.lineTo(124.5, 12.0);
  driveShape.quadraticCurveTo(125.5, 18.0, 133.0, 19.0);
  driveShape.lineTo(142.8, 19.0);
  driveShape.closePath();
  const island = new THREE.Shape();
  island.moveTo(138.1, 1.0);
  island.lineTo(133.0, 1.0);
  island.quadraticCurveTo(128.2, 2.5, 128.2, 7.0);
  island.lineTo(128.2, 10.5);
  island.quadraticCurveTo(129.0, 15.4, 134.2, 15.7);
  island.lineTo(138.1, 15.7);
  island.closePath();
  driveShape.holes.push(island);
  const driveSurface = new THREE.Mesh(
    new THREE.ShapeGeometry(driveShape),
    new THREE.MeshLambertMaterial({ color: '#c9c7bf', side: THREE.DoubleSide })
  );
  driveSurface.rotation.x = Math.PI / 2;
  driveSurface.position.y = 0.075;
  driveSurface.receiveShadow = true;
  bank.add(driveSurface);

  // The island remains grassed, with a low yellow inner curb that visually
  // guides the one-way semicircular approach without fencing the car in.
  const islandGround = new THREE.Mesh(
    new THREE.ShapeGeometry(island),
    new THREE.MeshLambertMaterial({ color: '#6f9d59', side: THREE.DoubleSide })
  );
  islandGround.rotation.x = Math.PI / 2;
  islandGround.position.y = 0.085;
  bank.add(islandGround);
  const curbPath = [
    [138.1, 1.0], [133.0, 1.0], [130.2, 2.2], [128.4, 4.6],
    [128.2, 10.5], [129.6, 14.0], [134.2, 15.7], [138.1, 15.7],
  ];
  for (let i = 0; i < curbPath.length - 1; i++) {
    const [ax, az] = curbPath[i], [bx, bz] = curbPath[i + 1];
    bank.add(cylinderBetween(
      new THREE.Vector3(ax, 0.2, az),
      new THREE.Vector3(bx, 0.2, bz),
      0.11,
      yellow,
      7
    ));
  }

  const canopySlab = addBox(6.7, 0.3, 9.8, white, 139.45, 3.28, 7.6);
  canopySlab.castShadow = true;
  const canopyRoof = hipRoofMesh(7.2, 10.4, 1.08, green);
  canopyRoof.position.set(139.45, 3.45, 7.6);
  bank.add(canopyRoof);
  for (const [x, z] of [[136.4, 3.35], [136.4, 11.85]]) {
    addBox(0.35, 3.25, 0.35, white, x, 1.63, z);
  }

  // Brick planter at the base of the separately configured First Bank pylon.
  addBox(6.4, 0.62, 2.7, brick, 135, 0.31, -16.5);
  addBox(5.65, 0.18, 1.95, planting, 135, 0.67, -16.5);

  bank.userData.landmark = 'first-bank-clewiston';
  return bank;
}

function buildPopeyesAccents() {
  const restaurant = new THREE.Group();
  const pale = new THREE.MeshLambertMaterial({ color: '#e9e5dc' });
  const glass = new THREE.MeshBasicMaterial({ color: '#26383b', toneMapped: false });
  const frame = new THREE.MeshLambertMaterial({ color: '#494945' });
  const turquoise = new THREE.MeshBasicMaterial({ color: '#63bcc0', toneMapped: false });
  const orange = new THREE.MeshLambertMaterial({ color: '#e76f2e' });
  const asphalt = new THREE.MeshLambertMaterial({ color: '#666b6c' });
  const stripeMat = new THREE.MeshBasicMaterial({ color: '#e9e6d9', toneMapped: false });
  const accessibleBlue = new THREE.MeshBasicMaterial({ color: '#4885b7', toneMapped: false });
  const mulch = new THREE.MeshLambertMaterial({ color: '#824939' });
  const hedgeMat = new THREE.MeshLambertMaterial({ color: '#365b38' });

  const addBox = (width, height, depth, material, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    restaurant.add(mesh);
    return mesh;
  };

  // The photo's most recognizable proportion is a high blank parapet over a
  // low, nearly continuous band of dark storefront glass.
  const frontZ = -7.91;
  addBox(11.72, 2.35, 0.2, glass, 570.56, 1.38, frontZ - 0.03);
  addBox(0.2, 2.35, 24.9, glass, 576.64, 1.38, 5.2);
  addBox(12.2, 0.2, 0.24, pale, 570.56, 0.16, frontZ - 0.05);

  for (const x of [565.15, 567.05, 568.95, 570.85, 572.75, 574.65, 576.05]) {
    addBox(0.085, 2.4, 0.28, frame, x, 1.4, frontZ - 0.12);
  }
  for (const z of [-5.9, -3.05, -0.2, 2.65, 5.5, 8.35, 11.2, 14.05, 16.9]) {
    addBox(0.28, 2.4, 0.085, frame, 576.75, 1.4, z);
  }

  // Orange-framed entrance, slightly east of center, and the small street
  // number immediately above it.
  addBox(1.42, 2.55, 0.3, orange, 571.8, 1.35, frontZ - 0.18);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 2.15), glass);
  door.rotation.y = Math.PI;
  door.position.set(571.8, 1.36, frontZ - 0.35);
  restaurant.add(door);
  const address = landmarkTextPlane('504', 1.05, 0.28, '#343b39', '800 62px Arial, sans-serif');
  address.rotation.y = Math.PI;
  address.position.set(571.8, 2.93, frontZ - 0.2);
  restaurant.add(address);

  // Shallow turquoise awnings wrap from the highway facade around the east
  // side. Slender rods connect their leading edges to the upper wall.
  addBox(12.75, 0.18, 1.15, turquoise, 570.56, 2.78, -8.34);
  addBox(1.15, 0.18, 25.7, turquoise, 577.05, 2.78, 5.15);
  for (const x of [565.1, 567.25, 569.4, 571.55, 573.7, 575.85]) {
    restaurant.add(cylinderBetween(
      new THREE.Vector3(x, 3.72, -7.82),
      new THREE.Vector3(x, 2.88, -8.84),
      0.025,
      turquoise,
      6
    ));
  }
  for (const z of [-5.5, -2.25, 1.0, 4.25, 7.5, 10.75, 14.0, 17.0]) {
    restaurant.add(cylinderBetween(
      new THREE.Vector3(576.55, 3.72, z),
      new THREE.Vector3(577.55, 2.88, z),
      0.025,
      turquoise,
      6
    ));
  }

  // Raised cap and fine horizontal bands keep the tall box from reading as a
  // featureless extrusion when seen obliquely from Sugarland Highway.
  addBox(12.55, 0.18, 26.25, pale, 570.4, 6.02, 5.24);
  addBox(12.18, 0.09, 0.16, turquoise, 570.56, 3.48, -7.95);
  addBox(0.16, 0.09, 25.65, turquoise, 576.7, 3.48, 5.2);

  const frontName = landmarkTextPlane('POPEYES', 7.6, 1.12, '#e76f2e', '900 144px Arial Black, Arial, sans-serif');
  frontName.rotation.y = Math.PI;
  frontName.position.set(570.56, 4.83, -8.04);
  restaurant.add(frontName);
  const frontSubtitle = landmarkTextPlane('LOUISIANA KITCHEN', 4.75, 0.4, '#c95628', '800 76px Arial, sans-serif');
  frontSubtitle.rotation.y = Math.PI;
  frontSubtitle.position.set(570.56, 4.17, -8.05);
  restaurant.add(frontSubtitle);

  const sideName = landmarkTextPlane('POPEYES', 6.5, 0.96, '#e76f2e', '900 140px Arial Black, Arial, sans-serif');
  sideName.rotation.y = Math.PI / 2;
  sideName.position.set(576.75, 4.78, -0.25);
  restaurant.add(sideName);
  const sideSubtitle = landmarkTextPlane('LOUISIANA KITCHEN', 4.05, 0.36, '#c95628', '800 74px Arial, sans-serif');
  sideSubtitle.rotation.y = Math.PI / 2;
  sideSubtitle.position.set(576.76, 4.18, -0.25);
  restaurant.add(sideSubtitle);

  // Narrow parking strip along the side, including the blue accessible bay
  // nearest the entrance and the yellow curb visible in the reference view.
  const parking = addBox(11.4, 0.055, 26.6, asphalt, 583.0, 0.045, 5.15);
  parking.castShadow = false;
  for (const z of [-5.3, -1.0, 3.3, 7.6, 11.9, 16.2]) {
    const stripe = addBox(9.8, 0.018, 0.1, stripeMat, 583.5, 0.085, z);
    stripe.castShadow = false;
  }
  const blueLine = addBox(9.8, 0.02, 0.18, accessibleBlue, 583.5, 0.09, -3.15);
  blueLine.castShadow = false;
  addBox(0.18, 0.16, 26.0, new THREE.MeshLambertMaterial({ color: '#e3b62f' }), 577.55, 0.15, 5.15);

  // Low hedge and mulch beneath the front glazing, split around the doorway.
  for (const [x, width] of [[567.2, 4.65], [574.55, 3.25]]) {
    addBox(width, 0.04, 1.15, mulch, x, 0.04, -9.25);
    for (let hx = x - width / 2 + 0.6; hx < x + width / 2; hx += 1.15) {
      const hedge = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 5), hedgeMat);
      hedge.scale.set(1.2, 0.72, 0.72);
      hedge.position.set(hx, 0.43, -9.2);
      hedge.castShadow = true;
      restaurant.add(hedge);
    }
  }

  restaurant.userData.landmark = 'popeyes-clewiston';
  return restaurant;
}

function buildMcDonaldsAccents() {
  const restaurant = new THREE.Group();
  const charcoal = new THREE.MeshLambertMaterial({ color: '#30353a' });
  const darker = new THREE.MeshLambertMaterial({ color: '#20262a' });
  const wood = new THREE.MeshLambertMaterial({ color: '#a96737' });
  const red = new THREE.MeshBasicMaterial({ color: '#d82d2f', toneMapped: false });
  const gold = new THREE.MeshBasicMaterial({ color: '#f3c52f', toneMapped: false });
  const white = new THREE.MeshBasicMaterial({ color: '#f0f1ed', toneMapped: false });
  const glass = new THREE.MeshBasicMaterial({ color: '#263a42', toneMapped: false });
  const frame = new THREE.MeshLambertMaterial({ color: '#d8d9d5' });
  const asphalt = new THREE.MeshLambertMaterial({ color: '#626668' });
  const mulch = new THREE.MeshLambertMaterial({ color: '#85463a' });
  const hedgeMat = new THREE.MeshLambertMaterial({ color: '#355f3b' });

  const addBox = (width, height, depth, material, x, y, z, parent = restaurant) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Sugarland Highway facade: tall charcoal parapet, wood-look bays, a red
  // entrance blade, and a low white canopy over the storefront glass.
  const frontZ = -87.43;
  addBox(34.55, 5.95, 0.22, charcoal, -1140.7, 3.0, frontZ);
  addBox(21.7, 2.45, 0.25, glass, -1146.9, 1.42, frontZ + 0.15);
  for (const x of [-1157.0, -1154.65, -1152.3, -1149.95, -1147.6, -1145.25, -1142.9, -1140.55, -1138.2]) {
    addBox(0.1, 2.5, 0.3, frame, x, 1.42, frontZ + 0.28);
  }
  addBox(34.8, 0.18, 0.95, white, -1140.7, 2.78, frontZ + 0.45);
  addBox(4.1, 5.75, 0.3, wood, -1155.9, 3.0, frontZ + 0.18);
  addBox(4.05, 5.75, 0.3, wood, -1127.0, 3.0, frontZ + 0.18);
  addBox(1.35, 6.65, 0.36, red, -1137.25, 3.32, frontZ + 0.25);

  const frontDoorFrame = addBox(1.65, 2.65, 0.34, frame, -1137.25, 1.36, frontZ + 0.38);
  frontDoorFrame.castShadow = false;
  const frontDoor = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 2.28), glass);
  frontDoor.position.set(-1137.25, 1.37, frontZ + 0.57);
  restaurant.add(frontDoor);
  const smallM = landmarkTextPlane('M', 0.72, 0.72, '#f3c52f', '900 125px Arial Black, Arial, sans-serif');
  smallM.position.set(-1137.25, 5.62, frontZ + 0.48);
  restaurant.add(smallM);

  const frontName = landmarkTextPlane("McDonald's", 9.6, 1.0, '#f0f1ed', '800 148px Arial, sans-serif');
  frontName.position.set(-1148.3, 4.85, frontZ + 0.33);
  restaurant.add(frontName);
  const scriptMark = landmarkTextPlane("McCafé", 3.2, 0.5, '#f0f1ed', 'italic 700 74px Georgia, serif');
  scriptMark.position.set(-1131.3, 1.42, frontZ + 0.36);
  restaurant.add(scriptMark);

  // North/rear elevation from the drive-through photo. The glass turns the
  // corner beneath another white canopy, with a wood bay at the east end.
  const rearZ = -101.58;
  addBox(34.55, 5.95, 0.22, charcoal, -1140.7, 3.0, rearZ);
  addBox(27.5, 2.45, 0.25, glass, -1143.8, 1.42, rearZ - 0.15);
  for (const x of [-1157.0, -1154.3, -1151.6, -1148.9, -1146.2, -1143.5, -1140.8, -1138.1, -1135.4, -1132.7]) {
    addBox(0.1, 2.5, 0.3, frame, x, 1.42, rearZ - 0.28);
  }
  addBox(34.8, 0.18, 0.95, white, -1140.7, 2.78, rearZ - 0.45);
  addBox(4.4, 5.75, 0.3, wood, -1125.65, 3.0, rearZ - 0.18);
  const rearName = landmarkTextPlane("McDonald's", 9.4, 0.98, '#f0f1ed', '800 146px Arial, sans-serif');
  rearName.rotation.y = Math.PI;
  rearName.position.set(-1133.0, 4.82, rearZ - 0.34);
  restaurant.add(rearName);

  // Wood end walls and a thin parapet cap complete the modern box from the
  // oblique angles shown in both supplied photographs.
  addBox(0.26, 5.95, 13.55, wood, -1158.17, 3.0, -94.65);
  addBox(0.26, 5.95, 13.55, charcoal, -1123.18, 3.0, -94.65);
  addBox(35.15, 0.18, 14.25, darker, -1140.7, 6.1, -94.65);

  // Rear drive-through lane and its large pavement lettering/arrows.
  const driveLane = addBox(43.5, 0.06, 12.2, asphalt, -1140.7, 0.045, -108.7);
  driveLane.castShadow = false;
  addBox(35.0, 0.16, 0.2, gold, -1140.7, 0.15, -102.35);
  for (const x of [-1155.0, -1138.0]) {
    const driveText = landmarkTextPlane('DRIVE THRU', 7.4, 1.05, '#efbd30', '900 104px Arial, sans-serif');
    driveText.rotation.x = -Math.PI / 2;
    driveText.rotation.z = x < -1145 ? Math.PI / 2 : -Math.PI / 2;
    driveText.position.set(x, 0.105, -108.6);
    restaurant.add(driveText);
  }
  for (const [x, direction] of [[-1148.5, 1], [-1129.5, -1]]) {
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(-2.0 * direction, -0.34);
    arrowShape.lineTo(0.55 * direction, -0.34);
    arrowShape.lineTo(0.55 * direction, -0.92);
    arrowShape.lineTo(2.1 * direction, 0);
    arrowShape.lineTo(0.55 * direction, 0.92);
    arrowShape.lineTo(0.55 * direction, 0.34);
    arrowShape.lineTo(-2.0 * direction, 0.34);
    arrowShape.closePath();
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), gold);
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(x, 0.11, -112.1);
    restaurant.add(arrow);
  }

  // Compact order/menu station on the outer side of the rear lane.
  for (const x of [-1152.2, -1149.7]) addBox(0.12, 2.0, 0.12, darker, x, 1.05, -114.1);
  addBox(3.15, 1.55, 0.28, darker, -1150.95, 2.05, -114.1);
  const menu = landmarkTextPlane('ORDER HERE', 2.75, 0.72, '#efbd30', '800 80px Arial, sans-serif');
  menu.rotation.y = Math.PI;
  menu.position.set(-1150.95, 2.1, -114.26);
  restaurant.add(menu);

  // Front parking apron and the low clipped hedge seen from Sugarland Highway.
  const frontLot = addBox(48.5, 0.055, 26.5, asphalt, -1140.7, 0.04, -72.9);
  frontLot.castShadow = false;
  for (const x of [-1155, -1149, -1143, -1137, -1131, -1125]) {
    const line = addBox(0.1, 0.02, 9.0, white, x, 0.085, -80.6);
    line.castShadow = false;
  }
  addBox(45.0, 0.04, 1.25, mulch, -1140.7, 0.04, -58.8);
  for (let x = -1162; x < -1119; x += 2.15) {
    const hedge = new THREE.Mesh(new THREE.SphereGeometry(0.78, 8, 5), hedgeMat);
    hedge.scale.set(1.5, 0.58, 0.7);
    hedge.position.set(x, 0.5, -58.8);
    hedge.castShadow = true;
    restaurant.add(hedge);
  }

  // Roadside sign: a full sculptural pair of golden arches, not a text panel.
  const sign = new THREE.Group();
  sign.position.set(-1164, 0.1, -54);
  sign.rotation.y = Math.PI / 2;
  addBox(0.72, 8.5, 0.62, darker, 0, 4.25, 0, sign);
  addBox(4.8, 1.5, 0.68, darker, 0, 5.15, 0, sign);
  const messageFront = landmarkTextPlane('WELCOME CLEWISTON', 4.35, 0.66, '#f3c52f', '800 58px Arial, sans-serif');
  messageFront.position.set(0, 5.15, 0.36);
  sign.add(messageFront);
  const messageBack = landmarkTextPlane('WELCOME CLEWISTON', 4.35, 0.66, '#f3c52f', '800 58px Arial, sans-serif');
  messageBack.rotation.y = Math.PI;
  messageBack.position.set(0, 5.15, -0.36);
  sign.add(messageBack);
  addBox(5.15, 0.78, 0.76, red, 0, 8.55, 0, sign);
  for (const [startX, endX, c1x, c2x] of [
    [-2.2, 0, -2.08, -0.35],
    [0, 2.2, 0.35, 2.08],
  ]) {
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(startX, 8.75, 0),
      new THREE.Vector3(c1x, 13.15, 0),
      new THREE.Vector3(c2x, 13.15, 0),
      new THREE.Vector3(endX, 8.75, 0)
    );
    const arch = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.27, 8, false), gold);
    arch.castShadow = true;
    sign.add(arch);
  }
  restaurant.add(sign);

  restaurant.userData.landmark = 'mcdonalds-clewiston';
  return restaurant;
}

function buildWalmartAccents() {
  const store = new THREE.Group();
  const gray = new THREE.MeshLambertMaterial({ color: '#c9c8c1' });
  const midGray = new THREE.MeshLambertMaterial({ color: '#85827c' });
  const darkGray = new THREE.MeshBasicMaterial({ color: '#68645f', toneMapped: false });
  const blue = new THREE.MeshBasicMaterial({ color: '#2977c7', toneMapped: false });
  const orange = new THREE.MeshBasicMaterial({ color: '#e77c43', toneMapped: false });
  const yellow = new THREE.MeshBasicMaterial({ color: '#f4b934', toneMapped: false });
  const white = new THREE.MeshBasicMaterial({ color: '#f1f1ed', toneMapped: false });
  const glass = new THREE.MeshBasicMaterial({ color: '#263a43', toneMapped: false });
  const asphalt = new THREE.MeshLambertMaterial({ color: '#696b6c' });
  const planting = new THREE.MeshLambertMaterial({ color: '#416d42' });
  const mulch = new THREE.MeshLambertMaterial({ color: '#75483c' });
  const poleMat = new THREE.MeshLambertMaterial({ color: '#3f4445' });

  const addBox = (width, height, depth, material, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    store.add(mesh);
    return mesh;
  };

  // The actual facade is a sequence of projecting zones rather than a single
  // flat warehouse wall. These dimensions follow the mapped front edges.
  const frontZ = -210.74;
  addBox(121.0, 7.95, 0.28, gray, -1513.85, 4.05, frontZ);
  addBox(121.0, 0.34, 0.42, midGray, -1513.85, 4.1, frontZ + 0.2);

  // West Pickup block sits on the slightly recessed portion of the footprint.
  addBox(20.0, 6.85, 0.35, orange, -1590.6, 3.48, -221.98);
  const pickup = landmarkTextPlane('PICKUP', 8.7, 0.88, '#f1f1ed', '800 120px Arial, sans-serif');
  pickup.position.set(-1590.6, 4.75, -221.78);
  store.add(pickup);
  for (let i = 0; i < 6; i++) {
    const ray = addBox(0.17, 0.72, 0.12, yellow, -1596.0, 4.75, -221.72);
    ray.rotation.z = i * Math.PI / 3;
  }

  const subway = landmarkTextPlane('SUBWAY', 5.4, 0.56, '#4d8b3b', '900 92px Arial, sans-serif');
  subway.position.set(-1571.7, 4.35, frontZ + 0.23);
  store.add(subway);

  // Grocery and Pharmacy portals project forward and rise almost to the roof.
  addBox(35.5, 7.35, 1.45, darkGray, -1553.0, 3.72, -210.0);
  addBox(29.5, 7.35, 1.45, darkGray, -1468.2, 3.72, -210.0);
  const grocery = landmarkTextPlane('Grocery', 11.5, 1.0, '#f1f1ed', '700 122px Arial, sans-serif');
  grocery.position.set(-1553.0, 5.55, -209.22);
  store.add(grocery);
  const pharmacy = landmarkTextPlane('Pharmacy', 11.2, 0.92, '#f1f1ed', '700 112px Arial, sans-serif');
  pharmacy.position.set(-1468.2, 5.55, -209.22);
  store.add(pharmacy);
  const address = landmarkTextPlane('1005', 3.2, 0.42, '#f1f1ed', '700 70px Arial, sans-serif');
  address.position.set(-1540.8, 7.08, -209.2);
  store.add(address);

  // Central blue field and the familiar white wordmark/yellow spark.
  addBox(38.0, 5.6, 0.48, blue, -1511.7, 5.22, frontZ + 0.31);
  const walmart = landmarkTextPlane('Walmart', 24.0, 2.1, '#f1f1ed', '700 162px Arial, sans-serif');
  walmart.position.set(-1516.2, 5.45, frontZ + 0.58);
  store.add(walmart);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    const ray = addBox(0.28, 1.3, 0.18, yellow, -1497.3 + Math.cos(a) * 1.45, 5.45 + Math.sin(a) * 1.45, frontZ + 0.62);
    ray.rotation.z = a - Math.PI / 2;
  }

  const addEntrance = (x, width) => {
    addBox(width, 2.75, 0.3, glass, x, 1.48, -209.15);
    for (let gx = x - width / 2 + 1.1; gx < x + width / 2; gx += 2.2) {
      addBox(0.1, 2.78, 0.34, white, gx, 1.48, -208.97);
    }
    addBox(width + 0.6, 0.18, 1.3, midGray, x, 2.95, -209.05);
  };
  addEntrance(-1553.0, 18.0);
  addEntrance(-1468.2, 17.0);

  // Small blue Pickup marker at the east end, plus gray service doors between
  // the identity panel and entrances.
  addBox(5.3, 3.4, 0.34, blue, -1456.3, 3.3, frontZ + 0.22);
  const eastPickup = landmarkTextPlane('P', 2.0, 1.8, '#f1f1ed', '900 130px Arial, sans-serif');
  eastPickup.position.set(-1456.3, 3.45, frontZ + 0.42);
  store.add(eastPickup);
  for (const x of [-1531.5, -1488.6]) {
    addBox(2.0, 2.7, 0.26, midGray, x, 1.42, frontZ + 0.24);
  }

  // White protective bollards and broad striped pedestrian approaches.
  for (const center of [-1553.0, -1468.2]) {
    for (let x = center - 10.5; x <= center + 10.5; x += 2.1) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 1.35, 8), white);
      bollard.position.set(x, 0.69, -207.65);
      bollard.castShadow = true;
      store.add(bollard);
    }
    for (let i = 0; i < 11; i++) {
      const stripe = addBox(18.0, 0.02, 0.38, white, center, 0.11, -204.7 + i * 0.82);
      stripe.castShadow = false;
    }
  }

  // The parking field is itself a major part of Walmart's footprint. Existing
  // mapped service aisles remain slightly above this continuous asphalt base.
  const lot = addBox(216, 0.04, 137, asphalt, -1524, 0.03, -131.2);
  lot.castShadow = false;
  for (const z of [-188, -175, -145, -132, -102, -89]) {
    for (let x = -1613; x <= -1435; x += 5.8) {
      const stall = addBox(0.09, 0.016, 5.2, white, x, 0.065, z);
      stall.castShadow = false;
    }
  }

  // Landscaped islands break up the lot near the main approach.
  for (const [x, z] of [[-1578, -175], [-1520, -145], [-1462, -175], [-1580, -89], [-1464, -89]]) {
    addBox(7.8, 0.07, 2.5, mulch, x, 0.08, z);
    for (const hx of [x - 2.2, x, x + 2.2]) {
      const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 5), planting);
      shrub.scale.set(1.2, 0.65, 0.8);
      shrub.position.set(hx, 0.54, z);
      shrub.castShadow = true;
      store.add(shrub);
    }
  }

  // Tall twin-headed parking-lot lights establish the big-box scale at night
  // and in distant daytime views.
  for (const [x, z] of [
    [-1590, -155], [-1545, -155], [-1498, -155], [-1452, -155],
    [-1590, -92], [-1545, -92], [-1498, -92], [-1452, -92],
  ]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 13.5, 8), poleMat);
    pole.position.set(x, 6.75, z);
    pole.castShadow = true;
    store.add(pole);
    addBox(2.5, 0.25, 0.5, white, x, 13.38, z);
  }

  // Flagpole immediately in front of the identity panel.
  const flagX = -1491.5, flagZ = -205.5;
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.09, 17.5, 8), poleMat);
  flagPole.position.set(flagX, 8.75, flagZ);
  flagPole.castShadow = true;
  store.add(flagPole);
  for (let i = 0; i < 7; i++) {
    addBox(2.4, 0.16, 0.04, i % 2 ? white : new THREE.MeshBasicMaterial({ color: '#b4383b', toneMapped: false }), flagX - 1.15, 16.55 - i * 0.16, flagZ);
  }
  addBox(1.0, 0.64, 0.05, new THREE.MeshBasicMaterial({ color: '#355a87', toneMapped: false }), flagX - 1.85, 16.08, flagZ - 0.01);

  store.userData.landmark = 'walmart-clewiston';
  return store;
}

function buildDunkinAccents() {
  const restaurant = new THREE.Group();
  const beige = new THREE.MeshLambertMaterial({ color: '#d9c9ad' });
  const pale = new THREE.MeshLambertMaterial({ color: '#eee9df' });
  const charcoal = new THREE.MeshLambertMaterial({ color: '#343a3d' });
  const roof = new THREE.MeshLambertMaterial({ color: '#4b5254' });
  const glass = new THREE.MeshBasicMaterial({ color: '#26353a', toneMapped: false });
  const orange = new THREE.MeshBasicMaterial({ color: '#f5822a', toneMapped: false });
  const pink = new THREE.MeshBasicMaterial({ color: '#d82f88', toneMapped: false });
  const white = new THREE.MeshBasicMaterial({ color: '#f3f0e9', toneMapped: false });
  const black = new THREE.MeshLambertMaterial({ color: '#262a2b' });
  const concrete = new THREE.MeshLambertMaterial({ color: '#bdbab2' });
  const hedgeMat = new THREE.MeshLambertMaterial({ color: '#3f653e' });
  const asphalt = new THREE.MeshLambertMaterial({ color: '#696c6c' });

  const addBox = (width, height, depth, material, x, y, z, parent = restaurant) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Sugarland Highway is north of this footprint. A continuous band of dark
  // storefront glass sits below the low metal mansard, framed by two raised
  // pale towers at the ends of the public facade.
  const frontZ = 8.82;
  addBox(12.9, 2.8, 0.24, beige, -1313.42, 1.48, frontZ);
  addBox(8.2, 2.45, 0.26, glass, -1312.1, 1.42, frontZ - 0.15);
  for (const x of [-1315.5, -1313.8, -1312.1, -1310.4, -1308.7]) {
    addBox(0.09, 2.48, 0.31, charcoal, x, 1.42, frontZ - 0.18);
  }

  // Left entrance/sign tower and the smaller coffee-cup tower on the opposite
  // corner rise above the otherwise low horizontal roofline.
  addBox(4.25, 6.25, 3.25, pale, -1317.62, 3.14, 10.25);
  addBox(3.05, 5.75, 2.8, pale, -1308.35, 2.89, 10.02);
  addBox(4.5, 0.18, 3.48, charcoal, -1317.62, 6.31, 10.25);
  addBox(3.28, 0.18, 3.02, charcoal, -1308.35, 5.83, 10.02);

  // Horizontal beige/white/orange/pink stripes are unusually distinctive on
  // both towers, and remain visible even when the wordmarks are edge-on.
  for (const [y, material] of [[2.2, white], [2.62, orange], [3.02, pink], [3.42, white]]) {
    addBox(4.32, 0.075, 0.1, material, -1317.62, y, 8.57);
    addBox(3.12, 0.075, 0.1, material, -1308.35, y, 8.57);
  }

  const frontName = landmarkTextPlane("DUNKIN'", 3.45, 0.92, '#f5822a', '900 152px Arial Black, Arial, sans-serif');
  frontName.rotation.y = Math.PI;
  frontName.position.set(-1317.62, 4.92, 8.47);
  restaurant.add(frontName);
  // A geometric orange-and-pink takeaway cup stays legible at game scale and
  // avoids the platform-dependent rendering of an emoji glyph.
  addBox(0.72, 0.82, 0.09, pink, -1308.35, 4.58, 8.43);
  addBox(0.88, 0.16, 0.1, orange, -1308.35, 5.03, 8.42);
  addBox(0.52, 0.08, 0.11, white, -1308.35, 4.62, 8.41);
  const cupHandle = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.075, 6, 12, Math.PI * 1.55), orange);
  cupHandle.rotation.z = -0.78;
  cupHandle.position.set(-1307.92, 4.64, 8.4);
  restaurant.add(cupHandle);

  // Recessed glass entrance below a shallow orange canopy. The light angled
  // rods are prominent in the main reference view.
  addBox(2.05, 2.5, 0.28, glass, -1317.62, 1.32, 8.48);
  addBox(0.1, 2.5, 0.32, charcoal, -1317.62, 1.32, 8.42);
  addBox(3.3, 0.16, 1.18, orange, -1317.62, 2.78, 8.08);
  for (const x of [-1318.85, -1317.62, -1316.39]) {
    restaurant.add(cylinderBetween(
      new THREE.Vector3(x, 3.63, 8.54),
      new THREE.Vector3(x, 2.86, 7.55),
      0.025,
      orange,
      6
    ));
  }

  // The long charcoal metal mansard is modeled as four shallow tilted slabs,
  // leaving a small flat mechanical well in the center.
  const northRoof = addBox(8.15, 0.16, 2.25, roof, -1312.15, 4.18, 9.72);
  northRoof.rotation.x = -0.31;
  const southRoof = addBox(12.1, 0.16, 2.25, roof, -1313.0, 4.18, 24.0);
  southRoof.rotation.x = 0.31;
  const westRoof = addBox(2.15, 0.16, 12.0, roof, -1318.92, 4.18, 18.0);
  westRoof.rotation.z = 0.31;
  const eastRoof = addBox(2.15, 0.16, 13.1, roof, -1307.55, 4.18, 17.7);
  eastRoof.rotation.z = -0.31;
  addBox(9.5, 0.16, 11.9, charcoal, -1313.0, 4.72, 18.1);
  addBox(2.2, 1.15, 1.7, charcoal, -1312.0, 5.38, 19.0);

  // Side identity panel faces the Berner Road / parking approach.
  addBox(0.24, 2.3, 8.2, charcoal, -1320.02, 1.42, 19.0);
  const sideName = landmarkTextPlane("CLEWISTON ♥ DUNKIN", 6.9, 0.62, '#d82f88', '900 88px Arial, sans-serif');
  sideName.rotation.y = -Math.PI / 2;
  sideName.position.set(-1320.17, 2.0, 19.0);
  restaurant.add(sideName);

  // The east drive-through side is predominantly charcoal standing-seam
  // metal, with a simple service door and utility equipment toward the rear.
  addBox(0.28, 2.65, 10.7, charcoal, -1306.43, 1.46, 18.9);
  for (let z = 14.0; z <= 23.8; z += 0.62) addBox(0.08, 2.68, 0.045, black, -1306.27, 1.46, z);
  addBox(0.1, 2.15, 1.1, black, -1306.25, 1.12, 20.4);
  addBox(0.42, 1.25, 0.95, concrete, -1306.0, 0.65, 17.7);
  addBox(0.48, 1.55, 1.2, concrete, -1305.95, 0.8, 19.05);
  const eastName = landmarkTextPlane("CLEWISTON ♥ DUNKIN", 6.4, 0.56, '#d82f88', '900 84px Arial, sans-serif');
  eastName.rotation.y = Math.PI / 2;
  eastName.position.set(-1306.23, 2.15, 15.9);
  restaurant.add(eastName);

  // Patio: black picnic tables beneath the orange-and-pink umbrellas visible
  // from the highway. It deliberately stays clear of the entrance walk.
  const patio = addBox(10.5, 0.055, 6.0, concrete, -1324.85, 0.04, 6.1);
  patio.castShadow = false;
  for (const [x, z, color] of [
    [-1328.0, 5.2, orange], [-1324.7, 4.9, pink], [-1321.8, 5.7, orange],
  ]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.55, 8), black);
    pole.position.set(x, 1.28, z);
    restaurant.add(pole);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(1.28, 0.5, 12), color);
    shade.position.set(x, 2.42, z);
    restaurant.add(shade);
    addBox(1.55, 0.12, 0.72, black, x, 0.76, z);
    addBox(0.95, 0.1, 0.28, black, x - 1.02, 0.51, z);
    addBox(0.95, 0.1, 0.28, black, x + 1.02, 0.51, z);
  }

  // Bright pink A-frame swing/photo spot in the lawn is nearly as memorable
  // as the restaurant itself in the supplied streetside views.
  for (const [a, b] of [
    [[-1326.8, 0.1, 0.6], [-1325.25, 3.8, 0.6]],
    [[-1323.7, 0.1, 0.6], [-1325.25, 3.8, 0.6]],
    [[-1326.8, 0.1, 2.05], [-1325.25, 3.8, 2.05]],
    [[-1323.7, 0.1, 2.05], [-1325.25, 3.8, 2.05]],
  ]) restaurant.add(cylinderBetween(new THREE.Vector3(...a), new THREE.Vector3(...b), 0.11, pink, 8));
  addBox(3.2, 0.16, 0.16, pink, -1325.25, 3.73, 1.33);
  for (const x of [-1325.85, -1324.65]) {
    restaurant.add(cylinderBetween(new THREE.Vector3(x, 3.67, 1.33), new THREE.Vector3(x, 1.25, 1.33), 0.025, black, 6));
  }
  addBox(1.85, 0.16, 0.7, orange, -1325.25, 1.2, 1.33);

  // A thin drive-through ribbon around the east and rear gives the sign and
  // service side a legible relationship without obstructing the road network.
  const driveEast = addBox(5.2, 0.035, 26.5, asphalt, -1303.6, 0.025, 16.2);
  driveEast.castShadow = false;
  const driveRear = addBox(17.0, 0.035, 5.0, asphalt, -1310.0, 0.025, 29.0);
  driveRear.castShadow = false;

  // Low shrubs and a short white privacy fence soften the service side shown
  // in the rear reference photograph.
  for (const [x, z] of [[-1319.0, 7.1], [-1309.5, 7.0], [-1305.8, 13.5], [-1305.7, 22.0]]) {
    const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 5), hedgeMat);
    shrub.scale.set(1.35, 0.72, 0.8);
    shrub.position.set(x, 0.45, z);
    shrub.castShadow = true;
    restaurant.add(shrub);
  }
  addBox(0.15, 2.15, 5.5, white, -1305.7, 1.08, 27.0);
  for (let z = 24.5; z <= 29.5; z += 1.0) addBox(0.2, 2.3, 0.2, pale, -1305.6, 1.15, z);

  restaurant.userData.landmark = 'dunkin-clewiston';
  return restaurant;
}

function buildSugarlandPlazaPylon() {
  const sign = new THREE.Group();
  const tan = new THREE.MeshLambertMaterial({ color: '#bba783' });
  const tanDark = new THREE.MeshLambertMaterial({ color: '#8e7b5f' });
  const stone = new THREE.MeshLambertMaterial({ color: '#6f6b61' });
  const greenRoof = new THREE.MeshLambertMaterial({ color: '#9cb5a4' });
  const teal = new THREE.MeshBasicMaterial({ color: '#64c9b9', toneMapped: false });

  const addBox = (width, height, depth, material, x, y, z, parent = sign) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const panel = (label, y, height, bg, fg = '#f4f2eb', width = 5.15) => {
    const back = addBox(width, height, 0.44, new THREE.MeshLambertMaterial({ color: bg }), 0, y, 0);
    back.castShadow = true;
    for (const [z, rotation] of [[0.24, 0], [-0.24, Math.PI]]) {
      const text = landmarkTextPlane(label, width - 0.25, height * 0.67, fg, '900 94px Arial Narrow, Arial, sans-serif');
      text.rotation.y = rotation;
      text.position.set(0, y, z);
      sign.add(text);
    }
  };

  // The broad south-side directory is a solid monument with heavy flanking
  // piers, a stone plinth, and the unusual stepped pavilion roof in the photo.
  addBox(7.15, 0.85, 1.7, stone, 0, 0.43, 0);
  addBox(6.45, 13.2, 1.15, tan, 0, 7.02, 0);
  addBox(0.38, 10.5, 1.3, tanDark, -2.88, 6.55, 0);
  addBox(0.38, 10.5, 1.3, tanDark, 2.88, 6.55, 0);
  for (const x of [-2.92, 2.92]) {
    for (const y of [4.0, 4.33, 4.66, 10.0, 10.33]) addBox(0.7, 0.16, 1.42, tanDark, x, y, 0);
  }

  // Curved header is simplified into a broad projecting band, preserving the
  // mint lettering and top-heavy silhouette at driving distance.
  addBox(6.7, 1.72, 1.32, tan, 0, 12.1, 0);
  for (const [z, rotation] of [[0.68, 0], [-0.68, Math.PI]]) {
    const title = landmarkTextPlane('SUGARLAND PLAZA', 6.05, 0.82, '#63c8b7', '900 112px Arial Narrow, Arial, sans-serif');
    title.rotation.y = rotation;
    title.position.set(0, 12.2, z);
    sign.add(title);
  }

  panel('SAVE A LOT  •  HARBOR FREIGHT', 10.65, 0.88, '#d85145');
  panel("HIBBETT  •  BUDDY'S", 9.72, 0.72, '#3e5266');
  panel("VERIZON  •  BEEF O'BRADY'S", 8.91, 0.62, '#eee9dd', '#4d4039');
  panel('LIQUOR  •  CHINA TASTE', 8.22, 0.58, '#eee9dd', '#7d3c36');
  panel('SUBWAY  •  ADVANCE AMERICA', 7.56, 0.58, '#e5e6d7', '#477a57');
  panel('PIZZA  •  T-MOBILE', 6.88, 0.58, '#efe7d8', '#bd4d80');
  panel('851 – 940', 6.15, 0.54, '#655c4f');
  panel('ALLSTATE  •  DENTIST', 4.76, 0.6, '#397a9d');
  panel('NOW LEASING', 4.06, 0.5, '#e7dfca', '#8a7044');

  addBox(7.25, 0.28, 2.05, greenRoof, 0, 13.08, 0);
  addBox(4.65, 0.7, 1.45, tan, 0, 13.48, 0);
  addBox(5.2, 0.25, 1.85, greenRoof, 0, 13.92, 0);
  addBox(2.4, 0.52, 1.05, tan, 0, 14.27, 0);
  addBox(2.85, 0.22, 1.35, greenRoof, 0, 14.61, 0);

  sign.position.set(-1207.5, 0.05, 1.8);
  sign.rotation.y = Math.PI / 2;
  sign.userData.landmark = 'sugarland-plaza-pylon';
  return sign;
}

function buildClewistonPlazaPylon() {
  const sign = new THREE.Group();
  const tan = new THREE.MeshLambertMaterial({ color: '#c2ad82' });
  const tanDark = new THREE.MeshLambertMaterial({ color: '#957c53' });
  const redRoof = new THREE.MeshLambertMaterial({ color: '#b94438' });
  const white = new THREE.MeshBasicMaterial({ color: '#f3f0e7', toneMapped: false });

  const addBox = (width, height, depth, material, x, y, z, parent = sign) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const panel = (label, y, height, bg, fg = '#f4f1e8', width = 4.55) => {
    addBox(width, height, 0.4, new THREE.MeshLambertMaterial({ color: bg }), 0, y, 0);
    for (const [z, rotation] of [[0.22, 0], [-0.22, Math.PI]]) {
      const text = landmarkTextPlane(label, width - 0.2, height * 0.7, fg, '900 98px Arial Narrow, Arial, sans-serif');
      text.rotation.y = rotation;
      text.position.set(0, y, z);
      sign.add(text);
    }
  };

  // Unlike the solid Sugarland Plaza monument, this directory stands on two
  // exposed beige legs with an open slot beneath the tenant stack.
  for (const x of [-2.05, 2.05]) {
    addBox(0.55, 11.6, 0.72, tan, x, 5.8, 0);
    for (const y of [5.05, 5.34, 8.52]) addBox(0.72, 0.14, 0.86, tanDark, x, y, 0);
  }
  panel('CLEWISTON PLAZA', 10.85, 0.72, '#e8dfca', '#34322e');
  panel('MARSHALLS', 10.05, 0.7, '#1d4f91');
  panel('TRACTOR SUPPLY CO.', 9.18, 0.88, '#ece8dc', '#252525');
  panel('BEALLS OUTLET', 8.34, 0.68, '#b43661');
  panel('DOLLAR GENERAL', 7.58, 0.68, '#e8cd35', '#242424');
  panel('SMOKE SHOP  •  BARBER SHOP', 6.84, 0.58, '#384b83');
  panel('GOODWILL', 5.92, 0.86, '#2362aa');

  // Deep red metal cap with broad overhang, stepped to suggest the shallow hip
  // roof visible from both highway directions.
  addBox(5.25, 0.72, 0.88, tan, 0, 11.75, 0);
  const lowerCap = addBox(6.0, 0.3, 1.5, redRoof, 0, 12.2, 0);
  lowerCap.rotation.z = 0.0;
  addBox(5.15, 0.48, 1.15, redRoof, 0, 12.5, 0);
  addBox(4.15, 0.28, 0.9, redRoof, 0, 12.86, 0);
  addBox(4.6, 0.05, 0.55, white, 0, 5.08, 0);

  sign.position.set(-1207.5, 0.05, -60.8);
  sign.rotation.y = Math.PI / 2;
  sign.userData.landmark = 'clewiston-plaza-pylon';
  return sign;
}

function buildGitNSplitAccents() {
  const store = new THREE.Group();
  const wall = new THREE.MeshLambertMaterial({ color: '#d7d0c3' });
  const roof = new THREE.MeshLambertMaterial({ color: '#5b5d5d' });
  const red = new THREE.MeshLambertMaterial({ color: '#c94c59' });
  const blue = new THREE.MeshLambertMaterial({ color: '#4f82c5' });
  const charcoal = new THREE.MeshLambertMaterial({ color: '#23282b' });
  const cream = new THREE.MeshLambertMaterial({ color: '#f3ead6' });
  const glass = new THREE.MeshBasicMaterial({ color: '#18313d', toneMapped: false });
  const concrete = new THREE.MeshLambertMaterial({ color: '#c9c6bd' });
  const curbYellow = new THREE.MeshLambertMaterial({ color: '#e8bd2d' });
  const neonBlue = new THREE.MeshStandardMaterial({
    color: '#2d6cff', emissive: '#1255ff', emissiveIntensity: 3.2, toneMapped: false,
  });

  const addBox = (width, height, depth, material, x, y, z, parent = store) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const panel = (lines, width, height, {
    bg = null, fg = '#ffffff', accent = null, border = null,
    font = '700 74px Arial, sans-serif', subFont = '700 42px Arial, sans-serif',
  } = {}) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = 20;
      ctx.strokeRect(11, 11, canvas.width - 22, canvas.height - 22);
    }
    const values = Array.isArray(lines) ? lines : [lines];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (values.length === 1) {
      ctx.fillStyle = fg;
      ctx.font = font;
      ctx.fillText(values[0], canvas.width / 2, canvas.height / 2, canvas.width - 54);
    } else {
      ctx.fillStyle = fg;
      ctx.font = font;
      ctx.fillText(values[0], canvas.width / 2, 88, canvas.width - 54);
      ctx.fillStyle = accent ?? fg;
      ctx.font = subFont;
      ctx.fillText(values[1], canvas.width / 2, 180, canvas.width - 54);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        map: texture, transparent: !bg, depthWrite: false, toneMapped: false,
        side: THREE.DoubleSide,
      })
    );
  };

  const checkerCanvas = document.createElement('canvas');
  checkerCanvas.width = 1024;
  checkerCanvas.height = 192;
  const checkerCtx = checkerCanvas.getContext('2d');
  checkerCtx.fillStyle = '#eee9dc';
  checkerCtx.fillRect(0, 0, checkerCanvas.width, checkerCanvas.height);
  const diamond = 72;
  for (let row = -1; row < 4; row++) {
    for (let col = -1; col < 17; col++) {
      if ((row + col) % 2 !== 0) continue;
      const cx = col * diamond + (row % 2) * diamond / 2;
      const cy = row * diamond + diamond / 2;
      checkerCtx.fillStyle = '#17191a';
      checkerCtx.beginPath();
      checkerCtx.moveTo(cx, cy - diamond * 0.72);
      checkerCtx.lineTo(cx + diamond * 0.72, cy);
      checkerCtx.lineTo(cx, cy + diamond * 0.72);
      checkerCtx.lineTo(cx - diamond * 0.72, cy);
      checkerCtx.closePath();
      checkerCtx.fill();
    }
  }
  const checkerTexture = new THREE.CanvasTexture(checkerCanvas);
  checkerTexture.colorSpace = THREE.SRGBColorSpace;
  const checker = new THREE.MeshBasicMaterial({ map: checkerTexture, toneMapped: false });

  // Replace the mapped solid strip with two real wings and an open lane. The
  // roof bridge keeps the passage legible as a hole through a single building.
  addBox(28.58, 4.3, 12.99, wall, 566.21, 2.15, -63.595);
  addBox(5.52, 4.3, 12.96, wall, 590.86, 2.15, -63.61);
  addBox(7.6, 1.05, 12.96, blue, 584.3, 3.775, -63.61);
  addBox(41.7, 0.28, 13.1, roof, 572.77, 4.42, -63.6);

  // The whole forecourt is concrete in the reference views. Continue the
  // pavement through the tunnel and out the rear so cars can actually use it.
  addBox(42.2, 0.1, 10.7, concrete, 572.77, 0.055, -51.6).castShadow = false;
  addBox(7.35, 0.1, 13.15, concrete, 584.3, 0.065, -63.6).castShadow = false;
  addBox(7.35, 0.1, 5.4, concrete, 584.3, 0.055, -72.75).castShadow = false;

  // Domino's and the striped snack-bar bay make Git-N-Split read as the center
  // of the familiar multi-tenant strip rather than an isolated storefront.
  addBox(11.55, 3.95, 0.14, charcoal, 557.7, 2.13, -56.99);
  addBox(11.55, 1.0, 0.17, red, 557.7, 0.58, -56.88);
  addBox(8.2, 1.65, 0.18, glass, 558.3, 1.72, -56.86);
  for (const x of [554.85, 557.1, 559.35, 561.6]) addBox(0.08, 1.65, 0.21, cream, x, 1.72, -56.74);
  addBox(5.35, 3.95, 0.15, cream, 566.15, 2.13, -56.98);
  for (let x = 563.6; x <= 568.8; x += 1.45) {
    const stripe = addBox(0.5, 4.0, 0.17, charcoal, x, 2.12, -56.87);
    stripe.rotation.z = -0.2;
  }
  const dominos = panel("Domino's", 9.7, 0.95, { fg: '#79b9ff', font: '700 94px Arial, sans-serif' });
  dominos.position.set(557.7, 3.55, -56.72);
  store.add(dominos);
  const snack = panel('TRACKSIDE SNACK BAR', 4.8, 0.42, { bg: '#f3ead6', fg: '#202323', border: '#202323', font: '700 51px Arial, sans-serif' });
  snack.position.set(566.15, 2.78, -56.7);
  store.add(snack);

  // Git-N-Split's red racing wall, checkerboard skirt, small service door, and
  // blue-framed passage reproduce the composition visible from Sugarland Hwy.
  addBox(11.7, 4.05, 0.16, red, 574.65, 2.12, -56.98);
  addBox(11.7, 1.18, 0.2, checker, 574.65, 0.66, -56.84);
  addBox(1.45, 2.35, 0.22, cream, 578.7, 1.35, -56.71);
  addBox(1.06, 1.96, 0.24, glass, 578.7, 1.33, -56.58);
  addBox(1.3, 3.95, 0.19, blue, 579.85, 2.12, -56.83);
  addBox(1.3, 3.95, 0.19, blue, 588.75, 2.12, -56.83);
  addBox(7.6, 1.05, 0.2, blue, 584.3, 3.78, -56.83);
  addBox(1.16, 1.18, 0.22, checker, 579.85, 0.66, -56.7);
  addBox(1.16, 1.18, 0.22, checker, 588.75, 0.66, -56.7);

  const driveSign = panel(['GIT-N-SPLIT', 'DRIVE-THRU  •  CLEWISTON, FL'], 8.5, 1.65, {
    bg: '#342f2c', fg: '#ffe3a4', accent: '#ffffff', border: '#f0d593',
    font: '900 78px Arial Black, sans-serif', subFont: '800 39px Arial, sans-serif',
  });
  driveSign.position.set(573.95, 2.65, -56.67);
  store.add(driveSign);
  const openStart = panel('OPEN      START', 6.5, 0.5, { fg: '#dff2dc', font: 'italic 800 58px Arial, sans-serif' });
  openStart.position.set(584.3, 3.58, -56.6);
  store.add(openStart);
  const address = panel('505', 1.2, 0.38, { fg: '#202323', font: '700 66px Arial, sans-serif' });
  address.position.set(577.15, 2.45, -56.63);
  store.add(address);

  // Roof-mounted roadside sign, supported on black posts like the photographs.
  for (const x of [572.1, 575.7]) addBox(0.12, 2.2, 0.12, charcoal, x, 5.25, -57.25);
  const roofSign = panel(['DRIVE THRU', 'Git-n-Split'], 5.75, 2.0, {
    bg: '#f7f2dc', fg: '#c74635', accent: '#2c2d2c', border: '#2c2d2c',
    font: '900 66px Arial Black, sans-serif', subFont: '800 74px Arial, sans-serif',
  });
  roofSign.position.set(573.9, 5.95, -57.14);
  roofSign.rotation.x = -0.03;
  store.add(roofSign);

  // Dark tunnel walls, low shelves, overhead lighting, curbs, and a traffic
  // signal make the opening feel operational while preserving its full width.
  addBox(0.15, 3.25, 12.7, charcoal, 580.58, 1.64, -63.6);
  addBox(0.15, 3.25, 12.7, charcoal, 588.02, 1.64, -63.6);
  const shelfMetal = new THREE.MeshLambertMaterial({ color: '#8e9593' });
  const shelfDark = new THREE.MeshLambertMaterial({ color: '#33383a' });
  const productColors = ['#e44d3d', '#f4cb3e', '#4fa7d8', '#65b65c', '#ed7c38', '#9d63be', '#f3eee0'];
  const productMats = productColors.map((color) => new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  const drinkMats = ['#d83b37', '#347ed2', '#49a85a', '#f0a52e'].map((color) => (
    new THREE.MeshBasicMaterial({ color, toneMapped: false })
  ));

  // Five shallow rack bays line each wall. Products project only slightly into
  // the passage, leaving more than six metres clear for the player's car.
  for (const sideX of [580.74, 587.86]) {
    const laneSide = sideX < 584 ? 1 : -1;
    for (let bay = 0; bay < 5; bay++) {
      const z = -59.1 - bay * 2.12;
      addBox(0.4, 1.62, 1.72, shelfDark, sideX, 0.86, z);

      // Pale shelf edges and uprights make the rack silhouette readable from
      // the highway even before the individual packages resolve.
      for (const y of [0.34, 0.78, 1.22, 1.66]) {
        addBox(0.52, 0.055, 1.76, shelfMetal, sideX + laneSide * 0.08, y, z);
      }
      for (const endZ of [z - 0.83, z + 0.83]) {
        addBox(0.055, 1.5, 0.07, shelfMetal, sideX + laneSide * 0.28, 0.94, endZ);
      }

      // Upper rows: chunky chip bags, candy cartons, and boxed snacks. Slight
      // size and tilt differences keep the assortment from looking tiled.
      for (let row = 0; row < 3; row++) {
        for (let item = 0; item < 5; item++) {
          const isBag = (bay + row + item) % 3 !== 0;
          const product = new THREE.Mesh(
            new THREE.BoxGeometry(isBag ? 0.15 : 0.18, isBag ? 0.29 : 0.25, 0.24),
            productMats[(bay * 3 + row + item) % productMats.length]
          );
          product.position.set(
            sideX + laneSide * 0.34,
            0.53 + row * 0.44,
            z - 0.62 + item * 0.31
          );
          product.rotation.x = ((item % 3) - 1) * 0.04;
          product.rotation.z = laneSide * (((bay + item) % 3) - 1) * 0.06;
          store.add(product);
        }
      }

      // Bottom ledge: short rows of bright cans and bottles with contrasting
      // caps. Four-sided cylinders retain the deliberately low-poly style.
      for (let item = 0; item < 6; item++) {
        const bottle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.075, 0.08, 0.3 + (item % 2) * 0.05, 6),
          drinkMats[(bay + item) % drinkMats.length]
        );
        bottle.position.set(sideX + laneSide * 0.35, 0.2, z - 0.64 + item * 0.255);
        store.add(bottle);
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.045, 0.045, 6),
          productMats[(item + 2) % productMats.length]
        );
        cap.position.set(bottle.position.x, bottle.position.y + 0.18, bottle.position.z);
        store.add(cap);
      }
    }
  }
  for (const z of [-59.3, -63.5, -67.7]) {
    const light = addBox(2.6, 0.08, 0.42, new THREE.MeshBasicMaterial({ color: '#f2f6ff', toneMapped: false }), 584.3, 3.18, z);
    light.castShadow = false;
  }
  addBox(0.18, 0.16, 13.3, curbYellow, 580.72, 0.15, -63.6).castShadow = false;
  addBox(0.18, 0.16, 13.3, curbYellow, 587.88, 0.15, -63.6).castShadow = false;
  const signal = new THREE.Group();
  signal.position.set(581.05, 2.45, -58.15);
  addBox(0.58, 1.55, 0.28, charcoal, 0, 0, 0, signal);
  for (const [y, color] of [[0.48, '#8f2424'], [0, '#a48222'], [-0.48, '#31d15b']]) {
    const lamp = new THREE.Mesh(
      new THREE.CircleGeometry(0.18, 16),
      new THREE.MeshBasicMaterial({ color, toneMapped: false })
    );
    lamp.position.set(0, y, 0.15);
    signal.add(lamp);
  }
  store.add(signal);

  // The blue outline is subtle by day and becomes the signature after dark.
  addBox(41.6, 0.07, 0.09, neonBlue, 572.77, 4.55, -56.82).castShadow = false;
  addBox(0.08, 3.35, 0.1, neonBlue, 580.55, 1.72, -56.55).castShadow = false;
  addBox(0.08, 3.35, 0.1, neonBlue, 588.05, 1.72, -56.55).castShadow = false;
  addBox(7.58, 0.08, 0.1, neonBlue, 584.3, 3.36, -56.55).castShadow = false;

  // A simplified neighboring tenant closes the east end seen in every view.
  addBox(5.45, 1.05, 0.18, cream, 590.85, 0.62, -56.88);
  addBox(5.45, 1.6, 0.18, glass, 590.85, 1.72, -56.86);
  const eastAwning = addBox(5.0, 0.28, 1.0, charcoal, 591.1, 3.15, -56.55);
  eastAwning.rotation.x = -0.15;

  store.userData.landmark = 'git-n-split-drive-through';
  return store;
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
    const youthCenter = buildYouthCenterAccents();
    scene.add(youthCenter);
    const dixieCrystalTheatre = buildDixieCrystalTheatreAccents();
    scene.add(dixieCrystalTheatre);
    const firstBaptist = buildFirstBaptistAccents();
    scene.add(firstBaptist);
    const evangelChurch = buildEvangelChurchAccents();
    scene.add(evangelChurch);
    const cityHall = buildCityHallAccents();
    scene.add(cityHall);
    const firstBank = buildFirstBankAccents();
    scene.add(firstBank);
    const popeyes = buildPopeyesAccents();
    scene.add(popeyes);
    const mcdonalds = buildMcDonaldsAccents();
    scene.add(mcdonalds);
    const walmart = buildWalmartAccents();
    scene.add(walmart);
    const dunkin = buildDunkinAccents();
    scene.add(dunkin);
    const sugarlandPlazaSign = buildSugarlandPlazaPylon();
    scene.add(sugarlandPlazaSign);
    const clewistonPlazaSign = buildClewistonPlazaPylon();
    scene.add(clewistonPlazaSign);
    const gitNSplit = buildGitNSplitAccents();
    scene.add(gitNSplit);
    const civicGazebo = buildCivicGazebo();
    civicGazebo.position.set(-139, 0.1, -83);
    scene.add(civicGazebo);
    const civicMemorial = buildCivicMemorial();
    civicMemorial.position.set(-68, 0.1, -78);
    scene.add(civicMemorial);
    const civicParkGrounds = buildCivicParkGrounds();
    scene.add(civicParkGrounds);

    // The bathhouse fronts W Osceola Avenue at z=-230. The pool and its shade
    // shelter belong immediately behind it, with the splash pad to the east
    // (right when viewed from the street).
    const mottPool = buildMottPoolComplex();
    mottPool.position.set(-72, 0.1, -253);
    scene.add(mottPool);

    // Cane Field is the blue-and-gold football stadium beside Clewiston Middle
    // School. The OSM pitch and cached aerial fix its exact footprint,
    // orientation, track, grandstand hierarchy, and west-side locker-room edge.
    const caneField = buildCaneField();
    scene.add(caneField);

    // The mapped campus separates the corner sanctuary from the rectory mass.
    // The distinctive square tower belongs on the sanctuary's west, street-
    // facing end near the Pasadena / Deane Duff corner.
    const stMargaretTower = buildStMargaretTower();
    stMargaretTower.rotation.y = Math.PI / 2;
    stMargaretTower.position.set(145.75, 0.1, -144.7);
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
    console.log('landmarks: Cane Field stadium placed beside Clewiston Middle School');
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
