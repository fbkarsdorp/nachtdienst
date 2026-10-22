// Textures: paper and noise made here, and the room's own texture sets (from the
// Blender build, in models/tex/) for the wooden and cardboard things the game builds.
import * as THREE from 'three';

let maxAniso = 8;
export function setAnisotropy(n) { maxAniso = n; }

function makeNoise(seed = 1) {
  const p = new Uint8Array(512);
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const perm = Array.from({ length: 256 }, (_, i) => i).sort(() => r() - 0.5);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const grad = (h, x, y) => ((h & 1) ? x : -x) + ((h & 2) ? y : -y);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const noise = (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = p[X] + Y, b = p[X + 1] + Y;
    const l1 = grad(p[a], x, y) + u * (grad(p[b], x - 1, y) - grad(p[a], x, y));
    const l2 = grad(p[a + 1], x, y - 1) + u * (grad(p[b + 1], x - 1, y - 1) - grad(p[a + 1], x, y - 1));
    return l1 + v * (l2 - l1);
  };
  noise.fbm = (x, y, oct = 4) => {
    let f = 0, amp = 0.5, fr = 1;
    for (let i = 0; i < oct; i++) { f += amp * noise(x * fr, y * fr); fr *= 2; amp *= 0.5; }
    return f;
  };
  return noise;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const mix = (a, b, t) => a + (b - a) * t;

export function paperBase(ctx, w, h, { tone = [236, 227, 207], age = 0.5, seed = 7 } = {}) {
  const n = makeNoise(seed);
  const img = ctx.createImageData(w, h);
  const s = 1 / Math.max(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = n.fbm(x * s * 6, y * s * 6, 4) * 0.09 * age + n(x / 1.7, y / 1.7) * 0.025;
      const edge = Math.min(x, y, w - x, h - y) / (Math.min(w, h) * 0.18);
      const e = edge < 1 ? (1 - edge) * 0.10 * age : 0;
      const i = (y * w + x) * 4;
      img.data[i] = tone[0] * (1 + v - e);
      img.data[i + 1] = tone[1] * (1 + v - e * 1.2);
      img.data[i + 2] = tone[2] * (1 + v - e * 1.6);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Grain is computed once per size and seed, then tinted, so every card is cheap.
const grainCache = new Map();
export function paperCanvas(w, h, opts = {}) {
  const seed = opts.seed || 7;
  const age = Math.round((opts.age ?? 0.5) * 4) / 4;
  const key = `${w}x${h}:${seed}:${age}`;
  if (!grainCache.has(key)) {
    const c = canvas(w, h);
    paperBase(c.getContext('2d'), w, h, { tone: [255, 255, 255], age, seed });
    grainCache.set(key, c);
  }
  const out = canvas(w, h);
  const ctx = out.getContext('2d');
  ctx.drawImage(grainCache.get(key), 0, 0);
  const t = opts.tone || [236, 227, 207];
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${t[0] | 0},${t[1] | 0},${t[2] | 0})`;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  return out;
}

export function makeCanvas(w, h) { return canvas(w, h); }
export function canvasTexture(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// One of the room's texture sets (oak_veneer_01, Cardboard004...): colour, normal, roughness.
const sets = new Map();
export function textureSet(name) {
  if (!sets.has(name)) {
    const loader = new THREE.TextureLoader();
    const load = (kind, srgb) => {
      const t = loader.load(`models/tex/${name}_${kind}.webp`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = maxAniso;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return t;
    };
    sets.set(name, { map: load('diff', true), normalMap: load('nor', false), roughnessMap: load('rough', false) });
  }
  return sets.get(name);
}

// Box-project a geometry's UVs at real size: one repeat of the texture is `tile` metres,
// and the texture's v (the grain, in the wood sets) runs along `grain` wherever it can.
export function boxUVs(geo, tile, grain = 'x', offset = [0, 0]) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  const ax = ['x', 'y', 'z'];
  for (let i = 0; i < pos.count; i++) {
    const n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const k = n.indexOf(Math.max(...n));
    // the two axes of the face; the grain along one of them, or along the first
    let [a, b] = ax.filter((_, j) => j !== k);
    if (a === grain) [a, b] = [b, a];
    const c = { x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) };
    uv.setXY(i, c[a] / tile + offset[0], c[b] / tile + offset[1]);
  }
  uv.needsUpdate = true;
  return geo;
}

export { makeNoise };
