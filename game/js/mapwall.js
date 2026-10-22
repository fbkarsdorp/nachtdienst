// The wall map of the Netherlands: drawn once on aged paper from the pipeline's
// geography, then pins go in — the card's place, an answer, a token.
import * as THREE from 'three';
import { makeCanvas, canvasTexture, fixedTexture, paperCanvas } from './textures.js';
import { haversine } from './bundle.js';
import { ROOM } from './room.js';

const FELL = '"IM Fell English SC", Georgia, serif';
const FELL_I = '"IM Fell English", Georgia, serif';
const TYPE = '"Special Elite", "Courier New", monospace';

export const MAP = { cx: ROOM.x1 - 0.035, y: 1.62, z: -1.0, w: 1.28, h: 1.6 };
const CW = 2048, CH = 2560;
const LON0 = 3.2, LON1 = 7.3, LAT0 = 50.7, LAT1 = 53.62;
const KX = Math.cos((52.15 * Math.PI) / 180);
const SCALE = 1868 / ((LON1 - LON0) * KX);
const LEFT = 90, TOP = 236;

export function project(lat, lon) {
  return [LEFT + (lon - LON0) * KX * SCALE, TOP + (LAT1 - lat) * SCALE];
}
export function unproject(px, py) {
  return [LAT1 - (py - TOP) / SCALE, LON0 + (px - LEFT) / (KX * SCALE)];
}

const CITIES = [
  ['Amsterdam', 52.37, 4.9], ['Rotterdam', 51.92, 4.48], ["'s-Gravenhage", 52.08, 4.3], ['Utrecht', 52.09, 5.12],
  ['Groningen', 53.22, 6.57], ['Leeuwarden', 53.2, 5.79], ['Zwolle', 52.51, 6.09], ['Arnhem', 51.98, 5.91],
  ['Nijmegen', 51.84, 5.86], ["'s-Hertogenbosch", 51.69, 5.3], ['Eindhoven', 51.44, 5.48], ['Maastricht', 50.85, 5.69],
  ['Middelburg', 51.5, 3.61], ['Assen', 52.99, 6.56], ['Haarlem', 52.38, 4.64], ['Alkmaar', 52.63, 4.75],
  ['Den Helder', 52.96, 4.76], ['Enschede', 52.22, 6.89], ['Breda', 51.59, 4.78], ['Tilburg', 51.56, 5.09],
  ['Venlo', 51.37, 6.17], ['Roermond', 51.19, 5.99], ['Deventer', 52.25, 6.16], ['Apeldoorn', 52.21, 5.97],
  ['Amersfoort', 52.16, 5.39], ['Leiden', 52.16, 4.49], ['Dordrecht', 51.81, 4.67], ['Kampen', 52.56, 5.91],
  ['Harlingen', 53.17, 5.42], ['Emmen', 52.78, 6.9], ['Hoorn', 52.64, 5.06], ['Winterswijk', 51.97, 6.72],
  ['Sneek', 53.03, 5.66], ['Meppel', 52.7, 6.19], ['Zutphen', 52.14, 6.2], ['Gouda', 52.01, 4.71],
];
const PROV_TINT = {
  Groningen: '#e6c9a8', Friesland: '#d9dcb0', Drenthe: '#e9d9a4', Overijssel: '#e3c0b0', Gelderland: '#cfd9ae',
  Utrecht: '#e8cfa0', 'Noord-Holland': '#d6cfa8', 'Zuid-Holland': '#e5d3b1', Zeeland: '#d3d6b8',
  'Noord-Brabant': '#e7c8a5', Limburg: '#d5d0a7', Flevoland: '#e2dcc0',
};
const PROV_LABEL = {
  Groningen: [53.27, 6.75], Friesland: [53.05, 5.85], Drenthe: [52.88, 6.55], Overijssel: [52.43, 6.45],
  Gelderland: [52.08, 6.0], Utrecht: [52.0, 5.3], 'Noord-Holland': [52.58, 4.68, -Math.PI / 2], 'Zuid-Holland': [51.98, 4.6],
  Zeeland: [51.36, 3.95], 'Noord-Brabant': [51.5, 5.25], Limburg: [51.15, 6.02, -Math.PI / 2], Flevoland: [52.45, 5.6],
};

function pathRings(ctx, rings) {
  ctx.beginPath();
  for (const ring of rings) {
    ring.forEach(([lon, lat], i) => {
      const [x, y] = project(lat, lon);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
}

function drawMap(geo) {
  const c = makeCanvas(CW, CH);
  const ctx = c.getContext('2d');
  ctx.drawImage(paperCanvas(1024, 1280, { tone: [233, 222, 194], age: 1, seed: 12 }), 0, 0, CW, CH);

  // Sea: a cool wash with engraved coastal water-lining.
  ctx.save();
  ctx.beginPath();
  ctx.rect(LEFT - 20, TOP - 20, CW - 2 * LEFT + 40, CH - TOP - 156);
  ctx.clip();
  ctx.fillStyle = 'rgba(150,170,175,0.28)';
  ctx.fillRect(0, 0, CW, CH);
  const allLand = [...geo.provinces.flatMap((p) => p.rings), ...geo.neighbours.flatMap((n) => n.rings)];
  ctx.lineJoin = 'round';
  for (let i = 9; i >= 1; i--) {
    pathRings(ctx, allLand);
    ctx.lineWidth = i * 9;
    ctx.strokeStyle = `rgba(70,95,110,${0.025 + (9 - i) * 0.006})`;
    ctx.stroke();
  }
  // Neighbouring countries, left plain
  for (const n of geo.neighbours) {
    pathRings(ctx, n.rings);
    ctx.fillStyle = 'rgba(214,204,178,1)';
    ctx.fill();
  }
  ctx.globalAlpha = 0.5;
  for (const n of geo.neighbours) {
    pathRings(ctx, n.rings);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(80,70,55,0.5)';
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Provinces, hand-coloured
  for (const p of geo.provinces) {
    pathRings(ctx, p.rings);
    ctx.fillStyle = PROV_TINT[p.name] || '#e0d4b0';
    ctx.fill();
  }
  // a little inner shading along each province edge, as with watercolour
  for (const p of geo.provinces) {
    ctx.save();
    pathRings(ctx, p.rings);
    ctx.clip();
    pathRings(ctx, p.rings);
    ctx.lineWidth = 22;
    ctx.strokeStyle = 'rgba(160,110,60,0.13)';
    ctx.stroke();
    ctx.restore();
  }
  // Lakes and inland water
  for (const w of geo.water) {
    for (let i = 4; i >= 1; i--) {
      ctx.save();
      pathRings(ctx, w.rings);
      ctx.clip();
      pathRings(ctx, w.rings);
      ctx.lineWidth = i * 12;
      ctx.strokeStyle = `rgba(70,95,110,${0.05 + (4 - i) * 0.02})`;
      ctx.stroke();
      ctx.restore();
    }
    pathRings(ctx, w.rings);
    ctx.fillStyle = 'rgba(150,170,175,0.35)';
    ctx.fill();
  }
  // Province borders: dash-dot
  ctx.setLineDash([16, 6, 3, 6]);
  for (const p of geo.provinces) {
    pathRings(ctx, p.rings);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = 'rgba(80,46,30,0.6)';
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Coastline, firm
  for (const p of geo.provinces) {
    pathRings(ctx, p.rings);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(40,36,30,0.55)';
    ctx.stroke();
  }
  // Rivers
  ctx.lineCap = 'round';
  for (const r of geo.rivers) {
    ctx.beginPath();
    r.line.forEach(([lon, lat], i) => {
      const [x, y] = project(lat, lon);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineWidth = ['Rhine', 'Waal', 'Maas', 'Schelde'].includes(r.name) ? 5 : 3;
    ctx.strokeStyle = 'rgba(60,90,110,0.55)';
    ctx.stroke();
  }
  ctx.restore();

  // Graticule
  ctx.save();
  ctx.strokeStyle = 'rgba(60,50,40,0.18)';
  ctx.lineWidth = 1.2;
  ctx.font = `30px ${FELL}`;
  ctx.fillStyle = 'rgba(50,40,30,0.7)';
  for (let lon = 3.5; lon <= 7.01; lon += 0.5) {
    const [x] = project(LAT1, lon);
    ctx.beginPath(); ctx.moveTo(x, TOP); ctx.lineTo(x, CH - 180); ctx.stroke();
    if (lon % 1 === 0) ctx.fillText(`${lon}°`, x - 18, TOP - 18);
  }
  for (let lat = 51; lat <= 53.51; lat += 0.5) {
    const [, y] = project(lat, LON0);
    ctx.beginPath(); ctx.moveTo(LEFT, y); ctx.lineTo(CW - LEFT, y); ctx.stroke();
    if (lat % 1 === 0) ctx.fillText(`${lat}°`, 26, y + 10);
  }
  ctx.restore();

  // Lettering
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(55,70,80,0.75)';
  ctx.font = `italic 64px ${FELL_I}`;
  const sea = (t, lat, lon, rot = 0, size = 64, sp = 22) => {
    const [x, y] = project(lat, lon);
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.font = `italic ${size}px ${FELL_I}`;
    ctx.letterSpacing = `${sp}px`;
    ctx.fillText(t, 0, 0);
    ctx.restore();
  };
  sea('NOORDZEE', 52.75, 3.75, -1.1, 78, 30);
  sea('Waddenzee', 53.3, 5.35, -0.12, 44, 8);
  sea('IJsselmeer', 52.83, 5.33, -0.6, 40, 6);
  ctx.fillStyle = 'rgba(70,60,45,0.55)';
  ctx.font = `46px ${FELL}`;
  ctx.letterSpacing = '18px';
  let [bx, by] = project(51.05, 4.4);
  ctx.fillText('BELGIË', bx, by);
  [bx, by] = project(52.0, 7.05);
  ctx.save(); ctx.translate(bx, by); ctx.rotate(-Math.PI / 2); ctx.fillText('DUITSCHLAND', 0, 0); ctx.restore();
  ctx.fillStyle = 'rgba(80,40,25,0.55)';
  ctx.font = `40px ${FELL}`;
  ctx.letterSpacing = '12px';
  for (const [name, [lat, lon, rot = 0]] of Object.entries(PROV_LABEL)) {
    const [x, y] = project(lat, lon);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.font = `${name === 'Flevoland' || name === 'Utrecht' ? 32 : 40}px ${FELL}`;
    ctx.fillText(name.toUpperCase(), 0, 0);
    ctx.restore();
  }
  ctx.letterSpacing = '0px';
  ctx.restore();

  // Cities
  ctx.save();
  for (const [name, lat, lon] of CITIES) {
    const [x, y] = project(lat, lon);
    ctx.fillStyle = 'rgba(30,24,18,0.85)';
    ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(30,24,18,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.stroke();
    ctx.font = `34px ${FELL_I}`;
    ctx.fillStyle = 'rgba(30,24,18,0.85)';
    ctx.fillText(name, x + 16, y - 10);
  }
  ctx.restore();

  // Frame, title, scale
  ctx.save();
  ctx.strokeStyle = 'rgba(40,30,20,0.85)';
  ctx.lineWidth = 6;
  ctx.strokeRect(LEFT - 24, TOP - 24, CW - 2 * LEFT + 48, CH - TOP - 150);
  ctx.lineWidth = 2;
  ctx.strokeRect(LEFT - 34, TOP - 34, CW - 2 * LEFT + 68, CH - TOP - 130);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(35,26,18,0.92)';
  ctx.font = `100px ${FELL}`;
  ctx.letterSpacing = '14px';
  ctx.fillText('KAART VAN NEDERLAND', CW / 2, 120);
  ctx.letterSpacing = '4px';
  ctx.font = `italic 40px ${FELL_I}`;
  ctx.fillText('ten dienste van het Centraal Sagenarchief  ·  Amsterdam', CW / 2, 172);
  ctx.letterSpacing = '0px';
  const kmPx = SCALE / 111.2;
  const sx = LEFT + 40, sy = CH - 110;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(235,225,200,1)' : 'rgba(35,26,18,0.9)';
    ctx.fillRect(sx + i * 10 * kmPx, sy, 10 * kmPx, 14);
  }
  ctx.strokeRect(sx, sy, 50 * kmPx, 14);
  ctx.font = `30px ${FELL}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(35,26,18,0.9)';
  ctx.fillText('0', sx - 8, sy - 12);
  ctx.fillText('50 KM.', sx + 50 * kmPx - 30, sy - 12);
  ctx.textAlign = 'right';
  ctx.font = `28px ${TYPE}`;
  ctx.fillText('Topografische Dienst — uitg. 1986', CW - LEFT, CH - 96);
  ctx.restore();
  // age: foxing spots and a fold cross
  ctx.save();
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * CW, y = Math.random() * CH, r = 2 + Math.random() * 10;
    ctx.fillStyle = `rgba(140,90,40,${0.05 + Math.random() * 0.1})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(90,70,40,0.12)';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(CW / 2, 0); ctx.lineTo(CW / 2, CH); ctx.moveTo(0, CH / 2); ctx.lineTo(CW, CH / 2); ctx.stroke();
  ctx.restore();
  return c;
}

function flagCanvas(text, { big = false, red = false } = {}) {
  const c = makeCanvas(big ? 160 : 512, big ? 160 : 96);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#efe6d0';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = 'rgba(60,50,40,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);
  ctx.fillStyle = red ? 'rgba(160,32,24,0.95)' : 'rgba(30,26,22,0.95)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (big) {
    ctx.font = `110px "Homemade Apple", cursive`;
    ctx.fillText(text, c.width / 2, c.height / 2 + 10);
  } else {
    let size = 54;
    ctx.font = `${size}px ${TYPE}`;
    while (ctx.measureText(text).width > c.width - 24 && size > 24) ctx.font = `${--size}px ${TYPE}`;
    ctx.fillText(text, c.width / 2, c.height / 2 + 3);
  }
  return c;
}

// Pins share their materials; only geometry and flag textures are their own.
function disposePin(pin) {
  pin.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    if (o.material.map) {
      o.material.map.dispose();
      o.material.dispose();
    }
  });
}

// the grid the archive's dots are counted in, degrees
const CELL = 0.05;

export class WallMap {
  constructor(M, geo, places) {
    this.places = places;
    this.group = new THREE.Group();
    this.group.position.set(MAP.cx, MAP.y, MAP.z);
    this.group.rotation.y = -Math.PI / 2;
    const tex = fixedTexture(drawMap(geo));
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(MAP.w, MAP.h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    this.plane.receiveShadow = true;
    this.group.add(this.plane);
    // frame: dark wooden battens top and bottom, like a school wall map
    const batten = new THREE.MeshStandardMaterial({ color: 0x2a1b10, roughness: 0.6 });
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, MAP.w + 0.08, 16), batten);
      b.rotation.z = Math.PI / 2;
      b.position.set(0, s * (MAP.h / 2 + 0.01), 0.018);
      b.castShadow = true;
      this.group.add(b);
    }
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.42), new THREE.MeshStandardMaterial({ color: 0x3a3226 }));
    cord.position.set(0, MAP.h / 2 + 0.2, 0.01);
    this.group.add(cord);
    // the collector's pencil on the map: lines between the places of the cards being compared
    this.sketchCanvas = makeCanvas(1024, 1280);
    this.sketchTex = canvasTexture(this.sketchCanvas);
    const sketch = new THREE.Mesh(new THREE.PlaneGeometry(MAP.w, MAP.h), new THREE.MeshStandardMaterial({ map: this.sketchTex, transparent: true, depthWrite: false, roughness: 1 }));
    sketch.position.z = 0.0015;
    this.group.add(sketch);
    this.pins = new Map();
    this.anim = [];
    this.pinMats = {
      // grey for the places on the cards, red for yours, black once it is right
      card: new THREE.MeshStandardMaterial({ color: 0x8c8a86, roughness: 0.35, metalness: 0.1 }),
      answer: new THREE.MeshStandardMaterial({ color: 0xa3241b, roughness: 0.35, metalness: 0.1 }),
      token: new THREE.MeshStandardMaterial({ color: 0x0c0b0a, roughness: 0.3, metalness: 0.2 }),
      needle: new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 1, roughness: 0.3, envMap: M.brass.envMap }),
    };
  }

  // Every geocoded story in the archive, a faint dot under the pins (section 3h): one point
  // cloud, one draw call. pts: Float32Array of lat, lon pairs.
  setArchive(pts) {
    const n = pts.length / 2;
    const pos = new Float32Array(n * 3);
    this.cells = new Map();
    for (let i = 0; i < n; i++) {
      const lat = pts[i * 2], lon = pts[i * 2 + 1];
      const v = this.local(lat, lon);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = 0.0012;
      const key = `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`;
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key).push(lat, lon);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dots = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x5a1e16, size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false }));
    dots.renderOrder = 1;
    this.group.add(dots);
    this.dots = dots;
  }

  // how many stories lie within km of a place (for the cluster under the pointer)
  countNear(lat, lon, km = 3) {
    if (!this.cells) return 0;
    let n = 0;
    const r = Math.ceil(km / 111 / CELL) + 1;
    const ci = Math.floor(lat / CELL), cj = Math.floor(lon / CELL);
    for (let a = ci - r; a <= ci + r; a++) {
      for (let b = cj - r; b <= cj + r; b++) {
        const c = this.cells.get(`${a}:${b}`);
        if (!c) continue;
        for (let i = 0; i < c.length; i += 2) if (haversine(lat, lon, c[i], c[i + 1]) <= km) n++;
      }
    }
    return n;
  }

  setSketch(points) {
    const c = this.sketchCanvas;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (points.length < 2) {
      this.sketchTex.needsUpdate = true;
      return;
    }
    const k = c.width / CW;
    const xy = points.map(([lat, lon]) => project(lat, lon).map((v) => v * k));
    ctx.lineCap = 'round';
    // graphite: a few slightly offset passes, as a hand draws with a ruler
    for (let pass = 0; pass < 3; pass++) {
      ctx.strokeStyle = `rgba(38,38,46,${0.7 - pass * 0.18})`;
      ctx.lineWidth = 4.5 - pass * 1.2;
      ctx.beginPath();
      for (let i = 0; i < xy.length; i++) {
        for (let j = i + 1; j < xy.length; j++) {
          const j1 = (pass - 1) * 0.8;
          ctx.moveTo(xy[i][0] + j1, xy[i][1] - j1);
          ctx.lineTo(xy[j][0] - j1, xy[j][1] + j1);
        }
      }
      ctx.stroke();
    }
    this.sketchTex.needsUpdate = true;
  }

  local(lat, lon) {
    const [px, py] = project(lat, lon);
    return new THREE.Vector3((px / CW - 0.5) * MAP.w, (0.5 - py / CH) * MAP.h, 0);
  }

  uvToLatLon(uv) {
    return unproject(uv.x * CW, (1 - uv.y) * CH);
  }

  nearest(lat, lon) {
    let best = null, bd = 1e9;
    for (const p of this.places) {
      const d = (p[1] - lat) ** 2 + ((p[2] - lon) * KX) ** 2;
      // villages with people in them win over hamlets at the same spot
      const s = d * (p[4] > 0 ? 0.6 : 1);
      if (s < bd) { bd = s; best = p; }
    }
    if (!best) return null;
    return { name: best[0], prov: best[3], lat: best[1], lon: best[2], km: haversine(lat, lon, best[1], best[2]) };
  }

  addPin(id, lat, lon, kind = 'card', label = null, { animate = true } = {}) {
    this.removePin(id);
    const pin = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(kind === 'card' ? 0.0105 : 0.012, 16, 12), this.pinMats[kind]);
    const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0006, 0.04, 6), this.pinMats.needle);
    needle.rotation.x = Math.PI / 2;
    needle.position.z = -0.012;
    head.position.z = 0.012;
    head.castShadow = true;
    pin.add(head, needle);
    if (label) {
      const big = kind === 'token';
      const tex = canvasTexture(flagCanvas(label, { big, red: kind === 'answer' }));
      const fw = big ? 0.05 : 0.11, fh = big ? 0.05 : 0.021;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }));
      flag.position.set(fw / 2 + 0.006, fh / 2 + 0.006, 0.004);
      flag.rotation.z = (Math.random() - 0.5) * 0.12;
      flag.castShadow = true;
      pin.add(flag);
    }
    const p = this.local(lat, lon);
    pin.position.copy(p);
    pin.rotation.set((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, 0);
    pin.userData = { id, kind, lat, lon, label, base: p.clone() };
    this.group.add(pin);
    this.pins.set(id, pin);
    if (animate) {
      pin.position.z = 0.09;
      this.anim.push({ pin, t: 0, kind: 'in' });
    }
    return pin;
  }

  // the red pin turns black when it is right
  setPinKind(id, kind) {
    const p = this.pins.get(id);
    if (!p) return;
    p.children[0].material = this.pinMats[kind];
    p.userData.kind = kind;
  }

  removePin(id) {
    const p = this.pins.get(id);
    if (p) {
      this.group.remove(p);
      this.pins.delete(id);
      disposePin(p);
    }
  }

  dropPin(id) {
    const p = this.pins.get(id);
    if (!p) return;
    this.pins.delete(id);
    this.anim.push({ pin: p, t: 0, kind: 'fall', vy: 0 });
  }

  worldPos(lat, lon) {
    return this.group.localToWorld(this.local(lat, lon));
  }

  update(dt) {
    this.anim = this.anim.filter((a) => {
      a.t += dt;
      if (a.kind === 'in') {
        const k = Math.min(1, a.t / 0.35);
        a.pin.position.z = 0.09 * (1 - k) ** 3;
        return k < 1;
      }
      if (a.kind === 'fall') {
        a.vy -= 9.8 * dt;
        a.pin.position.y += a.vy * dt;
        a.pin.position.z += 0.25 * dt;
        a.pin.rotation.x += dt * 6;
        if (a.pin.position.y < -MAP.y - 0.2) {
          this.group.remove(a.pin);
          disposePin(a.pin);
          return false;
        }
        return true;
      }
      return false;
    });
  }
}
