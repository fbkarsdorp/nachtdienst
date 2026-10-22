// The game: one night shift, played from a bundle (NACHTDIENST_PUZZLES.md).
// Four cabinets of three drawers: two card puzzles and a room lock (the clock, the
// window, the door, the typewriter). A drawer goes shut -> open -> solved -> filed:
// solving its lock is knowing, inserting its cards into the archive and shutting it is
// filing, and only filing counts. Cabinet 1 comes first; its misfiled card opens the
// next cabinet, and so on along the chain, the last through the slot of cabinet 5.
// Each room lock turns on one number, and that number is its cabinet's digit; the four
// digits open cabinet 5. A cabinet filed stops its leak and plays its enactment.
// Cards never fly about on their own (sections 3b, 3g): a drawer's puzzle cards come in a
// manila envelope clipped to its front; you carry the envelope to the table, open it, and the
// cards stand in the tray there; you lay up to four of them on the table and carry one in
// your hand. When the lock opens they slide back into the envelope; you carry it to its
// drawer, where they are inserted into the archive behind the divider, and the emptied
// envelope goes onto the spike on the table. Behind the dividers is the real archive (3h).
import * as THREE from 'three';
import { CardObj, CARD_SIZE, CARD_PACE } from './cards3d.js';
import { spring } from './motion.js';
import { opens, normalize, haversine, compass, keyNumber } from './bundle.js';
import { TABLE, FAMILY_ORDER, ROOM, CAB, CABINET_Z, LABEL_GLOW, CLOSED, LAMP_POS, windowWriting } from './room.js';
import { drawFinal } from './cardface.js';
import { KIT_POS, BAY_POS, BAY_DEPTH } from './tablekit.js';
import { Archive } from './archive.js';
import { fixed, release } from './textures.js';

// cards lie on the leather, which stands 2 mm proud of the top, above the shadow catcher
const LIE = 0.0032;
// the clock: a quarter past nine, then real time, plus what the hints cost
const START_MIN = 21 * 60 + 15;
const HINT_MIN = [2, 4, 8];
// standing at the door this long, with four cabinets done and the fifth shut
const DOOR_WAIT = 60;
const NOTE = 'note';
const FIVE = 'five';

export const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

// Tonight is today's date, in 1983; the card in cabinet 5 is dated tomorrow.
export const YEAR = 1983;
export function night(now = new Date()) {
  const d = new Date(YEAR, now.getMonth(), now.getDate());
  const t = new Date(YEAR, now.getMonth(), now.getDate() + 1);
  const long = (x) => `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
  return {
    date: d, long: long(d), weekday: `${DAYS[d.getDay()]} ${long(d)}`, tomorrow: long(t),
    session: `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const Q_IN = () => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
const Q_FLAT = (yaw = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, yaw));
// a drawer shuts by itself this long after its envelope's cards went in (or on a click)
const AUTO_SHUT = 1.5;
// a clock hand left on an hour this long is a setting
const HAND_SET = 2;
const DESK = 'desk';
// the table has room for four cards besides the envelope's bay
const TABLE_MAX = 4;
// the four places for cards, two by two, right of the bay
const SLOTS = { x: [TABLE.x - 0.03, TABLE.x + 0.26], z: [TABLE.z + 0.34, TABLE.z + 0.15] };
// a card standing in the tray (or in a drawer) faces its front (+x in it)
const Q_STAND = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
const Z_AXIS = new THREE.Vector3(0, 0, 1);
// The lens: 52 degrees high on a wide screen. On a screen held upright the view keeps
// its width instead (58 degrees across), and the picture sits a little high, so the
// floor below it is free for the controls and the typing keyboard.
const FOV = 52;
const UPRIGHT_ACROSS = 58;
const UPRIGHT_LIFT = 0.18;

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx);
    const B = this.bundle;
    this.F = B.frame;
    this.night = night();
    this.state = {
      name: '', ms: 0, pen: 0, hints: 0, hintLv: {}, drawers: {}, unlocked: [1], words: [], labels: {}, fills: {},
      current: null, fiveOpen: false, deskOut: false, deskFiled: false, wallOffset: 0, damp: {}, trail: {},
      digitNote: {}, reacted: [],
      // section 3c: found cards brought to the table, the crumpled one's state, the card on
      // the floor by the door, and room locks woken before their drawer (3f)
      foundDone: {}, crumple: {}, floor: null, early: {},
      // sections 3b, 3h: the envelopes on the spike in order, whether the one out is open, the
      // cards read tonight
      spiked: [], envOpen: false, readLog: [],
    };
    // section 3b: each drawer shut (absent), open, solved or filed
    this.dstate = new Map();
    // a drawer whose lock has opened (solved or filed), and one that is filed
    this.solved = new Set();
    this.filed = new Set();
    this.unlocked = new Set([1]);
    // drawers by id ('2-3'), with their cabinet, place in it, and 3D drawer
    this.drawers = new Map();
    this.cardInfo = new Map();
    for (const c of B.cabinets) {
      if (c.id === 5) continue;
      c.drawers.forEach((d, j) => {
        const dg = this.cabinets[c.id - 1].drawers.find((g) => g.userData.kind === 'puzzle' && g.userData.slot === j);
        const e = { d, cab: c, j, dg };
        this.drawers.set(d.id, e);
        if (dg) dg.userData.entry = e;
        for (const card of d.cards) this.cardInfo.set(`${d.id}/${card.id}`, { e, card });
      });
    }
    // section 3f: which cabinet is played second, third, fourth is fixed by the chain (one
    // cabinet at a time); section 3c: in each but the first, one card of drawer 1 lies elsewhere
    this.foundAt = this.planFound();
    this.found = new Map();
    for (const e of this.drawers.values()) {
      const fc = e.d.found_card;
      if (fc) this.found.set(`${e.d.id}/${fc.card}`, { loc: this.foundAt[e.cab.id], e });
    }
    // the desk card arrives with cabinet 4's enactment, and goes into any drawer
    this.cardInfo.set(DESK, { e: { d: { id: DESK, cards: [], hints: [], note: '' }, cab: null },
      card: { id: DESK, role: 'desk', home: 'any', render: B.frame.card_desk } });
    this.cards = new Map();
    this.tableCards = [];
    this.loose = new Map();
    this.flying = new Set();
    this.reading = null;
    this.held = null;
    // sections 3b, 3g: the envelope that is out ({ e, phase, open, sealed }), the cards
    // standing in the tray front to back, the drawers a card of which has been read, the
    // card the pointer is over in the tray
    this.env = null;
    this.inBay = [];
    this.wasRead = new Set();
    this.bayHover = null;
    // section 3h: the archive behind the dividers, and the drawer slid out to look in it
    this.archive = new Archive();
    this.browsing = null;
    this.hots = [];
    this.drag = null;
    this.typing = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(-9, -9);
    this.pointerPx = [0, 0];
    this.pointerMoved = false;
    this.hover = null;
    this.hoverTarget = null;
    this.glancing = false;
    this.fovTween = null;
    this.fitView();
    // a cold light where something happens during a glance; always in the scene, so no recompile
    this.glanceLight = new THREE.PointLight(0xaabbd6, 0, 3.2, 2);
    this.glanceLightTarget = 0;
    this.scene.add(this.glanceLight);
    this.morningLight = new THREE.PointLight(0xc4cad4, 0, 9, 1.6);
    this.morningLight.position.set(0, 1.9, ROOM.z1 + 1.6);
    this.morningLightTarget = 0;
    this.scene.add(this.morningLight);
    this.running = false;
    this.finished = false;
    this.clockSet = null;
    this.clockShown = '';
    this.doorTime = 0;
    this.oneDrawer = this.cabinets[CLOSED].drawers.find((g) => g.userData.one);
    this.setupRoomLocks();
    this.lampParts = ['lamp_body', 'lamp_shade', 'lamp_lining', 'lamp_trim', 'lamp_bulb']
      .map((n) => this.sc[n]).filter(Boolean).map((o) => ({ o, x: o.position.x, rz: o.rotation.z }));
    this.lampWobble = 0;
    this.setupObstacles();
    this.setupHotspots();
    this.setupInput();
    this.rails.onArrive = (name) => this.arrived(name);
    for (const e of this.drawers.values()) this.relabel(e);
  }

  get displayName() { return this.state.name || 'de nieuwe assistent'; }
  // 1 for the first cabinet played, 2 for the second, ...
  nth(cid) { return this.bundle.chain.indexOf(cid) + 1; }
  // a card of drawer 1 that is still lying somewhere in the room
  isOut(key) { const f = this.found.get(key); return !!f && !f.floor && !this.state.foundDone[key]; }

  // where each cabinet's missing card is, by the order it is played (section 3f), the same
  // every time for a seed: the 2nd on the chair or under the lamp, the 3rd in the coat or the
  // typewriter (not the typewriter when it is a room lock already typing), the 4th in the bin
  planFound() {
    const B = this.bundle;
    let h = 7;
    for (const ch of String(B.seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const pick = (a) => a[(h = (Math.imul(h, 1103515245) + 12345) >>> 0) % a.length];
    const [, second, third, fourth] = B.chain;
    return { [second]: pick(['chair', 'lamp']), [third]: third === 4 ? 'coat' : pick(['coat', 'typewriter']), [fourth]: 'bin' };
  }
  stateOf(id) { return this.dstate.get(id) || 'shut'; }
  // only filing counts
  cabDone(cid) { return this.bundle.cabinets[cid - 1].drawers.every((d) => this.filed.has(d.id)); }
  get allDone() { return [1, 2, 3, 4].every((c) => this.cabDone(c)); }
  get current() { return this.state.current ? this.drawers.get(this.state.current) : null; }

  // Drawers open in order, 1 -> 2 -> 3: the next only once the ones before it are filed.
  // One cabinet at a time, in the order the trail unlocks them: the one being worked on is
  // the first unlocked cabinet along the chain that is not filed yet.
  get activeCab() {
    return this.bundle.chain.slice(0, 4).find((c) => this.unlocked.has(c) && !this.cabDone(c)) || null;
  }

  canOpen(e) {
    if (!this.unlocked.has(e.cab.id) || this.finished) return false;
    if (e.cab.id !== this.activeCab) return false;
    return e.cab.drawers.slice(0, e.j).every((d) => this.filed.has(d.id));
  }

  // the room lock of this type whose drawer is open and not yet solved, if any
  roomLock(type) {
    for (const e of this.drawers.values()) if (e.d.type === type && this.stateOf(e.d.id) === 'open') return e;
    return null;
  }

  // ------------------------------------------------------------------ setup

  setupObstacles() {
    const box = new THREE.Box3();
    const rects = [];
    const add = (o, pad = 0.24) => {
      if (!o) return;
      box.setFromObject(o);
      if (box.isEmpty() || box.min.y > 0.5 || box.max.y < 0.3) return;
      rects.push({ x0: box.min.x - pad, x1: box.max.x + pad, z0: box.min.z - pad, z1: box.max.z + pad });
    };
    for (const cab of this.cabinets) add(cab.group, 0.3);
    for (const n of ['table', 'desk', 'bookcase', 'chair_window', 'side_table', 'shelves', 'coatstand',
      'chair_seat', 'chair_other', 'basket', 'box_a', 'box_b', 'suitcase']) add(this.sc[n]);
    this.rails.setObstacles(rects);
  }

  near(obj, dist) {
    if (!this.rails.free) return false;
    const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
    const p = this.rails.basePos;
    return Math.hypot(c.x - p.x, c.z - p.z) < dist;
  }

  atTable() {
    return ['table', 'strongbox'].includes(this.rails.current) || this.near(this.tableGroup, 1.7);
  }

  // A drawer's label: its number, and what it holds; the label of a P1 drawer has
  // rubbed off until its word is typed. The drawer you can open glows a little warmer;
  // a filed one is ticked off in red pencil.
  relabel(e) {
    const u = e.dg?.userData;
    if (!u) return;
    const d = e.d;
    const st = this.stateOf(d.id);
    const solved = this.solved.has(d.id);
    const filed = st === 'filed';
    const open = this.canOpen(e) && st === 'shut';
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 168;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e4dac0';
    ctx.fillRect(0, 0, 512, 168);
    ctx.fillStyle = 'rgba(30,26,22,0.92)';
    ctx.font = 'bold 58px "Special Elite", monospace';
    ctx.fillText(d.id, 22, 64);
    let text = this.cabinetInfo[e.cab.id]?.title || e.cab.label;
    if (d.type === 'P1') text = solved ? (this.state.labels[d.id] || '').toUpperCase() : '';
    if (d.type === 'P1' && !solved) {
      // rubbed off: a grey smear where the word was
      ctx.fillStyle = 'rgba(120,110,95,0.35)';
      ctx.fillRect(22, 84, 380, 46);
    }
    ctx.font = 'bold 37px "Special Elite", monospace';
    ctx.fillStyle = 'rgba(30,26,22,0.92)';
    ctx.fillText(text.slice(0, 22), 22, 118);
    ctx.fillStyle = filed ? 'rgba(60,60,60,0.5)' : 'rgba(168,36,28,0.85)';
    ctx.fillRect(476, 0, 36, 168);
    if (filed) {
      ctx.save();
      ctx.strokeStyle = 'rgba(168,36,28,0.9)';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(330, 90); ctx.lineTo(370, 135); ctx.lineTo(450, 30);
      ctx.stroke();
      ctx.restore();
    }
    const tex = release(new THREE.CanvasTexture(fixed(c)));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    u.label.material.map?.dispose();
    u.label.material.map = tex;
    u.label.material.emissiveMap = tex;
    u.label.material.emissive = new THREE.Color(open ? 0x6a4a22 : LABEL_GLOW);
    u.label.material.needsUpdate = true;
    // a cabinet just unlocked keeps its first drawer a hand's width open, even while it waits
    // for the cabinet before it to be filed
    const fresh = e.j === 0 && e.cab.id !== 1 && this.unlocked.has(e.cab.id) && !this.cabDone(e.cab.id)
      && e.cab.drawers.every((x) => this.stateOf(x.id) === 'shut');
    u.ajar = fresh ? 0.27 : 0;
  }

  relabelAll() {
    for (const e of this.drawers.values()) this.relabel(e);
    this.tintEnvelopes();
  }

  // ------------------------------------------------------------------ hotspots

  hot(obj, h) {
    obj.userData.hot = h;
    this.hots.push(obj);
  }

  setupHotspots() {
    const R = this.rails;
    const notAt = (...names) => () => !names.includes(R.current);
    this.cabinets.forEach((cab, i) => {
      const cid = i + 1;
      const info = this.cabinetInfo[cid];
      this.hot(cab.group, {
        label: () => (this.held?.kind === 'env' ? `Invoegen: kast ${info.roman}`
          : this.held?.kind === 'card' ? `Hier opbergen: kast ${info.roman}` : `Kast ${info.roman} · ${info.title}`
            + (cid === 5 ? (this.state.fiveOpen ? '' : ' (op slot)') : this.cabDone(cid) ? ' · op orde' : '')),
        when: () => R.current !== 'cab' + i && R.current !== 'archive' && !(i === CLOSED && R.current === 'lock'),
        click: () => (this.held?.kind === 'card' || (this.held?.kind === 'env') ? this.dropOn(i) : this.goto('cab' + i)),
        coarse: true,
      });
      for (const dg of cab.drawers) {
        this.hot(dg, {
          label: () => this.drawerLabel(dg),
          when: () => R.current === 'cab' + i || (R.current === 'archive' && this.browsing?.dg === dg) || this.near(cab.group, 2.3),
          click: () => this.clickDrawer(dg),
          enter: () => (dg.userData.hoverOpen = 0.025),
          leave: () => (dg.userData.hoverOpen = 0),
        });
      }
    });
    // the archive in the drawer slid out (3h): any card up to read
    this.hot(this.archive.group, {
      label: (hit) => this.archiveLabel(hit),
      when: () => !!this.browsing && R.current === 'archive' && this.archive.group.visible,
      click: (hit) => this.openArchiveCard(hit),
    });
    this.hot(this.lock.group, {
      label: () => 'Cijferslot: vier cijfers',
      when: () => (R.current === 'cab' + CLOSED || this.near(this.lock.group, 2.3)) && !this.state.fiveOpen && !this.held,
      click: () => this.goto('lock'),
    });
    for (const ring of this.lock.rings) {
      this.hot(ring, {
        label: () => 'Draai (boven: verder, onder: terug)',
        when: () => R.current === 'lock' && !this.state.fiveOpen,
        click: (hit) => this.turnRing(ring, hit),
      });
    }
    this.hot(this.tableGroup, { label: () => 'Leestafel', when: notAt('table', 'typewriter', 'strongbox'), click: () => this.goto('table'), coarse: true });
    this.hot(this.tw.group, {
      label: () => (this.held?.kind === 'card' && this.roomLock('R4') ? 'Op de typemachine leggen'
        : R.current === 'typewriter' ? 'Typ hier' : 'Typemachine'),
      when: () => true,
      click: () => {
        if (this.held?.kind === 'card') return this.dropOnObject('typewriter');
        document.getElementById('keytrap').focus({ preventScroll: true });
        this.goto('typewriter');
      },
    });
    this.hot(this.map.plane, {
      label: (hit) => this.mapLabel(hit),
      when: () => true,
      click: (hit) => (R.current === 'map' ? this.clickMap(hit) : this.goto('map')),
    });
    this.hot(this.cardBox.group, {
      label: () => 'Doos met losse halve kaarten',
      when: () => this.cardBox.group.visible && this.atTable(),
      click: () => this.openFan(),
    });
    this.hot(this.strongbox.group, {
      label: () => 'Kistje met drie wieltjes',
      when: () => this.strongbox.group.visible && R.current !== 'strongbox' && this.atTable(),
      click: () => this.goto('strongbox'),
    });
    this.strongbox.wheels.forEach((w, i) => this.hot(w, {
      label: () => 'Draai (boven: hoger, onder: lager)',
      when: () => this.strongbox.group.visible && R.current === 'strongbox',
      click: (hit) => this.turnBoxWheel(i, hit),
    }));
    for (const p of this.prints || []) {
      this.hot(p.group, {
        label: () => `Volkskunde-atlas · ${p.title}`,
        when: notAt(p.station),
        click: () => this.goto(p.station),
        coarse: true,
      });
    }
    this.hot(this.windowRefs.group, { label: () => 'Raam', when: notAt('window'), click: () => this.goto('window'), coarse: true });
    this.hot(this.door.group, {
      label: () => 'Deur (op slot)',
      when: () => !this.finished,
      click: () => this.goto('door'),
      coarse: true,
    });
    this.hot(this.clock.group, {
      label: () => (this.clockStill ? 'De klok staat stil' : `Het is ${this.wallString()}.`),
      when: () => R.current !== 'clock' || !this.roomLock('R1'),
      click: () => (this.roomLock('R1') ? this.goto('clock') : null),
      coarse: true,
    });
    // up close at a stopped clock: the face, its hands to be turned
    this.hot(this.clockFace, {
      label: () => 'De wijzers',
      when: () => R.current === 'clock' && !!this.roomLock('R1'),
      click: (hit) => {
        if (!hit) return;
        this.hand = { hour: this.hourOf(this.clockFace.worldToLocal(hit.point.clone())), held: false, since: 0 };
        this.sound.dialClick(this.clockFace.getWorldPosition(new THREE.Vector3()).toArray());
      },
    });
    this.hot(this.sill, {
      label: () => 'Op de vensterbank leggen',
      when: () => this.held?.kind === 'card' && R.current === 'window',
      click: () => this.dropOnObject('window'),
    });
    this.hot(this.doorFoot, {
      label: () => 'Onder de deur schuiven',
      when: () => this.held?.kind === 'card' && (R.current === 'door' || this.near(this.door.group, 2.4)),
      click: () => this.dropOnObject('door'),
    });
    this.hot(this.slot, {
      label: () => 'Door de gleuf',
      when: () => this.held?.kind === 'card' && !this.state.fiveOpen && (R.current === 'cab' + CLOSED || this.near(this.cabinets[CLOSED].group, 2.6)),
      click: () => this.dropOn(CLOSED),
    });
  }

  // Room objects that become locks: the windowsill, the foot of the door, the slot in
  // cabinet 5's front (drop targets, invisible), and the clock's face to set its hands.
  setupRoomLocks() {
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    this.sill = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.4), hidden);
    this.sill.position.set(0, 1.0, ROOM.z0 + 0.02);
    // the whole lower door: its foot is out of sight from where you stand before it
    this.doorFoot = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.25, 0.12), hidden);
    this.doorFoot.position.set(0, 0.62, ROOM.z1 - 0.08);
    this.scene.add(this.sill, this.doorFoot);
    // a brass letter slot between cabinet 5's top drawers and its plate
    const slot = new THREE.Group();
    const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a34, metalness: 0.85, roughness: 0.38 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.24), brass);
    const gap = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.19), new THREE.MeshBasicMaterial({ color: 0x050403 }));
    gap.position.x = 0.003;
    slot.add(plate, gap);
    slot.position.set(CAB.front + 0.004, CAB.y0 + 6 * CAB.dh + 0.07, CABINET_Z[CLOSED]);
    this.scene.add(slot);
    this.slot = slot;
    // a close look at the clock, to set its hands
    const face = this.clock.hourHand.parent;
    this.clockFace = face;
    const at = face.getWorldPosition(new THREE.Vector3());
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(face.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    this.rails.addStation('clock', at.clone().addScaledVector(n, 0.8).setY(at.y - 0.06), at.clone().setY(at.y - 0.03), 'Klok');
  }

  drawerLabel(dg) {
    const u = dg.userData;
    if (u.cabinet === CLOSED && !this.state.fiveOpen) return 'Op slot';
    if (u.kind === 'type') return `${u.code} · ${u.title}`;
    if (u.kind === 'register') return `${u.title} · ${u.sub}`;
    const e = u.entry;
    if (!e) return '';
    const st = this.stateOf(e.d.id);
    if (this.held?.kind === 'env') return this.held.drawer === e.d.id ? `Invoegen in ${e.d.id}` : `${e.d.id}`;
    if (this.browsing?.dg === dg) return `${e.d.id} · dicht`;
    if (st === 'filed') return `${e.d.id} · ingevoegd`;
    if (st === 'solved') return `${e.d.id} · in te voegen`;
    if (st === 'open') return `${e.d.id} · envelop op tafel`;
    return `${e.d.id} · archief`;
  }

  // the place under the pointer, and how many stories the archive has from round there
  mapLabel(hit) {
    if (this.rails.current !== 'map' || !hit?.uv) return 'Wandkaart';
    const [lat, lon] = this.map.uvToLatLon(hit.uv);
    const pl = this.map.nearest(lat, lon);
    if (!pl) return '';
    const n = this.map.countNear(pl.lat, pl.lon, 3);
    return `${pl.name} (${pl.prov})` + (n ? ` · ${n} ${n === 1 ? 'verhaal' : 'verhalen'}` : '');
  }

  // ------------------------------------------------------------------ input

  setupInput() {
    const el = this.dom;
    el.addEventListener('pointerdown', (e) => {
      if (!this.running || this.finished) return;
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      // at the clock, the hour hand can be taken and turned
      if (this.rails.current === 'clock' && this.roomLock('R1') && !this.rails.moving && this.handAt()) {
        this.hand = { hour: this.handAt(), held: true, since: 0 };
        this.sound.dialClick(this.clockFace.getWorldPosition(new THREE.Vector3()).toArray());
        this.drag = { x: e.clientX, y: e.clientY, moved: true, hand: true };
        return;
      }
      // a card standing in the tray can be dragged onto the table
      let card = null;
      if (this.env?.open && this.env.phase === 'table' && !this.reading && !this.held && this.atTable()) {
        const r = this.pick();
        if (r?.card && this.inBay.includes(r.card.key)) card = r.card.key;
      }
      this.drag = { x: e.clientX, y: e.clientY, moved: false, card };
      this.pointerType = e.pointerType;
      // a finger has not been anywhere since it last let go
      this.pointerPx = [e.clientX, e.clientY];
    });
    window.addEventListener('pointerup', () => {
      if (this.hand?.held) this.hand.held = false;
      if (this.drag?.card && this.drag.moved) this.dropDragged(this.drag.card);
      if (this.drag?.moved) setTimeout(() => (this.drag = null), 0);
      else this.drag = null;
      el.classList.remove('dragging');
    });
    el.addEventListener('pointermove', (e) => {
      if (this.hand?.held) {
        this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        const h = this.handAt();
        if (h && h !== this.hand.hour) {
          this.hand.hour = h;
          this.sound.dialClick(this.clockFace.getWorldPosition(new THREE.Vector3()).toArray());
        }
        this.pointerPx = [e.clientX, e.clientY];
        return;
      }
      // dragging looks round; it lets go of any station
      const d = this.drag;
      if (d && e.buttons && !this.reading && !this.glancing && !this.finished) {
        const dx = e.clientX - this.pointerPx[0], dy = e.clientY - this.pointerPx[1];
        if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) {
          d.moved = true;
          el.classList.add('dragging');
          this.ui.tooltip(null);
        }
        if (d.moved && d.card) this.dragCard(d.card);
        // a finger takes hold of the room: what is under it stays under it; a mouse turns faster
        else if (d.moved) this.rails.lookBy(dx, dy, e.pointerType === 'mouse' ? undefined : 2 * Math.atan(this.viewFrame().vw / 2) / window.innerWidth);
      }
      this.pointerPx = [e.clientX, e.clientY];
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.rails.setMouse(this.pointer.x, this.pointer.y);
      this.pointerMoved = true;
    });
    el.addEventListener('pointerleave', () => {
      this.pointer.set(-9, -9);
      this.ui.tooltip(null);
    });
    el.addEventListener('click', (e) => {
      if (!this.running) return;
      this.sound.resume();
      if (this.drag?.moved) return;
      if (this.carrying) return;
      if (this.rails.current === 'typewriter') document.getElementById('keytrap').focus({ preventScroll: true });
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      if (this.rails.moving && !this.glancing) return this.rails.hurry();
      this.onClick();
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.back();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => this.rails.keys.delete(e.code));
    window.addEventListener('blur', () => this.rails.keys.clear());
    const trap = document.getElementById('keytrap');
    trap.addEventListener('input', () => {
      const v = trap.value;
      trap.value = '';
      if (this.rails.current === 'typewriter') for (const ch of v) this.typeChar(ch);
    });
    this.ui.nav.addEventListener('click', (e) => {
      const go = e.target.closest('button')?.dataset.go;
      if (!go || this.finished) return;
      if (go === 'typewriter') document.getElementById('keytrap').focus({ preventScroll: true });
      if (go === 'cabinets') {
        const c = this.current ? this.current.cab.id
          : this.bundle.chain.find((x) => this.unlocked.has(x) && !this.cabDone(x)) || 5;
        return this.goto('cab' + (c - 1));
      }
      this.goto(go);
    });
    this.ui.back.addEventListener('click', () => this.back());
    this.ui.hintBtn.addEventListener('click', () => this.requestHint());
    this.ui.onHeld(() => this.putBackHeld());
    this.ui.cardbar.addEventListener('click', (e) => {
      const act = e.target.closest('button')?.dataset.act;
      if (act) this.cardAction(act);
    });
  }

  onKey(e) {
    if (!this.running || this.glancing || this.finished) return;
    if (this.rails.current === 'typewriter' && !this.reading) {
      if (e.key === 'Escape') return this.back();
      if (e.key === 'Enter') { e.preventDefault(); return this.submit(); }
      if (e.key === 'Backspace') { e.preventDefault(); this.tw.backspace(); this.sound.key(true); return; }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        return this.typeChar(e.key);
      }
      return;
    }
    if (this.carrying) return;
    if (this.reading) {
      if (e.key === 'Escape') return this.cardAction('down');
      if (e.key === 'Enter') return this.cardAction(this.reading.from === 'bay' ? 'lay' : 'down');
      if (e.key === 'ArrowRight') return this.cardAction('next');
      if (e.key === 'ArrowLeft') return this.cardAction('prev');
      if (e.key === 'f' || e.key === 'F') return this.cardAction('flip');
      if (e.key === ' ') { e.preventDefault(); return this.cardAction('compare'); }
      if (/^[1-4]$/.test(e.key) && this.reading.from === 'table') {
        const i = Number(e.key) - 1;
        if (i < this.reading.list.length) {
          this.reading.mode = 'single';
          this.reading.index = i;
          this.layoutReading();
        }
      }
      return;
    }
    if (this.atTable()) {
      if (/^[1-4]$/.test(e.key)) {
        const k = this.tableCards[Number(e.key) - 1];
        if (k !== undefined) this.openCard(k);
        return;
      }
      if (e.key === ' ') { e.preventDefault(); return this.openCompare(); }
    }
    if (e.key === 'Escape') return this.back();
    if (/^Shift(Left|Right)$/.test(e.code)) this.rails.keys.add(e.code);
    if (/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(e.code) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      this.rails.enterFree();
      this.rails.keys.add(e.code);
    }
  }

  // the hour on the clock's face under the pointer (1-12), or null
  handAt() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.clockFace.children, false)[0];
    if (!hit) {
      // off the face, keep turning by the direction from its centre
      if (!this.hand?.held) return null;
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 0, 1).applyQuaternion(this.clockFace.getWorldQuaternion(new THREE.Quaternion())),
        this.clockFace.getWorldPosition(new THREE.Vector3()));
      const p = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (!p) return null;
      return this.hourOf(this.clockFace.worldToLocal(p));
    }
    return this.hourOf(this.clockFace.worldToLocal(hit.point.clone()));
  }

  hourOf(local) {
    const a = Math.atan2(local.x, local.y);
    const h = Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 6)) % 12;
    return h || 12;
  }

  pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.reading) {
      const objs = this.liftedCards().flatMap((c) => [c.front, c.back]);
      const hit = this.raycaster.intersectObjects(objs, false)[0];
      return hit ? { card: hit.object.userData.card, hit } : null;
    }
    if (this.atTable()) {
      const bay = this.env?.phase === 'table' ? [...this.inBay, this.envKey(this.env.e)] : [];
      const keys = [...this.tableCards, ...this.loose.keys(), ...bay].filter((k) => k !== this.held?.key);
      const objs = keys.map((k) => this.cards.get(k)).filter((c) => c?.group.visible)
        .flatMap((c) => [c.front, c.back, ...(c.tab ? [c.tab] : [])]);
      const hit = this.raycaster.intersectObjects(objs, false)[0];
      if (hit) return { card: hit.object.userData.card, hit };
    }
    const active = this.hots.filter((o) => o.userData.hot.when());
    const hits = this.raycaster.intersectObjects(active, true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && !(o.userData.hot && o.userData.hot.when())) o = o.parent;
      if (!o) continue;
      return { hot: o.userData.hot, obj: o, hit };
    }
    return null;
  }

  onClick() {
    if (this.rails.moving || this.glancing || this.finished || this.carrying) return;
    const r = this.pick();
    if (!r) return this.walkToFloor();
    if (r.card) {
      const key = r.card.key;
      if (this.reading) {
        if (this.reading.from === 'found' && this.state.crumple[key] === 'crumpled') {
          this.state.crumple[key] = 'smoothed';
          r.card.redraw();
          this.sound.paper(null, 0.35, 'out');
          return;
        }
        const url = this.reading.mode === 'single' && r.card.linkAt(r.hit);
        if (url) return void window.open(url, '_blank', 'noopener');
        if (this.reading.from === 'box') {
          // a finger cannot hover to read a half: a tap holds it up under the top half,
          // and a tap on the half held up tries it
          const i = this.reading.list.indexOf(key);
          if (this.pointerType !== 'mouse' && i > 0 && i !== this.fanClose) return this.closeHalf(i);
          return this.tryHalf(key);
        }
        if (this.reading.mode === 'compare') {
          this.reading.mode = 'single';
          this.reading.index = this.liftedCards().indexOf(r.card);
          this.layoutReading();
        }
        return;
      }
      // the envelope: opened, read, or (sealed) taken up; a card of it in the hand goes in
      if (this.env && key === this.envKey(this.env.e)) {
        if (this.held?.kind === 'card' && this.cardInfo.get(this.held.key)?.e === this.env.e) return this.putBackHeld({ force: true });
        return this.clickTableEnvelope();
      }
      // with a card in hand, another one to take: they change places
      if (this.held?.kind === 'card' && key !== this.held.key && this.canTake(key)) {
        this.putBackHeld({ force: true });
        return setTimeout(() => this.take(key), 350);
      }
      if (this.cardInfo.get(key)?.card.role === 'top' && !this.solved.has(this.cardInfo.get(key).e.d.id)) return this.openFan();
      if (this.inBay.includes(key)) return this.openFromBay(key);
      if (this.loose.has(key)) return this.openLoose(key);
      return this.openCard(key);
    }
    r.hot.click(r.hit);
  }

  // where the pointer is over the table top, or null
  overTable() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const p = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE.y), new THREE.Vector3());
    if (!p || Math.abs(p.x - TABLE.x) > TABLE.w / 2 || Math.abs(p.z - TABLE.z) > TABLE.d / 2) return null;
    return p;
  }

  // a card dragged out of the drawer follows the pointer over the table
  dragCard(key) {
    const c = this.cards.get(key);
    const p = this.overTable();
    if (!c || !p) return;
    if (this.inBay.includes(key)) {
      this.inBay = this.inBay.filter((k) => k !== key);
      this.dragging = key;
      this.poseBay();
    }
    c.place(p.add(new THREE.Vector3(0, 0.04, 0)), Q_FLAT(0));
  }

  // let go over the table, clear of the bay: it lies there; anywhere else it stands back
  dropDragged(key) {
    if (this.dragging !== key) return;
    this.dragging = null;
    const p = this.overTable();
    const inBay = p && Math.abs(p.x - BAY_POS.x) < 0.2 && p.z < BAY_POS.z + 0.2 && p.z > BAY_POS.z - BAY_DEPTH;
    if (p && !inBay) this.layOnTable(key);
    else this.standBack(key);
  }

  walkToFloor() {
    if (this.reading || !this.sceneryRoot || this.carrying) return;
    const hit = this.raycaster.intersectObject(this.sceneryRoot, true)[0];
    if (!hit || hit.point.y > 0.15) return;
    this.rails.walkTo(hit.point);
  }

  updateHover() {
    if (!this.pointerMoved && !this.rails.moving) return;
    this.pointerMoved = false;
    if (this.rails.moving || this.pointer.x < -2 || this.finished || this.drag?.moved || this.carrying) {
      if (this.reading?.from === 'box') this.setFanHover(null);
      this.setBayHover(null);
      this.setHover(null);
      this.hoverTarget = null;
      this.ui.tooltip(null);
      return;
    }
    const r = this.pick();
    // the cards in the drawer fan a little where the pointer is
    this.setBayHover(!this.reading && r?.card && this.inBay.includes(r.card.key) ? r.card.key : null);
    if (r?.card) {
      this.setHover(null);
      this.hoverTarget = r.card.group;
      this.dom.style.cursor = 'pointer';
      const inBox = this.reading?.from === 'box' && this.cardInfo.get(r.card.key)?.card.role !== 'top';
      if (this.reading?.from === 'box') this.setFanHover(inBox ? r.card.key : null);
      const link = this.reading?.mode === 'single' && r.card.linkAt(r.hit);
      const tip = link ? 'Dit verhaal in de Verhalenbank (nieuw venster)' : inBox ? 'Past deze eronder?' : null;
      this.ui.tooltip(this.reading ? tip : this.cardTip(r.card), ...this.pointerPx);
      return;
    }
    this.setHover(r?.hot ? r : null);
    this.hoverTarget = r?.hot ? r.obj : null;
    const label = r?.hot ? r.hot.label(r.hit) : null;
    this.ui.tooltip(label, ...this.pointerPx);
    this.dom.style.cursor = r?.obj === this.clockFace ? 'grab' : r?.hot ? 'pointer' : 'default';
  }

  cardTip(card) {
    const key = card.key;
    if (key === NOTE) return 'Briefje van J.J.V.';
    if (key === FIVE) return `Amsterdam, ${this.night.tomorrow}`;
    if (key.startsWith('env:')) {
      const e = this.drawers.get(key.slice(4));
      if (!e) return null;
      const env = this.env?.e === e ? this.env : null;
      if (env?.sealed) return `Envelop la ${e.d.id}: naar kast ${this.cabinetInfo[e.cab.id]?.roman || e.cab.id}`;
      return env && !env.open && !this.solved.has(e.d.id) ? `Envelop la ${e.d.id}: openen` : `Envelop la ${e.d.id}`;
    }
    const info = this.cardInfo.get(key);
    if (!info) return null;
    const r = info.card.render;
    if (this.held?.kind === 'card' && key !== this.held.key && this.canTake(key)) return 'Ruilen';
    if (info.card.role === 'top' && !this.solved.has(info.e.d.id)) return 'De bovenste helft: zoek de rest in de doos';
    if (info.card.role === 'desk') return `${r.place}, ${r.year}`;
    if (r.summary) return 'Samenvatting van J.J.V.';
    return [this.fieldPlace(info) || '——', r.year].filter(Boolean).join(', ');
  }

  setHover(r) {
    const h = r?.hot || null;
    if (this.hover && this.hover !== h) this.hover.leave?.();
    if (h && this.hover !== h) h.enter?.();
    this.hover = h;
  }

  // ------------------------------------------------------------------ moving about

  goto(name, { carry = false } = {}) {
    if (this.carrying && !carry) return;
    if (this.reading) this.putDown();
    // walking away from a drawer slid out pushes it back in
    if (this.browsing && name !== 'archive') this.closeBrowse({ stay: true });
    if (this.rails.current === name && !this.rails.moving) return;
    this.ui.tooltip(null);
    this.rails.go(name);
  }

  back() {
    if (this.finished || this.carrying) return;
    if (this.reading) return this.cardAction('down');
    const c = this.rails.current;
    if (c === 'lock') return this.goto('cab' + CLOSED);
    if (c === 'archive') return this.closeBrowse();
    if (c === 'typewriter' || c === 'strongbox') return this.goto('table');
    this.rails.enterFree();
  }

  arrived(name) {
    if (name === 'glance' || this.finished) return;
    this.ui.setStation(name, !['room', 'entry', 'free'].includes(name));
    const trap = document.getElementById('keytrap');
    if (name === 'typewriter') {
      this.refreshTypewriter();
      trap.focus({ preventScroll: true });
    } else trap.blur();
    if (name === 'door' && !this.roomLock('R3')) this.ui.note(this.F.door_locked, { ms: 4200 });
    // the name on the glass is written from outside: for a moment you see it as it was written
    if (name === 'window' && (this.atmos.writing || this.atmos.number)) {
      setTimeout(() => (this.post.film.uniforms.uFlip.value = 1), 450);
      setTimeout(() => (this.post.film.uniforms.uFlip.value = 0), 1550);
    }
    // the envelope carried here is laid in the bay; an emptied one goes onto the spike
    if (name === 'table' && this.env?.phase === 'carry') this.landEnvelope();
    if (name === 'table') this.spikePocketed();
    if (name === 'table' && this.pendingPutBack && this.held) this.putBackHeld({ force: true });
    // a card found in the room goes onto the table with the others
    if (name === 'table' && this.held && this.isOut(this.held.key)) this.putBackHeld({ force: true });
    if (name === 'found' && this.pendingFound) {
      const k = this.pendingFound;
      this.pendingFound = null;
      setTimeout(() => this.takeFound(k), 200);
    }
    if (this.pendingDrop !== undefined && name === 'cab' + this.pendingDrop) {
      const i = this.pendingDrop;
      this.pendingDrop = undefined;
      this.dropOn(i);
    }
    this.pointerMoved = true;
  }

  // ------------------------------------------------------------------ cards

  // A target card's place: missing until found, then typed in a letter at a time.
  fieldPlace(info) {
    const { e, card } = info;
    if (card.role !== 'target') return card.render.place;
    const fill = this.typing?.key === `${e.d.id}/${card.id}` ? this.typing.shown : this.state.fills[e.d.id];
    return fill || null;
  }

  viewFor(key) {
    const n = keyNumber(key);
    const blank = { n, title: 'achterzijde' };
    if (key === NOTE) return { front: { n, note: this.F.note_table }, back: blank };
    if (key.startsWith('env:')) {
      if (key === 'env:5') return { front: { n, envelope: { sealedFor: this.fiveEnvelopePlace() } }, back: { envelope: true } };
      return { front: { n, envelope: this.envView(this.drawers.get(key.slice(4))) }, back: { envelope: true } };
    }
    if (key.startsWith('arc:')) return this.archiveView(key);
    if (key === FIVE) {
      const r = this.F.card_five;
      const word = this.state.gapWord;
      return {
        front: { n, ...r, year: this.night.tomorrow, description: r.description.replace('____', word ? word.toUpperCase() : '____') },
        back: blank,
      };
    }
    const { e, card } = this.cardInfo.get(key);
    const d = e.d;
    const r = card.render;
    // a pencil note on the card itself goes in the margin (the note slip is another thing)
    const { note, ...fields } = r;
    const front = { n, ...fields, record: card.story_id, place: this.fieldPlace({ e, card }) };
    if (note) front.notes = [{ text: note, kind: 'remark' }];
    // the window's card comes back from the wet sill damp
    if (this.state.damp[key]) front.damp = true;
    // a misfiled card going home carries J.J.V.'s pencil about who wrote it
    if (this.state.trail[key] !== undefined) {
      front.notes = [...(front.notes || []), { text: this.F.trail_notes?.[this.state.trail[key]] || '', kind: 'remark' }];
    }
    // the original telling on the front where the puzzle allows it; the summary on the back
    const lang = r.lang && !r.lang.startsWith('Standaardnederlands') ? ` · ${r.lang.toLowerCase()}` : '';
    let back = { ...blank, half: r.half, initials: r.initials };
    if (r.front === 'original' && r.original) {
      front.description = r.original;
      front.sub = `oorspronkelijke tekst${lang}`;
      back = { n, title: 'samenvatting', body: r.description };
    } else if (r.original) {
      front.sub = 'samenvatting';
      back = { n, title: `oorspronkelijke tekst${lang}`, body: r.original };
    }
    if (r.summary) {
      const fill = this.typing?.key === key ? this.typing.shown : this.state.fills[d.id];
      if (fill) front.blank = fill;
    }
    // the filed card on the floor: someone else's hand on it
    if (this.state.floor?.key === key) front.notes = [...(front.notes || []), { text: this.F.floor_note, kind: 'other' }];
    // the one from the bin: crumpled, then smoothed out
    if (this.state.crumple[key] === 'crumpled') front.crumpled = true;
    if (this.state.crumple[key] === 'smoothed') front.creased = true;
    // the card a room lock turned on carries J.J.V.'s pencil: its number is the digit
    if (this.state.digitNote[key]) {
      const dg = d.on_success.digit;
      const roman = this.cabinetInfo[e.cab.id]?.roman || e.cab.id;
      const text = (this.F.digit_note || '{n}. Het cijfer van kast {roman}.').replace('{n}', dg.value).replace('{roman}', roman);
      front.notes = [...(front.notes || []), { text, kind: 'hint' },
        ...(e.cab.id === 1 && this.F.digit_first ? [{ text: this.F.digit_first, kind: 'hint' }] : [])];
    }
    return { front, back };
  }

  // a card from the archive (3h): grey stock, the summary on the front, the original
  // telling on the back where there is one, else the collector's initials
  archiveView(key) {
    const [, cid, idx] = key.split(':');
    const r = this.archive.record(Number(cid), Number(idx)) || {};
    const n = keyNumber(key);
    const lang = r.l ? ` · ${r.l.toLowerCase()}` : '';
    return {
      front: { n, archive: true, place: r.p, prov: r.v, year: r.y, code: r.c, description: r.d, initials: r.i, record: r.r,
        url: this.archive.index?.url?.replace('{n}', r.n), sub: 'samenvatting' },
      back: r.o ? { n, archive: true, title: `oorspronkelijke tekst${lang}`, body: r.o } : { n, archive: true, title: 'achterzijde', initials: r.i },
    };
  }

  // cabinet 5's envelope: sealed, no count, the place of the last misfiled card on it
  fiveEnvelopePlace() {
    for (const e of this.drawers.values()) {
      const L = e.d.lock;
      if (L?.kind === 'card_to_cabinet' && L.cabinet === 5) return e.d.cards.find((c) => c.id === L.card)?.render.place || '';
    }
    return '';
  }

  // the tab of a card that stands in a drawer: place, year, and the code in red
  tabFor(key) {
    const info = this.cardInfo.get(key);
    const r = info.card.render;
    return { place: r.summary ? 'samenvatting' : this.fieldPlace(info), year: r.year, code: r.code };
  }

  makeCard(key) {
    let card = this.cards.get(key);
    if (card) return card;
    const info = this.cardInfo.get(key);
    const tab = info && info.e.cab ? () => this.tabFor(key) : null;
    const env = key.startsWith('env:');
    card = new CardObj(keyNumber(key), () => this.viewFor(key), { half: info?.card.render.half || null, tab, res: env ? 0.5 : 1, flap: env });
    card.key = key;
    card.root = this.scene;
    this.cards.set(key, card);
    this.scene.add(card.group);
    return card;
  }

  removeCard(key) {
    const card = this.cards.get(key);
    if (!card) return;
    card.group.removeFromParent();
    card.dispose();
    this.cards.delete(key);
    this.loose.delete(key);
  }

  // the four places for cards, two by two, right of the drawer
  slotPose(i, key) {
    const col = i % 2, row = Math.floor(i / 2) % 2;
    const pos = new THREE.Vector3(SLOTS.x[col], TABLE.y + LIE + i * 0.0004, SLOTS.z[row]);
    const yaw = (((keyNumber(key) * 7919) % 100) / 100 - 0.5) * 0.09;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, yaw));
    return { pos, q };
  }

  // the torn card's two halves, joined, lie in the first place
  halfPose(which) {
    const pos = new THREE.Vector3(SLOTS.x[0], TABLE.y + LIE + 0.0018,
      SLOTS.z[0] + (which === 'bottom' ? CARD_SIZE.h / 4 + 0.002 : -CARD_SIZE.h / 4));
    return { pos, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.02)) };
  }

  // loose cards, at the back of the table: the note left of the typewriter, the desk card
  // (and what the strongbox held, and cabinet 5's card) by the lamp
  loosePose(slot) {
    const [dx, dz, yaw] = slot === 0 ? [0.45, -0.3, -0.07] : slot === 2 ? [0.5, -0.24, 0.09] : [-0.05, -0.38, 0.11];
    const pos = new THREE.Vector3(TABLE.x + dx, TABLE.y + LIE + 0.0006, TABLE.z + dz);
    return { pos, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, yaw)) };
  }

  placeLoose(key, slot, { from = null, home = null, delay = 0 } = {}) {
    const card = this.makeCard(key);
    card.group.visible = true;
    const { pos, q } = this.loosePose(slot);
    this.loose.set(key, { slot, home });
    if (from) {
      card.place(from, Q_IN());
      card.moveTo(pos, q, 1.5, { arc: 0.35, delay });
    } else card.place(pos, q);
    return card;
  }

  sendTo(key, dest, then) {
    const card = this.cards.get(key);
    if (!card) return then?.();
    this.loose.delete(key);
    this.forget(key);
    card.group.visible = true;
    card.moveTo(dest, Q_IN(), 1.3, { arc: 0.3, onDone: () => { this.removeCard(key); then?.(); } });
  }

  drawerWorld(e) {
    const dg = e?.dg;
    return dg ? dg.localToWorld(new THREE.Vector3(-0.15, 0.02, 0)) : new THREE.Vector3(ROOM.x0 + 0.6, 1.0, 0);
  }

  cabinetWorld(i) {
    return new THREE.Vector3(CAB.front, 1.1, CABINET_Z[i]);
  }

  // What lies on the table goes back where it came from: cards into the envelope that is out
  // (or, without one, back to their drawers), loose papers home, the box and the strongbox
  // away. keep: a drawer whose cards stay where they are.
  clearTable(keep = null) {
    for (const k of [...this.tableCards]) {
      const info = this.cardInfo.get(k);
      if (keep && info?.e === keep) continue;
      if (this.env?.open && info?.e === this.env.e) this.standBack(k);
      else {
        this.forget(k);
        this.sendTo(k, this.drawerWorld(info?.e));
      }
    }
    for (const [k, l] of [...this.loose]) if (l.home && this.cardInfo.get(k)?.e !== keep) this.sendTo(k, l.home());
    this.cardBox.group.visible = false;
    this.strongbox.group.visible = false;
    this.refreshPins();
  }

  // ------------------------------------------------------------------ the envelope (sections 3b, 3g)

  // An envelope taken for the first time: its drawer is open now, its cabinet leaks, and what
  // waits for it starts (its room lock, the third cabinet's lock early, the card on the floor)
  openState(e) {
    this.dstate.set(e.d.id, 'open');
    this.leak();
    const n = this.nth(e.cab.id);
    if (e.j === 0 && n === 3) {
      // the third cabinet's room lock is already going before its drawer is reached
      const r = this.drawers.get(e.cab.drawers[2].id);
      if (!this.state.early[r.d.id]) this.wakeRoomLock(r, false, { watch: e });
    }
    if (e.j === 0 && n === 4 && !this.state.floor) setTimeout(() => this.floorEvent(), 900);
    if (this.state.early[e.d.id]) {
      // woken already: the typewriter's page is put back as it was typed
      if (e.d.type === 'R4') this.typeTop(e, true);
    } else this.wakeRoomLock(e);
    this.placeFoundFor(e);
  }

  // What belongs in a drawer's envelope now: an unsolved puzzle's cards (the halves wait in the
  // box, the typed top half in the machine, what the strongbox holds in it), a solved one's
  // that go back (the misfiled card and the door's card have left for good).
  envKeys(e) {
    const d = e.d;
    if (this.solved.has(d.id)) return (d.on_success?.stack || []).map((id) => `${d.id}/${id}`);
    return d.cards.filter((card) => {
      const role = card.role;
      if ((role === 'bottom' && d.type === 'P4') || role === 'distractor' || role === 'inside') return false;
      return !(d.type === 'R4' && role === 'top');
    }).map((card) => `${d.id}/${card.id}`);
  }

  // the count on the envelope (live): what belongs in it, and how many of those are in it or
  // out of it on the table; a card still elsewhere in the room, or kept in the hand when the
  // others went back, makes it short. A torn card joined counts as one.
  envCount(e) {
    const keys = this.envKeys(e);
    const fuse = this.solved.has(e.d.id) ? e.d.on_success?.fuse || [] : [];
    const of = keys.length - (fuse.length > 1 ? fuse.length - 1 : 0);
    const sealing = this.env?.e === e && this.env.sealing;
    const missing = keys.filter((k) => this.isOut(k) || (sealing && this.held?.key === k)).length;
    return { of, count: of - missing };
  }

  envKey(e) { return `env:${e.d.id}`; }

  envView(e) {
    const { of, count } = this.envCount(e);
    const env = this.env?.e === e ? this.env : null;
    return { ...this.slipView(e), of, count, tick: !!env?.sealed || this.filed.has(e.d.id), done: this.filed.has(e.d.id) || !!env?.done };
  }

  // J.J.V.'s note on the envelope: what to establish, where its missing card is, the hints
  // asked for; on the fourth cabinet's first drawer a line in another hand
  slipView(e) {
    const d = e.d;
    return {
      id: d.id, note: d.note,
      where: d.found_card && this.isOut(`${d.id}/${d.found_card.card}`) ? this.foundNote(d) : null,
      other: (e.j === 0 && this.nth(e.cab.id) === 4 && this.F.reactions?.other_hand) || null,
      hints: d.hints.slice(0, this.state.hintLv[d.id] || 0),
    };
  }

  envCard(e) {
    const c = this.makeCard(this.envKey(e));
    c.redraw();
    return c;
  }

  // Every envelope where it is: clipped to its drawer's front (greyed until it is that
  // drawer's turn), out on the table or in the hand, or, filed, on the spike.
  placeEnvelopes() {
    for (const e of this.drawers.values()) {
      if (this.env?.e === e) continue;
      const c = this.envCard(e);
      c.group.visible = true;
      if (this.filed.has(e.d.id)) {
        if (!this.state.spiked.includes(e.d.id)) this.state.spiked.push(e.d.id);
        const p = this.spike.pose(this.state.spiked.indexOf(e.d.id));
        c.place(p.pos, p.q, { scale: 0.9 });
        continue;
      }
      e.dg.add(c.group);
      const p = this.frontPose(e);
      c.place(p.pos, p.q, { local: true, scale: 0.72 });
      if (!c.hotted) {
        c.hotted = true;
        this.hot(c.group, {
          label: () => (this.envOnFront(e) && this.canOpen(e) && !this.env ? `Envelop · la ${e.d.id}`
            : this.filed.has(e.d.id) ? '' : `la ${e.d.id} · nog niet`),
          when: () => this.envOnFront(e) && (this.rails.current === 'cab' + (e.cab.id - 1) || this.near(this.cabinets[e.cab.id - 1].group, 2.3)),
          click: () => this.clickFrontEnvelope(e),
        });
      }
    }
    this.tintEnvelopes();
  }

  envOnFront(e) { return this.env?.e !== e && !this.filed.has(e.d.id) && this.cards.get(this.envKey(e))?.group.parent === e.dg; }

  // clipped to the drawer's front, below its label, over the pull
  frontPose(e) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.04, 0, 0)).multiply(Q_STAND);
    const fx = e.dg.userData.frontX ?? (e.dg.userData.frontX = new THREE.Box3().setFromObject(e.dg.userData.front || e.dg).max.x
      - e.dg.getWorldPosition(new THREE.Vector3()).x);
    return { pos: new THREE.Vector3(fx + 0.004, -0.028, 0.004), q };
  }

  // the envelopes not to be taken yet are greyed
  tintEnvelopes() {
    for (const e of this.drawers.values()) {
      const c = this.cards.get(this.envKey(e));
      if (!c || !this.envOnFront(e)) continue;
      c.setTint(this.canOpen(e) && !this.env ? 1 : 0.42);
    }
  }

  // where the envelope lies in the bay, in front of the tray, flap up
  bayPose() {
    return { pos: new THREE.Vector3(BAY_POS.x, TABLE.y + LIE + 0.0015, BAY_POS.z + 0.1), q: Q_FLAT(0.02) };
  }

  // carrying something big: the envelope to the table, or on its way in; nothing else meanwhile
  get carrying() { return !!this.env && ['lift', 'carry', 'land', 'insert', 'opening'].includes(this.env.phase); }

  clickFrontEnvelope(e) {
    if (this.held?.kind === 'card') return this.dropOnDrawer(e, e.dg);
    if (this.held?.kind === 'env') return this.dropEnvelope(e.cab.id - 1, e.dg);
    if (this.env) return;
    if (!this.canOpen(e)) {
      this.sound.locked(e.dg.getWorldPosition(new THREE.Vector3()).toArray());
      const act = this.activeCab;
      if (this.unlocked.has(e.cab.id) && act && act !== e.cab.id) {
        const roman = this.cabinetInfo[act]?.roman || act;
        this.ui.note((this.F.finish_first || 'Nog niet. Eerst kast {roman}.').replace('{roman}', roman), { ms: 2400 });
      }
      return;
    }
    this.takeEnvelope(e);
  }

  // Take an envelope from its drawer's front: it comes into the hand, and you carry it to the
  // table, where it is laid in the bay at the near edge, flap up. quiet: it is simply there.
  takeEnvelope(e, { quiet = false, onTable = [], open = false } = {}) {
    if (this.env || this.held) return;
    this.clearTable(e);
    if (this.stateOf(e.d.id) === 'shut') this.openState(e);
    this.env = { e, phase: quiet ? 'table' : 'lift', open: false, sealed: false };
    this.state.current = e.d.id;
    this.state.envOpen = false;
    const c = this.envCard(e);
    c.setTint(1);
    c.setReading(false);
    this.relabelAll();
    this.updateTask();
    this.updateHintLabel();
    if (quiet) {
      const p = this.bayPose();
      c.place(p.pos, p.q, { scale: 0.9 });
      this.envLanded(true);
      if (open || onTable.length) this.openEnvelope({ quiet: true, onTable });
      if (this.solved.has(e.d.id)) this.sealEnvelope(e, { quiet: true });
      return;
    }
    this.held = { kind: 'env', drawer: e.d.id };
    this.ui.held(`envelop van la ${e.d.id}`);
    this.sound.paper(e.dg.getWorldPosition(new THREE.Vector3()).toArray(), 0.35);
    const p = this.holdPose();
    c.moveTo(p.pos, p.q, 0.6, { arc: 0.05, scale: 0.5, onDone: () => {
      c.follow = () => this.holdPose();
      this.env.phase = 'carry';
      this.goto('table', { carry: true });
    } });
    c.setOnTop(true);
    this.save();
  }

  // laid in the bay
  landEnvelope() {
    const env = this.env, c = this.cards.get(this.envKey(env.e));
    env.phase = 'land';
    this.held = null;
    this.ui.held(null);
    const p = this.bayPose();
    c.moveTo(p.pos, p.q, 0.55, { arc: 0.06, scale: 0.9, onDone: () => this.envLanded() });
  }

  envLanded(quiet = false) {
    const env = this.env;
    env.phase = 'table';
    if (!quiet) this.sound.paper([BAY_POS.x, BAY_POS.y, BAY_POS.z], 0.3, 'place');
    this.tintEnvelopes();
    this.pointerMoved = true;
  }

  // Opened: the envelope is held up, its flap (on the back) opens, the cards are drawn out and
  // stand upright in the tray behind it, their tabs up; the flap is tucked back in and it is
  // laid down again (an open flap would lie under the tray). What the puzzle needs besides comes onto the table
  // with them (the box of halves, the strongbox). Cards already on the table stay there.
  openEnvelope({ quiet = false, onTable = [] } = {}) {
    const env = this.env;
    if (!env || env.open) return;
    const e = env.e, d = e.d;
    env.open = true;
    this.state.envOpen = true;
    const ec = this.cards.get(this.envKey(e));
    const keys = this.envKeys(e).filter((k) => !this.isOut(k) && this.held?.key !== k);
    for (const k of onTable) if (keys.includes(k) && !this.tableCards.includes(k)) this.tableCards.push(k);
    this.tableCards.forEach((k) => {
      const c = this.makeCard(k);
      c.group.visible = true;
      const p = this.restPose(k);
      c.place(p.pos, p.q);
    });
    this.inBay = keys.filter((k) => !this.tableCards.includes(k));
    for (const k of this.inBay) {
      const c = this.makeCard(k);
      c.setReading(false);
      c.flipped = false;
      c.redraw();
    }
    if (quiet) {
      for (const k of this.inBay) {
        const c = this.cards.get(k);
        c.group.visible = true;
        this.tray.group.attach(c.group);
      }
      this.poseBay(0);
    } else this.playOpening(ec);
    if (!this.solved.has(d.id)) {
      if (d.type === 'P4') this.cardBox.group.visible = true;
      if (d.type === 'P6') {
        this.strongbox.group.visible = true;
        this.strongbox.openTarget = 0;
      }
    }
    this.refreshPins(!quiet);
    if (!quiet) this.save();
  }

  // Opening it, as hands do: taken up off the table and held up, its front to you; the flap
  // on its back lifts over the top and folds back, and the cards are drawn up out of the
  // mouth one by one, in front of the open flap, into the tray; the flap is tucked and the
  // envelope laid down again. Nothing else meanwhile.
  playOpening(ec) {
    const env = this.env;
    env.phase = 'opening';
    const bay = this.bayPose();
    const { up, qUp, lift, inside } = this.envHold(bay);
    const T = (ms, fn) => setTimeout(() => { if (this.env === env) fn(); }, ms);
    ec.moveTo(up, qUp, 0.45, { arc: 0.02, scale: 0.9 });
    this.sound.paper([BAY_POS.x, BAY_POS.y, BAY_POS.z], 0.3);
    T(550, () => {
      ec.flapTarget = 1;
      this.sound.paper([BAY_POS.x, BAY_POS.y, BAY_POS.z], 0.2, 'flap');
    });
    // the cards, drawn out of the mouth: first up out of the envelope, then into the tray
    const out = 1150, gap = 220;
    this.inBay.forEach((k, i) => {
      const c = this.cards.get(k);
      c.group.visible = false;
      T(out + i * gap, () => {
        c.group.visible = true;
        c.place(up.clone().add(inside), qUp, { scale: 0.85 });
        c.moveTo(up.clone().add(inside).addScaledVector(lift, CARD_SIZE.h * 0.9), qUp, 0.38, {
          scale: 0.85,
          onDone: () => {
            if (this.env !== env || !this.inBay.includes(k)) return;
            this.tray.group.attach(c.group);
            const p = this.standPose(this.inBay.indexOf(k), k);
            c.moveTo(p.pos, p.q, 0.5, { local: true, arc: 0.04 });
          },
        });
        this.sound.paper([BAY_POS.x, BAY_POS.y + 0.2, BAY_POS.z], 0.13, 'out');
      });
    });
    const done = out + this.inBay.length * gap + 500;
    T(done, () => (ec.flapTarget = 0));
    T(done + 500, () => ec.moveTo(bay.pos, bay.q, 0.5, { arc: 0.03, scale: 0.9 }));
    T(done + 1000, () => {
      env.phase = 'table';
      this.poseBay(0.3);
      this.sound.paper([BAY_POS.x, BAY_POS.y, BAY_POS.z], 0.2, 'place');
      this.pointerMoved = true;
    });
  }

  // The envelope held up over its place, its front to you and leaning back a little: up, its
  // turn qUp, lift (out of its mouth) and inside (between its front and back, where a card
  // in it is hidden behind the front)
  envHold(bay) {
    const up = bay.pos.clone().add(new THREE.Vector3(0, 0.17, -0.03));
    const qUp = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, 0, 0));
    return {
      up, qUp,
      lift: new THREE.Vector3(0, 1, 0).applyQuaternion(qUp),
      inside: new THREE.Vector3(0, 0, -0.0006).applyQuaternion(qUp),
    };
  }

  // The envelope on the table, clicked: shut, it opens; open, it is read; sealed with all its
  // cards back in, it is taken up to be carried to its cabinet.
  clickTableEnvelope() {
    const env = this.env;
    if (!env || env.phase !== 'table') return;
    if (env.sealed) return this.takeSealed();
    if (!env.open && !this.solved.has(env.e.d.id)) return this.openEnvelope();
    this.readEnvelope();
  }

  readEnvelope() {
    if (this.reading) this.putDown();
    this.reading = { mode: 'single', list: [this.envKey(this.env.e)], index: 0, from: 'env' };
    this.rails.parallax = false;
    this.layoutReading();
    this.sound.paper([BAY_POS.x, BAY_POS.y, BAY_POS.z], 0.15);
  }

  takeSealed() {
    const env = this.env, c = this.cards.get(this.envKey(env.e));
    if (this.reading) this.putDown();
    env.phase = 'hand';
    this.held = { kind: 'env', drawer: env.e.d.id };
    this.ui.held(`envelop van la ${env.e.d.id}`);
    const p = this.holdPose();
    c.moveTo(p.pos, p.q, 0.5, { arc: 0.04, scale: 0.5, onDone: () => (c.follow = () => this.holdPose()) });
    c.setOnTop(true);
    this.sound.paper(null, 0.25);
    this.relabelAll();
  }

  // The lock is open: every card whose home is this drawer, wherever it is, slides back into
  // the envelope; the flap closes and a tick comes by the count. A card kept in the hand keeps
  // it from closing (3/4) until it is put in too.
  sealEnvelope(e, { quiet = false } = {}) {
    const d = e.d;
    if (!this.solved.has(d.id) || this.filed.has(d.id)) return;
    if (this.reading) this.putDown();
    const env = this.env?.e === e ? this.env : null;
    const keys = this.envKeys(e);
    // a card still lying in the room comes too
    for (const k of keys) {
      if (!this.isOut(k)) continue;
      const f = this.found.get(k);
      this.state.foundDone[k] = true;
      if (!this.cards.has(k) && f.obj) this.makeCard(k).place(f.obj.getWorldPosition(new THREE.Vector3()), Q_FLAT(0));
      if (f.loc === 'bin' && f.obj) this.scene.remove(f.obj);
    }
    const into = env ? this.cards.get(this.envKey(e)).group.getWorldPosition(new THREE.Vector3()) : this.drawerWorld(e);
    let i = 0;
    const going = [];
    for (const k of keys) {
      if (this.held?.key === k) continue;
      this.tableCards = this.tableCards.filter((x) => x !== k);
      this.inBay = this.inBay.filter((x) => x !== k);
      this.loose.delete(k);
      const c = this.cards.get(k);
      if (!c) continue;
      if (quiet) { this.removeCard(k); continue; }
      c.setReading(false);
      if (env?.phase === 'table') { going.push(k); continue; }
      c.moveTo(into.clone().add(new THREE.Vector3(0, 0.004, 0)), Q_FLAT(0), 0.7, { arc: 0.12, delay: i++ * 0.08, scale: 0.85, onDone: () => this.removeCard(k) });
    }
    // what else came to the table for it goes away
    for (const [k, l] of [...this.loose]) if (this.cardInfo.get(k)?.e === e && l.home) this.sendTo(k, into);
    this.cardBox.group.visible = false;
    this.strongbox.group.visible = false;
    if (env) {
      env.sealing = true;
      env.open = true;
      this.state.envOpen = true;
      if (going.length) this.playSealing(env, going);
      else this.closeIfComplete(quiet ? 0 : 900 + i * 80);
    }
    this.refreshPins();
    this.relabelAll();
    this.updateHintLabel();
  }

  // The cards going back in, as they came out: the envelope taken up, its flap lifted, the
  // cards put in at the mouth one by one, the flap shut and the tick by the count (unless one
  // is still in your hand), and laid down. Played where the
  // envelope is, also while you are elsewhere (the door, the window, a cabinet).
  playSealing(env, keys) {
    const ec = this.cards.get(this.envKey(env.e));
    env.phase = 'sealing';
    const bay = this.bayPose();
    const { up, qUp, lift, inside } = this.envHold(bay);
    const T = (ms, fn) => setTimeout(() => { if (this.env === env) fn(); }, ms);
    ec.moveTo(up, qUp, 0.45, { arc: 0.02, scale: 0.9 });
    T(550, () => (ec.flapTarget = 1));
    const gap = 180, first = 1050;
    keys.forEach((k, i) => {
      const c = this.cards.get(k);
      T(first + i * gap, () => {
        if (!c.group.parent) return;
        c.moveTo(up.clone().add(inside).addScaledVector(lift, CARD_SIZE.h * 0.9), qUp, 0.55, {
          arc: 0.06, scale: 0.85,
          onDone: () => c.moveTo(up.clone().add(inside), qUp, 0.3, { scale: 0.85, onDone: () => this.removeCard(k) }),
        });
        this.sound.paper([BAY_POS.x, BAY_POS.y + 0.2, BAY_POS.z], 0.13, 'shove');
      });
    });
    const done = first + keys.length * gap + 900;
    T(done, () => {
      // shut, with the tick, if all are in; a card still in the hand keeps it from closing,
      // but the flap is tucked so that the envelope lies flat
      this.closeIfComplete(1);
      ec.flapTarget = 0;
      this.sound.cardSlide([BAY_POS.x, BAY_POS.y, BAY_POS.z], 0.3, 'flip');
    });
    T(done + 500, () => ec.moveTo(bay.pos, bay.q, 0.5, { arc: 0.03, scale: 0.9 }));
    T(done + 1000, () => {
      env.phase = 'table';
      this.pointerMoved = true;
    });
  }

  // all in: the flap shuts, the tick comes
  closeIfComplete(delay = 0) {
    const env = this.env;
    if (!env?.sealing) return;
    const c = this.cards.get(this.envKey(env.e));
    const { of, count } = this.envCount(env.e);
    c.redraw();
    if (count < of) return;
    const shut = () => {
      if (this.env !== env) return;
      env.sealed = true;
      env.sealing = false;
      env.open = false;
      this.state.envOpen = false;
      c.flapTarget = 0;
      c.redraw();
      if (delay) this.sound.paper([BAY_POS.x, BAY_POS.y, BAY_POS.z], 0.2, 'flip');
    };
    if (delay) setTimeout(shut, delay);
    else {
      shut();
      c.flapOpen = 0;
    }
  }

  // Carried to its cabinet: there the drawer slides out in place, the envelope goes onto it,
  // and its cards fan out into the archive behind the divider, each into its place. Before
  // its lock is open: not yet; the wrong drawer: no.
  dropEnvelope(i, dg = null) {
    const env = this.env;
    if (!env || this.held?.kind !== 'env') return;
    const e = env.e;
    if (!this.near(this.cabinets[i].group, 2.6) && this.rails.current !== 'cab' + i) {
      this.pendingDrop = i;
      return this.goto('cab' + i);
    }
    if (!this.solved.has(e.d.id)) return this.refuse(this.F.not_yet || 'Nog niet.');
    if (i + 1 !== e.cab.id || (dg && dg !== e.dg)) return this.refuse(this.F.nee);
    if (!env.sealed) return this.refuse(this.F.nee);
    this.insertEnvelope();
  }

  // At its drawer: the drawer slides out and you look down into it, as when browsing the
  // archive; the envelope is held over it, its flap lifted, and the cards go in one by one
  // behind the divider, where they stand cream among the grey. Emptied and stamped, the
  // envelope goes into your pocket, and the drawer is pushed shut.
  insertEnvelope() {
    const env = this.env, e = env.e, dg = e.dg, u = dg.userData;
    const c = this.cards.get(this.envKey(e));
    const cid = e.cab.id;
    env.phase = 'insert';
    this.held = null;
    this.ui.held(null);
    u.target = 1;
    this.sound.drawer(dg.getWorldPosition(new THREE.Vector3()).toArray(), true);
    if (u.body?.children[1]) u.body.children[1].visible = false;
    this.browsing = { dg, e, cid, j: e.j, inserting: true };
    const keys = this.envKeys(e);
    const inserted = [];
    const note = e.j === 0 ? this.F.archive_note || 'Achter het schot hoef je vannacht niet.' : null;
    const show = () => this.browsing?.dg === dg && this.archive.showIn(dg, { cid, j: e.j, ours: inserted, note });
    this.archive.load(cid).then(show);
    // the drawer fully out has its middle a little in front of the cabinet (front faces +x)
    const centre = dg.getWorldPosition(new THREE.Vector3());
    centre.x = CAB.front + 0.34 - 0.24;
    centre.y -= 0.03;
    this.rails.addStation('archive', centre.clone().add(new THREE.Vector3(0.62, 0.52, 0)), centre, 'La');
    this.goto('archive', { carry: true });
    // held over the drawer, its front to you, leaning away a little; the flap folds back
    const over = centre.clone().add(new THREE.Vector3(0.05, 0.22, 0));
    const qOver = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.45, 0, 0)));
    const T = (ms, fn) => setTimeout(() => { if (this.env === env) fn(); }, ms);
    T(1000, () => c.moveTo(over, qOver, 0.6, { arc: 0.03, scale: 0.8 }));
    T(1700, () => {
      c.flapTarget = 1;
      this.sound.paper(over.toArray(), 0.25, 'flap');
    });
    const lift = new THREE.Vector3(0, 1, 0).applyQuaternion(qOver);
    const inside = new THREE.Vector3(0, 0, -0.0006).applyQuaternion(qOver);
    const gap = 260, first = 2200;
    keys.forEach((k, n) => {
      T(first + n * gap, () => {
        const card = this.makeCard(k);
        card.redraw();
        card.group.visible = true;
        card.place(over.clone().add(inside), qOver, { scale: 0.75 });
        const slot = dg.localToWorld(new THREE.Vector3(-0.076 - n * 0.004, -0.022, 0));
        card.moveTo(over.clone().add(inside).addScaledVector(lift, CARD_SIZE.h * 0.8), qOver, 0.35, {
          scale: 0.75,
          onDone: () => card.moveTo(slot, Q_STAND, 0.45, {
            arc: 0.05, scale: 0.9,
            onDone: () => {
              this.removeCard(k);
              inserted.push(k);
              show();
            },
          }),
        });
        this.sound.paper(over.toArray(), 0.12, 'out');
      });
    });
    const done = first + keys.length * gap + 900;
    T(done, () => {
      // emptied and stamped
      env.done = true;
      c.flapTarget = 0;
      c.redraw();
      this.sound.clunk(over.toArray());
    });
    T(done + 800, () => {
      this.pocket(e);
      this.shutting = { e, t: setTimeout(() => this.shutDrawer(e), AUTO_SHUT * 1000) };
    });
  }

  // The emptied envelope goes into your pocket, out of sight: the hand is free at once. Back at
  // the table it comes out onto the spike by itself (spikePocketed).
  pocket(e, { quiet = false } = {}) {
    const c = this.cards.get(this.envKey(e));
    if (!this.state.spiked.includes(e.d.id)) this.state.spiked.push(e.d.id);
    if (quiet) {
      const p = this.spike.pose(this.state.spiked.indexOf(e.d.id));
      c.place(p.pos, p.q, { scale: 0.9 });
    } else {
      c.pocketed = true;
      const below = this.camera.position.clone().add(new THREE.Vector3(0.22, -0.55, -0.25).applyQuaternion(this.camera.quaternion));
      c.moveTo(below, this.camera.quaternion.clone(), 0.5, { scale: 0.4, onDone: () => (c.group.visible = !c.pocketed) });
      this.sound.paper(null, 0.25, 'shove');
    }
    if (this.held?.kind === 'env') {
      this.held = null;
      this.ui.held(null);
    }
    this.env = null;
    this.state.current = null;
    this.state.envOpen = false;
    this.tintEnvelopes();
    this.updateTask();
    this.updateHintLabel();
    this.save();
  }

  // at the table: what is in your pocket goes onto the spike
  spikePocketed() {
    let n = 0;
    for (const id of this.state.spiked) {
      const c = this.cards.get(`env:${id}`);
      if (!c?.pocketed) continue;
      c.pocketed = false;
      const p = this.spike.pose(this.state.spiked.indexOf(id));
      const from = this.camera.position.clone().add(new THREE.Vector3(0.22, -0.5, -0.3).applyQuaternion(this.camera.quaternion));
      c.place(from, this.camera.quaternion.clone(), { scale: 0.4 });
      c.group.visible = true;
      c.moveTo(p.pos, p.q, 0.8, { arc: 0.12, scale: 0.9, delay: n * 0.25 });
      setTimeout(() => this.sound.paper([p.pos.x, p.pos.y, p.pos.z], 0.3, 'place'), 700 + n * 250);
      n++;
    }
  }

  // the envelope that is out back on its drawer's front, its cards in it, as it was taken
  // (only the admin panel does this: in the game an envelope goes back when it is filed)
  putEnvelopeBack() {
    const env = this.env;
    if (!env) return;
    if (this.reading) this.putDown();
    if (this.held) {
      this.held = null;
      this.ui.held(null);
    }
    for (const k of [...this.inBay, ...this.tableCards.filter((k) => this.cardInfo.get(k)?.e === env.e)]) {
      this.forget(k);
      this.removeCard(k);
    }
    this.cardBox.group.visible = false;
    this.strongbox.group.visible = false;
    const c = this.cards.get(this.envKey(env.e));
    c.flapTarget = c.flapOpen = 0;
    this.env = null;
    this.state.current = null;
    this.state.envOpen = false;
    this.placeEnvelopes();
    this.refreshPins();
  }

  // filed at once, without carrying anything (the admin panel)
  fileNow(e) {
    if (this.reading) this.putDown();
    if (this.env && this.env.e !== e) this.putEnvelopeBack();
    if (!this.env) this.takeEnvelope(e, { quiet: true });
    if (this.env?.e === e) {
      if (!this.env.sealed) this.sealEnvelope(e, { quiet: true });
      if (this.held?.kind === 'env' || this.held?.key?.startsWith(`${e.d.id}/`)) {
        this.held = null;
        this.ui.held(null);
      }
      this.env.done = true;
      this.cards.get(this.envKey(e))?.redraw();
      this.pocket(e, { quiet: true });
    }
    e.dg.userData.target = 0;
    this.fileDrawer(e);
  }

  // where the n-th card stands in the tray (in the tray's space): leaning back a little;
  // those in front of the one under the pointer fall forward, and it comes up
  standPose(i, key) {
    const n = Math.max(1, this.inBay.length);
    const h = this.cards.get(key)?.size.h ?? CARD_SIZE.h;
    const gap = Math.min(0.028, (BAY_DEPTH - 0.05) / n);
    const hov = this.bayHover ? this.inBay.indexOf(this.bayHover) : -1;
    const lean = hov >= 0 && i < hov ? -0.42 : 0.14;
    const lift = i === hov ? 0.035 : 0;
    const qz = new THREE.Quaternion().setFromAxisAngle(Z_AXIS, lean);
    const pos = new THREE.Vector3(-0.03 - i * gap, this.tray.floor + lift, 0)
      .add(new THREE.Vector3(0, h / 2, 0).applyQuaternion(qz));
    return { pos, q: qz.multiply(Q_STAND) };
  }

  // every card standing in the tray to its place, unless it is up to be read or in the hand
  poseBay(dur = 0.4, stagger = 0) {
    const busy = new Set([...(this.reading ? this.reading.list : []), this.held?.key]);
    this.inBay.forEach((k, i) => {
      const c = this.cards.get(k);
      if (!c || busy.has(k) || c.group.parent !== this.tray.group) return;
      const p = this.standPose(i, k);
      if (dur) c.moveTo(p.pos, p.q, dur, { local: true, delay: i * stagger });
      else c.place(p.pos, p.q, { local: true });
    });
  }

  setBayHover(key) {
    if (key === this.bayHover) return;
    this.bayHover = key;
    this.poseBay(0.2);
  }

  // every card on the table to its place
  poseTable() {
    const busy = new Set([...(this.reading ? this.reading.list : []), this.held?.key]);
    this.tableCards.forEach((k) => {
      const c = this.cards.get(k);
      if (!c || busy.has(k)) return;
      const p = this.restPose(k);
      c.moveTo(p.pos, p.q, 0.45, { arc: 0.05 });
    });
  }

  // A card from the tray onto the table, into the next free place; a fifth sends the oldest
  // back to stand in the tray.
  layOnTable(key) {
    if (this.tableCards.includes(key)) return;
    if (this.env?.open && this.tableCards.length >= TABLE_MAX) this.standBack(this.tableCards[0]);
    this.inBay = this.inBay.filter((k) => k !== key);
    this.tableCards.push(key);
    const c = this.makeCard(key);
    c.group.visible = true;
    c.setReading(false);
    c.flipped = false;
    const p = this.restPose(key);
    c.moveTo(p.pos, p.q, 0.6, { arc: 0.12 });
    this.poseBay();
    this.poseTable();
    this.refreshPins();
    setTimeout(() => this.sound.cardSlide([p.pos.x, p.pos.y, p.pos.z]), 450);
    this.save();
  }

  // a card back to stand in the tray, in its own place among the others
  standBack(key, dur = 0.5) {
    if (!this.env) return;
    this.tableCards = this.tableCards.filter((k) => k !== key);
    if (!this.inBay.includes(key)) {
      const order = this.envKeys(this.env.e);
      this.inBay.push(key);
      this.inBay.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    }
    const c = this.makeCard(key);
    c.group.visible = true;
    c.setReading(false);
    c.flipped = false;
    this.tray.group.attach(c.group);
    this.poseBay(dur);
    if (!dur) {
      const p = this.standPose(this.inBay.indexOf(key), key);
      c.place(p.pos, p.q, { local: true });
    }
    this.poseTable();
    this.refreshPins();
  }

  // a card that has gone where it belongs (home, under the door, onto the sill) is in
  // neither the tray nor on the table any more; the envelope's count says so
  forget(key) {
    this.tableCards = this.tableCards.filter((k) => k !== key);
    this.inBay = this.inBay.filter((k) => k !== key);
    this.poseBay();
    this.poseTable();
    if (this.env) this.cards.get(this.envKey(this.env.e))?.redraw();
  }

  // A card back where it belongs when nobody holds it: its place on the table, standing in
  // the tray, lying loose; the envelope in the bay.
  settle(key, dur = 0.5) {
    const c = this.cards.get(key);
    if (!c) return;
    c.group.visible = true;
    c.setReading(false);
    if (this.env && key === this.envKey(this.env.e)) {
      c.flipped = false;
      const p = this.bayPose();
      return c.moveTo(p.pos, p.q, dur, { scale: 0.9 });
    }
    if (this.tableCards.includes(key)) {
      const p = this.restPose(key);
      return c.moveTo(p.pos, p.q, dur, { arc: 0.05 });
    }
    if (this.loose.has(key)) {
      const p = this.loosePose(this.loose.get(key).slot);
      return c.moveTo(p.pos, p.q, dur);
    }
    if (this.inBay.includes(key)) {
      c.flipped = false;
      this.tray.group.attach(c.group);
      const p = this.standPose(this.inBay.indexOf(key), key);
      if (dur) c.moveTo(p.pos, p.q, dur, { local: true });
      else c.place(p.pos, p.q, { local: true });
    }
  }

  // the places of the helper cards out of the envelope (in the tray or on the table), in grey
  // on the map, joined in pencil
  refreshPins(animate = true) {
    const e = this.env?.e;
    const want = new Map();
    if (e && e.d.type === 'P2' && this.env.open) {
      for (const k of [...this.inBay, ...this.tableCards]) {
        const c = this.cardInfo.get(k)?.card;
        if (c?.role === 'helper' && c.geo) want.set('h-' + c.id, c);
      }
    }
    const solved = e && this.solved.has(e.d.id);
    for (const id of [...this.map.pins.keys()]) if (id.startsWith('h-') && !want.has(id) && !solved) this.map.removePin(id);
    for (const [id, c] of want) {
      if (this.map.pins.has(id)) continue;
      this.map.addPin(id, c.geo[0], c.geo[1], 'card', c.render.place, { animate });
      if (animate) this.sound.pinPush(this.map.worldPos(c.geo[0], c.geo[1]).toArray());
    }
    this.map.setSketch(e && e.d.type === 'P2' && !solved ? [...want.values()].map((c) => c.geo) : []);
  }

  // ------------------------------------------------------------------ the archive (section 3h)

  // A drawer slid out in place at its cabinet: behind the divider the cabinet's real cards on
  // grey stock (tonight's cream just behind it, once filed); any can be taken up to read.
  browse(dg) {
    const u = dg.userData, e = u.entry;
    if (this.browsing?.dg === dg) return this.closeBrowse();
    if (this.browsing) this.closeBrowse({ stay: true });
    const cid = e.cab.id;
    this.browsing = { dg, e, cid, j: e.j };
    u.target = 1;
    this.sound.drawer(dg.getWorldPosition(new THREE.Vector3()).toArray(), true);
    if (u.body?.children[1]) u.body.children[1].visible = false;
    const filed = this.filed.has(e.d.id);
    this.archive.load(cid).then(() => {
      if (this.browsing?.dg !== dg) return;
      const ours = filed ? (e.d.on_success?.stack || []).map((id) => `${e.d.id}/${id}`) : [];
      this.archive.showIn(dg, { cid, j: e.j, ours, note: e.j === 0 ? this.F.archive_note || 'Achter het schot hoef je vannacht niet.' : null });
      this.pointerMoved = true;
    });
    if (filed) this.react('reopen_filed');
    // look down into it, from in front of the cabinet (whose front faces +x): fully out, its
    // middle is a little in front of the cabinet
    const centre = dg.getWorldPosition(new THREE.Vector3());
    centre.x = CAB.front + 0.34 - 0.24;
    centre.y -= 0.03;
    const eye = centre.clone().add(new THREE.Vector3(0.62, 0.52, 0));
    this.rails.addStation('archive', eye, centre, 'La');
    this.goto('archive');
  }

  closeBrowse({ stay = false } = {}) {
    const b = this.browsing;
    if (!b) return;
    this.browsing = null;
    b.dg.userData.target = 0;
    this.sound.drawer(b.dg.getWorldPosition(new THREE.Vector3()).toArray(), false);
    this.archive.hide();
    if (b.dg.userData.body?.children[1]) b.dg.userData.body.children[1].visible = true;
    if (!stay && this.rails.current === 'archive') this.goto('cab' + (b.cid - 1));
  }

  archiveLabel(hit) {
    const a = this.archive.at(hit);
    if (!a) return '';
    if (a.kind === 'ours') return this.cardTip(this.makeCard(a.key));
    const r = this.archive.record(this.archive.cid, a.idx);
    return r ? `${r.p || '——'}, ${r.y || '?'} · ${r.c || ''}` : '…';
  }

  // a card from the archive (or one filed tonight) up to be read; it cannot be taken out
  openArchiveCard(hit) {
    const a = this.archive.at(hit);
    if (!a) return;
    const key = a.kind === 'ours' ? a.key : `arc:${this.archive.cid}:${a.idx}`;
    if (this.reading) this.putDown();
    const c = this.makeCard(key);
    c.group.visible = true;
    c.place(hit.point.clone(), Q_IN());
    this.reading = { mode: 'single', list: [key], index: 0, from: 'archive', at: hit.point.clone() };
    this.rails.parallax = false;
    this.layoutReading();
    this.sound.paper(hit.point.toArray(), 0.2);
  }

  // the reading log (3h): every card read tonight, for the back of your own card
  logRead(key) {
    let r = null;
    if (key.startsWith('arc:')) {
      const [, cid, idx] = key.split(':');
      const x = this.archive.record(Number(cid), Number(idx));
      if (x) r = { r: x.r, p: x.p, y: x.y, c: x.c, u: this.archive.index?.url?.replace('{n}', x.n) || '' };
    } else {
      const info = this.cardInfo.get(key);
      const card = info?.card;
      if (card?.story_id) r = { r: card.story_id, p: card.render.place, y: card.render.year, c: card.render.code, u: card.render.url || '' };
    }
    if (r && !this.state.readLog.some((x) => x.r === r.r)) this.state.readLog.push(r);
  }

  // shut: the drawer is filed
  shutDrawer(e) {
    if (this.shutting?.e !== e) return;
    clearTimeout(this.shutting.t);
    this.shutting = null;
    const u = e.dg.userData;
    u.target = 0;
    this.sound.drawer(e.dg.getWorldPosition(new THREE.Vector3()).toArray(), false);
    setTimeout(() => this.sound.clunk(e.dg.getWorldPosition(new THREE.Vector3()).toArray()), 380);
    // looked into for the insertion: once it is in, you stand back from the cabinet
    if (this.browsing?.dg === e.dg) {
      const b = this.browsing;
      this.browsing = null;
      setTimeout(() => {
        if (this.browsing) return;
        this.archive.hide();
        if (u.body?.children[1]) u.body.children[1].visible = true;
      }, 500);
      if (this.rails.current === 'archive') this.goto('cab' + (b.cid - 1));
    }
    this.fileDrawer(e);
  }

  fileDrawer(e, { quiet = false } = {}) {
    const d = e.d;
    if (this.filed.has(d.id)) return;
    this.dstate.set(d.id, 'filed');
    this.filed.add(d.id);
    // the typewriter's page goes with its drawer
    if (d.type === 'R4') {
      this.tw.lines = [];
      this.tw.prefix = this.tw.current = '';
      this.tw.redraw();
    }
    this.relabelAll();
    this.updateTask();
    this.updateHintLabel();
    if (this.cabDone(e.cab.id)) this.cabinetDone(e.cab.id, quiet);
    else if (!quiet) this.atmos.filedOne(FAMILY_ORDER[e.cab.id - 1]);
    if (!quiet) this.save();
  }

  // J.J.V.'s short notes (section 3e), each once
  react(key) {
    const text = this.F.reactions?.[key];
    if (!text || this.state.reacted.includes(key)) return;
    this.state.reacted.push(key);
    this.ui.note(text, { ms: 3200 });
  }

  liftedCards() {
    if (!this.reading) return [];
    return this.reading.list.map((k) => this.cards.get(k)).filter(Boolean);
  }

  openCard(key) {
    const list = this.tableCards.slice();
    const idx = list.indexOf(key);
    if (idx < 0) return;
    if (this.reading) this.putDown();
    this.reading = { mode: 'single', list, index: idx, from: 'table' };
    this.rails.parallax = false;
    this.layoutReading();
    this.sound.paper([TABLE.x, TABLE.y + 0.3, TABLE.z + 0.4], 0.2);
  }

  // a card standing in the tray comes up to be read; the others in it can be gone through
  // from there
  openFromBay(key) {
    if (!this.inBay.includes(key)) return;
    if (this.reading) this.putDown();
    const list = this.inBay.slice();
    this.reading = { mode: 'single', list, index: list.indexOf(key), from: 'bay' };
    this.rails.parallax = false;
    this.layoutReading();
    this.sound.paper([BAY_POS.x, BAY_POS.y + 0.1, BAY_POS.z], 0.25);
  }

  openLoose(key) {
    if (!this.loose.has(key)) return;
    if (this.reading) this.putDown();
    this.reading = { mode: 'single', list: [key], index: 0, from: 'loose' };
    this.rails.parallax = false;
    this.layoutReading();
    this.sound.paper([TABLE.x, TABLE.y + 0.3, TABLE.z + 0.2], 0.2);
  }

  openCompare() {
    if (this.tableCards.length < 2) return;
    if (this.reading) this.putDown();
    this.reading = { mode: 'compare', list: this.tableCards.slice(), index: 0, from: 'table' };
    this.rails.parallax = false;
    this.layoutReading();
    this.sound.paper([TABLE.x, TABLE.y + 0.3, TABLE.z + 0.4], 0.25);
  }

  // The box of loose halves, fanned out under the top half: try one, and it either
  // joins or springs back.
  openFan() {
    const e = this.current;
    if (!e || e.d.type !== 'P4' || this.solved.has(e.d.id)) return;
    if (this.reading) this.putDown();
    if (this.held) this.putBackHeld({ force: true });
    const top = `${e.d.id}/${e.d.lock.top_card}`;
    if (!this.cards.has(top)) return;
    const keys = e.d.cards.filter((c) => c.role === 'bottom' || c.role === 'distractor').map((c) => `${e.d.id}/${c.id}`)
      .filter((k) => !this.isOut(k));
    const from = this.cardBox.group.position.clone().add(new THREE.Vector3(0, 0.05, 0));
    for (const k of keys) {
      const c = this.makeCard(k);
      c.group.visible = true;
      c.place(from, new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)));
    }
    this.fanHover = null;
    this.fanClose = null;
    this.reading = { mode: 'fan', list: [top, ...keys], index: 0, from: 'box' };
    this.rails.parallax = false;
    this.layoutReading();
    this.sound.shuffle([KIT_POS.x, KIT_POS.y + 0.1, KIT_POS.z]);
  }

  // the top half alone in the first row; the twelve halves below it, four to a row
  fanPose(i, n) {
    const q = this.rails.baseQuat.clone();
    const { vw, vh } = this.viewFrame();
    const W = CARD_SIZE.w, H = CARD_SIZE.h / 2, gap = 0.01, sep = 0.03;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    // held up (closeHalf): the top half and the half under it, as wide as the screen allows;
    // the other halves lie in their box meanwhile
    if (this.fanClose != null) {
      if (i !== 0 && i !== this.fanClose) {
        return { pos: this.cardBox.group.position.clone().add(new THREE.Vector3(0, 0.03 + i * 0.0008, 0)), q: Q_FLAT(0) };
      }
      const d = Math.max(W / (0.94 * vw), (2 * H + 0.004) / (0.62 * vh));
      const oy = (i === 0 ? 1 : -1) * (H / 2 + 0.002) + vh * d * 0.04;
      return { pos: this.rails.basePos.clone().add(fwd.multiplyScalar(d)).add(up.multiplyScalar(oy)), q };
    }
    const cols = 3, rows = 1 + Math.ceil((n - 1) / cols);
    const tw = cols * W + (cols - 1) * gap, th = rows * H + (rows - 1) * gap + sep;
    let d = Math.max(tw / (0.94 * vw), th / (0.8 * vh));
    const row = i === 0 ? 0 : 1 + Math.floor((i - 1) / cols);
    const ox = i === 0 ? 0 : (((i - 1) % cols) - (cols - 1) / 2) * (W + gap);
    let oy = th / 2 - H / 2 - row * (H + gap) - (row ? sep : 0) + vh * d * 0.02;
    let ox2 = ox;
    // the half under the pointer comes forward, to be read
    if (i > 0 && this.fanHover === i) {
      const k = 0.55;
      d *= k;
      ox2 *= k;
      oy *= k;
      // and stays on the screen, which on a narrow one it would not from an outer column
      const room = 0.48 * vw * d - W / 2;
      ox2 = THREE.MathUtils.clamp(ox2, -Math.max(0, room), Math.max(0, room));
    }
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    return { pos: this.rails.basePos.clone().add(fwd.multiplyScalar(d)).add(right.multiplyScalar(ox2)).add(up.multiplyScalar(oy)), q };
  }

  // Hold the i-th half up under the top half, large, the others back in the box (null: the
  // fan again). For a finger, which cannot hover over the fan to read.
  closeHalf(i) {
    const R = this.reading;
    if (!R || R.mode !== 'fan' || this.trying) return;
    this.fanClose = i;
    this.fanHover = null;
    R.list.forEach((k, j) => {
      const c = this.cards.get(k);
      if (!c) return;
      const p = this.fanPose(j, R.list.length);
      c.moveTo(p.pos, p.q, 0.4);
    });
    this.sound.paper(null, 0.12);
    this.refreshCardbar();
  }

  setFanHover(key) {
    const R = this.reading;
    const i = key ? R.list.indexOf(key) : -1;
    const idx = i > 0 ? i : null;
    if (idx === this.fanHover || this.trying || this.fanClose != null) return;
    const was = this.fanHover;
    this.fanHover = idx;
    for (const j of [was, idx]) {
      if (j == null) continue;
      const c = this.cards.get(R.list[j]);
      const p = this.fanPose(j, R.list.length);
      c?.moveTo(p.pos, p.q, 0.18);
    }
  }

  // A half from the fan goes under the top half: the right one stays, a wrong one springs back.
  tryHalf(key) {
    const R = this.reading;
    if (this.trying || !R || key === R.list[0]) return;
    const e = this.current;
    const card = this.cards.get(key);
    const i = R.list.indexOf(key);
    const topPose = this.fanPose(0, R.list.length);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(topPose.q);
    const under = topPose.pos.clone().add(up.multiplyScalar(-CARD_SIZE.h / 2 - 0.001));
    this.fanHover = null;
    this.trying = true;
    this.sound.paper(null, 0.2);
    card.moveTo(under, topPose.q, 0.35, {
      onDone: () => {
        if (key === `${e.d.id}/${e.d.lock.bottom_card}`) {
          this.sound.cardSlide([TABLE.x, TABLE.y, TABLE.z + 0.2]);
          // joined, the two halves lie on the table together
          this.inBay = this.inBay.filter((k) => k !== R.list[0]);
          for (const k of [R.list[0], key]) if (!this.tableCards.includes(k)) this.tableCards.push(k);
          setTimeout(() => {
            this.trying = false;
            // the other halves go back into the box; the joined card goes down on the table
            for (const k of R.list.slice(1)) {
              if (k === key) continue;
              this.cards.get(k)?.moveTo(this.cardBox.group.position.clone().add(new THREE.Vector3(0, 0.04, 0)),
                this.cards.get(k).group.quaternion, 0.45, { onDone: () => this.removeCard(k) });
            }
            R.list = [R.list[0], key];
            this.solve(e);
            this.putDown();
          }, 1300);
          return;
        }
        // they spring apart
        this.sound.locked([TABLE.x, TABLE.y, TABLE.z]);
        this.ui.note(this.F.nee, { ms: 1400 });
        setTimeout(() => {
          // held up, all go back into the fan
          if (this.fanClose != null) {
            this.trying = false;
            return this.closeHalf(null);
          }
          const back = this.fanPose(i, R.list.length);
          card.moveTo(back.pos, back.q, 0.3, { onDone: () => (this.trying = false) });
        }, 250);
      },
    });
  }

  liftPose(i, count, half = false) {
    const cam = this.camera;
    const q = this.rails.baseQuat.clone();
    const base = this.rails.basePos.clone();
    const { vw, vh } = this.viewFrame();
    const W = CARD_SIZE.w, H = half ? CARD_SIZE.h / 2 : CARD_SIZE.h, gap = 0.012;
    let d, ox = 0, oy = 0;
    if (count === 1) {
      d = Math.max(W / ((cam.aspect < 1 ? 0.94 : 0.68) * vw), H / (0.64 * vh));
    } else {
      const cols = count > 4 ? 3 : 2, rows = Math.ceil(count / cols);
      const tw = cols * W + (cols - 1) * gap, th = rows * H + (rows - 1) * gap;
      d = Math.max(tw / (0.94 * vw), th / (0.72 * vh));
      const col = i % cols, row = Math.floor(i / cols);
      ox = (col - (cols - 1) / 2) * (W + gap);
      oy = ((rows - 1) / 2 - row) * (H + gap);
    }
    oy += vh * d * (count === 1 ? 0.045 : 0.01);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    return { pos: base.add(fwd.multiplyScalar(d)).add(right.multiplyScalar(ox)).add(up.multiplyScalar(oy)), q };
  }

  layoutReading() {
    const R = this.reading;
    if (!R) return;
    const list = this.liftedCards();
    const many = R.mode === 'compare' || R.mode === 'fan';
    list.forEach((card, i) => {
      card.setReading(many || i === R.index);
      if (many) {
        const { pos, q } = R.mode === 'fan' ? this.fanPose(i, list.length) : this.liftPose(i, list.length);
        card.moveTo(pos, q, 0.55);
      } else if (i === R.index) {
        const { pos, q } = this.liftPose(0, 1, !!card.half);
        card.moveTo(pos, q, 0.7);
      } else if (R.from === 'table' || R.from === 'bay') {
        this.settle(card.key);
      }
    });
    // what is read goes into the night's reading log (3h)
    if (R.mode === 'single' && list[R.index]) this.logRead(list[R.index].key);
    else if (R.mode === 'compare') for (const c of list) this.logRead(c.key);
    // the room lock waits until a card of its drawer has been read (wakeRoomLock)
    const e = this.current;
    if (e && list.some((c) => this.cardInfo.get(c.key)?.e === e)) this.wasRead.add(e.d.id);
    document.body.classList.add('reading');
    this.refreshCardbar();
  }

  // where a table card lies when nobody holds it; a torn card, joined, lies whole
  restPose(key) {
    const info = this.cardInfo.get(key);
    if (info?.e.d.type === 'P4' && this.solved.has(info.e.d.id) && info.card.render.half) return this.halfPose(info.card.render.half);
    return this.slotPose(this.tableCards.indexOf(key), key);
  }

  // A card may be taken from the table where a lock wants a card brought to it: any of
  // a misfiled-card drawer's four, the window's, door's or typewriter's cards; the desk
  // card can always be filed.
  canTake(key) {
    const info = this.cardInfo.get(key);
    if (!info) return false;
    if (this.state.floor?.key === key) return !this.state.floor.done;
    if (info.card.role === 'desk') return !this.state.deskFiled;
    const d = info.e.d;
    if (this.stateOf(d.id) !== 'open') return false;
    if (d.type === 'R4') return info.card.role !== 'top';
    return ['P3', 'R2', 'R3'].includes(d.type);
  }

  refreshCardbar() {
    const R = this.reading;
    if (!R) return;
    const list = this.liftedCards();
    const cur = R.mode === 'single' ? list[R.index] : null;
    const table = R.from === 'table' && list.length > 1;
    const bay = R.from === 'bay';
    const own = cur && this.env?.open && this.cardInfo.get(cur.key)?.e === this.env.e;
    // the box of halves: by finger, one held up to read, the others to go through
    if (R.mode === 'fan') {
      const close = this.fanClose != null;
      return this.ui.showCardbar(true, { nav: close || null, join: close || null, compare: close ? { label: 'Alle stukken' } : null });
    }
    this.ui.showCardbar(true, {
      flip: cur && cur.key !== NOTE ? { flipped: !!cur.flipped } : null,
      compare: table ? { compare: R.mode === 'compare' } : null,
      nav: R.mode === 'single' && (table || (bay && list.length > 1)) ? true : null,
      take: cur && this.canTake(cur.key) ? true : null,
      // from the tray onto the table; from the table back into the tray
      lay: bay && cur ? true : null,
      stand: R.from === 'table' && cur && own ? true : null,
      down: bay ? 'Terugzetten' : 'Terugleggen',
    });
  }

  cardAction(act) {
    const R = this.reading;
    if (!R) return;
    const list = this.liftedCards();
    if (act === 'down') return this.putDown();
    if (act === 'take' && R.mode === 'single') return this.take(list[R.index].key);
    if (act === 'lay' && R.from === 'bay') {
      const key = list[R.index].key;
      this.putDown();
      return this.layOnTable(key);
    }
    if (act === 'stand' && R.from === 'table' && R.mode === 'single') {
      const key = list[R.index].key;
      if (!this.env?.open || this.cardInfo.get(key)?.e !== this.env.e) return;
      this.putDown();
      this.standBack(key);
      return this.save();
    }
    if (act === 'flip' && R.mode === 'single' && list[R.index]?.key !== NOTE) {
      list[R.index].flip();
      this.sound.paper(null, 0.15, 'flip');
      this.refreshCardbar();
      return;
    }
    if (R.mode === 'fan') {
      const n = list.length;
      if (act === 'join' && this.fanClose != null) return this.tryHalf(R.list[this.fanClose]);
      if (act === 'compare') return this.closeHalf(null);
      if ((act === 'next' || act === 'prev') && this.fanClose != null && n > 2) {
        // through the halves only, never to the top one
        const k = this.fanClose - 1, m = n - 1;
        return this.closeHalf(1 + ((k + (act === 'next' ? 1 : m - 1)) % m));
      }
      return;
    }
    if (act === 'next' || act === 'prev') {
      if (R.mode !== 'single' || list.length < 2 || !['table', 'bay'].includes(R.from) || R.switching) return;
      // one card back in its place first, then the next taken up
      const old = list[R.index];
      old.flipped = false;
      R.index = (R.index + (act === 'next' ? 1 : list.length - 1)) % list.length;
      R.switching = true;
      this.settle(old.key, 0.6);
      this.sound.paper(null, 0.12, 'place');
      setTimeout(() => {
        if (this.reading !== R) return;
        R.switching = false;
        this.layoutReading();
        this.sound.paper(null, 0.15);
      }, 650);
      return;
    }
    if (act === 'compare') {
      if (R.from !== 'table' || list.length < 2) return;
      list.forEach((c) => (c.flipped = false));
      R.mode = R.mode === 'compare' ? 'single' : 'compare';
      this.layoutReading();
    }
  }

  putDown() {
    const R = this.reading;
    if (!R) return;
    this.reading = null;
    this.fanClose = null;
    for (const card of R.list.map((k) => this.cards.get(k)).filter(Boolean)) {
      card.setReading(false);
      if (R.from !== 'loose') card.flipped = false;
      if (R.from === 'table' || R.from === 'bay' || R.from === 'env') {
        this.settle(card.key);
      } else if (R.from === 'reveal') {
        // the room lock's card: back with the others, or (the door's) gone
        const key = card.key;
        if (!this.env || !this.envKeys(this.env.e).includes(key)) card.moveTo(card.group.position.clone().add(new THREE.Vector3(0, -0.4, 0)), card.group.quaternion, 0.4, { onDone: () => this.removeCard(key) });
      } else if (R.from === 'archive') {
        // back into its place in the drawer
        const key = card.key;
        card.moveTo(R.at, Q_IN(), 0.5, { scale: 0.9, onDone: () => this.removeCard(key) });
      } else if (R.from === 'loose') {
        const l = this.loose.get(card.key);
        const p = this.loosePose(l ? l.slot : 1);
        card.moveTo(p.pos, p.q, 0.5);
      } else if (R.from === 'found') {
        // a card picked up in the room: into the hand, to take to the table (or to its drawer);
        // picked up at the table itself, it goes straight down among the others
        this.toHand(card.key);
        if (this.atTable() && this.isOut(card.key)) setTimeout(() => this.putBackHeld({ force: true }), 450);
      } else if (R.from === 'box') {
        // the top half (and a half that fits it) back where it was, the rest into the box
        const key = card.key;
        if (key === R.list[0] || this.tableCards.includes(key)) {
          this.settle(key);
        } else {
          card.moveTo(this.cardBox.group.position.clone().add(new THREE.Vector3(0, 0.04, 0)), card.group.quaternion, 0.45,
            { onDone: () => this.removeCard(key) });
        }
      }
    }
    if (R.from === 'bay') this.poseBay();
    document.body.classList.remove('reading');
    this.rails.parallax = true;
    this.ui.showCardbar(false);
    this.sound.paper(null, 0.12, 'place');
  }

  showNote() {
    if (!this.loose.has(NOTE)) this.placeLoose(NOTE, 0);
    this.openLoose(NOTE);
  }

  // ------------------------------------------------------------------ carrying a card

  take(key) {
    const card = this.cards.get(key);
    if (!card) return;
    this.putDown();
    // one card in the hand at a time: the other goes back in its place
    if (this.held) this.putBackHeld({ force: true });
    this.toHand(key);
    this.sound.paper(null, 0.2);
  }

  // in the hand: small, at the bottom right of what you see, wherever you walk
  holdPose() {
    const q = this.camera.quaternion;
    const pos = this.camera.position.clone().add(new THREE.Vector3(0.165, -0.125, -0.42).applyQuaternion(q));
    return { pos, q: q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.55, -0.3, 0.12))) };
  }

  // the held card goes back to its place on the table; away from the table, you walk there
  // first (force: it is put back where you are, as at the table itself)
  putBackHeld({ force = false } = {}) {
    const h = this.held;
    if (!h) return;
    if (!force && !this.atTable()) {
      this.pendingPutBack = true;
      return this.goto('table');
    }
    this.pendingPutBack = false;
    // the envelope: emptied, onto the spike; else back into the bay
    if (h.kind === 'env') {
      this.held = null;
      this.ui.held(null);
      this.env.phase = 'table';
      this.settle(this.envKey(this.env.e), 0.6);
      return;
    }
    // a card of an envelope whose cards have gone back in: it goes in too
    if (this.env?.sealing && this.envKeys(this.env.e).includes(h.key)) {
      const c = this.cards.get(h.key);
      this.held = null;
      this.ui.held(null);
      const into = this.cards.get(this.envKey(this.env.e)).group.getWorldPosition(new THREE.Vector3());
      c.moveTo(into, Q_FLAT(0), 0.6, { arc: 0.1, scale: 0.85, onDone: () => { this.removeCard(h.key); this.closeIfComplete(400); } });
      return;
    }
    if (h.kind === 'card' && this.isOut(h.key)) return this.layFound(h.key);
    if (h.kind === 'card' && this.state.floor?.key === h.key) {
      this.held = null;
      this.ui.held(null);
      this.placeLoose(h.key, 2, { from: this.cards.get(h.key).group.position.clone() });
      return;
    }
    this.held = null;
    this.ui.held(null);
    if (!this.cards.has(h.key)) return;
    // back on the table, or to stand in the tray, wherever it was taken from
    if (!this.tableCards.includes(h.key) && !this.loose.has(h.key) && !this.inBay.includes(h.key)) {
      if (this.env?.open && this.cardInfo.get(h.key)?.e === this.env.e) return this.standBack(h.key);
      this.tableCards.push(h.key);
    }
    this.settle(h.key, 0.6);
  }

  // Dropped on a cabinet: the desk card goes anywhere; a misfiled card must find its own
  // (cabinet 5 takes its card through the slot in its locked front).
  dropOn(i) {
    const h = this.held;
    if (h?.kind === 'env') return this.dropEnvelope(i);
    if (!h || h.kind !== 'card') return;
    const cid = i + 1;
    if (!this.near(this.cabinets[i].group, 2.6) && this.rails.current !== 'cab' + i) {
      this.pendingDrop = i;
      return this.goto('cab' + i);
    }
    if (this.state.floor?.key === h.key) return this.fileFloor(i);
    const info = this.cardInfo.get(h.key);
    if (info.card.role === 'desk') {
      if (i === CLOSED && !this.state.fiveOpen) return this.refuse(this.F.nee);
      this.state.deskFiled = true;
      this.fileInto(i, h.key);
      this.save();
      return;
    }
    const d = info.e.d;
    if (d.lock.kind === 'card_to_cabinet' && info.card.id === d.lock.card) {
      if (cid === d.lock.cabinet) return this.sendHome(h.key, info.e);
      return this.refuse(this.F.nee);
    }
    // a puzzle's own card goes back with its envelope, not by itself (3b)
    this.refuse(this.F.into_envelope || 'In de envelop.');
  }

  // A held card on a drawer: the desk card goes in silently; a misfiled card counts on
  // any drawer of its cabinet; any other puzzle card belongs in its envelope.
  dropOnDrawer(e, dg) {
    const h = this.held;
    if (this.state.floor?.key === h.key) return this.fileFloor(dg.userData.cabinet, dg);
    const info = this.cardInfo.get(h.key);
    const i = dg.userData.cabinet;
    if (info.card.role === 'desk') {
      if (i === CLOSED && !this.state.fiveOpen) return this.refuse(this.F.nee);
      this.state.deskFiled = true;
      this.fileInto(i, h.key, null, dg);
      this.save();
      return;
    }
    const d = info.e.d;
    if (d.lock.kind === 'card_to_cabinet' && info.card.id === d.lock.card) {
      if (i + 1 === d.lock.cabinet) return this.sendHome(h.key, info.e);
      return this.refuse(this.F.nee);
    }
    this.refuse(this.F.into_envelope || 'In de envelop.');
  }

  // Not here: J.J.V. says so, and what you carry stays in your hand. A card is swapped
  // or put back at the table, not by magic.
  refuse(text) {
    this.ui.note(text, { ms: 1800 });
    this.sound.locked(this.rails.basePos.toArray());
  }

  // a card into the hand (taken up, or back from the windowsill, from under the door)
  toHand(key) {
    const card = this.cards.get(key);
    if (!card) return;
    this.held = { key, kind: 'card' };
    card.group.visible = true;
    card.setReading(false);
    const p = this.holdPose();
    card.moveTo(p.pos, p.q, 0.5, { arc: 0.04, scale: 0.42, onDone: () => (card.follow = () => this.holdPose()) });
    card.setOnTop(true);
    const info = this.cardInfo.get(key);
    const place = info.card.role === 'desk' ? 'Amsterdam' : info.card.render.place;
    this.ui.held(info.card.render.half ? 'halve kaart' : `kaart uit ${place}`);
    this.poseBay();
  }

  // The misfiled card goes home: the cabinet it belongs to unlocks; its first drawer slides
  // out and the card, J.J.V.'s pencil appearing on it as it goes, slips in behind the
  // divider (its envelope's count drops by one). The last one goes through the slot in
  // cabinet 5's front.
  sendHome(key, e) {
    const d = e.d;
    const dest = d.lock.cabinet;
    const card = this.cards.get(key);
    this.held = null;
    this.ui.held(null);
    this.forget(key);
    if (dest !== 5) this.unlock(dest);
    // held up before you, and the note comes
    const lift = this.liftPose(0, 1);
    card.group.visible = true;
    card.place(lift.pos.clone().add(new THREE.Vector3(0, -0.3, 0).applyQuaternion(this.rails.baseQuat)), lift.q);
    card.moveTo(lift.pos, lift.q, 0.5);
    card.setReading(true);
    setTimeout(() => {
      this.state.trail[key] = d.on_success?.trail_note ?? 0;
      card.redraw();
      this.sound.paper(null, 0.2);
    }, 700);
    const dg = dest === 5 ? null : this.cabinets[dest - 1].drawers.find((g) => g.userData.kind === 'puzzle' && g.userData.slot === 0);
    if (dg) {
      setTimeout(() => {
        dg.userData.target = 1;
        this.sound.drawer(dg.getWorldPosition(new THREE.Vector3()).toArray(), true);
      }, 2700);
    }
    setTimeout(() => {
      card.setReading(false);
      const into = dg ? dg.localToWorld(new THREE.Vector3(-0.08, 0.02, 0))
        : this.slot.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(-0.01, 0, 0));
      card.moveTo(into, Q_IN(), 0.9, {
        arc: 0.15,
        onDone: () => {
          this.removeCard(key);
          this.sound.cardSlide(into.toArray(), 0.3, 'shove');
          this.solve(e);
          if (dg) {
            setTimeout(() => {
              dg.userData.target = 0;
              this.sound.drawer(dg.getWorldPosition(new THREE.Vector3()).toArray(), false);
            }, 500);
          }
        },
      });
    }, 3400);
  }

  // The card goes where it belongs: the drawer clicked, else the drawer whose heading
  // carries its number (or 'Nog te ordenen'). The drawer slides out, the card drops in, it shuts.
  fileInto(i, key, then, dg = null) {
    const cab = this.cabinets[i];
    const info = this.cardInfo.get(key);
    const type = (info?.card.render.code || '').split(' ')[1];
    dg = dg || cab.drawers.find((g) => g.userData.kind === 'type' && g.userData.code === type)
      || cab.drawers.find((g) => g.userData.title === 'Nog te ordenen')
      || cab.drawers.find((g) => g.userData.kind !== 'puzzle');
    const u = dg.userData;
    const pos = dg.getWorldPosition(new THREE.Vector3()).toArray();
    const card = this.cards.get(key);
    this.held = null;
    this.ui.held(null);
    this.loose.delete(key);
    this.forget(key);
    // out of the hand, held up in front of the cabinet
    card.group.visible = true;
    card.place(this.liftPose(0, 1).pos.add(new THREE.Vector3(0, -0.35, 0).applyQuaternion(this.rails.baseQuat)), this.rails.baseQuat);
    card.setReading(false);
    const was = u.target;
    u.target = 1;
    this.sound.drawer(pos, true);
    setTimeout(() => {
      const into = dg.localToWorld(new THREE.Vector3(-0.2, 0.04, 0));
      card.moveTo(into, Q_IN(), 0.8, {
        arc: 0.12,
        onDone: () => {
          this.removeCard(key);
          this.sound.cardSlide(pos, 0.3, 'shove');
          setTimeout(() => {
            u.target = was;
            this.sound.drawer(pos, false);
            then?.();
          }, 450);
        },
      });
    }, 750);
  }

  // ------------------------------------------------------------------ found cards (section 3c)

  // J.J.V.'s note on where the missing card is (none for the bin: he threw it away)
  foundNote(d) {
    const key = `${d.id}/${d.found_card.card}`;
    const loc = this.found.get(key)?.loc;
    return this.F.found_notes?.[loc] || null;
  }

  placeFoundFor(e) {
    for (const [key, f] of this.found) if (f.e === e && this.isOut(key)) this.placeFound(key);
  }

  // where a found card lies, by its place in the room
  foundPose(loc) {
    if (loc === 'chair') return { pos: this.chairSeat().add(new THREE.Vector3(0, 0.012, 0)), q: Q_FLAT(0.7) };
    if (loc === 'lamp') return { pos: new THREE.Vector3(LAMP_POS.x + 0.02, TABLE.y + LIE - 0.0004, LAMP_POS.z + 0.075), q: Q_FLAT(0.32) };
    if (loc === 'typewriter') {
      // stuck in the machine in front of the paper, standing up out of it
      const paper = this.tw.paper;
      const q = paper.getWorldQuaternion(new THREE.Quaternion());
      const pos = paper.getWorldPosition(new THREE.Vector3())
        .add(new THREE.Vector3(0.035, 0.07, 0.004).applyQuaternion(q));
      return { pos, q: q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.06))) };
    }
    return { pos: new THREE.Vector3(0.45, 0.004, ROOM.z1 - 0.8), q: Q_FLAT(0.6) };
  }

  // the seat of the armchair by the window, found by looking down on it
  chairSeat() {
    const ch = this.sc.chair_window;
    const box = new THREE.Box3().setFromObject(ch);
    const c = box.getCenter(new THREE.Vector3());
    const rc = new THREE.Raycaster();
    let best = null;
    for (const [dx, dz] of [[0, 0], [0.06, 0.06], [-0.06, 0.06], [0.06, -0.06], [-0.06, -0.06], [0, 0.1], [0, -0.1], [0.1, 0], [-0.1, 0]]) {
      rc.set(new THREE.Vector3(c.x + dx, box.max.y + 0.2, c.z + dz), new THREE.Vector3(0, -1, 0));
      const hit = rc.intersectObject(ch, true)[0];
      if (hit && hit.point.y > 0.3 && hit.point.y < 0.7 && (!best || hit.point.y < best.y)) best = hit.point.clone();
    }
    return best || new THREE.Vector3(c.x, 0.48, c.z);
  }

  // A found card where it lies: a card on the chair, under the lamp, in the typewriter; a
  // pocket in the coat; a ball of paper in the bin.
  placeFound(key) {
    const f = this.found.get(key);
    if (!f || f.placed) return;
    f.placed = true;
    f.inHand = false;
    if (f.loc === 'bin') {
      const box = new THREE.Box3().setFromObject(this.sc.basket);
      // dented by where each point is, so the faces stay joined
      const geo = new THREE.IcosahedronGeometry(0.045, 3);
      const v = geo.attributes.position;
      for (let i = 0; i < v.count; i++) {
        const x = v.getX(i), y = v.getY(i), z = v.getZ(i);
        const k = 0.8 + 0.12 * Math.sin(x * 180 + y * 70) + 0.1 * Math.sin(y * 210 - z * 90) + 0.08 * Math.sin(z * 260 + x * 50);
        v.setXYZ(i, x * k, y * k * 0.85, z * k);
      }
      geo.computeVertexNormals();
      const ball = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.95, flatShading: true,
        emissive: new THREE.Color(0x2a2620) }));
      ball.position.set((box.min.x + box.max.x) / 2 + 0.02, box.max.y - 0.025, (box.min.z + box.max.z) / 2);
      this.scene.add(ball);
      f.obj = ball;
    } else if (f.loc === 'coat') {
      // a pocket on the side of the coat that faces the room, a card's corner out of it
      const box = new THREE.Box3().setFromObject(this.sc.coat);
      const at = new THREE.Vector3(box.min.x + 0.012, box.min.y + 0.4, (box.min.z + box.max.z) / 2 + 0.06);
      const pocket = new THREE.Group();
      pocket.position.copy(at);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.075, 0.17),
        new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.95 }));
      flap.position.set(-0.012, -0.02, 0);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
      pocket.add(flap, hit);
      this.scene.add(pocket);
      const card = this.makeCard(key);
      card.group.visible = true;
      card.place(at.clone().add(new THREE.Vector3(-0.004, 0.035, 0.01)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0.14)));
      card.group.scale.setScalar(0.55);
      f.obj = pocket;
    } else {
      const card = this.makeCard(key);
      card.group.visible = true;
      const { pos, q } = this.foundPose(f.loc);
      card.place(pos, q);
      f.obj = card.group;
    }
    const label = { chair: 'Een kaart op de leunstoel', lamp: 'Een kaart onder de lamp', coat: 'De jas van J.J.V.',
      typewriter: 'Een kaart in de machine', bin: 'Een prop papier in de prullenmand', floor: 'Een kaart op de vloer' }[f.loc];
    this.hot(f.obj, {
      label: () => label,
      when: () => f.placed && !f.inHand && (f.floor ? !this.state.floor?.done : this.isOut(key)) && !this.held && !this.reading,
      click: () => this.takeFound(key),
      coarse: f.loc === 'coat',
    });
  }

  // Take it up where it is (stepping over to it first): it comes up to be read; put down,
  // it is in the hand.
  takeFound(key) {
    const f = this.found.get(key);
    if (!f || f.inHand) return;
    const at = f.obj.getWorldPosition(new THREE.Vector3());
    const near = ((f.loc === 'lamp' || f.loc === 'typewriter') && this.atTable())
      || Math.hypot(at.x - this.rails.basePos.x, at.z - this.rails.basePos.z) < 1.7;
    if (!near) {
      // step up to it: from the table's side; the coat from the room side
      const dir = f.loc === 'coat' ? new THREE.Vector3(-1, 0, -0.25).normalize()
        : new THREE.Vector3(TABLE.x - at.x, 0, TABLE.z - at.z).normalize();
      const eye = at.clone().addScaledVector(dir, f.loc === 'coat' ? 1.15 : 0.95).setY(1.5);
      this.rails.addStation('found', eye, at.clone(), 'Kaart');
      this.pendingFound = key;
      return this.goto('found');
    }
    f.inHand = true;
    if (this.reading) this.putDown();
    if (f.loc === 'lamp') {
      this.lampWobble = 1;
      this.sound.dialClick(LAMP_POS.toArray());
    }
    let card = this.cards.get(key);
    card?.group.scale.setScalar(1);
    if (f.loc === 'bin' || f.loc === 'coat' || !card) {
      card = this.makeCard(key);
      card.group.visible = true;
      card.place(at, Q_FLAT(0));
      if (f.loc === 'bin') {
        this.scene.remove(f.obj);
        if (!this.state.crumple[key]) this.state.crumple[key] = 'crumpled';
        card.redraw();
      }
    }
    this.reading = { mode: 'single', list: [key], index: 0, from: 'found' };
    this.rails.parallax = false;
    this.layoutReading();
    this.sound.paper(at.toArray(), 0.35);
    this.save();
  }

  // the found card joins the others: on the table (a fifth sends the oldest back into the
  // drawer), or, a torn half, into the box of halves
  layFound(key) {
    const f = this.found.get(key);
    const e = f.e, d = e.d;
    this.held = null;
    this.ui.held(null);
    this.state.foundDone[key] = true;
    const card = this.cards.get(key);
    card.group.visible = true;
    card.setReading(false);
    const ours = this.env?.e === e;
    if (d.type === 'P4') {
      if (ours) {
        this.cardBox.group.visible = true;
        card.moveTo(this.cardBox.group.position.clone().add(new THREE.Vector3(0, 0.05, 0)), Q_FLAT(0), 0.8,
          { arc: 0.2, onDone: () => this.removeCard(key) });
      } else this.removeCard(key);
    } else if (ours && this.env.open) {
      // it joins the others standing in the tray
      this.standBack(key, 0.8);
    } else if (ours) {
      // the envelope is still shut: it goes in with the others
      const into = this.cards.get(this.envKey(e)).group.getWorldPosition(new THREE.Vector3());
      card.moveTo(into, Q_FLAT(0), 0.7, { arc: 0.12, scale: 0.85, onDone: () => this.removeCard(key) });
    } else {
      this.tableCards.push(key);
      this.settle(key, 0.8);
    }
    if (ours) setTimeout(() => this.cards.get(this.envKey(e))?.redraw(), 400);
    this.sound.cardSlide([TABLE.x, TABLE.y, TABLE.z + 0.3]);
    this.save();
  }

  // The fourth cabinet: as its first drawer opens, a card already filed lies on the floor by
  // the door, with a line in another hand. Picked up, it goes back to its own drawer.
  floorEvent() {
    const B = this.bundle;
    for (const cid of B.chain.slice(0, 3)) {
      for (const d of B.cabinets[cid - 1].drawers) {
        if (!this.filed.has(d.id)) continue;
        const id = (d.on_success?.stack || []).find((x) => !d.cards.find((c) => c.id === x)?.render.half);
        if (!id) continue;
        this.state.floor = { key: `${d.id}/${id}`, done: false };
        this.placeFloor();
        this.save();
        return;
      }
    }
  }

  placeFloor() {
    const key = this.state.floor.key;
    const info = this.cardInfo.get(key);
    this.found.set(key, { loc: 'floor', e: info.e, floor: true });
    this.placeFound(key);
  }

  // the floor card into its own (filed) drawer, and nowhere else
  fileFloor(i, dg = null) {
    const key = this.held.key;
    const own = this.cardInfo.get(key).e;
    if (i + 1 !== own.cab.id || (dg && dg !== own.dg)) return this.refuse(this.F.nee);
    this.fileInto(i, key, () => {
      this.state.floor.done = true;
      this.save();
    }, own.dg);
  }

  // ------------------------------------------------------------------ room locks (section 3a)

  // A held card brought to a room object: the windowsill (R2), the foot of the door (R3),
  // the typewriter (R4). The right card stays; a wrong one comes back.
  dropOnObject(obj) {
    const h = this.held;
    if (!h || h.kind !== 'card') return;
    const lockE = this.roomLock({ window: 'R2', door: 'R3', typewriter: 'R4' }[obj]);
    const info = this.cardInfo.get(h.key);
    if (!lockE || info.e !== lockE) return this.refuse(this.F.nee);
    const d = lockE.d;
    const right = info.card.id === (obj === 'typewriter' ? d.lock.bottom_card : d.lock.card);
    const card = this.cards.get(h.key);
    const key = h.key;
    this.held = null;
    this.ui.held(null);
    card.group.visible = true;
    card.setReading(false);
    // the wrong card: you take it up again
    const back = () => {
      this.ui.note(this.F.nee, { ms: 1600 });
      this.sound.locked(this.rails.basePos.toArray());
      setTimeout(() => this.toHand(key), 500);
    };
    if (obj === 'window') {
      const on = new THREE.Vector3(0.05, 1.012, ROOM.z0 + 0.06);
      card.place(this.liftPose(0, 1).pos, this.rails.baseQuat);
      card.moveTo(on, Q_FLAT(0.04), 0.9, {
        arc: 0.1,
        onDone: () => {
          this.sound.paper(on.toArray(), 0.2, 'place');
          if (!right) {
            // it slides off the wet sill
            card.moveTo(on.clone().add(new THREE.Vector3(0.1, -0.35, 0.25)), Q_FLAT(0.6), 0.5, { onDone: back });
            return;
          }
          this.forget(key);
          this.state.damp[key] = true;
          this.atmos.windowAnswered();
          // the number from under the stain comes in the mist
          setTimeout(() => this.atmos.writeNumber(windowWriting(String(d.on_success.digit.value), { pane: 'right' })), 2200);
          // and, as with the name, for a moment you see it as it was written
          if (this.rails.current === 'window') {
            setTimeout(() => (this.post.film.uniforms.uFlip.value = 1), 3600);
            setTimeout(() => (this.post.film.uniforms.uFlip.value = 0), 4700);
          }
          setTimeout(() => this.solve(lockE), 5200);
        },
      });
    } else if (obj === 'door') {
      const foot = new THREE.Vector3(0, 0.004, ROOM.z1 - 0.12);
      card.place(this.liftPose(0, 1).pos, this.rails.baseQuat);
      card.moveTo(foot, Q_FLAT(Math.PI), 1.0, {
        arc: 0.05,
        onDone: () => {
          card.moveTo(new THREE.Vector3(0, 0.004, ROOM.z1 + 0.25), Q_FLAT(Math.PI), 0.9, {
            onDone: () => {
              this.sound.cardSlide([0, 0.05, ROOM.z1], 0.3, 'shove');
              if (!right) {
                // pushed back out from the other side
                setTimeout(() => card.moveTo(foot.clone().add(new THREE.Vector3(0, 0, -0.35)), Q_FLAT(Math.PI + 0.3), 0.7, { onDone: back }), 1200);
                return;
              }
              this.forget(key);
              this.removeCard(key);
              this.atmos.stopKnocking();
              setTimeout(() => this.solve(lockE), 1400);
            },
          });
        },
      });
    } else {
      const paper = this.tw.paperWorld.clone().add(new THREE.Vector3(0, -0.06, 0.08));
      card.place(this.liftPose(0, 1).pos, this.rails.baseQuat);
      card.moveTo(paper, Q_FLAT(0), 0.8, {
        arc: 0.1,
        onDone: () => {
          if (!right) return back();
          this.forget(key);
          this.sound.cardSlide(paper.toArray());
          // the machine types the last line itself, and rings
          // a fresh page: the narrator line, and the word from under the stain
          this.tw.autoType([d.on_success.type_line, '', `— ${d.on_success.digit.word} —`], {
            cps: 9,
            onKey: (ch) => this.sound.key(ch === ' '),
            onDone: () => {
              this.sound.carriage(true);
              setTimeout(() => this.solve(lockE), 1400);
            },
          });
        },
      });
    }
  }

  // R4: the typewriter types the top half of a card by itself, then where the rest is
  typeTop(e, quiet = false) {
    const top = e.d.cards.find((c) => c.id === e.d.lock.top_card)?.render;
    if (!top) return;
    const wrap = this.tw.constructor.wrap;
    const lines = [`${(top.place || '').toUpperCase()}   ${top.year || ''}`, top.code || '', '',
      ...wrap(top.description, 36), '', this.F.machine_continued || '— vervolg in la 3 —'];
    this.tw.setHeader([]);
    if (quiet) {
      this.tw.lines = lines.map((text) => ({ text }));
      this.tw.prefix = this.tw.current = '';
      this.tw.redraw();
      return;
    }
    this.tw.autoType(lines, {
      cps: 13,
      onKey: (ch) => this.sound.key(ch === ' '),
      onLine: () => this.sound.carriage(false),
    });
  }

  // A room lock comes alive when its drawer opens: the clock stops, a name comes in the
  // mist, something knocks, the typewriter starts. Not quiet: the head turns to see it.
  // watch: another drawer whose cards are being read (a room lock woken early, section 3f)
  wakeRoomLock(e, quiet = false, { watch = null } = {}) {
    const d = e.d;
    if (!d.type.startsWith('R')) return;
    const w = watch || e;
    const wake = () => {
      if (d.type === 'R1') this.stopClock(true);
      if (d.type === 'R2') {
        this.atmos.writeOnWindow(windowWriting(d.lock.text), !quiet);
        if (!quiet) this.sound.fingerOnGlass([0.1, 1.9, ROOM.z0 - 0.15]);
      }
      if (d.type === 'R3') this.atmos.startKnocking(d.lock.n, quiet ? 8 : 0.2);
      if (d.type === 'R4') this.typeTop(e, quiet);
    };
    if (quiet) return wake();
    // the typewriter starts as the drawer is taken out: it is typing when you sit down (3g)
    if (d.type === 'R4' && !watch) return wake();
    // Once the cards have been read and put down, something happens in the room: the loud
    // clock falls silent, a finger squeaks on the glass, it knocks, the typewriter starts.
    // A moment later the head turns to it: first the reason, then the look.
    const at = { R1: () => this.clockFace.getWorldPosition(new THREE.Vector3()),
      R2: () => new THREE.Vector3(0, 1.75, ROOM.z0 - 0.17),
      R3: () => new THREE.Vector3(0, 1.0, ROOM.z1),
      R4: () => this.tw.paperWorld.clone() }[d.type];
    const half = { R1: 0.45, R2: 0.9, R3: 1.2, R4: 0.35 }[d.type];
    const hold = { R1: 3.0, R2: 4.0, R3: 4.2, R4: 3.0 }[d.type];
    let free = 0;
    const wait = setInterval(() => {
      if (this.finished || this.stateOf(w.d.id) !== 'open') return clearInterval(wait);
      const busy = this.reading || this.held || this.rails.moving || this.glancing || this.carrying
        || this.env?.e !== w || !this.wasRead.has(w.d.id);
      free = busy ? 0 : free + 0.25;
      if (free < 1.5) return;
      clearInterval(wait);
      if (watch) this.state.early[d.id] = true;
      wake();
      setTimeout(() => this.glance(at, { half, hold }), d.type === 'R1' ? 1400 : 900);
    }, 250);
  }

  // the clock stops (R1 waiting to be set) or goes again
  stopClock(stop) {
    this.clockStill = stop;
    this.sound.clockRunning = !stop;
  }

  // Look round at something from where you stand, let it happen there, and look back.
  // at is a function (the place may move); waits for a free moment.
  glance(at, { half = 0.6, hold = 3, turn = 1.3, onLook } = {}) {
    return new Promise((resolve) => {
      const go = () => {
        if (this.finished) { onLook?.(); return resolve(); }
        if (this.reading || this.rails.moving || this.glancing || this.typing || this.held || this.carrying) return setTimeout(go, 400);
        this.glancing = true;
        this.ui.tooltip(null);
        const p = at();
        const t = half / this.camera.position.distanceTo(p);
        this.zoom(THREE.MathUtils.clamp(this.fovFor(t, t), 16, this.baseFov), turn);
        setTimeout(() => this.zoom(this.baseFov, turn), (turn + hold) * 1000);
        this.rails.glanceHead(p, { turn, hold, onLook }).then(() => { this.glancing = false; resolve(); });
      };
      go();
    });
  }

  // R1: the hour hand let go on an hour for two seconds
  checkHand(dt) {
    const h = this.hand;
    if (!h || h.held) return;
    h.since += dt;
    if (h.since < HAND_SET) return;
    this.hand = null;
    const e = this.roomLock('R1');
    if (e && h.hour === e.d.lock.hour) {
      // it chimes once, and keeps that time from now on
      const now = this.clockMinutes();
      this.state.wallOffset = ((h.hour * 60 - (now % 720)) % 720 + 720) % 720;
      this.clockShownMin = now + this.state.wallOffset;
      this.stopClock(false);
      this.sound.chime(h.hour, 1.3, 0.5);
      this.solve(e);
    } else {
      this.sound.skipBeat();
      this.ui.note(this.F.nee, { ms: 1400 });
    }
  }

  nee() {
    this.ui.note(this.F.nee, { ms: 1800 });
    this.sound.locked(this.rails.basePos.toArray());
  }

  // ------------------------------------------------------------------ drawers

  // A drawer handle: with a card in the hand, the card is inserted (the desk card, the
  // misfiled one) or refused; with the envelope, its cards go in; otherwise the drawer slides
  // out in place to look into the archive behind its divider (3h). Cabinet 5 is locked.
  clickDrawer(dg) {
    const u = dg.userData;
    const pos = dg.getWorldPosition(new THREE.Vector3()).toArray();
    if (u.cabinet === CLOSED && !this.state.fiveOpen) {
      if (this.held?.kind === 'card') return this.dropOn(CLOSED);
      this.sound.locked(pos);
      u.wiggle = 0.5;
      return;
    }
    const e = u.entry;
    if (this.held?.kind === 'env') return this.dropEnvelope(u.cabinet, dg);
    if (this.held?.kind === 'card') return this.dropOnDrawer(e, dg);
    // a drawer whose cards went in shuts on a click
    if (this.shutting && this.shutting.e === e) return this.shutDrawer(e);
    if (!e) {
      // a drawer full of other people's stories
      u.target = 0.45;
      this.sound.drawer(pos, true);
      setTimeout(() => { u.target = 0; this.sound.drawer(pos, false); }, 1600);
      return;
    }
    this.browse(dg);
  }

  // ------------------------------------------------------------------ locks

  typeChar(ch) {
    if (this.tw.autoTyping || this.roomLock('R4')) return;
    if (!/^[\p{L}\p{N} '\-.,]$/u.test(ch)) return;
    if (this.tw.typeChar(ch)) this.sound.key(ch === ' ');
  }

  refreshTypewriter() {
    const tw = this.tw;
    if (this.state.fiveOpen && !this.finished) {
      if (!this.gapPaper) {
        this.gapPaper = true;
        tw.lines = [];
        tw.current = '';
        tw.prefix = '';
      }
      tw.setHeader(['KAART V · AMSTERDAM', '...en wat de assistent', 'daar zag, dat was']);
      return;
    }
    // the page the machine typed by itself stays in it until its card is found
    if (this.roomLock('R4') || tw.autoTyping) return;
    tw.setHeader([this.displayName.slice(0, 30)]);
    const e = this.current;
    if (e && e.d.lock.kind === 'word' && !this.solved.has(e.d.id)) {
      const pre = `${e.d.id}: `;
      if (tw.prefix !== pre) tw.newLine(pre);
    }
  }

  async submit() {
    const tw = this.tw;
    const typed = tw.current.trim();
    if (!typed) return;
    if (this.state.fiveOpen) {
      // the final lock: tonight's answers, your name, or a few words that always do
      const n = normalize(typed);
      const name = normalize(this.state.name || '');
      const ok = this.state.words.includes(n) || this.F.final_words.map(normalize).includes(n)
        || (name && (n === name || name.split(' ').includes(n)));
      if (ok) {
        this.sound.carriage(true);
        tw.accept();
        return this.finishStory(typed);
      }
      return this.jam(tw, '');
    }
    const e = this.current;
    if (this.roomLock('R4') || tw.autoTyping) return;
    if (!e || e.d.lock.kind !== 'word' || this.solved.has(e.d.id)) {
      this.sound.carriage(false);
      tw.newLine('');
      return;
    }
    if (await opens(e.d.lock, typed)) {
      this.sound.carriage(true);
      tw.accept('goed');
      this.state.words.push(normalize(typed));
      if (e.d.type === 'P1') this.state.labels[e.d.id] = typed;
      if (e.d.type === 'P5') this.fill(e, e.d.lock.fill, typed);
      this.solve(e);
      setTimeout(() => this.refreshTypewriter(), 900);
    } else this.jam(tw, `${e.d.id}: `);
  }

  jam(tw, prefix) {
    this.sound.jam();
    tw.jam();
    setTimeout(() => {
      tw.struck();
      tw.newLine(prefix);
    }, 380);
  }

  // a field on a card fills in, a letter at a time, as if typed
  fill(e, cardId, value) {
    this.state.fills[e.d.id] = value;
    this.typing = { key: `${e.d.id}/${cardId}`, full: value, shown: '', t: 0 };
  }

  clickMap(hit) {
    const e = this.current;
    if (!hit?.uv || !e || e.d.lock.kind !== 'place' || this.solved.has(e.d.id)) return;
    const [lat, lon] = this.map.uvToLatLon(hit.uv);
    const L = e.d.lock;
    const id = 'ans-' + e.d.id;
    this.map.addPin(id, lat, lon, 'answer', null);
    this.sound.pinPush(hit.point.toArray());
    if (haversine(lat, lon, L.target_geo[0], L.target_geo[1]) <= L.radius_km) {
      const f = e.d.on_success.fill_field;
      setTimeout(() => {
        this.map.addPin(id, L.target_geo[0], L.target_geo[1], 'token', f.value, { animate: false });
        this.fill(e, f.card, f.value);
        this.solve(e);
      }, 500);
    } else {
      setTimeout(() => {
        this.map.dropPin(id);
        this.sound.pinDrop([hit.point.x, 0.1, hit.point.z]);
      }, 650);
      // J.J.V. points: further this way
      this.ui.note(`${this.F.nee} Meer naar het ${compass(lat, lon, L.target_geo[0], L.target_geo[1])}.`, { ms: 3600 });
      this.sound.locked(hit.point.toArray());
    }
  }

  turnBoxWheel(i, hit) {
    const w = this.strongbox.wheels[i];
    const wp = w.getWorldPosition(new THREE.Vector3());
    this.strongbox.turn(i, hit.point.y > wp.y);
    this.sound.dialClick(wp.toArray());
    const e = this.current;
    if (!e || e.d.type !== 'P6' || this.solved.has(e.d.id)) return;
    const combo = this.strongbox.combination();
    opens(e.d.lock, combo).then((ok) => {
      if (!ok || this.strongbox.combination() !== combo || this.solved.has(e.d.id)) return;
      this.sound.clunk(KIT_POS.toArray());
      this.strongbox.openTarget = 1;
      // the lid comes up; what was kept in there comes out to be read
      setTimeout(() => this.liftFromBox(e), 1100);
      setTimeout(() => this.solve(e), 2600);
    });
  }

  liftFromBox(e) {
    const c = e.d.cards.find((x) => x.role === 'inside');
    if (!c) return;
    const key = `${e.d.id}/${c.id}`;
    const card = this.makeCard(key);
    card.place(KIT_POS.clone().add(new THREE.Vector3(0, 0.06, 0)), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)));
    this.loose.set(key, { slot: 1, home: () => this.drawerWorld(e) });
    if (this.reading) this.putDown();
    this.reading = { mode: 'single', list: [key], index: 0, from: 'loose' };
    this.rails.parallax = false;
    this.layoutReading();
    this.sound.paper(KIT_POS.toArray(), 0.3);
  }

  turnRing(ring, hit) {
    const up = hit.point.y > ring.getWorldPosition(new THREE.Vector3()).y;
    this.lock.setDigit(ring.userData.index, ring.userData.digit + (up ? 1 : -1));
    this.sound.dialClick(ring.getWorldPosition(new THREE.Vector3()).toArray());
    const code = this.bundle.cabinets.slice(0, 4).map((c) => c.digit).join('');
    if (this.allDone && this.lock.code() === code) setTimeout(() => this.openFive(), 400);
  }

  // ------------------------------------------------------------------ solving

  // The lock is open: success shows, and (a moment later) the drawer's cards gather into
  // a stack to be put back. Nothing counts until they are.
  solve(e, { quiet = false } = {}) {
    const d = e.d;
    if (this.solved.has(d.id)) return;
    this.solved.add(d.id);
    this.dstate.set(d.id, 'solved');
    for (const c of d.cards) this.cards.get(`${d.id}/${c.id}`)?.redraw();
    if (d.type === 'P2') this.map.setSketch([]);
    if (d.type === 'P2' && quiet) {
      const f = d.on_success.fill_field;
      this.map.addPin('ans-' + d.id, d.lock.target_geo[0], d.lock.target_geo[1], 'token', f.value, { animate: false });
    }
    if (d.type === 'P3' && d.lock.cabinet !== 5) this.unlock(d.lock.cabinet, quiet);
    if (d.type === 'R1') this.atmos.clockKeepsTime();
    if (d.type === 'R2' && quiet) {
      this.atmos.windowAnswered();
      this.atmos.writeNumber(windowWriting(String(d.on_success.digit.value), { pane: 'right' }));
    }
    if (d.type === 'R4' && quiet) {
      this.tw.lines = [{ text: d.on_success.type_line }, { text: '' }, { text: `— ${d.on_success.digit.word} —` }];
      this.tw.redraw();
    }
    if (d.type === 'R3') this.atmos.stopKnocking();
    if (d.on_success?.digit) this.state.digitNote[`${d.id}/${d.on_success.digit.card}`] = true;
    if (d.type === 'R1') this.stopClock(false);
    // the misfiled card and the door's card have left for good: the count drops
    if (this.env?.e === e) this.cards.get(this.envKey(e))?.redraw();
    if (!quiet) {
      this.sound.swell();
      if (d.on_success?.digit) setTimeout(() => this.revealDigit(e), 1400);
      else setTimeout(() => this.sealEnvelope(e), 1600);
    }
    this.relabelAll();
    this.updateTask();
    this.updateHintLabel();
    if (!quiet) this.save();
  }

  // A room lock open: the card it turned on comes up, J.J.V.'s pencil on it giving the
  // number as the cabinet's digit; then the drawer's cards go back into their envelope.
  revealDigit(e) {
    const d = e.d;
    if (this.reading || this.held) {
      if (this.held) this.putBackHeld({ force: true });
      if (this.reading) this.putDown();
    }
    const key = `${d.id}/${d.on_success.digit.card}`;
    const fresh = !this.cards.has(key);
    const card = this.makeCard(key);
    card.redraw();
    card.group.visible = true;
    const from = this.env?.e === e ? this.cards.get(this.envKey(e)).group.getWorldPosition(new THREE.Vector3()) : this.drawerWorld(e);
    if (fresh) card.place(d.type === 'R4' ? this.tw.paperWorld : from, Q_IN());
    this.loose.delete(key);
    this.reading = { mode: 'single', list: [key], index: 0, from: 'reveal' };
    this.rails.parallax = false;
    this.layoutReading();
    this.sound.paper(null, 0.3);
    setTimeout(() => this.sealEnvelope(e), 3200);
  }

  // A misfiled card went home: that cabinet opens, and its top drawer comes out.
  unlock(cid, quiet) {
    if (this.unlocked.has(cid)) return;
    this.unlocked.add(cid);
    if (quiet) return;
    const cab = this.cabinets[cid - 1];
    const top = cab.drawers.find((g) => g.userData.kind === 'puzzle' && g.userData.slot === 0);
    setTimeout(() => {
      this.sound.clunk(this.cabinetWorld(cid - 1).toArray());
      if (top) top.userData.pulse = 1;
      this.relabelAll();
    }, 400);
  }

  // Only the cabinet being worked on leaks: from when its first drawer comes out until its
  // three drawers are filed (then cabinetDone settles it). The cabinets waiting their turn
  // are quiet.
  leak() {
    const c = this.activeCab;
    if (!c || c > 4) return;
    const out = [...this.drawers.values()].some((e) => e.cab.id === c && this.stateOf(e.d.id) !== 'shut');
    if (out) this.atmos.activate(FAMILY_ORDER[c - 1]);
  }

  // All three drawers filed: the leak stops, on the cabinet and then where it was in the room,
  // and the cabinet's enactment plays there.
  cabinetDone(cid, quiet) {
    const i = cid - 1;
    const fam = FAMILY_ORDER[i];
    if (quiet) return this.atmos.settle(fam);
    // its own half goes first, in front of you at the cabinet; then the head turns to the room's
    setTimeout(() => this.atmos.local?.stop(fam, true), 400);
    setTimeout(() => this.settleCabinet(i), 900);
    setTimeout(() => this.watchSettle(fam), 2800);
  }

  // Where each cabinet's leak and enactment show: the clock, the window, the lamp.
  leakAt(fam) {
    if (fam === 'voortekenen') return this.clockFace.getWorldPosition(new THREE.Vector3());
    if (fam === 'spoken') return LAMP_POS.clone().add(new THREE.Vector3(0, 0.3, 0.1));
    return new THREE.Vector3(0, 1.62, ROOM.z0 - 0.17);
  }

  // The enactments (section 2), each a few seconds, started as the head arrives:
  //   1 the ticking stops; five seconds of silence; it goes on softly (atmos.settle)
  //   2 the mist clears; for two seconds the glass shows the room with the door open
  //   3 it goes from the ledge; three knocks at the door; footsteps away over gravel
  //   4 the lamp goes out; when it comes back the desk card lies on the table
  enact(fam) {
    if (fam === 'wittewieven') setTimeout(() => this.atmos.reflect(2), 2600);
    if (fam === 'weerwolven') {
      setTimeout(() => this.atmos.knockAt(3), 3000);
      setTimeout(() => this.sound.gravelAway([0.4, 0.05, ROOM.z1 + 2.4], [0.15, 0, 1]), 5000);
    }
    if (fam === 'spoken') {
      setTimeout(() => this.atmos.lampOut(), 300);
      setTimeout(() => {
        this.state.deskOut = true;
        this.placeLoose(DESK, 1);
        this.save();
      }, 2200);
      setTimeout(() => this.atmos.lampOut(true), 3100);
    }
  }

  // Look round at the leak as it stops and the enactment plays, and back (not for the clock).
  watchSettle(fam) {
    this.atmos.prepare(fam);
    // the clock's is heard, not seen, and it has just been looked at to be set: no turn for it
    if (fam === 'voortekenen') {
      this.atmos.settle(fam, { show: true });
      this.enact(fam);
      return Promise.resolve();
    }
    const half = fam === 'voortekenen' ? 0.45 : fam === 'spoken' ? 0.55 : 0.9;
    const hold = { voortekenen: 5.6, wittewieven: 5.4, weerwolven: 6.8, spoken: 4.4 }[fam];
    return this.glance(() => this.leakAt(fam), {
      half, hold,
      onLook: () => {
        this.atmos.settle(fam, { show: true });
        this.enact(fam);
      },
    });
  }

  settleCabinet(i, gap = 40) {
    const cab = this.cabinets[i];
    const order = cab.drawers.slice().sort((a, b) => (b.userData.row - a.userData.row) || (a.userData.col - b.userData.col));
    order.forEach((dg, j) => setTimeout(() => {
      dg.userData.pulse = 1;
      if (j % 3 === 0) this.sound.dialClick(dg.getWorldPosition(new THREE.Vector3()).toArray());
    }, j * gap));
  }

  // fit the lens to the screen (see FOV); called again on every resize
  fitView() {
    const cam = this.camera, w = window.innerWidth, h = window.innerHeight;
    const lift = UPRIGHT_LIFT * THREE.MathUtils.clamp((1 - w / h) / 0.4, 0, 1);
    this.viewLift = lift;
    cam.aspect = w / h / (1 + lift);
    this.baseFov = Math.max(FOV, this.fovFor(0, Math.tan(THREE.MathUtils.degToRad(UPRIGHT_ACROSS / 2))));
    if (lift) cam.setViewOffset(w, h * (1 + lift), 0, h * lift, w, h);
    else cam.clearViewOffset();
    if (!this.fovTween) cam.fov = this.baseFov;
    cam.updateProjectionMatrix();
  }

  // the lens that shows at least so much up and down, and so much across (as tangents of half the angle)
  fovFor(high, across = high) {
    return THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(high, across / this.camera.aspect)));
  }

  // how much is seen at distance 1 straight ahead, across and up and down
  viewFrame() {
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return { vw: 2 * t * this.camera.aspect, vh: (2 * t) / (1 + this.viewLift) };
  }

  zoom(fov, dur) {
    this.fovTween = { from: this.camera.fov, to: fov, t: 0, dur };
  }

  // ------------------------------------------------------------------ cabinet 5

  openFive(quiet = false) {
    if (this.state.fiveOpen) return;
    this.state.fiveOpen = true;
    this.lock.unlock(quiet);
    // in its Varia drawer: one sealed envelope, no count, a place name on it (3b)
    if (this.oneDrawer) {
      const env = this.makeCard('env:5');
      env.redraw();
      this.oneDrawer.add(env.group);
      env.place(new THREE.Vector3(-0.22, -0.09, 0), Q_FLAT(Math.PI / 2 + 0.1), { local: true, scale: 0.7 });
    }
    if (quiet) {
      if (this.oneDrawer) this.oneDrawer.userData.target = 0.45;
      this.placeLoose(FIVE, 1);
      return;
    }
    const lp = this.lock.centre;
    this.sound.clunk(lp.toArray());
    setTimeout(() => this.sound.clunk([lp.x, lp.y - 0.3, lp.z]), 700);
    // step back: the drawer comes out toward you
    setTimeout(() => this.goto('cab' + CLOSED), 500);
    setTimeout(() => {
      if (this.oneDrawer) {
        this.oneDrawer.userData.target = 1;
        this.sound.drawer(this.oneDrawer.getWorldPosition(new THREE.Vector3()).toArray(), true);
      }
    }, 1300);
    setTimeout(() => this.liftFive(), 2600);
    this.updateTask();
    this.save();
  }

  // the one card comes up out of the Varia drawer, to be read
  liftFive() {
    if (this.rails.moving) return setTimeout(() => this.liftFive(), 300);
    const card = this.makeCard(FIVE);
    card.place(this.oneWorld(), Q_IN());
    this.loose.set(FIVE, { slot: 1, home: null });
    this.reading = { mode: 'single', list: [FIVE], index: 0, from: 'loose' };
    this.rails.parallax = false;
    this.layoutReading();
    this.sound.paper(null, 0.3);
  }

  oneWorld() {
    const dg = this.oneDrawer;
    return dg ? dg.localToWorld(new THREE.Vector3(-0.15, 0.02, 0)) : this.cabinetWorld(CLOSED);
  }

  // ------------------------------------------------------------------ hints

  updateHintLabel() {
    const e = this.current;
    if (!e || this.stateOf(e.d.id) !== 'open') return this.ui.setHint('Vraag J.J.V.', true);
    const lv = this.state.hintLv[e.d.id] || 0;
    this.ui.setHint(lv >= 3 ? 'J.J.V. weet het ook niet meer' : `Vraag J.J.V. (${lv}/3)`, lv >= 3);
  }

  // The next pencil note on the drawer's top card; it costs time on the clock.
  requestHint() {
    const e = this.current;
    if (!e || this.stateOf(e.d.id) !== 'open' || this.finished) return;
    const lv = this.state.hintLv[e.d.id] || 0;
    if (lv >= 3) return;
    this.state.hintLv[e.d.id] = lv + 1;
    this.state.pen += HINT_MIN[lv] * 60000;
    this.state.hints++;
    this.cards.get(this.envKey(e))?.redraw();
    this.ui.note(e.d.hints[lv], { small: `+${HINT_MIN[lv]} min.`, ms: 9000 });
    this.sound.paper(null, 0.18);
    this.updateHintLabel();
    this.save();
  }

  // ------------------------------------------------------------------ strip

  // The strip at the top: where you are and the time; the spike on the table is the only
  // thing that shows how far you are (3b), so no ticks here.
  updateTask() {
    const B = this.bundle;
    const digits = B.cabinets.slice(0, 4).map((c) => (this.cabDone(c.id) ? String(c.digit) : '·'));
    const e = this.current;
    let head = 'Nachtdienst';
    if (this.state.fiveOpen) head = 'Kast V';
    else if (e) head = `Kast ${this.cabinetInfo[e.cab.id].roman} · la ${e.d.id}`;
    this.ui.task({ head, ticks: [], digits: digits.some((x) => x !== '·') ? digits : [], clock: this.clockString() });
  }

  // ------------------------------------------------------------------ the endings

  endCommon(kind) {
    this.finished = kind;
    this.state.ending = kind;
    document.body.classList.add('ending');
    this.ui.tooltip(null);
    this.ui.held(null);
    this.rails.keys.clear();
    if (this.reading) this.putDown();
    this.save();
  }

  // The blank is filled: the archive has its story, filed properly.
  async finishStory(word) {
    this.state.gapWord = word.trim();
    this.endCommon('story');
    const five = this.cards.get(FIVE);
    five?.redraw();
    await wait(1400);
    if (five) this.sendTo(FIVE, this.oneWorld());
    await wait(1800 * CARD_PACE);
    if (this.oneDrawer) {
      this.oneDrawer.userData.target = 0;
      const wp = this.oneDrawer.getWorldPosition(new THREE.Vector3()).toArray();
      this.sound.drawer(wp, false);
      setTimeout(() => this.sound.clunk(wp), 500);
    }
    await wait(1200);
    this.atmos.settleAll();
    this.cabinets.forEach((c, i) => setTimeout(() => this.settleCabinet(i, 25), i * 500));
    await wait(3600);
    this.rails.go('midnight', { duration: 4.5 });
    await wait(4800);
    this.clockSet = 24 * 60;
    this.state.wallOffset = 0;
    const cp = this.clock.group.getWorldPosition(new THREE.Vector3());
    this.glanceLight.position.copy(cp).add(new THREE.Vector3(-0.6, -0.1, -0.3));
    this.glanceLightTarget = 3;
    this.voice.say(this.F.midnight, { hold: 6 });
    await this.sound.chime(12, 1.3);
    this.glanceLightTarget = 0;
    const dp = [0, 1.2, ROOM.z1];
    this.sound.clunk(dp);
    await wait(900);
    this.door.openTarget = 1;
    this.sound.doorCreak(dp);
    this.morningLightTarget = 9;
    this.atmos.dawn(0.65);
    await wait(4200);
    this.rails.go('corridor', { duration: 6.5 });
    await wait(4200);
    this.ui.fadeColor('#d8d5ce');
    await this.ui.fade(1, 2800);
    this.showFinal('story');
  }

  // Four cabinets done, the fifth left shut, a minute at the door: the lamp goes
  // out, the clock strikes nine, and the door opens.
  async finishGood() {
    this.endCommon('good');
    this.atmos.lampOut();
    await wait(3500);
    this.clockSet = 33 * 60;
    this.state.wallOffset = 0;
    await this.sound.chime(9, 1.2, 0.5);
    this.atmos.dawn(1);
    this.sound.keyTurn([0, 1.2, ROOM.z1 + 0.1]);
    await wait(1600);
    this.door.openTarget = 1;
    this.sound.doorCreak([0, 1.2, ROOM.z1]);
    this.morningLightTarget = 6;
    await wait(5000);
    await this.ui.fade(1, 2200);
    this.showFinal('good');
  }

  finalData() {
    const sec = Math.round((this.state.ms + this.state.pen) / 1000);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    const took = h ? `${h} uur ${m} min.` : `${m} min.`;
    const r = this.F.card_five;
    return {
      kind: r.kind, place: r.place, prov: r.prov, name: this.displayName,
      code: `VB ${YEAR}/${this.bundle.seed}`,
      desc: r.description.replace('____', (this.state.gapWord || '').toUpperCase()),
      recorded: `${this.night.session}, in ${took}`,
      remark: this.F.note_final,
      citation: this.F.citation,
    };
  }

  showFinal(kind) {
    this.ui.showHud(false);
    if (kind === 'good') {
      this.ui.finalText(this.F.good_end);
      return;
    }
    this.finalInfo = this.finalData();
    drawFinal(document.getElementById('final-card'), this.finalInfo);
    this.ui.finalText(null);
    this.showReadingLog();
  }

  // the back of your card: every card read tonight, each to its own page in the Verhalenbank
  showReadingLog() {
    const ol = document.getElementById('final-log');
    ol.innerHTML = '';
    for (const r of this.state.readLog) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = r.u || '#';
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = `${r.p || '——'}, ${r.y || '?'} `;
      const code = document.createElement('span');
      code.className = 'code';
      code.textContent = r.c || '';
      a.appendChild(code);
      li.appendChild(a);
      ol.appendChild(li);
    }
    const n = this.state.readLog.length;
    const N = this.archive.index?.total || n;
    document.getElementById('final-count').textContent = `${n} ${n === 1 ? 'kaart' : 'kaarten'} gelezen. Nog ${Math.max(0, N - n)} in deze kasten.`;
  }

  shareText() {
    const d = this.finalInfo;
    if (!d) return this.F.good_end;
    return [`${d.place.toUpperCase()} — ${d.kind} — verteller: ${d.name}`, d.desc, `Opgetekend: ${d.recorded}.`, d.remark,
      d.code, d.citation].join('\n');
  }

  // ------------------------------------------------------------------ time, save

  clockMinutes() {
    if (this.clockSet !== null) return this.clockSet;
    return START_MIN + (this.state.ms + this.state.pen) / 60000;
  }

  // the wall clock: game time, or from the hour it was set to (R1)
  wallString() { return this.clockString(this.clockMinutes() + (this.state.wallOffset || 0)); }

  clockString(min = this.clockMinutes()) {
    const total = Math.floor(min);
    const h = Math.floor(total / 60) % 24, m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  save() {
    try {
      const st = { ...this.state, drawers: Object.fromEntries(this.dstate), unlocked: [...this.unlocked], v: 6, finished: !!this.finished,
        onTable: this.tableCards.slice() };
      localStorage.setItem('nd3:' + this.bundle.seed, JSON.stringify(st));
      localStorage.setItem('nd3:last', String(this.bundle.seed));
    } catch { /* private window: no memory, no harm */ }
  }

  restore(st) {
    Object.assign(this.state, {
      name: st.name || this.state.name, ms: st.ms || 0, pen: st.pen || 0, hints: st.hints || 0,
      hintLv: st.hintLv || {}, words: st.words || [], labels: st.labels || {}, fills: st.fills || {},
      deskOut: !!st.deskOut, deskFiled: !!st.deskFiled, wallOffset: st.wallOffset || 0,
      damp: st.damp || {}, trail: st.trail || {}, digitNote: st.digitNote || {}, reacted: st.reacted || [],
      foundDone: st.foundDone || {}, crumple: st.crumple || {}, floor: st.floor || null, early: st.early || {},
      spiked: st.spiked || [], readLog: st.readLog || [],
    });
    for (const c of st.unlocked || [1]) this.unlocked.add(c);
    // an older save knew only solved drawers: those count as filed
    const drawers = st.drawers || Object.fromEntries((st.solved || []).map((id) => [id, 'filed']));
    for (const [id, ds] of Object.entries(drawers)) {
      const e = this.drawers.get(id);
      if (!e) continue;
      this.dstate.set(id, 'open');
      if (ds === 'open') this.wakeRoomLock(e, true);
      if (ds === 'solved' || ds === 'filed') this.solve(e, { quiet: true });
      if (ds === 'filed') this.fileDrawer(e, { quiet: true });
    }
    if (this.state.deskOut && !this.state.deskFiled) this.placeLoose(DESK, 1);
    for (const id of Object.keys(this.state.early)) {
      const e = this.drawers.get(id);
      if (e && this.stateOf(id) === 'shut') this.wakeRoomLock(e, true);
    }
    for (const e of this.drawers.values()) if (this.stateOf(e.d.id) === 'open') this.placeFoundFor(e);
    if (this.state.floor && !this.state.floor.done) this.placeFloor();
    if (st.fiveOpen) this.openFive(true);
    // the envelope that was out is in the bay again, its cards where they were
    const e = st.current && this.drawers.get(st.current);
    if (e && !st.fiveOpen && !this.filed.has(e.d.id)) this.takeEnvelope(e, { quiet: true, onTable: st.onTable || [], open: st.envOpen });
    this.relabelAll();
    this.updateTask();
  }

  start() {
    this.running = true;
    this.placeLoose(NOTE, 0);
    this.placeEnvelopes();
    // the archive (3h): its index for the reading log, every story's place as a dot on the map
    this.archive.loadIndex();
    fetch('data/archive/geo.bin').then((r) => r.arrayBuffer()).then((b) => this.map.setArchive(new Float32Array(b))).catch(() => {});
    this.leak();
    this.relabelAll();
    this.updateTask();
    this.updateHintLabel();
    this.ui.setStation(this.rails.current, false);
  }

  // ------------------------------------------------------------------ frame

  update(dt, time) {
    if (this.running && !this.finished && !document.hidden) this.state.ms += dt * 1000;
    if (this.running && !this.finished && (this.saveAcc = (this.saveAcc || 0) + dt) > 10) {
      this.saveAcc = 0;
      this.save();
    }
    for (const card of this.cards.values()) card.update(dt);
    for (const card of this.flying) card.update(dt);
    this.updateHover();
    if (this.typing) {
      const t = this.typing;
      t.t += dt;
      const n = Math.min(t.full.length, Math.floor(t.t / 0.09));
      if (n !== t.shown.length) {
        t.shown = t.full.slice(0, n);
        this.cards.get(t.key)?.redraw();
        this.sound.key(false);
      }
      if (n >= t.full.length) {
        this.typing = null;
        this.cards.get(t.key)?.redraw();
      }
    }
    if (this.fovTween) {
      const f = this.fovTween;
      f.t = Math.min(1, f.t + dt / f.dur);
      const k = 0.5 - 0.5 * Math.cos(Math.PI * f.t);
      this.camera.fov = f.from + (f.to - f.from) * k;
      this.camera.updateProjectionMatrix();
      if (f.t >= 1) this.fovTween = null;
    }
    for (const [light, target] of [[this.glanceLight, this.glanceLightTarget], [this.morningLight, this.morningLightTarget]]) {
      if (light.intensity === target) continue;
      const d = target - light.intensity;
      light.intensity = Math.abs(d) < 0.01 ? target : light.intensity + d * Math.min(1, dt * 1.2);
    }
    if ((this.clockAcc = (this.clockAcc || 0) + dt) > 0.25) {
      this.clockAcc = 0;
      const cs = this.clockString();
      if (cs !== this.clockShown) {
        this.clockShown = cs;
        this.ui.setClock(cs);
      }
    }
    // the alternative ending: four cabinets done, the fifth left shut, a minute at the door
    if (this.running && !this.finished && this.allDone && !this.state.fiveOpen) {
      const atDoor = this.rails.current === 'door' || this.near(this.door.group, 1.9);
      this.doorTime = atDoor && !this.rails.moving ? this.doorTime + dt : 0;
      if (this.doorTime >= DOOR_WAIT) this.finishGood();
    }
    this.checkHand(dt);
    // the lamp, knocked as a card is pulled from under its foot
    if (this.lampWobble > 0) {
      this.lampWobble = Math.max(0, this.lampWobble - dt * 1.8);
      const k = this.lampWobble;
      for (const p of this.lampParts) {
        p.o.position.x = p.x + Math.sin(time * 38) * 0.004 * k;
        p.o.rotation.z = p.rz + Math.sin(time * 38 + 1) * 0.02 * k;
      }
    }
    for (const cab of this.cabinets) {
      for (const dg of cab.drawers) {
        const u = dg.userData;
        if (u.pulse > 0) u.pulse = Math.max(0, u.pulse - dt * 4);
        const want = Math.max(u.target, u.stay || 0, u.hoverOpen || 0, u.ajar || 0) * 0.34 + (u.pulse || 0) * 0.02;
        [u.open, u.vel] = spring(u.open, u.vel || 0, want, 6.5, dt);
        let x = u.open;
        if (u.wiggle > 0) {
          u.wiggle = Math.max(0, u.wiggle - dt * 2.5);
          x += Math.sin(time * 60) * 0.004 * u.wiggle;
        }
        dg.position.x = 0.55 + x;
      }
    }
    this.lock.update(dt);
    this.strongbox.update(dt);
    const total = this.clockMinutes() + (this.state.wallOffset || 0);
    // while the hour hand is being set, it stands where it is put, the long hand on twelve
    // stopped, the hands stand where they are, until they are set
    const want = this.hand ? Math.floor(total / 720) * 720 + this.hand.hour * 60
      : this.clockStill && this.clockShownMin !== undefined ? this.clockShownMin : total;
    this.clockShownMin = this.clockShownMin === undefined ? want : this.clockShownMin + (want - this.clockShownMin) * Math.min(1, dt * (this.hand ? 9 : this.clockSet !== null ? 0.9 : 3));
    const t = this.clockShownMin;
    this.clock.hourHand.rotation.z = -((t / 60) % 12 / 12) * Math.PI * 2;
    this.clock.minHand.rotation.z = -((t % 60) / 60) * Math.PI * 2;
    // in step with the ticks, hanging when a beat is skipped or the clock is stopped
    if (!this.clockStill) this.clock.pend.rotation.z = Math.cos(Math.PI * (this.sound.clockPhase() ?? time)) * 0.07;
  }
}
