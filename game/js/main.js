// Boot: fonts, the night's bundle, then the room.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadBundle } from './bundle.js';
import { setAnisotropy } from './textures.js';
import {
  materials, buildCabinet, buildLampLights, buildClockParts, buildWindow, buildNightLight, buildDust, FAMILY_ORDER, ROOM, TABLE,
} from './room.js';
import { loadScenery, captureEnvironment, lighting } from './scenery.js';
import { WallMap } from './mapwall.js';
import { Typewriter } from './typewriter.js';
import { Door } from './door.js';
import { FiveLock } from './lock.js';
import { Strongbox, CardBox, CardTray, Spike } from './tablekit.js';
import { buildPrints, buildBoard } from './prints.js';
import { Rails } from './rails.js';
import { Sound } from './audio.js';
import { Voice } from './voice.js';
import { Atmosphere } from './atmos.js';
import { CabinetLeaks } from './leaks.js';
import { UI } from './ui.js';
import { Game, night } from './game.js';
import { makeComposer } from './post.js';

const $ = (id) => document.getElementById(id);

// a seed from the address, or the last night played, or any night
function chooseSeed() {
  const url = new URL(location.href);
  const q = url.searchParams.get('seed');
  if (q) return q.slice(0, 40);
  try {
    const last = localStorage.getItem('nd3:last');
    if (last) return last;
  } catch { /* no storage */ }
  return String(Math.floor(Math.random() * 1e6));
}

function newSeed() {
  const url = new URL(location.href);
  url.searchParams.set('seed', String(Math.floor(Math.random() * 1e6)));
  location.href = url.toString();
}

async function typeInto(el, lines, cps = 38) {
  el.textContent = '';
  for (const line of lines) {
    for (const ch of line) {
      el.textContent += ch;
      await new Promise((r) => setTimeout(r, 1000 / cps + (ch === ' ' ? 20 : 0)));
    }
    el.textContent += '\n';
    await new Promise((r) => setTimeout(r, 380));
  }
}

async function boot() {
  const wanted = chooseSeed();
  $('tc-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-enter').click(); });
  $('btn-newseed').addEventListener('click', (e) => { e.preventDefault(); newSeed(); });

  const fontsReady = Promise.all([
    document.fonts.load('40px "Special Elite"'),
    document.fonts.load('40px "Homemade Apple"'),
    document.fonts.load('40px "IM Fell English SC"'),
    document.fonts.load('italic 40px "IM Fell English"'),
  ]).catch(() => {});
  // ------------------------------------------------------------------ renderer and scene
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // ACES: three r160's AgX clips saturated dark oranges (wood under a warm lamp) to black
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  setAnisotropy(renderer.capabilities.getMaxAnisotropy());

  const [bundle, cabinetsInfo, geo, places, scenery] = await Promise.all([
    loadBundle(wanted),
    fetch('data/cabinets.json').then((r) => r.json()),
    fetch('data/map.json').then((r) => r.json()),
    fetch('data/places.json').then((r) => r.json()),
    loadScenery(renderer),
    fontsReady,
  ]);
  const seed = bundle.seed;
  $('tc-archive').textContent = `ARCHIEF ${seed}`;
  $('tc-date').textContent = `Amsterdam, ${night().weekday}`;
  typeInto($('tc-intro'), bundle.frame.intro);

  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem('nd3:' + seed) || 'null');
  } catch { saved = null; }
  if (saved && saved.finished) saved = null;
  try {
    $('tc-name').value = (saved && saved.name) || localStorage.getItem('nd:name') || '';
  } catch { /* no storage */ }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020202);
  scene.fog = new THREE.FogExp2(0x030302, 0.045);
  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.02, 60);
  scene.add(camera);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const M = materials(envMap);
  // the room, its furniture and its light come from Blender (blender/build.py)
  const sc = scenery.byName;
  scene.add(scenery.root);
  const cabinets = FAMILY_ORDER.map((fam, i) => {
    const c = buildCabinet(M, fam, cabinetsInfo[fam], i, sc, bundle.cabinets[i]?.drawers.length ?? 3);
    scene.add(c.group);
    return c;
  });
  const tableGroup = sc.table;
  const lamp = buildLampLights(scene, sc);
  const clock = buildClockParts(scene, M, sc);
  const windowRefs = buildWindow(scene, sc);
  windowRefs.night = buildNightLight(scene);
  lighting.uFill.value.setRGB(0.22, 0.26, 0.37);
  const dust = buildDust(scene);
  const map = new WallMap(M, geo, places);
  scene.add(map.group);
  const tw = new Typewriter(M, sc);
  scene.add(tw.group);
  const door = new Door(sc);
  scene.add(door.group);
  const lock = new FiveLock(M, 'Kast V · niet openen');
  scene.add(lock.group);
  // sheets of the Volkskunde-atlas on the walls
  const prints = buildPrints(scene, M);
  // and what is pinned to the notice board by the door
  buildBoard(scene, night().date);
  const strongbox = new Strongbox(M);
  scene.add(strongbox.group);
  const cardBox = new CardBox();
  scene.add(cardBox.group);
  // the envelope bay and the bill spike (sections 3b, 3g)
  const tray = new CardTray(M);
  scene.add(tray.group);
  const spike = new Spike();
  scene.add(spike.group);
  // what is written on each cabinet, by its number 1–5
  const cabinetInfo = {};
  for (const info of Object.values(cabinetsInfo)) cabinetInfo[info.id] = info;

  // live light, for what moves and what the game draws itself; the room's own light is baked
  const hemi = new THREE.HemisphereLight(0x2a3444, 0x0e0a07, 0.35);
  scene.add(hemi);
  // what you carry: enough light to read a label at arm's length
  const carry = new THREE.PointLight(0xffc98e, 1.5, 4.5, 2);
  carry.position.set(0.22, -0.28, 0.05);
  camera.add(carry);
  const carryWorld = new THREE.Vector3();
  // where the moonlight comes from: high, outside the window
  const MOON = new THREE.Vector3(0.4, 3.0, ROOM.z0 - 1.6);

  // reflections: a capture of the room itself, from beside the table
  const env = captureEnvironment(renderer, scene, new THREE.Vector3(TABLE.x, 1.3, TABLE.z + 0.6));
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || !m.isMeshStandardMaterial) continue;
      m.envMap = env;
      m.envMapIntensity = m.userData.baked ? 1.0 : 0.45;
      m.needsUpdate = true;
    }
  });

  const post = makeComposer(renderer, scene, camera);
  post.setSize(window.innerWidth, window.innerHeight);

  const sound = new Sound();
  const ui = new UI();
  const voice = new Voice(sound, $('subtitle'));
  const rails = new Rails(camera, sound);
  for (const p of prints) rails.addStation(p.station, p.eye, p.look, p.title);
  // each leak has a half on its own cabinet
  const local = new CabinetLeaks({ scene, camera, sound, rails, cabinets });
  const atmos = new Atmosphere({ scene, camera, sound, rails, windowRefs, clock, lamp, hemi, door, local });
  const game = new Game({
    scene, camera, dom: canvas, sound, rails, ui, voice, bundle, cabinetInfo, cabinets, map, tw, door, lock,
    strongbox, cardBox, tray, spike, prints, atmos, clock, lamp, tableGroup, windowRefs, sc, sceneryRoot: scenery.root, post,
  });
  window.__game = game; // for the curious, and for testing
  // ?admin in the address: a panel to jump to any part of the night (` shows and hides it)
  if (new URL(location.href).searchParams.has('admin')) import('./admin.js').then((m) => m.attach(game));

  // ------------------------------------------------------------------ loop
  const clockT = new THREE.Clock();
  let t = 0;
  const fwd = new THREE.Vector3();
  function frame() {
    const dt = Math.min(0.05, clockT.getDelta());
    t += dt;
    rails.update(dt, t);
    // standing at a cabinet you hold the light up to the labels: as much on them from
    // close by as from a step back, so a near look does not burn out
    let close = rails.current === 'cabinets' ? 2.6 : 1.5;
    if (/^cab\d$/.test(rails.current) || rails.current === 'lock') {
      const st = rails.S[rails.current];
      close = THREE.MathUtils.clamp(st.pos.distanceToSquared(st.look), 0.4, 3.6);
    }
    carry.intensity += (close - carry.intensity) * Math.min(1, dt * 1.2);
    camera.updateMatrixWorld();
    carry.getWorldPosition(carryWorld);
    lighting.uCarryPos.value.copy(carryWorld).applyMatrix4(camera.matrixWorldInverse);
    lighting.uCarryColor.value.copy(carry.color).multiplyScalar(carry.intensity);
    lighting.uMoonPos.value.copy(MOON).applyMatrix4(camera.matrixWorldInverse);
    game.update(dt, t);
    atmos.update(dt, t);
    map.update(dt);
    tw.update(dt, t);
    door.update(dt);
    // the strip of corridor light belongs to the gap under a shut door
    windowRefs.night.gap.visible = door.open < 0.02;
    dust.uniforms.uTime.value = t;
    camera.getWorldDirection(fwd);
    sound.setListener([camera.position.x, camera.position.y, camera.position.z], [fwd.x, fwd.y, fwd.z], [0, 1, 0]);
    post.render(t);
    requestAnimationFrame(frame);
  }
  frame();

  window.addEventListener('resize', () => {
    game.fitView();
    renderer.setSize(window.innerWidth, window.innerHeight);
    post.setSize(window.innerWidth, window.innerHeight);
    if (game.reading) game.layoutReading();
  });

  // ------------------------------------------------------------------ title card
  const enter = $('btn-enter');
  const resume = $('btn-resume');
  enter.disabled = false;
  enter.textContent = saved ? 'Opnieuw beginnen' : 'Aan het werk';
  if (saved) resume.hidden = false;

  let started = false;
  const begin = async (fromSave) => {
    if (started) return;
    started = true;
    enter.disabled = true;
    resume.disabled = true;
    sound.init();
    sound.resume();
    const name = $('tc-name').value.trim().slice(0, 32);
    try { localStorage.setItem('nd:name', name); } catch { /* fine */ }
    game.state.name = name;
    const fresh = !(fromSave && saved);
    if (!fresh) game.restore(saved);
    else {
      try { localStorage.removeItem('nd3:' + seed); } catch { /* fine */ }
    }
    $('title').classList.add('gone');
    setTimeout(() => ($('title').hidden = true), 1700);
    // a fresh night opens just inside the door, the collector just gone, looking down the room
    if (fresh) rails.go('entry', { instant: true });
    ui.showHud(true);
    game.start();
    await ui.fade(0, 2600);
    if (fresh) {
      // downstairs, the front door: he has gone home, with the key
      setTimeout(() => sound.doorSlam([0, 0.6, ROOM.z1 + 6]), 300);
      setTimeout(() => sound.keyTurn([0, 0.6, ROOM.z1 + 6]), 1700);
      // then you go to the table, unhurried, unless you have gone somewhere already
      setTimeout(() => {
        if (rails.current === 'entry' && !rails.moving && !game.finished) rails.go('table', { duration: 6.5 });
      }, 2400);
    } else {
      rails.go('room');
    }
    game.save();
  };
  enter.addEventListener('click', () => begin(false));
  resume.addEventListener('click', () => begin(true));

  $('btn-sound').addEventListener('click', () => {
    const on = !sound.enabled;
    sound.setEnabled(on);
    $('btn-sound').textContent = on ? 'geluid aan' : 'geluid uit';
  });

  // final screen
  $('btn-save-card').addEventListener('click', () => {
    const c = $('final-card');
    const a = document.createElement('a');
    a.download = `nachtdienst-${seed}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
  });
  $('btn-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(game.shareText());
      $('btn-copy').textContent = 'Gekopieerd';
    } catch {
      $('btn-copy').textContent = 'Kopiëren lukte niet';
    }
  });
  $('btn-again').addEventListener('click', () => newSeed());
  // the back of your card: the cards you read tonight (3h)
  $('btn-turn').addEventListener('click', () => {
    const back = $('final-back').hidden;
    $('final-back').hidden = !back;
    $('final-card').hidden = back;
    $('btn-turn').textContent = back ? 'Voorkant' : 'Achterkant';
  });

}

boot().catch((e) => {
  console.error(e);
  const b = $('btn-enter');
  b.textContent = 'Het archief laadt niet. Start via een webserver (zie README).';
});
