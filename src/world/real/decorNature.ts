// Realistic island objects (Nature). Each fits one 1×1 cell, centered on the origin, base at y = 0, facing +z.
// Everything is procedural: leaf / petal / needle textures are painted pixel by pixel once (cached), trees are
// lofted trunks + branches covered with alpha-tested foliage cards (vertex colored, volumetric normals).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { loft } from '../../creatures/real/loft';
import { fbm, mix, noise2, rng, smooth } from '../../creatures/real/noise';
import { bake } from '../../creatures/real/textures';
import { pbr } from './materials';

type RGB = [number, number, number];
type Rng = () => number;
type Rect = [number, number, number, number];

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const TAU = Math.PI * 2;
const shade = (c: RGB, k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rr = (r: Rng, a: number, b: number) => a + (b - a) * r();
const pick = <T,>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];

function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ── Pixel painter for the foliage textures ─────────────────────────────────────────

class Paint {
  readonly data: Uint8Array;
  constructor(
    readonly W: number,
    readonly H: number,
    bg: RGB,
  ) {
    this.data = new Uint8Array(W * H * 4);
    // Transparent pixels keep a leaf-like color, so mipmaps don't darken the edges.
    for (let i = 0; i < W * H; i++) {
      this.data[i * 4] = bg[0];
      this.data[i * 4 + 1] = bg[1];
      this.data[i * 4 + 2] = bg[2];
    }
  }
  px(x: number, y: number, c: RGB) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = (y * this.W + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = 255;
  }
  /** A shape along a segment from (x, y): fn(t along 0..1, s across -1..1) gives a color or null (outside). */
  shape(x: number, y: number, ang: number, len: number, half: number, fn: (t: number, s: number) => RGB | null) {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const ex = x + ca * len;
    const ey = y + sa * len;
    const x0 = Math.max(0, Math.floor(Math.min(x, ex) - half - 1));
    const x1 = Math.min(this.W - 1, Math.ceil(Math.max(x, ex) + half + 1));
    const y0 = Math.max(0, Math.floor(Math.min(y, ey) - half - 1));
    const y1 = Math.min(this.H - 1, Math.ceil(Math.max(y, ey) + half + 1));
    for (let py = y0; py <= y1; py++)
      for (let px = x0; px <= x1; px++) {
        const dx = px + 0.5 - x;
        const dy = py + 0.5 - y;
        const t = (dx * ca + dy * sa) / len;
        if (t < 0 || t > 1) continue;
        const s = (-dx * sa + dy * ca) / half;
        if (s < -1 || s > 1) continue;
        const c = fn(t, s);
        if (c) this.px(px, py, c);
      }
  }
  line(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, c: RGB) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 0.5) return;
    const half = Math.max(w0, w1) / 2 + 0.5;
    this.shape(x0, y0, Math.atan2(y1 - y0, x1 - x0), len, half, (t, s) => {
      const w = mix(w0, w1, t) / 2 / half;
      return Math.abs(s) <= w ? shade(c, 0.8 + 0.35 * (1 - Math.abs(s) / Math.max(w, 1e-3))) : null;
    });
  }
  disc(x: number, y: number, rad: number, fn: (d: number, a: number) => RGB | null) {
    for (let py = Math.max(0, Math.floor(y - rad)); py <= Math.min(this.H - 1, Math.ceil(y + rad)); py++)
      for (let px = Math.max(0, Math.floor(x - rad)); px <= Math.min(this.W - 1, Math.ceil(x + rad)); px++) {
        const dx = px + 0.5 - x;
        const dy = py + 0.5 - y;
        const d = Math.hypot(dx, dy) / rad;
        if (d > 1) continue;
        const c = fn(d, Math.atan2(dy, dx));
        if (c) this.px(px, py, c);
      }
  }
  texture(): THREE.DataTexture {
    const t = new THREE.DataTexture(this.data, this.W, this.H, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  }
}

/** Shading of one leaf: two halves folded along the midrib, side veins, darker edge. */
function leafPixel(col: RGB, widthAt: (t: number) => number, serrate = 0) {
  return (t: number, s: number): RGB | null => {
    let w = widthAt(t);
    if (serrate) w *= 1 - serrate * Math.abs(Math.sin(t * 46));
    const a = Math.abs(s);
    if (a > w) return null;
    const e = a / Math.max(w, 1e-3);
    let k = s > 0 ? 1.04 : 0.84;
    if (e < 0.1 && t < 0.92) k *= 1.2;
    else if ((((t * 7 - e * 2.4) % 1) + 1) % 1 < 0.08) k *= 1.07;
    k *= 0.82 + 0.26 * (1 - e * e);
    return shade(col, k);
  };
}
const ellipticLeaf = (t: number) => Math.pow(Math.sin(Math.PI * Math.min(1, t)), 0.75);
const lanceLeaf = (t: number) => Math.pow(Math.sin(Math.PI * Math.pow(Math.min(1, t), 0.6)), 1.1);

type SprayOpts = {
  seed: number;
  leaves: number;
  len: [number, number];
  wid: number;
  color: (r: Rng) => RGB;
  twig: RGB;
  bg: RGB;
  twigs?: number;
  shape?: (t: number) => number;
  serrate?: number;
};
/** A spray of twigs covered with leaves (one card = dozens of leaves). */
function sprayTexture(o: SprayOpts): THREE.DataTexture {
  const S = 256;
  const p = new Paint(S, S, o.bg);
  const r = rng(o.seed);
  const n = o.twigs ?? 5;
  const twigs: [number, number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.8;
    const x0 = S / 2 + (r() - 0.5) * S * 0.12;
    const y0 = S / 2 + (r() - 0.5) * S * 0.12;
    const L = S * (0.3 + r() * 0.12);
    const x1 = x0 + Math.cos(a) * L;
    const y1 = y0 + Math.sin(a) * L;
    p.line(x0, y0, x1, y1, 3, 1.2, o.twig);
    twigs.push([x0, y0, x1, y1]);
  }
  for (let i = 0; i < o.leaves; i++) {
    const [x0, y0, x1, y1] = twigs[i % n];
    const t = i < n ? 1 : 0.15 + r() * 0.85;
    const bx = mix(x0, x1, t);
    const by = mix(y0, y1, t);
    const ta = Math.atan2(y1 - y0, x1 - x0);
    const ang = i < n ? ta : ta + (i % 2 ? 1 : -1) * (0.35 + r() * 0.75);
    const avail = S * 0.49 - Math.hypot(bx - S / 2, by - S / 2);
    const L = Math.min(S * rr(r, o.len[0], o.len[1]), avail);
    if (L < 5) continue;
    p.shape(bx, by, ang, L, L * o.wid * 0.5, leafPixel(o.color(r), o.shape ?? ellipticLeaf, o.serrate));
  }
  return p.texture();
}

const texCache = new Map<string, THREE.DataTexture>();
function tex(key: string, make: () => THREE.DataTexture): THREE.DataTexture {
  let t = texCache.get(key);
  if (!t) {
    t = make();
    texCache.set(key, t);
  }
  return t;
}

const TEX = {
  green: () =>
    sprayTexture({
      seed: 3,
      leaves: 70,
      len: [0.12, 0.17],
      wid: 0.48,
      twig: [86, 70, 52],
      bg: [70, 100, 45],
      color: (r) => lerp3([62, 104, 40], [104, 140, 52], r() * r()),
    }),
  apple: () =>
    sprayTexture({
      seed: 5,
      leaves: 64,
      len: [0.13, 0.18],
      wid: 0.5,
      twig: [96, 78, 60],
      bg: [60, 95, 40],
      serrate: 0.04,
      color: (r) => lerp3([52, 92, 36], [92, 128, 50], r() * r()),
    }),
  autumn: () =>
    sprayTexture({
      seed: 7,
      leaves: 66,
      len: [0.12, 0.17],
      wid: 0.55,
      twig: [80, 58, 42],
      bg: [190, 90, 30],
      serrate: 0.05,
      color: (r) => pick(r, [[196, 58, 26], [214, 96, 28], [226, 140, 36], [168, 40, 26], [222, 172, 56], [150, 70, 34], [206, 78, 30]] as RGB[]),
    }),
  bamboo: () =>
    sprayTexture({
      seed: 9,
      leaves: 30,
      len: [0.26, 0.36],
      wid: 0.17,
      twigs: 4,
      twig: [130, 128, 70],
      bg: [90, 130, 55],
      shape: lanceLeaf,
      color: (r) => lerp3([74, 118, 46], [126, 160, 66], r()),
    }),
  box: () =>
    sprayTexture({
      seed: 13,
      leaves: 210,
      len: [0.05, 0.075],
      wid: 0.6,
      twigs: 9,
      twig: [90, 80, 50],
      bg: [40, 75, 30],
      color: (r) => (r() < 0.12 ? [100, 140, 52] : lerp3([30, 62, 26], [58, 96, 38], r())),
    }),
  blossom: blossomTexture,
  petals: petalsTexture,
  litter: litterTexture,
  spruce: spruceTexture,
  palm: palmTexture,
  sunLeaf: sunLeafTexture,
  pumpkinLeaf: pumpkinLeafTexture,
  sunHead: sunHeadTexture,
  flowers: flowerAtlas,
};
type TexName = keyof typeof TEX;

function blossomTexture(): THREE.DataTexture {
  const S = 256;
  const p = new Paint(S, S, [240, 180, 200]);
  const r = rng(17);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + r() * 0.6;
    const L = S * (0.3 + r() * 0.12);
    p.line(S / 2, S / 2, S / 2 + Math.cos(a) * L, S / 2 + Math.sin(a) * L, 3.2, 1.4, [72, 46, 42]);
  }
  // A few young bronze leaves.
  for (let i = 0; i < 8; i++) {
    const a = r() * TAU;
    const d = Math.sqrt(r()) * S * 0.36;
    p.shape(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, r() * TAU, S * 0.08, S * 0.022, leafPixel(lerp3([120, 100, 50], [150, 90, 60], r()), ellipticLeaf));
  }
  for (let i = 0; i < 46; i++) {
    const a = r() * TAU;
    const d = Math.sqrt(r()) * S * 0.4;
    const cx = S / 2 + Math.cos(a) * d;
    const cy = S / 2 + Math.sin(a) * d;
    if (r() < 0.15) {
      // Bud.
      p.disc(cx, cy, S * 0.014, (dd) => shade([222, 98, 140], 1.1 - dd * 0.3));
      continue;
    }
    const R = S * rr(r, 0.035, 0.05);
    const tipCol: RGB = lerp3([255, 232, 240], [250, 196, 214], r());
    const baseCol: RGB = [234, 128, 164];
    const a0 = r() * TAU;
    for (let k = 0; k < 5; k++) {
      p.shape(cx, cy, a0 + (k / 5) * TAU, R, R * 0.42, (t, s) => {
        const w = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.08)), 0.5);
        if (Math.abs(s) > w) return null;
        if (t > 0.86 && Math.abs(s) < 0.16) return null; // notched tip
        return shade(lerp3(baseCol, tipCol, smooth(0.0, 0.55, t)), 0.88 + 0.14 * (1 - Math.abs(s)));
      });
    }
    p.disc(cx, cy, R * 0.28, (dd) => shade([196, 66, 104], 1.05 - dd * 0.3));
    for (let k = 0; k < 7; k++) {
      const sa = r() * TAU;
      p.disc(cx + Math.cos(sa) * R * 0.3, cy + Math.sin(sa) * R * 0.3, 1.2, () => [250, 224, 150]);
    }
  }
  return p.texture();
}

function petalsTexture(): THREE.DataTexture {
  const S = 256;
  const p = new Paint(S, S, [245, 190, 210]);
  const r = rng(19);
  for (let i = 0; i < 90; i++) {
    const a = r() * TAU;
    const d = Math.sqrt(r()) * S * 0.46;
    const L = S * rr(r, 0.035, 0.05);
    p.shape(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, r() * TAU, L, L * 0.4, (t, s) => {
      const w = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)), 0.5);
      if (Math.abs(s) > w || (t > 0.85 && Math.abs(s) < 0.18)) return null;
      return shade(lerp3([236, 150, 180], [252, 222, 232], t), 0.92 + r() * 0.08);
    });
  }
  return p.texture();
}

function litterTexture(): THREE.DataTexture {
  const S = 256;
  const p = new Paint(S, S, [190, 100, 40]);
  const r = rng(23);
  for (let i = 0; i < 40; i++) {
    const a = r() * TAU;
    const d = Math.sqrt(r()) * S * 0.42;
    const L = S * rr(r, 0.06, 0.09);
    const col = pick(r, [[196, 58, 26], [214, 96, 28], [226, 140, 36], [168, 40, 26], [222, 172, 56], [120, 70, 34]] as RGB[]);
    p.shape(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, r() * TAU, L, L * 0.28, leafPixel(col, ellipticLeaf, 0.05));
  }
  return p.texture();
}

/** A spruce branch: u runs from the trunk (left) to the tip (right). */
function spruceTexture(): THREE.DataTexture {
  const S = 256;
  const p = new Paint(S, S, [38, 66, 44]);
  const r = rng(11);
  const cy = S / 2;
  const needles = (x0: number, y0: number, x1: number, y1: number, tipK: number, dens = 2.2) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const a = Math.atan2(y1 - y0, x1 - x0);
    for (let d = 0; d < len; d += dens) {
      const t = d / len;
      const x = x0 + Math.cos(a) * d;
      const y = y0 + Math.sin(a) * d;
      for (const side of [-1, 1]) {
        const na = a + side * (0.55 + r() * 0.35);
        const nl = (8 + r() * 4) * (1 - t * 0.35);
        const fresh = smooth(0.55, 1, t) * tipK;
        const col = lerp3(lerp3([30, 60, 42], [52, 92, 58], r()), [96, 136, 70], fresh * 0.8);
        p.line(x, y, x + Math.cos(na) * nl, y + Math.sin(na) * nl, 1.7, 0.8, col);
      }
    }
  };
  const twigCol: RGB = [96, 72, 52];
  const sides: [number, number, number, number][] = [];
  for (let x = 12; x < S - 16; x += 13 + r() * 6) {
    const env = 1 - x / S;
    for (const side of [-1, 1]) {
      const L = S * 0.4 * (0.25 + 0.75 * env) * (0.75 + r() * 0.25);
      const ang = side * (0.7 + r() * 0.3);
      sides.push([x, cy, x + Math.cos(ang) * L, cy + Math.sin(ang) * L]);
    }
  }
  for (const [x0, y0, x1, y1] of sides) p.line(x0, y0, x1, y1, 2, 1, twigCol);
  for (const [x0, y0, x1, y1] of sides) needles(x0, y0, x1, y1, 0.8);
  p.line(0, cy, S, cy, 4.5, 1.5, twigCol);
  needles(0, cy, S - 2, cy, 1, 2);
  return p.texture();
}

/** A palm frond: rachis along u, leaflets slanted toward the tip. */
function palmTexture(): THREE.DataTexture {
  const S = 256;
  const p = new Paint(S, S, [70, 105, 45]);
  const r = rng(21);
  const cy = S / 2;
  for (let x = 6; x < S - 3; x += 4.6) {
    const t = x / S;
    for (const side of [-1, 1]) {
      const L = S * 0.5 * Math.pow(Math.sin(Math.PI * (0.1 + 0.88 * t)), 0.65) * (0.82 + r() * 0.18);
      if (L < 6) continue;
      const ang = side * (1.0 - 0.35 * t + (r() - 0.5) * 0.12);
      const brown = r() < 0.08 ? 0.6 : 0;
      const col = lerp3(lerp3([58, 98, 38], [96, 132, 52], r()), [150, 130, 70], brown);
      p.shape(x, cy, ang, L, 1.8 + (1 - t) * 1.2, leafPixel(col, (u) => Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.97 + 0.03)), 0.45)));
    }
  }
  p.line(0, cy, S, cy, 5, 1.5, [168, 160, 92]);
  return p.texture();
}

/** A single heart-shaped, toothed leaf (sunflower), attached at the bottom middle. */
function sunLeafTexture(): THREE.DataTexture {
  const S = 256;
  const p = new Paint(S, S, [60, 100, 36]);
  p.shape(S / 2, S * 0.02, Math.PI / 2, S * 0.96, S * 0.46, leafPixel([66, 112, 40], (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.85), 0.05));
  return p.texture();
}

/** A five-lobed pumpkin leaf with pale mottling along the veins, centered. */
function pumpkinLeafTexture(): THREE.DataTexture {
  const S = 256;
  const p = new Paint(S, S, [50, 86, 36]);
  const lobes = [Math.PI / 2, Math.PI / 2 + 1.26, Math.PI / 2 - 1.26, Math.PI / 2 + 2.5, Math.PI / 2 - 2.5];
  p.disc(S / 2, S / 2, S * 0.49, (d, a) => {
    const lobe = Math.pow(Math.abs(Math.cos(2.5 * (a - Math.PI / 2))), 0.7);
    const R = (0.6 + 0.4 * lobe) * (1 - 0.05 * Math.abs(Math.sin(a * 34)));
    if (d > R) return null;
    let vein = 9;
    for (const l of lobes) {
      let da = Math.abs(a - l) % TAU;
      if (da > Math.PI) da = TAU - da;
      vein = Math.min(vein, da * d);
    }
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    const mottle = smooth(0.55, 0.7, fbm(x * 6 + 3, y * 6, 77, 3)) * smooth(0.12, 0.03, vein);
    let c: RGB = lerp3([42, 78, 32], [70, 110, 44], fbm(x * 4, y * 4, 78, 3));
    c = lerp3(c, [150, 170, 120], mottle * 0.6);
    if (vein < 0.012) c = shade(c, 1.35);
    if (d > R - 0.03) c = shade(c, 0.85);
    return c;
  });
  return p.texture();
}

/** The face of a sunflower: Fibonacci disc of seeds, two layers of golden ray petals. */
function sunHeadTexture(): THREE.DataTexture {
  const S = 256;
  const p = new Paint(S, S, [220, 160, 30]);
  const r = rng(31);
  const c = S / 2;
  const R = S / 2 - 1;
  for (const layer of [0, 1]) {
    const n = 21;
    for (let k = 0; k < n; k++) {
      const a = ((k + layer * 0.5) / n) * TAU + (r() - 0.5) * 0.1;
      const L = R * rr(r, 0.58, 0.66);
      const base = R * 0.34;
      const col: RGB = lerp3([238, 166, 18], [252, 204, 44], r());
      const k0 = layer ? 1 : 0.8;
      p.shape(c + Math.cos(a) * base, c + Math.sin(a) * base, a, L, L * 0.15, (t, s) => {
        const w = Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.8))), 0.55);
        if (Math.abs(s) > w) return null;
        const vein = 1 - 0.1 * Math.pow(Math.sin(s * Math.PI * 2.5), 2);
        return shade(lerp3([214, 120, 20], col, smooth(0, 0.3, t)), k0 * vein * (0.9 + 0.12 * (1 - Math.abs(s))));
      });
    }
  }
  p.disc(c, c, R * 0.4, (d) => lerp3(lerp3([88, 84, 34], [58, 34, 16], smooth(0.1, 0.4, d)), [132, 82, 22], smooth(0.75, 1, d)));
  const N = 420;
  for (let n = 0; n < N; n++) {
    const rad = R * 0.39 * Math.sqrt(n / N);
    const th = n * 2.39996;
    const t = rad / (R * 0.39);
    const col = lerp3([70, 52, 22], [118, 70, 24], t);
    p.disc(c + Math.cos(th) * rad, c + Math.sin(th) * rad, 2.3, (d) => (d < 0.85 ? shade(col, 1.25 - d * 0.6) : [36, 22, 10]));
  }
  return p.texture();
}

/** 2×2 atlas of flower heads seen from above: daisy, pink cosmos, marigold, purple aster. */
const FLOWER: Record<'daisy' | 'cosmos' | 'marigold' | 'aster', Rect> = {
  daisy: [0, 0, 0.5, 0.5],
  cosmos: [0.5, 0, 1, 0.5],
  marigold: [0, 0.5, 0.5, 1],
  aster: [0.5, 0.5, 1, 1],
};
function flowerAtlas(): THREE.DataTexture {
  const S = 512;
  const p = new Paint(S, S, [200, 200, 160]);
  const r = rng(41);
  const H = 128;
  const ray = (cx: number, cy: number, n: number, inner: number, len: number, wid: number, col: () => RGB, notch: boolean, layers = 1) => {
    for (let l = 0; l < layers; l++)
      for (let k = 0; k < n; k++) {
        const a = ((k + l * 0.5) / n) * TAU + (r() - 0.5) * 0.12;
        const L = len * (1 - l * 0.25) * rr(r, 0.9, 1);
        const cc = col();
        p.shape(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner, a, L, L * wid, (t, s) => {
          const w = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)), 0.5);
          if (Math.abs(s) > w) return null;
          if (notch && t > 0.9 && Math.abs(Math.sin(s * Math.PI * 1.5)) < 0.35) return null;
          return shade(cc, (0.8 + 0.25 * t) * (0.92 + 0.1 * (1 - Math.abs(s))) * (l ? 1.05 : 0.95));
        });
      }
  };
  const center = (cx: number, cy: number, rad: number, col: RGB) =>
    p.disc(cx, cy, rad, (d, a) => shade(col, (1.15 - d * 0.4) * (0.85 + 0.25 * noise2(Math.cos(a) * d * 8 + 9, Math.sin(a) * d * 8, 3))));
  // Daisy.
  ray(H, H, 24, 18, 104, 0.12, () => lerp3([244, 244, 238], [255, 255, 252], r()), false);
  center(H, H, 24, [236, 176, 22]);
  // Cosmos.
  ray(3 * H, H, 8, 12, 110, 0.36, () => lerp3([226, 94, 158], [240, 136, 186], r()), true);
  center(3 * H, H, 16, [232, 180, 30]);
  // Marigold: ruffled layers.
  for (let l = 0; l < 4; l++) ray(H, 3 * H, 14, 4, 112 - l * 24, 0.38, () => lerp3([232, 112, 14], [250, 168, 30], l / 3 + r() * 0.2), true);
  center(H, 3 * H, 10, [180, 80, 10]);
  // Aster.
  ray(3 * H, 3 * H, 34, 18, 104, 0.08, () => lerp3([132, 96, 200], [172, 140, 224], r()), false, 2);
  center(3 * H, 3 * H, 20, [232, 184, 40]);
  return p.texture();
}

// ── Materials (shared, cached) ──────────────────────────────────────────────────────

const matCache = new Map<string, THREE.Material>();
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key) as T | undefined;
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
}
function cardMat(name: TexName, side: THREE.Side = THREE.FrontSide, alphaTest = 0.5): THREE.MeshStandardMaterial {
  return cached(`card:${name}:${side}`, () => new THREE.MeshStandardMaterial({ map: tex(name, TEX[name]), alphaTest, side, vertexColors: true, roughness: 0.78 }));
}
function solid(key: string, o: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return cached(`solid:${key}`, () => new THREE.MeshStandardMaterial(o));
}
/** Rock texture with vertex colors (moss on top, darker at the ground). */
function rockMat(): THREE.MeshStandardMaterial {
  return cached('rockV', () => {
    const base = pbr('rock') as THREE.MeshStandardMaterial;
    return new THREE.MeshStandardMaterial({ map: base.map, normalMap: base.normalMap, roughness: 0.92, vertexColors: true });
  });
}
function grassMat() {
  return solid('grass', { vertexColors: true, roughness: 0.9 });
}
function palmBarkMat() {
  return cached('palmBark', () => {
    const s = bake(256, 128, (u, v) => {
      const ring = (u * 30) % 1;
      const groove = smooth(0.0, 0.12, ring) * smooth(1.0, 0.8, ring);
      const fib = fbm(u * 60, v * 40, 51, 3);
      const c = shade(lerp3([92, 78, 62], [150, 134, 108], groove), 0.8 + fib * 0.35);
      return { c, height: groove * 0.8 + fib * 0.3, rough: 0.95 };
    }, 4, false);
    return new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, roughness: 0.95 });
  });
}
function streakMat(key: string, roughness: number, along: 'u' | 'v') {
  return cached(`streak:${key}`, () => {
    const s = bake(128, 128, (u, v) => {
      const a = along === 'u' ? v : u;
      const b = along === 'u' ? u : v;
      const n = noise2(a * 60, b * 3, 61) * 0.6 + noise2(a * 140, b * 6, 62) * 0.4;
      return { c: shade([235, 235, 235], 0.86 + n * 0.16), height: n * 0.4, rough: roughness };
    }, 2, true);
    for (const t of [s.map, s.normalMap]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
    }
    return new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, roughness, vertexColors: true });
  });
}
function cactusMat() {
  return cached('cactus', () => {
    const ribs = 8;
    const s = bake(256, 256, (u, v) => {
      const crest = Math.abs(Math.sin(Math.PI * v * ribs)); // 0 on a rib crest
      const au = ((u * 22) % 1) - 0.5;
      const dv = Math.asin(Math.min(1, crest)) / Math.PI / ribs;
      const x = au / 22;
      const y = dv * 0.55;
      const d = Math.hypot(x * 1.1, y);
      const streak = fbm(u * 3, v * 60, 71, 3);
      let c: RGB = lerp3([62, 98, 66], [120, 148, 100], 1 - crest);
      c = shade(c, 0.85 + streak * 0.3);
      let h = 1 - crest;
      // Areole (felt pad) with a star of spines.
      if (d < 0.0045) {
        c = [196, 184, 150];
        h += 0.4;
      } else if (d < 0.016) {
        const a = Math.atan2(y, x);
        if (Math.abs(Math.sin(a * 4)) < 0.16 + (1 - d / 0.016) * 0.2) c = lerp3([226, 214, 186], c, d / 0.016);
      }
      return { c, height: h, rough: 0.6 };
    }, 2, true);
    for (const t of [s.map, s.normalMap]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
    }
    return new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, roughness: 0.6, vertexColors: true });
  });
}
function soilMat() {
  return cached('soil', () => {
    const s = bake(256, 256, (u, v) => {
      const n = fbm(u * 16, v * 16, 81, 4, 16, 16);
      const clod = smooth(0.55, 0.75, noise2(u * 50, v * 50, 82));
      const pebble = noise2(u * 90, v * 90, 83) > 0.86 ? 1 : 0;
      let c: RGB = shade([74, 54, 38], 0.6 + n * 0.5 + clod * 0.25);
      if (pebble) c = [150, 136, 118];
      return { c, height: n * 0.6 + clod * 0.6 + pebble * 0.5, rough: 1 };
    }, 4, true);
    for (const t of [s.map, s.normalMap]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
    }
    return new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, roughness: 1 });
  });
}
function crystalCoreMat(color: string) {
  return solid(`core${color}`, { color, emissive: new THREE.Color(color), emissiveIntensity: 1.6, roughness: 0.3 });
}

// ── Geometry helpers ───────────────────────────────────────────────────────────────

/** Collects quads/triangles with normals, uvs and vertex colors into one mesh. */
class Batch {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  v(p: THREE.Vector3, n: THREE.Vector3, u: number, w: number, c: THREE.Color): number {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uv.push(u, w);
    this.col.push(c.r, c.g, c.b);
    return this.pos.length / 3 - 1;
  }
  /** Both windings by default: lit the same from both sides (cards). */
  tri(a: number, b: number, c: number, both = true) {
    this.idx.push(a, b, c);
    if (both) this.idx.push(a, c, b);
  }
  quad(a: number, b: number, c: number, d: number, both = true) {
    this.tri(a, b, c, both);
    this.tri(a, c, d, both);
  }
  /** A grid of (rows+1)×(cols+1) vertices from a function. */
  grid(rows: number, cols: number, f: (i: number, j: number) => { p: THREE.Vector3; n: THREE.Vector3; u: number; v: number; c: THREE.Color }, both = true) {
    const base = this.pos.length / 3;
    for (let i = 0; i <= rows; i++)
      for (let j = 0; j <= cols; j++) {
        const o = f(i, j);
        this.v(o.p, o.n, o.u, o.v, o.c);
      }
    const w = cols + 1;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) this.quad(base + i * w + j, base + i * w + j + 1, base + (i + 1) * w + j + 1, base + (i + 1) * w + j, both);
  }
  addTo(g: THREE.Object3D, mat: THREE.Material) {
    if (!this.idx.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
}

type CrownOpts = {
  c: THREE.Vector3;
  s: THREE.Vector3;
  count: number;
  size: [number, number];
  tints: [THREE.Color, THREE.Color];
  shell?: number;
  aoMin?: number;
  up?: number;
  /** Ellipsoid used for the normals (the whole crown), default = this clump. */
  nc?: THREE.Vector3;
  ns?: THREE.Vector3;
  uv?: Rect[];
  /** Keeps cards above this height. */
  minY?: number;
};
/** Foliage cards spread in an ellipsoid, facing outward, with volumetric normals and inner shading. */
function crown(b: Batch, r: Rng, o: CrownOpts) {
  const nc = o.nc ?? o.c;
  const ns = o.ns ?? o.s;
  const shell = o.shell ?? 0.35;
  const aoMin = o.aoMin ?? 0.5;
  const upK = o.up ?? 0.35;
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const col = new THREE.Color();
  const n = V();
  for (let i = 0; i < o.count; i++) {
    let dir = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
    while (dir.lengthSq() > 1 || dir.lengthSq() < 0.02) dir = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
    dir.normalize();
    const rad = mix(shell, 1, Math.cbrt(r()));
    const p = o.c.clone().add(V(dir.x * o.s.x * rad, dir.y * o.s.y * rad, dir.z * o.s.z * rad));
    if (o.minY !== undefined && p.y < o.minY) p.y = o.minY + r() * 0.03;
    const sz = rr(r, o.size[0], o.size[1]) / 2;
    const face = dir.clone().lerp(V(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), 0.55).normalize();
    q.setFromUnitVectors(V(0, 0, 1), face);
    q2.setFromAxisAngle(face, r() * TAU);
    q.premultiply(q2);
    const ao = mix(aoMin, 1, rad) * mix(0.72, 1.05, (dir.y + 1) / 2);
    col.copy(o.tints[0]).lerp(o.tints[1], r()).multiplyScalar(ao);
    const rect = o.uv ? pick(r, o.uv) : ([0, 0, 1, 1] as Rect);
    const ids: number[] = [];
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const vtx = V(cx * sz, cy * sz, 0).applyQuaternion(q).add(p);
      const d = vtx.clone().sub(nc);
      n.set(d.x / (ns.x * ns.x), d.y / (ns.y * ns.y), d.z / (ns.z * ns.z)).normalize().addScaledVector(UP, upK).normalize();
      ids.push(b.v(vtx, n, cx < 0 ? rect[0] : rect[2], cy < 0 ? rect[1] : rect[3], col));
    }
    b.quad(ids[0], ids[1], ids[2], ids[3]);
  }
}

/** A flat card lying on the ground (fallen leaves, petals). */
function groundCard(b: Batch, x: number, z: number, size: number, ang: number, y: number, c: THREE.Color, rect: Rect = [0, 0, 1, 1]) {
  const ids: number[] = [];
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const lx = (cx * size) / 2;
    const lz = (cy * size) / 2;
    ids.push(b.v(V(x + lx * ca - lz * sa, y, z + lx * sa + lz * ca), UP, cx < 0 ? rect[0] : rect[2], cy < 0 ? rect[1] : rect[3], c));
  }
  b.quad(ids[0], ids[3], ids[2], ids[1], false);
}

type TubeOpts = { rings?: number; radial?: number; flare?: number; section?: (u: number) => number; caps?: boolean; up?: THREE.Vector3; closed?: boolean };
function tubeGeo(pts: THREE.Vector3[], r0: number, r1: number, o: TubeOpts = {}) {
  const curve: THREE.Curve<THREE.Vector3> = pts.length > 2 || o.closed ? new THREE.CatmullRomCurve3(pts, !!o.closed) : new THREE.LineCurve3(pts[0], pts[1]);
  const dir = pts[pts.length - 1].clone().sub(pts[0]).normalize();
  const up = o.up ?? (Math.abs(dir.y) > 0.7 ? V(1, 0, 0) : V(0, 1, 0));
  return loft({
    curve,
    rings: o.rings ?? 8,
    radial: o.radial ?? 7,
    up,
    caps: o.caps,
    section: (u) => {
      let rad = mix(r0, r1, u) * (o.section ? o.section(u) : 1);
      if (o.flare) rad *= 1 + o.flare * smooth(0.14, 0, u);
      return { rx: rad, ry: rad };
    },
  });
}
function tube(pts: THREE.Vector3[], r0: number, r1: number, mat: THREE.Material, o: TubeOpts = {}): THREE.Mesh {
  const m = new THREE.Mesh(tubeGeo(pts, r0, r1, o).geometry, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Same normal for vertices at the same place (UV seams, poles), so displaced shapes stay smooth. */
function weldNormals(g: THREE.BufferGeometry) {
  g.computeVertexNormals();
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const sums = new Map<string, THREE.Vector3>();
  const key = (i: number) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    const s = sums.get(k) ?? V();
    s.x += n.getX(i);
    s.y += n.getY(i);
    s.z += n.getZ(i);
    sums.set(k, s);
  }
  for (let i = 0; i < p.count; i++) {
    const s = sums.get(key(i))!.clone().normalize();
    n.setXYZ(i, s.x, s.y, s.z);
  }
  n.needsUpdate = true;
}

/** Pushes the vertices of a lofted tube in and out around it: ribs (cactus, pumpkin stem). */
function ribTube(pts: THREE.Vector3[], radius: (u: number) => number, ribs: number, depth: number, o: TubeOpts & { color?: (p: THREE.Vector3, u: number) => THREE.Color } = {}) {
  const rings = o.rings ?? 16;
  const radial = o.radial ?? ribs * 4;
  const { geometry, frames } = tubeGeo(pts, 1, 1, { ...o, rings, radial, section: radius });
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const row = radial + 1;
  const tmp = V();
  for (let i = 0; i <= rings; i++) {
    const c = frames[i].p;
    for (let j = 0; j <= radial; j++) {
      const k = i * row + j;
      const a = (j / radial) * TAU;
      const f = 1 - depth * Math.abs(Math.sin((a * ribs) / 2));
      tmp.set(pos.getX(k), pos.getY(k), pos.getZ(k)).sub(c).multiplyScalar(f).add(c);
      pos.setXYZ(k, tmp.x, tmp.y, tmp.z);
    }
  }
  weldNormals(geometry);
  if (o.color) {
    const cols: number[] = [];
    for (let k = 0; k < pos.count; k++) {
      const u = Math.min(rings, Math.floor(k / row)) / rings;
      const cc = o.color(V(pos.getX(k), pos.getY(k), pos.getZ(k)), u);
      cols.push(cc.r, cc.g, cc.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  }
  return geometry;
}

/** A boulder: icosphere chipped by a few flat planes (fractures), then roughened; moss on top. */
function boulderGeo(r: Rng, R: number, detail: number, squash = 0.7, moss = 0.5, tint = new THREE.Color(1, 1, 1)) {
  const geo = new THREE.IcosahedronGeometry(R, detail);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const planes = Array.from({ length: 6 }, () => ({ n: V(r() - 0.5, r() * 0.8 - 0.2, r() - 0.5).normalize(), d: R * rr(r, 0.7, 0.9) }));
  const sd = r() * 100;
  const v = V();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    for (const pl of planes) {
      const k = v.dot(pl.n) - pl.d;
      if (k > 0) v.addScaledVector(pl.n, -k * 0.85);
    }
    const nn = v.clone().normalize();
    const f = fbm(nn.x * 2.2 + sd, nn.y * 2.2 + nn.z * 1.7, 5, 4);
    v.multiplyScalar(0.86 + f * 0.3);
    v.y *= squash;
    if (v.y < -R * 0.25) v.y = -R * 0.25;
    pos.setXYZ(i, v.x, v.y + R * 0.2, v.z);
  }
  const uv: number[] = [];
  for (let i = 0; i < pos.count; i++) uv.push((pos.getX(i) + pos.getZ(i) * 0.7) * 2.5, (pos.getY(i) + pos.getZ(i) * 0.5) * 2.5);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  weldNormals(geo);
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const cols: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const c = new THREE.Color(1, 1, 1).multiplyScalar(0.85 + noise2(x * 12 + sd, z * 12, 4) * 0.25).multiply(tint);
    const m = smooth(0.35, 0.8, nrm.getY(i)) * smooth(0.4, 0.62, fbm(x * 9 + sd, z * 9 + y * 5, 6, 3)) * moss;
    c.lerp(new THREE.Color(0.42, 0.55, 0.22), m);
    c.multiplyScalar(mix(0.55, 1, smooth(0, R * 0.35, y)));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return geo;
}
function boulder(g: THREE.Group, r: Rng, R: number, x: number, z: number, detail = 3, squash = 0.7, moss = 0.5, tint?: THREE.Color) {
  const m = new THREE.Mesh(boulderGeo(r, R, detail, squash, moss, tint), rockMat());
  m.position.set(x, -R * 0.06, z);
  m.rotation.y = r() * TAU;
  g.add(m);
  return m;
}

/** Tufts of grass blades (both windings, normals up like the ground). */
function grassTufts(b: Batch, r: Rng, spots: [number, number][], blades = 9, h = 0.07, dry = 0) {
  const c = new THREE.Color();
  for (const [x, z] of spots) {
    for (let i = 0; i < blades; i++) {
      const a = r() * TAU;
      const ox = x + Math.cos(a) * 0.012;
      const oz = z + Math.sin(a) * 0.012;
      const w = 0.006 + r() * 0.004;
      const bh = h * (0.5 + r() * 0.6);
      const lean = 0.25 + r() * 0.5;
      const pa = a + Math.PI / 2;
      const top = V(ox + Math.cos(a) * bh * lean, bh, oz + Math.sin(a) * bh * lean);
      const g0 = 0.6 + r() * 0.4;
      c.setRGB(0.16 * g0, 0.3 * g0, 0.08 * g0).lerp(new THREE.Color(0.45, 0.4, 0.2), dry * r());
      const i0 = b.v(V(ox - Math.cos(pa) * w, 0, oz - Math.sin(pa) * w), UP, 0, 0, c);
      const i1 = b.v(V(ox + Math.cos(pa) * w, 0, oz + Math.sin(pa) * w), UP, 1, 0, c);
      const tc = c.clone().multiplyScalar(1.9);
      const i2 = b.v(top, UP, 0.5, 1, tc);
      b.tri(i0, i1, i2);
    }
  }
}

// ── Trees ───────────────────────────────────────────────────────────────────────────

type TreeOpts = { leader?: number; h: number; r0: number; fork: number; limbs: number; spread: number; rise: number; twigs: number; bark: THREE.Material; gnarl?: number; sag?: number };
/** Trunk, leader, limbs and twigs. Returns the branch tips (where the foliage clumps go). */
function growTree(g: THREE.Group, r: Rng, o: TreeOpts): THREE.Vector3[] {
  const tips: THREE.Vector3[] = [];
  const gn = o.gnarl ?? 0.3;
  const F = V((r() - 0.5) * 0.08, o.fork, (r() - 0.5) * 0.08);
  g.add(tube([V(0, -0.03, 0), V((r() - 0.5) * 0.05 * gn, o.fork * 0.5, (r() - 0.5) * 0.05 * gn), F], o.r0, o.r0 * 0.78, o.bark, { rings: 10, radial: 9, flare: 0.7 }));
  const top = V(F.x + (r() - 0.5) * 0.08, mix(o.fork, o.h * 0.86, o.leader ?? 1), F.z + (r() - 0.5) * 0.08);
  const leaderMid = F.clone().lerp(top, 0.5).add(V((r() - 0.5) * 0.06 * gn, 0, (r() - 0.5) * 0.06 * gn));
  g.add(tube([F, leaderMid, top], o.r0 * 0.68, o.r0 * 0.2, o.bark, { rings: 8, radial: 7 }));
  tips.push(top);
  for (let k = 0; k < o.limbs; k++) {
    const a = (k / o.limbs) * TAU + r() * 0.9;
    const L = o.spread * (0.75 + r() * 0.35);
    const S0 = F.clone().lerp(top, r() * 0.3);
    const E = S0.clone().add(V(Math.cos(a) * L, o.rise * (0.55 + r() * 0.5), Math.sin(a) * L));
    const M = S0.clone().lerp(E, 0.5).add(V((r() - 0.5) * 0.08 * gn, -(o.sag ?? 0.02) + (r() - 0.5) * 0.06 * gn, (r() - 0.5) * 0.08 * gn));
    const curve = new THREE.CatmullRomCurve3([S0, M, E]);
    g.add(tube([S0, M, E], o.r0 * 0.6, o.r0 * 0.18, o.bark, { rings: 8, radial: 7 }));
    tips.push(E);
    for (let t = 0; t < o.twigs; t++) {
      const P = curve.getPointAt(0.45 + r() * 0.4);
      const d = E.clone().sub(S0).setY(0).normalize().applyAxisAngle(UP, (t % 2 ? 1 : -1) * (0.5 + r() * 0.6));
      const T = P.clone().add(d.multiplyScalar(0.12 + r() * 0.1)).add(V(0, 0.05 + r() * 0.1, 0));
      g.add(tube([P, T], o.r0 * 0.24, o.r0 * 0.08, o.bark, { rings: 3, radial: 5 }));
      tips.push(T);
    }
  }
  return tips;
}

/** Leaf clumps at the branch tips plus a fill of the whole crown. */
function foliage(g: THREE.Group, r: Rng, tips: THREE.Vector3[], o: { mat: THREE.Material; c: THREE.Vector3; s: THREE.Vector3; tints: [THREE.Color, THREE.Color]; clump: number; perClump: number; fill: number; size: [number, number]; ao?: number }) {
  const b = new Batch();
  for (const t of tips)
    crown(b, r, { c: t.clone().add(V(0, 0.04, 0)), s: V(o.clump, o.clump * 0.8, o.clump), count: o.perClump, size: o.size, tints: o.tints, nc: o.c, ns: o.s, shell: 0.2, aoMin: o.ao });
  crown(b, r, { c: o.c, s: o.s, count: o.fill, size: o.size, tints: o.tints, shell: 0.55, aoMin: o.ao });
  b.addTo(g, o.mat);
}

function pine(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const h = 1.2;
  g.add(tube([V(0, -0.03, 0), V(0, h * 0.5, 0), V(0, h, 0)], 0.045, 0.006, pbr('bark', { color: '#cdbdb0' }), { rings: 10, radial: 8, flare: 0.6 }));
  const b = new Batch();
  const whorls = 12;
  const c = new THREE.Color();
  const nrm = V();
  for (let w = 0; w < whorls; w++) {
    const t = w / (whorls - 1);
    const y = mix(0.16, h * 0.97, t);
    const n = Math.round(mix(8, 4, t));
    for (let k = 0; k < n; k++) {
      const L = mix(0.42, 0.07, Math.pow(t, 0.9)) * (0.85 + r() * 0.25);
      const a = (k / n) * TAU + w * 0.9 + r() * 0.5;
      const out = V(Math.cos(a), 0, Math.sin(a));
      const droop = mix(0.45, -0.15, t) + (r() - 0.5) * 0.15;
      const base = V(0, y + (r() - 0.5) * 0.03, 0);
      const pts = [0, 0.5, 1].map((u) => base.clone().addScaledVector(out, L * u).add(V(0, -L * droop * u * u + L * 0.12 * u * (1 - u), 0)));
      for (const roll of [0, 1.1, -1.1]) {
        const side = V().crossVectors(out, UP).normalize().applyAxisAngle(out, roll + (r() - 0.5) * 0.3);
        const halfW = L * 0.36;
        const ids: number[] = [];
        for (let i = 0; i < 3; i++) {
          const u = i / 2;
          const p = pts[i];
          nrm.set(p.x, 0, p.z).normalize().multiplyScalar(i === 0 ? 0.3 : 1).add(V(0, 0.75, 0)).normalize();
          const ao = mix(0.5, 1.05, u) * mix(0.8, 1.05, t);
          c.setRGB(ao, ao, ao * 0.95);
          ids.push(b.v(p.clone().addScaledVector(side, -halfW), nrm, u, 0, c), b.v(p.clone().addScaledVector(side, halfW), nrm, u, 1, c));
        }
        b.quad(ids[0], ids[2], ids[3], ids[1]);
        b.quad(ids[2], ids[4], ids[5], ids[3]);
      }
    }
  }
  // Dense inner fill hides the trunk between the whorls.
  crown(b, r, { c: V(0, h * 0.94, 0), s: V(0.04, 0.08, 0.04), count: 6, size: [0.1, 0.14], tints: [new THREE.Color(0.8, 0.85, 0.8), new THREE.Color(0.95, 1, 0.9)], shell: 0.2, up: 0.6 });
  crown(b, r, { c: V(0, h * 0.5, 0), s: V(0.12, h * 0.42, 0.12), count: 36, size: [0.14, 0.2], tints: [new THREE.Color(0.55, 0.55, 0.55), new THREE.Color(0.7, 0.7, 0.68)], shell: 0.2, up: 0.6 });
  b.addTo(g, cardMat('spruce'));
  const gb = new Batch();
  grassTufts(gb, r, [[0.12, 0.1], [-0.1, 0.14], [0.05, -0.14]], 7, 0.06, 0.4);
  gb.addTo(g, grassMat());
  return g;
}

function bush(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const bark = pbr('bark', { color: '#c4b4a4' });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + r();
    g.add(tube([V(0, -0.01, 0), V(Math.cos(a) * 0.12, 0.12 + r() * 0.06, Math.sin(a) * 0.1)], 0.014, 0.006, bark, { rings: 2, radial: 5 }));
  }
  const b = new Batch();
  const tints: [THREE.Color, THREE.Color] = [new THREE.Color(0.85, 0.88, 0.8), new THREE.Color(1.05, 1.08, 0.95)];
  const nc = V(0, 0.08, 0);
  const ns = V(0.48, 0.32, 0.42);
  crown(b, r, { c: V(0, 0.23, -0.02), s: V(0.27, 0.2, 0.25), count: 130, size: [0.13, 0.2], tints, nc, ns, minY: 0.03, shell: 0.45 });
  crown(b, r, { c: V(-0.22, 0.15, 0.08), s: V(0.19, 0.14, 0.18), count: 70, size: [0.12, 0.17], tints, nc, ns, minY: 0.03, shell: 0.45 });
  crown(b, r, { c: V(0.22, 0.14, 0.06), s: V(0.18, 0.13, 0.17), count: 66, size: [0.12, 0.17], tints, nc, ns, minY: 0.03, shell: 0.45 });
  b.addTo(g, cardMat('green'));
  const gb = new Batch();
  grassTufts(gb, r, [[0.3, 0.2], [-0.3, 0.22], [0.05, 0.26], [-0.1, -0.24]], 7, 0.06);
  gb.addTo(g, grassMat());
  return g;
}

let appleGeo: THREE.BufferGeometry | null = null;
function apple(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const tips = growTree(g, r, { h: 1.08, r0: 0.05, fork: 0.36, limbs: 4, spread: 0.3, rise: 0.4, twigs: 2, bark: pbr('bark', { color: '#e2d6ca' }), gnarl: 0.8 });
  const c = V(0, 0.78, 0);
  const s = V(0.44, 0.3, 0.42);
  foliage(g, r, tips, { mat: cardMat('apple'), c, s, tints: [new THREE.Color(0.85, 0.9, 0.82), new THREE.Color(1.05, 1.08, 0.98)], clump: 0.19, perClump: 20, fill: 80, size: [0.12, 0.18] });
  if (!appleGeo) {
    const R = 0.034;
    const prof = [[0.0, -0.92], [0.4, -0.9], [0.8, -0.62], [0.98, -0.12], [0.9, 0.42], [0.55, 0.78], [0.18, 0.74], [0.0, 0.55]].map(([x, y]) => new THREE.Vector2(x * R, y * R));
    const geo = new THREE.LatheGeometry(prof, 9);
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const cols: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const ang = Math.atan2(p.getZ(i), p.getX(i));
      const blush = smooth(-0.2, 0.9, Math.cos(ang)) * 0.8 + noise2(ang * 3, p.getY(i) * 80, 9) * 0.2;
      const col = new THREE.Color(0.55, 0.36, 0.04).lerp(new THREE.Color(0.4, 0.01, 0.012), Math.min(1, blush * 1.1 + 0.55));
      cols.push(col.r, col.g, col.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    weldNormals(geo);
    appleGeo = geo;
  }
  const am = solid('apple', { vertexColors: true, roughness: 0.38 });
  for (let i = 0; i < 15; i++) {
    let d = V(r() * 2 - 1, rr(r, -0.75, 0.35), r() * 2 - 1).normalize();
    if (d.z < -0.3 && r() < 0.6) d = d.setZ(-d.z);
    const m = new THREE.Mesh(appleGeo, am);
    m.position.set(c.x + d.x * s.x * 0.92, c.y + d.y * s.y * 0.95, c.z + d.z * s.z * 0.92);
    m.rotation.set((r() - 0.5) * 0.5, r() * TAU, (r() - 0.5) * 0.5);
    g.add(m);
  }
  for (const [x, z] of [[0.28, 0.22], [-0.18, 0.3]]) {
    const m = new THREE.Mesh(appleGeo, am);
    m.position.set(x, 0.03, z);
    m.rotation.set(1.2, r() * TAU, 0.3);
    g.add(m);
  }
  const gb = new Batch();
  grassTufts(gb, r, [[0.1, 0.12], [-0.12, 0.08], [0.02, -0.12], [0.3, 0.3]], 8, 0.07);
  gb.addTo(g, grassMat());
  return g;
}

function autumn(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const tips = growTree(g, r, { h: 1.25, r0: 0.05, fork: 0.42, limbs: 4, spread: 0.26, rise: 0.48, twigs: 2, bark: pbr('bark', { color: '#d4c8c0' }) });
  foliage(g, r, tips, {
    mat: cardMat('autumn'),
    c: V(0, 0.86, 0),
    s: V(0.4, 0.37, 0.4),
    tints: [new THREE.Color(0.88, 0.82, 0.8), new THREE.Color(1.08, 1.02, 0.95)],
    clump: 0.2,
    perClump: 20,
    fill: 85,
    size: [0.12, 0.18],
  });
  const b = new Batch();
  for (let i = 0; i < 5; i++) {
    const a = r() * TAU;
    const d = 0.1 + r() * 0.26;
    groundCard(b, Math.cos(a) * d, Math.sin(a) * d, 0.26 + r() * 0.1, r() * TAU, 0.003 + i * 0.0006, new THREE.Color(0.85, 0.8, 0.75));
  }
  b.addTo(g, cardMat('litter'));
  return g;
}

function sakura(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const tips = growTree(g, r, { h: 0.98, leader: 0.6, r0: 0.055, fork: 0.3, limbs: 5, spread: 0.4, rise: 0.36, twigs: 2, bark: pbr('bark', { color: '#ab9692' }), gnarl: 1.2, sag: 0.05 });
  foliage(g, r, tips, {
    mat: cardMat('blossom'),
    c: V(0, 0.76, 0),
    s: V(0.5, 0.27, 0.46),
    tints: [new THREE.Color(0.9, 0.86, 0.88), new THREE.Color(1.06, 1.02, 1.04)],
    clump: 0.2,
    perClump: 24,
    fill: 120,
    size: [0.14, 0.2],
    ao: 0.72,
  });
  const b = new Batch();
  for (let i = 0; i < 5; i++) {
    const a = r() * TAU;
    const d = 0.1 + r() * 0.28;
    groundCard(b, Math.cos(a) * d, Math.sin(a) * d, 0.28 + r() * 0.1, r() * TAU, 0.003 + i * 0.0006, new THREE.Color(1, 1, 1));
  }
  b.addTo(g, cardMat('petals'));
  return g;
}

function palm(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const T = V(0.2, 1.0, 0.03);
  g.add(tube([V(0, -0.02, 0), V(0.05, 0.35, 0), V(0.14, 0.7, 0.02), T], 0.058, 0.042, palmBarkMat(), { rings: 16, radial: 10, flare: 0.5 }));
  g.add(tube([T.clone().add(V(0, -0.05, 0)), T.clone().add(V(0.005, 0.04, 0))], 0.05, 0.03, palmBarkMat(), { rings: 2, radial: 10 }));
  const b = new Batch();
  const nf = 14;
  const nrm = V();
  const c = new THREE.Color();
  for (let k = 0; k < nf; k++) {
    const a = k * 2.39996 + r() * 0.3;
    const young = k / nf;
    const dead = k < 2;
    const e = dead ? -1.0 : mix(-0.25, 0.85, young) + (r() - 0.5) * 0.2;
    const L = (dead ? 0.42 : rr(r, 0.52, 0.66)) * (young > 0.85 ? 0.75 : 1);
    const hor = V(Math.cos(a), 0, Math.sin(a));
    const grav = dead ? 0.1 : rr(r, 0.65, 1.0);
    const seg = 8;
    const ids: number[][] = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const p = T.clone().addScaledVector(hor, Math.cos(e) * L * t).add(V(0, Math.sin(e) * L * t - grav * L * t * t * 0.6, 0));
      const t2 = Math.min(1, t + 0.05);
      const pn = T.clone().addScaledVector(hor, Math.cos(e) * L * t2).add(V(0, Math.sin(e) * L * t2 - grav * L * t2 * t2 * 0.6, 0));
      const tan = pn.sub(p).normalize();
      const side = V().crossVectors(tan, UP).normalize();
      const w = L * 0.27 * smooth(0, 0.15, t);
      const drop = w * 0.7;
      nrm.copy(hor).multiplyScalar(0.35).add(V(0, 1, 0)).normalize();
      const ao = mix(0.6, 1.05, t);
      if (dead) c.setRGB(1.55 * ao, 1.15 * ao, 0.55 * ao);
      else c.setRGB(mix(0.85, 1.05, young) * ao, mix(0.88, 1.08, young) * ao, mix(0.75, 0.95, young) * ao);
      ids.push([
        b.v(p.clone().addScaledVector(side, -w).add(V(0, -drop, 0)), nrm, t, 0, c),
        b.v(p, nrm, t, 0.5, c),
        b.v(p.clone().addScaledVector(side, w).add(V(0, -drop, 0)), nrm, t, 1, c),
      ]);
    }
    for (let i = 0; i < seg; i++) {
      b.quad(ids[i][0], ids[i + 1][0], ids[i + 1][1], ids[i][1]);
      b.quad(ids[i][1], ids[i + 1][1], ids[i + 1][2], ids[i][2]);
    }
  }
  b.addTo(g, cardMat('palm'));
  const coco = solid('coconut', { color: '#6a5a2c', roughness: 0.55 });
  const cg = new THREE.SphereGeometry(0.036, 10, 8);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + r();
    const m = new THREE.Mesh(cg, coco);
    m.position.copy(T).add(V(Math.cos(a) * 0.05, -0.05 - (i % 2) * 0.03, Math.sin(a) * 0.05));
    m.scale.set(1, 1.15, 1);
    g.add(m);
  }
  const gb = new Batch();
  grassTufts(gb, r, [[0.08, 0.1], [-0.1, 0.05], [0.0, -0.12]], 7, 0.06, 0.6);
  gb.addTo(g, grassMat());
  return g;
}

function bamboo(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const culmMat = streakMat('bamboo', 0.4, 'u');
  const b = new Batch();
  const nC = 8;
  for (let k = 0; k < nC; k++) {
    const a = (k / nC) * TAU + r() * 0.6;
    const d = Math.sqrt(r()) * 0.15 + 0.02;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = rr(r, 0.8, 1.3);
    const N = Math.round(h / 0.16);
    const lean = V(x, 0, z).normalize().multiplyScalar(0.1 * h);
    const top = V(x + lean.x + (r() - 0.5) * 0.06, h, z + lean.z + (r() - 0.5) * 0.06);
    const rad = rr(r, 0.018, 0.026);
    const base = new THREE.Color().setRGB(rr(r, 0.42, 0.56), rr(r, 0.6, 0.68), rr(r, 0.24, 0.32));
    if (r() < 0.25) base.setRGB(0.7, 0.66, 0.32);
    const { geometry } = tubeGeo([V(x, -0.02, z), V(x + lean.x * 0.3, h * 0.5, z + lean.z * 0.3), top], rad, rad * 0.75, {
      rings: N * 4,
      radial: 7,
      section: (u) => {
        const ph = (u * N) % 1;
        return 1 + 0.16 * smooth(0.13, 0, Math.min(ph, 1 - ph));
      },
    });
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const cols: number[] = [];
    for (let i = 0; i < uv.count; i++) {
      const ph = (uv.getX(i) * N) % 1;
      const col = base.clone();
      if (ph < 0.02 || ph > 0.98) col.multiplyScalar(0.7);
      else if (ph < 0.3) col.lerp(new THREE.Color(0.82, 0.86, 0.72), 0.35 * (1 - ph / 0.3));
      cols.push(col.r, col.g, col.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.Mesh(geometry, culmMat);
    m.castShadow = true;
    g.add(m);
    // Leaf sprays along the upper part, hanging out from the culm.
    const curve = new THREE.CatmullRomCurve3([V(x, 0, z), V(x + lean.x * 0.3, h * 0.5, z + lean.z * 0.3), top]);
    const sprays = Math.round(rr(r, 8, 11));
    for (let s = 0; s < sprays; s++) {
      const u = mix(0.42, 1, s / (sprays - 1)) * (0.95 + r() * 0.05);
      const p = curve.getPointAt(Math.min(1, u));
      const out = V(Math.cos(r() * TAU), 0, Math.sin(r() * TAU)).add(V(x, 0, z).multiplyScalar(4)).normalize();
      crown(b, r, {
        c: p.clone().addScaledVector(out, 0.07).add(V(0, -0.02, 0)),
        s: V(0.07, 0.06, 0.07),
        count: 3,
        size: [0.2, 0.28],
        tints: [new THREE.Color(0.85, 0.88, 0.8), new THREE.Color(1.05, 1.05, 0.95)],
        nc: V(0, 0.85, 0),
        ns: V(0.35, 0.5, 0.35),
        shell: 0.5,
      });
    }
  }
  b.addTo(g, cardMat('bamboo'));
  const gb = new Batch();
  grassTufts(gb, r, [[0.2, 0.12], [-0.18, 0.16], [0.02, 0.24], [-0.2, -0.12]], 8, 0.07, 0.3);
  gb.addTo(g, grassMat());
  return g;
}

function cactus(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const mat = cactusMat();
  const color = (p: THREE.Vector3) => {
    const c = new THREE.Color(1, 1, 1);
    c.lerp(new THREE.Color(0.62, 0.55, 0.42), smooth(0.14, 0.02, p.y));
    return c;
  };
  const dome = (u: number, R: number, start = 0.88) => R * Math.sqrt(Math.max(0.0004, 1 - Math.pow(Math.max(0, u - start) / (1 - start), 2)));
  const add = (geo: THREE.BufferGeometry) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  add(ribTube([V(0, -0.03, 0), V(0.01, 0.5, 0), V(0, 1.02, 0)], (u) => dome(u, 0.088, 0.9) * (1 + 0.08 * smooth(0.1, 0, u)), 8, 0.13, { rings: 18, radial: 32, color, up: V(0, 0, 1) }));
  add(ribTube([V(0.04, 0.36, 0), V(0.17, 0.38, 0), V(0.22, 0.5, 0), V(0.225, 0.78, 0)], (u) => dome(u, 0.058, 0.86) * (1 - 0.15 * smooth(0.3, 0, u)), 8, 0.13, { rings: 13, radial: 32, color, up: V(0, 0, 1) }));
  add(ribTube([V(-0.04, 0.5, 0.01), V(-0.15, 0.53, 0.02), V(-0.19, 0.62, 0.03), V(-0.19, 0.74, 0.03)], (u) => dome(u, 0.05, 0.84) * (1 - 0.15 * smooth(0.3, 0, u)), 8, 0.13, { rings: 11, radial: 32, color, up: V(0, 0, 1) }));
  // Sandy ground with pebbles.
  const mound = new THREE.Mesh(
    new THREE.LatheGeometry([0, 0.1, 0.2, 0.28, 0.34].map((x, i) => new THREE.Vector2(x, [0.035, 0.032, 0.022, 0.009, 0][i])), 24),
    pbr('sand', { repeat: [3, 3] }),
  );
  mound.receiveShadow = true;
  g.add(mound);
  for (let i = 0; i < 6; i++) {
    const a = r() * TAU;
    const d = 0.14 + r() * 0.16;
    boulder(g, r, 0.02 + r() * 0.025, Math.cos(a) * d, Math.sin(a) * d, 1, 0.7, 0, new THREE.Color(1.1, 0.98, 0.85)).position.y += 0.012;
  }
  // White saguaro blooms on the tips.
  const b = new Batch();
  for (const p of [V(0.0, 1.02, 0.02), V(0.03, 1.0, -0.04), V(0.225, 0.78, 0.0), V(-0.19, 0.74, 0.03)]) {
    crown(b, r, { c: p.clone().add(V(0, 0.012, 0)), s: V(0.01, 0.005, 0.01), count: 1, size: [0.085, 0.095], tints: [new THREE.Color(1, 1, 0.95), new THREE.Color(1, 1, 1)], uv: [FLOWER.daisy], up: 1 });
  }
  b.addTo(g, cardMat('flowers'));
  const gb = new Batch();
  grassTufts(gb, r, [[0.25, 0.12], [-0.22, -0.15]], 7, 0.06, 0.9);
  gb.addTo(g, grassMat());
  return g;
}

/** A bent leaf card: base attached at `base`, pointing along `out` (cupped and drooping). */
function leafCard(b: Batch, base: THREE.Vector3, out: THREE.Vector3, len: number, wid: number, droop: number, cup: number, c: THREE.Color, attach: 'base' | 'center' = 'base') {
  const o = out.clone().normalize();
  const side = V().crossVectors(o, UP).normalize();
  if (side.lengthSq() < 0.1) side.set(1, 0, 0);
  const up = V().crossVectors(side, o).normalize();
  const n = up.clone().addScaledVector(UP, 0.5).normalize();
  b.grid(3, 2, (i, j) => {
    const t = i / 3;
    const s = j - 1;
    const tt = attach === 'base' ? t : t - 0.5;
    const p = base
      .clone()
      .addScaledVector(o, len * tt)
      .addScaledVector(side, (wid / 2) * s)
      .addScaledVector(up, cup * wid * s * s - droop * len * tt * tt);
    return { p, n, u: (s + 1) / 2, v: t, c: c.clone().multiplyScalar(mix(0.75, 1.05, t)) };
  });
}

function sunflower(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const stemMat = pbr('leaves', { color: '#9ab060' });
  const leaves = new Batch();
  const heads = new Batch();
  for (const [x, z, h, yaw] of [[-0.18, 0.04, 0.78, 0.25], [0.14, -0.12, 0.94, -0.15], [0.06, 0.18, 0.62, 0.05]] as const) {
    const top = V(x + 0.01, h, z + 0.04);
    const stem = [V(x, -0.01, z), V(x + (r() - 0.5) * 0.03, h * 0.55, z - 0.01), top];
    g.add(tube(stem, 0.016, 0.01, stemMat, { rings: 8, radial: 6 }));
    const curve = new THREE.CatmullRomCurve3(stem);
    for (let k = 0; k < 6; k++) {
      const u = mix(0.12, 0.8, k / 5);
      const p = curve.getPointAt(u);
      const a = k * 2.4 + r();
      const L = mix(0.2, 0.13, u);
      leafCard(leaves, p, V(Math.cos(a), 0.35, Math.sin(a)), L, L * 1.05, 0.22, 0.1, new THREE.Color(0.95, 1, 0.9));
    }
    // Head: a slightly domed disc, ray petals curving back, a green calyx behind.
    const R = mix(0.12, 0.15, (h - 0.6) / 0.35);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, yaw, 0, 'YXZ'));
    const center = top.clone().add(V(0, 0.02, 0.03).applyQuaternion(q));
    const fwd = V(0, 0, 1).applyQuaternion(q);
    const radii = [0, 0.2, 0.4, 0.5, 0.75, 1];
    const nA = 20;
    const white = new THREE.Color(1, 1, 1);
    const base = heads.pos.length / 3;
    for (let i = 0; i < radii.length; i++)
      for (let j = 0; j < nA; j++) {
        const f = radii[i];
        const a = (j / nA) * TAU;
        const zz = f <= 0.42 ? 0.1 * R * (1 - (f / 0.42) ** 2) : -0.4 * R * (f - 0.45) ** 1.5;
        const p = V(Math.cos(a) * f * R, Math.sin(a) * f * R, zz).applyQuaternion(q).add(center);
        heads.v(p, fwd, 0.5 + 0.5 * Math.cos(a) * f, 0.5 + 0.5 * Math.sin(a) * f, white);
      }
    for (let i = 0; i < radii.length - 1; i++)
      for (let j = 0; j < nA; j++) {
        const a = base + i * nA + j;
        const b2 = base + i * nA + ((j + 1) % nA);
        heads.quad(a, b2, b2 + nA, a + nA, false);
      }
    const calyx = new THREE.Mesh(new THREE.SphereGeometry(R * 0.45, 12, 6, 0, TAU, Math.PI / 2, Math.PI / 2), pbr('leaves', { color: '#7f9a4a' }));
    calyx.position.copy(center).addScaledVector(fwd, -0.005);
    calyx.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)));
    calyx.scale.set(1, 0.5, 1);
    g.add(calyx);
  }
  leaves.addTo(g, cardMat('sunLeaf'));
  heads.addTo(g, cardMat('sunHead', THREE.DoubleSide, 0.5));
  const gb = new Batch();
  grassTufts(gb, r, [[-0.2, 0.08], [0.15, -0.08], [0.08, 0.22], [-0.05, -0.05]], 8, 0.07);
  gb.addTo(g, grassMat());
  return g;
}

function rock(r: Rng): THREE.Group {
  const g = new THREE.Group();
  boulder(g, r, 0.24, -0.05, -0.04, 4, 0.62).scale.set(1.2, 1, 1);
  boulder(g, r, 0.14, 0.22, 0.15, 3, 0.75);
  boulder(g, r, 0.09, -0.24, 0.2, 3, 0.7);
  for (let i = 0; i < 4; i++) {
    const a = r() * TAU;
    const d = 0.28 + r() * 0.12;
    boulder(g, r, 0.025 + r() * 0.02, Math.cos(a) * d, Math.sin(a) * d, 1, 0.7, 0);
  }
  const gb = new Batch();
  grassTufts(gb, r, [[0.08, 0.2], [-0.12, 0.18], [0.32, 0.0], [-0.3, -0.05], [0.12, -0.24], [0.33, 0.28]], 9, 0.08);
  gb.addTo(g, grassMat());
  return g;
}

function hedge(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const hx = 0.46;
  const hy = 0.21;
  const hz = 0.17;
  const geo = new RoundedBoxGeometry(hx * 2, hy * 2, hz * 2, 3, 0.05);
  geo.translate(0, hy, 0);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const cols: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const k = mix(0.3, 0.7, smooth(0, 0.3, p.getY(i)));
    cols.push(0.8 * k, 0.85 * k, 0.75 * k);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const core = new THREE.Mesh(geo, cached('hedgeCore', () => new THREE.MeshStandardMaterial({ map: tex('box', TEX.box), vertexColors: true, roughness: 0.75 })));
  core.castShadow = true;
  core.receiveShadow = true;
  g.add(core);
  // Surface twigs: small leaf cards on the clipped faces (fuzzy, irregular outline).
  const b = new Batch();
  const faces: { n: THREE.Vector3; area: number }[] = [
    { n: V(0, 1, 0), area: hx * hz },
    { n: V(0, 0, 1), area: hx * hy },
    { n: V(0, 0, -1), area: hx * hy },
    { n: V(1, 0, 0), area: hz * hy },
    { n: V(-1, 0, 0), area: hz * hy },
  ];
  const total = faces.reduce((s, f) => s + f.area, 0);
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  for (let i = 0; i < 900; i++) {
    let x = r() * total;
    let f = faces[0];
    for (const ff of faces) {
      x -= ff.area;
      if (x <= 0) {
        f = ff;
        break;
      }
    }
    const pnt = V((r() * 2 - 1) * hx, hy + (r() * 2 - 1) * hy, (r() * 2 - 1) * hz);
    if (f.n.y) pnt.y = hy * 2;
    if (f.n.z) pnt.z = f.n.z * hz;
    if (f.n.x) pnt.x = f.n.x * hx;
    pnt.y = Math.max(0.03, pnt.y);
    pnt.addScaledVector(f.n, rr(r, -0.01, 0.02));
    const face = f.n.clone().lerp(V(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), 0.6).normalize();
    q.setFromUnitVectors(V(0, 0, 1), face).premultiply(new THREE.Quaternion().setFromAxisAngle(face, r() * TAU));
    const sz = rr(r, 0.028, 0.045);
    const k = mix(0.6, 1.08, smooth(0, 0.35, pnt.y)) * rr(r, 0.85, 1.05);
    c.setRGB(k, k, k * 0.95);
    const ids: number[] = [];
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const v = V(cx * sz, cy * sz, 0).applyQuaternion(q).add(pnt);
      const qn = V(Math.sign(v.x) * Math.max(Math.abs(v.x) - (hx - 0.1), 0), Math.sign(v.y - hy) * Math.max(Math.abs(v.y - hy) - (hy - 0.1), 0), Math.sign(v.z) * Math.max(Math.abs(v.z) - (hz - 0.1), 0));
      const n = (qn.lengthSq() > 1e-6 ? qn.normalize() : f.n.clone()).lerp(face, 0.3).addScaledVector(UP, 0.2).normalize();
      ids.push(b.v(v, n, cx < 0 ? 0 : 1, cy < 0 ? 0 : 1, c));
    }
    b.quad(ids[0], ids[1], ids[2], ids[3]);
  }
  b.addTo(g, cardMat('box'));
  // Mulch strip under the hedge.
  const mulch = new THREE.Mesh(new RoundedBoxGeometry(hx * 2 + 0.06, 0.02, hz * 2 + 0.06, 2, 0.01), soilMat());
  mulch.position.y = 0.0;
  mulch.receiveShadow = true;
  g.add(mulch);
  return g;
}

let tulipGeo: THREE.BufferGeometry | null = null;
function flowerbed(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const W = 0.74;
  const D = 0.54;
  const t = 0.045;
  const H = 0.085;
  const wood = pbr('woodDark', { repeat: [2, 0.25] });
  for (const [x, z, w, d] of [[0, D / 2 - t / 2, W, t], [0, -D / 2 + t / 2, W, t], [W / 2 - t / 2, 0, t, D - 2 * t], [-W / 2 + t / 2, 0, t, D - 2 * t]] as const) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, H, d, 2, 0.008), wood);
    m.position.set(x, H / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  // Soil: a gentle mound with clods.
  const sw = W - 2 * t + 0.01;
  const sd = D - 2 * t + 0.01;
  const soil = new THREE.PlaneGeometry(sw, sd, 14, 10);
  soil.rotateX(-Math.PI / 2);
  const sp = soil.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const z = sp.getZ(i);
    const e = Math.min(sw / 2 - Math.abs(x), sd / 2 - Math.abs(z));
    sp.setY(i, H - 0.012 + smooth(0, 0.12, e) * 0.012 + (noise2(x * 30, z * 30, 5) - 0.5) * 0.006);
  }
  soil.computeVertexNormals();
  const soilMesh = new THREE.Mesh(soil, soilMat());
  soilMesh.receiveShadow = true;
  g.add(soilMesh);
  const y0 = H - 0.005;
  const stemMat = pbr('leaves', { color: '#86a858' });
  const leaves = new Batch();
  const heads = new Batch();
  const blades = new Batch();
  const green: [THREE.Color, THREE.Color] = [new THREE.Color(0.7, 0.78, 0.68), new THREE.Color(0.95, 1, 0.9)];
  if (!tulipGeo) {
    const prof = [[0.0, 0], [0.35, 0.06], [0.55, 0.25], [0.6, 0.55], [0.52, 0.85], [0.46, 1.0]].map(([x, y]) => new THREE.Vector2(x * 0.024, y * 0.05));
    const geo = new THREE.LatheGeometry(prof, 12);
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const y = p.getY(i) / 0.05;
      p.setY(i, p.getY(i) + 0.01 * Math.pow(Math.max(0, Math.cos(3 * a)), 2) * y ** 3);
      const k = 1 + 0.07 * Math.cos(6 * a) * y;
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    weldNormals(geo);
    tulipGeo = geo;
  }
  const tulipCols = ['#C81E2A', '#E8B020', '#D84A8A', '#C81E2A'];
  const plant = (x: number, z: number, kind: 'tulip' | keyof typeof FLOWER) => {
    if (kind === 'tulip') {
      const col = pick(r, tulipCols);
      for (let k = 0; k < 3; k++) {
        const a = r() * TAU;
        const px = x + Math.cos(a) * 0.03;
        const pz = z + Math.sin(a) * 0.03;
        const h = rr(r, 0.17, 0.24);
        const top = V(px + (r() - 0.5) * 0.02, y0 + h, pz + (r() - 0.5) * 0.02);
        g.add(tube([V(px, y0, pz), top], 0.0045, 0.0035, stemMat, { rings: 1, radial: 5 }));
        const m = new THREE.Mesh(tulipGeo!, solid(`tulip${col}`, { color: col, roughness: 0.45, side: THREE.DoubleSide }));
        m.position.copy(top).add(V(0, -0.006, 0));
        m.rotation.set((r() - 0.5) * 0.3, r() * TAU, (r() - 0.5) * 0.3);
        m.castShadow = true;
        g.add(m);
        for (let l = 0; l < 2; l++) {
          const la = a + l * Math.PI + r();
          leafCardSolid(blades, V(px, y0, pz), V(Math.cos(la) * 0.35, 1, Math.sin(la) * 0.35), rr(r, 0.12, 0.16), 0.03, 0.4);
        }
      }
      return;
    }
    crown(leaves, r, { c: V(x, y0 + 0.04, z), s: V(0.06, 0.035, 0.06), count: 7, size: [0.07, 0.1], tints: green, shell: 0.3, minY: y0 + 0.01 });
    const n = kind === 'marigold' ? 3 : 4;
    for (let k = 0; k < n; k++) {
      const a = r() * TAU;
      const d = r() * 0.045;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      const h = kind === 'marigold' ? rr(r, 0.07, 0.1) : rr(r, 0.1, 0.16);
      const top = V(px, y0 + h, pz);
      g.add(tube([V(px, y0, pz), top], 0.003, 0.0025, stemMat, { rings: 1, radial: 4 }));
      const sz = kind === 'marigold' ? 0.05 : kind === 'cosmos' ? 0.065 : 0.055;
      const tilt = V((r() - 0.5) * 0.6, 1, 0.35 + r() * 0.4).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), tilt).premultiply(new THREE.Quaternion().setFromAxisAngle(tilt, r() * TAU));
      const rect = FLOWER[kind];
      const ids: number[] = [];
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const v = V((cx * sz) / 2, (cy * sz) / 2, 0).applyQuaternion(q).add(top);
        ids.push(heads.v(v, tilt.clone().lerp(UP, 0.4).normalize(), cx < 0 ? rect[0] : rect[2], cy < 0 ? rect[1] : rect[3], new THREE.Color(1, 1, 1)));
      }
      heads.quad(ids[0], ids[1], ids[2], ids[3]);
    }
  };
  const kinds: ('tulip' | keyof typeof FLOWER)[] = ['tulip', 'tulip', 'tulip', 'tulip', 'aster', 'daisy', 'cosmos', 'daisy', 'marigold', 'cosmos', 'marigold', 'aster'];
  for (let i = 0; i < 12; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    plant(-0.22 + col * 0.147 + (r() - 0.5) * 0.03, -0.14 + row * 0.13 + (r() - 0.5) * 0.02, kinds[i]);
  }
  leaves.addTo(g, cardMat('green'));
  heads.addTo(g, cardMat('flowers'));
  blades.addTo(g, solid('blade', { color: '#5a8a3c', roughness: 0.55, vertexColors: true }));
  const gb = new Batch();
  grassTufts(gb, r, [[0.4, 0.3], [-0.4, 0.3], [0.4, -0.3], [-0.42, -0.25]], 8, 0.06);
  gb.addTo(g, grassMat());
  return g;
}

/** A long blade leaf (tulip): narrow at both ends, arching outward. */
function leafCardSolid(b: Batch, base: THREE.Vector3, dir: THREE.Vector3, len: number, wid: number, arch: number) {
  const d = dir.clone().normalize();
  const side = V().crossVectors(d, UP).normalize();
  const out = V(d.x, 0, d.z).normalize();
  const c = new THREE.Color();
  b.grid(4, 2, (i, j) => {
    const t = i / 4;
    const s = j - 1;
    const w = (wid / 2) * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.15)) * s;
    const p = base.clone().addScaledVector(d, len * t).addScaledVector(out, arch * len * t * t).addScaledVector(side, w).add(V(0, -arch * len * t * t * 0.5 + Math.abs(s) * 0.004, 0));
    const k = mix(0.7, 1.1, t);
    c.setRGB(k, k, k);
    return { p, n: out.clone().add(V(0, 1, 0)).normalize(), u: (s + 1) / 2, v: t, c };
  });
}

/** One crystal: an irregular hexagonal prism with a pyramid tip (flat shaded), its base buried. */
function prismGeo(r: Rng, rad: number, h: number, tip: number, sides = 6): THREE.BufferGeometry {
  const ring = Array.from({ length: sides }, (_, k) => {
    const a = (k / sides) * TAU + (r() - 0.5) * 0.25;
    const rr2 = rad * rr(r, 0.82, 1.15);
    return [Math.cos(a) * rr2, Math.sin(a) * rr2] as const;
  });
  const apex = V((r() - 0.5) * rad * 0.3, h + tip, (r() - 0.5) * rad * 0.3);
  const pos: number[] = [];
  const uv: number[] = [];
  const push = (v: THREE.Vector3, vv: number) => {
    pos.push(v.x, v.y, v.z);
    uv.push(0, vv);
  };
  for (let k = 0; k < sides; k++) {
    const [x0, z0] = ring[k];
    const [x1, z1] = ring[(k + 1) % sides];
    const topY0 = h * rr(r, 0.97, 1.03);
    const a0 = V(x0, -0.06, z0);
    const a1 = V(x1, -0.06, z1);
    const b0 = V(x0 * 0.92, topY0, z0 * 0.92);
    const b1 = V(x1 * 0.92, topY0, z1 * 0.92);
    push(a0, 0); push(b1, 0.8); push(a1, 0);
    push(a0, 0); push(b0, 0.8); push(b1, 0.8);
    push(b0, 0.8); push(apex, 1); push(b1, 0.8);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function crystalPiece(g: THREE.Group, r: Rng, at: THREE.Vector3, rad: number, h: number, tilt: number, dir: number, color: string, glow = 0.55) {
  const piece = new THREE.Group();
  const outer = new THREE.Mesh(prismGeo(r, rad, h, rad * rr(r, 1.4, 2.0)), pbr('crystal', { color, glow, opacity: 0.72 }));
  const core = new THREE.Mesh(prismGeo(r, rad * 0.42, h * 0.85, rad * 0.8), crystalCoreMat(color));
  piece.add(outer, core);
  piece.position.copy(at);
  piece.rotation.set(Math.sin(dir) * tilt, r() * TAU * 0, -Math.cos(dir) * tilt, 'XYZ');
  g.add(piece);
}

function crystal(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const base = boulder(g, r, 0.3, 0, 0, 4, 0.42, 0.25, new THREE.Color(0.85, 0.9, 1.0));
  base.scale.set(1.05, 1, 0.95);
  const cols = ['#2EC8FF', '#8A5CFF', '#36E8C0', '#4A7CFF'];
  crystalPiece(g, r, V(0, 0.05, 0), 0.105, 0.92, 0.04, 0.5, cols[0], 0.9);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.5;
    const d = rr(r, 0.1, 0.18);
    crystalPiece(g, r, V(Math.cos(a) * d, 0.04, Math.sin(a) * d), rr(r, 0.045, 0.07), rr(r, 0.3, 0.6), rr(r, 0.3, 0.6), a, cols[(i % 3) + 1], 0.8);
  }
  for (let i = 0; i < 5; i++) {
    const a = r() * TAU;
    const d = rr(r, 0.25, 0.36);
    crystalPiece(g, r, V(Math.cos(a) * d, 0.0, Math.sin(a) * d), rr(r, 0.02, 0.03), rr(r, 0.08, 0.15), rr(r, 0.4, 0.8), a, pick(r, cols), 0.5);
  }
  return g;
}

function crystals(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const base = boulder(g, r, 0.27, 0, 0, 4, 0.38, 0.4);
  base.scale.set(1.1, 1, 1);
  (
    [
      [0, 0.0, 0.55, 0.11, '#3CCBFF', 0.08, 0],
      [-0.15, 0.06, 0.38, 0.08, '#B45CFF', 0.45, Math.PI],
      [0.15, -0.05, 0.42, 0.085, '#FF5CE6', 0.4, 0],
      [0.06, 0.16, 0.3, 0.065, '#9CF03C', 0.5, Math.PI / 2],
      [-0.06, -0.14, 0.32, 0.06, '#3CCBFF', 0.45, -Math.PI / 2],
      [0.24, -0.02, 0.12, 0.03, '#3CCBFF', 0.9, 0.2],
      [-0.24, 0.08, 0.1, 0.028, '#9CF03C', 0.9, 3.0],
      [0.02, -0.24, 0.12, 0.03, '#B45CFF', 0.8, -1.4],
      [0.12, 0.22, 0.1, 0.025, '#FF5CE6', 0.8, 1.3],
      [0.2, 0.14, 0.16, 0.04, '#B45CFF', 0.7, 0.6],
      [-0.22, -0.1, 0.14, 0.035, '#FF5CE6', 0.7, 3.6],
      [-0.12, 0.2, 0.15, 0.035, '#3CCBFF', 0.7, 2.2],
    ] as const
  ).forEach(([x, z, h, rad, c, tilt, dir]) => crystalPiece(g, r, V(x, 0.06, z), rad, h, tilt, dir, c, 0.9));
  return g;
}

let pumpkinGeos: THREE.BufferGeometry[] | null = null;
function pumpkinGeo(R: number, ribs: number, hk: number, base: THREE.Color, seed: number): THREE.BufferGeometry {
  const nLon = ribs * 4;
  const nLat = 12;
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= nLat; i++) {
    const phi = (i / nLat) * Math.PI;
    for (let j = 0; j <= nLon; j++) {
      const th = (j / nLon) * TAU;
      const lobe = Math.pow(Math.abs(Math.cos((th * ribs) / 2)), 0.35);
      const rad = R * (0.88 + 0.12 * lobe);
      let y = R * hk * Math.cos(phi);
      y -= R * 0.32 * (1 - smooth(0, 0.55, phi));
      y += R * 0.2 * (1 - smooth(0, 0.5, Math.PI - phi));
      const x = rad * Math.sin(phi) * Math.cos(th);
      const z = rad * Math.sin(phi) * Math.sin(th);
      pos.push(x, y, z);
      uv.push((j / nLon) * ribs, i / nLat);
      const c = base.clone().multiplyScalar(0.85 + 0.3 * lobe);
      c.lerp(new THREE.Color(0.3, 0.12, 0.02), (1 - lobe) * 0.55);
      c.multiplyScalar(0.9 + 0.2 * noise2(th * 4 + seed, phi * 6, 3));
      c.lerp(new THREE.Color(0.2, 0.18, 0.04), smooth(0.35, 0.0, phi) * 0.7);
      c.lerp(new THREE.Color(0.75, 0.45, 0.1), smooth(2.8, Math.PI, phi) * 0.4);
      col.push(c.r, c.g, c.b);
    }
  }
  const w = nLon + 1;
  for (let i = 0; i < nLat; i++)
    for (let j = 0; j < nLon; j++) {
      const a = i * w + j;
      idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  weldNormals(g);
  // Rests on its bottom.
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox!.min.y - 0.004, 0);
  return g;
}
function pumpkin(r: Rng): THREE.Group {
  const g = new THREE.Group();
  if (!pumpkinGeos)
    pumpkinGeos = [
      pumpkinGeo(0.19, 10, 0.72, new THREE.Color(1.0, 0.3, 0.015), 1),
      pumpkinGeo(0.15, 10, 0.78, new THREE.Color(1.0, 0.42, 0.03), 2),
      pumpkinGeo(0.11, 9, 0.8, new THREE.Color(0.95, 0.24, 0.01), 3),
    ];
  const mat = streakMat('pumpkin', 0.5, 'v');
  const stemMat = pbr('bark', { color: '#c9c49a' });
  const spots: [number, number, number][] = [[-0.14, 0.04, 0], [0.21, -0.12, 1], [0.12, 0.24, 2]];
  for (const [x, z, k] of spots) {
    const geo = pumpkinGeos[k];
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 0, z);
    m.rotation.y = r() * TAU;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    geo.computeBoundingBox();
    const topY = geo.boundingBox!.max.y;
    const R = [0.19, 0.15, 0.11][k];
    const s0 = V(x, topY - R * 0.3, z);
    const lean = V((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.04);
    const stem = ribTube([s0, s0.clone().add(V(0, R * 0.42, 0)).add(lean), s0.clone().add(V(0, R * 0.5, 0)).add(lean.clone().multiplyScalar(2.5))], (u) => R * 0.12 * (1 - u * 0.3) * (1 + 0.5 * smooth(0.2, 0, u)), 5, 0.25, { rings: 4, radial: 15 });
    const sm = new THREE.Mesh(stem, stemMat);
    sm.castShadow = true;
    g.add(sm);
  }
  // Vines along the ground with tendrils.
  const vineMat = pbr('leaves', { color: '#7f9a48' });
  const vines = [
    [V(-0.14, 0.2, 0.0), V(-0.3, 0.02, -0.1), V(-0.2, 0.01, -0.3), V(0.05, 0.01, -0.32), V(0.25, 0.08, -0.15)],
    [V(0.12, 0.13, 0.24), V(0.3, 0.015, 0.25), V(0.4, 0.01, 0.05), V(0.33, 0.01, -0.3)],
    [V(-0.2, 0.01, -0.3), V(-0.38, 0.01, 0.0), V(-0.35, 0.01, 0.3), V(-0.1, 0.01, 0.35)],
  ];
  const lb = new Batch();
  for (const v of vines) {
    g.add(tube(v, 0.009, 0.006, vineMat, { rings: 14, radial: 5 }));
    const curve = new THREE.CatmullRomCurve3(v);
    for (const u of [0.35, 0.7]) {
      const p = curve.getPointAt(u);
      const pts = Array.from({ length: 8 }, (_, i) => p.clone().add(V(Math.cos(i * 1.6) * 0.012 * (1 - i / 9), i * 0.008, Math.sin(i * 1.6) * 0.012 * (1 - i / 9))));
      g.add(tube(pts, 0.0025, 0.0012, vineMat, { rings: 7, radial: 3, caps: false }));
    }
    // Leaves on petioles.
    for (const u of [0.25, 0.55, 0.9]) {
      const p = curve.getPointAt(u);
      if (Math.hypot(p.x - 0.12, p.z - 0.24) < 0.14 || (Math.abs(p.x + 0.14) < 0.18 && Math.abs(p.z - 0.04) < 0.18 && p.z > 0)) continue;
      const h = rr(r, 0.1, 0.2);
      const top = p.clone().add(V((r() - 0.5) * 0.05, h, (r() - 0.5) * 0.05));
      g.add(tube([p, p.clone().lerp(top, 0.6).add(V(0, 0.02, 0)), top], 0.006, 0.004, vineMat, { rings: 5, radial: 4 }));
      const a = r() * TAU;
      const L = rr(r, 0.2, 0.26);
      const out = V(Math.cos(a), rr(r, 0.2, 0.6), Math.sin(a)).normalize();
      const side = V().crossVectors(out, UP).normalize();
      const up = V().crossVectors(side, out).normalize();
      const nn = up.clone().addScaledVector(UP, 0.4).normalize();
      const col = new THREE.Color(1, 1, 1).multiplyScalar(rr(r, 0.85, 1.05));
      lb.grid(3, 3, (i, j) => {
        const s = (j / 3) * 2 - 1;
        const t = (i / 3) * 2 - 1;
        const pp = top.clone().addScaledVector(out, (t * L) / 2).addScaledVector(side, (s * L) / 2).addScaledVector(up, 0.08 * L * (s * s + t * t) - 0.06 * L * Math.max(0, t));
        return { p: pp, n: nn, u: (s + 1) / 2, v: (t + 1) / 2, c: col.clone().multiplyScalar(0.9 + 0.1 * (1 - Math.abs(s))) };
      });
    }
  }
  lb.addTo(g, cardMat('pumpkinLeaf'));
  const gb = new Batch();
  grassTufts(gb, r, [[0.38, 0.38], [-0.38, 0.32], [0.0, -0.4]], 8, 0.07, 0.5);
  gb.addTo(g, grassMat());
  return g;
}

function snowman(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const snow = pbr('snow', { repeat: [2, 2] });
  const ball = (R: number, y: number, seed: number, segs: number) => {
    const geo = new THREE.SphereGeometry(R, segs, Math.round(segs * 0.7));
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const v = V();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i));
      const n = v.clone().normalize();
      const d = (fbm(n.x * 2.5 + seed, n.y * 2.5 + n.z * 2, seed, 3) - 0.5) * 0.1 + (noise2(n.x * 9 + seed, n.z * 9 + n.y * 5, seed + 1) - 0.5) * 0.025;
      v.multiplyScalar(1 + d);
      // Flattened where it sits / where the next ball presses.
      if (v.y < -R * 0.82) v.y = -R * 0.82 + (v.y + R * 0.82) * 0.15;
      if (v.y > R * 0.86) v.y = R * 0.86 + (v.y - R * 0.86) * 0.3;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    weldNormals(geo);
    const m = new THREE.Mesh(geo, snow);
    m.position.y = y;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  ball(0.22, 0.18, 1, 24);
  ball(0.16, 0.47, 2, 22);
  ball(0.115, 0.7, 3, 20);
  // Snow pile around the base.
  const pile = new THREE.LatheGeometry([0, 0.12, 0.22, 0.3, 0.36].map((x, i) => new THREE.Vector2(x, [0.05, 0.045, 0.03, 0.012, 0][i])), 28, 0, TAU);
  const pp = pile.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i);
    const z = pp.getZ(i);
    const k = 1 + (noise2(Math.atan2(z, x) * 3 + 2, 1, 9) - 0.5) * 0.35;
    pp.setXYZ(i, x * k, pp.getY(i) * k, z * k);
  }
  weldNormals(pile);
  const pm = new THREE.Mesh(pile, snow);
  pm.receiveShadow = true;
  g.add(pm);
  // Coal: eyes, smile, buttons.
  const coal = solid('coal', { color: '#151515', roughness: 0.45, metalness: 0.15 });
  const lump = (R: number) => {
    const geo = new THREE.IcosahedronGeometry(R, 0);
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rr(r, 0.8, 1.2), p.getY(i) * rr(r, 0.8, 1.2), p.getZ(i) * rr(r, 0.8, 1.2));
    geo.computeVertexNormals();
    return geo;
  };
  const onBall = (cy: number, R: number, yaw: number, pitch: number, size: number) => {
    const d = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const m = new THREE.Mesh(lump(size), coal);
    m.position.set(d.x * R * 0.98, cy + d.y * R * 0.98, d.z * R * 0.98);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    g.add(m);
  };
  for (const s of [-1, 1]) onBall(0.7, 0.115, s * 0.36, 0.28, 0.013);
  for (let i = 0; i < 5; i++) onBall(0.7, 0.115, (i - 2) * 0.2, -0.3 + Math.abs(i - 2) * 0.07, 0.008);
  for (let i = 0; i < 3; i++) onBall(0.47, 0.16, 0.02, 0.5 - i * 0.38, 0.013);
  // Carrot nose.
  const carrot = solid('carrot', { color: '#E06A1A', roughness: 0.6 });
  g.add(tube([V(0, 0.69, 0.09), V(0.005, 0.685, 0.16), V(0.015, 0.67, 0.22)], 0.016, 0.002, carrot, { rings: 12, radial: 8, section: (u) => 1 - 0.12 * Math.pow(Math.abs(Math.sin(u * Math.PI * 7)), 8) }));
  // Knitted scarf: a loop around the neck and a hanging tail with a fringe.
  const wool = pbr('fabric', { color: '#A3222A', repeat: [4, 2] });
  const loop = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * TAU;
    return V(Math.cos(a) * 0.112, 0.598 + Math.sin(a * 2 + 1) * 0.006 + Math.cos(a) * 0.004, Math.sin(a) * 0.112);
  });
  g.add(tube(loop, 0.018, 0.018, wool, { closed: true, rings: 30, radial: 8, caps: false, up: V(0, 1, 0), section: (u) => 1 + 0.12 * Math.sin(u * 40) }));
  const tailPts = [V(0.07, 0.6, 0.09), V(0.09, 0.56, 0.12), V(0.105, 0.5, 0.135), V(0.11, 0.43, 0.13)];
  const { geometry: tail } = loft({
    curve: new THREE.CatmullRomCurve3(tailPts),
    rings: 10,
    radial: 8,
    up: V(0.5, 0, 1).normalize(),
    section: () => ({ rx: 0.026, ry: 0.006 }),
  });
  const tm = new THREE.Mesh(tail, wool);
  tm.castShadow = true;
  g.add(tm);
  for (let i = 0; i < 6; i++) {
    const x = 0.11 - 0.022 + i * 0.009;
    const tz = 0.134 + (i - 2.5) * -0.002;
    g.add(tube([V(x - 0.001, 0.432, tz), V(x + (r() - 0.5) * 0.004, 0.405, tz + 0.003)], 0.0025, 0.002, wool, { rings: 1, radial: 4 }));
  }
  // Stick arms with little forks.
  const bark = pbr('bark', { color: '#c4ac98' });
  for (const s of [-1, 1]) {
    const pts = [V(s * 0.12, 0.5, 0), V(s * 0.2, 0.55, 0.01), V(s * 0.29, 0.6, 0.0), V(s * 0.37, 0.67, 0.02)];
    g.add(tube(pts, 0.009, 0.004, bark, { rings: 8, radial: 5 }));
    const c = new THREE.CatmullRomCurve3(pts);
    for (const [u, dy, dx] of [[0.7, 0.07, 0.02], [0.85, -0.01, 0.06]] as const) {
      const p = c.getPointAt(u);
      g.add(tube([p, p.clone().add(V(s * dx, dy, 0.01))], 0.004, 0.0015, bark, { rings: 1, radial: 4 }));
    }
  }
  // Old felt top hat, slightly tilted.
  const felt = pbr('fabric', { color: '#2A2624', repeat: [3, 1] });
  const hatProf = [[0, 0], [0.11, 0], [0.115, 0.006], [0.112, 0.012], [0.072, 0.012], [0.07, 0.03], [0.072, 0.115], [0.068, 0.122], [0, 0.122]].map(([x, y]) => new THREE.Vector2(x, y));
  const hat = new THREE.Mesh(new THREE.LatheGeometry(hatProf, 24), felt);
  hat.position.set(0.01, 0.79, -0.01);
  hat.rotation.set(-0.08, 0, -0.15);
  hat.castShadow = true;
  g.add(hat);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0715, 0.071, 0.02, 24, 1, true), wool);
  band.position.set(0, 0.025, 0);
  hat.add(band);
  return g;
}

const BUILDERS: Record<string, (r: Rng) => THREE.Group> = {
  pine,
  bush,
  apple,
  palm,
  sakura,
  crystal,
  autumn,
  bamboo,
  cactus,
  sunflower,
  rock,
  hedge,
  flowerbed,
  crystals,
  pumpkin,
  snowman,
};

/** Builds one object of this family, or null if the id isn't one of them. */
export function buildNature(id: string): THREE.Group | null {
  const make = BUILDERS[id];
  if (!make) return null;
  const g = make(rng(seedOf(id)));
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
