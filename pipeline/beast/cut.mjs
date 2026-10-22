// Cut Dread (Muybridge, Animal Locomotion 1887, 'A mastiff walking', Wellcome b20133844) out of the twelve frames:
// light dog on a dark gridded backdrop. Writes the masks and a debug sheet.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const M = process.argv[2];
const b64 = fs.readFileSync(`${M}/strip.jpg`).toString('base64');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
page.on('console', (m) => console.log(m.text()));
await page.setContent('<body></body>');
const out = await page.evaluate(async (b64, P) => {
  const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
  // frame boxes measured on the half-size strip, doubled
  const cols = [[45, 328], [340, 632], [645, 937], [950, 1242], [1253, 1545], [1557, 1853]];
  const rows = [[85, 312], [340, 588]];
  const frames = [];
  for (const [y0, y1] of rows) for (const [x0, x1] of cols) frames.push({ x: x0 * 2 + 8, y: y0 * 2 + 8, w: (x1 - x0) * 2 - 16, h: (y1 - y0) * 2 - 16 });
  const res = [];
  for (const f of frames) {
    const d = cx.getImageData(f.x, f.y, f.w, f.h).data, W = f.w, H = f.h;
    const L = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) L[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
    // the floor (light, below the ruler), then the ruler band above it (light with ticks)
    const rowMean = (y) => { let s = 0; for (let x = W * 0.1 | 0; x < W * 0.9; x++) s += L[y * W + x]; return s / (W * 0.8); };
    let floor = H;
    for (let y = Math.floor(H * 0.6); y < H - 6; y++) {
      let ok = true;
      for (let k = 0; k < 6 && ok; k++) ok = rowMean(y + k) > P.floorT;
      if (ok) { floor = y; break; }
    }
    // the ruler: light rows (by their median, which a leg in front does not move) above the floor
    const rowMed = (y) => { const v = []; for (let x = W * 0.05 | 0; x < W * 0.95; x++) v.push(L[y * W + x]); v.sort((a, b) => a - b); return v[v.length >> 1]; };
    const darkRow = rowMed(Math.floor(H * 0.45));
    let ruler = floor;
    while (ruler > H * 0.6 && rowMed(ruler - 1) > darkRow + P.rulerD) ruler--;
    ruler -= 3;
    // background: dark, or a thin light grid line with dark on both sides of it
    // "dark" is local: within a margin of the darkest (blurred) nearby, which on the backdrop
    // is a square of the grid and on a leg the backdrop beside it
    const blur = (a, r) => { const t = new Float32Array(W * H), o = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < W) { s += a[y * W + xx]; n++; } } t[y * W + x] = s / n; }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < H) { s += t[yy * W + x]; n++; } } o[y * W + x] = s / n; }
      return o; };
    const minf = (a, r) => { const t = new Float32Array(W * H), o = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 1e9; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < W) v = Math.min(v, a[y * W + xx]); } t[y * W + x] = v; }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 1e9; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < H) v = Math.min(v, t[yy * W + x]); } o[y * W + x] = v; }
      return o; };
    const Ls = blur(L, 2);
    const lo = blur(minf(Ls, P.win), P.win);
    const dark = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) dark[i] = Ls[i] < lo[i] + P.margin ? 1 : 0;
    const R = P.line;
    const darkNear = (x, y, dx, dy) => { for (let k = 1; k <= R; k++) { const xx = x + dx * k, yy = y + dy * k; if (xx < 0 || yy < 0 || xx >= W || yy >= H) return true; if (dark[yy * W + xx]) return true; } return false; };
    // the grid: straight thin light lines; a pixel on one is a little lighter than 3 px to
    // either side, and so are most pixels above and below it (vertical) or beside it
    const C = P.contrast, run = P.run, Lr = blur(L, 0);
    const candV = new Uint8Array(W * H), candH = new Uint8Array(W * H);
    for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
      const i = y * W + x, v = Lr[i];
      if (v - 0.5 * (Lr[i - 3] + Lr[i + 3]) > C && v >= Lr[i - 1] && v >= Lr[i + 1]) candV[i] = 1;
      if (v - 0.5 * (Lr[i - 3 * W] + Lr[i + 3 * W]) > C && v >= Lr[i - W] && v >= Lr[i + W]) candH[i] = 1;
    }
    const line = new Uint8Array(W * H);
    for (let y = run; y < H - run; y++) for (let x = run; x < W - run; x++) {
      let nv = 0, nh = 0;
      for (let k = -run; k <= run; k++) {
        const iv = (y + k) * W + x, ih = y * W + x + k;
        nv += candV[iv] | candV[iv - 1] | candV[iv + 1];
        nh += candH[ih] | candH[ih - W] | candH[ih + W];
      }
      if (nv >= P.fill * (2 * run + 1) || nh >= P.fill * (2 * run + 1)) line[y * W + x] = 1;
    }
    let m = new Uint8Array(W * H);
    const morph = (a, r, op) => { // square erode (op 0) / dilate (op 1), separable
      const t = new Uint8Array(W * H), o = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = op ? 0 : 1; for (let k = -r; k <= r; k++) { const xx = x + k; const s = xx < 0 || xx >= W ? 0 : a[y * W + xx]; v = op ? v | s : v & s; } t[y * W + x] = v; }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = op ? 0 : 1; for (let k = -r; k <= r; k++) { const yy = y + k; const s = yy < 0 || yy >= H ? 0 : t[yy * W + x]; v = op ? v | s : v & s; } o[y * W + x] = v; }
      return o;
    };
    // the grid lines and the grain wiped out by a grayscale opening (thin light things go,
    // a leg stays), then light against the darkest nearby
    const maxf = (a, r) => { const t = new Float32Array(W * H), o = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = -1e9; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < W) v = Math.max(v, a[y * W + xx]); } t[y * W + x] = v; }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = -1e9; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < H) v = Math.max(v, t[yy * W + x]); } o[y * W + x] = v; }
      return o; };
    const Lo = maxf(minf(Ls, P.open2), P.open2);
    const base = blur(minf(Lo, P.win), P.win);
    // the dog: wherever no grid line runs near (they stop at its outline, and run on between
    // its legs), grown back by about as much as the lines were widened
    const bg = morph(line, P.cell, 1);
    let free = new Uint8Array(W * H);
    for (let y = P.edge; y < ruler; y++) for (let x = P.edge; x < W - P.edge; x++) { const i = y * W + x; free[i] = bg[i] ? 0 : 1; }
    const roi = morph(free, P.grow + P.slack, 1);
    const core = morph(free, P.grow - P.shrink, 1);
    // light against the darkest nearby (clean outline, pale socks), where the lines leave room;
    // and the line-free core for what is as dark as the backdrop (far legs, the black muzzle)
    for (let y = 0; y < ruler; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      m[i] = (Lo[i] > base[i] + P.margin && roi[i]) || core[i] ? 1 : 0;
    }
    // the white socks and paws: grown into from the dog, as far as it stays clearly light
    { const st = []; for (let i = 0; i < W * H; i++) if (m[i]) st.push(i);
      while (st.length) { const j = st.pop(), x = j % W, y = j / W | 0;
        for (const k of [j - 1, j + 1, j - W, j + W]) {
          const yy = k / W | 0; if (k < 0 || yy >= floor - P.bandH || m[k] || Math.abs((k % W) - x) > 1) continue;
          if (Lo[k] > base[k] + P.sock) { m[k] = 1; st.push(k); } } } }
    m = morph(morph(m, P.open, 0), P.open, 1);
    // the band with the numbered labels just above the floor: small light boxes, smaller than a paw
    // and in it only what goes on straight down from a leg (a paw may reach a little forward)
    { const band = morph(morph(m, P.label, 0), P.label, 1);
      const top = floor - P.bandH - 1, legs = new Uint8Array(W);
      for (let x = 0; x < W; x++) if (m[(top - P.legUp) * W + x]) for (let k = -P.paw; k <= P.paw; k++) if (x + k >= 0 && x + k < W) legs[x + k] = 1;
      for (let y = top + 1; y < floor; y++) for (let x = 0; x < W; x++) m[y * W + x] = band[y * W + x] & legs[x]; }
    // leaks found by eye on the debug sheet (glare, backdrop between the legs): cleared
    for (const [ex0, ey0, ex1, ey1] of (P.exclude[res.length] || [])) for (let y = ey0; y < ey1; y++) for (let x = ex0; x < ex1; x++) if (x >= 0 && y >= 0 && x < W && y < H) m[y * W + x] = 0;
    // largest component
    const lab = new Int32Array(W * H).fill(-1); let best = -1, bestN = 0, id = 0;
    for (let i = 0; i < W * H; i++) if (m[i] && lab[i] < 0) {
      const st = [i]; lab[i] = id; let n = 0;
      while (st.length) { const j = st.pop(); n++; const x = j % W, y = j / W | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const k = yy * W + xx; if (m[k] && lab[k] < 0) { lab[k] = id; st.push(k); } } }
      if (n > bestN) { bestN = n; best = id; } id++;
    }
    for (let i = 0; i < W * H; i++) m[i] = lab[i] === best ? 1 : 0;
    m = morph(morph(m, P.close, 1), P.close, 0);
    // fill holes: what the border cannot reach
    const reach = new Uint8Array(W * H); const st = [];
    for (let x = 0; x < W; x++) { st.push(x, (H - 1) * W + x); } for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
    while (st.length) { const j = st.pop(); if (reach[j] || m[j]) continue; reach[j] = 1; const x = j % W, y = j / W | 0;
      if (x > 0) st.push(j - 1); if (x < W - 1) st.push(j + 1); if (y > 0) st.push(j - W); if (y < H - 1) st.push(j + W); }
    for (let i = 0; i < W * H; i++) if (!reach[i]) m[i] = 1;
    // the paws stand in the ruler band: legs carried straight down through it
    for (let x = 0; x < W; x++) {
      if (!m[(ruler - 1) * W + x]) continue;
      for (let y = ruler; y < floor; y++) m[y * W + x] = 1;
    }
    // a smoother outline: blurred and cut at half
    { const sm = blur(m, P.smooth); for (let i = 0; i < W * H; i++) m[i] = sm[i] > 0.5 ? 1 : 0; }
    let bx0 = W, bx1 = 0, by0 = H, by1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
    res.push({ f, floor, ruler, W, H, lines: P.showLines ? Array.from(line).join('') : null, bbox: [bx0, by0, bx1, by1], mask: Array.from(m).join('') });
  }
  // debug: each frame with the mask tinted red and the floor line
  const dbg = document.createElement('canvas'); dbg.width = 6 * 600; dbg.height = 2 * 460;
  const g = dbg.getContext('2d');
  res.forEach((r, i) => {
    const ox = (i % 6) * 600, oy = (i / 6 | 0) * 460;
    g.drawImage(cv, r.f.x, r.f.y, r.W, r.H, ox, oy, r.W, r.H);
    const id = g.getImageData(ox, oy, r.W, r.H);
    for (let k = 0; k < r.W * r.H; k++) if (r.lines ? r.lines[k] === '1' : r.mask[k] === '1') { id.data[k * 4] = 230; id.data[k * 4 + 1] = id.data[k * 4 + 1] * 0.25; id.data[k * 4 + 2] = id.data[k * 4 + 2] * 0.25; }
    g.putImageData(id, ox, oy);
    g.fillStyle = 'rgba(0,255,255,0.8)'; for (let t = 0; t < r.W; t += 50) g.fillRect(ox + t, oy, 1, 12); for (let t = 0; t < r.H; t += 50) g.fillRect(ox, oy + t, 12, 1); g.font = '12px sans-serif'; g.fillText(String(i), ox + 20, oy + 20); g.fillStyle = '#0f0'; g.fillRect(ox, oy + r.floor, r.W, 2); g.fillStyle = '#ff0'; g.fillRect(ox, oy + r.ruler, r.W, 2);
  });
  return { res: res.map(({ mask, ...x }) => x), masks: res.map((r) => r.mask), dbg: dbg.toDataURL('image/png').split(',')[1] };
}, b64, { showLines: !!process.env.LINES, exclude: JSON.parse(process.env.EXCL || '{"5":[[20,285,95,380]],"6":[[470,0,600,92],[545,0,600,380]],"11":[[285,245,365,275]]}'), win: Number(process.env.WIN || 30), margin: Number(process.env.MARGIN || 14), open2: Number(process.env.OP2 || 4), contrast: Number(process.env.CON || 8), run: Number(process.env.RUN || 16), fill: Number(process.env.FILL || 0.8), cell: Number(process.env.CELL || 10), grow: Number(process.env.GROW || 8), slack: Number(process.env.SLACK || 10), shrink: Number(process.env.SHRINK || 6), edge: 10, sock: Number(process.env.SOCK || 80), smooth: Number(process.env.SMOOTH || 10), floorT: Number(process.env.FT || 150), rulerD: Number(process.env.RD || 30), label: Number(process.env.LABEL || 0), bandH: Number(process.env.BANDH || 48), paw: Number(process.env.PAW || 6), legUp: Number(process.env.LEGUP || 12), line: Number(process.env.LINE || 7), open: Number(process.env.OPEN || 2), close: Number(process.env.CLOSE || 5) });
fs.writeFileSync(`${M}/cut-debug.png`, Buffer.from(out.dbg, 'base64'));
fs.writeFileSync(`${M}/masks.json`, JSON.stringify({ res: out.res, masks: out.masks }));
for (const r of out.res) console.log(JSON.stringify({ floor: r.floor, ruler: r.ruler, bbox: r.bbox }));
await browser.close();
