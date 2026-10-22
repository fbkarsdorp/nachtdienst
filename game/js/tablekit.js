// What a drawer can bring to the table besides cards: the strongbox of P6, with
// three number wheels, and the box of loose halves for P4.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeCanvas, canvasTexture, paperCanvas, textureSet, boxUVs } from './textures.js';
import { TABLE } from './room.js';
import { spring } from './motion.js';

// calibrated so the wheel's value sits between the rails, 40° up the wheel's front
const WHEEL_OFFSET = 1.83;

// behind the four places where cards are laid, clear of the drawer
export const KIT_POS = new THREE.Vector3(TABLE.x, TABLE.y, TABLE.z - 0.25);

function numberWheel() {
  const c = makeCanvas(1024, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1b1a18';
  ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = '#e8dcc0';
  ctx.font = 'bold 60px "Special Elite", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // counting down the face, as on a real wheel: 1 above 2 above 3
  for (let i = 0; i < 12; i++) {
    ctx.save();
    ctx.translate(((11 - i + 0.5) / 12) * 1024, 66);
    // seen from the front of the box, the other side of the wheel from cabinet 5's rings
    ctx.rotate(Math.PI / 2);
    ctx.fillText(String(i + 1), 0, 0);
    ctx.restore();
  }
  return canvasTexture(c);
}

// A cash box in green-black lacquer with three wheels of 1–12 on its front, behind a
// brass frame.
export class Strongbox {
  constructor(M) {
    this.group = new THREE.Group();
    this.group.position.copy(KIT_POS);
    this.group.rotation.y = -0.12;
    const iron = new THREE.MeshPhysicalMaterial({
      color: 0x1a241e, metalness: 0.35, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.25,
      envMap: M.brass.envMap, envMapIntensity: 0.35,
    });
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.085, 0.13, 3, 0.005), iron);
    body.position.y = 0.0425 + 0.0035;
    body.castShadow = body.receiveShadow = true;
    this.group.add(body);
    // four brass feet, and the knuckles of the hinge along the back
    for (const x of [-0.09, 0.09]) {
      for (const z of [-0.055, 0.055]) {
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.0035, 12), M.brass);
        foot.position.set(x, 0.00175, z);
        this.group.add(foot);
      }
      const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.03, 12), iron);
      knuckle.rotation.z = Math.PI / 2;
      knuckle.position.set(x * 0.7, 0.0885, -0.067);
      this.group.add(knuckle);
    }
    // the lid hinges at the back, a little proud of the body all round
    this.lidHinge = new THREE.Group();
    this.lidHinge.position.set(0, 0.0885, -0.065);
    const lid = new THREE.Mesh(new RoundedBoxGeometry(0.206, 0.014, 0.136, 3, 0.004), iron);
    lid.position.set(0, 0.007, 0.067);
    lid.castShadow = true;
    this.lidHinge.add(lid);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0028, 8, 20, Math.PI), M.brass);
    handle.position.set(0, 0.014, 0.067);
    this.lidHinge.add(handle);
    for (const x of [-0.018, 0.018]) {
      const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.0045, 0.003, 12), M.brass);
      boss.position.set(x, 0.0155, 0.067);
      this.lidHinge.add(boss);
    }
    this.group.add(this.lidHinge);
    // a brass frame round the wheels, screwed on at its corners
    const frame = new THREE.Group();
    frame.position.set(0, 0.046, 0.0655);
    for (const [w, h, x, y] of [[0.17, 0.005, 0, 0.0245], [0.17, 0.005, 0, -0.0245], [0.005, 0.054, -0.0825, 0], [0.005, 0.054, 0.0825, 0]]) {
      frame.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.002).translate(x, y, 0), M.brass));
    }
    for (const x of [-0.0825, 0.0825]) {
      for (const y of [-0.0245, 0.0245]) {
        const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.001, 8), M.darkBrass);
        screw.rotation.x = Math.PI / 2;
        screw.position.set(x, y, 0.0015);
        frame.add(screw);
      }
    }
    this.group.add(frame);
    const tex = numberWheel();
    this.wheels = [];
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.034, 24), [
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.2 }), M.brass, M.brass,
      ]);
      w.rotation.order = 'ZYX';
      w.rotation.z = Math.PI / 2;
      w.position.set(-0.05 + i * 0.05, 0.046, 0.068);
      w.userData = { index: i, value: 1, angle: 0 };
      this.group.add(w);
      this.wheels.push(w);
    }
    // two thin rails frame the row that counts: on the upper front of the wheels,
    // where the eye meets them from above
    const tilt = (40 * Math.PI) / 180;
    for (const s of [1, -1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.0016, 0.003), M.brass);
      const a = tilt + s * 0.27;
      rail.position.set(0, 0.046 + 0.0212 * Math.sin(a), 0.068 + 0.0212 * Math.cos(a));
      rail.rotation.x = -a;
      this.group.add(rail);
    }
    this.open = 0;
    this.openVel = 0;
    this.openTarget = 0;
    this.group.visible = false;
  }

  combination() {
    return this.wheels.map((w) => w.userData.value).join('-');
  }

  turn(i, up) {
    const u = this.wheels[i].userData;
    u.value = ((u.value - 1 + (up ? 1 : 11)) % 12) + 1;
  }

  update(dt) {
    for (const w of this.wheels) {
      const u = w.userData;
      const target = u.value - 1;
      let diff = target - u.angle;
      diff = ((diff + 6) % 12 + 12) % 12 - 6;
      u.angle += diff * Math.min(1, dt * 14);
      // the wheel's value faces the front, between the rails
      w.rotation.y = (2 * Math.PI * (u.angle + WHEEL_OFFSET)) / 12;
    }
    [this.open, this.openVel] = spring(this.open, this.openVel, this.openTarget, 3, dt);
    this.lidHinge.rotation.x = -this.open * 1.9;
  }
}

// A low cardboard box with a stack of loose half-cards standing in it, labelled in pencil.
export class CardBox {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.copy(KIT_POS);
    this.group.rotation.y = 0.18;
    const board = new THREE.MeshStandardMaterial({ ...textureSet('Cardboard004'), roughness: 1 });
    board.color.setRGB(0.55, 0.5, 0.42, THREE.LinearSRGBColorSpace);
    const W = 0.2, D = 0.12, H = 0.05;
    let k = 0;
    const wall = (w, h, d, x, y, z) => {
      const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
      const m = new THREE.Mesh(boxUVs(g, 0.6, 'y', [0.23 * k++, 0.17 * k]), board);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    };
    wall(W, 0.003, D, 0, 0.005, 0);
    wall(W, H, 0.003, 0, H / 2 + 0.0035, D / 2);
    wall(W, H, 0.003, 0, H / 2 + 0.0035, -D / 2);
    wall(0.003, H, D, W / 2, H / 2 + 0.0035, 0);
    wall(0.003, H, D, -W / 2, H / 2 + 0.0035, 0);
    // the label on its front
    const c = paperCanvas(256, 80, { tone: [226, 218, 196], age: 0.8, seed: 13 });
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(60,58,56,0.85)';
    ctx.font = '30px "Homemade Apple", cursive';
    ctx.textAlign = 'center';
    ctx.fillText('losse helften', 128, 52);
    const map = canvasTexture(c);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.0235),
      new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0x3a3428, roughness: 0.9 }));
    label.position.set(0.02, H / 2 + 0.006, D / 2 + 0.0017);
    label.rotation.z = -0.03;
    this.group.add(label);
    const paper = new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.95 });
    for (let i = 0; i < 12; i++) {
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.0012), paper);
      card.position.set((Math.random() - 0.5) * 0.006, 0.036, -0.045 + i * 0.008);
      card.rotation.x = -0.18 + Math.random() * 0.05;
      card.castShadow = true;
      this.group.add(card);
    }
    this.group.visible = false;
  }
}

// The envelope bay at the table's near edge, left: a low wooden tray in which the cards of
// the envelope that is out stand upright, their tabs up (section 3g). Its local +x faces
// you; cards stand along -x from its front, as in a drawer.
export const BAY_POS = new THREE.Vector3(TABLE.x - 0.42, TABLE.y, TABLE.z + 0.22);
export const BAY_DEPTH = 0.2;
export class CardTray {
  constructor(M) {
    this.group = new THREE.Group();
    this.group.position.copy(BAY_POS);
    this.group.rotation.y = -Math.PI / 2;
    const wood = M?.oak || new THREE.MeshStandardMaterial({ color: 0x6e4a2c, roughness: 0.7 });
    const W = 0.32, D = BAY_DEPTH, H = 0.04, T = 0.008;
    // the sides run the length of the tray, the ends sit between them, the bottom between all
    // four; the front end is lower, so the cards show more of themselves to the one sitting
    let k = 0;
    const wall = (w, h, d, x, y, z, grain) => {
      const g = new RoundedBoxGeometry(w, h, d, 2, 0.0015).translate(x, y, z);
      const m = new THREE.Mesh(boxUVs(g, 1.83, grain, [0.31 * k++, 0.13 * k]), wood);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    };
    const FH = 0.028;
    wall(D - 2 * T, T, W - 2 * T, -D / 2, T / 2 + 0.002, 0, 'z');
    wall(T, FH, W - 2 * T, -T / 2, FH / 2 + 0.002, 0, 'z');
    wall(T, H, W - 2 * T, -D + T / 2, H / 2 + 0.002, 0, 'z');
    wall(D, H, T, -D / 2, H / 2 + 0.002, W / 2 - T / 2, 'x');
    wall(D, H, T, -D / 2, H / 2 + 0.002, -W / 2 + T / 2, 'x');
    // a brass card holder on the front end, as on the cabinets' drawers, with its label
    const brass = M?.brass || new THREE.MeshStandardMaterial({ color: 0xb8924a, metalness: 1, roughness: 0.4 });
    const holder = new THREE.Group();
    holder.position.set(0.0012, 0.002 + FH / 2, 0);
    const lw = 0.086, lh = 0.017;
    // two upright strips and a rail under the label
    for (const z of [lw / 2, -lw / 2]) holder.add(new THREE.Mesh(new THREE.BoxGeometry(0.0016, lh + 0.003, 0.003).translate(0, 0, z), brass));
    holder.add(new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.002, lw + 0.003).translate(0, -lh / 2, 0), brass));
    for (const z of [lw / 2 + 0.005, -lw / 2 - 0.005]) {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.0012, 10), brass);
      screw.rotation.z = Math.PI / 2;
      screw.position.set(0, 0, z);
      holder.add(screw);
    }
    const label = new THREE.Mesh(new THREE.PlaneGeometry(lw - 0.002, lh - 0.002), trayLabel());
    label.rotation.y = Math.PI / 2;
    label.position.x = -0.0004;
    holder.add(label);
    this.group.add(holder);
    // the floor the cards stand on, and the top of the sides
    this.floor = T + 0.002;
    this.rim = H + 0.002;
  }
}

function trayLabel() {
  const c = paperCanvas(256, 52, { tone: [226, 216, 190], age: 0.8, seed: 11 });
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(30,26,22,0.9)';
  ctx.font = 'bold 30px "Special Elite", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('INGEKOMEN', 128, 36);
  const map = canvasTexture(c);
  return new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0x3a3428, roughness: 0.9 });
}

// A bill spike at the back of the table: the night's emptied envelopes go onto it, the
// only thing in the room that shows how far you are (section 3b).
export const SPIKE_POS = new THREE.Vector3(TABLE.x + 0.52, TABLE.y, TABLE.z - 0.3);
export class Spike {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.copy(SPIKE_POS);
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2724, metalness: 0.6, roughness: 0.45 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.014, 28), iron);
    base.position.y = 0.007;
    const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.003, 0.17, 10), iron);
    nail.position.y = 0.014 + 0.085;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0018, 0.012, 10), iron);
    tip.position.y = 0.014 + 0.17 + 0.006;
    for (const m of [base, nail, tip]) { m.castShadow = true; this.group.add(m); }
  }

  // where the n-th envelope lies on it, impaled through its middle
  pose(n) {
    const yaw = ((n * 37) % 11) / 11 - 0.5;
    return {
      pos: new THREE.Vector3(SPIKE_POS.x, SPIKE_POS.y + 0.017 + n * 0.0045, SPIKE_POS.z),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, yaw * 0.6)),
    };
  }
}
