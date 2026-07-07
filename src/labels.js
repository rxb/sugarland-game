import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const VISIBLE_DIST = 130;

export class Labels {
  constructor(scene, container, pois) {
    this.renderer = new CSS2DRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.pointerEvents = 'none';
    container.appendChild(this.renderer.domElement);

    this.objects = [];
    for (const poi of pois) {
      const div = document.createElement('div');
      div.className = 'poi-label';
      div.textContent = poi.name;
      const obj = new CSS2DObject(div);
      obj.position.set(poi.pos[0], 7.5, poi.pos[1]);
      obj.visible = false;
      scene.add(obj);
      this.objects.push(obj);
    }
    this.cooldown = 0;
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  update(dt, playerPos, camera, scene) {
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.cooldown = 0.4;
      for (const obj of this.objects) {
        const dx = obj.position.x - playerPos.x;
        const dz = obj.position.z - playerPos.z;
        obj.visible = dx * dx + dz * dz < VISIBLE_DIST * VISIBLE_DIST;
      }
    }
    this.renderer.render(scene, camera);
  }
}
