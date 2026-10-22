// First person: walk about freely (keys, or a click on the floor), look about by
// dragging, and step up to the things you work at, which have stations of their own:
// eased walks to a fixed view, with a little give when the mouse moves.
import * as THREE from 'three';
import { CABINET_Z, CAB, TABLE, ROOM } from './room.js';
import { LOCK } from './lock.js';
import { KIT_POS } from './tablekit.js';
import { TW_POS } from './typewriter.js';
import { MAP } from './mapwall.js';
import { DOOR } from './door.js';
import { ease, stride } from './motion.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function stations() {
  const S = {
    entry: { pos: V(0, 1.65, ROOM.z1 - 0.8), look: V(0, 1.35, 0), label: 'Ingang' },
    room: { pos: V(1.55, 1.66, 3.9), look: V(-0.9, 1.05, -2.4), label: 'Midden' },
    cabinets: { pos: V(0.95, 1.62, 3.6), look: V(-2.2, 1.1, -0.6), label: 'Kasten' },
    // over the table, the drawer brought from its cabinet at the near edge on the left
    table: { pos: V(TABLE.x - 0.1, 1.33, TABLE.z + 0.95), look: V(TABLE.x - 0.06, TABLE.y, TABLE.z - 0.02), label: 'Tafel', seated: true },
    typewriter: { pos: V(TW_POS.x - 0.06, 1.3, TW_POS.z + 0.44), look: V(TW_POS.x + 0.0, 0.93, TW_POS.z - 0.1), label: 'Typemachine', seated: true },
    map: { pos: V(MAP.cx - 1.32, 1.6, MAP.z), look: V(MAP.cx, 1.6, MAP.z), label: 'Wandkaart' },
    window: { pos: V(0, 1.62, ROOM.z0 + 1.9), look: V(0, 1.7, ROOM.z0 - 0.1), label: 'Raam' },
    door: { pos: V(0, 1.55, DOOR.z - 1.45), look: V(0, 1.3, DOOR.z), label: 'Deur' },
    // close up at the lock on cabinet V
    lock: { pos: V(LOCK.x + 0.46, LOCK.y - 0.05, LOCK.z), look: V(LOCK.x, LOCK.y - 0.1, LOCK.z), label: 'Slot' },
    // bent over the strongbox on the table
    strongbox: { pos: V(KIT_POS.x - 0.02, KIT_POS.y + 0.3, KIT_POS.z + 0.36), look: V(KIT_POS.x, KIT_POS.y + 0.05, KIT_POS.z), label: 'Kistje', seated: true },
    // the armchair by the window
    chair: { pos: V(0.62, 1.12, ROOM.z0 + 1.55), look: V(-0.2, 1.05, 0.6), label: 'Leunstoel', seated: true },
    // from beside the table, down the room to the clock and the door
    midnight: { pos: V(-0.55, 1.62, -0.05), look: V(1.0, 1.55, ROOM.z1 - 0.9), label: 'Midden' },
    corridor: { pos: V(0, 1.62, DOOR.z + 2.6), look: V(0, 1.5, DOOR.z + 6), label: 'Gang' },
  };
  CABINET_Z.forEach((z, i) => {
    S['cab' + i] = { pos: V(CAB.front + 1.85, 1.48, z), look: V(CAB.front, 1.12, z), label: 'Kast', cabinet: i };
    S['dial' + i] = { pos: V(CAB.front + 0.5, 1.9, z + CAB.w / 2 - 0.2), look: V(CAB.front, CAB.h - 0.18, z + CAB.w / 2 - 0.2), label: 'Slot', cabinet: i };
  });
  for (const s of Object.values(S)) {
    const m = new THREE.Matrix4().lookAt(s.pos, s.look, V(0, 1, 0));
    s.quat = new THREE.Quaternion().setFromRotationMatrix(m);
  }
  return S;
}

// keep walks out of the table and the cabinets
const TABLE_BOX = { x0: TABLE.x - TABLE.w / 2 - 0.35, x1: TABLE.x + TABLE.w / 2 + 0.35, z0: TABLE.z - TABLE.d / 2 - 0.35, z1: TABLE.z + TABLE.d / 2 + 0.35 };

function segHitsBox(a, b, bx) {
  for (let i = 1; i < 20; i++) {
    const t = i / 20;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    if (x > bx.x0 && x < bx.x1 && z > bx.z0 && z < bx.z1) return true;
  }
  return false;
}

export class Rails {
  constructor(camera, sound) {
    this.camera = camera;
    this.sound = sound;
    this.S = stations();
    this.current = 'entry';
    this.move = null;
    this.mouse = new THREE.Vector2();
    this.look = new THREE.Vector2();
    this.parallax = true;
    this.basePos = this.S.entry.pos.clone();
    this.baseQuat = this.S.entry.quat.clone();
    camera.position.copy(this.basePos);
    camera.quaternion.copy(this.baseQuat);
    this.onArrive = null;
    this.stepAcc = 0;
    this.bob = 0;
    // walking about: heading, keys held, speed, and what is in the way
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.vel = new THREE.Vector3();
    this.obstacles = [];
    this.bounds = { x0: ROOM.x0 + 0.32, x1: ROOM.x1 - 0.32, z0: ROOM.z0 + 0.4, z1: ROOM.z1 - 0.35 };
  }

  setMouse(nx, ny) { this.mouse.set(nx, ny); }

  // a station made later (in front of a print on the wall)
  addStation(name, pos, look, label) {
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, look, V(0, 1, 0)));
    this.S[name] = { pos: pos.clone(), look: look.clone(), quat, label };
  }

  get moving() { return !!this.move; }
  get free() { return this.current === 'free'; }
  // on the move in any way: a walk to somewhere, or keys held
  get inMotion() { return !!this.move || !!this.head || this.vel.lengthSq() > 0.04; }

  // floor rectangles {x0, x1, z0, z1} to walk around
  setObstacles(list) { this.obstacles = list; }

  // Stop being anywhere in particular: look and walk from here.
  enterFree() {
    if (this.move || this.free) return;
    const e = new THREE.Euler().setFromQuaternion(this.baseQuat, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
    this.current = 'free';
    this.onArrive?.('free');
  }

  lookBy(dx, dy) {
    if (this.move) return;
    if (!this.free) this.enterFree();
    this.yaw -= dx * 0.0045;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0045, -1.25, 1.1);
  }

  // Walk to a point on the floor, still facing the way you were facing.
  walkTo(point) {
    const p = this.clampToFloor(V(point.x, 1.62, point.z));
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.baseQuat).setY(0);
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const look = p.clone().add(fwd).setY(1.5);
    this.S.walk = { pos: p, look, quat: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p, look, V(0, 1, 0))) };
    this.current = null;
    this.go('walk');
  }

  // Turn the head to something and back again, staying where you are: the camera only,
  // over whatever the rails are doing. onLook comes when the turn is done; resolves once back.
  glanceHead(target, { turn = 1.3, hold = 3.0, onLook } = {}) {
    return new Promise((done) => {
      this.head = { target: target.clone(), t: 0, turn, hold, onLook, looked: false, done };
    });
  }

  // Go back to a pose (after a glance), and be free there.
  returnTo(pos, quat, duration) {
    this.S.ret = { pos: pos.clone(), quat: quat.clone(), look: pos.clone() };
    this.current = null;
    this.go('ret', { duration });
  }

  blocked(p, from) {
    const b = this.bounds;
    if (p.x < b.x0 || p.x > b.x1 || p.z < b.z0 || p.z > b.z1) return true;
    const inside = (o, q) => q.x > o.x0 && q.x < o.x1 && q.z > o.z0 && q.z < o.z1;
    // a rectangle you are already in (a chair you sat on) does not hold you
    return this.obstacles.some((o) => inside(o, p) && !inside(o, from));
  }

  // A path on the floor from a to b that keeps clear of the furniture: A* over a grid of
  // 20 cm cells, then pulled taut. The rectangles you start or end in do not count (a chair
  // you sit on, a station close to a cabinet). Null only if there is no way at all.
  route(a, b) {
    const C = 0.2, bd = this.bounds;
    const nx = Math.ceil((bd.x1 - bd.x0) / C) + 1, nz = Math.ceil((bd.z1 - bd.z0) / C) + 1;
    const inside = (o, q) => q.x > o.x0 && q.x < o.x1 && q.z > o.z0 && q.z < o.z1;
    const mine = this.obstacles.filter((o) => inside(o, a) || inside(o, b));
    const hard = this.obstacles.filter((o) => !mine.includes(o));
    const free = (q) => !hard.some((o) => inside(o, q));
    // the grid keeps a hand's breadth off the furniture, so the smoothed walk does not graze it
    const roomy = (q) => !hard.some((o) => q.x > o.x0 - 0.15 && q.x < o.x1 + 0.15 && q.z > o.z0 - 0.15 && q.z < o.z1 + 0.15);
    const clear = (p, q, ok = free) => {
      const n = Math.ceil(p.distanceTo(q) / 0.08);
      for (let i = 1; i < n; i++) if (!ok(p.clone().lerp(q, i / n))) return false;
      return true;
    };
    if (clear(a, b)) return [a.clone(), b.clone()];
    const cell = (q) => [THREE.MathUtils.clamp(Math.round((q.x - bd.x0) / C), 0, nx - 1), THREE.MathUtils.clamp(Math.round((q.z - bd.z0) / C), 0, nz - 1)];
    const at = (i, k) => V(bd.x0 + i * C, 1.62, bd.z0 + k * C);
    const [si, sk] = cell(a), [ti, tk] = cell(b);
    const key = (i, k) => i * nz + k;
    const g = new Map([[key(si, sk), 0]]), came = new Map(), open = [[0, si, sk]];
    const h = (i, k) => Math.hypot(i - ti, k - tk);
    let found = false;
    while (open.length) {
      let bi = 0;
      for (let j = 1; j < open.length; j++) if (open[j][0] < open[bi][0]) bi = j;
      const [, i, k] = open.splice(bi, 1)[0];
      if (i === ti && k === tk) { found = true; break; }
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ii = i + di, kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
        if (!(ii === ti && kk === tk) && !roomy(at(ii, kk))) continue;
        const ng = g.get(key(i, k)) + Math.hypot(di, dk);
        if (ng < (g.get(key(ii, kk)) ?? Infinity)) {
          g.set(key(ii, kk), ng);
          came.set(key(ii, kk), [i, k]);
          open.push([ng + h(ii, kk), ii, kk]);
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = [ti, tk]; c; c = came.get(key(c[0], c[1]))) cells.unshift(at(c[0], c[1]));
    // pull taut: from each point, the furthest point still in plain sight
    const raw = [a.clone(), ...cells.slice(1, -1), b.clone()];
    const pts = [raw[0]];
    for (let i = 0; i < raw.length - 1;) {
      let j = raw.length - 1;
      // with room to spare in the middle; the first and last steps may pass close
      const ok = (jj) => (i === 0 || jj === raw.length - 1 ? clear(raw[i], raw[jj]) : clear(raw[i], raw[jj], roomy));
      while (j > i + 1 && !ok(j)) j--;
      pts.push(raw[j]);
      i = j;
    }
    return pts;
  }

  // the nearest free spot to p, stepping back toward where you stand
  clampToFloor(p) {
    const from = this.basePos;
    for (let k = 0; k <= 20; k++) {
      const q = p.clone().lerp(from, k / 20);
      q.x = THREE.MathUtils.clamp(q.x, this.bounds.x0, this.bounds.x1);
      q.z = THREE.MathUtils.clamp(q.z, this.bounds.z0, this.bounds.z1);
      if (!this.blocked(q, from)) return q;
    }
    return from.clone();
  }

  go(name, { duration, instant = false } = {}) {
    const to = this.S[name];
    if (!to) return;
    if (instant) {
      this.current = name;
      this.basePos.copy(to.pos);
      this.baseQuat.copy(to.quat);
      this.move = null;
      this.onArrive?.(name);
      return;
    }
    if (name === this.current && !this.move) return;
    const from = this.basePos.clone();
    const a = from, b = to.pos;
    // round the furniture by a free path; failing that, at least round the table
    let pts = this.route(a, b);
    if (!pts) {
      pts = [from];
      if (segHitsBox(a, b, TABLE_BOX)) {
        const mid = a.clone().lerp(b, 0.5);
        const right = V(TABLE_BOX.x1 + 0.1, 1.62, mid.z);
        const left = V(TABLE_BOX.x0 - 0.05, 1.62, mid.z);
        pts.push(a.distanceTo(right) + right.distanceTo(b) < a.distanceTo(left) + left.distanceTo(b) ? right : left);
      }
      pts.push(b.clone());
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    const fromQ = this.baseQuat.clone();
    // a purposeful pace: a metre and a half a second once under way, and time to turn the head
    const turn = fromQ.angleTo(to.quat);
    const dur = duration ?? Math.min(4.5, Math.max(1.1, 0.9 + len * 0.38, 0.9 + turn * 0.6));
    // look where you walk on longer moves
    let walkQ = null;
    if (len > 2.2) {
      const dir = b.clone().sub(a).setY(0).normalize();
      const m = new THREE.Matrix4().lookAt(a, a.clone().add(dir).setY(a.y - 0.08), V(0, 1, 0));
      walkQ = new THREE.Quaternion().setFromRotationMatrix(m);
    }
    // short moves are a lean or a turn; longer ones a walk that gets going and slows down
    const r = len < 1.2 ? 0.5 : 0.32;
    this.move = { curve, len, dur, r, t: 0, fromQ, toQ: to.quat.clone(), walkQ, name, lastP: from.clone(), rate: 1 };
    this.current = name;
  }

  // impatience: a click on the way gets you there sooner
  hurry() {
    if (this.move) this.move.rate = Math.min(3, this.move.rate + 1);
  }

  update(dt, time) {
    const cam = this.camera;
    if (this.move) {
      const m = this.move;
      m.t = Math.min(1, m.t + dt * m.rate / m.dur);
      const k = stride(m.t, m.r);
      const p = m.curve.getPointAt(k);
      this.basePos.copy(p);
      // the head turns on its own clock, so it leads the walk a little and settles with it
      if (m.walkQ) {
        if (m.t < 0.4) this.baseQuat.slerpQuaternions(m.fromQ, m.walkQ, ease(m.t / 0.4));
        else if (m.t < 0.5) this.baseQuat.copy(m.walkQ);
        else this.baseQuat.slerpQuaternions(m.walkQ, m.toQ, ease((m.t - 0.5) / 0.5));
      } else this.baseQuat.slerpQuaternions(m.fromQ, m.toQ, ease(m.t));
      const stepLen = p.distanceTo(m.lastP);
      m.lastP.copy(p);
      this.stepAcc += stepLen;
      this.bob += stepLen * 5.4;
      if (this.stepAcc > 0.62) {
        this.stepAcc = 0;
        this.sound.step([p.x, 0.05, p.z]);
      }
      if (m.t >= 1) {
        this.move = null;
        this.bob = 0;
        if (m.name === 'walk' || m.name === 'ret') {
          this.current = null;
          this.enterFree();
        } else this.onArrive?.(m.name);
      }
    }
    if (this.free && !this.move) this.updateFree(dt);
    // parallax: a few degrees of give toward the mouse, at a station
    const target = this.parallax && !this.move && !this.free ? this.mouse : new THREE.Vector2();
    this.look.lerp(target, Math.min(1, dt * 1.4));
    const q = this.baseQuat.clone();
    const yaw = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -this.look.x * 0.07);
    const pitch = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), this.look.y * 0.045);
    q.premultiply(yaw).multiply(pitch);
    if (this.head) {
      const h = this.head;
      h.t += dt;
      const end = 2 * h.turn + h.hold;
      const k = h.t < h.turn ? ease(h.t / h.turn) : h.t < h.turn + h.hold ? 1 : ease(Math.max(0, (end - h.t) / h.turn));
      const toQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(this.basePos, h.target, V(0, 1, 0)));
      q.slerp(toQ, k);
      if (!h.looked && h.t >= h.turn) { h.looked = true; h.onLook?.(); }
      if (h.t >= end) { this.head = null; h.done(); }
    }
    cam.quaternion.copy(q);
    cam.position.copy(this.basePos);
    // breathing, and the bob of walking
    const gait = this.move ? Math.sin(Math.PI * this.move.t) : Math.min(1, this.vel.length() / 1.4);
    cam.position.y += Math.sin(time * 0.9) * 0.0025 + Math.sin(this.bob) * 0.01 * gait;
  }

  // Keys: W A S D or the arrows, an unhurried pace that eases in and out; Shift for a brisk one.
  updateFree(dt) {
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const fwd = V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const want = fwd.multiplyScalar(f).add(right.multiplyScalar(r));
    const pace = k.has('ShiftLeft') || k.has('ShiftRight') ? 2.6 : 1.4;
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(pace);
    this.vel.lerp(want, Math.min(1, dt * (want.lengthSq() > 0 ? 4 : 6)));
    if (this.vel.lengthSq() < 1e-5) this.vel.set(0, 0, 0);
    const from = this.basePos.clone();
    // slide along whatever is in the way, one axis at a time
    const nx = from.clone(); nx.x += this.vel.x * dt;
    if (!this.blocked(nx, from)) this.basePos.x = nx.x; else this.vel.x = 0;
    const nz = this.basePos.clone(); nz.z += this.vel.z * dt;
    if (!this.blocked(nz, from)) this.basePos.z = nz.z; else this.vel.z = 0;
    // standing up from a chair, or coming down from a close look, back to eye height
    this.basePos.y += (1.62 - this.basePos.y) * Math.min(1, dt * (this.vel.lengthSq() > 0.01 ? 3 : 0.8));
    this.baseQuat.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const stepLen = this.basePos.distanceTo(from);
    this.stepAcc += stepLen;
    this.bob += stepLen * 5.4;
    if (this.stepAcc > 0.62) {
      this.stepAcc = 0;
      this.sound.step([this.basePos.x, 0.05, this.basePos.z]);
    }
  }
}
