import * as THREE from 'three';

// A low-poly golf cart — Clewiston's second official vehicle.
export function buildCartMesh() {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const white = mat('#f2f0e8');
  const navy = mat('#3a4a6b');
  const dark = mat('#2a2a2a');

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.5, 2.1), white);
  body.position.y = 0.55;
  g.add(body);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.22, 0.5), white);
  nose.position.set(0, 0.72, 1.05);
  g.add(nose);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.65), navy);
  seat.position.set(0, 0.95, -0.25);
  g.add(seat);
  const backrest = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.14), navy);
  backrest.position.set(0, 1.35, -0.6);
  g.add(backrest);

  // Steering column + wheel
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), dark);
  column.position.set(-0.28, 1.05, 0.45);
  column.rotation.x = 0.5;
  g.add(column);
  const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 12), dark);
  wheelRim.position.set(-0.28, 1.3, 0.32);
  wheelRim.rotation.x = 0.5 + Math.PI / 2;
  g.add(wheelRim);

  // Canopy on four posts
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.08, 1.75), white);
  roof.position.set(0, 2.0, -0.05);
  g.add(roof);
  for (const [px, pz] of [[-0.6, 0.65], [0.6, 0.65], [-0.6, -0.75], [0.6, -0.75]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.45, 6), mat('#c8c8c8'));
    post.position.set(px, 1.28, pz);
    g.add(post);
  }

  // Wheels (kept for spin animation)
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.16, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [px, pz] of [[-0.62, 0.72], [0.62, 0.72], [-0.62, -0.72], [0.62, -0.72]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(px, 0.23, pz);
    g.add(w);
    wheels.push(w);
  }

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, wheels };
}
