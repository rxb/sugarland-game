import * as THREE from 'three';
import { pointInPoly } from './util.js';
import { buildCartMesh } from './cart.js';

const WALK_SPEED = 2.6;
const JOG_SPEED = 6.0;
const WALK_TURN_SPEED = 2.2;
const CART_TOP_SPEED = 13;   // ~29 mph — a souped-up cart
const CART_TURBO_SPEED = 26;
const CART_REVERSE_SPEED = 4;
const CART_ACCEL = 7;
const CART_TURN_SPEED = 1.7;
const FOLLOW_PITCH = 0.12;
const CAMERA_CATCHUP_TIME = 0.33;
const CART_INTERACTION_DISTANCE = 3.5;
const CART_SUMMON_HOLD_TIME = 0.6;
const CART_SUMMON_SPEED = 9;

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
    this.pitch = FOLLOW_PITCH;
    this.heading = Math.PI;  // which way the character faces
    this.keys = new Set();
    this.walkPhase = 0;
    this.moving = false;
    this.summonHold = 0;
    this.summonConsumed = false;
    this.cartArrival = null;

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
      if (e.code === 'KeyE') {
        if (this.cartArrival) return;
        const cartIsNear = this.pos.distanceTo(this.cart.pos) < CART_INTERACTION_DISTANCE;
        if (this.driving || cartIsNear) this.toggleCart();
        else {
          this.summonHold = 0;
          this.summonConsumed = false;
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE') {
        this.summonHold = 0;
        this.summonConsumed = false;
      }
    });
  }

  toggleCart() {
    if (this.cartArrival) return;
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
      this.recenterCamera(this.heading);
      this.mesh.visible = true;
    } else {
      const d = this.pos.distanceTo(this.cart.pos);
      if (d < CART_INTERACTION_DISTANCE) {
        this.driving = true;
        this.mesh.visible = false;
        this.recenterCamera(this.cart.heading);
      }
    }
  }

  updateCartSummon(dt) {
    if (this.driving || this.cartArrival || !this.keys.has('KeyE') || this.summonConsumed) return;
    if (this.pos.distanceTo(this.cart.pos) < CART_INTERACTION_DISTANCE) return;

    this.summonHold += dt;
    if (this.summonHold >= CART_SUMMON_HOLD_TIME) {
      this.summonConsumed = true;
      this.summonHold = 0;
      this.summonCart();
    }
  }

  summonCart() {
    const heading = this.heading;
    const fwd = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const camFwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const camRight = new THREE.Vector3(camFwd.z, 0, -camFwd.x);
    let safeDestination = null;

    // Stop beside the walker when possible, or directly ahead as a fallback.
    for (const [side, ahead] of [[2.7, 0.5], [-2.7, 0.5], [0, 3], [2.4, 1.5], [-2.4, 1.5]]) {
      const end = this.pos.clone().addScaledVector(right, side).addScaledVector(fwd, ahead);
      if (!this.cartFitsAt(end.x, end.z, heading)) continue;
      safeDestination ||= end;

      // Start beyond the rear edge of the current camera view and curve inward.
      for (const distance of [10, 13, 16]) {
        for (const lateral of [0, 3, -3, 6, -6]) {
          const start = this.pos.clone()
            .addScaledVector(camFwd, -distance)
            .addScaledVector(camRight, lateral);
          if (!this.cartFitsAt(start.x, start.z, heading)) continue;
          const control = end.clone().addScaledVector(fwd, -4.5);
          if (!this.cartRouteIsClear(start, control, end)) continue;
          this.beginCartArrival(start, control, end, heading);
          return true;
        }
      }
    }

    // In a very constrained location, prioritize a safe arrival over the animation.
    if (safeDestination) {
      this.placeCart(safeDestination, heading);
      return true;
    }
    return false;
  }

  beginCartArrival(start, control, end, finalHeading) {
    const pathLength = start.distanceTo(control) + control.distanceTo(end);
    const initialHeading = Math.atan2(control.x - start.x, control.z - start.z);
    this.cartArrival = {
      start: start.clone(),
      control: control.clone(),
      end: end.clone(),
      finalHeading,
      elapsed: 0,
      duration: Math.max(1.4, Math.min(2.8, pathLength / CART_SUMMON_SPEED)),
      lastPosition: start.clone(),
    };
    this.placeCart(start, initialHeading);
  }

  updateCartArrival(dt) {
    const arrival = this.cartArrival;
    if (!arrival) return;

    arrival.elapsed += dt;
    const progress = Math.min(1, arrival.elapsed / arrival.duration);
    const t = progress * progress * (3 - 2 * progress); // ease in and out
    const inv = 1 - t;
    const position = new THREE.Vector3(
      inv * inv * arrival.start.x + 2 * inv * t * arrival.control.x + t * t * arrival.end.x,
      0,
      inv * inv * arrival.start.z + 2 * inv * t * arrival.control.z + t * t * arrival.end.z
    );
    const dx = 2 * inv * (arrival.control.x - arrival.start.x)
      + 2 * t * (arrival.end.x - arrival.control.x);
    const dz = 2 * inv * (arrival.control.z - arrival.start.z)
      + 2 * t * (arrival.end.z - arrival.control.z);
    const distance = position.distanceTo(arrival.lastPosition);

    this.cart.pos.copy(position);
    this.cart.heading = Math.atan2(dx, dz);
    this.cart.mesh.position.copy(position);
    this.cart.mesh.rotation.y = this.cart.heading;
    for (const wheel of this.cart.wheels) wheel.rotation.x += distance / 0.23;
    arrival.lastPosition.copy(position);

    if (progress === 1) {
      this.placeCart(arrival.end, arrival.finalHeading);
      this.cartArrival = null;
    }
  }

  placeCart(position, heading) {
    this.cart.pos.copy(position);
    this.cart.heading = heading;
    this.cart.speed = 0;
    this.cart.mesh.position.copy(position);
    this.cart.mesh.rotation.y = heading;
  }

  cartRouteIsClear(start, control, end) {
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const inv = 1 - t;
      const x = inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x;
      const z = inv * inv * start.z + 2 * inv * t * control.z + t * t * end.z;
      const dx = 2 * inv * (control.x - start.x) + 2 * t * (end.x - control.x);
      const dz = 2 * inv * (control.z - start.z) + 2 * t * (end.z - control.z);
      if (!this.cartFitsAt(x, z, Math.atan2(dx, dz))) return false;
    }
    return true;
  }

  cartFitsAt(x, z, heading) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const rx = Math.cos(heading), rz = -Math.sin(heading);
    for (const [side, end] of [[0, 0], [-0.75, -1.3], [0.75, -1.3], [-0.75, 1.3], [0.75, 1.3]]) {
      if (this.blockedAt(x + rx * side + fx * end, z + rz * side + fz * end)) return false;
    }
    return true;
  }

  updateCart(dt) {
    const cart = this.cart;
    const controls = this.getMovementControls();
    const turbo = this.isBoosting();

    const targetSpeed = controls.throttle > 0
      ? (turbo ? CART_TURBO_SPEED : CART_TOP_SPEED)
      : controls.throttle < 0 ? -CART_REVERSE_SPEED : 0;
    const delta = targetSpeed - cart.speed;
    const step = CART_ACCEL * dt * (controls.active ? 1 : 1.6); // coast down faster
    cart.speed += Math.max(-step, Math.min(step, delta));
    if (Math.abs(cart.speed) < 0.05 && !controls.active) cart.speed = 0;

    if (controls.turn !== 0 && controls.throttle !== 0) {
      cart.heading += controls.turn * CART_TURN_SPEED * dt;
    }
    if (controls.active) {
      this.recenterCamera(cart.heading);
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
    const cameraEase = 1 - Math.exp(-dt / CAMERA_CATCHUP_TIME);
    this.camera.position.lerp(camPos, cameraEase);
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

  getMovementControls() {
    const forward = this.keys.has('KeyW') || this.keys.has('ArrowUp');
    const backward = this.keys.has('KeyS') || this.keys.has('ArrowDown');
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    const turn = (left ? 1 : 0) - (right ? 1 : 0);
    // Left/right alone combine forward motion with continuous steering.
    const throttle = backward ? -1 : (forward || left || right) ? 1 : 0;
    return { throttle, turn, active: forward || backward || left || right };
  }

  isBoosting() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  recenterCamera(heading) {
    this.yaw = heading;
    this.pitch = FOLLOW_PITCH;
  }

  update(dt) {
    this.updateCartSummon(dt);
    this.updateCartArrival(dt);
    if (this.driving) {
      this.updateCart(dt);
      return;
    }
    const controls = this.getMovementControls();
    if (controls.turn !== 0 && controls.throttle !== 0) {
      this.heading += controls.turn * WALK_TURN_SPEED * dt;
    }
    if (controls.active) {
      this.recenterCamera(this.heading);
    }
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const move = fwd.clone().multiplyScalar(controls.throttle);

    this.moving = controls.throttle !== 0;
    const jogging = this.isBoosting();
    if (this.moving) {
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
    const cameraEase = 1 - Math.exp(-dt / CAMERA_CATCHUP_TIME);
    this.camera.position.lerp(camPos, cameraEase);
    this.camera.lookAt(target);
  }
}
