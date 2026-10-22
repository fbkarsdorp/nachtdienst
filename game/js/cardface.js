// Filing cards drawn on canvas in the house style: typed description, place,
// year, collector's initials, a catalogue code in red pencil, and the
// collector's pencil remarks in the margin.
import { paperCanvas, makeCanvas } from './textures.js';

export const CARD_W = 1600;
export const CARD_H = 966;
const TYPE = '"Special Elite", "Courier New", monospace';
const HAND = '"Homemade Apple", cursive';
const OTHER = '"IM Fell English", Georgia, serif';

const RULE_TOP = 168;
const LINE = 56;

function rnd(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) {
        out.push(line);
        line = w;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}

function fit(ctx, text, font, maxW, maxH, big, small, lh = 1.32) {
  for (let size = big; size >= small; size -= 1) {
    ctx.font = `${size}px ${font}`;
    const lines = wrap(ctx, text, maxW);
    if (lines.length * size * lh <= maxH) return { size, lines, lh: size * lh };
  }
  ctx.font = `${small}px ${font}`;
  const lines = wrap(ctx, text, maxW);
  const max = Math.floor(maxH / (small * lh));
  if (lines.length > max) {
    lines.length = max;
    lines[max - 1] = lines[max - 1].replace(/\s*\S*$/, ' …');
  }
  return { size: small, lines, lh: small * lh };
}

// Type a line one character at a time, with the unevenness of a worn ribbon.
function typeLine(ctx, line, x, y, r, ink = [34, 30, 26]) {
  let cx = x;
  for (const ch of line) {
    const a = 0.72 + r() * 0.28;
    ctx.fillStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},${a})`;
    ctx.fillText(ch, cx + (r() - 0.5) * 1.2, y + (r() - 0.5) * 1.6);
    cx += ctx.measureText(ch).width;
  }
}

function rules(ctx, w, h, r, { header = true } = {}) {
  ctx.strokeStyle = 'rgba(70,100,160,0.28)';
  ctx.lineWidth = 2;
  for (let y = RULE_TOP + LINE; y < h - 30; y += LINE) {
    ctx.beginPath();
    ctx.moveTo(0, y + (r() - 0.5));
    ctx.lineTo(w, y + (r() - 0.5));
    ctx.stroke();
  }
  if (header) {
    ctx.strokeStyle = 'rgba(190,60,50,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, RULE_TOP);
    ctx.lineTo(w, RULE_TOP);
    ctx.stroke();
  }
  // punch hole for the drawer rod
  ctx.fillStyle = 'rgba(0,0,0,0.0)';
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(w / 2, h - 34, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(80,60,40,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w / 2, h - 34, 16, 0, Math.PI * 2);
  ctx.stroke();
}

function stains(ctx, w, h, r) {
  const k = Math.floor(r() * 3);
  for (let i = 0; i < k; i++) {
    const x = r() * w, y = r() * h, rad = 40 + r() * 110;
    const g = ctx.createRadialGradient(x, y, rad * 0.75, x, y, rad);
    g.addColorStop(0, 'rgba(120,90,50,0.02)');
    g.addColorStop(0.92, 'rgba(120,85,45,0.09)');
    g.addColorStop(1, 'rgba(120,85,45,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  // a thumb-dark corner from handling
  const g = ctx.createRadialGradient(w, h, 0, w, h, 260);
  g.addColorStop(0, 'rgba(70,50,30,0.12)');
  g.addColorStop(1, 'rgba(70,50,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(w - 260, h - 260, 260, 260);
}

function pencil(ctx, text, x, y, maxW, { size = 34, color = 'rgba(68,68,74,0.92)', rot = -0.02, r, font = HAND, style = '' } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.font = `${style}${size}px ${font}`;
  const lines = wrap(ctx, text, maxW);
  const lh = size * 1.55;
  lines.forEach((l, i) => {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85 + (r ? r() * 0.15 : 0);
    ctx.fillText(l, 0, i * lh);
  });
  ctx.restore();
  return lines.length * lh;
}

// Tear one edge off: the bottom of a top half, or the top of a bottom half.
function tearEdge(ctx, w, h, r, edge) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  const base = edge === 'bottom' ? h - 26 : 26;
  const out = edge === 'bottom' ? h + 2 : -2;
  ctx.moveTo(-2, out);
  ctx.lineTo(-2, base);
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * (w + 4) - 2;
    ctx.lineTo(x, base + (r() - 0.5) * 30 + Math.sin(i * 1.7) * 6);
  }
  ctx.lineTo(w + 2, out);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// The archive's rubber stamp in violet ink, bottom right: VERHALENBANK over the
// story's number. Returns the box it covers, in canvas pixels, so it can be clicked.
function stamp(ctx, record, right, bottom, r) {
  const sw = 400, sh = 104;
  const s = makeCanvas(sw, sh);
  const g = s.getContext('2d');
  g.strokeStyle = g.fillStyle = 'rgb(72,58,138)';
  g.lineWidth = 5;
  g.strokeRect(6, 6, sw - 12, sh - 12);
  g.lineWidth = 2;
  g.strokeRect(14, 14, sw - 28, sh - 28);
  g.textAlign = 'center';
  g.font = `bold 22px ${TYPE}`;
  g.fillText('V E R H A L E N B A N K', sw / 2, 42);
  g.font = `40px ${TYPE}`;
  g.fillText(record, sw / 2, 82);
  // uneven inking: the pad was dry in places
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    g.globalAlpha = 0.2 + r() * 0.7;
    g.fillRect(r() * sw, r() * sh, 1 + r() * 3, 1 + r() * 2);
  }
  g.globalAlpha = 0.35;
  g.fillRect(0, sh * (0.3 + r() * 0.4), sw, 6 + r() * 8);
  const rot = -0.035 + (r() - 0.5) * 0.03;
  ctx.save();
  ctx.translate(right - sw / 2, bottom - sh / 2);
  ctx.rotate(rot);
  ctx.globalAlpha = 0.82;
  ctx.drawImage(s, -sw / 2, -sh / 2);
  ctx.restore();
  return { x: right - sw - 8, y: bottom - sh - 12, w: sw + 16, h: sh + 24 };
}

// A ring of coffee over one word of the typed text: the word can no longer be read.
// lines as drawn, from baseline y0, lh apart; size the type size.
function stainWord(ctx, lines, word, left, y0, lh, size, r) {
  if (!word) return;
  const rx = new RegExp(`(^|[^\\p{L}\\d])(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=[^\\p{L}\\d]|$)`, 'u');
  const i = lines.findIndex((l) => rx.test(l));
  if (i < 0) return;
  const m = lines[i].match(rx);
  const at = m.index + m[1].length;
  const x0 = left + ctx.measureText(lines[i].slice(0, at)).width;
  const w = ctx.measureText(word).width;
  const cx = x0 + w / 2, cy = y0 + i * lh - size * 0.32;
  const rad = Math.max(w * 0.62, size * 0.95);
  ctx.save();
  // the puddle it dried from: dark enough to hide what is under it, uneven at the edge
  const blob = (k, color) => {
    ctx.beginPath();
    for (let j = 0; j <= 40; j++) {
      const a = (j / 40) * Math.PI * 2;
      const q = rad * k * (1 + 0.07 * Math.sin(a * 3 + r() * 6) + 0.04 * Math.sin(a * 7));
      const px = cx + Math.cos(a) * q * 1.08, py = cy + Math.sin(a) * q * 0.86;
      if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.fillStyle = color;
    ctx.fill();
  };
  blob(1.0, 'rgba(120,78,40,0.55)');
  blob(0.86, 'rgba(104,64,30,0.82)');
  blob(0.62, 'rgba(96,58,26,0.9)');
  // the ring the cup left, darker where the coffee dried at the rim
  ctx.strokeStyle = 'rgba(74,42,18,0.55)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(cx + rad * 0.12, cy - rad * 0.05, rad * 1.02, rad * 0.84, 0.1, 0, Math.PI * 2);
  ctx.stroke();
  // a few drops beside it
  for (let j = 0; j < 4; j++) {
    const a = r() * Math.PI * 2, d = rad * (1.25 + r() * 0.6);
    ctx.fillStyle = 'rgba(100,62,28,0.6)';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 3 + r() * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// It lay on a wet windowsill: water marks with a darker tide line, the paper cockled.
function damp(ctx, w, h, r) {
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const x = w * (0.2 + r() * 0.6), y = h * (0.45 + r() * 0.5), rad = 140 + r() * 220;
    const g = ctx.createRadialGradient(x, y, rad * 0.2, x, y, rad);
    g.addColorStop(0, 'rgba(120,110,90,0.10)');
    g.addColorStop(0.85, 'rgba(110,98,76,0.16)');
    g.addColorStop(0.93, 'rgba(92,80,60,0.26)');
    g.addColorStop(1, 'rgba(92,80,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rad, rad * (0.6 + r() * 0.3), r() * 3, 0, 7);
    ctx.fill();
  }
  // cockling: faint bands of light and shade across the card
  for (let i = 0; i < 7; i++) {
    const y = (i + r()) * h / 7;
    const g = ctx.createLinearGradient(0, y - 30, 0, y + 30);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, i % 2 ? 'rgba(60,50,40,0.05)' : 'rgba(255,250,235,0.05)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 30, w, 60);
  }
  ctx.restore();
}

export function cardTone(n) {
  const r = rnd(n * 7 + 3);
  const shift = (r() - 0.5) * 14;
  return { tone: [236 + shift * 0.4, 227 + shift * 0.5, 205 + shift], age: 0.5 + r() * 0.5, seed: 1 + (n % 5) };
}

// The collector's note, in pencil on a blank card: the only instruction there is.
// data: { n, note }
export function drawNote(c, data) {
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  const r = rnd(4242);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(paperCanvas(w, h, { tone: [240, 233, 214], age: 0.55, seed: 8 }), 0, 0);
  stains(ctx, w, h, r);
  rules(ctx, w, h, r, { header: false });
  const lines = String(data.note).split('\n');
  ctx.save();
  ctx.translate(110, 210);
  ctx.rotate(-0.03);
  ctx.fillStyle = 'rgba(52,52,60,0.94)';
  lines.forEach((l, i) => {
    const sign = l.startsWith('—');
    ctx.font = `${sign ? 58 : 72}px ${HAND}`;
    ctx.fillText(l, sign ? 760 : 0, i * 150 + (sign ? 10 : 0));
  });
  ctx.restore();
  // the second line underlined, twice
  ctx.strokeStyle = 'rgba(52,52,60,0.8)';
  ctx.lineWidth = 4;
  for (const dy of [0, 14]) {
    ctx.beginPath();
    ctx.moveTo(118, 400 + dy);
    ctx.quadraticCurveTo(500, 386 + dy, 930, 378 + dy);
    ctx.stroke();
  }
}

// A filing card in the house style. Fields (all optional):
//   place (null shows a redaction: ——), prov, year, code (red pencil), initials, record,
//   kind ('Sage'), teller, description, half ('top' | 'bottom'), summary (J.J.V.'s card),
//   blank (the word that fills a summary's ____), notes [{text, kind}] in the margin.
export function drawFront(c, data) {
  if (data.note) return drawNote(c, data);
  if (data.envelope) return drawEnvelope(c, data.envelope);
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  const r = rnd(data.n || 1);
  ctx.clearRect(0, 0, w, h);
  // J.J.V.'s summary on blue-grey; the archive behind the divider on grey stock (3h)
  const tone = data.summary ? { tone: [214, 222, 226], age: 0.4, seed: 6 }
    : data.archive ? { tone: [200, 200, 194], age: 0.6, seed: 1 + ((data.n || 1) % 5) } : cardTone(data.n || 1);
  ctx.drawImage(paperCanvas(w, h, tone), 0, 0);
  stains(ctx, w, h, r);
  if (data.damp) damp(ctx, w, h, r);
  const left = 64;
  const notes = data.notes || [];
  const bodyW = notes.length ? w * 0.62 - left : w - left * 2;

  if (data.half === 'bottom') {
    // the lower half: the rest of the text, the number in red pencil at the foot
    rules(ctx, w, h + 200, r, { header: false });
    // a half is seen smaller than a card: larger type
    const f = fit(ctx, data.description || '', TYPE, w - left * 2, h - 150, 52, 30, 1.25);
    ctx.font = `${f.size}px ${TYPE}`;
    f.lines.forEach((l, i) => typeLine(ctx, l, left, 82 + i * f.lh, r));
    stainWord(ctx, f.lines, data.stain, left, 82, f.lh, f.size, r);
    if (data.code) {
      ctx.save();
      ctx.translate(w - 70, h - 40);
      ctx.rotate(-0.04);
      ctx.font = `44px ${HAND}`;
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(168,36,28,0.92)';
      ctx.fillText(data.code, 0, 0);
      ctx.restore();
    }
    tearEdge(ctx, w, h, r, 'top');
    return;
  }

  rules(ctx, w, h, r);
  // header: place and province, typed in capitals; a redaction where the place is missing
  ctx.font = `46px ${TYPE}`;
  if (data.summary) {
    typeLine(ctx, 'SAMENVATTING', left, 92, r);
  } else if (data.place) {
    typeLine(ctx, data.place.toUpperCase() + (data.prov ? `  (${data.prov})` : ''), left, 92, r);
  } else {
    typeLine(ctx, '——', left, 92, r);
    ctx.fillStyle = 'rgba(30,26,22,0.85)';
    ctx.fillRect(left + 90, 66, 360, 34);
  }
  ctx.font = `30px ${TYPE}`;
  const sub = data.summary ? 'drie opnamen, één ding verschilt' : data.sub || (data.kind ? data.kind.toLowerCase() : 'beschrijving');
  typeLine(ctx, sub, left, 142, r, [90, 80, 70]);
  if (data.code) {
    ctx.save();
    ctx.translate(w - 70, 108);
    ctx.rotate(-0.045);
    ctx.font = `50px ${HAND}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(168,36,28,0.92)';
    ctx.fillText(data.code, 0, 0);
    ctx.restore();
  } else if (data.uncatalogued) {
    pencil(ctx, 'nog niet ingedeeld', w - 470, 104, 430, { size: 30, rot: -0.03, color: 'rgba(80,80,86,0.75)', r });
  }

  const top = RULE_TOP + LINE - 14;
  const bottom = data.half === 'top' ? h - 50 : h - 112;
  let text = data.description || '';
  if (data.summary && data.blank) text = text.replace('____', data.blank.toUpperCase());
  const big = data.summary ? 50 : data.half ? 52 : 46;
  const f = fit(ctx, text, TYPE, bodyW, bottom - top, big, data.half ? 30 : 22, 1.3);
  ctx.font = `${f.size}px ${TYPE}`;
  const lh = f.size >= 40 ? LINE : f.lh;
  f.lines.forEach((l, i) => typeLine(ctx, l, left, top + i * lh, r));
  stainWord(ctx, f.lines, data.stain, left, top, lh, f.size, r);

  c.linkRect = null;
  if (data.half !== 'top') {
    // a story that is in the Verhalenbank carries its number there as a stamp, not typed
    const stamped = data.url && data.record;
    ctx.font = `30px ${TYPE}`;
    const foot = [
      data.year ? `${data.year}` : null,
      data.teller ? `verteller: ${data.teller}` : data.initials ? `verz. ${data.initials}` : null,
      stamped ? null : data.record || null,
    ].filter(Boolean).join('    ');
    typeLine(ctx, foot, left, h - 58, r, [70, 62, 54]);
    if (stamped) c.linkRect = stamp(ctx, data.record, w - 64, h - 26, r);
  }

  // the collector's remarks and hints in the margin
  if (notes.length) {
    let y = top + 4;
    const x = w * 0.64;
    ctx.save();
    ctx.strokeStyle = 'rgba(80,80,86,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 24, top - 30);
    ctx.lineTo(x - 26 + (r() - 0.5) * 6, bottom);
    ctx.stroke();
    ctx.restore();
    const avail = bottom - y;
    let size = 32;
    for (const sz of [32, 29, 26, 23, 21, 19]) {
      ctx.font = `${sz}px ${HAND}`;
      const total = notes.reduce((acc, nt) => acc + wrap(ctx, nt.text, w - x - 50).length * sz * 1.55 + sz * 0.6, 0);
      size = sz;
      if (total <= avail) break;
    }
    notes.forEach((nt, i) => {
      // another hand than J.J.V.'s: smaller, upright, in ink
      const other = nt.kind === 'other';
      const color = other ? 'rgba(40,30,26,0.9)' : nt.kind === 'hint' ? 'rgba(52,56,70,0.95)' : 'rgba(68,68,74,0.92)';
      const used = pencil(ctx, (nt.kind === 'hint' ? '→ ' : '') + nt.text, x, y + size, w - x - 50,
        { size: other ? size * 0.95 : size, rot: other ? 0.01 : -0.015 - i * 0.004, color, r, font: other ? OTHER : HAND, style: other ? 'italic ' : '' });
      y += used + size * 0.6;
    });
  }
  if (data.half === 'top') tearEdge(ctx, w, h, r, 'bottom');
  if (data.crumpled || data.creased) creases(ctx, w, h, rnd((data.n || 1) * 11 + 5), data.crumpled ? 1 : 0.35);
}

// It was crumpled up and thrown away: a web of creases, each a light and a dark edge;
// crumpled, the card is grey with them; smoothed out, they stay, faint.
function creases(ctx, w, h, r, k) {
  ctx.save();
  if (k >= 1) {
    ctx.fillStyle = 'rgba(70,60,48,0.22)';
    ctx.fillRect(0, 0, w, h);
  }
  const pts = Array.from({ length: 9 }, () => [r() * w, r() * h]);
  for (let i = 0; i < 26; i++) {
    const a = pts[Math.floor(r() * pts.length)];
    const ang = r() * Math.PI, len = 200 + r() * 700;
    const b = [a[0] + Math.cos(ang) * len, a[1] + Math.sin(ang) * len];
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(60,48,36,${0.22 * k})`;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.strokeStyle = `rgba(255,250,235,${0.28 * k})`;
    ctx.beginPath(); ctx.moveTo(a[0] + 3, a[1] + 3); ctx.lineTo(b[0] + 3, b[1] + 3); ctx.stroke();
  }
  ctx.restore();
}

// A manila envelope of incoming records (section 3b), its plain front (the flap is on the
// back): stamped IN TE VOEGEN with its drawer, J.J.V.'s note in pencil, the count in the corner (live; with a
// tick once all are back in and it is shut), INGEVOEGD across it once inserted. Drawn at any
// resolution: everything is in fractions of the canvas.
// data: { id, note, where, hints, other, count, of, tick, done, sealedFor }
const MANILA = [204, 170, 112];
function drawEnvelope(c, E) {
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height, u = w / 1600;
  const r = rnd(911 + w);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(paperCanvas(w, h, { tone: MANILA, age: 0.7, seed: 4 }), 0, 0);
  const red = 'rgba(160,34,26,0.85)';
  if (E.sealedFor) {
    // cabinet 5: sealed, no count, only a place name
    ctx.save();
    ctx.font = `${120 * u}px ${HAND}`;
    ctx.fillStyle = 'rgba(44,40,48,0.9)';
    ctx.textAlign = 'center';
    ctx.translate(w / 2, h * 0.76);
    ctx.rotate(-0.03);
    ctx.fillText(E.sealedFor, 0, 0);
    ctx.restore();
    ctx.fillStyle = 'rgba(120,20,16,0.9)';
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.47, 46 * u, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // the stamp, top left, outside the flap
  ctx.save();
  ctx.translate(70 * u, 92 * u);
  ctx.rotate(-0.05);
  ctx.strokeStyle = red;
  ctx.lineWidth = 6 * u;
  ctx.strokeRect(0, -62 * u, 430 * u, 150 * u);
  ctx.fillStyle = red;
  ctx.font = `bold ${50 * u}px ${TYPE}`;
  ctx.fillText('IN TE VOEGEN', 22 * u, 0);
  ctx.font = `${46 * u}px ${TYPE}`;
  ctx.fillText(`la ${E.id}`, 22 * u, 62 * u);
  ctx.restore();
  // the count, top right: what belongs in it; short, it says so
  ctx.save();
  ctx.translate(w - 150 * u, 110 * u);
  ctx.strokeStyle = 'rgba(44,40,48,0.8)';
  ctx.lineWidth = 5 * u;
  ctx.beginPath();
  ctx.arc(0, 0, 78 * u, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(44,40,48,0.92)';
  ctx.textAlign = 'center';
  const short = E.count < E.of;
  ctx.font = `${(short ? 64 : 96) * u}px ${HAND}`;
  ctx.fillText(short ? `${E.count}/${E.of}` : String(E.of), 0, 30 * u);
  if (E.tick) {
    ctx.strokeStyle = red;
    ctx.lineWidth = 12 * u;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-150 * u, 0); ctx.lineTo(-118 * u, 40 * u); ctx.lineTo(-70 * u, -50 * u);
    ctx.stroke();
  }
  ctx.restore();
  // J.J.V.'s pencil
  const items = [{ text: E.note, kind: 'note' }];
  if (E.where) items.push({ text: E.where, kind: 'note' });
  for (const t of E.hints || []) items.push({ text: '→ ' + t, kind: 'hint' });
  if (E.other) items.push({ text: E.other, kind: 'other' });
  const x = 90 * u, maxW = w - 180 * u, top = h * 0.36, avail = h * 0.6;
  let size = 60 * u;
  for (const k of [60, 54, 48, 43, 38, 34, 30, 27]) {
    const sz = k * u;
    size = sz;
    const total = items.reduce((acc, it) => {
      const z = it.kind === 'hint' ? sz * 0.82 : sz;
      ctx.font = `${it.kind === 'other' ? 'italic ' : ''}${z}px ${it.kind === 'other' ? OTHER : HAND}`;
      return acc + wrap(ctx, it.text, maxW).length * z * 1.55 + sz * 0.4;
    }, 0);
    if (total <= avail) break;
  }
  let y = top;
  items.forEach((it, i) => {
    const other = it.kind === 'other', hint = it.kind === 'hint';
    const sz = hint ? size * 0.82 : other ? size * 0.88 : size;
    const color = other ? 'rgba(40,30,26,0.9)' : hint ? 'rgba(46,50,66,0.95)' : 'rgba(44,40,48,0.94)';
    y += pencil(ctx, it.text, x, y + sz * 0.6, maxW, { size: sz, rot: other ? 0.01 : -0.015 - i * 0.004, color, r,
      font: other ? OTHER : HAND, style: other ? 'italic ' : '' }) + size * 0.4;
  });
  if (E.done) {
    // inserted: the stamp across it
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.22);
    ctx.globalAlpha = 0.82;
    ctx.strokeStyle = 'rgba(70,40,110,0.9)';
    ctx.fillStyle = 'rgba(70,40,110,0.9)';
    ctx.lineWidth = 10 * u;
    ctx.strokeRect(-470 * u, -110 * u, 940 * u, 200 * u);
    ctx.font = `bold ${130 * u}px ${TYPE}`;
    ctx.textAlign = 'center';
    ctx.fillText('INGEVOEGD', 0, 45 * u);
    ctx.restore();
  }
}

// the envelope's back: the folds of its side and bottom flaps, and under the top flap the
// inside, darker, seen when it is open (drawn as seen from behind: the top is the top)
function drawEnvelopeBack(c) {
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height, u = w / 1600;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(paperCanvas(w, h, { tone: MANILA, age: 0.6, seed: 5 }), 0, 0);
  ctx.fillStyle = 'rgba(96,70,36,0.55)';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w / 2, h * 0.46); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,64,30,0.32)';
  ctx.lineWidth = 3 * u;
  ctx.beginPath();
  ctx.moveTo(0, h); ctx.lineTo(w * 0.36, h * 0.5);
  ctx.moveTo(w, h); ctx.lineTo(w * 0.64, h * 0.5);
  ctx.stroke();
}

// An index tab: the place and year typed, the code in red pencil. data: { place, year, code }
export function drawTab(c, data) {
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  const r = rnd(7 + (data.year || 0));
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(paperCanvas(w, h, { tone: [234, 226, 204], age: 0.5, seed: 2 }), 0, 0);
  ctx.font = `44px ${TYPE}`;
  const place = (data.place || '——').toUpperCase();
  const label = data.year ? `${place} ${data.year}` : place;
  let size = 44;
  while (size > 26 && ctx.measureText(label).width > w * 0.62) ctx.font = `${(size -= 2)}px ${TYPE}`;
  typeLine(ctx, label, 18, 78, r);
  if (data.code) {
    ctx.save();
    ctx.font = `42px ${HAND}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(168,36,28,0.92)';
    ctx.translate(w - 14, 84);
    ctx.rotate(-0.04);
    let cs = 42;
    while (cs > 24 && ctx.measureText(data.code).width > w * 0.34) ctx.font = `${(cs -= 2)}px ${HAND}`;
    ctx.fillText(data.code, 0, 0);
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(80,60,40,0.3)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w - 3, h);
}

// The back: blank but for the word 'achterzijde', or J.J.V.'s pencil.
export function drawBack(c, data) {
  if (data.envelope) return drawEnvelopeBack(c);
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  const r = rnd((data.n || 1) * 3 + 1);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(paperCanvas(w, h, data.archive ? { tone: [196, 196, 190], age: 0.6, seed: 2 } : cardTone((data.n || 1) + 1)), 0, 0);
  stains(ctx, w, h, r);
  rules(ctx, w, h, r, { header: false });
  ctx.font = `30px ${TYPE}`;
  typeLine(ctx, data.title || 'achterzijde', 64, 92, r, [90, 80, 70]);
  if (data.body) {
    const f = fit(ctx, data.body, TYPE, w - 128, h - 230, 44, 22, 1.3);
    ctx.font = `${f.size}px ${TYPE}`;
    f.lines.forEach((l, i) => typeLine(ctx, l, 64, 168 + 40 + i * f.lh, r));
  } else if (data.initials) {
    // nothing on the back but who wrote it down
    pencil(ctx, data.initials, w - 300, h - 90, 260, { size: 54, rot: -0.05, r });
  }
  if (data.half) tearEdge(ctx, w, h, r, data.half === 'top' ? 'bottom' : 'top');
}

// Your card, in the house format (spec section 7): the night as a story, with you
// as the one who told it, the date and how long it took, and the one citation.
// d: { kind, place, prov, name, code, desc, recorded, remark, citation }
export function drawFinal(c, d) {
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  const r = rnd(1994);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(paperCanvas(w, h, { tone: [238, 230, 210], age: 0.7, seed: 4 }), 0, 0);
  stains(ctx, w, h, r);
  rules(ctx, w, h, r);
  const left = 64;
  ctx.font = `46px ${TYPE}`;
  typeLine(ctx, `${d.place.toUpperCase()}  (${d.prov})`, left, 92, r);
  ctx.font = `30px ${TYPE}`;
  typeLine(ctx, `${d.kind.toLowerCase()} · verteller: ${d.name}`, left, 142, r, [90, 80, 70]);
  ctx.save();
  ctx.translate(w - 70, 108);
  ctx.rotate(-0.045);
  ctx.font = `50px ${HAND}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(168,36,28,0.92)';
  ctx.fillText(d.code, 0, 0);
  ctx.restore();
  const top = RULE_TOP + LINE - 14;
  const f = fit(ctx, d.desc, TYPE, w - left * 2, 8 * LINE, 42, 28, 1.3);
  ctx.font = `${f.size}px ${TYPE}`;
  const lh = Math.max(f.lh, f.size >= 34 ? LINE * 0.85 : f.lh);
  f.lines.forEach((l, i) => typeLine(ctx, l, left, top + i * lh, r));
  let y = top + f.lines.length * lh + 22;
  ctx.font = `30px ${TYPE}`;
  typeLine(ctx, `Opgetekend: ${d.recorded}.`, left, y, r, [60, 54, 48]);
  pencil(ctx, d.remark, w - 660, Math.min(y + 70, h - 200), 600, { size: 34, rot: -0.035, r });
  ctx.font = `24px ${TYPE}`;
  typeLine(ctx, d.citation, left, h - 66, r, [70, 62, 54]);
}
