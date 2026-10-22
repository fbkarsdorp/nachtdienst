// Cabinet V: an iron bar across its drawers, held by a lock of four digit rings.
// The four digits are the ones the other cabinets print on their plates when they
// are put in order.
import * as THREE from 'three';
import { makeCanvas, canvasTexture } from './textures.js';
import { CAB, CABINET_Z, PUZZLE_ROW } from './room.js';
import { plateTexture } from './door.js';
import { spring } from './motion.js';

export const FIVE = 4;
// the lock hangs on the bar between the puzzle row and the row above it
export const LOCK = {
  x: CAB.front + 0.075, y: CAB.y0 + (PUZZLE_ROW + 1) * CAB.dh, z: CABINET_Z[FIVE],
};

export class FiveLock {
  constructor(M, plateText) {
    // built facing the viewer along +z, then turned to face the room from the cabinet front
    this.group = new THREE.Group();
    this.group.position.set(LOCK.x, LOCK.y, LOCK.z);
    this.group.rotation.y = -Math.PI / 2;
    const mk = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      return m;
    };
    const span = CAB.cols * CAB.dw + 0.06;
    // the bar swings down from its left bracket when the lock gives
    this.hinge = new THREE.Group();
    this.hinge.position.set(span / 2, 0, 0);
    this.group.add(this.hinge);
    const bar = new THREE.Group();
    bar.position.set(-span / 2, 0, 0);
    this.hinge.add(bar);
    bar.add(mk(span, 0.05, 0.012, 0, 0, 0, M.iron));
    // rivets along the bar
    const rivet = new THREE.SphereGeometry(0.0055, 10, 6);
    for (let i = 0; i < 9; i++) {
      const r = new THREE.Mesh(rivet, M.iron);
      r.position.set(-span / 2 + 0.03 + (i * (span - 0.06)) / 8, 0, -0.007);
      r.scale.z = 0.5;
      bar.add(r);
    }
    // brackets: a staple at each end, bolted to the carcass, that the bar drops into
    for (const s of [-1, 1]) {
      const bx = s * (span / 2 + 0.01);
      this.group.add(mk(0.02, 0.07, 0.075, bx, 0, 0.032, M.iron));
      this.group.add(mk(0.024, 0.012, 0.012, bx, 0.034, -0.002, M.iron));
      this.group.add(mk(0.024, 0.012, 0.012, bx, -0.034, -0.002, M.iron));
    }
    // the lock: four rings on a spindle, hung from the bar by a shackle
    const dial = new THREE.Group();
    dial.position.set(0, -0.085, -0.03);
    bar.add(dial);
    // a back plate behind the rings, and a lower plate for the engraving
    dial.add(mk(0.33, 0.13, 0.016, 0, 0, 0.034, M.darkBrass));
    dial.add(mk(0.38, 0.075, 0.012, 0, -0.1, 0.03, M.darkBrass));
    // the shackle, up round the bar
    for (const s2 of [-1, 1]) dial.add(mk(0.014, 0.08, 0.014, s2 * 0.13, 0.07, 0.03, M.iron));
    dial.add(mk(0.274, 0.014, 0.014, 0, 0.11, 0.03, M.iron));
    // spindle and end caps
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 10), M.brass);
    spindle.rotation.z = Math.PI / 2;
    dial.add(spindle);
    for (const s2 of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.016, 20), M.darkBrass);
      cap.rotation.z = Math.PI / 2;
      cap.position.x = s2 * 0.152;
      dial.add(cap);
    }
    const rt = digitRing();
    this.rings = [];
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.062, 26), [
        new THREE.MeshStandardMaterial({ map: rt, metalness: 0.5, roughness: 0.55, envMap: M.brass.envMap, envMapIntensity: 0.4 }),
        M.darkBrass, M.darkBrass,
      ]);
      ring.rotation.order = 'ZYX';
      ring.rotation.z = Math.PI / 2;
      // the first ring sits on the viewer's left
      ring.position.set(0.105 - i * 0.07, 0, 0);
      ring.userData = { index: i, digit: 0, angle: 0, target: 0 };
      ring.castShadow = true;
      dial.add(ring);
      this.rings.push(ring);
    }
    // two thin rails frame the reading line
    for (const y of [0.0175, -0.0175]) dial.add(mk(0.29, 0.0028, 0.004, 0, y, -0.0525, M.iron));
    this.dial = dial;
    // the plate under the lock says how the letters go
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.07), new THREE.MeshStandardMaterial({
      map: plateTexture(plateText), metalness: 0.4, roughness: 0.55, envMap: M.brass.envMap, envMapIntensity: 0.35,
    }));
    plate.position.set(0, -0.1, 0.023);
    plate.rotation.y = Math.PI;
    dial.add(plate);

    this.open = 0;
    this.openTarget = 0;
    this.openVel = 0;
  }

  setDigit(i, d) {
    const r = this.rings[i];
    r.userData.digit = ((d % 10) + 10) % 10;
    r.userData.target = r.userData.digit;
  }

  code() {
    return this.rings.map((r) => r.userData.digit).join('');
  }

  // the middle of the lock, for sounds and lights
  get centre() {
    return new THREE.Vector3(CAB.front, LOCK.y, LOCK.z);
  }

  unlock(instant = false) {
    this.openTarget = 1;
    if (instant) this.open = 1;
  }

  update(dt) {
    for (const r of this.rings) {
      const u = r.userData;
      let diff = u.target - u.angle;
      diff = ((diff + 5) % 10 + 10) % 10 - 5;
      u.angle += diff * Math.min(1, dt * 14);
      // calibrated so that digit u.angle sits between the rails, seen from the lock station
      r.rotation.y = (2 * Math.PI * (4.44 - u.angle)) / 10;
    }
    // the bar drops from its left bracket and hangs across the drawers
    [this.open, this.openVel] = spring(this.open, this.openVel, this.openTarget, 3.2, dt);
    this.hinge.rotation.z = this.open * 0.72;
  }
}


// Ten digits round a brass ring, upright as seen from the front.
function digitRing() {
  const c = makeCanvas(1024, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#6b5022');
  g.addColorStop(0.5, '#cfae66');
  g.addColorStop(1, '#6b5022');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = '#1d1306';
  ctx.font = '78px "IM Fell English SC", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 10; i++) {
    const x = ((i + 0.5) / 10) * 1024;
    ctx.save();
    ctx.translate(x, 66);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(String(i), 0, 0);
    ctx.restore();
    ctx.strokeStyle = 'rgba(40,25,5,0.4)';
    ctx.beginPath(); ctx.moveTo((i / 10) * 1024, 0); ctx.lineTo((i / 10) * 1024, 128); ctx.stroke();
  }
  return canvasTexture(c);
}
