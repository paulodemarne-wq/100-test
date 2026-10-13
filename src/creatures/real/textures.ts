// Procedural skin textures (color, relief, shine), drawn pixel by pixel so they work on the phone without a canvas.
import * as THREE from 'three';
import { clamp01, fbm, glowLines, hex, mix, noise2, smooth } from './noise';

export type Skin = { map: THREE.DataTexture; normalMap: THREE.DataTexture; roughnessMap: THREE.DataTexture; glowMap: THREE.DataTexture | null };

function texture(data: Uint8Array, w: number, h: number, srgb: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Builds the 3 textures from per-pixel color, height and roughness. */
export function bake(
  w: number,
  h: number,
  pixel: (u: number, v: number) => { c: [number, number, number]; height: number; rough: number; glow?: number },
  bumpScale = 3,
  wrapU = false,
): Skin {
  const color = new Uint8Array(w * h * 4);
  const rough = new Uint8Array(w * h * 4);
  const heights = new Float32Array(w * h);
  let glow: Uint8Array | null = null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = pixel((x + 0.5) / w, (y + 0.5) / h);
      color[i * 4] = p.c[0];
      color[i * 4 + 1] = p.c[1];
      color[i * 4 + 2] = p.c[2];
      color[i * 4 + 3] = 255;
      const r = Math.round(clamp01(p.rough) * 255);
      // three.js reads roughness from the green channel.
      rough[i * 4] = r;
      rough[i * 4 + 1] = r;
      rough[i * 4 + 2] = r;
      rough[i * 4 + 3] = 255;
      heights[i] = p.height;
      if (p.glow && p.glow > 0) {
        glow ??= new Uint8Array(w * h * 4);
        const g = Math.round(clamp01(p.glow) * 255);
        glow[i * 4] = g;
        glow[i * 4 + 1] = g;
        glow[i * 4 + 2] = g;
      }
    }
  }
  const normal = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xl = wrapU ? (x - 1 + w) % w : Math.max(0, x - 1);
      const xr = wrapU ? (x + 1) % w : Math.min(w - 1, x + 1);
      const yd = (y - 1 + h) % h;
      const yu = (y + 1) % h;
      const dx = (heights[y * w + xr] - heights[y * w + xl]) * bumpScale;
      const dy = (heights[yu * w + x] - heights[yd * w + x]) * bumpScale;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      normal[i] = Math.round((-dx / l) * 127.5 + 127.5);
      normal[i + 1] = Math.round((-dy / l) * 127.5 + 127.5);
      normal[i + 2] = Math.round((1 / l) * 127.5 + 127.5);
      normal[i + 3] = 255;
    }
  }
  if (glow) for (let i = 3; i < glow.length; i += 4) glow[i] = 255;
  return {
    map: texture(color, w, h, true),
    normalMap: texture(normal, w, h, false),
    roughnessMap: texture(rough, w, h, false),
    glowMap: glow ? texture(glow, w, h, false) : null,
  };
}

type RGB = [number, number, number];
const lerpRGB = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const shade = (c: RGB, k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];

export type SnakePattern = 'python' | 'bands' | 'emerald' | 'diamond' | 'cobra' | 'viper';

export type SnakeSkinOptions = {
  pattern: SnakePattern;
  base: string;
  dark: string;
  light: string;
  belly: string;
  seed: number;
  /** Scale rows along the body and around it (around must be even). */
  rows?: number;
  around?: number;
  /** Where the head starts (fraction of the length). */
  head?: number;
  /** 0..1: glossier, richer scales (the majestic adult). */
  shine?: number;
  /** Glowing markings (legend). */
  marks?: boolean;
};

/** Snake skin: overlapping scales colored scale by scale, wide plates under the belly. u = along the body, v = around. */
export function snakeSkin(o: SnakeSkinOptions, w = 1024, h = 128): Skin {
  const rows = o.rows ?? 200;
  const around = o.around ?? 26;
  const headU = o.head ?? 0.93;
  const base = hex(o.base) as RGB;
  const dark = hex(o.dark) as RGB;
  const light = hex(o.light) as RGB;
  const belly = hex(o.belly) as RGB;
  const shine = o.shine ?? 0;

  // Body pattern, sampled once per scale (snakes are colored scale by scale).
  const pattern = (u: number, v: number): RGB => {
    const top = Math.cos((v - 0.25) * Math.PI * 2); // 1 on the spine, -1 under the belly
    const side = Math.abs(Math.sin((v - 0.25) * Math.PI * 2));
    const L = u * rows;
    switch (o.pattern) {
      case 'python': {
        // Big dark blotches with lighter centers, broken by noise ("ball python").
        const n = fbm(L * 0.09, v * 7, o.seed, 4, 0, 7);
        const blotch = smooth(0.48, 0.56, n + top * 0.08);
        const inner = smooth(0.6, 0.66, n + top * 0.05);
        let c = lerpRGB(base, dark, blotch);
        c = lerpRGB(c, light, inner * 0.65);
        const sideSpot = smooth(0.62, 0.7, fbm(L * 0.15, v * 9, o.seed + 7, 3, 0, 9)) * side;
        return lerpRGB(c, light, sideSpot * 0.7);
      }
      case 'bands': {
        // Rings: dark / light / base, slightly irregular (king snake).
        const k = (L * 0.055 + fbm(L * 0.03, v * 3, o.seed, 2, 0, 3) * 0.6) % 1;
        if (k < 0.16) return dark;
        if (k < 0.27) return light;
        if (k < 0.43) return dark;
        return base;
      }
      case 'emerald': {
        // Green with white marks along the spine (emerald tree boa).
        const mark = smooth(0.35, 0.45, top) * smooth(0.55, 0.62, fbm(L * 0.12, v * 10, o.seed, 3, 0, 10));
        const c = lerpRGB(base, dark, smooth(0.2, -0.6, top) * 0.5);
        return lerpRGB(c, light, mark);
      }
      case 'diamond': {
        // Diamonds along the back, outlined in light (rattlesnake).
        const k = (L * 0.045) % 1;
        const across = Math.abs(v - 0.25) * 4;
        const d = Math.abs(k - 0.5) * 2 + across * 1.3;
        const ring = smooth(0.78, 0.86, d) * (1 - smooth(0.92, 1.0, d));
        const fill = 1 - smooth(0.72, 0.8, d);
        let c = lerpRGB(base, dark, fill);
        c = lerpRGB(c, light, ring);
        return lerpRGB(c, shade(base, 0.8), smooth(1.2, 1.6, across) * 0.6);
      }
      case 'cobra': {
        // Dark olive with pale chevrons (king cobra).
        const k = (L * 0.05 + Math.abs(v - 0.25) * 0.6) % 1;
        const chev = smooth(0.0, 0.05, k) * (1 - smooth(0.1, 0.16, k));
        const c = lerpRGB(base, dark, smooth(0.6, -0.2, top) * 0.3);
        return lerpRGB(c, light, chev * 0.75 * smooth(0.25, 0.8, u));
      }
      case 'viper': {
        // Zigzag along the spine (european adder).
        const zig = Math.abs(((L * 0.06) % 1) - 0.5) * 0.18;
        const d = Math.abs(v - 0.25 - zig + 0.045);
        const line = 1 - smooth(0.035, 0.05, d);
        const dots = smooth(0.6, 0.66, fbm(L * 0.12, v * 8, o.seed, 2, 0, 8)) * side;
        return lerpRGB(lerpRGB(base, dark, line), dark, dots * 0.8);
      }
    }
  };

  return bake(w, h, (u, v) => {
    const top = Math.cos((v - 0.25) * Math.PI * 2);
    const bellyAmt = smooth(-0.8, -0.93, top);
    const inHead = u > headU;
    // Hexagonal scale grid (elongated along the body), offset every other row.
    const sx = u * rows * (inHead ? 0.45 : 1);
    const sy = v * around * (inHead ? 0.7 : 1);
    let best = 9;
    let second = 9;
    let cx = 0;
    let cy = 0;
    const ix = Math.floor(sx);
    for (let dx = -1; dx <= 1; dx++) {
      const col = ix + dx;
      const off = col % 2 === 0 ? 0 : 0.5;
      const iy = Math.floor(sy - off);
      for (let dy = -1; dy <= 1; dy++) {
        const px = col + 0.5;
        const py = iy + dy + off + 0.5;
        // Scales overlap toward the tail: a teardrop distance.
        const ex = (sx - px) * 1.25;
        const ey = sy - py;
        const d = Math.hypot(ex + Math.max(0, ex) * 0.4, ey * 1.15);
        if (d < best) {
          second = best;
          best = d;
          cx = px;
          cy = py;
        } else if (d < second) second = d;
      }
    }
    const edge = smooth(0.0, 0.16, second - best); // 0 on the seam between scales
    const dome = 1 - best * best * 0.9;
    const cu = cx / (rows * (inHead ? 0.45 : 1));
    const cv = cy / (around * (inHead ? 0.7 : 1));
    // Mostly the smooth pattern, a little "scale by scale" so it doesn't look pixelated.
    const pc = pattern(cu, ((cv % 1) + 1) % 1);
    const pp = pattern(u, v);
    let c = lerpRGB(pp, pc, 0.35);
    // Belly plates: wide transverse scutes.
    if (bellyAmt > 0) {
      const plate = (u * rows * 0.5) % 1;
      const plateEdge = smooth(0.0, 0.18, plate) * smooth(1.0, 0.9, plate);
      const bc = shade(belly, 0.85 + plate * 0.2);
      c = lerpRGB(c, bc, bellyAmt);
      const hgt = mix(dome * edge, plate * 0.8 * plateEdge, bellyAmt);
      return { c: shade(c, mix(0.72 + edge * 0.28, 0.9, bellyAmt)), height: hgt, rough: 0.5 - shine * 0.2 };
    }
    // Each scale a touch different, darker seams, lighter scale tips.
    const jitter = 0.9 + noise2(cx * 3.1, cy * 3.7, o.seed + 3) * 0.2;
    c = shade(c, jitter * (0.74 + 0.26 * edge) * (0.92 + dome * 0.12));
    // Head: darker eye stripe on pythons and vipers.
    if (inHead && (o.pattern === 'python' || o.pattern === 'viper')) {
      const stripe = 1 - smooth(0.02, 0.05, Math.abs(Math.abs(v - 0.25) - 0.17));
      c = lerpRGB(c, dark, stripe * smooth(headU, headU + 0.02, u) * 0.85);
    }
    const glow = o.marks ? glowLines(u * rows * 0.025, v * 5, o.seed + 50, 5, 0.055) * smooth(-0.35, 0.25, top) : 0;
    return { c, height: dome * edge, rough: mix(0.62, 0.34, edge * dome) - shine * 0.18, glow };
  }, 2.2);
}

/** A round eye: iris color, black pupil (round or a slit), glossy. u/v cover the sphere; the pupil faces +z. */
export function eyeTexture(iris: string, slit: boolean, size = 128): THREE.DataTexture {
  const c = hex(iris) as RGB;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // SphereGeometry: u around (x), v from top to bottom; +z faces u = 0.25... we place the eye looking along +z.
      const u = x / size;
      const v = y / size;
      const theta = u * Math.PI * 2;
      const phi = v * Math.PI;
      const px = -Math.cos(theta) * Math.sin(phi);
      const py = Math.cos(phi);
      const pz = Math.sin(theta) * Math.sin(phi);
      const r = Math.hypot(px, py);
      let col: RGB = [20, 16, 12];
      if (pz > 0) {
        const irisR = 0.78;
        if (r < irisR) {
          const ring = r / irisR;
          const fib = 0.75 + 0.25 * noise2(Math.atan2(py, px) * 8, ring * 6, 5);
          col = shade(c, (1.15 - ring * 0.5) * fib);
          const pupil = slit ? Math.abs(px) < 0.09 * (1 - Math.abs(py) * 0.4) && Math.abs(py) < 0.72 : r < 0.32;
          if (pupil) col = [8, 6, 6];
          if (r > irisR - 0.06) col = shade(col, 0.4);
        }
      }
      const i = (y * size + x) * 4;
      data[i] = col[0];
      data[i + 1] = col[1];
      data[i + 2] = col[2];
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
