// Sheets of the Volkskunde-atlas voor Nederland en Vlaams-België (P.J. Meertens and
// M. de Meyer, from the questionnaires of 1937 and later), pinned to the walls as
// working maps. Scans from the Meertens Instituut, in game/models/prints/. And what is
// pinned to the notice board by the door, which is only the office's own business.
import * as THREE from 'three';
import { ROOM } from './room.js';
import { canvasTexture, paperCanvas, makeNoise } from './textures.js';
import { MONTHS } from './game.js';

// where each hangs: the wall, its place along it, and what it shows
const SHEETS = [
  { file: 'map12018.jpg', title: 'Weerwolf (kaart 7)', wall: 'right', at: 1.55 },
  { file: 'map12019.jpg', title: 'Weerwolf (kaart 6)', wall: 'right', at: -3.05 },
  { file: 'map23374.jpg', title: 'Duivel (kaart 15)', wall: 'far', at: 1.75 },
  { file: 'map23376.jpg', title: 'Kabouter (kaart 13)', wall: 'back', at: 1.7 },
];
const WIDTH = 0.6;
const HEIGHT = 1.62;

// position and facing on each wall; the sheet stands just proud of the plaster
function placement(wall, at) {
  if (wall === 'right') return { pos: new THREE.Vector3(ROOM.x1 - 0.028, HEIGHT, at), ry: -Math.PI / 2, normal: new THREE.Vector3(-1, 0, 0) };
  if (wall === 'far') return { pos: new THREE.Vector3(at, HEIGHT, ROOM.z0 + 0.028), ry: 0, normal: new THREE.Vector3(0, 0, 1) };
  return { pos: new THREE.Vector3(at, HEIGHT, ROOM.z1 - 0.028), ry: Math.PI, normal: new THREE.Vector3(0, 0, -1) };
}

export function buildPrints(scene, M) {
  const loader = new THREE.TextureLoader();
  const pinMat = new THREE.MeshStandardMaterial({ color: 0x8a2a1e, roughness: 0.4 });
  const pinGeo = new THREE.SphereGeometry(0.006, 10, 8);
  return SHEETS.map((s, i) => {
    const { pos, ry, normal } = placement(s.wall, s.at);
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = ry;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, color: 0xffffff });
    // a sheet of paper picks up what little light there is, so it reads in the dark
    mat.emissive = new THREE.Color(0x2c2822);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, WIDTH * 1.06), mat);
    sheet.receiveShadow = true;
    g.add(sheet);
    loader.load(`models/prints/${s.file}`, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      mat.map = tex;
      mat.emissiveMap = tex;
      sheet.geometry.dispose();
      sheet.geometry = new THREE.PlaneGeometry(WIDTH, WIDTH * (tex.image.height / tex.image.width));
      mat.needsUpdate = true;
      placePins();
    });
    const pins = [];
    const placePins = () => {
      const h = sheet.geometry.parameters.height;
      for (const p of pins) g.remove(p);
      for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
        const pin = new THREE.Mesh(pinGeo, pinMat);
        pin.position.set(x * (WIDTH / 2 - 0.02), y * (h / 2 - 0.02), 0.004);
        g.add(pin);
        pins.push(pin);
      }
    };
    placePins();
    scene.add(g);
    // a station a step in front of it, to read it
    const eye = pos.clone().add(normal.clone().multiplyScalar(0.66));
    eye.y = HEIGHT;
    return { group: g, title: s.title, station: `print${i}`, eye, look: pos.clone() };
  });
}

// ------------------------------------------------------------------ the notice board by the door

// the board's cloth, as built in Blender (blender/layout.py BOARD; its cloth stands 19 mm proud)
const BOARD = { x: -1.45, y: 1.55, z: ROOM.z1 - 0.02 - 0.019, w: 0.86, h: 0.66 };
const TYPE = '"Special Elite", "Courier New", monospace';
const SERIF = '"IM Fell English SC", Georgia, serif';
const DAG = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

function calendar(date) {
  const W = 440, H = 620;
  const c = paperCanvas(W, H, { tone: [236, 230, 214], age: 0.6, seed: 21 });
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(150,34,26,0.9)';
  ctx.fillRect(0, 0, W, 112);
  ctx.fillStyle = '#efe6d2';
  ctx.font = `64px ${SERIF}`;
  ctx.fillText(MONTHS[date.getMonth()].toUpperCase(), W / 2, 74);
  ctx.font = `30px ${SERIF}`;
  ctx.fillText(String(date.getFullYear()), W / 2, 104);
  const cw = (W - 40) / 7, top = 170;
  ctx.font = `bold 26px ${TYPE}`;
  DAG.forEach((d, i) => {
    ctx.fillStyle = i === 6 ? 'rgba(150,34,26,0.9)' : 'rgba(40,34,28,0.85)';
    ctx.fillText(d, 20 + cw * (i + 0.5), top);
  });
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  let col = (first.getDay() + 6) % 7, row = 0;
  ctx.font = `34px ${TYPE}`;
  for (let d = 1; d <= days; d++) {
    ctx.fillStyle = col === 6 ? 'rgba(150,34,26,0.9)' : 'rgba(40,34,28,0.9)';
    ctx.fillText(String(d), 20 + cw * (col + 0.5), top + 62 + row * 66);
    if (++col === 7) { col = 0; row++; }
  }
  ctx.strokeStyle = 'rgba(40,34,28,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(20, top + 16); ctx.lineTo(W - 20, top + 16); ctx.stroke();
  return c;
}

function notice() {
  const W = 420, H = 590;
  const c = paperCanvas(W, H, { tone: [232, 226, 208], age: 0.7, seed: 23 });
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(28,24,20,0.88)';
  ctx.font = `bold 22px ${TYPE}`;
  ctx.fillText('CENTRAAL SAGENARCHIEF', 40, 70);
  ctx.font = `22px ${TYPE}`;
  ctx.fillText('Aan het personeel', 40, 104);
  ctx.fillRect(40, 118, W - 80, 2);
  const lines = ['Wie als laatste gaat:', '', '- koffiezetapparaat uit', '- ramen dicht', '- radiatoren laag', '- prullenbak leeg', '', '', 'De directie'];
  ctx.font = `24px ${TYPE}`;
  lines.forEach((l, i) => ctx.fillText(l, 40, 176 + i * 38));
  return c;
}

function clipping() {
  const W = 340, H = 560;
  const c = paperCanvas(W, H, { tone: [214, 204, 178], age: 1, seed: 25 });
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(24,22,20,0.92)';
  ctx.font = `bold 36px Georgia, serif`;
  ['Verhalen van', 'vroeger op', 'de band'].forEach((l, i) => ctx.fillText(l, 18, 50 + i * 40));
  ctx.font = `italic 19px Georgia, serif`;
  ctx.fillText('Archief zoekt oude vertellers', 18, 186);
  // a grainy photograph: a man at a table with a tape recorder, too far gone to make out
  const n = makeNoise(5);
  const px = 18, py = 204, pw = W - 36, ph = 150;
  const img = ctx.getImageData(px, py, pw, ph);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const fig = Math.exp(-(((x - pw * 0.36) / 34) ** 2 + ((y - ph * 0.42) / 46) ** 2));
      const tab = y > ph * 0.68 ? 0.35 : 0;
      const v = 0.62 - 0.4 * fig - tab + n.fbm(x / 30, y / 30, 3) * 0.35 + (Math.random() - 0.5) * 0.25;
      const g = Math.max(20, Math.min(220, v * 230));
      const i = (y * pw + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
    }
  }
  ctx.putImageData(img, px, py);
  // columns of print, too small to read from where you stand
  ctx.fillStyle = 'rgba(30,28,26,0.55)';
  const colW = (W - 36 - 12) / 2;
  for (let k = 0; k < 2; k++) {
    for (let y = py + ph + 22; y < H - 16; y += 11) {
      const w = colW * (y > H - 40 && k === 1 ? 0.5 : 0.82 + Math.random() * 0.18);
      ctx.fillRect(18 + k * (colW + 12), y, w, 4);
    }
  }
  return c;
}

// a corner of a sheet that was torn down, left under its pin
function scrap() {
  const c = paperCanvas(96, 96, { tone: [230, 224, 206], age: 0.8, seed: 27 });
  const ctx = c.getContext('2d');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(96, 0);
  for (let t = 0; t <= 1; t += 0.1) ctx.lineTo(96 * (1 - t) + (Math.random() - 0.5) * 8, 70 * t + (Math.random() - 0.5) * 8);
  ctx.closePath(); ctx.fill();
  return c;
}

export function buildBoard(scene, date) {
  const g = new THREE.Group();
  g.position.set(BOARD.x, BOARD.y, BOARD.z);
  g.rotation.y = Math.PI;
  const colours = [0xa8302a, 0xd8b23a, 0x2f4f8a, 0xe8e2d4, 0x3f7a4a];
  const pin = (x, y, k) => {
    const mat = new THREE.MeshStandardMaterial({ color: colours[k % colours.length], roughness: 0.35 });
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0065, 0.007, 14), mat);
    head.rotation.x = Math.PI / 2;
    head.position.set(x, y, 0.0075);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(x, y, 0.011);
    g.add(head, cap);
  };
  // a sheet, a little wavy where the paper has taken the damp, pinned at its top
  const sheet = (canvas, w, x, y, tilt, pins, k, curl = 0.004) => {
    const h = w * canvas.height / canvas.width;
    const geo = new THREE.PlaneGeometry(w, h, 8, 10);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / (w / 2), v = p.getY(i) / (h / 2);
      p.setZ(i, curl * (((1 - v) / 2) ** 2) * (0.6 + 0.4 * Math.abs(u)) + 0.0012 * Math.sin(u * 3 + v * 2));
    }
    geo.computeVertexNormals();
    const map = canvasTexture(canvas);
    const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0x2c2822, roughness: 0.92, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0.002 + k * 0.0006);
    m.rotation.z = tilt;
    g.add(m);
    for (const [px, py] of pins) {
      const c = Math.cos(tilt), s = Math.sin(tilt);
      const lx = px * w / 2, ly = py * h / 2;
      pin(x + lx * c - ly * s, y + lx * s + ly * c, k * 2 + (px > 0 ? 1 : 0));
    }
  };
  sheet(calendar(date), 0.2, -0.24, 0.02, 0.012, [[0, 0.955]], 0);
  sheet(notice(), 0.165, 0.02, 0.06, -0.035, [[-0.8, 0.9], [0.8, 0.9]], 1);
  sheet(clipping(), 0.13, 0.25, -0.03, 0.05, [[0, 0.965]], 2, 0.007);
  sheet(scrap(), 0.04, 0.17, 0.25, 0.3, [[-0.4, 0.5]], 3, 0);
  sheet(scrap(), 0.035, -0.06, -0.24, -2.6, [[-0.3, 0.4]], 4, 0);
  scene.add(g);
  return g;
}
