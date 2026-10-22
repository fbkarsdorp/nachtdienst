// Sound is synthesised (wood, brass, the clock, the wind at the window), except the cards
// and envelopes: those are recordings (sounds/, Kenney's Casino and RPG Audio, CC0), with
// the synthesised paper as a stand-in until they have loaded. Positional sources follow the
// camera through an HRTF panner.
import { ROOM } from './room.js';

// The recordings of card and paper, by what the hands do, and how many takes of each:
// take (a card taken up or slid off), place (laid down), shove (pushed into an envelope or a
// drawer), out (drawn out of the envelope), flap (the envelope's flap lifted), flip (a card
// turned, a flap tucked), fan (cards fanned out)
const SAMPLES = { take: 8, place: 4, shove: 4, out: 2, flap: 2, flip: 3, fan: 2 };
// how loud each is against the synthesised paper it replaces, at the same gain
const SAMPLE_GAIN = { take: 2.4, place: 2.6, shove: 2.2, out: 0.8, flap: 1.7, flip: 2.6, fan: 1.6 };

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.clockGainTarget = 0.35;
    this.clockRunning = true;
    this.listenerPos = [0, 1.6, 0];
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // an iPhone plays a page's sound as background noise, silenced by the ring switch,
    // unless the page says it is something to listen to
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.32;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.2, 2.6);
    this.reverb.connect(this.wet).connect(this.master);
    this.duck = ctx.createGain();
    this.duck.connect(this.dry);
    this.duck.connect(this.reverb);
    this.noiseBuf = this.makeNoise(3);
    this.brownBuf = this.makeBrown(6);
    this.loadSamples();
    this.startAmbience();
    this.startClock();
  }

  // after a call, a locked screen or another app, an iPhone leaves the sound 'interrupted'
  resume() { if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume(); }

  setEnabled(on) {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.2);
  }

  setListener(pos, forward, up) {
    this.listenerPos = pos;
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos[0], t, 0.05);
      l.positionY.setTargetAtTime(pos[1], t, 0.05);
      l.positionZ.setTargetAtTime(pos[2], t, 0.05);
      l.forwardX.setTargetAtTime(forward[0], t, 0.05);
      l.forwardY.setTargetAtTime(forward[1], t, 0.05);
      l.forwardZ.setTargetAtTime(forward[2], t, 0.05);
      l.upX.setTargetAtTime(up[0], t, 0.05);
      l.upY.setTargetAtTime(up[1], t, 0.05);
      l.upZ.setTargetAtTime(up[2], t, 0.05);
    } else {
      l.setPosition(...pos);
      l.setOrientation(...forward, ...up);
    }
  }

  duckFor(on) {
    if (!this.ctx) return;
    this.duck.gain.setTargetAtTime(on ? 0.55 : 1, this.ctx.currentTime, 0.6);
  }

  // ------------------------------------------------------------ building blocks

  loadSamples() {
    this.samples = {};
    this.lastTake = {};
    for (const [kind, n] of Object.entries(SAMPLES)) {
      this.samples[kind] = [];
      for (let i = 1; i <= n; i++) {
        fetch(`sounds/${kind}-${i}.mp3`)
          .then((r) => r.arrayBuffer())
          .then((b) => this.ctx.decodeAudioData(b))
          .then((buf) => this.samples[kind].push(buf))
          .catch(() => {});
      }
    }
  }

  // A recording of the hands at it: one of its takes (not the one just heard), a little
  // higher or lower each time. False while none has loaded.
  sample(kind, pos, gain) {
    const takes = this.samples?.[kind];
    if (!takes?.length) return false;
    let i = Math.floor(Math.random() * takes.length);
    if (takes.length > 1 && i === this.lastTake[kind]) i = (i + 1) % takes.length;
    this.lastTake[kind] = i;
    const src = this.ctx.createBufferSource();
    src.buffer = takes[i];
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const g = this.ctx.createGain();
    g.gain.value = gain * SAMPLE_GAIN[kind];
    src.connect(g).connect(this.out(pos));
    src.start(this.now);
    return true;
  }

  makeNoise(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  makeBrown(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    return b;
  }

  impulse(sec, decay) {
    const rate = this.ctx.sampleRate;
    const len = rate * sec;
    const b = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp = lp * 0.55 + (Math.random() * 2 - 1) * 0.45; // wood swallows the highs
        d[i] = lp * Math.pow(1 - t, decay) * (i < rate * 0.004 ? i / (rate * 0.004) : 1);
      }
    }
    return b;
  }

  out(pos, { wet = true } = {}) {
    // Returns a node to connect a voice to; positional if pos given.
    const g = this.ctx.createGain();
    if (pos) {
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 0.8;
      p.rolloffFactor = 1.3;
      p.maxDistance = 40;
      if (p.positionX) {
        p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2];
      } else p.setPosition(...pos);
      g.connect(p);
      p.connect(this.dry);
      if (wet) p.connect(this.reverb);
    } else {
      g.connect(this.duck);
    }
    return g;
  }

  noise(t, dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.3, attack = 0.002, release = null, dest, brown = false, freqEnd } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brownBuf : this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (release ?? dur));
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 2);
    src.stop(t + (release ?? dur) + 0.05);
    return { src, f, g };
  }

  tone(t, dur, { freq = 440, type = 'sine', gain = 0.2, attack = 0.002, dest, freqEnd, detune = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }
  ok() { return !!this.ctx && this.enabled; }

  // ------------------------------------------------------------ ambience

  startAmbience() {
    const ctx = this.ctx;
    // Room tone: almost nothing, which is the point.
    const rt = ctx.createBufferSource();
    rt.buffer = this.brownBuf;
    rt.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 180;
    const rg = ctx.createGain();
    rg.gain.value = 0.05;
    rt.connect(rf).connect(rg).connect(this.duck);
    rt.start();

    // Wind at the window, round the old sashes.
    const draught = this.out([0.4, 2.3, ROOM.z0 - 0.1]);
    const ws = ctx.createBufferSource();
    ws.buffer = this.noiseBuf;
    ws.loop = true;
    const b1 = ctx.createBiquadFilter();
    b1.type = 'bandpass';
    b1.frequency.value = 420;
    b1.Q.value = 6;
    const b2 = ctx.createBiquadFilter();
    b2.type = 'bandpass';
    b2.frequency.value = 760;
    b2.Q.value = 14;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const wg = ctx.createGain();
    wg.gain.value = 0.0;
    const wg2 = ctx.createGain();
    wg2.gain.value = 0.25;
    ws.connect(b1).connect(wg);
    ws.connect(b2).connect(wg2).connect(wg);
    const rumble = ctx.createGain();
    rumble.gain.value = 0.6;
    ws.connect(lp).connect(rumble).connect(wg);
    wg.connect(draught);
    draught.gain.value = 1.4;
    ws.start();
    this.wind = { b1, b2, wg };
    const gust = () => {
      if (!this.ctx) return;
      const t = ctx.currentTime;
      const strength = 0.12 + Math.random() * 0.35;
      const len = 3 + Math.random() * 7;
      wg.gain.cancelScheduledValues(t);
      wg.gain.setTargetAtTime(strength, t, len * 0.3);
      wg.gain.setTargetAtTime(0.05 + Math.random() * 0.05, t + len * 0.6, len * 0.35);
      b1.frequency.setTargetAtTime(300 + Math.random() * 380, t, len * 0.4);
      b2.frequency.setTargetAtTime(620 + Math.random() * 420, t, len * 0.5);
      setTimeout(gust, (len + 2 + Math.random() * 9) * 1000);
    };
    gust();

    // The lamp's faint hum.
    const lamp = this.out([-0.35, 1.15, -1.2], { wet: false });
    lamp.gain.value = 0.012;
    [50, 100, 150].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = [1, 0.5, 0.25][i];
      o.connect(g).connect(lamp);
      o.start();
    });
    this.lampHum = lamp;
  }

  startClock() {
    const ctx = this.ctx;
    this.clockOut = this.out([2.62, 2.0, 3.0]);
    this.clockOut.gain.value = this.clockGainTarget;
    let next = ctx.currentTime + 0.5;
    let tock = false;
    // the pendulum is drawn from these: a beat every second from the origin, and a
    // hang of so many seconds at each skip or stop (clockPhase)
    this.clockOrigin = next;
    this.clockHolds = [];
    this.clockHeld = 0;
    let drop = 0;
    const sched = () => {
      if (!this.ctx) return;
      while (next < ctx.currentTime + 0.3) {
        if (drop > 0) {
          drop--;
        } else if (this.clockRunning) {
          if (this.clockLevel && !this.clockEven) {
            // too loud, and not quite even, worse at each step
            const j = [0, 0.07, 0.12, 0.18][this.clockLevel];
            this.tick(next + (Math.random() - 0.5) * j, tock, 0.75 + Math.random() * 0.55);
          } else this.tick(next, tock);
          tock = !tock;
          if (this.holdNext && this.catchNext) {
            // the escapement catches: a stutter on the same swing, then the hang
            this.tick(next + 0.11, tock, 0.7);
            this.catchNext = false;
          }
          if (this.holdNext) {
            // the pendulum hangs at the end of this swing; the next beats do not come
            drop = this.holdNext;
            this.clockHolds.push({ t: next, len: this.holdNext });
            this.holdNext = 0;
          }
        }
        next += 1.0;
      }
      setTimeout(sched, 100);
    };
    sched();
  }

  // Where the pendulum is, in beats since the clock started (null without sound):
  // it is at the end of a swing on every whole beat, when the tick sounds.
  clockPhase() {
    if (!this.ctx || this.clockOrigin === undefined) return null;
    const t = this.ctx.currentTime;
    let held = this.clockHeld;
    for (const h of this.clockHolds) held += Math.min(h.len, Math.max(0, t - h.t));
    // a hang long past is folded in
    while (this.clockHolds.length && t - this.clockHolds[0].t > this.clockHolds[0].len) {
      this.clockHeld += this.clockHolds[0].len;
      this.clockHolds.shift();
    }
    return t - this.clockOrigin - held;
  }

  tick(t, tock, k = 1) {
    const d = this.clockOut;
    this.noise(t, 0.035, { freq: tock ? 2600 : 3300, q: 9, gain: 0.5 * k, dest: d });
    this.tone(t, 0.05, { freq: tock ? 1350 : 1600, gain: 0.06 * k, dest: d });
    this.tone(t, 0.08, { freq: tock ? 380 : 430, gain: 0.08 * k, dest: d });
  }

  // How loud the clock ticks: 0 as it should, 1-3 the steps of the voortekenen leak.
  setClockLoud(level) {
    this.clockLevel = Number(level) || 0;
    this.clockGainTarget = [0.35, 1.6, 2.4, 3.2][this.clockLevel];
    if (this.clockOut) this.clockOut.gain.setTargetAtTime(this.clockGainTarget, this.now, 2);
  }

  // A single missed beat, as if the escapement caught: the pendulum hangs a second.
  skipBeat() {
    this.holdNext = Math.max(this.holdNext || 0, 1);
    this.catchNext = true;
  }

  // The clock stops for so many seconds, pendulum hanging, and comes back quiet.
  clockRest(sec) {
    this.holdNext = sec;
    this.catchNext = false;
    this.setClockLoud(0);
  }

  // One stroke of the gong, as the clock does when its hands are set.
  strikeOnce() {
    if (!this.ok()) return;
    this.strike(this.now + 0.05, 0.6);
  }

  // The wall clock's gong rod: inharmonic partials, a long decay.
  strike(t, gain = 0.5) {
    const d = this.clockOut;
    const f0 = 168;
    [[1, 0.5, 4.2], [2.02, 0.22, 2.8], [2.76, 0.2, 2.4], [5.4, 0.07, 1.3], [8.93, 0.035, 0.8]].forEach(([r, g, dur]) => {
      this.tone(t, dur, { freq: f0 * r, gain: g * gain, attack: 0.004, dest: d });
      this.tone(t, dur * 0.9, { freq: f0 * r * 1.003, gain: g * gain * 0.4, attack: 0.004, dest: d });
    });
    this.noise(t, 0.03, { freq: 2400, q: 2, gain: 0.12 * gain, dest: d });
  }

  // The hour; resolves when the last stroke has rung out a little.
  chime(count, gap = 1.5, gain = 0.6) {
    if (!this.ok()) return new Promise((r) => setTimeout(r, count * gap * 1000));
    const t = this.now + 0.1;
    for (let i = 0; i < count; i++) this.strike(t + i * gap, gain);
    return new Promise((r) => setTimeout(r, (count * gap + 0.6) * 1000));
  }

  // A key in the front-door lock, turned twice.
  keyTurn(pos) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(pos);
    this.noise(t, 0.25, { freq: 3200, q: 3, gain: 0.12, attack: 0.03, dest: d });
    this.noise(t + 0.45, 0.06, { freq: 1500, q: 2, gain: 0.3, dest: d });
    this.tone(t + 0.45, 0.2, { freq: 260, freqEnd: 170, gain: 0.25, dest: d });
    this.noise(t + 0.9, 0.06, { freq: 1500, q: 2, gain: 0.3, dest: d });
    this.tone(t + 0.9, 0.2, { freq: 240, freqEnd: 160, gain: 0.25, dest: d });
  }

  // The lamp's hum, which goes when the lamp goes.
  setLampHum(k) {
    if (this.lampHum) this.lampHum.gain.setTargetAtTime(0.012 * k, this.now, 0.4);
  }

  // ------------------------------------------------------------ one-shots

  // a card or an envelope in the hands; kind: what they do with it (SAMPLES)
  paper(pos, gain = 0.25, kind = 'take') {
    if (!this.ok() || this.sample(kind, pos, gain)) return;
    const t = this.now;
    const d = this.out(pos);
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.03 + Math.random() * 0.05);
      this.noise(tt, 0.06 + Math.random() * 0.08, { freq: 2500 + Math.random() * 3000, q: 0.8, gain: gain * (0.5 + Math.random() * 0.5), dest: d });
    }
    this.noise(t, 0.25, { type: 'highpass', freq: 1800, gain: gain * 0.4, attack: 0.05, dest: d });
  }

  cardSlide(pos, gain = 0.3, kind = 'place') {
    if (!this.ok() || this.sample(kind, pos, gain)) return;
    const t = this.now;
    const d = this.out(pos);
    this.noise(t, 0.32, { type: 'bandpass', freq: 3500, freqEnd: 1800, q: 0.6, gain, attack: 0.06, dest: d });
  }

  drawer(pos, open = true) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(pos);
    const len = 0.42;
    const { g } = this.noise(t, len, { type: 'bandpass', freq: open ? 520 : 620, q: 1.2, gain: 0.35, attack: 0.04, dest: d });
    // friction judder
    for (let i = 0; i < 9; i++) g.gain.setValueAtTime(0.18 + Math.random() * 0.25, t + 0.05 + i * 0.035);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    this.tone(t + len - 0.02, 0.18, { freq: 130, freqEnd: 70, gain: 0.35, dest: d });
    this.noise(t + len - 0.02, 0.08, { type: 'lowpass', freq: 900, gain: 0.3, dest: d });
  }

  // drawers knocking in their runners, n of them in quick succession
  rattle(pos, n = 1) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(pos);
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.03 + Math.random() * 0.04);
      this.tone(tt, 0.09, { freq: 170 + Math.random() * 60, freqEnd: 110, gain: 0.22, dest: d });
      this.noise(tt, 0.05, { type: 'bandpass', freq: 900 + Math.random() * 500, q: 1.5, gain: 0.2, dest: d });
    }
  }

  locked(pos) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(pos);
    for (let i = 0; i < 3; i++) {
      this.tone(t + i * 0.07, 0.07, { freq: 160 + Math.random() * 30, gain: 0.25, dest: d });
      this.noise(t + i * 0.07, 0.04, { freq: 2200, q: 5, gain: 0.18, dest: d });
    }
  }

  knock(pos, count = 3) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(pos);
    d.gain.value = 1.6;
    for (let i = 0; i < count; i++) {
      const tt = t + i * (0.42 + Math.random() * 0.06);
      this.tone(tt, 0.22, { freq: 92, freqEnd: 70, gain: 0.6, dest: d });
      this.noise(tt, 0.09, { type: 'lowpass', freq: 1100, gain: 0.5, dest: d });
      this.tone(tt, 0.12, { freq: 240, gain: 0.12, dest: d });
    }
  }

  key(space = false) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out([0.95, 0.9, -0.95], { wet: true });
    this.noise(t, 0.018, { type: 'highpass', freq: 2500, gain: space ? 0.2 : 0.35, dest: d });
    this.tone(t, 0.04, { freq: space ? 110 : 170, gain: 0.25, dest: d });
    this.tone(t + 0.008, 0.03, { freq: 2900 + Math.random() * 400, type: 'square', gain: 0.03, dest: d });
    // the type bar striking the platen
    if (!space) this.noise(t + 0.03, 0.025, { freq: 1600, q: 3, gain: 0.25, dest: d });
  }

  carriage(ding = true) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out([0.95, 0.95, -0.95]);
    if (ding) {
      const f0 = 2093;
      [[1, 0.5, 1.6], [2.76, 0.18, 0.9], [5.4, 0.08, 0.5], [8.9, 0.03, 0.3]].forEach(([m, g, dur]) =>
        this.tone(t, dur, { freq: f0 * m, gain: g * 0.35, dest: d }));
    }
    // ratchet of the return lever
    const n = 14;
    for (let i = 0; i < n; i++) {
      const tt = t + 0.12 + i * (0.022 + i * 0.0012);
      this.noise(tt, 0.012, { type: 'highpass', freq: 3000, gain: 0.18, dest: d });
    }
    this.noise(t + 0.12, 0.45, { type: 'bandpass', freq: 900, q: 0.8, gain: 0.12, attack: 0.05, dest: d });
    this.tone(t + 0.6, 0.12, { freq: 140, gain: 0.3, dest: d });
  }

  jam() {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out([0.95, 0.9, -0.95]);
    this.tone(t, 0.25, { freq: 95, freqEnd: 60, gain: 0.45, dest: d });
    for (let i = 0; i < 11; i++) {
      const tt = t + 0.04 + i * (0.018 + Math.random() * 0.02);
      this.noise(tt, 0.02, { freq: 1800 + Math.random() * 2500, q: 6, gain: 0.25, dest: d });
    }
    this.tone(t + 0.05, 0.35, { freq: 70, type: 'sawtooth', gain: 0.07, dest: d });
  }

  dialClick(pos) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(pos, { wet: false });
    this.noise(t, 0.015, { freq: 4200, q: 4, gain: 0.35, dest: d });
    this.tone(t, 0.02, { freq: 1900, gain: 0.05, dest: d });
  }

  clunk(pos) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(pos);
    this.tone(t, 0.25, { freq: 220, freqEnd: 140, gain: 0.35, dest: d });
    this.noise(t, 0.12, { freq: 1300, q: 2, gain: 0.35, dest: d });
    this.tone(t + 0.08, 0.5, { freq: 660, gain: 0.04, dest: d });
  }

  pinPush(pos) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(pos);
    this.noise(t, 0.02, { freq: 3500, q: 3, gain: 0.3, dest: d });
    this.noise(t + 0.02, 0.08, { type: 'lowpass', freq: 700, gain: 0.25, dest: d });
  }

  pinDrop(pos) {
    if (!this.ok()) return;
    const t = this.now + 0.45;
    const d = this.out(pos);
    [0, 0.14, 0.24, 0.3].forEach((dt, i) =>
      this.tone(t + dt, 0.06, { freq: 5200 - i * 300, gain: 0.07 / (i + 1), dest: d }));
  }

  step(pos) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(pos);
    this.tone(t, 0.14, { freq: 85 + Math.random() * 20, freqEnd: 50, gain: 0.32, dest: d });
    this.noise(t, 0.09, { type: 'lowpass', freq: 500 + Math.random() * 300, gain: 0.18, dest: d });
    if (Math.random() < 0.22) this.creak(pos, 0.05);
  }

  creak(pos, gain = 0.08) {
    if (!this.ok()) return;
    const t = this.now + Math.random() * 0.05;
    const d = this.out(pos);
    const len = 0.3 + Math.random() * 0.5;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const f0 = 180 + Math.random() * 200;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * (0.8 + Math.random() * 0.5), t + len);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 600;
    bp.Q.value = 4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    // stick-slip
    for (let i = 0; i < len * 30; i++) g.gain.setValueAtTime(Math.random() * gain, t + i / 30);
    g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(bp).connect(g).connect(d);
    o.start(t);
    o.stop(t + len + 0.05);
  }

  doorCreak(pos) {
    if (!this.ok()) return;
    for (let i = 0; i < 4; i++) setTimeout(() => this.creak(pos, 0.16), i * 520);
  }

  scratch(pos) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(pos);
    for (let i = 0; i < 3; i++) {
      this.noise(t + i * 0.5, 0.35, { freq: 2400, q: 2, gain: 0.08, attack: 0.1, dest: d });
    }
  }

  ceilingSteps() {
    if (!this.ok()) return;
    const t = this.now;
    for (let i = 0; i < 6; i++) {
      const z = -5 + i * 1.3;
      const d = this.out([0.5, 3.6, z]);
      this.tone(t + i * 0.72, 0.2, { freq: 60, freqEnd: 40, gain: 0.35, dest: d });
      this.noise(t + i * 0.72, 0.12, { type: 'lowpass', freq: 220, gain: 0.25, dest: d });
    }
  }

  shuffle(pos) {
    if (!this.ok() || this.sample('fan', pos, 0.3)) return;
    const t = this.now;
    const d = this.out(pos);
    for (let i = 0; i < 26; i++) {
      this.noise(t + i * 0.022 + Math.random() * 0.01, 0.015, { freq: 3000 + Math.random() * 1500, q: 1.5, gain: 0.12, dest: d });
    }
    this.noise(t + 0.62, 0.05, { type: 'lowpass', freq: 1200, gain: 0.12, dest: d });
  }

  breath(pos) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(pos);
    for (let i = 0; i < 6; i++) {
      this.noise(t + i * 0.42, 0.28, { freq: 800, q: 1.4, gain: 0.05, attack: 0.08, dest: d });
    }
  }

  // A finger drawn over wet glass: short squeaks, a stroke at a time.
  fingerOnGlass(pos) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(pos);
    for (let i = 0; i < 7; i++) {
      const at = t + i * 0.32 + Math.random() * 0.1, f = 1400 + Math.random() * 900;
      this.tone(at, 0.16 + Math.random() * 0.1, { freq: f, freqEnd: f * (0.8 + Math.random() * 0.4), type: 'triangle', gain: 0.035, attack: 0.02, dest: d });
      this.noise(at, 0.18, { freq: f * 2, q: 6, gain: 0.03, attack: 0.02, dest: d });
    }
  }

  // Footsteps going away over gravel, outside the door: from pos, along dir, fading.
  gravelAway(pos, dir = [0, 0, 1], steps = 9) {
    if (!this.ok()) return;
    const t = this.now + 0.2;
    for (let i = 0; i < steps; i++) {
      const p = [pos[0] + dir[0] * i * 0.7, pos[1], pos[2] + dir[2] * i * 0.7];
      const d = this.out(p);
      const at = t + i * (0.62 + Math.random() * 0.08);
      const k = 0.9 * (1 - i / (steps + 2));
      // a crunch: many tiny stones under a heel, then the sole
      for (let j = 0; j < 7; j++) {
        this.noise(at + j * 0.012 + Math.random() * 0.01, 0.02, { freq: 1800 + Math.random() * 2400, q: 2, gain: 0.09 * k, dest: d });
      }
      this.noise(at + 0.05, 0.12, { type: 'lowpass', freq: 700, gain: 0.16 * k, dest: d });
    }
  }

  // Something heavy going along the ledge outside: claws on zinc, a breath at the glass.
  prowl(pos, k = 1) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(pos);
    const n = Math.round(10 * k);
    for (let i = 0; i < n; i++) {
      const at = t + i * 0.3 + Math.random() * 0.08;
      this.noise(at, 0.02, { freq: 2200 + Math.random() * 1600, q: 3, gain: 0.26, dest: d });
      if (i % 2) this.noise(at + 0.03, 0.06, { type: 'lowpass', freq: 300, gain: 0.34, dest: d });
    }
    for (let i = 0; i < 3; i++) this.noise(t + 0.6 + i * 0.9 * k, 0.45, { freq: 520, q: 1.2, gain: 0.2, attack: 0.12, dest: d });
  }

  // It stops at the glass and breathes on it: slow, low, close.
  snuffle(pos) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(pos);
    for (let i = 0; i < 3; i++) {
      this.noise(t + i * 0.8, 0.5, { type: 'lowpass', freq: 420, gain: 0.3, attack: 0.15, brown: true, dest: d });
      this.noise(t + i * 0.8 + 0.05, 0.12, { freq: 1100, q: 2, gain: 0.1, dest: d });
    }
    this.tone(t + 0.3, 1.6, { freq: 62, freqEnd: 55, type: 'sawtooth', gain: 0.035, attack: 0.4, dest: d });
  }

  whisperAir(pos) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(pos);
    this.noise(t, 4, { freq: 1300, q: 18, gain: 0.05, attack: 1.6, release: 4, dest: d });
  }

  swell() {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(null);
    [73.4, 110, 146.8, 174.6, 220].forEach((f, i) => {
      [-6, 6].forEach((det) => {
        const o = this.ctx.createOscillator();
        o.type = i < 2 ? 'sine' : 'triangle';
        o.frequency.value = f;
        o.detune.value = det;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.018 / (1 + i * 0.4), t + 1.8);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 7);
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        o.connect(lp).connect(g).connect(d);
        o.start(t);
        o.stop(t + 7.2);
      });
    });
  }

  doorSlam(pos) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out(pos);
    d.gain.value = 1.4;
    this.tone(t, 0.5, { freq: 70, freqEnd: 40, gain: 0.7, dest: d });
    this.noise(t, 0.3, { type: 'lowpass', freq: 800, gain: 0.6, dest: d });
    setTimeout(() => this.clunk(pos), 700);
  }
}
