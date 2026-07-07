import * as THREE from 'three';
import { pointInPoly } from './util.js';
import { buildCartMesh } from './cart.js';

const WALK_SPEED = 2.6;
const JOG_SPEED = 6.0;
const CART_TOP_SPEED = 13;   // ~29 mph — a souped-up cart
const CART_REVERSE = 4;
const CART_ACCEL = 7;

function buildCharacter() {
  const group = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const skin = mat('#e0ac82');
  const shirt = mat('#2ea8a0');
  const pants = mat('#3a4a6b');

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.26), shirt);
  torso.position.y = 1.02;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skin);
  head.position.y = 1.48;
  group.add(head);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.185, 0.1, 12), mat('#c94f3d'));
  cap.position.y = 1.58;
  group.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.16), mat('#c94f3d'));
  brim.position.set(0, 1.55, 0.2);
  group.add(brim);

  // Limbs pivot at their top so a simple rotation swings them.
  const limb = (w, h, material, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), material);
    mesh.position.y = -h / 2;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  };
  const armL = limb(0.11, 0.48, shirt, -0.29, 1.26);
  const armR = limb(0.11, 0.48, shirt, 0.29, 1.26);
  const legL = limb(0.14, 0.76, pants, -0.12, 0.76);
  const legR = limb(0.14, 0.76, pants, 0.12, 0.76);

  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group, armL, armR, legL, legR };
}

export class Player {
  constructor(scene, camera, dom, collisionGrid, roads) {
    this.camera = camera;
    this.dom = dom;
    this.grid = collisionGrid;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.yaw = Math.PI;      // camera yaw
    this.pitch = 0.12;
    this.heading = Math.PI;  // which way the character faces
    this.keys = new Set();
    this.walkPhase = 0;
    this.moving = false;

    const parts = buildCharacter();
    this.mesh = parts.group;
    this.parts = parts;
    scene.add(this.mesh);

    this.findClearSpawn(roads);

    // The golf cart, parked just off the spawn point.
    const cartParts = buildCartMesh();
    this.cart = {
      mesh: cartParts.group,
      wheels: cartParts.wheels,
      pos: new THREE.Vector3(),
      heading: this.yaw,
      speed: 0,
    };
    this.driving = false;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    for (const offset of [5, -5, 8, -8, 11]) {
      const cx = this.pos.x + right.x * offset, cz = this.pos.z + right.z * offset;
      if (!this.blockedAt(cx, cz)) {
        this.cart.pos.set(cx, 0, cz);
        break;
      }
    }
    this.cart.mesh.position.copy(this.cart.pos);
    this.cart.mesh.rotation.y = this.cart.heading;
    scene.add(this.cart.mesh);

    dom.addEventListener('click', () => {
      if (document.pointerLockElement !== dom) dom.requestPointerLock();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.dom) return;
      this.yaw -= e.movementX * 0.0026;
      this.pitch = Math.max(-0.5, Math.min(0.9, this.pitch + e.movementY * 0.0022));
    });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.toggleCart();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  toggleCart() {
    if (this.driving) {
      // Step out beside the cart, wherever there's room.
      const h = this.cart.heading;
      const right = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h));
      for (const off of [1.6, -1.6, 2.4, -2.4]) {
        const px = this.cart.pos.x + right.x * off, pz = this.cart.pos.z + right.z * off;
        if (!this.blockedAt(px, pz)) {
          this.pos.set(px, 0, pz);
          break;
        }
      }
      this.driving = false;
      this.cart.speed = 0;
      this.heading = this.cart.heading;
      this.mesh.visible = true;
    } else {
      const d = this.pos.distanceTo(this.cart.pos);
      if (d < 3.5) {
        this.driving = true;
        this.mesh.visible = false;
        this.yaw = this.cart.heading; // camera falls in behind the cart
      }
    }
  }

  updateCart(dt) {
    const cart = this.cart;
    const throttle = (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ? 1
      : (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ? -1 : 0;
    const steer = ((this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ? 1 : 0)
      - ((this.keys.has('KeyD') || this.keys.has('ArrowRight')) ? 1 : 0);

    const targetSpeed = throttle > 0 ? CART_TOP_SPEED : throttle < 0 ? -CART_REVERSE : 0;
    const delta = targetSpeed - cart.speed;
    const step = CART_ACCEL * dt * (throttle === 0 ? 1.6 : 1); // coast down faster
    cart.speed += Math.max(-step, Math.min(step, delta));
    if (Math.abs(cart.speed) < 0.05 && throttle === 0) cart.speed = 0;

    if (steer !== 0 && Math.abs(cart.speed) > 0.2) {
      const grip = Math.min(1, Math.abs(cart.speed) / 3);
      cart.heading += steer * 1.7 * grip * dt * Math.sign(cart.speed);
    }

    if (cart.speed !== 0) {
      const fx = Math.sin(cart.heading), fz = Math.cos(cart.heading);
      const nx = cart.pos.x + fx * cart.speed * dt;
      const nz = cart.pos.z + fz * cart.speed * dt;
      // Probe the cart nose (or tail when reversing).
      const probe = 1.4 * Math.sign(cart.speed);
      if (!this.blockedAt(nx + fx * probe, nz + fz * probe) && !this.blockedAt(nx, nz)) {
        cart.pos.x = nx;
        cart.pos.z = nz;
        for (const w of cart.wheels) w.rotation.x += (cart.speed * dt) / 0.23;
      } else {
        cart.speed = 0; // gentle bump stop
      }
    }

    cart.mesh.position.copy(cart.pos);
    cart.mesh.rotation.y = cart.heading;
    this.pos.copy(cart.pos); // labels/signage/shadows follow the cart

    // Chase camera, a bit further back than on foot.
    const camDir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    const target = cart.pos.clone().setY(1.7);
    const camPos = target.clone().addScaledVector(camDir, -6.2);
    if (camPos.y < 0.5) camPos.y = 0.5;
    this.camera.position.lerp(camPos, Math.min(1, dt * 10));
    this.camera.lookAt(target);
  }

  findClearSpawn(roads) {
    // Spawn on the walkable road point nearest downtown (the data origin),
    // facing along the road so the first thing you see is a street.
    let best = null;
    for (const r of roads || []) {
      if (r.kind === 'service' || r.kind === 'track') continue;
      for (let i = 0; i < r.path.length; i++) {
        const [x, z] = r.path[i];
        const d = x * x + z * z;
        if ((!best || d < best.d) && !this.blockedAt(x, z)) {
          best = { d, x, z, road: r, i };
        }
      }
    }
    if (best) {
      this.pos.set(best.x, 0, best.z);
      const j = Math.min(best.road.path.length - 1, best.i + 1);
      if (j !== best.i) {
        const [nx, nz] = best.road.path[j];
        this.yaw = Math.atan2(nx - best.x, nz - best.z);
        this.heading = this.yaw;
      }
      return;
    }
    // Fallback: spiral out from the origin until we're not inside a building.
    for (let r = 0; r < 300; r += 6) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const x = Math.cos(a) * r, z = Math.sin(a) * r + 14;
        if (!this.blockedAt(x, z)) {
          this.pos.set(x, 0, z);
          return;
        }
      }
    }
  }

  blockedAt(x, z) {
    for (const b of this.grid.query(x, z)) {
      if (pointInPoly(x, z, b.poly)) return true;
    }
    return false;
  }

  update(dt) {
    if (this.driving) {
      this.updateCart(dt);
      return;
    }
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const move = new THREE.Vector3();
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) move.add(fwd);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) move.sub(fwd);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) move.sub(right);
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) move.add(right);

    this.moving = move.lengthSq() > 0;
    const jogging = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    if (this.moving) {
      move.normalize();
      const speed = jogging ? JOG_SPEED : WALK_SPEED;
      const nx = this.pos.x + move.x * speed * dt;
      const nz = this.pos.z + move.z * speed * dt;
      // Probe slightly ahead of the body so we stop at walls, with axis sliding.
      const px = nx + move.x * 0.35, pz = nz + move.z * 0.35;
      if (!this.blockedAt(px, pz)) {
        this.pos.x = nx; this.pos.z = nz;
      } else if (!this.blockedAt(px, this.pos.z)) {
        this.pos.x = nx;
      } else if (!this.blockedAt(this.pos.x, pz)) {
        this.pos.z = nz;
      }
      const target = Math.atan2(move.x, move.z);
      let d = target - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * Math.min(1, dt * 12);
      this.walkPhase += dt * (jogging ? 11 : 6.5);
    } else {
      this.walkPhase *= Math.max(0, 1 - dt * 8);
    }

    // Limb swing
    const swing = Math.sin(this.walkPhase) * (this.moving ? (jogging ? 0.85 : 0.55) : 0.0);
    this.parts.armL.rotation.x = swing;
    this.parts.armR.rotation.x = -swing;
    this.parts.legL.rotation.x = -swing;
    this.parts.legR.rotation.x = swing;

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;

    // Over-the-shoulder camera
    const camDir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    const shoulder = new THREE.Vector3(fwd.z, 0, -fwd.x).multiplyScalar(0.55);
    const target = this.pos.clone().add(shoulder).setY(this.pos.y + 1.5);
    const camPos = target.clone().addScaledVector(camDir, -3.6);
    if (camPos.y < 0.4) camPos.y = 0.4;
    this.camera.position.lerp(camPos, Math.min(1, dt * 14));
    this.camera.lookAt(target);
  }
}
