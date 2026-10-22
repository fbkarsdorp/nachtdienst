// The archive: one long room. Cabinets along the left wall, the reading table in
// the middle, the wall map on the right, the window at the far end, the door behind you.
// The room itself is modelled and lit in Blender (blender/); this file holds its
// measurements and the pieces the game still makes: labels, plates, dials, lights.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { textureSet, boxUVs, makeCanvas, canvasTexture, fixedTexture, paperCanvas } from './textures.js';

export const ROOM = { x0: -2.7, x1: 2.7, z0: -7.5, z1: 8.0, h: 3.3 };
export const FAMILY_ORDER = ['voortekenen', 'wittewieven', 'weerwolven', 'spoken', 'duivel'];
export const CABINET_Z = [5.0, 2.6, 0.2, -2.2, -4.6];
export const CAB = { w: 1.6, h: 2.08, d: 0.55, front: ROOM.x0 + 0.55, cols: 4, rows: 6, dw: 0.355, dh: 0.245, y0: 0.2 };
export const PUZZLE_ROW = 3;
// the fifth cabinet stays shut
export const CLOSED = 4;
export const TABLE = { x: 0.3, z: -0.9, w: 1.9, d: 0.95, y: 0.78 };
export const LAMP_POS = new THREE.Vector3(-0.38, TABLE.y, -1.2);

const TYPE = '"Special Elite", "Courier New", monospace';
const FELL = '"IM Fell English SC", Georgia, serif';

// Materials for what the game still builds itself (drawer insides, dials, the typewriter's
// moving parts, the door's letter rings). The room's own materials come from Blender.
export function materials(envMap) {
  // the oak of the drawer fronts (Blender's 'drawer'), a shade lighter: bare wood inside
  const oak = new THREE.MeshStandardMaterial({ ...textureSet('oak_veneer_01'), roughness: 0.8, metalness: 0 });
  oak.color.setRGB(0.5, 0.36, 0.24, THREE.LinearSRGBColorSpace);
  oak.normalScale.set(0.7, 0.7);
  return {
    oak,
    brass: new THREE.MeshStandardMaterial({ color: 0xb8924a, metalness: 1, roughness: 0.38, envMap, envMapIntensity: 0.45 }),
    darkBrass: new THREE.MeshStandardMaterial({ color: 0x6d5428, metalness: 1, roughness: 0.5, envMap, envMapIntensity: 0.3 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x1a1918, metalness: 0.7, roughness: 0.55, envMap, envMapIntensity: 0.25 }),
    enamel: new THREE.MeshStandardMaterial({ color: 0x0d0d0e, metalness: 0.3, roughness: 0.25, envMap, envMapIntensity: 0.5 }),
    black: new THREE.MeshStandardMaterial({ color: 0x080706, roughness: 0.9 }),
    cardEdge: new THREE.MeshStandardMaterial({ color: 0xd9cdb0, roughness: 0.95 }),
  };
}

// ------------------------------------------------------------------ cabinets

function labelCanvas(lines, { red = false, register = false, w = 512, h = 168 } = {}) {
  const c = paperCanvas(w, h, { tone: register ? [206, 204, 192] : [228, 218, 192], age: 0.8, seed: 3 });
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(30,26,22,0.92)';
  // big enough to read from where you stand at the cabinet: two lines of title at most
  ctx.font = register ? `bold 52px ${TYPE}` : `bold 62px ${TYPE}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(lines[0], 22, 62);
  if (lines[1]) {
    ctx.font = `bold 46px ${TYPE}`;
    const words = lines[1].split(' ');
    let line = '', y = 112;
    for (const wd of words) {
      const t = line ? line + ' ' + wd : wd;
      if (ctx.measureText(t).width > w - (red ? 76 : 40) && line) {
        ctx.fillText(line, 22, y);
        y += 48;
        line = wd;
        if (y > h - 4) break;
      } else line = t;
    }
    if (y <= h - 4) ctx.fillText(line, 22, y);
  }
  if (red) {
    ctx.fillStyle = 'rgba(168,36,28,0.85)';
    ctx.fillRect(w - 36, 0, 36, h);
  }
  return c;
}

// Paper labels pick up what little light there is, so they read where the wood goes dark.
export const LABEL_GLOW = 0x3a3428;
function labelMaterial(canvas) {
  const map = fixedTexture(canvas);
  return new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: LABEL_GLOW, roughness: 0.9 });
}

function plateCanvas(roman, title) {
  const c = makeCanvas(1024, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#c9a75e');
  g.addColorStop(0.5, '#a5843f');
  g.addColorStop(1, '#7c6129');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = 'rgba(60,40,10,0.7)';
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, 996, 228);
  ctx.fillStyle = 'rgba(40,26,8,0.92)';
  ctx.textAlign = 'center';
  // engraved to fit between the screws
  const text = `${roman}  ·  ${title.toUpperCase()}`;
  let size = 120;
  ctx.font = `${size}px ${FELL}`;
  while (ctx.measureText(text).width > 880 && size > 60) ctx.font = `${(size -= 4)}px ${FELL}`;
  ctx.fillText(text, 512, 128 + size * 0.35);
  // screws
  ctx.fillStyle = 'rgba(70,50,20,0.9)';
  for (const x of [44, 980]) { ctx.beginPath(); ctx.arc(x, 128, 12, 0, 7); ctx.fill(); }
  return c;
}

// What each drawer of a cabinet holds, as rows from the bottom up. Every story type
// has one drawer of its own, in catalogue order along the top; below the puzzle row
// is the place register, a drawer per province from north to south; whatever is
// left over holds the things every archive has a drawer for.
const PROVINCES = ['Groningen', 'Friesland', 'Drenthe', 'Noord-Holland', 'Overijssel', 'Flevoland',
  'Gelderland', 'Utrecht', 'Zuid-Holland', 'Zeeland', 'Noord-Brabant', 'Limburg'];
const SUNDRIES = [
  { title: 'Vertellers', sub: 'A tot en met K' }, { title: 'Vertellers', sub: 'L tot en met Z' },
  { title: 'Varia', sub: 'niet in te delen' }, { title: 'Doublures', sub: 'afschriften' },
];
function drawerPlan(types, closed, puzzles = 3) {
  const { cols, rows } = CAB;
  const plan = Array.from({ length: rows }, () => Array(cols).fill(null));
  const sorted = types.slice().sort((a, b) => a.code.localeCompare(b.code));
  const sundries = SUNDRIES.slice();
  // the two rows above the puzzle row: the types, then the sundries
  for (let r = rows - 1, i = 0; r > PUZZLE_ROW; r--) {
    for (let c = 0; c < cols; c++, i++) plan[r][c] = sorted[i] ? { code: sorted[i].code, title: sorted[i].title } : sundries.shift();
  }
  plan[PUZZLE_ROW][cols - 1] = { title: 'Nog te ordenen', sub: 'binnengekomen' };
  // the cabinet that stays shut has no puzzles: its sundries fill the row
  if (closed) for (let c = 0; c < cols; c++) plan[PUZZLE_ROW][c] = sundries.shift() || plan[PUZZLE_ROW][c];
  // a cabinet with fewer puzzles files loose papers in the spare drawer
  else for (let c = puzzles; c < cols - 1; c++) plan[PUZZLE_ROW][c] = { title: 'Aantekeningen', sub: 'losse stukken' };
  for (let r = PUZZLE_ROW - 1, i = 0; r >= 0; r--) {
    for (let c = 0; c < cols; c++, i++) plan[r][c] = { title: PROVINCES[i], sub: 'plaatsregister' };
  }
  return plan;
}

// One cabinet per family. Every drawer carries a typed label with what it holds;
// the puzzle row holds the night's puzzles (three in the first cabinet, two in the
// others), except in the fifth cabinet, which stays shut and holds one card, filed under Varia.
export function buildCabinet(M, fam, famInfo, index, sc, puzzles = 3) {
  const g = new THREE.Group();
  const z = CABINET_Z[index];
  g.position.set(ROOM.x0, 0, z);
  g.userData = { fam, index };
  g.updateMatrixWorld();
  const { w, h, d } = CAB;
  // the carcass is modelled and lit in Blender
  const carcass = sc[`cab${index}_body`];
  if (carcass) g.attach(carcass);

  // the sign has to read from across the room: satin brass that holds what light there is
  const plateMap = canvasTexture(plateCanvas(famInfo.roman, famInfo.title));
  const plateMat = new THREE.MeshStandardMaterial({
    map: plateMap, emissiveMap: plateMap, emissive: 0x8a7650, metalness: 0.35, roughness: 0.5, envMap: M.brass.envMap, envMapIntensity: 0.5,
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.195), plateMat);

  plate.position.set(d + 0.002, h - 0.18, 0);
  plate.rotation.y = Math.PI / 2;
  g.add(plate);

  // Drawer grid
  const drawers = [];
  const { cols, rows, dw, dh, y0 } = CAB;
  const gridW = cols * dw;
  const closed = index === CLOSED;
  const slots = drawerPlan(famInfo.types, closed, puzzles);
  // shared by every drawer of this cabinet: the four sides of the body, and one card
  const drawerShell = mergeGeometries([
    [0.48, 0.008, dw - 0.03, -0.24, -dh / 2 + 0.012, 0],
    [0.48, dh - 0.05, 0.008, -0.24, -0.015, -dw / 2 + 0.019],
    [0.48, dh - 0.05, 0.008, -0.24, -0.015, dw / 2 - 0.019],
    [0.008, dh - 0.05, dw - 0.03, -0.476, -0.015, 0],
  ].map(([w, h, dd, x, y, z]) => new THREE.BoxGeometry(w, h, dd).translate(x, y, z)));
  boxUVs(drawerShell, 1.83, 'x', [index * 0.17, 0]);
  const cardGeo = new THREE.BoxGeometry(0.003, dh * 0.62, dw * 0.78);
  const N_CARDS = 26;
  const tmp = new THREE.Object3D();
  for (let r = rows - 1; r >= 0; r--) {
    for (let cIdx = 0; cIdx < cols; cIdx++) {
      const isPuzzle = r === PUZZLE_ROW && cIdx < puzzles && !closed;
      const dg = new THREE.Group();
      // columns run left to right as seen from the room (toward -z)
      const cz = gridW / 2 - dw / 2 - cIdx * dw;
      const cy = y0 + dh / 2 + r * dh;
      dg.position.set(d, cy, cz);
      g.add(dg);
      dg.updateMatrixWorld();
      // the front, label holder and pull come from Blender, already lit
      const front = sc[`cab${index}_d${r}_${cIdx}`];
      if (front) dg.attach(front);
      // drawer body (visible when pulled out): one mesh, and the cards in it one draw call
      const body = new THREE.Group();
      const shell = new THREE.Mesh(drawerShell, M.oak);
      shell.castShadow = shell.receiveShadow = true;
      body.add(shell);
      const stack = new THREE.InstancedMesh(cardGeo, M.cardEdge, N_CARDS);
      for (let i = 0; i < N_CARDS; i++) {
        tmp.position.set(-0.03 - i * 0.016, -dh / 2 + 0.012 + dh * 0.31, (Math.random() - 0.5) * 0.004);
        tmp.rotation.set(0, 0, -0.12 + Math.random() * 0.03);
        tmp.updateMatrix();
        stack.setMatrixAt(i, tmp.matrix);
      }
      body.add(stack);
      dg.add(body);
      let label;
      let labelInfo;
      if (isPuzzle) {
        labelInfo = { kind: 'puzzle', slot: cIdx };
        label = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.0625), labelMaterial(labelCanvas([`${famInfo.roman}-${cIdx + 1}`, '—'], { red: true })));
      } else {
        const slot = slots[r][cIdx];
        if (slot.code) {
          labelInfo = { kind: 'type', code: slot.code, title: slot.title };
          label = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.0625), labelMaterial(labelCanvas([slot.code, slot.title])));
        } else {
          labelInfo = { kind: 'register', title: slot.title, sub: slot.sub, one: closed && slot.title === 'Varia' };
          label = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.0625), labelMaterial(labelCanvas([slot.title, slot.sub], { register: true })));
        }
      }
      // the card slides into the brass holder, just proud of the front
      label.position.set(0.0262, 0.045, 0);
      label.rotation.y = Math.PI / 2;
      dg.add(label);
      dg.userData = { cabinet: index, fam, row: r, col: cIdx, ...labelInfo, open: 0, target: 0, label, front, body };
      drawers.push(dg);
    }
  }

  return { group: g, drawers, plate, z };
}

// ------------------------------------------------------------------ table, lamp, chairs

// ------------------------------------------------------------------ the lamp's live lights

// The lamp's light on the room is baked; these lights are for what moves on the
// table (cards, pins, the typewriter) and they must agree with the bake.
export function buildLampLights(scene, sc) {
  const at = new THREE.Vector3();
  (sc.anchor_lamp_light || new THREE.Object3D()).getWorldPosition(at);
  const spot = new THREE.SpotLight(0xffd2a0, 3.2, 0, Math.PI * 0.36, 0.8, 2);
  spot.position.copy(at);
  spot.target.position.set(TABLE.x - 0.05, TABLE.y, TABLE.z + 0.2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.camera.near = 0.05;
  spot.shadow.camera.far = 6;
  spot.shadow.bias = -0.0004;
  spot.shadow.radius = 4;
  scene.add(spot, spot.target);
  const glow = new THREE.PointLight(0xffc98a, 0.9, 3.2, 2);
  glow.position.copy(at);
  scene.add(glow);
  // cards cast shadows onto the (baked) table through this catcher
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(TABLE.w - 0.02, TABLE.d - 0.02), new THREE.ShadowMaterial({ opacity: 0.45 }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.set(TABLE.x, TABLE.y + 0.0026, TABLE.z);
  catcher.receiveShadow = true;
  scene.add(catcher);
  return { group: sc.lamp_body, spot, glow, bulb: sc.lamp_bulb, lining: sc.lamp_lining };
}

// ------------------------------------------------------------------ clock

// The case is modelled in Blender; the face, hands and pendulum are drawn here.
export function buildClockParts(scene, M, sc) {
  const frame = (name) => {
    const a = sc[name] || new THREE.Object3D();
    const g = new THREE.Group();
    a.getWorldPosition(g.position);
    a.getWorldQuaternion(g.quaternion);
    scene.add(g);
    return g;
  };
  const faceG = frame('anchor_clock_face');
  const faceTex = canvasTexture(drawClockFace());
  // the dial gives back a little light, as enamel does, so it reads across the dark room
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.162, 64), new THREE.MeshStandardMaterial({
    map: faceTex, emissiveMap: faceTex, emissive: new THREE.Color(0x3c372e), roughness: 0.45 }));
  faceG.add(dial);
  // round the dial the square of the door is dark wood, not paper
  if (sc.clock_dialback) sc.clock_dialback.material = new THREE.MeshStandardMaterial({ color: 0x24160d, roughness: 0.55 });
  // blued steel hands, a spade near the tip, a short tail; a brass boss over the arbor
  const steel = new THREE.MeshStandardMaterial({ color: 0x141a26, roughness: 0.35, metalness: 0.7 });
  const hourHand = new THREE.Mesh(handGeometry(0.09, 0.0045, 0.014, 0.022), steel);
  hourHand.position.z = 0.004;
  const minHand = new THREE.Mesh(handGeometry(0.135, 0.003, 0.0095, 0.03), steel);
  minHand.position.z = 0.0065;
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0085, 0.006, 20), M.brass);
  boss.rotation.x = Math.PI / 2;
  boss.position.z = 0.009;
  for (const m of [hourHand, minHand, boss]) m.castShadow = true;
  faceG.add(hourHand, minHand, boss);
  // a glass over the dial: a faint sheen, no more
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.162, 48), new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, opacity: 0.06, roughness: 0.05, metalness: 0.2, envMap: M.brass.envMap, envMapIntensity: 0.6, depthWrite: false }));
  glass.position.z = 0.012;
  faceG.add(glass);
  // The pendulum swings behind the lower glass. The case is solid, so it hangs just inside
  // the glass, in front of a dark well.
  const pend = frame('anchor_clock_pend');
  pend.translateZ(0.057);
  const well = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.6), new THREE.MeshBasicMaterial({ color: 0x050403 }));
  well.position.copy(pend.position);
  well.quaternion.copy(pend.quaternion);
  well.translateY(-0.32);
  well.translateZ(-0.006);
  scene.add(well);
  const rod = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.47, 0.003), M.darkBrass);
  rod.position.y = -0.235;
  const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.008, 40), M.brass);
  bob.rotation.x = Math.PI / 2;
  bob.position.y = -0.47;
  // a little warm light on the brass, so it catches the eye as it swings
  const glint = new THREE.PointLight(0xffc98e, 0.05, 0.5, 2);
  glint.position.set(0.1, -0.3, 0.12);
  pend.add(rod, bob, glint);
  return { group: sc.clock_case || faceG, hourHand, minHand, pend };
}

// a clock hand along +y: a narrow shaft, a spade near the tip, a short tail behind the arbor
function handGeometry(len, w, spade, tail) {
  const sh = new THREE.Shape();
  const sy = len * 0.72;
  sh.moveTo(-w * 1.6, -tail);
  sh.lineTo(-w / 2, 0);
  // the spade: a leaf, widest low down, drawn out to a point
  sh.lineTo(-w / 2, sy - spade * 0.9);
  sh.bezierCurveTo(-spade * 1.1, sy - spade * 0.5, -spade * 0.8, sy + spade * 0.6, 0, len);
  sh.bezierCurveTo(spade * 0.8, sy + spade * 0.6, spade * 1.1, sy - spade * 0.5, w / 2, sy - spade * 0.9);
  sh.lineTo(w / 2, 0);
  sh.lineTo(w * 1.6, -tail);
  sh.lineTo(0, -tail - w * 2);
  sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth: 0.0012, bevelEnabled: false, curveSegments: 10 });
}

// The dial: old enamel, a little yellowed towards the rim, Roman hours (IIII, as clocks have
// it), a minute track between two rings, the maker's name under XII.
function drawClockFace() {
  const c = makeCanvas(1024, 1024), ctx = c.getContext('2d');
  const C = 512;
  const g = ctx.createRadialGradient(C, C, 60, C, C, 500);
  g.addColorStop(0, '#efe7d2');
  g.addColorStop(0.75, '#e6dbbf');
  g.addColorStop(1, '#d4c49e');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(C, C, 500, 0, 7); ctx.fill();
  // fine crazing in the enamel
  ctx.strokeStyle = 'rgba(120,100,70,0.08)';
  ctx.lineWidth = 1;
  let r = 7;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    let x = C + (rnd() - 0.5) * 900, y = C + (rnd() - 0.5) * 900;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 90; y += (rnd() - 0.5) * 90; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.strokeStyle = '#231b12';
  ctx.fillStyle = '#231b12';
  // the minute track: two rings, a stroke a minute, a dot every five
  for (const [rad, lw] of [[468, 3], [432, 2]]) {
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(C, C, rad, 0, 7); ctx.stroke();
  }
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    if (i % 5) {
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(C + Math.sin(a) * 434, C - Math.cos(a) * 434);
      ctx.lineTo(C + Math.sin(a) * 466, C - Math.cos(a) * 466);
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(C + Math.sin(a) * 450, C - Math.cos(a) * 450, 7, 0, 7); ctx.fill();
    }
  }
  ctx.font = `92px ${FELL}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const nums = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  nums.forEach((n, i) => {
    const a = (i / 12) * Math.PI * 2;
    ctx.save();
    ctx.translate(C + Math.sin(a) * 360, C - Math.cos(a) * 360);
    ctx.rotate(a);
    ctx.scale(0.82, 1);
    ctx.fillText(n, 0, 0);
    ctx.restore();
  });
  ctx.font = `30px ${FELL}`;
  ctx.fillStyle = 'rgba(35,27,18,0.85)';
  ctx.fillText('A. VAN DER HEIJDEN', C, C - 180);
  ctx.font = `24px ${FELL}`;
  ctx.fillText('DELFT', C, C - 146);
  return c;
}

// ------------------------------------------------------------------ window with nothing outside

export function buildWindow(scene, sc) {
  const z = ROOM.z0;
  const y0 = 1.0, y1 = 2.55;
  const midY = (y0 + y1) / 2;
  // Outside: the far side of the canal, drawn on a plane well back from the glass so it
  // moves as it should when you walk. Everything is placed in metres: the archive is one
  // floor up (a low one), the street opposite lies 3.4 m below our floor, the water 1.4 m below that.
  const DEPTH = 22;
  const outsideMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMist: { value: 0 }, uDawn: { value: 0 } },
    fog: false,
    vertexShader: `varying vec2 vP; void main(){ vP = (modelMatrix * vec4(position, 1.0)).xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vP;
      uniform float uTime, uMist, uDawn;
      const float STREET = -3.4, WATER = -4.8, BAY = 6.5;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }

      vec3 sky(vec2 p){
        float h = clamp((p.y - 2.0) / 22.0, 0.0, 1.0);
        vec3 c = mix(vec3(0.030,0.038,0.060), vec3(0.008,0.011,0.022), h);
        // the moon is up to the right, out of sight: the clouds are lit from there
        float cl = fbm(vec2(p.x * 0.06 + uTime * 0.004, p.y * 0.11));
        float lit = smoothstep(0.45, 0.8, cl) * (0.5 + 0.5 * smoothstep(-20.0, 25.0, p.x));
        c += vec3(0.055,0.062,0.080) * lit;
        // city glow low down
        c += vec3(0.030,0.020,0.012) * exp(-max(p.y - 6.0, 0.0) * 0.12);
        vec3 day = mix(vec3(0.30,0.31,0.33), vec3(0.46,0.47,0.49), h) * (0.92 + 0.12 * cl);
        return mix(c, day, uDawn);
      }

      // one house of the row: 0 outside it, 1 facade. win: 1 glass, 0.5 the painted frame
      float house(vec2 p, out float win, out float lit, out float tv, out float shade){
        float i = floor(p.x / BAY);
        float u = fract(p.x / BAY);
        float r = hash(vec2(i, 3.1)), r2 = hash(vec2(i, 7.7)), r3 = hash(vec2(i, 1.3));
        float top = STREET + 10.5 + floor(r * 4.0) * 1.5;   // three to five floors
        float y = p.y - STREET;
        float kind = floor(r2 * 4.0);
        float edge = abs(u - 0.5);
        float body = step(p.y, top);
        float gable = 0.0;
        if (kind < 1.0) gable = step(p.y, top + (0.5 - edge) * 2.0 * 3.2);                          // spout
        else if (kind < 2.0) gable = step(p.y, top + floor((0.5 - edge) * 8.0) * 0.8) * step(edge, 0.47); // stepped
        else if (kind < 3.0) gable = step(p.y, top + 3.0) * step(edge, 0.2) + step(p.y, top + 0.9) * step(edge, 0.36); // neck
        else gable = step(p.y, top + 0.5) * step(edge, 0.5);                                          // cornice
        float in_ = max(body, gable) * step(STREET, p.y);
        // windows: two or three across, tall, one row per floor, in white-painted frames
        float n = r3 < 0.45 ? 2.0 : 3.0;
        float fl = floor((y - 0.6) / 3.0);
        float fy = fract((y - 0.6) / 3.0);
        float wx = abs(fract(u * n) - 0.5) * BAY / n;           // metres from the window's middle
        float wy = abs(fy - 0.47) * 3.0;
        float rows = step(0.0, fl) * step(p.y, top - 1.2);
        float glass = step(wx, 0.5) * step(wy, 0.95) * rows;
        float frame = step(wx, 0.6) * step(wy, 1.05) * rows;
        // glazing bars: a cross in every window
        float bars = (1.0 - step(0.035, abs(wx))) + (1.0 - step(0.035, abs(fy - 0.6) * 3.0));
        win = max(glass * (1.0 - 0.5 * clamp(bars, 0.0, 1.0)), frame * 0.5 * (1.0 - glass));
        // the little window in the gable, under the hoist beam
        float gw = step(abs(u - 0.5) * BAY, 0.35) * step(abs(p.y - (top + 1.2)), 0.45) * step(kind, 2.5) * gable;
        win = max(win, gw);
        float cell = hash(vec2(i * 3.0 + floor(u * n), fl + 11.0));
        lit = step(0.84, cell) * (0.5 + 0.5 * hash(vec2(cell, 2.0)));
        tv = step(0.975, hash(vec2(cell, 5.0))) * (1.0 - step(0.84, cell));
        shade = r;
        // a dark seam between neighbours
        in_ *= 1.0 - 0.6 * (1.0 - step(0.012, min(u, 1.0 - u)));
        return in_;
      }

      vec3 lampGlow(vec2 p){
        // quay lamps on the far side, every 14 m
        float lx = (fract(p.x / 14.0 + 0.3) - 0.5) * 14.0;
        vec2 d = vec2(lx, p.y - (STREET + 3.6));
        float g = exp(-dot(d, d) * 2.5) * 1.4 + exp(-length(d) * 0.9) * 0.05;
        return vec3(1.0, 0.72, 0.38) * g * (1.0 - uDawn);
      }

      vec3 view(vec2 p){
        vec3 c = sky(p);
        float win, lit, tv, shade;
        float h = house(p, win, lit, tv, shade);
        if (h > 0.05) {
          // dark brick, lifted a little by the lamps below
          vec3 brick = mix(vec3(0.0070,0.0050,0.0042), vec3(0.0130,0.0090,0.0072), shade);
          brick *= 1.0 + 3.0 * exp(-(p.y - STREET) * 0.4) * (1.0 - uDawn);
          vec3 dayBrick = mix(vec3(0.075,0.058,0.050), vec3(0.11,0.088,0.074), shade);
          c = mix(brick, dayBrick, uDawn) * h;
          if (win > 0.25 && win < 0.75) c = mix(vec3(0.020,0.020,0.019), vec3(0.20,0.20,0.19), uDawn);
          if (win > 0.75) {
            vec3 dark = mix(vec3(0.004,0.005,0.008), vec3(0.05,0.055,0.065), uDawn);
            // lamplight behind curtains, and here and there the blue of a television
            vec3 warm = mix(vec3(0.55, 0.32, 0.13), vec3(0.62, 0.42, 0.20), hash(vec2(shade, lit))) * lit;
            float flick = 0.55 + 0.45 * noise(vec2(uTime * 6.0, shade * 30.0));
            vec3 blue = vec3(0.10, 0.16, 0.30) * tv * flick;
            c = dark + (warm + blue) * (1.0 - uDawn);
          }
        }
        // the quay wall and the street edge
        if (p.y < STREET && p.y > WATER) c = mix(vec3(0.012,0.012,0.014), vec3(0.09,0.088,0.085), uDawn);
        // bare elms along the far quay
        float tx = (fract(p.x / 9.0) - 0.5) * 9.0;
        float ty = p.y - STREET;
        float trunk = step(abs(tx + sin(ty * 0.7) * 0.15), 0.22 - ty * 0.012) * step(0.0, ty) * step(ty, 5.5);
        float crown = smoothstep(5.5, 0.0, length(vec2(tx * 0.75, ty - 8.5)) - 1.0);
        // bare twigs: the ridges of a noise field, thin and branching
        vec2 tq = vec2(tx, ty) * 0.9 + floor(p.x / 9.0) * 5.0;
        float rid = 0.0, ra = 0.5;
        for (int k = 0; k < 4; k++) { rid += ra * (1.0 - abs(2.0 * noise(tq) - 1.0)); tq *= 2.1; ra *= 0.5; }
        float twigs = smoothstep(0.70, 0.82, rid) * crown;
        float tree = max(trunk, twigs * 0.9);
        c = mix(c, mix(vec3(0.004,0.004,0.005), vec3(0.04,0.04,0.042), uDawn), tree * step(STREET, p.y));
        c += lampGlow(p);
        return c;
      }

      void main(){
        vec2 p = vP;
        vec3 col;
        if (p.y < WATER) {
          // the canal: the far side upside down, broken up by ripples
          float d = WATER - p.y;
          vec2 q = vec2(p.x + (noise(vec2(p.x * 0.4, d * 3.0 - uTime * 0.6)) - 0.5) * (0.3 + d * 0.3), WATER + d);
          col = view(q) * 0.45 + vec3(0.004,0.005,0.008);
          col += lampGlow(vec2(p.x + (noise(vec2(d * 4.0, uTime)) - 0.5) * 0.6, WATER + d * 0.35)) * 0.5;
          col = mix(col, vec3(0.16,0.17,0.18), uDawn * 0.5);
        } else {
          col = view(p);
        }
        // mist off the water
        float m = fbm(vec2(p.x * 0.12 + uTime * 0.05, p.y * 0.2 - uTime * 0.02));
        float mist = smoothstep(0.3, 0.8, m) * uMist * exp(-max(p.y - WATER, 0.0) * 0.14);
        col = mix(col, vec3(0.055,0.06,0.07), mist * 0.9);
        // a pale upright shape on the far quay, only in the mist
        vec2 f = vec2(p.x - 0.6, p.y - (STREET + 0.9));
        float fig = exp(-pow(f.x * 2.2, 2.0) - pow(max(0.0, abs(f.y) - 0.6) * 3.0, 2.0));
        col += vec3(0.10,0.105,0.11) * fig * uMist * (0.5 + 0.5 * m);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(90, 60), outsideMat);
  outside.position.set(0, midY + 4, z - DEPTH);
  outside.renderOrder = -1;
  scene.add(outside);
  // faint cold light falling through, for what is lit live
  const cold = new THREE.SpotLight(0x8ea2c8, 0.6, 9, Math.PI / 5, 0.9, 1.6);
  cold.position.set(0, midY + 0.3, z - 0.8);
  cold.target.position.set(0, 0, z + 3);
  scene.add(cold, cold.target);
  // On the glass, room side: condensation creeping in from the frame and the bars, and
  // behind it whatever comes along the ledge outside. In window coordinates: metres,
  // x across from the middle, y up from the bottom of the frame.
  const glassMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFog: { value: 0 }, uShapeX: { value: -9 }, uDawn: { value: 0 }, uBeast: { value: BEAST_TEX },
      uText: { value: null }, uTextK: { value: 0 } },
    transparent: true, depthWrite: false, fog: false,
    vertexShader: `varying vec2 vW; void main(){ vW = position.xy + vec2(0.0, ${WIN.h / 2}); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vW;
      uniform float uTime, uFog, uShapeX, uDawn, uTextK;
      uniform sampler2D uText;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.07; a*=0.5; } return v; }
      ${BEAST}
      void main(){
        vec2 w = vW;
        // the creature, a black shape against the street, the moon behind it catching its back
        float b = beast(w, uShapeX, 0.012);
        float rim = b * (1.0 - beast(w + vec2(0.0, 0.012), uShapeX, 0.008)) * smoothstep(0.25, 0.4, w.y);
        vec4 col = vec4(vec3(0.004, 0.004, 0.005) + vec3(0.05, 0.058, 0.075) * rim * (1.0 - uDawn), b * 0.97);
        // condensation: from the frame and the glazing bars inward, further the thicker it is
        float d = min(${WIN.w / 2} - abs(w.x), min(w.y, ${WIN.h} - w.y));
        d = min(d, w.y < ${WIN.ytr} ? abs(w.x) : abs(abs(w.x) - ${WIN.w / 6}));
        d = min(d, abs(w.y - ${WIN.ytr}));
        d = min(d, min(abs(w.y - ${WIN.bar1}), abs(w.y - ${WIN.bar2})));
        float n = fbm(w * 9.0 + vec2(0.0, uTime * 0.01));
        // a band round the frame and bars, then most of each pane, then all of the glass
        float reach = uFog * 0.26;
        float cover = 1.0 - smoothstep(reach - 0.1, reach + 0.01, d + (n - 0.5) * 0.08);
        float dens = cover * (0.78 + 0.22 * fbm(w * 31.0)) * min(1.0, uFog * 2.5);
        // a name written in it with a finger, from outside: the mist is thick all over, the
        // strokes clear glass
        if (uTextK > 0.0) {
          dens = max(dens, uTextK * (0.82 + 0.12 * n));
          dens *= 1.0 - uTextK * texture2D(uText, vec2(w.x / ${WIN.w} + 0.5, w.y / ${WIN.h})).r;
        }
        // milky, catching the street and the moon from behind
        vec3 fogC = mix(vec3(0.15, 0.16, 0.185), vec3(0.36, 0.36, 0.35), uDawn);
        col.rgb = mix(col.rgb, fogC, dens);
        col.a = col.a + dens * 0.9 * (1.0 - col.a);
        gl_FragColor = col;
      }`,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN.w, WIN.h), glassMat);
  glass.position.set(0, y0 + WIN.h / 2, z - 0.164);
  glass.renderOrder = 1;
  scene.add(glass);
  // The glass as a mirror, for a moment (the enactment of cabinet 2): drawn only when shown.
  const shader = { ...Reflector.ReflectorShader, uniforms: { ...THREE.UniformsUtils.clone(Reflector.ReflectorShader.uniforms), opacity: { value: 0 } } };
  shader.fragmentShader = shader.fragmentShader
    .replace('uniform vec3 color;', 'uniform vec3 color;\nuniform float opacity;')
    .replace('gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );', 'gl_FragColor = vec4( blendOverlay( base.rgb, color ), opacity );');
  const mirror = new Reflector(new THREE.PlaneGeometry(WIN.w, WIN.h), {
    textureWidth: 640, textureHeight: 800, clipBias: 0.003, color: 0xe2e2e2, shader,
  });
  mirror.material.transparent = true;
  mirror.material.depthWrite = false;
  mirror.position.set(0, y0 + WIN.h / 2, z - 0.162);
  mirror.renderOrder = 2;
  mirror.visible = false;
  scene.add(mirror);
  return { group: sc.window_frame || outside, outsideMat, glassMat, cold, mirror };
}

// A name written in the condensation with a finger, from outside: mirrored for whoever
// reads it from the room. White on black, the strokes soft, a drip or two below.
// pane: write it large in one pane instead (a single figure), 'right' or 'left' casement.
export function windowWriting(text, { pane = null } = {}) {
  const W = 1000, H = Math.round(W * WIN.h / WIN.w);
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.filter = 'blur(2px)';
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineJoin = 'round';
  ctx.lineWidth = pane ? 22 : 16;
  let size = pane ? 520 : 230;
  ctx.font = `${size}px "Homemade Apple", cursive`;
  while (ctx.measureText(text).width > W * (pane ? 0.3 : 0.8) && size > 90) {
    size -= 6;
    ctx.font = `${size}px "Homemade Apple", cursive`;
  }
  // across the upper panes of the casements, between the glazing bar and the transom; a
  // figure in the middle pane of one casement (mirrored: drawn on the other side)
  const tw = ctx.measureText(text).width;
  const paneX = pane === 'right' ? 0.22 : 0.78;
  const x = pane ? W * paneX - tw / 2 : (W - tw) / 2;
  const y = pane ? H * (1 - (WIN.bar1 + 0.03) / WIN.h) : H * (1 - (WIN.bar2 + 0.06) / WIN.h);
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
  // drips run down from the lowest strokes
  ctx.filter = 'blur(2px)';
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < (pane ? 2 : 4); i++) {
    const dx = pane ? W * (1 - paneX) + (i ? 30 : -40) : W * (0.25 + 0.5 * ((i * 0.37) % 1)), dy = y + 20;
    ctx.lineWidth = 5 - i * 0.6;
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(dx + (i % 2 ? 3 : -2), dy + 60 + i * 35);
    ctx.stroke();
  }
  const tex = canvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// The window's opening (as blender/room.py builds it): size, the transom under the
// fanlight and the two glazing bars of each casement, all from the bottom of the frame.
const WIN = (() => {
  const w = 1.25, h = 1.55, ytr = h - 0.38, lo = 0.07 + 0.02, hi = ytr - 0.03;
  return { w, h, ytr, bar1: lo + (hi - lo) / 3, bar2: lo + (hi - lo) * 2 / 3 };
})();

// The weerwolf, in window coordinates (see above): a big dog going along the ledge to the
// right at cx. Its silhouette is Muybridge's mastiff Dread walking (Animal Locomotion, 1887,
// Wellcome Collection, public domain): six frames cut out of one plate, half a stride, after
// which the outline repeats (models/beast.png, 3 x 2 cells). The frame follows where it is,
// so it stands still when it stops; neighbouring frames are blended. Returns its cover,
// edges soft by e.
const BEAST_TEX = new THREE.TextureLoader().load('models/beast.png', (t) => (t.needsUpdate = true));
BEAST_TEX.colorSpace = THREE.NoColorSpace;
BEAST_TEX.generateMipmaps = false;
BEAST_TEX.minFilter = BEAST_TEX.magFilter = THREE.LinearFilter;
// a cell: BOX px of the scan, the dog's middle LEFT px from its left, the floor TOP px down;
// M metres per px of the scan (the dog ~0.9 m from tail to nose); half a stride (6 frames
// of ~45 px) in metres
const BEAST = `
  uniform sampler2D uBeast;
  const vec2 BOX = vec2(544.0, 294.0);
  const float LEFT = 299.8, TOP = 290.0, M = 0.0019, LOOP = 6.0 * 45.0 * M;
  float beastCell(vec2 q, float i){
    vec2 b = vec2(q.x / M + LEFT, TOP - q.y / M);
    if (b.x < 1.0 || b.y < 1.0 || b.x > BOX.x - 1.0 || b.y > BOX.y - 1.0) return 0.0;
    vec2 uv = vec2((mod(i, 3.0) + b.x / BOX.x) / 3.0, 1.0 - (floor(i / 3.0) + b.y / BOX.y) / 2.0);
    return texture2D(uBeast, uv).r;
  }
  float beast(vec2 p, float cx, float e){
    if (abs(p.x - cx) > 1.0) return 0.0;
    vec2 q = vec2(p.x - cx, p.y);
    float ph = fract(cx / LOOP) * 6.0, i = floor(ph);
    float c = mix(beastCell(q, i), beastCell(q, mod(i + 1.0, 6.0)), ph - i);
    return smoothstep(0.5 - e * 25.0, 0.5 + e * 25.0, c);
  }`;

// ------------------------------------------------------------------ light from outside the room

// Brightens what is already drawn, in proportion to it (dst * (1 + src)), so a patch of
// light on the floor keeps the floor's own grain instead of laying a haze over it.
function lightPatchMaterial(map, color) {
  return new THREE.MeshBasicMaterial({
    map, color, fog: false, transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

// the window's glazing as a mask, glass white: frame, casements, bars and fanlight
// as blender/room.py builds them
function paneMask() {
  const W = 1.25, H = 1.55, px = 400;
  const c = makeCanvas(Math.round(W * px), Math.round(H * px));
  const ctx = c.getContext('2d');
  const X = (x) => x * px, Y = (y) => (H - y) * px; // window coordinates in m, y up from the sill
  // grey levels, not alpha: the patch blends by colour alone
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.filter = 'blur(5px)';
  ctx.fillStyle = '#fff';
  const ytr = H - 0.38, t = 0.07, s = 0.045, mid = W / 2;
  const glass = (x0, x1, y0, y1) => ctx.fillRect(X(x0), Y(y1), X(x1) - X(x0), Y(y0) - Y(y1));
  // fanlight: three panes
  for (let j = 0; j < 3; j++) glass(t + j * (W - 2 * t) / 3 + 0.012, t + (j + 1) * (W - 2 * t) / 3 - 0.012, ytr + 0.03, H - t);
  // the two casements, three panes high each
  for (const [a, b] of [[t, mid - 0.035], [mid + 0.035, W - t]]) {
    const lo = t + 0.02 + s + 0.01, hi = ytr - 0.03 - s;
    for (let j = 0; j < 3; j++) {
      glass(a + s, b - s, lo + (hi - lo) * j / 3 + (j ? 0.012 : 0), lo + (hi - lo) * (j + 1) / 3 - (j < 2 ? 0.012 : 0));
    }
  }
  const tex = canvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// the corridor lamp under the door: bright at the gap, gone a stride into the room
function doorGlowMask() {
  const c = makeCanvas(256, 128);
  const ctx = c.getContext('2d');
  // bottom of the canvas lies against the door once the plane is laid flat
  const g = ctx.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.15, '#8a8a8a');
  g.addColorStop(0.5, '#262626');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  // soft at the sides, where the frame cuts it off
  ctx.globalCompositeOperation = 'multiply';
  const h = ctx.createLinearGradient(0, 0, 256, 0);
  h.addColorStop(0, '#000');
  h.addColorStop(0.3, '#fff');
  h.addColorStop(0.7, '#fff');
  h.addColorStop(1, '#000');
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, 256, 128);
  const tex = canvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export function buildNightLight(scene) {
  // the moon is high and a little to the left: the window falls on the floor as a slanted
  // parallelogram, panes and all
  const dir = new THREE.Vector3(-0.22, -0.62, 1.0); // per unit of drop
  const glassZ = ROOM.z0 - 0.17;
  const onFloor = (x, y) => {
    const t = y / -dir.y;
    return new THREE.Vector3(x + dir.x * t, 0.002, glassZ + dir.z * t);
  };
  const y0 = 1.0, y1 = 2.55, hw = 0.625;
  const corners = [onFloor(-hw, y0), onFloor(hw, y0), onFloor(-hw, y1), onFloor(hw, y1)];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap((v) => v.toArray()), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geo.setIndex([0, 2, 1, 1, 2, 3]);
  const MOON_PATCH = new THREE.Color(1.1, 1.6, 2.7);
  // as lightPatchMaterial, plus the fog on the glass and the shadow of what passes it
  const moonMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: paneMask() }, uColor: { value: MOON_PATCH.clone() }, uFog: { value: 0 }, uShapeX: { value: -9 }, uBeast: { value: BEAST_TEX } },
    fog: false, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D uMap; uniform vec3 uColor; uniform float uFog, uShapeX;
      ${BEAST}
      void main(){
        vec2 w = vec2((vUv.x - 0.5) * ${WIN.w}, vUv.y * ${WIN.h});
        float sh = beast(w, uShapeX, 0.025);
        gl_FragColor = vec4(uColor * texture2D(uMap, vUv).rgb * (1.0 - 0.96 * sh) * (1.0 - 0.85 * uFog), 1.0);
      }`,
  });
  const moon = new THREE.Mesh(geo, moonMat);
  moon.renderOrder = 2;
  scene.add(moon);

  // under the door
  const DOOR_W = 0.96, doorZ = ROOM.z1;
  const DOOR_GLOW = new THREE.Color(5.0, 3.1, 1.5);
  const glowMat = lightPatchMaterial(doorGlowMask(), DOOR_GLOW.clone());
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W + 0.5, 0.75), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(0, 0.002, doorZ - 0.375);
  glow.renderOrder = 2;
  scene.add(glow);
  // the floor there is nearly black, so a little light is added as well as multiplied
  const GLOW_ADD = new THREE.Color(0.05, 0.028, 0.011);
  const glowAdd = new THREE.Mesh(glow.geometry, new THREE.MeshBasicMaterial({
    map: glowMat.map, color: GLOW_ADD.clone(), fog: false, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  glowAdd.rotation.copy(glow.rotation);
  glowAdd.position.copy(glow.position);
  glowAdd.renderOrder = 3;
  scene.add(glowAdd);
  const gap = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W - 0.06, 0.007),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.52, 0.27), fog: false }));
  gap.rotation.y = Math.PI;
  gap.position.set(0, 0.0035, doorZ - 0.004);
  scene.add(gap);

  return {
    moon, glow, gap,
    // the morning has no moon in it; the corridor lamp goes when the room's does
    setDawn(d) { moonMat.uniforms.uColor.value.copy(MOON_PATCH).multiplyScalar(1 - d); },
    setFog(f) { moonMat.uniforms.uFog.value = f; },
    setShape(x) { moonMat.uniforms.uShapeX.value = x; },
    setCorridor(k) {
      glowMat.color.copy(DOOR_GLOW).multiplyScalar(k);
      glowAdd.material.color.copy(GLOW_ADD).multiplyScalar(k);
      gap.material.color.setRGB(0.8 * k, 0.52 * k, 0.27 * k);
    },
  };
}

// ------------------------------------------------------------------ dust in the lamp light

export function buildDust(scene) {
  const n = 420;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = LAMP_POS.x + (Math.random() - 0.3) * 1.6;
    pos[i * 3 + 1] = TABLE.y + Math.random() * 1.6;
    pos[i * 3 + 2] = LAMP_POS.z + (Math.random() - 0.4) * 1.6;
    seed[i] = Math.random() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uLamp: { value: LAMP_POS.clone().add(new THREE.Vector3(0, 0.4, 0.14)) }, uOn: { value: 1 } },
    vertexShader: `
      attribute float seed; uniform float uTime; uniform vec3 uLamp; varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime*0.07 + seed)*0.12; p.y += sin(uTime*0.05 + seed*1.7)*0.18; p.z += cos(uTime*0.06 + seed*0.7)*0.12;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        float d = distance(p, uLamp);
        vA = smoothstep(0.9, 0.15, d) * (0.5 + 0.5*sin(seed*3.0 + uTime*0.4));
        gl_PointSize = clamp((1.0 + fract(seed)*1.2) * (3.0 / -mv.z), 0.5, 6.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA; uniform float uOn;
      void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); gl_FragColor = vec4(1.0,0.86,0.62, a*vA*0.12*uOn); }`,
  });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return mat;
}
