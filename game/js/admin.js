// Admin panel, for looking at any part of the night without playing up to it.
// Only loaded with ?admin in the address (main.js); the backquote key ` shows or hides it.
// Everything here goes through the game's own steps (solve, file, unlock, enact), so what
// you see is what a player would see; only the playing is skipped.
import * as THREE from 'three';
import { opens } from './bundle.js';
import { FAMILY_ORDER } from './room.js';

const START_MIN = 21 * 60 + 15;
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CSS = `
#admin { position: fixed; top: 64px; right: 12px; z-index: 50; width: 300px; max-height: calc(100vh - 140px);
  overflow: auto; background: rgba(18,16,14,.92); color: #e8e0cc; font: 12px/1.4 ui-monospace, Menlo, monospace;
  border: 1px solid #5a4a36; border-radius: 4px; padding: 8px 10px; box-shadow: 0 4px 18px #0008; }
#admin[hidden] { display: none; }
#admin h3 { margin: 10px 0 4px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #c9a86a; }
#admin h3:first-child { margin-top: 0; }
#admin button { font: inherit; background: #3a3026; color: #f0e6d0; border: 1px solid #6a5640; border-radius: 3px;
  padding: 2px 6px; margin: 2px 2px 2px 0; cursor: pointer; }
#admin button:hover { background: #54442f; }
#admin button:disabled { opacity: .35; cursor: default; }
#admin .row { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; }
#admin .info { white-space: pre-wrap; color: #cfc4ab; margin: 4px 0; }
#admin .drw { display: grid; grid-template-columns: 34px 1fr auto; gap: 4px; align-items: center; margin: 1px 0; }
#admin .st { color: #9a8f7a; }
#admin .st.open { color: #e0b65a; } #admin .st.solved { color: #8fc06a; } #admin .st.filed { color: #6a8a9a; }
#admin input, #admin select { font: inherit; background: #2a241e; color: #f0e6d0; border: 1px solid #6a5640; width: 70px; }
#admin .msg { color: #e0b65a; min-height: 1.4em; }
`;

export function attach(game) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.id = 'admin';
  document.body.appendChild(el);
  // keep the panel's own clicks and keys out of the room
  for (const ev of ['pointerdown', 'click', 'contextmenu', 'keydown']) el.addEventListener(ev, (e) => e.stopPropagation());
  window.addEventListener('keydown', (e) => {
    if (e.key === '`' && !(e.target instanceof HTMLInputElement)) el.hidden = !el.hidden;
  });
  const A = new Admin(game, el);
  window.__admin = A;
  A.render();
  setInterval(() => !el.hidden && A.refresh(), 1000);
  return A;
}

class Admin {
  constructor(game, el) {
    this.g = game;
    this.el = el;
    this.busy = false;
  }

  get B() { return this.g.bundle; }
  say(t) {
    this.msg = t;
    const m = this.el.querySelector('.msg');
    if (m) m.textContent = t;
  }

  // run one action at a time, and show what it did
  async run(label, fn) {
    if (this.busy) return;
    if (!this.g.running) return this.say('Eerst "Aan het werk" (of hervatten).');
    this.busy = true;
    this.say(label + ' …');
    try {
      await fn();
      this.say(label + ' ✓');
    } catch (err) {
      console.error(err);
      this.say(`${label}: ${err.message}`);
    }
    this.busy = false;
    this.g.save();
    this.render();
  }

  // ---------------------------------------------------------------- panel

  render() {
    const g = this.g, B = this.B;
    const chain = B.chain.slice(0, 4);
    const cabRows = chain.map((cid, i) => {
      const c = B.cabinets[cid - 1];
      const drawers = c.drawers.map((d) => {
        const st = g.stateOf(d.id);
        return `<div class="drw"><b>${d.id}</b><span>${d.type} <span class="st ${st}">${st}</span></span>
          <span><button data-a="open" data-d="${d.id}" ${st !== 'shut' || !g.canOpen(g.drawers.get(d.id)) ? 'disabled' : ''}>open</button><button
          data-a="solve" data-d="${d.id}" ${st !== 'open' ? 'disabled' : ''}>los op</button><button
          data-a="file" data-d="${d.id}" ${st !== 'solved' ? 'disabled' : ''}>berg op</button></span></div>`;
      }).join('');
      return `<h3>${i + 1}e · kast ${ROMAN[cid]} ${c.label} · cijfer ${c.digit}</h3>
        <div class="row"><button data-a="jump" data-c="${cid}">begin hier</button><button data-a="cab" data-c="${cid}">alles in deze kast</button>
        <button data-a="goto" data-s="cab${cid - 1}">ga erheen</button></div>${drawers}`;
    }).join('');
    const stations = Object.keys(g.rails.S).filter((n) => !['glance', 'walk', 'ret', 'look', 'found'].includes(n));
    this.el.innerHTML = `
      <h3>Nacht ${B.seed}</h3>
      <div class="info" data-info></div>
      <div class="msg"></div>
      ${cabRows}
      <h3>Kast V en de afloop</h3>
      <div class="row"><button data-a="five">open kast V</button><button data-a="story">einde: verhaal</button><button data-a="good">einde: dicht laten</button></div>
      <h3>Lekken en naspel</h3>
      <div class="row">${FAMILY_ORDER.slice(0, 4).map((f, i) => `<button data-a="enact" data-c="${i + 1}">naspel ${ROMAN[i + 1]}</button>`).join('')}</div>
      <div class="row">niveau: ${[1, 2, 3].map((l) => `<button data-a="level" data-l="${l}">${l}</button>`).join('')}
        <button data-a="pass">wolf langs</button><button data-a="skip">klok hapert</button></div>
      <h3>Gevonden kaarten</h3>
      <div class="row"><button data-a="fetch">haal op</button><button data-a="lay">leg op tafel</button><button data-a="floor">kaart op de vloer</button></div>
      <h3>Tijd</h3>
      <div class="row"><button data-a="time" data-m="10">+10 min</button><button data-a="time" data-m="60">+1 uur</button>
        <button data-a="at" data-t="23:55">23:55</button></div>
      <h3>Naar</h3>
      <div class="row"><select data-station>${stations.map((s) => `<option>${s}</option>`).join('')}</select><button data-a="station">ga</button></div>
      <h3>Nacht</h3>
      <div class="row"><input data-seed value="${B.seed}"><button data-a="seed">laad</button><button data-a="reset">opnieuw</button></div>
      <div class="info">\` verbergt dit paneel</div>`;
    this.el.querySelectorAll('button[data-a]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset)));
    if (this.msg) this.el.querySelector('.msg').textContent = this.msg;
    this.refresh();
  }

  // what is going on, once a second
  refresh() {
    const g = this.g, B = this.B, info = this.el.querySelector('[data-info]');
    if (!info) return;
    const room = B.cabinets.slice(0, 4).map((c) => {
      const r = c.drawers[2], L = r.lock;
      const what = { R1: `klok ${L.hour} uur`, R2: `raam "${L.text}"`, R3: `deur ${L.n}× kloppen`, R4: 'schrijfmachine' }[r.type];
      return `${ROMAN[c.id]}: ${what} → ${c.digit}`;
    }).join('\n');
    const found = [...g.found].filter(([, f]) => !f.floor).map(([k, f]) => `${k} ${f.loc}${g.state.foundDone[k] ? ' ✓' : ''}`).join(', ');
    const leaks = [...g.atmos.active].map((f) => `${f} ${g.atmos.lv(f)}`).join(', ') || 'geen';
    info.textContent = `volgorde ${B.chain.join(' → ')} · code ${B.cabinets.slice(0, 4).map((c) => c.digit).join('')}
${room}
gevonden: ${found}
lekken: ${leaks}
klok ${g.clockString()} · bezig: kast ${g.activeCab ?? '—'} · plek ${g.rails.current ?? '—'}`;
  }

  act(d) {
    const g = this.g;
    const e = d.d && g.drawers.get(d.d);
    switch (d.a) {
      case 'open': return this.run(`open ${d.d}`, () => this.open(e));
      case 'solve': return this.run(`los ${d.d} op`, () => this.solve(e));
      case 'file': return this.run(`berg ${d.d} op`, () => this.file(e));
      case 'jump': return this.run(`begin bij kast ${ROMAN[d.c]}`, () => this.jumpTo(Number(d.c)));
      case 'cab': return this.run(`kast ${ROMAN[d.c]} af`, () => this.finishCabinet(Number(d.c)));
      case 'goto': return this.run(d.s, async () => g.goto(d.s));
      case 'five': return this.run('kast V open', () => this.openFive());
      case 'story': return this.run('einde: verhaal', () => this.storyEnd());
      case 'good': return this.run('einde: dicht laten', () => this.goodEnd());
      case 'enact': return this.run(`naspel ${ROMAN[d.c]}`, () => this.enact(Number(d.c)));
      case 'level': return this.run(`lekken op ${d.l}`, async () => this.level(Number(d.l)));
      case 'pass': return this.run('wolf langs', async () => { g.atmos.timers.pass = 0.01; });
      case 'skip': return this.run('klok hapert', async () => g.sound.skipBeat());
      case 'fetch': return this.run('haal kaart op', () => this.fetch());
      case 'lay': return this.run('kaart op tafel', () => this.lay());
      case 'floor': return this.run('kaart op de vloer', async () => { if (!g.state.floor) g.floorEvent(); else throw new Error('ligt er al'); });
      case 'time': return this.run(`+${d.m} min`, async () => { g.state.ms += Number(d.m) * 60000; });
      case 'at': return this.run(d.t, async () => this.setTime(d.t));
      case 'station': return this.run('ga', async () => g.goto(this.el.querySelector('[data-station]').value));
      case 'seed': {
        const u = new URL(location.href);
        u.searchParams.set('seed', this.el.querySelector('[data-seed]').value.trim());
        location.href = u.toString();
        return;
      }
      case 'reset':
        try { localStorage.removeItem('nd3:' + this.B.seed); } catch { /* fine */ }
        location.reload();
        return;
    }
  }

  // ---------------------------------------------------------------- drawers

  async waitStill() {
    await sleep(150);
    for (let i = 0; i < 300 && (this.g.rails.moving || this.g.glancing); i++) await sleep(100);
  }

  // the envelope taken and carried to the table, and opened, as a player does (another
  // envelope that is out goes back on its drawer first, at once)
  async open(e) {
    const g = this.g;
    if (g.reading) g.putDown();
    if (g.held?.kind === 'card') g.putBackHeld({ force: true });
    if (g.env && g.env.e !== e) g.putEnvelopeBack();
    if (g.env?.e !== e) {
      g.goto('cab' + (e.cab.id - 1));
      await this.waitStill();
      g.clickFrontEnvelope(e);
      for (let i = 0; i < 80 && g.env?.e === e && g.env.phase !== 'table'; i++) await sleep(100);
    } else g.goto('table');
    await this.waitStill();
    if (g.env?.e === e && !g.env.open && !g.solved.has(e.d.id)) g.openEnvelope();
    for (let i = 0; i < 100 && g.env?.e === e && g.env.phase !== 'table'; i++) await sleep(100);
    await sleep(300);
  }

  // the envelope in the bay, open, at once
  outNow(e) {
    const g = this.g;
    if (g.env?.e === e) return g.env.open || g.solved.has(e.d.id) ? null : g.openEnvelope({ quiet: true });
    if (g.env) g.putEnvelopeBack();
    g.takeEnvelope(e, { quiet: true, open: true });
  }

  // a word for a word lock, found as a player would: by trying the words on the cards
  async word(d) {
    const words = new Set();
    for (const c of d.cards) {
      const t = `${c.render.original || ''} ${c.render.description || ''}`.toLowerCase();
      for (const w of t.match(/[a-zà-ÿ0-9]+/g) || []) words.add(w);
    }
    for (const w of words) if (await opens(d.lock, w)) return w;
    throw new Error('geen woord gevonden');
  }

  // Open the lock the way the game does when a player gets it right. Found cards come first.
  async solve(e) {
    const g = this.g, d = e.d;
    if (g.reading) g.putDown();
    if (g.held) g.putBackHeld({ force: true });
    for (const [k, f] of g.found) if (f.e === e && g.isOut(k)) g.state.foundDone[k] = true;
    this.outNow(e);
    const L = d.lock;
    if (d.type === 'P1' || d.type === 'P5') {
      const w = await this.word(d);
      g.state.words.push(w);
      if (d.type === 'P1') g.state.labels[d.id] = w;
      if (d.type === 'P5') g.fill(e, L.fill, w);
      g.solve(e);
    } else if (d.type === 'P2') {
      const l = g.map.local(L.target_geo[0], L.target_geo[1]);
      g.clickMap({ uv: { x: l.x / 1.28 + 0.5, y: l.y / 1.6 + 0.5 }, point: g.map.worldPos(L.target_geo[0], L.target_geo[1]) });
      await sleep(900);
    } else if (d.type === 'P3') {
      const key = `${d.id}/${L.card}`;
      g.makeCard(key);
      g.sendHome(key, e);
      await sleep(4600);
    } else if (d.type === 'P6') {
      g.strongbox.group.visible = true;
      g.strongbox.openTarget = 1;
      setTimeout(() => g.liftFromBox(e), 600);
      setTimeout(() => g.solve(e), 1500);
      await sleep(1800);
    } else if (d.type === 'R1') {
      g.hand = { hour: L.hour, held: false, since: 2 };
      await sleep(600);
    } else if (d.type === 'R2') {
      const key = `${d.id}/${L.card}`;
      g.state.damp[key] = true;
      g.forget(key);
      g.removeCard(key);
      g.atmos.windowAnswered();
      const { windowWriting } = await import('./room.js');
      g.atmos.writeNumber(windowWriting(String(d.on_success.digit.value), { pane: 'right' }));
      g.solve(e);
    } else if (d.type === 'R3') {
      const key = `${d.id}/${L.card}`;
      g.forget(key);
      g.removeCard(key);
      g.atmos.stopKnocking();
      g.solve(e);
    } else {
      // P4, R4: the right half found and joined
      if (d.type === 'R4') {
        g.tw.lines = [{ text: d.on_success.type_line }, { text: '' }, { text: `— ${d.on_success.digit.word} —` }];
        g.tw.redraw();
      }
      g.solve(e);
    }
    await sleep(300);
  }

  // The envelope's cards inserted into its drawer and the drawer shut, the envelope spiked,
  // without carrying anything.
  async file(e) {
    this.g.fileNow(e);
    await sleep(200);
  }

  // Every cabinet before this one in the night's order filed, quietly; this one unlocked.
  async jumpTo(cid) {
    const g = this.g, B = this.B;
    if (g.reading) g.putDown();
    if (g.held) g.putBackHeld({ force: true });
    if (g.env) g.putEnvelopeBack();
    const before = B.chain.slice(0, B.chain.indexOf(cid));
    for (const c of before) {
      for (const d of B.cabinets[c - 1].drawers) {
        const e = g.drawers.get(d.id);
        for (const [k, f] of g.found) if (f.e === e) g.state.foundDone[k] = true;
        if (!g.solved.has(d.id)) g.solve(e, { quiet: true });
        if (!g.filed.has(d.id)) g.fileDrawer(e, { quiet: true });
      }
      if (c === 4 && !g.state.deskOut) {
        g.state.deskOut = true;
        g.placeLoose('desk', 1);
      }
    }
    g.clearTable();
    g.state.current = null;
    g.placeEnvelopes();
    g.relabelAll();
    g.updateTask();
    if (cid !== 5) g.goto('cab' + (cid - 1));
    await this.waitStill();
  }

  // the rest of this cabinet, drawer by drawer, the way a player would end it
  async finishCabinet(cid) {
    if (this.g.activeCab !== cid) await this.jumpTo(cid);
    for (const d of this.B.cabinets[cid - 1].drawers) {
      const e = this.g.drawers.get(d.id);
      if (this.g.stateOf(d.id) === 'shut') await this.open(e);
      if (this.g.stateOf(d.id) === 'open') await this.solve(e);
      for (let i = 0; i < 60 && this.g.stateOf(d.id) !== 'solved'; i++) await sleep(100);
      if (this.g.stateOf(d.id) === 'solved') await this.file(e);
      await this.waitStill();
    }
  }

  // ---------------------------------------------------------------- cabinet 5, endings

  async openFive() {
    const g = this.g;
    if (!g.allDone) await this.jumpTo(5);
    g.goto('lock');
    await this.waitStill();
    this.B.cabinets.slice(0, 4).forEach((c, i) => g.lock.setDigit(i, c.digit));
    g.openFive();
    await sleep(3000);
  }

  async storyEnd() {
    const g = this.g;
    if (!g.state.fiveOpen) await this.openFive();
    if (g.reading) g.putDown();
    g.finishStory('niets');
  }

  async goodEnd() {
    const g = this.g;
    if (!g.allDone) await this.jumpTo(5);
    g.goto('door');
    await this.waitStill();
    g.finishGood();
  }

  // ---------------------------------------------------------------- leaks, enactments

  // play a cabinet's enactment again where it happens (its leak stays as it is)
  async enact(cid) {
    const g = this.g, fam = FAMILY_ORDER[cid - 1];
    if (g.reading) g.putDown();
    g.atmos.prepare(fam);
    await g.glance(() => g.leakAt(fam), {
      half: cid === 1 ? 0.45 : cid === 4 ? 0.55 : 0.9,
      hold: { 1: 5.6, 2: 5.4, 3: 6.8, 4: 4.4 }[cid],
      onLook: () => {
        if (cid === 1) g.sound.clockRest(5);
        if (cid === 3 && g.atmos.shapeX > -2) g.atmos.leaveIn = 1;
        g.enact(fam);
      },
    });
  }

  // all running leaks to this step (1-3)
  level(l) {
    const a = this.g.atmos;
    for (const f of a.active) a.since[f] = (l - 1) * 180 + 1;
  }

  // ---------------------------------------------------------------- found cards

  currentFound() {
    const g = this.g;
    const k = [...g.found.keys()].find((x) => g.isOut(x) && g.stateOf(g.found.get(x).e.d.id) === 'open');
    if (!k) throw new Error('geen kaart te vinden (open eerst la 1 van kast 2-4)');
    return k;
  }

  async fetch() {
    const g = this.g, k = this.currentFound();
    if (g.reading) g.putDown();
    g.takeFound(k);
    await this.waitStill();
    if (g.reading?.from !== 'found') g.takeFound(k);
    await sleep(1200);
  }

  async lay() {
    const g = this.g, k = this.currentFound();
    if (g.reading) g.putDown();
    const f = g.found.get(k);
    if (f.loc === 'bin' && f.obj) g.scene.remove(f.obj);
    if (!g.cards.has(k)) g.makeCard(k).place(new THREE.Vector3(0, 0, 0), new THREE.Quaternion());
    g.held = { key: k, kind: 'card' };
    g.goto('table');
    await this.waitStill();
    if (g.held?.key === k) g.putBackHeld({ force: true });
    await sleep(900);
  }

  // ---------------------------------------------------------------- time

  setTime(t) {
    const [h, m] = t.split(':').map(Number);
    const g = this.g;
    g.state.ms = Math.max(0, ((h * 60 + m) - START_MIN) * 60000 - g.state.pen);
  }
}
