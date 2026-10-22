// The leak on the cabinet itself (NACHTDIENST_PUZZLES.md sections 2 and 3e). The room has its
// half of each leak (atmos.js: the clock, the window, the lamp); this is the half on the
// cabinet that causes it, in step with the room's, so that the two are seen to belong
// together. It follows the leak's step (1..3), sinks back a moment each time a drawer of
// the cabinet is filed, and goes, in front of you, when the last one is.
//   voortekenen  the drawers are knocked out of their runners on the clock's missed beat,
//                each on its own: one drawer, then a row, then the whole cabinet; at the
//                third step the labels slip askew
//   wittewieven  mist seeps out beside the cabinet and pools at its foot, rising with the mist
//                on the window: up the lowest drawers, the next, to just under the drawers
//                that are worked; at its sides it climbs higher
//   weerwolven   claw marks on the drawer fronts as the shape passes the window: scratches,
//                then gouges to the raw wood, then the plate hangs by one screw
//   spoken       frost, a little more each time the lamp dims: on the brass plate, then
//                creeping in over the wood, sooner and further on its sides, then your
//                breath shows when you stand at it
import * as THREE from 'three';
import { CAB, FAMILY_ORDER } from './room.js';
import { makeCanvas, canvasTexture } from './textures.js';

const rand = (a, b) => a + Math.random() * (b - a);
// the drawer fronts stand this far proud of their drawer's origin (measured on the model)
const FRONT_X = 0.0256;
// how high it climbs the drawer fronts at each step; the puzzle row starts at 0.94 m
const MIST_TOP = [0.5, 0.72, 0.9];

const NOISE = /* glsl */`
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm3(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise3(p); p *= 2.03; a *= 0.5; } return s; }`;

// ------------------------------------------------------------------ the front of a cabinet

// Planes over a cabinet's front: one on each drawer (it moves with the drawer) and one over
// the top, plate and all. uv is the whole front (u left to right as seen from the room,
// v up), cell the plane's own 0..1.
function frontOverlay(cab, material) {
  const { dw, dh } = CAB;
  const W = CAB.w, H = CAB.h;
  const meshes = [];
  const toFront = (geo, oy, oz) => {
    geo.rotateY(Math.PI / 2);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    geo.setAttribute('cell', uv.clone());
    for (let i = 0; i < p.count; i++) uv.setXY(i, (W / 2 - (oz + p.getZ(i))) / W, (oy + p.getY(i)) / H);
    return geo;
  };
  for (const dg of cab.drawers) {
    const geo = toFront(new THREE.PlaneGeometry(dw - 0.006, dh - 0.006), dg.position.y, dg.position.z);
    const m = new THREE.Mesh(geo, material);
    m.position.x = FRONT_X;
    m.renderOrder = 2;
    dg.add(m);
    meshes.push(m);
  }
  const y0 = CAB.y0 + CAB.rows * dh;
  const topH = H - y0 - 0.01;
  const top = new THREE.Mesh(toFront(new THREE.PlaneGeometry(W - 0.04, topH), y0 + topH / 2, 0), material);
  top.position.set(0.5535, y0 + topH / 2, 0);
  top.renderOrder = 2;
  cab.group.add(top);
  meshes.push(top);
  const set = (v) => meshes.forEach((m) => (m.visible = v));
  set(false);
  return { meshes, set };
}

// ------------------------------------------------------------------ weerwolven: claw marks

// The front as a canvas, 1 px = 1.25 mm, y down from the top of the cabinet.
const CLAW_W = 1280, CLAW_H = 1664, MM = CLAW_W / 1600;

// A band along a claw's path, between two offsets toward the upper wall (in units of the
// half-width there), the way back drawn along the other edge.
function band(ctx, pts, lo, hi) {
  ctx.beginPath();
  pts.forEach((p, i) => { const x = p.x + p.ux * p.w * hi, y = p.y + p.uy * p.w * hi; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; ctx.lineTo(p.x + p.ux * p.w * lo, p.y + p.uy * p.w * lo); }
  ctx.closePath();
}

// One claw drawn through the varnish into the oak: it lands deep, trails off, and its path
// bends a little as the swipe turns at the wrist. The light is from above, so the upper
// wall of the groove is in shadow and the lower lip catches it.
function claw(ctx, sx, sy, ang, len, w0, bend, rnd, deep) {
  const n = Math.max(30, Math.round(len / 3));
  const runs = [[]];
  let a = ang - bend / 2, x = sx, y = sy, wob = 0, gap = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // depth: in at once, deepest a third of the way, thinning out to nothing
    const d = Math.min(1, t / 0.08) ** 0.5 * (1 - Math.max(0, (t - 0.3) / 0.7) ** 1.6) * (0.88 + 0.12 * Math.sin(t * 31 + sx));
    // a scratch skips where the claw lifts
    if (!deep && gap <= 0 && t > 0.15 && rnd() < 0.035) gap = 2 + Math.floor(rnd() * 4);
    if (gap > 0) { gap--; if (runs[runs.length - 1].length) runs.push([]); }
    else {
      let ux = -Math.sin(a), uy = Math.cos(a);
      if (uy > 0) { ux = -ux; uy = -uy; }
      runs[runs.length - 1].push({ x: x + ux * wob, y: y + uy * wob, w: Math.max(0.35, w0 * d), d, ux, uy });
    }
    a += bend / n;
    wob += (rnd() - 0.5) * 0.5 - wob * 0.15;
    x += Math.cos(a) * len / n;
    y += Math.sin(a) * len / n;
  }
  for (const pts of runs) {
    if (pts.length < 3) continue;
    const wide = w0 > 2.5;
    // the wood bruised and the varnish crazed around it
    ctx.filter = `blur(${(w0 * 0.9).toFixed(1)}px)`;
    ctx.fillStyle = 'rgba(14,7,3,0.4)';
    band(ctx, pts, -2.2, 2.2); ctx.fill();
    ctx.filter = 'none';
    // varnish chipped off along the edges: a thin pale skin of wood
    if (wide) {
      ctx.fillStyle = 'rgba(118,78,46,0.75)';
      for (const p of pts) {
        if (rnd() > 0.45 || p.d < 0.3) continue;
        const side = rnd() < 0.6 ? -1 : 1, r = p.w * (0.35 + rnd() * 0.5);
        const cx = p.x + p.ux * p.w * side * (1 + rnd() * 0.35), cy = p.y + p.uy * p.w * side * (1 + rnd() * 0.35);
        ctx.beginPath();
        for (let k = 0; k < 5; k++) { const q = k / 5 * Math.PI * 2, rr = r * (0.5 + rnd() * 0.6); ctx[k ? 'lineTo' : 'moveTo'](cx + Math.cos(q) * rr, cy + Math.sin(q) * rr * 0.6); }
        ctx.fill();
      }
    }
    // the groove: raw oak, lighter where it is torn fresh
    ctx.fillStyle = wide ? 'rgb(178,130,84)' : 'rgb(176,134,92)';
    band(ctx, pts, -1, 1); ctx.fill();
    if (wide) {
      // its fibres, torn along the stroke
      ctx.save();
      band(ctx, pts, -1, 1); ctx.clip();
      ctx.lineWidth = 0.7;
      for (let f = 0; f < 9; f++) {
        const o = -1 + rnd() * 2, light = rnd() < 0.5;
        ctx.strokeStyle = light ? `rgba(196,158,112,${0.3 + rnd() * 0.4})` : `rgba(84,54,30,${0.3 + rnd() * 0.4})`;
        ctx.beginPath();
        let on = false;
        for (const p of pts) {
          if (rnd() < 0.06) { on = false; continue; }
          const px = p.x + p.ux * p.w * o, py = p.y + p.uy * p.w * o;
          on ? ctx.lineTo(px, py) : ctx.moveTo(px, py); on = true;
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    // the upper wall in its own shadow, darkest at the edge; the floor of the groove
    ctx.fillStyle = 'rgba(30,15,7,0.5)'; band(ctx, pts, 0.05, 1); ctx.fill();
    ctx.fillStyle = 'rgba(24,12,5,0.7)'; band(ctx, pts, 0.5, 1.05); ctx.fill();
    ctx.fillStyle = 'rgba(64,38,20,0.45)'; band(ctx, pts, -0.25, 0.1); ctx.fill();
    // the lower lip, catching the light
    ctx.fillStyle = 'rgba(236,204,158,0.85)'; band(ctx, pts, -1.05, -0.7); ctx.fill();
    if (deep) {
      // splinters lifted off the lower lip, pointing the way the claw went
      for (let i = 2; i < pts.length - 4; i += 2 + Math.floor(rnd() * 3)) {
        const p = pts[i];
        if (p.d < 0.45 || rnd() < 0.35) continue;
        const L = (5 + rnd() * 10) * MM, lift = (1.2 + rnd() * 2) * MM;
        const dx = p.uy, dy = -p.ux; // along the stroke
        const fx = (dx * (pts[i + 1].x - p.x) + dy * (pts[i + 1].y - p.y)) < 0 ? -1 : 1;
        const bx = p.x - p.ux * p.w, by = p.y - p.uy * p.w;
        const tx = bx + dx * fx * L - p.ux * lift, ty = by + dy * fx * L - p.uy * lift;
        const half = (0.6 + rnd() * 0.8) * MM;
        ctx.fillStyle = 'rgba(16,8,3,0.55)';
        ctx.beginPath(); ctx.moveTo(bx + dx * half, by + dy * half); ctx.lineTo(tx - p.ux * 1.5, ty - p.uy * 1.5); ctx.lineTo(bx - dx * half, by - dy * half); ctx.fill();
        ctx.fillStyle = 'rgba(206,166,114,0.9)';
        ctx.beginPath(); ctx.moveTo(bx + dx * half, by + dy * half); ctx.lineTo(tx, ty); ctx.lineTo(bx - dx * half, by - dy * half); ctx.fill();
      }
    }
  }
}

// One raking of four claws, in mm: where it starts (on the canvas), the way it goes, how
// long, how wide a groove (half), how far apart the claws. The outer claws are shorter and
// shallower, and they do not all land at once.
function rake(ctx, rnd, u, v, ang, len, half, spread, { bend = 0.16, deep = false, claws = 4 } = {}) {
  const x = u * CLAW_W, y = (1 - v) * CLAW_H;
  for (let k = 0; k < claws; k++) {
    const off = (k - (claws - 1) / 2) * spread * MM * (1 + (rnd() - 0.5) * 0.2);
    const outer = k === 0 || k === claws - 1;
    const l = len * MM * (0.75 + rnd() * 0.25) * (outer ? 0.8 : 1);
    const w = half * MM * (outer ? 0.7 : 1) * (0.85 + rnd() * 0.3);
    const late = (rnd() - 0.25) * len * MM * 0.1;
    claw(ctx, x - Math.sin(ang) * off + Math.cos(ang) * late, y + Math.cos(ang) * off + Math.sin(ang) * late, ang, l, w, bend * (1 + k * 0.05), rnd, deep);
  }
}

// a single stray scratch
function stray(ctx, rnd, u, v, ang, len) {
  claw(ctx, u * CLAW_W, (1 - v) * CLAW_H, ang, len * MM, (2.2 + rnd() * 1) * MM, (rnd() - 0.5) * 0.3, rnd, false);
}

function clawLayers() {
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const layers = [];
  const layer = (draw) => { const c = makeCanvas(CLAW_W, CLAW_H); draw(c.getContext('2d')); layers.push(c); };
  // the first: scratches through the varnish, down across the lower left drawers, as from
  // something standing, and a few strays
  layer((ctx) => {
    rake(ctx, rnd, 0.07, 0.46, 0.92, 640, 4.5, 52);
    stray(ctx, rnd, 0.3, 0.37, 0.7, 280);
    stray(ctx, rnd, 0.36, 0.3, 1.25, 180);
  });
  // then deeper: gouges across the middle, and the first marks gone over again
  layer((ctx) => {
    rake(ctx, rnd, 0.48, 0.66, 1.12, 780, 10, 62, { deep: true });
    rake(ctx, rnd, 0.13, 0.48, 0.97, 520, 7.5, 52, { deep: true, bend: 0.12 });
  });
  // last: high up, at the plate, and low, at the height of a crouching thing
  layer((ctx) => {
    rake(ctx, rnd, 0.97, 0.8, 2.05, 560, 11, 60, { deep: true, bend: -0.2 });
    rake(ctx, rnd, 0.6, 0.22, 0.38, 520, 10, 58, { deep: true, bend: 0.22 });
    stray(ctx, rnd, 0.82, 0.3, 0.55, 220);
  });
  return layers;
}

// ------------------------------------------------------------------ spoken: frost

const FROST_VS = /* glsl */`
  attribute vec2 cell;
  varying vec2 vUv; varying vec2 vCell;
  void main() { vUv = uv; vCell = cell; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FROST_FS = /* glsl */`
  uniform float uK; uniform float uSide;
  varying vec2 vUv; varying vec2 vCell;
  ${NOISE}
  // fern-like rime: fine lines at an angle that wanders from patch to patch
  float feathers(vec2 q, float seed) {
    float a = fbm3(vec3(q * 3.0, seed)) * 6.283;
    vec2 d = vec2(cos(a), sin(a));
    float w = fbm3(vec3(q * 22.0, seed + 5.0));
    float l = abs(sin(dot(q, d) * 260.0 + w * 14.0));
    return pow(l, 10.0) * smoothstep(0.35, 0.7, w);
  }
  void main() {
    if (uSide > 0.5) {
      // the sides: in from the front edge, up from the plinth and down from the top, sooner
      // than on the front and further (nothing there has to be read); uv is depth, height,
      // and each side its own pattern
      vec2 q = vUv * vec2(0.55, 2.08) + vec2(uSide * 3.1, 0.0);
      float n = fbm3(vec3(q * 6.0, 1.3));
      float fine = max(feathers(q, 0.0), feathers(q + 0.37, 9.0));
      float bloom = fbm3(vec3(q * 40.0, 2.0));
      float reach = clamp(uK - 0.6, 0.0, 2.4);
      float edge = min(min((1.0 - vUv.x) * 0.55 * 1.1, (vUv.y * 2.08 - 0.12) * 0.75), (1.0 - vUv.y) * 2.08 * 1.2);
      float lead = reach * 0.15 + (n - 0.5) * 0.16 - edge;
      float wood = smoothstep(0.0, 0.1, lead);
      // thick at its edge, thinner behind it: the rime grows out in ferns
      float a = wood * (0.04 + 0.1 * bloom * smoothstep(0.06, 0.0, lead - 0.04) + 0.55 * fine) + smoothstep(0.0, 0.03, lead) * (1.0 - smoothstep(0.03, 0.09, lead)) * 0.12;
      // the sides are in the cabinet's shadow
      gl_FragColor = vec4(vec3(0.66, 0.72, 0.8) * (0.42 + 0.35 * fine), min(1.0, a) * 0.7);
      return;
    }
    vec2 q = vUv * vec2(1.6, 2.08);
    float n = fbm3(vec3(q * 6.0, 1.3));
    float fine = max(feathers(q, 0.0), feathers(q + 0.37, 9.0));
    float bloom = fbm3(vec3(q * 40.0, 2.0));
    // on the brass plate first
    vec2 pc = (q - vec2(0.8, 1.9)) / vec2(0.41, 0.11);
    float plate = 1.0 - smoothstep(0.88, 1.0, max(abs(pc.x), abs(pc.y)));
    float onPlate = plate * smoothstep(0.0, 0.1, clamp(uK, 0.0, 1.0) * 1.1 - n * 0.85);
    // then over the wood: in from the cabinet's edges, and from the corners of some drawers,
    // more of them at the third step
    float edgeCab = min(min(vUv.x, 1.0 - vUv.x) * 1.6, min(vUv.y, 1.0 - vUv.y) * 2.08);
    vec2 dc = min(vCell, 1.0 - vCell) * vec2(0.355, 0.245);
    float reach = clamp(uK - 1.0, 0.0, 2.0);
    float gate = smoothstep(0.62 - reach * 0.1, 0.7 - reach * 0.1, fbm3(vec3(q * 1.8, 7.0)));
    float cellDist = vUv.y < 0.8 ? length(dc) * 0.8 + (1.0 - gate) : 1.0;
    float wood = smoothstep(0.0, 0.03, reach * 0.085 + (n - 0.5) * 0.07 - min(edgeCab * 0.7, cellDist));
    // the drawer labels stay readable through it
    vec2 lc = (vCell - vec2(0.5, 0.684)) / vec2(0.27, 0.13);
    wood *= mix(1.0, 0.3, (1.0 - smoothstep(0.9, 1.0, max(abs(lc.x), abs(lc.y)))) * step(vUv.y, 0.8));
    float a = max(onPlate * (0.3 + 0.25 * bloom + 0.6 * fine), wood * (0.1 + 0.18 * bloom + 0.45 * fine));
    gl_FragColor = vec4(vec3(0.66, 0.72, 0.8) * (0.5 + 0.4 * fine), min(1.0, a) * 0.75);
  }`;

// ------------------------------------------------------------------ wittewieven: mist

const MIST_VS = /* glsl */`
  varying vec3 vPos;
  void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const MIST_FS = /* glsl */`
  uniform vec3 uCam; uniform vec3 uMin; uniform vec3 uMax;
  uniform float uTop; uniform float uK; uniform float uTime; uniform float uSide;
  varying vec3 vPos;
  ${NOISE}
  void main() {
    vec3 rd = normalize(vPos - uCam);
    vec3 t0 = (uMin - uCam) / rd, t1 = (uMax - uCam) / rd;
    vec3 tn = min(t0, t1), tf = max(t0, t1);
    float a = max(max(max(tn.x, tn.y), tn.z), 0.0), b = min(min(tf.x, tf.y), tf.z);
    if (b <= a) discard;
    const int N = 40;
    float dt = (b - a) / float(N);
    float T = 1.0;
    for (int i = 0; i < N; i++) {
      vec3 p = uCam + rd * (a + dt * (float(i) + 0.5));
      float d;
      if (uSide > 0.5) {
        // seeping out of the gap beside the cabinet and climbing its side in slow plumes,
        // higher than in front (nothing there has to be read), thickest towards the room
        float out_ = abs(p.z) - 0.815;
        float n = fbm3(p * vec3(3.2, 2.0, 3.2) + vec3(uTime * 0.03, -uTime * 0.1, 0.0));
        float top = uTop * 1.7 * (0.7 + 0.6 * noise3(vec3(p.x * 4.0, uTime * 0.05, 1.0)));
        float plume = exp(-out_ / 0.11) * (1.0 - smoothstep(top * 0.25, top, p.y)) * (0.35 + 0.65 * smoothstep(0.05, 0.55, p.x));
        d = plume * smoothstep(0.3, 0.72, n) * 13.0 * uK;
      } else {
        float x = p.x - uMin.x;
        float n = fbm3(p * vec3(2.6, 3.4, 2.6) + vec3(uTime * 0.05, -uTime * 0.02, uTime * 0.03));
        // a bank against the cabinet, its top in slow fingers that reach up the drawers, fed
        // from the sides: thicker at the cabinet's edges than in the middle
        float top = uTop * (0.78 + 0.45 * noise3(vec3(p.z * 3.5, uTime * 0.04, 0.0)));
        float fed = 0.5 + 0.5 * smoothstep(0.25, 0.8, abs(p.z));
        float bank = (1.0 - smoothstep(top * 0.45, top, p.y * (1.25 - 0.25 * fed))) * exp(-x / 0.5) * fed * (1.0 - smoothstep(0.75, 1.1, abs(p.z)));
        // and a low pool over the floor, out to where you stand
        float pool = (1.0 - smoothstep(0.03, 0.12 + 0.1 * uTop, p.y)) * exp(-x / 1.1) * (1.0 - smoothstep(0.75, 1.15, abs(p.z))) * 0.55;
        d = (bank + pool) * smoothstep(0.28, 0.74, n) * 12.0 * uK;
      }
      T *= exp(-d * dt);
      if (T < 0.02) break;
    }
    float alpha = (1.0 - T) * 0.8;
    gl_FragColor = vec4(vec3(0.62, 0.67, 0.74) * 0.66, alpha);
  }`;

// ------------------------------------------------------------------ the leaks

export class CabinetLeaks {
  constructor({ scene, camera, sound, rails, cabinets }) {
    this.scene = scene;
    this.camera = camera;
    this.sound = sound;
    this.rails = rails;
    this.cabinets = cabinets;
    // how strongly each shows, eased: 0 nothing .. 3 the third step
    this.k = {};
    this.on = new Set();
    this.ebbK = {};
    this.build();
  }

  cab(fam) { return this.cabinets[FAMILY_ORDER.indexOf(fam)]; }
  centre(fam, y = 1.1) {
    const c = this.cab(fam);
    return c.group.localToWorld(new THREE.Vector3(0.6, y, 0));
  }

  build() {
    // weerwolven: the marks, one overlay for each step's, fading in on its own
    this.clawShown = [0, 0, 0];
    this.claws = clawLayers().map((c, i) => {
      const mat = new THREE.MeshStandardMaterial({
        map: canvasTexture(c), emissive: 0xffffff, emissiveMap: null, roughness: 0.9, opacity: 0,
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -1 - i,
      });
      mat.emissiveMap = mat.map;
      mat.emissiveIntensity = 0.2;
      const front = frontOverlay(this.cab('weerwolven'), mat);
      front.meshes.forEach((m) => (m.renderOrder = 2 + i * 0.1));
      return { mat, front };
    });
    const plate = this.cab('weerwolven').plate;
    this.plate = { mesh: plate, y: plate.position.y, z: plate.position.z, a: 0, v: 0 };
    // spoken: frost over the front
    this.frostMat = new THREE.ShaderMaterial({
      vertexShader: FROST_VS, fragmentShader: FROST_FS, uniforms: { uK: { value: 0 }, uSide: { value: 0 } },
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -1,
    });
    this.frostFront = frontOverlay(this.cab('spoken'), this.frostMat);
    // and over its sides, round the corner from the front
    for (const sgn of [1, -1]) {
      const geo = new THREE.PlaneGeometry(CAB.d, CAB.h - 0.12);
      if (sgn < 0) geo.rotateY(Math.PI);
      geo.translate(CAB.d / 2, 0.12 + (CAB.h - 0.12) / 2, sgn * 0.8105);
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / CAB.d, pos.getY(i) / CAB.h);
      geo.setAttribute('cell', uv.clone());
      const mat = this.frostMat.clone();
      mat.uniforms.uK = this.frostMat.uniforms.uK;
      mat.uniforms.uSide.value = sgn > 0 ? 1 : 2;
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 2;
      m.visible = false;
      this.cab('spoken').group.add(m);
      this.frostFront.meshes.push(m);
    }
    // wittewieven: mist in three boxes: in front of the cabinet's foot (starting just in front
    // of the labels and pulls, so they stand in it, not through it), and in the gaps either side
    this.mistU = { uCam: { value: new THREE.Vector3() }, uTop: { value: 0.3 }, uK: { value: 0 }, uTime: { value: 0 } };
    this.mist = new THREE.Group();
    const mistBox = (bmin, bmax, side) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: MIST_VS, fragmentShader: MIST_FS, side: THREE.BackSide, transparent: true, depthWrite: false,
        uniforms: { ...this.mistU, uMin: { value: bmin }, uMax: { value: bmax }, uSide: { value: side } },
      });
      const size = bmax.clone().sub(bmin);
      const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z).translate(...bmin.clone().add(bmax).multiplyScalar(0.5).toArray()), mat);
      m.renderOrder = 3;
      this.mist.add(m);
    };
    mistBox(new THREE.Vector3(0.6, 0.004, -1.15), new THREE.Vector3(2.3, 1.05, 1.15), 0);
    for (const sgn of [1, -1]) {
      const z0 = sgn * 0.815, z1 = sgn * 1.18;
      mistBox(new THREE.Vector3(0.04, 0.004, Math.min(z0, z1)), new THREE.Vector3(0.6, 1.75, Math.max(z0, z1)), 1);
    }
    this.mist.visible = false;
    this.cab('wittewieven').group.add(this.mist);
    this.mistTop = 0;
    // voortekenen: where each drawer's label sits, to let it slip
    for (const dg of this.cab('voortekenen').drawers) {
      const l = dg.userData.label;
      dg.userData.slip = { y: l.position.y, a: 0, want: 0, dir: Math.random() < 0.5 ? -1 : 1, by: rand(0.5, 1), baseY: dg.position.y, shake: 0 };
    }
    // spoken: breath, a few soft puffs
    const c = makeCanvas(64, 64), g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const puffTex = canvasTexture(c);
    this.puffs = Array.from({ length: 14 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xc8d0dc, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      s.userData = { life: 0 };
      this.scene.add(s);
      return s;
    });
    this.breathIn = 2;
  }

  // the leak begins (its first step)
  start(fam) {
    if (!this.cab(fam) || fam === 'duivel') return;
    this.on.add(fam);
    this.k[fam] = this.k[fam] || 0;
    if (fam === 'weerwolven') this.claws.forEach((c) => c.front.set(true));
    if (fam === 'spoken') this.frostFront.set(true);
    if (fam === 'wittewieven') this.mist.visible = true;
  }

  // filed: it goes; slowly when it is being watched going, at once when not
  stop(fam, show = false) {
    if (!this.on.delete(fam)) return;
    if (!show) this.clear(fam);
    else if (fam === 'weerwolven') this.sound.clunk(this.plate.mesh.getWorldPosition(new THREE.Vector3()).toArray());
  }

  clear(fam) {
    this.k[fam] = 0;
    if (fam === 'weerwolven') {
      this.clawShown = [0, 0, 0];
      this.claws.forEach((c) => { c.mat.opacity = 0; c.front.set(false); });
      this.plate.a = this.plate.v = 0;
      this.placePlate();
    }
    if (fam === 'spoken') { this.frostMat.uniforms.uK.value = 0; this.frostFront.set(false); }
    if (fam === 'wittewieven') { this.mistTop = 0; this.mist.visible = false; }
    if (fam === 'voortekenen') for (const dg of this.cab(fam).drawers) Object.assign(dg.userData.slip, { a: 0, want: 0 });
  }

  // a drawer of it filed: the leak shrinks back for a while
  ebb(fam) {
    if (!this.on.has(fam)) return;
    this.ebbK[fam] = 1;
    if (fam === 'voortekenen') this.jolt(1, true);
  }

  // voortekenen: on the missed beat. One drawer, a row, all of them, by step
  jolt(level, soft = false) {
    const cab = this.cab('voortekenen');
    const free = cab.drawers.filter((dg) => !dg.userData.target && !dg.userData.stay && !dg.userData.hoverOpen);
    if (!free.length) return;
    let pick;
    if (level <= 1) pick = [free[Math.floor(Math.random() * free.length)]];
    else if (level === 2) {
      const row = free[Math.floor(Math.random() * free.length)].userData.row;
      pick = free.filter((dg) => dg.userData.row === row).sort((a, b) => a.userData.col - b.userData.col);
    } else pick = free.slice().sort((a, b) => (b.userData.row - a.userData.row) || (a.userData.col - b.userData.col));
    // each drawer on its own: knocked out of its runners, once or a few times, at its own
    // moment, and dropped back, tilted and rattling
    const spread = soft || level <= 1 ? 0 : level >= 3 ? 1800 : 1200;
    for (const dg of pick) {
      const n = soft ? 1 : 1 + Math.floor(Math.random() * (level >= 3 ? 3 : 2)) + (level <= 1 ? 1 : 0);
      let at = Math.random() * spread;
      for (let i = 0; i < n; i++) {
        setTimeout(() => this.knock(dg, soft ? 0.35 : rand(0.75, 1.35)), at);
        at += rand(180, 520);
      }
    }
  }

  // one knock from inside: a kick in its runners (the spring brings it back), a hop, a tilt
  knock(dg, v) {
    const u = dg.userData;
    if (u.target || u.stay || u.hoverOpen) return;
    u.vel = (u.vel || 0) + v;
    u.wiggle = Math.max(u.wiggle || 0, 0.4 * v);
    this.sound.rattle?.(dg.getWorldPosition(new THREE.Vector3()).toArray(), v > 0.5 ? 2 : 1);
    Object.assign(u.slip, { shake: Math.min(1, v), dir: Math.random() < 0.5 ? -1 : 1, roll: rand(0.6, 1) * (Math.random() < 0.5 ? -1 : 1) });
  }

  // weerwolven: the shape is going along the ledge; something answers at the cabinet
  onPass() {
    if (this.on.has('weerwolven')) setTimeout(() => this.sound.scratch(this.centre('weerwolven', 0.9).toArray()), 1200);
  }

  // the plate turned by a about its left screw (as seen from the room)
  placePlate() {
    const p = this.plate, piv = 0.39 - 0.0335;
    p.mesh.rotation.x = p.a;
    p.mesh.position.y = p.y + piv * Math.sin(-p.a) * -1;
    p.mesh.position.z = p.z + piv - piv * Math.cos(p.a);
  }

  update(dt, time, atmos) {
    for (const fam of ['voortekenen', 'wittewieven', 'weerwolven', 'spoken']) {
      this.ebbK[fam] = Math.max(0, (this.ebbK[fam] || 0) - dt / 6);
      const want = this.on.has(fam) ? atmos.lv(fam) * (1 - 0.85 * this.ebbK[fam]) : 0;
      const cur = this.k[fam] || 0;
      // it comes on slowly, sinks back quicker, and goes, once filed, over a few seconds
      let rate = want > cur ? 0.25 : this.on.has(fam) ? 0.7 : 0.3;
      // the frost creeps on while the lamp is down, and hardly otherwise
      if (fam === 'spoken' && want > cur) rate = atmos.dim < 0.9 ? 0.5 : 0.03;
      if (fam === 'wittewieven' && want > cur) rate = 0.15;
      this.k[fam] = cur + (want - cur) * Math.min(1, dt * rate * 2);
      if (!this.on.has(fam) && this.k[fam] < 0.01 && cur >= 0.01) this.clear(fam);
    }
    // voortekenen: the labels slip at the third step, and straighten when it is done
    const kv = this.k.voortekenen || 0;
    for (const dg of this.cab('voortekenen').drawers) {
      const s = dg.userData.slip;
      s.want = Math.max(0, Math.min(1, kv - 2)) * s.by;
      s.a += (s.want - s.a) * Math.min(1, dt * 1.5);
      if (s.shake > 0) {
        s.shake = Math.max(0, s.shake - dt * 2.5);
        dg.position.y = s.baseY + Math.abs(Math.sin(time * 41 + s.dir)) * 0.006 * s.shake;
        dg.rotation.x = (s.roll || 0) * 0.035 * s.shake * (0.6 + 0.4 * Math.sin(time * 33));
      } else if (dg.position.y !== s.baseY) { dg.position.y = s.baseY; dg.rotation.x = 0; }
      const l = dg.userData.label;
      l.rotation.x = s.dir * s.a * 0.16;
      l.position.y = s.y - s.a * 0.006;
    }
    // wittewieven: the mist's height follows the step; it thins as it goes
    const kw = this.k.wittewieven || 0;
    if (this.mist.visible) {
      const step = Math.min(3, Math.max(1, Math.ceil(kw - 0.001)));
      const top = kw <= 1 ? MIST_TOP[0] * kw : MIST_TOP[step - 2] + (MIST_TOP[step - 1] - MIST_TOP[step - 2]) * (kw - (step - 1));
      this.mistTop = top;
      const u = this.mistU;
      u.uTop.value = Math.max(0.05, top);
      u.uK.value = Math.min(1, kw);
      u.uTime.value = time;
      this.mist.parent.worldToLocal(u.uCam.value.copy(this.camera.position));
      if (this.on.has('wittewieven') && (this.whisper = (this.whisper ?? 8) - dt) <= 0) {
        this.whisper = rand(30, 50);
        this.sound.whisperAir(this.centre('wittewieven', 0.3).toArray());
      }
    }
    // weerwolven: each step's marks come in quickly, and go with the step
    const kc = this.k.weerwolven || 0;
    for (let i = 0; i < 3; i++) {
      const want = Math.max(0, Math.min(1, (kc - i) * 2.5));
      if (Math.abs(want - this.clawShown[i]) > 0.02) {
        if (want > this.clawShown[i] && this.clawShown[i] < 0.02 && this.on.has('weerwolven')) this.sound.scratch(this.centre('weerwolven', 0.9).toArray());
        this.clawShown[i] += (want - this.clawShown[i]) * Math.min(1, dt * 3);
        this.claws[i].mat.opacity = this.clawShown[i];
      }
    }
    // the plate drops to hang by one screw at the third step, swinging a little
    const p = this.plate;
    const aWant = kc > 2.6 ? -0.2 : 0;
    if (aWant && !p.down) { p.down = true; p.v = -2.2; this.sound.clunk(p.mesh.getWorldPosition(new THREE.Vector3()).toArray()); }
    if (!aWant) p.down = false;
    p.v += ((aWant - p.a) * 30 - p.v * 3.2) * dt;
    p.a += p.v * dt;
    if (Math.abs(p.a) > 1e-4 || p.down) this.placePlate();
    // spoken: frost, and breath when you stand at it in the cold
    const ks = this.k.spoken || 0;
    this.frostMat.uniforms.uK.value = ks;
    const cab = this.cab('spoken');
    const here = cab.group.worldToLocal(this.camera.position.clone());
    const near = here.x > 0.5 && here.x < 2.8 && Math.abs(here.z) < 1.4;
    if (ks > 2.4 && near && (this.breathIn -= dt) <= 0) {
      this.breathIn = rand(2.8, 3.8);
      this.exhale();
    }
    for (const s of this.puffs) {
      const u = s.userData;
      if (u.life <= 0) continue;
      u.life -= dt;
      s.position.addScaledVector(u.vel, dt);
      u.vel.multiplyScalar(1 - dt * 0.8);
      u.vel.y += dt * 0.05;
      const t = 1 - u.life / u.max;
      s.scale.setScalar(0.04 + t * 0.2);
      s.material.opacity = Math.sin(Math.PI * Math.min(1, t * 1.4)) * 0.22 * Math.min(1, u.life * 2);
      if (u.life <= 0) s.visible = false;
    }
  }

  exhale() {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(this.camera.quaternion);
    const from = this.camera.position.clone().addScaledVector(fwd, 0.32).addScaledVector(down, 0.17);
    this.puffs.filter((s) => s.userData.life <= 0).slice(0, 5).forEach((s, i) => {
      const u = s.userData;
      u.max = u.life = rand(1.4, 2.0);
      u.vel = fwd.clone().multiplyScalar(rand(0.16, 0.26)).add(new THREE.Vector3(rand(-0.04, 0.04), rand(-0.05, 0.02), rand(-0.04, 0.04)));
      s.position.copy(from).add(new THREE.Vector3(rand(-0.01, 0.01), rand(-0.01, 0.01), rand(-0.01, 0.01)));
      s.position.addScaledVector(u.vel, -i * 0.04);
      s.visible = true;
    });
  }
}
