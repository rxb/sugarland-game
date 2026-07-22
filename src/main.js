import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { DayNight } from './daynight.js';
import { Labels } from './labels.js';
import { StreetNames } from './streetnames.js';
import { Signage } from './signage.js';
import { Landmarks } from './landmarks.js';
import { Minimap } from './minimap.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 6000);

const timeSlider = document.getElementById('time-slider');
const timeReadout = document.getElementById('time-readout');
const autoCheck = document.getElementById('time-auto');
const loading = document.getElementById('loading');
// Building names currently live on facade signage; retain the floating-label
// renderer for future POIs without displaying the older building label set.
const SHOW_FLOATING_BUILDING_LABELS = false;

async function start() {
  const data = await (await fetch('data/clewiston.json')).json();
  const loadJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const details = await loadJson('data/building-details.json');
  const roofColors = await loadJson('data/roof-colors.json');
  const morphology = await loadJson('data/building-morphology.json');
  const trees = await fetch('data/trees.json').then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const { collisionGrid } = buildWorld(scene, data, details, roofColors, trees, morphology);
  const player = new Player(scene, camera, canvas, collisionGrid, data.roads);
  // Development-only landmark QA: ?spawn=x,z,yaw starts the preview at an
  // exact world position without changing the normal production spawn.
  if (import.meta.env.DEV) {
    const previewSpawn = new URLSearchParams(window.location.search).get('spawn');
    if (previewSpawn) {
      const [x, z, yaw = player.yaw] = previewSpawn.split(',').map(Number);
      if ([x, z, yaw].every(Number.isFinite)) {
        player.pos.set(x, 0, z);
        player.yaw = yaw;
        player.heading = yaw;
        player.mesh.position.copy(player.pos);
      }
    }
  }
  const dayNight = new DayNight(scene);
  const floatingPois = SHOW_FLOATING_BUILDING_LABELS ? data.pois : [];
  const labels = new Labels(scene, document.body, floatingPois);
  const streetNames = new StreetNames(scene, data.roads);
  const places = await fetch('data/places.json').then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const minimap = new Minimap(document.getElementById('minimap'), data, places);
  const freestandingSigns = await fetch('data/freestanding-signs.json').then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const signage = new Signage(scene, data.buildings, places, details, freestandingSigns);
  const landmarks = new Landmarks(scene, data);
  loading.style.display = 'none';
  window.__game = { player, dayNight, scene, camera, renderer, labels, streetNames, signage, landmarks, minimap };

  dayNight.hours = parseFloat(timeSlider.value);
  timeSlider.addEventListener('input', () => {
    dayNight.hours = parseFloat(timeSlider.value);
    autoCheck.checked = false;
    dayNight.auto = false;
  });
  autoCheck.addEventListener('change', () => { dayNight.auto = autoCheck.checked; });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labels.resize();
    minimap.resize();
  });

  // ---- Title screen: slow aerial orbit, then a swoop down to the spawn. ----
  const intro = { phase: 'title', t: 0, orbitAngle: 0.6 };
  const ORBIT_R = 950, ORBIT_H = 620;
  const townCenter = new THREE.Vector3(player.pos.x, 0, player.pos.z + 250);
  document.body.classList.add('intro');
  camera.near = 2; // avoids road-layer z-fighting from altitude; restored on landing
  camera.updateProjectionMatrix();

  // Where the swoop must land: exactly the walking camera's resting pose.
  const landingPose = () => {
    const fwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const camDir = new THREE.Vector3(
      Math.sin(player.yaw) * Math.cos(player.pitch),
      -Math.sin(player.pitch),
      Math.cos(player.yaw) * Math.cos(player.pitch)
    );
    const target = player.pos.clone()
      .add(new THREE.Vector3(fwd.z, 0, -fwd.x).multiplyScalar(0.55))
      .setY(player.pos.y + 1.5);
    return { pos: target.clone().addScaledVector(camDir, -3.6), target };
  };

  const titleScreen = document.getElementById('title-screen');
  const swoopFrom = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  document.getElementById('start-button').addEventListener('click', () => {
    swoopFrom.pos.copy(camera.position);
    swoopFrom.target.copy(townCenter);
    intro.phase = 'swoop';
    intro.t = 0;
    titleScreen.classList.add('fade-out');
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);

    if (intro.phase === 'title') {
      intro.orbitAngle += dt * 0.012;
      camera.position.set(
        townCenter.x + Math.sin(intro.orbitAngle) * ORBIT_R,
        ORBIT_H,
        townCenter.z + Math.cos(intro.orbitAngle) * ORBIT_R
      );
      camera.lookAt(townCenter);
    } else if (intro.phase === 'swoop') {
      intro.t = Math.min(1, intro.t + dt / 3.8);
      const s = intro.t * intro.t * intro.t * (intro.t * (intro.t * 6 - 15) + 10); // smootherstep
      const end = landingPose();
      camera.position.lerpVectors(swoopFrom.pos, end.pos, s);
      // Arc: hold some altitude through the middle of the dive.
      camera.position.y += Math.sin(s * Math.PI) * 90;
      const look = swoopFrom.target.clone().lerp(end.target, s);
      camera.lookAt(look);
      if (intro.t >= 1) {
        intro.phase = 'done';
        camera.near = 0.1;
        camera.updateProjectionMatrix();
        document.body.classList.remove('intro');
        titleScreen.style.display = 'none';
      }
    } else {
      player.update(dt);
    }

    dayNight.update(dt, player.pos);
    streetNames.update(dt, player.pos);
    signage.update(dt, player.pos);
    landmarks.update(dt, clock.elapsedTime);
    minimap.update(dt, player);
    if (dayNight.auto) timeSlider.value = dayNight.hours.toFixed(2);
    timeReadout.textContent = dayNight.timeLabel();
    renderer.render(scene, camera);
    labels.update(dt, player.pos, camera, scene);
  });
}

start().catch((e) => {
  loading.textContent = 'Failed to load town data: ' + e.message;
  console.error(e);
});
