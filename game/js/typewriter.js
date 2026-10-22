// The typewriter is the lock: type an answer and the carriage either returns
// with a ding or jams.
import * as THREE from 'three';
import { makeCanvas, canvasTexture, paperCanvas } from './textures.js';
import { TABLE } from './room.js';

const TYPE = '"Special Elite", "Courier New", monospace';
export const TW_POS = new THREE.Vector3(TABLE.x + 0.6, TABLE.y, TABLE.z + 0.02);
const PW = 1024, PH = 1240;
const PITCH = 0.0042; // carriage travel per character, metres

export class Typewriter {
  constructor(M, sc = {}) {
    this.group = new THREE.Group();
    this.group.position.copy(TW_POS);
    this.group.rotation.y = -0.18;
    this.lines = [];
    this.current = '';
    this.prefix = '';
    this.carriageX = 0;
    this.carriageTarget = 0;
    this.shake = 0;
    this.strikeT = 1;
    this.build(M, sc);
    this.redraw();
  }

  build(M, sc) {
    const g = this.group;
    // the body is modelled in Blender; keys, type basket and carriage move, so they are made here
    g.updateMatrixWorld(true);
    if (sc.typewriter_body) g.attach(sc.typewriter_body);
    // keyboard: four stepped rows of round keys on wire stems
    const keyRows = ['234567890-', 'QWERTYUIOP', 'ASDFGHJKL;', 'ZXCVBNM,./'];
    const keyTex = this.keyTextures();
    this.keys = {};
    keyRows.forEach((row, ri) => {
      [...row].forEach((ch, ci) => {
        const k = new THREE.Group();
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.03, 4), M.iron);
        stem.position.y = -0.015;
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.006, 18), M.brass);
        const top = new THREE.Mesh(new THREE.CircleGeometry(0.0092, 18), new THREE.MeshStandardMaterial({ map: keyTex[ch], roughness: 0.3 }));
        top.rotation.x = -Math.PI / 2;
        top.position.y = 0.0032;
        k.add(stem, rim, top);
        const x = -0.15 + ci * 0.03 + ri * 0.008;
        const z = 0.14 + (3 - ri) * -0.026 + 0.075;
        // stepped like a real keyboard: the number row sits highest, at the back
        k.position.set(x, 0.07 + (3 - ri) * 0.008, z - 0.05);
        k.userData.base = k.position.y;
        g.add(k);
        this.keys[ch] = k;
      });
    });
    const spaceBar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.008, 0.014), M.enamel);
    spaceBar.position.set(0.0, 0.058, 0.19);
    g.add(spaceBar);
    this.spaceBar = spaceBar;
    // type basket: fan of thin bars under the platen
    const basket = new THREE.Group();
    for (let i = 0; i < 28; i++) {
      const a = -1.2 + (i / 27) * 2.4;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.002, 0.07), M.iron);
      bar.position.set(Math.sin(a) * 0.07, 0.105, -0.03 + Math.cos(a) * 0.035);
      bar.rotation.y = a;
      basket.add(bar);
    }
    g.add(basket);
    this.strikeBar = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.08), M.iron);
    this.strikeBar.geometry.translate(0, 0, 0.04);
    this.strikeBar.position.set(0, 0.11, 0.0);
    g.add(this.strikeBar);

    // carriage: platen, knobs, paper, return lever
    const car = (this.carriage = new THREE.Group());
    car.position.set(0, 0.165, -0.1);
    const platen = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.46, 28), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.75 }));
    platen.rotation.z = Math.PI / 2;
    platen.castShadow = true;
    car.add(platen);
    for (const s of [-1, 1]) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 20), M.enamel);
      knob.rotation.z = Math.PI / 2;
      knob.position.x = s * 0.25;
      car.add(knob);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.08), M.enamel);
      rail.position.set(s * 0.22, -0.03, 0);
      car.add(rail);
    }
    const bail = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.44, 8), M.brass);
    bail.rotation.z = Math.PI / 2;
    bail.position.set(0, 0.012, 0.034);
    car.add(bail);
    const lever = new THREE.Group();
    const l1 = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 8), M.brass);
    l1.rotation.x = Math.PI / 2 - 0.4;
    l1.position.set(0, 0.02, 0.03);
    const l2 = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), M.brass);
    l2.position.set(0, 0.035, 0.066);
    lever.add(l1, l2);
    lever.position.set(-0.27, 0.0, 0.0);
    car.add(lever);
    this.lever = lever;
    // paper, rising from the platen and leaning back
    this.paperCanvas = makeCanvas(PW, PH);
    this.paperTex = canvasTexture(this.paperCanvas);
    const paperGeo = new THREE.PlaneGeometry(0.215, 0.26, 1, 12);
    // curl the bottom of the sheet around the platen
    const pos = paperGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = (y + 0.13) / 0.26; // 0 at bottom
      if (t < 0.18) {
        const a = (0.18 - t) * 5.5;
        pos.setZ(i, -Math.sin(a) * 0.03 + 0);
        pos.setY(i, y + (1 - Math.cos(a)) * 0.01);
      }
    }
    paperGeo.computeVertexNormals();
    this.paper = new THREE.Mesh(paperGeo, new THREE.MeshStandardMaterial({ map: this.paperTex, roughness: 0.92, side: THREE.DoubleSide }));
    this.paper.position.set(0, 0.125, -0.02);
    this.paper.rotation.x = -0.32;
    this.paper.castShadow = true;
    car.add(this.paper);
    g.add(car);
    // ribbon spools
    for (const s of [-1, 1]) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 20), M.iron);
      sp.position.set(s * 0.12, 0.135, -0.02);
      g.add(sp);
    }
  }

  keyTextures() {
    const map = {};
    const chars = '234567890-QWERTYUIOPASDFGHJKL;ZXCVBNM,./';
    for (const ch of chars) {
      const c = makeCanvas(64, 64);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#e8e0c8';
      ctx.beginPath(); ctx.arc(32, 32, 32, 0, 7); ctx.fill();
      ctx.fillStyle = '#121212';
      ctx.font = `bold 34px ${TYPE}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, 32, 35);
      ctx.strokeStyle = '#0a0a0a';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(32, 32, 29, 0, 7); ctx.stroke();
      map[ch] = canvasTexture(c);
    }
    return map;
  }

  // ------------------------------------------------------------- paper

  setHeader(lines) {
    this.header = lines;
    this.redraw();
  }

  newLine(prefix = '', blank = false) {
    if (this.current || this.prefix || blank) this.lines.push({ text: this.prefix + this.current, struck: false });
    this.prefix = prefix;
    this.current = '';
    this.carriageTarget = 0;
    this.redraw();
  }

  typeChar(ch) {
    if ((this.prefix + this.current).length > 38) return false;
    this.current += ch;
    this.carriageTarget = -(this.prefix.length + this.current.length) * PITCH;
    const key = this.keys[ch.toUpperCase()];
    if (key) key.userData.press = 1;
    else if (ch === ' ') this.spacePress = 1;
    this.strikeT = 0;
    this.redraw();
    return true;
  }

  backspace() {
    if (!this.current) return;
    this.current = this.current.slice(0, -1);
    this.carriageTarget = -(this.prefix.length + this.current.length) * PITCH;
    this.redraw();
  }

  struck() {
    this.lines.push({ text: this.prefix + this.current, strikeFrom: this.prefix.length, struck: true });
    this.current = '';
    this.prefix = '';
    this.redraw();
  }

  accept(note) {
    this.lines.push({ text: this.prefix + this.current, struck: false, ok: true, note });
    this.current = '';
    this.prefix = '';
    this.carriageTarget = 0;
    this.redraw();
  }

  jam() { this.shake = 1; }

  // The machine types by itself: lines of text, a character at a time, the carriage
  // returning at each line's end. onKey(ch) and onLine() for the sound; onDone at the end.
  autoType(lines, { cps = 11, onKey, onLine, onDone, keep = false } = {}) {
    // whatever it was still typing is typed out at once
    if (keep && this.auto) this.finishAuto();
    this.auto = { lines: lines.slice(), line: 0, i: 0, t: 0, cps, onKey, onLine, onDone };
    if (keep) this.newLine('');
    else {
      this.lines = [];
      this.prefix = '';
      this.current = '';
      this.carriageTarget = 0;
    }
    this.redraw();
  }

  get autoTyping() { return !!this.auto; }

  finishAuto() {
    const a = this.auto;
    if (!a) return;
    this.auto = null;
    for (let l = a.line; l < a.lines.length; l++) {
      for (const ch of a.lines[l].slice(l === a.line ? a.i : 0)) this.typeChar(ch);
      if (l < a.lines.length - 1) this.newLine('', true);
    }
    a.onDone?.();
  }

  // a text broken into lines the paper takes
  static wrap(text, width = 36) {
    const out = [];
    let line = '';
    for (const w of String(text).split(/\s+/).filter(Boolean)) {
      if ((line + ' ' + w).trim().length > width && line) {
        out.push(line);
        line = w;
      } else line = (line + ' ' + w).trim();
    }
    if (line) out.push(line);
    return out;
  }

  stepAuto(dt) {
    const a = this.auto;
    a.t += dt;
    while (this.auto && a.t > 1 / a.cps) {
      a.t -= 1 / a.cps;
      const text = a.lines[a.line];
      if (text === undefined) {
        this.auto = null;
        a.onDone?.();
        return;
      }
      if (a.i < text.length) {
        const ch = text[a.i++];
        this.typeChar(ch);
        a.onKey?.(ch);
      } else {
        // end of the line: the carriage goes back, a little pause
        a.line++;
        a.i = 0;
        a.t -= 0.5;
        if (a.line < a.lines.length) this.newLine('', true);
        a.onLine?.();
      }
    }
  }

  redraw() {
    const c = this.paperCanvas;
    const ctx = c.getContext('2d');
    ctx.drawImage(paperCanvas(PW, PH, { tone: [240, 234, 218], age: 0.3, seed: 9 }), 0, 0);
    ctx.textBaseline = 'alphabetic';
    const left = 96;
    let y = 150;
    const lh = 62;
    ctx.fillStyle = 'rgba(28,26,24,0.9)';
    ctx.font = `46px ${TYPE}`;
    for (const h of this.header || []) {
      ctx.fillText(h, left, y);
      y += lh;
    }
    if (this.header && this.header.length) y += lh * 0.4;
    const all = [...this.lines, { text: this.prefix + this.current, cursor: true }];
    const maxLines = Math.floor((PH - y - 60) / lh);
    const visible = all.slice(Math.max(0, all.length - maxLines));
    for (const l of visible) {
      ctx.fillStyle = l.ok ? 'rgba(20,18,16,0.95)' : 'rgba(28,26,24,0.88)';
      ctx.fillText(l.text, left, y);
      if (l.struck) {
        // over-typed with x's, the way it was done
        const pre = l.text.slice(0, l.strikeFrom || 0);
        const ans = l.text.slice(l.strikeFrom || 0);
        const x0 = left + ctx.measureText(pre).width;
        ctx.fillStyle = 'rgba(28,26,24,0.75)';
        ctx.fillText('x'.repeat(Math.max(1, ans.length)), x0, y);
      }
      if (l.ok && l.note) {
        ctx.font = `34px "Homemade Apple", cursive`;
        ctx.fillStyle = 'rgba(160,34,26,0.85)';
        ctx.fillText(l.note, left + ctx.measureText(l.text).width + 330, y + 4);
        ctx.font = `46px ${TYPE}`;
      }
      if (l.cursor) {
        const w = ctx.measureText(l.text).width;
        ctx.fillStyle = 'rgba(160,34,26,0.55)';
        ctx.fillRect(left + w + 2, y + 8, 26, 4);
      }
      y += lh;
    }
    this.paperTex.needsUpdate = true;
  }

  update(dt, time) {
    if (this.auto) this.stepAuto(dt);
    this.carriageX += (this.carriageTarget - this.carriageX) * Math.min(1, dt * (this.carriageTarget === 0 ? 7 : 22));
    this.carriage.position.x = this.carriageX + 0.08;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.4);
      this.carriage.position.x += Math.sin(time * 90) * 0.004 * this.shake;
      this.carriage.rotation.x = Math.sin(time * 70) * 0.02 * this.shake;
    } else this.carriage.rotation.x = 0;
    for (const k of Object.values(this.keys)) {
      if (k.userData.press) {
        k.userData.press = Math.max(0, k.userData.press - dt * 9);
        k.position.y = k.userData.base - 0.006 * Math.sin(k.userData.press * Math.PI);
      }
    }
    if (this.spacePress) {
      this.spacePress = Math.max(0, this.spacePress - dt * 9);
      this.spaceBar.position.y = 0.034 - 0.004 * Math.sin(this.spacePress * Math.PI);
    }
    if (this.strikeT < 1) {
      this.strikeT = Math.min(1, this.strikeT + dt * 14);
      this.strikeBar.rotation.x = -Math.sin(this.strikeT * Math.PI) * 1.1;
    }
  }

  get paperWorld() {
    return this.paper.getWorldPosition(new THREE.Vector3());
  }
}
