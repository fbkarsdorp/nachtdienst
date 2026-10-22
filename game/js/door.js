// The door, locked: the key is in the collector's coat. The brass plate texture
// is shared with cabinet 5's lock.
import * as THREE from 'three';
import { makeCanvas, canvasTexture } from './textures.js';
import { ROOM } from './room.js';
import { spring } from './motion.js';

export const DOOR = { x: 0, z: ROOM.z1, w: 0.96, h: 2.16 };

export function plateTexture(text) {
  const c = makeCanvas(1024, 200);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 1024, 200);
  g.addColorStop(0, '#9c7b3b');
  g.addColorStop(0.5, '#c9a65e');
  g.addColorStop(1, '#8a6a30');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 200);
  ctx.strokeStyle = 'rgba(50,30,8,0.7)';
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, 1000, 176);
  ctx.fillStyle = 'rgba(35,22,6,0.9)';
  ctx.textAlign = 'center';
  ctx.font = `italic 56px "IM Fell English", Georgia, serif`;
  ctx.fillText(text, 512, 118);
  return canvasTexture(c);
}

export class Door {
  constructor(sc) {
    this.group = new THREE.Group();
    this.group.position.set(DOOR.x, 0, DOOR.z);
    const { w } = DOOR;
    // the leaf hinges on the left as seen from inside; frame, leaf and handle are modelled in Blender
    this.hinge = new THREE.Group();
    this.hinge.position.set(w / 2, 0, 0.01);
    this.group.add(this.hinge);
    const leaf = new THREE.Group();
    leaf.position.set(-w / 2, 0, 0);
    this.hinge.add(leaf);
    this.group.updateMatrixWorld(true);
    if (sc.door_leaf) leaf.attach(sc.door_leaf);
    if (sc.door_frame) this.frame = sc.door_frame;
    this.leaf = leaf;
    // the corridor beyond is part of the room model, lit by its own lamp
    this.open = 0;
    this.openTarget = 0;
    this.openVel = 0;
    // a knock shivers the leaf in its frame
    this.shiver = 0;
    this.t = 0;
  }

  knock() { this.shiver = 1; }

  update(dt) {
    // a heavy door: it gives slowly before it swings
    [this.open, this.openVel] = spring(this.open, this.openVel, this.openTarget, 1.3, dt);
    this.t += dt;
    this.shiver = Math.max(0, this.shiver - dt * 2.2);
    this.hinge.rotation.y = this.open * 1.7 + Math.sin(this.t * 55) * 0.0035 * this.shiver;
  }
}
