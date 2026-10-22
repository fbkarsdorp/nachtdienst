// Cards that are out of order leak (NACHTDIENST_PUZZLES.md sections 2 and 3e). While the
// cabinet being worked on has drawers out that are not filed its effect is in the room, and it grows a step
// every three minutes (three steps); when all three drawers are filed it goes, and the
// game turns your head to see it go. Nothing is explained.
//   voortekenen  the wall clock ticks too loudly and unevenly, louder and less even at
//                each step; the escapement catches and a beat is missed every 40 s, then
//                20, then 10
//   wittewieven  condensation on the window: round the frame, then most of the glass, then
//                all of it, milky, dimming the moonlight on the floor; it clears
//   weerwolven   something passes along the ledge outside every 90 s, then 45, then 20,
//                its shadow crossing the moonlight; from the second step it stops at the
//                glass on the way and breathes; at the end it is standing there, and goes
//   spoken       the lamp flickers in bursts wherever you are, more often at each step; it
//                dims while you move or turn, more at each step, and is slow to come back;
//                from the second step it falters as it goes down
//   duivel       nothing: it is locked
// Each leak has its other half on the cabinet itself (leaks.js), driven from here in step:
// the drawers jolt on the missed beat, the mist at its foot rises with the window's, its
// front is clawed as the shape goes by, it frosts over while the lamp is down. Each drawer
// of it that is filed takes the leak a step back down.
// The room locks that live in the same places are driven from here too: the name written
// in the condensation (R2), the knocking at the door (R3), the glass as a mirror.
import { ROOM } from './room.js';
import { lighting } from './scenery.js';

const rand = (a, b) => a + Math.random() * (b - a);
// a step up every so many seconds a cabinet stays unfiled
const ESCALATE = 180;
const SKIP_EVERY = [40, 20, 10];
const PASS_EVERY = [90, 45, 20];
const FOG_AT = [0.34, 0.67, 1.0];
const DIM_TO = [0.4, 0.25, 0.1];
// the lamp flickers in a burst every so many seconds, by step
const FLICKER_EVERY = [[8, 14], [4, 8], [1.5, 4]];
// how long the creature stands at the glass on a pass, by step
const PAUSE = [0, 1.6, 3.2];
// the knocking at the door comes this often while the door is a lock
const KNOCK_EVERY = 30;

const TIMERS = {
  voortekenen: ['skip', 'jolt'],
  weerwolven: ['pass'],
};

export class Atmosphere {
  constructor({ scene, camera, sound, rails, windowRefs, clock, lamp, hemi, door, local }) {
    this.scene = scene;
    // the half of each leak that is on the cabinet itself
    this.local = local;
    this.camera = camera;
    this.sound = sound;
    this.rails = rails;
    this.win = windowRefs;
    this.clock = clock;
    this.lamp = lamp;
    this.hemi = hemi;
    this.door = door;
    this.active = new Set();
    // how far each leak has grown: 1..3 while active
    this.level = {};
    this.since = {};
    this.timers = {};
    // condensation on the glass, 0..1
    this.fog = 0;
    this.fogTarget = 0;
    this.fogClearing = false;
    // the name written in it (R2): 0..1, and whether it is there to be read
    this.textK = 0;
    this.writing = false;
    // R2 opened: the mist goes down a step from wherever it is
    this.fogDown = 0;
    // the creature on the ledge: where (window coordinates, m) and how fast
    this.shapeX = -9;
    this.shapeV = 0;
    // the haunted-house cabinet takes the light down while you move about
    this.dim = 1;
    // the lamp itself, for the endings and cabinet 4's enactment: 1 on, 0 out
    this.lampMaster = 1;
    this.lampMasterTarget = 1;
    this.dawnK = 0;
    this.dawnTarget = 0;
    // the glass as a mirror, with the door standing open in it
    this.mirrorK = 0;
    this.mirrorUntil = 0;
    this.lampBase = lamp.spot.intensity;
    this.glowBase = lamp.glow.intensity;
    this.liningBase = lamp.lining?.material?.emissiveIntensity ?? 1;
    this.bulbBase = lamp.bulb?.material?.emissiveIntensity ?? 1;
    this.coldBase = windowRefs.cold.intensity;
    this.fillBase = lighting.uFill.value.clone();
    this.hemiBase = hemi.intensity;
    this.fogBase = scene.fog.density;
    const m = windowRefs.mirror;
    if (m && door) {
      // in the mirror the door stands open; in the room it does not
      const render = m.onBeforeRender;
      m.onBeforeRender = (...args) => {
        const was = door.hinge.rotation.y;
        door.hinge.rotation.y = 1.25;
        render.apply(m, args);
        door.hinge.rotation.y = was;
      };
    }
  }

  lv(fam) { return this.level[fam] || 1; }

  activate(fam) {
    if (this.active.has(fam)) return;
    this.active.add(fam);
    this.level[fam] = 1;
    this.since[fam] = 0;
    if (fam === 'voortekenen') {
      this.sound.setClockLoud(1);
      this.timers.skip = rand(30, 40);
    }
    if (fam === 'wittewieven') this.fogClearing = false;
    if (fam === 'weerwolven') this.timers.pass = rand(40, 90);
    this.local?.start(fam);
  }

  // A drawer of the cabinet filed (not its last): the leak goes back down a step, and on
  // the cabinet it shrinks back for a while. The three minutes to the next step go on.
  filedOne(fam) {
    if (!this.active.has(fam)) return;
    const s = Math.min(this.since[fam], 3 * ESCALATE - 1);
    this.since[fam] = Math.max(0, s - ESCALATE);
    this.local?.ebb(fam);
  }

  // Before the head turns to watch a leak stop: the creature is there, standing.
  prepare(fam) {
    if (fam === 'weerwolven' && this.active.has(fam)) {
      this.shapeX = -0.12;
      this.shapeV = 0;
      this.pauseFor = this.standing = 0;
    }
  }

  // The cabinet is filed: its layer goes. show: it is being watched going.
  settle(fam, { show = false } = {}) {
    this.local?.stop(fam, show);
    if (!this.active.delete(fam)) return;
    for (const t of TIMERS[fam] || []) delete this.timers[t];
    this.level[fam] = 0;
    if (fam === 'voortekenen') {
      // its enactment: the ticking stops, five seconds of quiet, then it goes on softly
      if (show) this.sound.clockRest(5);
      else this.sound.setClockLoud(0);
      this.sound.clockEven = false;
    }
    if (fam === 'wittewieven') {
      this.fogClearing = true;
      this.writing = false;
      this.number = false;
      if (!show) this.fog = this.textK = 0;
    }
    if (fam === 'weerwolven') {
      this.pauseFor = this.standing = 0;
      // it stands a moment, then goes, and does not come back
      if (show && Math.abs(this.shapeX) < 1.2) this.leaveIn = 1.0;
      else this.shapeX = -9;
    }
  }

  settleAll() {
    for (const f of [...this.active]) this.settle(f);
  }

  // R1 solved: the clock keeps time again (it stays loud until the cabinet is filed)
  clockKeepsTime() {
    this.sound.clockEven = true;
    delete this.timers.skip;
    // the cabinet goes on jolting until it is filed, on its own now
    if (this.active.has('voortekenen')) this.timers.jolt = SKIP_EVERY[this.lv('voortekenen') - 1];
  }

  // R2: the mist has reached the top of the window, and a name is written in it
  // (rising quickly when it is watched)
  writeOnWindow(tex, now = false) {
    this.win.glassMat.uniforms.uText.value = tex;
    this.writing = true;
    this.fogDown = 0;
    if (now) this.fog = Math.max(this.fog, 0.85);
  }

  // R2 solved: the mist recedes a step and the name fades
  windowAnswered() {
    this.writing = false;
    this.fogDown = 1;
  }

  // R2 solved: in the mist that is left, the number from under the card's stain, written
  // from outside too; it stays until the cabinet is filed
  writeNumber(tex) {
    this.win.glassMat.uniforms.uText.value = tex;
    this.number = true;
  }

  // R3: something knocks n times at the door, every half minute, until it is answered
  startKnocking(n, first = 4) {
    this.knockN = n;
    this.timers.knock = first;
  }

  stopKnocking() {
    delete this.timers.knock;
    this.knockN = 0;
  }

  knockAt(n) {
    const p = [0, 1.2, ROOM.z1 + 0.05];
    this.sound.knock(p, n);
    // the leaf shivers with each blow
    for (let i = 0; i < n; i++) setTimeout(() => this.door?.knock(), i * 450);
  }

  // the glass shows the room for so long, the door standing open in it
  reflect(sec) {
    this.mirrorUntil = sec;
  }

  lampOut(on = false) { this.lampMasterTarget = on ? 1 : 0; }

  // a grey morning, 0..1; instant or eased
  dawn(k, instant = false) {
    this.dawnTarget = k;
    if (instant) this.dawnK = k;
  }

  tick(name, dt) {
    if (this.timers[name] === undefined) return false;
    this.timers[name] -= dt;
    return this.timers[name] <= 0;
  }

  update(dt, time) {
    this.local?.update(dt, time, this);
    // the leaks grow while their cabinets wait
    for (const fam of this.active) {
      this.since[fam] += dt;
      const l = Math.min(3, 1 + Math.floor(this.since[fam] / ESCALATE));
      if (l !== this.level[fam] && fam === 'voortekenen') this.sound.setClockLoud(l);
      this.level[fam] = l;
    }
    if (this.tick('skip', dt)) {
      this.sound.skipBeat();
      this.local?.jolt(this.lv('voortekenen'));
      this.timers.skip = SKIP_EVERY[this.lv('voortekenen') - 1] * rand(0.9, 1.1);
    }
    if (this.tick('jolt', dt)) {
      this.local?.jolt(this.lv('voortekenen'));
      this.timers.jolt = SKIP_EVERY[this.lv('voortekenen') - 1] * rand(0.9, 1.1);
    }
    if (this.tick('pass', dt)) this.passDue = (this.passDue || 0) + 0.25;
    if (!this.active.has('weerwolven')) this.passDue = 0;
    if (this.passDue && !this.rails.inMotion && this.passDue < 12) {
      // it would rather come while you walk and look about (section 3g): it waits a little
      this.timers.pass = 0.25;
    } else if (this.passDue) {
      this.passDue = 0;
      // along the ledge, left to right, unhurried
      this.shapeX = -1.3;
      this.shapeV = 0.55;
      this.pauseFor = PAUSE[this.lv('weerwolven') - 1];
      this.sound.prowl([-0.3, 1.4, ROOM.z0 - 0.2]);
      this.local?.onPass();
      this.timers.pass = PASS_EVERY[this.lv('weerwolven') - 1] * rand(0.92, 1.08);
    }
    if (this.tick('knock', dt)) {
      this.knockAt(this.knockN);
      this.timers.knock = KNOCK_EVERY;
    }

    // window: the fog stands at its step; full while a name is written in it
    const u = this.win.outsideMat.uniforms;
    const g = this.win.glassMat.uniforms;
    u.uTime.value = g.uTime.value = time;
    if (this.active.has('wittewieven')) {
      const step = this.writing ? 3 : Math.max(1, this.lv('wittewieven') - this.fogDown);
      this.fogTarget = FOG_AT[step - 1];
      this.fog += (this.fogTarget - this.fog) * Math.min(1, dt * (this.fogTarget > this.fog ? 0.15 : 0.6));
    } else if (this.fogClearing) {
      this.fog = Math.max(0, this.fog - dt * 0.28);
      if (!this.fog) this.fogClearing = false;
    }
    const textOn = this.writing || this.number;
    this.textK += ((textOn ? 1 : 0) - this.textK) * Math.min(1, dt * (textOn ? 1.2 : 0.5));
    g.uTextK.value = this.textK;
    g.uFog.value = this.fog;
    u.uMist.value = this.fog;
    this.win.night?.setFog(this.fog);
    if (this.leaveIn !== undefined && (this.leaveIn -= dt) <= 0) {
      this.leaveIn = undefined;
      this.shapeV = 0.9;
      this.sound.prowl([0.3, 1.4, ROOM.z0 - 0.2], 0.6);
    }
    if (this.shapeV) {
      this.shapeX += dt * this.shapeV;
      if (this.pauseFor && this.shapeX > -0.15 && this.shapeX < 0) {
        // it stops at the glass, breathes on it, and goes on
        this.standing = this.pauseFor;
        this.pauseFor = 0;
        this.shapeV = 0;
        this.sound.snuffle?.([0, 1.5, ROOM.z0 - 0.15]);
      }
      if (this.shapeX > 1.4) { this.shapeX = -9; this.shapeV = 0; }
    } else if (this.standing && (this.standing -= dt) <= 0) {
      this.standing = 0;
      this.shapeV = 0.55;
    }
    g.uShapeX.value = this.shapeX;
    this.win.night?.setShape(this.shapeX);
    // what is lit live by the window darkens with it
    const block = Math.max(0, 1 - Math.abs(this.shapeX) / 1.0) * 0.85;
    // the mirror: in and out quickly, there for as long as it was asked
    const m = this.win.mirror;
    if (m) {
      this.mirrorUntil = Math.max(0, this.mirrorUntil - dt);
      this.mirrorK += ((this.mirrorUntil > 0 ? 1 : 0) - this.mirrorK) * Math.min(1, dt * 5);
      if (this.mirrorK < 0.01 && this.mirrorUntil <= 0) this.mirrorK = 0;
      m.visible = this.mirrorK > 0;
      m.material.uniforms.opacity.value = this.mirrorK * 0.92;
    }

    // lamp: a faint unsteadiness, as old lamps have
    let k = 0.985 + Math.sin(time * 13.0) * 0.006 + Math.sin(time * 3.1) * 0.006;
    const dimTo = this.active.has('spoken') && this.rails.inMotion ? DIM_TO[this.lv('spoken') - 1] : 1;
    // down quickly, back slowly, so you still see it when you have arrived
    this.dim += (dimTo - this.dim) * Math.min(1, dt * (dimTo < this.dim ? 3.5 : 0.45));
    let flick = 1;
    if (this.active.has('spoken')) {
      const lv = this.lv('spoken');
      // it flickers wherever you are, in bursts, more often at each step: the filament
      // catching and going
      if ((this.flickIn = (this.flickIn ?? rand(2, 5)) - dt) <= 0) {
        this.flickIn = rand(...FLICKER_EVERY[lv - 1]);
        this.burst = rand(0.25, 0.4 + 0.25 * lv);
      }
      if (this.burst > 0) {
        this.burst -= dt;
        if ((this.falter = (this.falter || 0) - dt) <= 0) this.falter = rand(0.06, 0.22);
        if (this.falter < 0.06) flick = rand(0.25, 0.6);
      }
      // and falters as it goes down, from the second step
      if (this.dim < 0.97 && lv > 1) {
        if ((this.falterDim = (this.falterDim || 0) - dt) <= 0) this.falterDim = rand(0.08, 0.5);
        if (this.falterDim < 0.07) flick = Math.min(flick, 0.35);
      }
    }
    k *= flick;
    this.lampMaster += (this.lampMasterTarget - this.lampMaster) * Math.min(1, dt * 0.6);
    if (Math.abs(this.lampMaster - this.lampMasterTarget) < 0.002) this.lampMaster = this.lampMasterTarget;
    k *= this.dim * this.lampMaster;
    this.lamp.spot.intensity = this.lampBase * k;
    this.lamp.glow.intensity = this.glowBase * k;
    // the baked light from the lamp follows it; the rest of the room does not
    lighting.uLampK.value = k;
    if (this.lamp.lining) this.lamp.lining.material.emissiveIntensity = this.liningBase * k;
    if (this.lamp.bulb) this.lamp.bulb.material.emissiveIntensity = this.bulbBase * k;
    this.sound.setLampHum?.(this.lampMaster * (0.3 + 0.7 * this.dim * flick));

    // morning: the room's own light comes up cold and grey, the fog thins
    if (this.dawnK !== this.dawnTarget) {
      this.dawnK += (this.dawnTarget - this.dawnK) * Math.min(1, dt * 0.35);
      if (Math.abs(this.dawnK - this.dawnTarget) < 0.002) this.dawnK = this.dawnTarget;
    }
    const d = this.dawnK;
    u.uDawn.value = g.uDawn.value = d;
    lighting.uAmbK.value = 1 + d * 7.5;
    lighting.uGrey.value = d * 0.85;
    // the moon goes as the day comes
    lighting.uFill.value.copy(this.fillBase).multiplyScalar(1 - d * 0.6);
    this.win.night?.setDawn(d);
    this.win.cold.intensity = (this.coldBase * (1 - 0.75 * this.fog) * (1 - block)) + d * 4;
    this.hemi.intensity = this.hemiBase + d * 1.5;
    this.scene.fog.density = this.fogBase * (1 - 0.6 * d);
  }
}
