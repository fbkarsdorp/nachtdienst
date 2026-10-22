// A filing card in the room: two faces, a little thickness, and a way of moving
// that feels like paper being picked up and put down.
import * as THREE from 'three';
import { CARD_W, CARD_H, drawFront, drawBack, drawTab } from './cardface.js';
import { makeCanvas, canvasTexture } from './textures.js';
import { ease } from './motion.js';

// a little larger than life, so a card can be scanned from the chair
export const CARD_SIZE = { w: 0.28, h: 0.169 };
const edgeMat = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.95 });
// a card glows a little so it reads in the dark; held up to read, it is lit evenly
const EMIT_LYING = new THREE.Color(0x433d36);
const EMIT_READING = new THREE.Color().setRGB(0.92, 0.88, 0.78, THREE.LinearSRGBColorSpace);
// every card move takes this many times the time it asks for (one place to slow them all)
export const CARD_PACE = 1.0;

// the index tab on a card's top edge, seen when it stands in its drawer
const TAB = { w: 0.13, h: 0.032 };

// On a touch screen a card is never shown wider than about 750 pixels (held up to read,
// either way round), so its faces are kept that small: drawn full size on a shared sheet,
// then copied down. A torn card's dozen halves at full size would take a phone's memory.
const SHARP = (() => {
  if (typeof matchMedia !== 'function' || !matchMedia('(pointer: coarse)').matches) return 1;
  const L = Math.max(screen.width, screen.height), S = Math.min(screen.width, screen.height);
  // widest reading: lying (liftPose, 68 % across or 64 % up) or upright (94 % across); the
  // renderer's pixel ratio is capped at 1.75 (main.js); a little to spare for the fan's close look
  const css = Math.max(Math.min(0.68 * L, 0.64 * S * (CARD_W / CARD_H)), 0.94 * S);
  return THREE.MathUtils.clamp((css * Math.min(window.devicePixelRatio || 1, 1.75) * 1.15) / CARD_W, 0.5, 1);
})();
const sheets = new Map();
function drawOn(draw, c, data, w, h) {
  if (c.width === w) return draw(c, data);
  const key = `${w}x${h}`;
  if (!sheets.has(key)) sheets.set(key, makeCanvas(w, h));
  const s = sheets.get(key);
  s.linkRect = null;
  draw(s, data);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(s, 0, 0, c.width, c.height);
  const k = c.width / w, b = s.linkRect;
  c.linkRect = b ? { x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k } : null;
}

export class CardObj {
  // half: 'top' or 'bottom' for the two pieces of a torn card, half the height
  // tab: () => { place, year, code } for a card that stands in a drawer with a tab
  // res: the canvas at this fraction of a card's (an envelope needs less); flap: an
  // envelope's flap on its back, hinged at the top edge, that can open
  constructor(n, view, { half = null, tab = null, res = 1, flap = false } = {}) {
    this.n = n;
    this.view = view; // () => { front, back }
    this.half = half;
    this.size = { w: CARD_SIZE.w, h: half ? CARD_SIZE.h / 2 : CARD_SIZE.h };
    this.group = new THREE.Group();
    // the size it is drawn at, and the size it is kept at (SHARP)
    this.drawn = { w: Math.round(CARD_W * res), h: Math.round((half ? CARD_H / 2 : CARD_H) * res) };
    this.frontCanvas = makeCanvas(Math.round(this.drawn.w * SHARP), Math.round(this.drawn.h * SHARP));
    this.backCanvas = makeCanvas(Math.round(this.drawn.w * SHARP), Math.round(this.drawn.h * SHARP));
    this.frontTex = canvasTexture(this.frontCanvas);
    this.backTex = canvasTexture(this.backCanvas);
    const geo = new THREE.PlaneGeometry(this.size.w, this.size.h);
    // a little self-light so a card stays legible at the edge of the lamp
    const mat = (t) => new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: EMIT_LYING, roughness: 0.92, alphaTest: 0.5 });
    this.front = new THREE.Mesh(geo, mat(this.frontTex));
    this.back = new THREE.Mesh(geo, mat(this.backTex));
    this.front.position.z = 0.0004;
    this.back.position.z = -0.0004;
    this.back.rotation.y = Math.PI;
    this.front.castShadow = this.back.castShadow = true;
    this.front.receiveShadow = this.back.receiveShadow = true;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(this.size.w * 0.995, this.size.h * 0.995, 0.0006), edgeMat);
    edge.castShadow = true;
    this.edge = edge;
    this.inner = new THREE.Group();
    this.inner.add(this.front, this.back, edge);
    this.group.add(this.inner);
    this.front.userData.card = this;
    this.back.userData.card = this;
    edge.userData.card = this;
    if (tab) {
      // staggered along the top edge, as tabs are, so they do not hide each other
      this.tabView = tab;
      this.tabCanvas = makeCanvas(512, 128);
      this.tabTex = canvasTexture(this.tabCanvas);
      const t = new THREE.MeshStandardMaterial({ map: this.tabTex, emissiveMap: this.tabTex, emissive: EMIT_LYING, roughness: 0.92 });
      this.tab = new THREE.Mesh(new THREE.PlaneGeometry(TAB.w, TAB.h), t);
      this.tab.position.set([-0.075, 0, 0.075][n % 3], this.size.h / 2 + TAB.h / 2 - 0.002, 0.0003);
      this.tab.userData.card = this;
      this.tab.visible = false;
      this.inner.add(this.tab);
    }
    if (flap) {
      const { w, h } = this.size;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, -h * 0.46, 0], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0.54], 2));
      g.computeVertexNormals();
      this.flapMat = new THREE.MeshStandardMaterial({ color: 0xc8a76e, emissive: 0x2c2414, roughness: 0.95, side: THREE.DoubleSide });
      const tri = new THREE.Mesh(g, this.flapMat);
      tri.castShadow = true;
      this.flap = new THREE.Group();
      this.flap.position.set(0, h / 2, -0.0009);
      this.flap.add(tri);
      tri.userData.card = this;
      this.inner.add(this.flap);
      this.flapOpen = 0;
      this.flapTarget = 0;
    }
    // dimmed (an envelope not to be taken yet)
    this.tint = 1;
    // the scene; a card anywhere else (standing in a drawer) is moved in its parent's space
    this.root = null;
    // a pose to keep to while nothing moves it (in the hand)
    this.follow = null;
    this.flipped = false;
    this.flipAngle = 0;
    this.flipT = 0;
    this.readMix = 0;
    this.readTarget = 0;
    this.tween = null;
    this.redraw();
  }

  redraw() {
    const v = this.view();
    drawOn(drawFront, this.frontCanvas, v.front, this.drawn.w, this.drawn.h);
    drawOn(drawBack, this.backCanvas, v.back, this.drawn.w, this.drawn.h);
    if (this.tab) {
      drawTab(this.tabCanvas, this.tabView());
      this.tabTex.needsUpdate = true;
    }
    this.link = this.frontCanvas.linkRect ? { url: v.front.url, rect: this.frontCanvas.linkRect } : null;
    this.frontTex.needsUpdate = true;
    this.backTex.needsUpdate = true;
    // a torn piece is not a rectangle; the edge box would show
    this.edge.visible = !this.half;
  }

  // the Verhalenbank address when a ray hits the stamp on the front, else null
  linkAt(hit) {
    if (!this.link || hit?.object !== this.front || !hit.uv) return null;
    const x = hit.uv.x * this.frontCanvas.width, y = (1 - hit.uv.y) * this.frontCanvas.height;
    const b = this.link.rect;
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h ? this.link.url : null;
  }

  // held up to read, a card is lit evenly rather than by whatever lamp is near
  setReading(on) { this.readTarget = on ? 1 : 0; }

  flip() {
    this.flipped = !this.flipped;
  }

  // Poses are in the world, unless local: then in the space of whatever holds the card (a
  // drawer). A card given a world pose comes out of the drawer first.
  out(local) {
    this.follow = null;
    this.setOnTop(false);
    if (!local && this.root && this.group.parent !== this.root) this.root.attach(this.group);
  }

  place(pos, quat, { local = false, scale = 1 } = {}) {
    this.out(local);
    this.group.position.copy(pos);
    this.group.quaternion.copy(quat);
    this.group.scale.setScalar(scale);
    this.tween = null;
  }

  moveTo(pos, quat, dur = 0.5, { arc = 0, delay = 0, onDone, local = false, scale = 1 } = {}) {
    this.out(local);
    this.tween = {
      p0: this.group.position.clone(), q0: this.group.quaternion.clone(), s0: this.group.scale.x, s1: scale,
      p1: pos.clone(), q1: quat.clone(), t: -delay * CARD_PACE, dur: dur * CARD_PACE, arc, onDone,
    };
  }

  setTint(k) {
    this.tint = k;
    this.applyColor();
    if (this.flapMat) this.flapMat.color.setHex(0xc8a76e).multiplyScalar(k);
  }

  applyColor() {
    for (const m of [this.front.material, this.back.material]) {
      m.color.setScalar((1 - 0.85 * this.readMix) * this.tint);
      m.emissive.lerpColors(EMIT_LYING, EMIT_READING, this.readMix).multiplyScalar(0.4 + 0.6 * this.tint);
    }
  }

  // drawn over everything, as a card in the hand is
  setOnTop(on) {
    for (const m of [this.front.material, this.back.material]) m.depthTest = !on;
    this.front.renderOrder = this.back.renderOrder = on ? 20 : 0;
    this.edge.visible = !on && !this.half;
  }

  update(dt) {
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt;
      if (tw.t >= 0) {
        const k = ease(Math.min(1, tw.t / tw.dur));
        this.group.position.lerpVectors(tw.p0, tw.p1, k);
        this.group.position.y += Math.sin(k * Math.PI) * tw.arc;
        this.group.quaternion.slerpQuaternions(tw.q0, tw.q1, k);
        this.group.scale.setScalar(tw.s0 + (tw.s1 - tw.s0) * k);
        if (k >= 1) {
          this.tween = null;
          tw.onDone?.();
        }
      }
    }
    if (this.follow && !this.tween) {
      const f = this.follow();
      const k = 1 - Math.exp(-dt * 18);
      this.group.position.lerp(f.pos, k);
      this.group.quaternion.slerp(f.q, k);
    }
    // the tab shows while the card stands in a drawer
    if (this.tab) this.tab.visible = !!this.root && !!this.group.parent && this.group.parent !== this.root;
    if (Math.abs(this.readTarget - this.readMix) > 0.001) {
      this.readMix += (this.readTarget - this.readMix) * Math.min(1, dt * 3.5);
      this.applyColor();
    }
    if (this.flap && this.flapOpen !== this.flapTarget) {
      const d = this.flapTarget - this.flapOpen;
      this.flapOpen = Math.abs(d) < 0.01 ? this.flapTarget : this.flapOpen + Math.sign(d) * Math.min(Math.abs(d), dt * 2.2);
      // open, it stands over the top edge, folded back a little behind the envelope
      this.flap.rotation.x = Math.PI * 0.86 * ease(this.flapOpen);
    }
    // a turn takes most of a second, eased at both ends
    const want = this.flipped ? 1 : 0;
    if (this.flipT !== want) this.flipT = want > this.flipT ? Math.min(1, this.flipT + dt / 0.8) : Math.max(0, this.flipT - dt / 0.8);
    this.flipAngle = Math.PI * ease(this.flipT);
    this.inner.rotation.y = this.flipAngle;
    // a sheet of card bends a little as it turns
    this.inner.position.z = Math.sin(this.flipAngle) * 0.02;
  }

  dispose() {
    this.frontTex.dispose();
    this.backTex.dispose();
    this.front.material.dispose();
    this.back.material.dispose();
    this.front.geometry.dispose();
    this.edge.geometry.dispose();
    if (this.flap) {
      this.flapMat.dispose();
      this.flap.children[0].geometry.dispose();
    }
    if (this.tab) {
      this.tabTex.dispose();
      this.tab.material.dispose();
      this.tab.geometry.dispose();
    }
  }
}
