// Realistic PBR materials shared by every island object (wood, stone, brick, roof tiles, thatch, metal, fabric…).
// Textures are drawn once (procedurally, no image files) and cached, so a whole island uses a handful of them.
import * as THREE from 'three';
import { fbm, hex, mix, noise2, smooth } from '../../creatures/real/noise';
import { bake, Skin } from '../../creatures/real/textures';

export type MaterialName =
  | 'wood' // planks, warm
  | 'woodDark'
  | 'woodPainted' // planks with paint (tint with color)
  | 'bark'
  | 'stone' // stone blocks wall
  | 'rock' // raw rock
  | 'cobble'
  | 'brick'
  | 'plaster' // rendered wall (tint with color)
  | 'roofTiles' // terracotta tiles (tint)
  | 'slate'
  | 'thatch'
  | 'metal' // painted metal (tint)
  | 'iron' // dark wrought iron
  | 'gold'
  | 'copper'
  | 'fabric' // canvas / cloth (tint)
  | 'rope'
  | 'glass'
  | 'snow'
  | 'ice'
  | 'leaves' // generic foliage surface (tint)
  | 'grass'
  | 'sand'
  | 'water'
  | 'crystal' // glowing crystal (tint)
  | 'plastic' // glossy toy plastic (tint)
  | 'rubber';

type RGB = [number, number, number];
const shade = (c: RGB, k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

const skins = new Map<string, Skin>();
const mats = new Map<string, THREE.Material>();

function wrap(t: THREE.Texture, repeat: [number, number]) {
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
}

/** The texture set of a material (grey-ish where meant to be tinted by `color`). */
function skinFor(name: MaterialName): Skin | null {
  const cached = skins.get(name);
  if (cached) return cached;
  const S = 256;
  let s: Skin | null = null;
  switch (name) {
    case 'wood':
    case 'woodDark':
    case 'woodPainted': {
      const base: RGB = name === 'wood' ? [150, 104, 64] : name === 'woodDark' ? [86, 58, 38] : [225, 225, 225];
      s = bake(S, S, (u, v) => {
        // 4 planks across, grain along u, knots, gaps between planks.
        const plank = Math.floor(v * 4);
        const pv = v * 4 - plank;
        const off = noise2(plank * 3.7, 1, 9) * 3;
        const grain = fbm(u * 3 + off, pv * 30 + plank * 5, 11, 4);
        const ring = Math.abs(Math.sin((grain * 12 + u * 2) * Math.PI)) ;
        const knot = smooth(0.08, 0.0, Math.hypot((u * 4 + off) % 1 - 0.5, (pv - 0.5) * 0.6)) * (noise2(plank, Math.floor(u * 4 + off), 3) > 0.7 ? 1 : 0);
        const gap = smooth(0.0, 0.06, pv) * smooth(1.0, 0.94, pv);
        const paintWear = name === 'woodPainted' ? smooth(0.68, 0.75, fbm(u * 8, v * 8, 4, 3)) : 0;
        let c = shade(base, (0.78 + ring * 0.22 - knot * 0.35) * (0.45 + 0.55 * gap) * (0.9 + noise2(plank, 2, 5) * 0.2));
        if (paintWear) c = lerp3(c, [130, 92, 58], paintWear);
        return { c, height: gap * 0.8 + ring * 0.15, rough: name === 'woodPainted' ? 0.6 : 0.85 };
      }, 3, true);
      break;
    }
    case 'bark':
      s = bake(S, S, (u, v) => {
        const ridge = Math.abs(Math.sin(v * 40 + fbm(u * 6, v * 3, 5, 3, 6, 3) * 6));
        return { c: shade([92, 72, 56], 0.55 + ridge * 0.55), height: ridge, rough: 1 };
      }, 4, true);
      break;
    case 'stone':
    case 'brick': {
      const isBrick = name === 'brick';
      const rows = isBrick ? 8 : 5;
      const base: RGB = isBrick ? [150, 70, 52] : [150, 145, 136];
      s = bake(S, S, (u, v) => {
        const row = Math.floor(v * rows);
        const cols = isBrick ? 4 : 3;
        const x = u * cols + (row % 2) * 0.5 + (isBrick ? 0 : noise2(row, 1, 4) * 0.4);
        const col = Math.floor(x);
        const fx = x - col;
        const fy = v * rows - row;
        const mortar = smooth(0.0, isBrick ? 0.06 : 0.08, Math.min(fx, 1 - fx, fy * 1.4, (1 - fy) * 1.4));
        const id = noise2(col * 1.3, row * 2.1, 7);
        const n = fbm(u * 10, v * 10, 13, 4);
        const c = mortar < 0.5 ? (shade([190, 184, 172], 0.9 + n * 0.2) as RGB) : shade(base, 0.75 + id * 0.35 + (n - 0.5) * 0.3);
        return { c, height: mortar * (0.8 + n * 0.3), rough: 0.9 };
      }, 3, true);
      break;
    }
    case 'rock':
      s = bake(S, S, (u, v) => {
        const n = fbm(u * 8, v * 8, 21, 5, 8, 8);
        const lichen = smooth(0.62, 0.7, fbm(u * 5 + 3, v * 5, 22, 3, 5, 5));
        return { c: lerp3(shade([128, 124, 116], 0.65 + n * 0.55), [118, 128, 80], lichen * 0.55), height: n, rough: 0.92 };
      }, 4, true);
      break;
    case 'cobble':
      s = bake(S, S, (u, v) => {
        // Rounded cobbles: distance to a jittered grid.
        const gx = u * 6;
        const gy = v * 6;
        let best = 9;
        let id = 0;
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++) {
            const cx = Math.floor(gx) + dx;
            const cy = Math.floor(gy) + dy;
            const px = cx + 0.5 + (noise2(cx, cy, 31) - 0.5) * 0.5;
            const py = cy + 0.5 + (noise2(cx, cy, 32) - 0.5) * 0.5;
            const d = Math.hypot(gx - px, gy - py);
            if (d < best) {
              best = d;
              id = noise2(cx, cy, 33);
            }
          }
        const dome = smooth(0.55, 0.15, best);
        return { c: shade([158, 152, 142], (0.55 + dome * 0.45) * (0.8 + id * 0.35)), height: dome, rough: 0.85 };
      }, 3, true);
      break;
    case 'plaster':
      s = bake(S, S, (u, v) => {
        const n = fbm(u * 12, v * 12, 41, 4, 12, 12);
        const stain = smooth(0.62, 0.8, fbm(u * 3, v * 2 + 5, 42, 3, 3, 2)) * smooth(0.3, 0.0, v);
        return { c: shade([236, 230, 220], 0.9 + n * 0.12 - stain * 0.15), height: n * 0.4, rough: 0.95 };
      }, 3, true);
      break;
    case 'roofTiles':
    case 'slate': {
      const slate = name === 'slate';
      s = bake(S, S, (u, v) => {
        const rows = slate ? 10 : 8;
        const row = Math.floor(v * rows);
        const fy = v * rows - row;
        const x = u * (slate ? 7 : 6) + (row % 2) * 0.5;
        const fx = x - Math.floor(x);
        const id = noise2(Math.floor(x), row, 51);
        // Curved clay tiles: brighter in the middle of each tile; overlapping rows.
        const curve = slate ? 1 : 0.55 + 0.45 * Math.sin(fx * Math.PI);
        const edge = smooth(0.0, 0.12, fy) * smooth(0.0, 0.05, Math.min(fx, 1 - fx) * (slate ? 1 : 0.3));
        const base: RGB = slate ? [96, 102, 112] : [225, 225, 225];
        return { c: shade(base, (0.5 + 0.5 * edge) * curve * (0.82 + id * 0.3)), height: fy * 0.7 + curve * 0.3, rough: slate ? 0.6 : 0.8 };
      }, 3, true);
      break;
    }
    case 'thatch':
      s = bake(S, S, (u, v) => {
        const straw = fbm(u * 60, v * 3, 61, 3, 60, 3);
        const layer = (v * 6) % 1;
        return { c: shade([196, 160, 92], (0.55 + straw * 0.55) * (0.7 + 0.3 * smooth(0, 0.3, layer))), height: straw + layer * 0.4, rough: 1 };
      }, 3, true);
      break;
    case 'metal':
    case 'iron':
    case 'gold':
    case 'copper': {
      const base: RGB = name === 'gold' ? [255, 200, 90] : name === 'copper' ? [200, 120, 80] : name === 'iron' ? [70, 70, 74] : [225, 225, 225];
      s = bake(S, S, (u, v) => {
        const n = fbm(u * 16, v * 16, 71, 4, 16, 16);
        const scratch = smooth(0.92, 1, noise2(u * 200, v * 6, 72)) * 0.3;
        return { c: shade(base, 0.85 + n * 0.25 + scratch * 0.4), height: n * 0.2, rough: (name === 'metal' ? 0.45 : 0.35) + n * 0.2 };
      }, 2, true);
      break;
    }
    case 'fabric':
      s = bake(S, S, (u, v) => {
        const weave = (Math.sin(u * 400) * Math.sin(v * 400) + 1) / 2;
        const n = fbm(u * 6, v * 6, 81, 3, 6, 6);
        return { c: shade([235, 235, 235], 0.85 + weave * 0.1 + n * 0.1), height: weave * 0.3, rough: 0.95 };
      }, 2, true);
      break;
    case 'rope':
      s = bake(64, 64, (u, v) => {
        const twist = Math.abs(Math.sin((u * 8 + v * 3) * Math.PI));
        return { c: shade([190, 160, 110], 0.6 + twist * 0.45), height: twist, rough: 1 };
      }, 4, true);
      break;
    case 'snow':
    case 'sand':
    case 'grass': {
      const base: RGB = name === 'snow' ? [244, 247, 252] : name === 'sand' ? [217, 196, 154] : [94, 138, 58];
      s = bake(S, S, (u, v) => {
        const n = fbm(u * 10, v * 10, 91, 4, 10, 10);
        const fine = noise2(u * 120, v * 120, 92);
        return { c: shade(base, 0.85 + n * 0.2 + fine * 0.08), height: n * 0.5 + fine * 0.3, rough: name === 'snow' ? 0.7 : 0.95 };
      }, 2, true);
      break;
    }
    case 'leaves':
      s = bake(S, S, (u, v) => {
        const n = fbm(u * 14, v * 14, 95, 4, 14, 14);
        const leaf = smooth(0.45, 0.6, noise2(u * 40, v * 40, 96));
        return { c: shade([225, 225, 225], 0.55 + n * 0.35 + leaf * 0.2), height: leaf + n * 0.5, rough: 0.85 };
      }, 4, true);
      break;
    default:
      s = null;
  }
  if (s) skins.set(name, s);
  return s;
}

export type MatOptions = {
  /** Tint (multiplies the texture; textures meant to be tinted are light grey). */
  color?: string;
  /** How many times the texture repeats over the UV square. */
  repeat?: [number, number];
  /** Glow (emissive), e.g. lit windows, lanterns, crystals. */
  glow?: number;
  side?: THREE.Side;
  opacity?: number;
};

/** A shared realistic material. Same name + options = same material object (cached). */
export function pbr(name: MaterialName, o: MatOptions = {}): THREE.Material {
  const key = `${name}|${o.color ?? ''}|${o.repeat?.join(',') ?? ''}|${o.glow ?? 0}|${o.side ?? 0}|${o.opacity ?? 1}`;
  const hit = mats.get(key);
  if (hit) return hit;
  let m: THREE.Material;
  const color = o.color ? new THREE.Color(o.color) : new THREE.Color('#ffffff');
  const transparent = o.opacity !== undefined && o.opacity < 1;
  switch (name) {
    case 'glass':
      m = new THREE.MeshPhysicalMaterial({ color: o.color ?? '#BFD9E8', roughness: 0.05, metalness: 0, transparent: true, opacity: o.opacity ?? 0.45, clearcoat: 1, emissive: new THREE.Color(o.glow ? (o.color ?? '#FFE2A0') : '#000000'), emissiveIntensity: o.glow ?? 0, side: o.side ?? THREE.FrontSide });
      break;
    case 'water':
      m = new THREE.MeshPhysicalMaterial({ color: o.color ?? '#2A7C96', roughness: 0.08, transparent: true, opacity: o.opacity ?? 0.8, clearcoat: 1, side: o.side ?? THREE.FrontSide });
      break;
    case 'ice':
      m = new THREE.MeshPhysicalMaterial({ color: o.color ?? '#CFF4FF', roughness: 0.06, transparent: true, opacity: o.opacity ?? 0.85, clearcoat: 1, emissive: new THREE.Color('#3E8FD8'), emissiveIntensity: o.glow ?? 0.15, side: o.side ?? THREE.FrontSide });
      break;
    case 'crystal':
      m = new THREE.MeshPhysicalMaterial({ color: o.color ?? '#B98CFF', roughness: 0.08, metalness: 0.1, clearcoat: 1, flatShading: true, transparent: true, opacity: o.opacity ?? 0.9, emissive: new THREE.Color(o.color ?? '#B98CFF'), emissiveIntensity: o.glow ?? 0.5, side: o.side ?? THREE.FrontSide });
      break;
    case 'plastic':
      m = new THREE.MeshPhysicalMaterial({ color: o.color ?? '#E84B3C', roughness: 0.35, clearcoat: 0.6, side: o.side ?? THREE.FrontSide });
      break;
    case 'rubber':
      m = new THREE.MeshStandardMaterial({ color: o.color ?? '#222222', roughness: 0.9, side: o.side ?? THREE.FrontSide });
      break;
    default: {
      const s = skinFor(name)!;
      const metal = name === 'metal' || name === 'iron' || name === 'gold' || name === 'copper';
      const map = s.map.clone();
      const normalMap = s.normalMap.clone();
      const roughnessMap = s.roughnessMap.clone();
      const rep = o.repeat ?? [1, 1];
      for (const t of [map, normalMap, roughnessMap]) {
        t.needsUpdate = true;
        wrap(t, rep);
      }
      m = new THREE.MeshStandardMaterial({
        map,
        normalMap,
        roughnessMap,
        roughness: 1,
        metalness: metal ? (name === 'metal' ? 0.6 : 0.95) : 0,
        color,
        emissive: new THREE.Color(o.glow ? (o.color ?? '#FFD27A') : '#000000'),
        emissiveIntensity: o.glow ?? 0,
        transparent,
        opacity: o.opacity ?? 1,
        side: o.side ?? THREE.FrontSide,
      });
    }
  }
  mats.set(key, m);
  return m;
}

/** Hex color helper for callers. */
export const rgb = (c: string) => hex(c);
