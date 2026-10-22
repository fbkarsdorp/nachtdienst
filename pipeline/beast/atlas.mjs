// The twelve masks aligned on the body (feet on the floor) and packed into one texture: the
// window's creature. Also an onion-skin check of the cycle and where the paws touch the floor.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const M = process.argv[2], OUT = process.argv[3];
const all = JSON.parse(fs.readFileSync(`${M}/masks.json`, 'utf8'));
// the frames of one loop (the silhouette repeats after half a stride: frame 8 is frame 2 again)
const FR = (process.env.FRAMES || '2,3,4,5,6,7').split(',').map(Number), COLS = Number(process.env.COLS || 3);
const res = FR.map((i) => all.res[i]), masks = FR.map((i) => all.masks[i]);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
page.on('console', (m) => console.log(m.text()));
await page.setContent('<body></body>');
const out = await page.evaluate(async (res, masks, CELL_W, COLS) => {
  const fr = res.map((r, i) => {
    const { W, H, floor } = r, m = masks[i];
    const [bx0, by0, bx1] = r.bbox;
    // anchor: the middle of the upper part (back, shoulders, head), and the floor
    let sx = 0, n = 0; const yTop = by0, yBot = by0 + 0.4 * (floor - by0);
    for (let y = yTop | 0; y < yBot; y++) for (let x = 0; x < W; x++) if (m[y * W + x] === '1') { sx += x; n++; }
    const ax = sx / n;
    // where it touches the floor: runs of mask in the lowest rows
    const touch = []; let run = null; const yy = floor - 3;
    for (let x = 0; x <= W; x++) { const on = x < W && m[yy * W + x] === '1'; if (on && !run) run = [x, x]; else if (on) run[1] = x; else if (run) { touch.push(Math.round((run[0] + run[1]) / 2 - ax)); run = null; } }
    return { W, H, floor, ax, bx0, bx1, by0, m, touch };
  });
  const left = Math.max(...fr.map((f) => f.ax - f.bx0)) + 6, right = Math.max(...fr.map((f) => f.bx1 - f.ax)) + 6;
  const top = Math.max(...fr.map((f) => f.floor - f.by0)) + 6;
  const BW = Math.ceil(left + right), BH = Math.ceil(top + 4);
  // each frame as a soft white-on-black mask in its box
  const boxes = fr.map((f) => {
    const c = document.createElement('canvas'); c.width = BW; c.height = BH;
    const g = c.getContext('2d'), id = g.createImageData(BW, BH);
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
      const sx = Math.round(x - left + f.ax), sy = Math.round(y - top + f.floor);
      const on = sx >= 0 && sy >= 0 && sx < f.W && sy < f.H && f.m[sy * f.W + sx] === '1';
      const k = (y * BW + x) * 4; id.data[k] = id.data[k + 1] = id.data[k + 2] = on ? 255 : 0; id.data[k + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return c;
  });
  // the texture: 4 x 3 cells, scaled down, edges softened a little
  const s = CELL_W / BW, CW = CELL_W, CH = Math.round(BH * s);
  const ROWS = Math.ceil(boxes.length / COLS);
  const atlas = document.createElement('canvas'); atlas.width = CW * COLS; atlas.height = CH * ROWS;
  const ag = atlas.getContext('2d'); ag.fillStyle = '#000'; ag.fillRect(0, 0, atlas.width, atlas.height);
  ag.filter = 'blur(1px)'; ag.imageSmoothingQuality = 'high';
  boxes.forEach((b, i) => ag.drawImage(b, (i % COLS) * CW, (i / COLS | 0) * CH, CW, CH));
  // onion skin: frame i in red over frame 0 in cyan, to see whether 12 closes the cycle
  const onion = document.createElement('canvas'); onion.width = BW * 4; onion.height = BH * 3;
  const og = onion.getContext('2d');
  boxes.forEach((b, i) => { const ox = (i % 4) * BW, oy = (i / 4 | 0) * BH;
    og.globalCompositeOperation = 'source-over'; og.fillStyle = '#000'; og.fillRect(ox, oy, BW, BH);
    og.globalCompositeOperation = 'lighter';
    og.filter = 'none';
    const tint = (src, col) => { const c = document.createElement('canvas'); c.width = BW; c.height = BH; const g = c.getContext('2d'); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = col; g.fillRect(0, 0, BW, BH); return c; };
    og.drawImage(tint(boxes[0], '#00a0a0'), ox, oy); og.drawImage(tint(b, '#c00000'), ox, oy);
    og.globalCompositeOperation = 'source-over'; og.fillStyle = '#ff0'; og.font = '20px sans-serif'; og.fillText(String(i), ox + 8, oy + 24);
    og.fillStyle = '#0f0'; og.fillRect(ox + left, oy, 1, BH); });
  return { atlas: atlas.toDataURL('image/png').split(',')[1], onion: onion.toDataURL('image/png').split(',')[1],
    meta: { BW, BH, left, top, CW, CH, scale: s, touch: fr.map((f) => f.touch), ax: fr.map((f) => Math.round(f.ax)) } };
}, res, masks, Number(process.env.CELL_W || 360), COLS);
fs.writeFileSync(`${M}/onion.png`, Buffer.from(out.onion, 'base64'));
fs.writeFileSync(OUT, Buffer.from(out.atlas, 'base64'));
console.log(JSON.stringify(out.meta));
await browser.close();
