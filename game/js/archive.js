// The archive behind the game (NACHTDIENST_PUZZLES.md section 3h): secondary to the game and
// never in its way. Behind the divider of a puzzle drawer the drawer is full of the real
// cards of that cabinet's stories, on grey stock so that none can be taken for a puzzle
// card; the cards filed tonight stand cream just behind the divider. Only the drawer that is
// slid out holds them: one set of instanced cards and tabs, moved into whichever drawer is
// open. The text of a cabinet's cards is fetched the first time one of its drawers opens.
import * as THREE from 'three';
import { CAB } from './room.js';
import { makeCanvas, canvasTexture } from './textures.js';

// tabs shown in a drawer at most (the cabinet's records, a third per drawer, evenly)
const MAX_TABS = 300;
const CARD = { h: 0.15, w: 0.27, t: 0.0011 };
const TAB = { h: 0.018, w: 0.06 };
// the divider stands this far behind the drawer's front; the archive behind it to the back
const DIVIDER_X = -0.07;
// the divider is a guide card, taller than the cards, so it shows over the drawer's front
const DIVIDER_H = 0.235;
const BACK_X = -0.465;
const FLOOR = -CAB.dh / 2 + 0.016;

export class Archive {
  constructor() {
    this.chunks = new Map();
    this.data = new Map();
    this.index = null;
    this.group = new THREE.Group();
    this.group.visible = false;
    // grey stock, a little blue so it stays grey under the warm lamp
    const grey = new THREE.MeshStandardMaterial({ color: 0x8e949a, roughness: 0.95, emissive: 0x111316 });
    const greyTab = new THREE.MeshStandardMaterial({ color: 0x7c8288, roughness: 0.95, emissive: 0x111316 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.95, emissive: 0x2c2820 });
    const card = new THREE.BoxGeometry(CARD.t, CARD.h, CARD.w);
    const tab = new THREE.BoxGeometry(CARD.t, TAB.h, TAB.w);
    // the archive: grey cards and their tabs; tonight's: cream
    this.cards = new THREE.InstancedMesh(card, grey, MAX_TABS);
    this.tabs = new THREE.InstancedMesh(tab, greyTab, MAX_TABS);
    this.ours = new THREE.InstancedMesh(card, cream, 12);
    this.ourTabs = new THREE.InstancedMesh(tab, cream, 12);
    for (const m of [this.cards, this.tabs, this.ours, this.ourTabs]) {
      m.count = 0;
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    }
    this.cards.userData.kind = this.tabs.userData.kind = 'archive';
    this.ours.userData.kind = this.ourTabs.userData.kind = 'ours';
    // the divider: brown pressboard, J.J.V.'s pencil on the first drawer's
    const board = new THREE.MeshStandardMaterial({ color: 0x7c5c38, roughness: 0.9 });
    this.divider = new THREE.Mesh(new THREE.BoxGeometry(0.003, DIVIDER_H, CARD.w + 0.02), board);
    this.divider.position.set(DIVIDER_X, FLOOR + DIVIDER_H / 2, 0);
    this.group.add(this.divider);
    this.noteCanvas = makeCanvas(1024, 328);
    this.noteTex = canvasTexture(this.noteCanvas);
    this.note = new THREE.Mesh(new THREE.PlaneGeometry(CARD.w, CARD.w * 0.32),
      new THREE.MeshStandardMaterial({ map: this.noteTex, transparent: true, roughness: 1, emissive: 0x201810, emissiveMap: this.noteTex }));
    this.note.rotation.y = Math.PI / 2;
    this.note.position.set(DIVIDER_X + 0.0022, FLOOR + DIVIDER_H - CARD.w * 0.18, 0);
    this.group.add(this.note);
    // what each instance shows: indices into the cabinet's records
    this.shown = [];
    this.oursKeys = [];
    this.cid = null;
  }

  async loadIndex() {
    if (!this.index) {
      try { this.index = await (await fetch('data/archive/index.json')).json(); } catch { this.index = { counts: {}, total: 0, url: '' }; }
    }
    return this.index;
  }

  // a cabinet's cards, fetched once
  load(cid) {
    if (!this.chunks.has(cid)) {
      const t0 = performance.now();
      this.chunks.set(cid, fetch(`data/archive/cabinet-${cid}.json`).then((r) => r.json()).then((d) => {
        this.data.set(cid, d);
        this.loadMs = performance.now() - t0;
        return d;
      }).catch(() => []));
    }
    return this.chunks.get(cid);
  }

  record(cid, idx) { return this.data.get(cid)?.[idx] || null; }

  // the records drawer j (0-2) of a cabinet shows: its third of them, evenly spread
  slice(cid, j) {
    const d = this.data.get(cid);
    if (!d?.length) return [];
    const a = Math.floor((j * d.length) / 3), b = Math.floor(((j + 1) * d.length) / 3);
    const n = b - a, k = Math.min(n, MAX_TABS);
    return Array.from({ length: k }, (_, i) => a + Math.floor((i * n) / k));
  }

  // Into the drawer that is slid out: the divider at the front, tonight's cards (ours, keys)
  // just behind it, the archive behind them to the back. note: J.J.V.'s pencil on the divider.
  showIn(dg, { cid, j, ours = [], note = null }) {
    dg.add(this.group);
    this.group.visible = true;
    this.cid = cid;
    this.shown = this.slice(cid, j);
    this.oursKeys = ours.slice(0, 12);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const place = (mesh, i, x, y, z, lean) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), lean);
      p.set(x, y, z);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    };
    const lean = (i) => 0.1 + (((i * 7919) % 13) / 13 - 0.5) * 0.06;
    const tabZ = (i) => [-0.09, -0.03, 0.03, 0.09][i % 4];
    let x = DIVIDER_X - 0.006;
    this.oursKeys.forEach((_, i) => {
      place(this.ours, i, x, FLOOR + CARD.h / 2, 0, lean(i));
      place(this.ourTabs, i, x - Math.sin(lean(i)) * CARD.h / 2, FLOOR + CARD.h + TAB.h / 2 - 0.002, tabZ(i + 1), lean(i));
      x -= 0.004;
    });
    this.ours.count = this.ourTabs.count = this.oursKeys.length;
    const n = this.shown.length;
    const gap = n ? Math.max(CARD.t * 1.1, (x - 0.004 - BACK_X) / n) : 0;
    for (let i = 0; i < n; i++) {
      const xi = x - 0.004 - i * gap;
      place(this.cards, i, xi, FLOOR + CARD.h / 2, 0, lean(i));
      place(this.tabs, i, xi - Math.sin(lean(i)) * CARD.h / 2, FLOOR + CARD.h + TAB.h / 2 - 0.002, tabZ(i), lean(i));
    }
    this.cards.count = this.tabs.count = n;
    for (const mesh of [this.cards, this.tabs, this.ours, this.ourTabs]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    this.drawNote(note);
  }

  hide() {
    this.group.visible = false;
    this.group.removeFromParent();
    this.cid = null;
  }

  // what a ray hit in the drawer: { kind: 'archive', idx } or { kind: 'ours', key }
  at(hit) {
    const k = hit?.object?.userData.kind;
    if (k === 'archive' && hit.instanceId < this.shown.length) return { kind: k, idx: this.shown[hit.instanceId] };
    if (k === 'ours' && hit.instanceId < this.oursKeys.length) return { kind: k, key: this.oursKeys[hit.instanceId] };
    return null;
  }

  drawNote(text) {
    const c = this.noteCanvas, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    this.note.visible = !!text;
    if (text) {
      ctx.save();
      ctx.translate(60, 130);
      ctx.rotate(-0.04);
      ctx.fillStyle = 'rgba(232,224,204,0.92)';
      ctx.font = '58px "Homemade Apple", cursive';
      const words = text.split(' ');
      let line = '', y = 0;
      for (const wd of words) {
        const t = line ? `${line} ${wd}` : wd;
        if (ctx.measureText(t).width > 900 && line) { ctx.fillText(line, 0, y); line = wd; y += 92; } else line = t;
      }
      ctx.fillText(line, 0, y);
      ctx.restore();
    }
    this.noteTex.needsUpdate = true;
  }
}
