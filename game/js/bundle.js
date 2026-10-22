// The bundle: one night's puzzles, made by the pipeline (pipeline/assemble.py).
// The client never sees a plain word or number answer; it hashes what is typed or
// dialled exactly as the pipeline hashed the accepted answers, and compares.

export async function loadBundle(seed) {
  const index = await fetch('data/bundles/index.json').then((r) => r.json());
  const seeds = index.seeds;
  let s = Number(seed);
  if (!seeds.includes(s)) {
    // any other name picks one of the nights, always the same one
    let h = 0;
    for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    s = seeds[h % seeds.length];
  }
  const bundle = await fetch(`data/bundles/${s}.json`).then((r) => r.json());
  return bundle;
}

// Spec 6.2, the same as pipeline/common.py normalize().
export function normalize(input) {
  let s = String(input).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  s = s.replace(/\s+/g, ' ');
  for (const a of ['de ', 'het ', 'een ', "'n ", "'t "]) {
    if (s.startsWith(a)) { s = s.slice(a.length); break; }
  }
  return s.replace(/[\s.,;:!?'"()\-]+$/, '').trim();
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// word and number3 locks: is this input one of the accepted answers?
export async function opens(lock, input) {
  const n = lock.kind === 'number3' ? input : normalize(input);
  if (!n) return false;
  return lock.accepted_hashes.includes(await sha256(lock.salt + n));
}

export function haversine(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const h = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const COMPASS = ['noorden', 'noordoosten', 'oosten', 'zuidoosten', 'zuiden', 'zuidwesten', 'westen', 'noordwesten'];
export function compass(lat1, lon1, lat2, lon2) {
  const dy = lat2 - lat1;
  const dx = (lon2 - lon1) * Math.cos((lat1 * Math.PI) / 180);
  const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

// a stable number for a card key (canvas noise and paper tone are seeded by it)
export function keyNumber(key) {
  let h = 7;
  for (const ch of key) h = (h * 131 + ch.charCodeAt(0)) % 2147483647;
  return h || 7;
}
