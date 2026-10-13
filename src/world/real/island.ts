// Realistic island ground: one heightfield terrain whose texture is painted from the tiles (grass, meadow,
// dirt path, cobbles, sand, deck, snow, clouds, ponds), with natural edges around the flat buildable grid:
// a grassy slope, a beach and the sea (normal island), snowy cliffs and an ice shelf (snow island), or a
// rocky floating base with roots and clouds under it (cloud island). Grid coordinates: cell (x, z) spans
// [x, x+1] × [z, z+1], the plateau top is y = 0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bake } from '../../creatures/real/textures';
import { fbm, mix, noise2, rng, smooth } from '../../creatures/real/noise';
import type { World } from '../world';
import { disposeGeometries, flatten } from '../flatten';
import { buildBroadleaf, buildPine } from './nature';
import { pbr } from './materials';

export type IslandKind = 'normal' | 'snow' | 'cloud';

/** Which island this is, from its ground (the snow and cloud islands start covered in snow / clouds). */
export function islandKind(world: World): IslandKind {
  let n = 0;
  let c = 0;
  for (let i = 0; i < world.tiles.length; i++) {
    const ch = world.tiles.charCodeAt(i);
    if (ch === 110) n++;
    else if (ch === 99) c++;
  }
  const cells = world.size * world.size;
  if (c >= n && c >= cells * 0.3) return 'cloud';
  if (n >= cells * 0.3) return 'snow';
  return 'normal';
}

/** Sky (and fog) color of each island. */
export const SKY: Record<IslandKind, string> = { normal: '#A9CBE6', snow: '#D5E1EB', cloud: '#E6DCF0' };
/** Sea level (boats float there). */
export const seaLevel = (kind: IslandKind) => (kind === 'snow' ? -0.6 : -0.42);
/** Surface of the ponds painted on the island. */
export const POND_Y = -0.04;
/** Top of the wooden deck planks. */
export const DECK_Y = 0.028;

/** Puts the sun's shadow camera over the whole island. */
export function fitSun(sun: THREE.DirectionalLight, size: number) {
  const c = size / 2;
  const half = size * 0.72 + 2.5;
  sun.target.position.set(c, 0, c);
  sun.position.set(c + 10, 20, c + 7);
  const cam = sun.shadow.camera;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.near = 2;
  cam.far = 50;
  cam.updateProjectionMatrix();
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.target.updateMatrixWorld();
}

/** Fog matching the sky, scaled with the camera distance (far things fade into the sky). */
export function updateFog(scene: THREE.Scene, sky: string, distance: number) {
  if (!(scene.fog instanceof THREE.Fog)) scene.fog = new THREE.Fog(sky, 1, 2);
  const fog = scene.fog as THREE.Fog;
  fog.color.set(sky);
  fog.near = distance * 1.25;
  fog.far = distance * 3.6;
}

// ── Water ──────────────────────────────────────────────────────────────────────

let waterNormalTex: THREE.DataTexture | null = null;
function waterNormal(): THREE.DataTexture {
  if (!waterNormalTex) {
    waterNormalTex = bake(256, 256, (u, v) => ({ c: [0, 0, 0], height: fbm(u * 8, v * 8, 31, 4, 8, 8), rough: 0 }), 5, true).normalMap;
    waterNormalTex.wrapS = THREE.RepeatWrapping;
    waterNormalTex.wrapT = THREE.RepeatWrapping;
  }
  return waterNormalTex;
}

type WaterOpts = { shallow: string; deep: string; alpha: [number, number]; ring: [number, number]; half: number; center: number; amp: number; repeat: number; sky: string };

/** Realistic water: vertex waves, scrolling ripples, shallow (see-through) near the shore, deep blue farther, sky reflection. */
function waterMaterial(o: WaterOpts, time: { value: number }) {
  const normalMap = waterNormal().clone();
  normalMap.needsUpdate = true;
  normalMap.repeat.set(o.repeat, o.repeat);
  const m = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: 0.1,
    metalness: 0,
    transparent: true,
    normalMap,
    normalScale: new THREE.Vector2(0.3, 0.3),
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    depthWrite: false,
  });
  const uniforms = {
    uTime: time,
    uShallow: { value: new THREE.Color(o.shallow) },
    uDeep: { value: new THREE.Color(o.deep) },
    uSky: { value: new THREE.Color(o.sky) },
    uAlpha: { value: new THREE.Vector2(...o.alpha) },
    uRing: { value: new THREE.Vector2(...o.ring) },
    uHalf: { value: o.half },
    uCenter: { value: o.center },
    uAmp: { value: o.amp },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uHalf;\nuniform float uCenter;\nuniform float uAmp;\nvarying float vShore;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wq = modelMatrix * vec4(position, 1.0);
        vec2 q = max(abs(wq.xz - vec2(uCenter)) - vec2(uHalf), 0.0);
        vShore = length(q);
        transformed.z += uAmp * (sin(wq.x * 0.9 + uTime * 1.1) * 0.6 + sin(wq.z * 1.3 - uTime * 0.8) * 0.45 + sin((wq.x + wq.z) * 2.3 + uTime * 1.9) * 0.2);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uShallow;\nuniform vec3 uDeep;\nuniform vec3 uSky;\nuniform vec2 uAlpha;\nuniform vec2 uRing;\nvarying float vShore;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float deepK = smoothstep(uRing.x, uRing.y, vShore);
        diffuseColor.rgb = mix(uShallow, uDeep, deepK);
        diffuseColor.a = mix(uAlpha.x, uAlpha.y, deepK);`,
      )
      .replace(
        '#include <opaque_fragment>',
        `float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
        outgoingLight = mix(outgoingLight, uSky, fres * 0.6);
        diffuseColor.a = mix(diffuseColor.a, 1.0, fres * 0.5);
        #include <opaque_fragment>`,
      );
  };
  return m;
}

// ── Terrain ────────────────────────────────────────────────────────────────────

type RGB = [number, number, number];
const hash = (x: number, y: number, s: number) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Ground colors (sRGB).
const GRASS_A: RGB = [96, 136, 58];
const GRASS_B: RGB = [62, 98, 40];
const GRASS_DRY: RGB = [146, 146, 80];
const MEADOW_A: RGB = [118, 152, 64];
const MEADOW_B: RGB = [86, 122, 48];
const DIRT_A: RGB = [140, 116, 88];
const DIRT_B: RGB = [110, 90, 68];
const PEBBLE: RGB = [160, 152, 140];
const STONE: RGB = [150, 146, 138];
const MORTAR: RGB = [92, 86, 76];
const SAND: RGB = [222, 202, 158];
const SAND_DARK: RGB = [200, 178, 134];
const WET_SAND: RGB = [160, 138, 102];
const SNOW: RGB = [238, 243, 249];
const SNOW_SHADE: RGB = [192, 208, 228];
const ICE: RGB = [150, 200, 222];
const CLOUD: RGB = [252, 251, 255];
const CLOUD_SHADE: RGB = [224, 220, 240];
const ROCK: RGB = [116, 110, 102];
const ROCK_DARK: RGB = [78, 74, 70];
const MUD: RGB = [92, 80, 58];
const MUD_DEEP: RGB = [52, 62, 48];
const BANK: RGB = [84, 96, 54];
const DECK_UNDER: RGB = [64, 52, 38];
const FOAM: RGB = [242, 244, 240];
const FLOWERS: RGB[] = [
  [244, 244, 236],
  [246, 210, 64],
  [176, 124, 214],
  [236, 134, 164],
];

export type Terrain = {
  group: THREE.Group;
  kind: IslandKind;
  size: number;
  /** Ground height anywhere (grid coordinates). */
  heightAt: (x: number, z: number) => number;
  /** Repaints after tiles changed (only the changed area of the texture). */
  paint: (world: World) => void;
  /** Rebuilds what depends on tiles + objects (grass blades, deck planks, pond water). */
  details: (world: World) => void;
  update: (t: number) => void;
  dispose: () => void;
};

export function buildTerrain(world0: World, kind: IslandKind): Terrain {
  const group = new THREE.Group();
  const size = world0.size;
  const C = size / 2;
  const M = kind === 'cloud' ? 1.8 : 6.5;
  const x0 = -M;
  const W = size + 2 * M;
  const seaY = seaLevel(kind);
  let tiles = world0.tiles;
  const disposables: { dispose: () => void }[] = [];
  const time = { value: 0 };

  // Distance to the grid square, and the cloud island's outline (at that distance from the grid).
  const outline = (bx: number, bz: number) => 1.25 + (fbm(bx * 0.22 + 3, bz * 0.22 + 7, 11, 3) - 0.5) * 0.9;
  const sqDist = (x: number, z: number) => Math.hypot(x - Math.max(0, Math.min(size, x)), z - Math.max(0, Math.min(size, z)));

  // Ponds: water cells dip under a muddy bank.
  const isWater = (ix: number, iz: number) => ix >= 0 && iz >= 0 && ix < size && iz < size && tiles.charCodeAt(iz * size + ix) === 119;
  const pondDepth = (x: number, z: number) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    if (!isWater(ix, iz)) return 0;
    // Distance to the nearest ground that is not water (corners come out rounded).
    let dIn = 1;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx === 0 && dz === 0) || isWater(ix + dx, iz + dz)) continue;
        const qx = dx < 0 ? x - ix : dx > 0 ? ix + 1 - x : 0;
        const qz = dz < 0 ? z - iz : dz > 0 ? iz + 1 - z : 0;
        const d = dx !== 0 && dz !== 0 ? Math.hypot(qx, qz) : dx !== 0 ? qx : qz;
        if (d < dIn) dIn = d;
      }
    return 0.34 * smooth(0.2, 0.55, dIn + (noise2(x * 2.2, z * 2.2, 17) - 0.5) * 0.3);
  };

  const heightAt = (x: number, z: number): number => {
    const d = sqDist(x, z);
    if (d <= 0) return -pondDepth(x, z);
    const n = fbm(x * 0.32 + 20, z * 0.32 + 20, 5, 3) - 0.5;
    if (kind === 'cloud') {
      const e = Math.min(d, outline(x, z));
      return -0.62 * Math.pow(smooth(0.15, 1.6, e), 1.4) + n * 0.1 * smooth(0.2, 0.9, e) - pondDepth(x, z);
    }
    const wob = fbm(x * 0.16 + 3, z * 0.16 + 7, 11, 3) - 0.5;
    let e = d + wob * 2.4 * smooth(0, 2, d);
    let h: number;
    if (kind === 'snow') {
      // The cliff edge wanders a little beyond the grid (never into it).
      e = d - 0.25 + wob * 0.9;
      // Snowy plateau, a rocky cliff, a narrow icy shore, then deep water.
      if (e < 0.15) h = 0;
      else if (e < 0.6) h = mix(0, seaY + 0.05, smooth(0.15, 0.6, e));
      else if (e < 1.5) h = seaY + 0.05 - (e - 0.6) * 0.02;
      else h = mix(seaY + 0.032, -2, smooth(1.5, 2.1, e));
      h += n * (0.18 * smooth(0.15, 0.4, e) * (1 - smooth(0.5, 0.7, e)) + 0.02 * smooth(0.6, 0.8, e));
    } else {
      if (e < 0.22) h = 0;
      else if (e < 1.4) h = -0.3 * smooth(0.22, 1.4, e);
      else if (e < 2.9) h = mix(-0.3, -0.5, (e - 1.4) / 1.5);
      else h = mix(-0.5, -1.6, smooth(2.9, 6, e));
      h += n * 0.16 * smooth(0.3, 1.2, e) * (1 - 0.5 * smooth(2.2, 3, e));
    }
    return h - pondDepth(x, z);
  };

  // ── Mesh: a grid with 4 vertices per cell on the plateau (pond shapes), coarser farther out.
  // The cloud island's grid is pulled onto its outline.
  const axis: number[] = [];
  {
    const outside: number[] = [];
    let d = 0;
    while (d < M - 1e-6) {
      d = Math.min(M, d + (d < 1.2 ? 0.25 : d < 3 ? 0.4 : 0.8));
      outside.push(d);
    }
    for (let k = outside.length - 1; k >= 0; k--) axis.push(-outside[k]);
    const inner = size * 4;
    for (let k = 0; k <= inner; k++) axis.push((k / inner) * size);
    for (const o of outside) axis.push(size + o);
  }
  const N = axis.length;
  const pos = new Float32Array(N * N * 3);
  const uvs = new Float32Array(N * N * 2);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      let x = axis[i];
      let z = axis[j];
      if (kind === 'cloud') {
        const cx = Math.max(0, Math.min(size, x));
        const cz = Math.max(0, Math.min(size, z));
        const d = Math.hypot(x - cx, z - cz);
        if (d > 0) {
          const nx = (x - cx) / d;
          const nz = (z - cz) / d;
          const o = outline(cx + nx * 1.25, cz + nz * 1.25);
          if (d > o) {
            x = cx + nx * o;
            z = cz + nz * o;
          }
        }
      }
      const k = j * N + i;
      pos[k * 3] = x;
      pos[k * 3 + 2] = z;
      uvs[k * 2] = (x - x0) / W;
      uvs[k * 2 + 1] = (z - x0) / W;
    }
  const index: number[] = [];
  for (let j = 0; j < N - 1; j++)
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i;
      index.push(a, a + N, a + 1, a + 1, a + N, a + N + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(index);
  const fillHeights = () => {
    for (let k = 0; k < N * N; k++) pos[k * 3 + 1] = heightAt(pos[k * 3], pos[k * 3 + 2]);
    geo.getAttribute('position').needsUpdate = true;
    geo.computeVertexNormals();
  };
  fillHeights();

  // ── Ground texture, painted pixel by pixel. Low-resolution noise fields are computed once.
  const R = 1024;
  const L = 160;
  const fieldPatch = new Float32Array(L * L);
  const fieldWarpX = new Float32Array(L * L);
  const fieldWarpZ = new Float32Array(L * L);
  const fieldMed = new Float32Array(L * L);
  // Height of the land around the grid (the plateau is flat, ponds are computed per pixel).
  const fieldH = new Float32Array(L * L);
  const lStep = W / (L - 1);
  for (let j = 0; j < L; j++)
    for (let i = 0; i < L; i++) {
      const x = x0 + (i / (L - 1)) * W;
      const z = x0 + (j / (L - 1)) * W;
      const k = j * L + i;
      fieldPatch[k] = fbm(x * 0.35, z * 0.35, 41, 4);
      fieldWarpX[k] = fbm(x * 1.7, z * 1.7, 42, 2);
      fieldWarpZ[k] = fbm(x * 1.7 + 9, z * 1.7, 43, 2);
      fieldMed[k] = fbm(x * 3.2, z * 3.2, 44, 2);
      fieldH[k] = sqDist(x, z) > 0 ? heightAt(x, z) : 0;
    }
  const color = new Uint8Array(R * R * 4);
  const bump = new Float32Array(R * R);
  const normal = new Uint8Array(R * R * 4);
  const map = new THREE.DataTexture(color, R, R, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.DataTexture(normal, R, R, THREE.RGBAFormat);
  for (const t of [map, normalMap]) {
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
  }

  // One pixel's ground: writes into out / outH.
  const out: RGB = [0, 0, 0];
  let outH = 0;
  const set = (c: RGB, k: number) => {
    out[0] = c[0] * k;
    out[1] = c[1] * k;
    out[2] = c[2] * k;
  };
  const blend = (c: RGB, t: number, k = 1) => {
    if (t <= 0) return;
    out[0] += (c[0] * k - out[0]) * t;
    out[1] += (c[1] * k - out[1]) * t;
    out[2] += (c[2] * k - out[2]) * t;
  };
  const grass = (x: number, z: number, patch: number, med: number, fine: number, meadow: boolean) => {
    const a = meadow ? MEADOW_A : GRASS_A;
    const b = meadow ? MEADOW_B : GRASS_B;
    const t = smooth(0.36, 0.66, patch);
    out[0] = mix(a[0], b[0], t);
    out[1] = mix(a[1], b[1], t);
    out[2] = mix(a[2], b[2], t);
    blend(GRASS_DRY, smooth(0.6, 0.78, med * 0.6 + patch * 0.5) * 0.45);
    const k = 0.82 + fine * 0.32;
    out[0] *= k;
    out[1] *= k;
    out[2] *= k;
    outH = fine * 0.35 + med * 0.3;
    if (meadow) {
      // Little flowers in the grass.
      const gx = Math.floor(x / 0.085);
      const gz = Math.floor(z / 0.085);
      const r = hash(gx, gz, 5);
      if (r < 0.16) {
        const px = (gx + 0.2 + hash(gx, gz, 6) * 0.6) * 0.085;
        const pz = (gz + 0.2 + hash(gx, gz, 7) * 0.6) * 0.085;
        const dd = Math.hypot(x - px, z - pz);
        if (dd < 0.022) {
          set(FLOWERS[Math.floor(r * 25) % 4], 0.95 + fine * 0.1);
          outH = 1;
        }
      }
    }
  };
  const tileColor = (code: number, x: number, z: number, patch: number, med: number, fine: number) => {
    switch (code) {
      case 102: // meadow
        grass(x, z, patch, med, fine, true);
        return;
      case 112: {
        // path: packed dirt with pebbles
        const t = smooth(0.3, 0.7, med * 0.7 + patch * 0.3);
        set(DIRT_A, 1);
        blend(DIRT_B, t);
        const k = 0.88 + fine * 0.22;
        out[0] *= k;
        out[1] *= k;
        out[2] *= k;
        outH = fine * 0.3;
        const gx = Math.floor(x / 0.1);
        const gz = Math.floor(z / 0.1);
        const r = hash(gx, gz, 11);
        if (r < 0.28) {
          const px = (gx + 0.25 + hash(gx, gz, 12) * 0.5) * 0.1;
          const pz = (gz + 0.25 + hash(gx, gz, 13) * 0.5) * 0.1;
          const rad = 0.015 + r * 0.06;
          const dd = Math.hypot(x - px, z - pz) / rad;
          if (dd < 1) {
            set(PEBBLE, (0.7 + hash(gx, gz, 14) * 0.45) * (1.05 - dd * 0.35));
            outH = 1 - dd * dd;
          } else if (dd < 1.4) blend([70, 56, 40], 0.4 * (1.4 - dd) / 0.4);
        }
        return;
      }
      case 111: {
        // cobble: rows of stones with dark joints
        const wx = x + (med - 0.5) * 0.06;
        const wz = z + (fine - 0.5) * 0.02;
        const row = Math.floor(wz / 0.21);
        const off = row % 2 ? 0.13 : 0;
        const col = Math.floor((wx + off) / 0.26);
        const fx = (wx + off) / 0.26 - col;
        const fz = wz / 0.21 - row;
        const e = Math.min(fx, 1 - fx) * 0.26 * 1.0 + 0 * fz;
        const ez = Math.min(fz, 1 - fz) * 0.21;
        const edge = Math.min(e, ez);
        const id = hash(col, row, 21);
        const dome = smooth(0.0, 0.05, edge);
        if (edge < 0.014) {
          set(MORTAR, 0.85 + fine * 0.3);
          outH = 0;
        } else {
          set(STONE, (0.74 + id * 0.36) * (0.8 + dome * 0.2) * (0.9 + fine * 0.18));
          blend([140, 128, 104], hash(col, row, 22) * 0.5);
          outH = dome * 1.2 + fine * 0.15;
        }
        return;
      }
      case 115: {
        // beach sand with ripples
        set(SAND, 1);
        blend(SAND_DARK, smooth(0.35, 0.7, patch));
        const ripple = Math.sin((x * 0.8 + z * 0.55) * 26 + med * 7) * 0.5 + 0.5;
        const k = 0.92 + fine * 0.12 + ripple * 0.05;
        out[0] *= k;
        out[1] *= k;
        out[2] *= k;
        outH = ripple * 0.5 + fine * 0.3;
        return;
      }
      case 100: // wood deck (planks are real meshes; this is the shade under them)
        set(DECK_UNDER, 0.9 + fine * 0.2);
        outH = 0;
        return;
      case 110: {
        // snow
        set(SNOW, 1);
        blend(SNOW_SHADE, smooth(0.4, 0.75, patch) * 0.8);
        const k = 0.96 + fine * 0.06;
        out[0] = Math.min(255, out[0] * k);
        out[1] = Math.min(255, out[1] * k);
        out[2] = Math.min(255, out[2] * k);
        if (hash(Math.floor(x * 60), Math.floor(z * 60), 3) > 0.996) set([255, 255, 255], 1);
        outH = med * 0.8 + patch * 0.5;
        return;
      }
      case 99: {
        // clouds: soft white billows
        // Round puffs (nearest of jittered centers): bright domes, lavender creases between them.
        const sx = x / 0.45 + (med - 0.5) * 1.2;
        const sz = z / 0.45 + (patch - 0.5) * 1.2;
        const gx = Math.floor(sx);
        const gz = Math.floor(sz);
        let best = 9;
        for (let oz = -1; oz <= 1; oz++)
          for (let ox = -1; ox <= 1; ox++) {
            const cx = gx + ox + 0.5 + (hash(gx + ox, gz + oz, 51) - 0.5) * 0.7;
            const cz = gz + oz + 0.5 + (hash(gx + ox, gz + oz, 52) - 0.5) * 0.7;
            const dd = (sx - cx) * (sx - cx) + (sz - cz) * (sz - cz);
            if (dd < best) best = dd;
          }
        const dome = 1 - Math.min(1, Math.sqrt(best) / 0.75);
        set(CLOUD_SHADE, 1);
        blend(CLOUD, Math.min(1, smooth(-0.1, 0.6, dome) * 0.75 + 0.35 + (med - 0.5) * 0.3));
        outH = Math.sqrt(dome) * 1.1 + med * 0.8;
        return;
      }
      case 119: // pond bank (the dip itself is painted from the depth)
        grass(x, z, patch, med, fine, false);
        blend(BANK, 0.7);
        return;
      default:
        grass(x, z, patch, med, fine, false);
    }
  };
  const outer = (h: number, slope: number, x: number, z: number, patch: number, med: number, fine: number) => {
    if (kind === 'normal') {
      grass(x, z, patch, med, fine, false);
      blend(DIRT_B, smooth(0.35, 0.8, slope) * 0.6);
      const sandT = smooth(-0.16, -0.27, h + (med - 0.5) * 0.06);
      if (sandT > 0) {
        const g0 = out[0];
        const g1 = out[1];
        const g2 = out[2];
        const gh = outH;
        tileColor(115, x, z, patch, med, fine);
        out[0] = mix(g0, out[0], sandT);
        out[1] = mix(g1, out[1], sandT);
        out[2] = mix(g2, out[2], sandT);
        outH = mix(gh, outH, sandT);
      }
      blend(ROCK, smooth(0.6, 1.0, slope) * 0.7, 0.8 + fine * 0.3);
      blend(WET_SAND, smooth(seaY + 0.07, seaY + 0.01, h));
      const foam = smooth(0.026, 0.0, Math.abs(h - seaY - 0.012)) * (0.45 + 0.55 * med);
      blend(FOAM, foam * 0.8);
      blend([24, 82, 98], smooth(seaY - 0.02, seaY - 0.9, h));
    } else if (kind === 'snow') {
      tileColor(110, x, z, patch, med, fine);
      const rock = smooth(0.35, 0.8, slope + (med - 0.5) * 0.5) * smooth(seaY + 0.08, seaY + 0.15, h);
      blend(ROCK_DARK, rock * 0.92, 0.8 + fine * 0.5);
      if (rock > 0.3) outH = med * 1.5 + fine * 0.8;
      const shelf = smooth(seaY + 0.1, seaY + 0.06, h);
      blend(ICE, shelf * (0.6 + patch * 0.4));
      blend(FOAM, smooth(0.02, 0.0, Math.abs(h - seaY - 0.035)) * med * 0.8);
      blend([20, 66, 92], smooth(seaY - 0.02, seaY - 0.9, h));
    } else {
      tileColor(99, x, z, patch, med, fine);
      const rock = smooth(0.3, 0.8, slope + (med - 0.5) * 0.3);
      blend(ROCK, rock * 0.85, 0.75 + fine * 0.4);
      blend([88, 104, 62], rock * smooth(0.5, 0.75, patch) * 0.6);
    }
  };

  const paintRect = (px0: number, py0: number, px1: number, py1: number) => {
    const scale = W / R;
    const fScale = (L - 1) / W;
    for (let py = py0; py < py1; py++) {
      const z = x0 + (py + 0.5) * scale;
      for (let px = px0; px < px1; px++) {
        const x = x0 + (px + 0.5) * scale;
        // Noise fields (bilinear).
        const ffx = (x - x0) * fScale;
        const ffz = (z - x0) * fScale;
        const fi = Math.min(L - 2, Math.floor(ffx));
        const fj = Math.min(L - 2, Math.floor(ffz));
        const tx = ffx - fi;
        const tz = ffz - fj;
        const k00 = fj * L + fi;
        const w00 = (1 - tx) * (1 - tz);
        const w10 = tx * (1 - tz);
        const w01 = (1 - tx) * tz;
        const w11 = tx * tz;
        const i = py * R + px;
        const onPlateau = x >= -0.3 && z >= -0.3 && x < size + 0.3 && z < size + 0.3;
        // Away from the grid, half resolution is plenty: copy the pixel computed just before.
        if (!onPlateau && ((px & 1) | (py & 1))) {
          const src = (py & ~1) * R + (px & ~1);
          color[i * 4] = color[src * 4];
          color[i * 4 + 1] = color[src * 4 + 1];
          color[i * 4 + 2] = color[src * 4 + 2];
          color[i * 4 + 3] = 255;
          bump[i] = bump[src];
          continue;
        }
        const hOut = fieldH[k00] * w00 + fieldH[k00 + 1] * w10 + fieldH[k00 + L] * w01 + fieldH[k00 + L + 1] * w11;
        if (!onPlateau && hOut < seaY - 0.7 && kind !== 'cloud') {
          // Deep under the sea: plain deep water color.
          color[i * 4] = 24;
          color[i * 4 + 1] = kind === 'snow' ? 66 : 82;
          color[i * 4 + 2] = kind === 'snow' ? 92 : 98;
          color[i * 4 + 3] = 255;
          bump[i] = 0;
          continue;
        }
        const patch = fieldPatch[k00] * w00 + fieldPatch[k00 + 1] * w10 + fieldPatch[k00 + L] * w01 + fieldPatch[k00 + L + 1] * w11;
        const med = fieldMed[k00] * w00 + fieldMed[k00 + 1] * w10 + fieldMed[k00 + L] * w01 + fieldMed[k00 + L + 1] * w11;
        const fine = noise2(x * 22, z * 22, 9) * 0.7 + hash(px, py, 1) * 0.3;
        const inGrid = x >= 0 && z >= 0 && x < size && z < size;
        const h = inGrid ? -pondDepth(x, z) : hOut;
        const slope = inGrid
          ? 0
          : Math.hypot(
              mix(fieldH[k00 + 1] - fieldH[k00], fieldH[k00 + L + 1] - fieldH[k00 + L], tz),
              mix(fieldH[k00 + L] - fieldH[k00], fieldH[k00 + L + 1] - fieldH[k00 + 1], tx),
            ) / lStep;
        // Tile under this point, looked up through a wobbly warp so borders are soft and natural.
        const wx = x + (fieldWarpX[k00] * w00 + fieldWarpX[k00 + 1] * w10 + fieldWarpX[k00 + L] * w01 + fieldWarpX[k00 + L + 1] * w11 - 0.5) * 0.5;
        const wz = z + (fieldWarpZ[k00] * w00 + fieldWarpZ[k00 + 1] * w10 + fieldWarpZ[k00 + L] * w01 + fieldWarpZ[k00 + L + 1] * w11 - 0.5) * 0.5;
        const ix = Math.floor(wx);
        const iz = Math.floor(wz);
        const codeAt = (cx: number, cz: number) => (cx >= 0 && cz >= 0 && cx < size && cz < size ? tiles.charCodeAt(cz * size + cx) : -1);
        const code = codeAt(ix, iz);
        if (code >= 0) tileColor(code, x, z, patch, med, fine);
        else outer(h, slope, x, z, patch, med, fine);
        // Soft border: near the edge of a cell, fade toward the neighbouring ground when it differs.
        const fx = wx - ix;
        const fz = wz - iz;
        const ex = fx < 0.5 ? fx : 1 - fx;
        const ez = fz < 0.5 ? fz : 1 - fz;
        const BAND = 0.07;
        if (ex < BAND || ez < BAND) {
          const alongX = ex <= ez;
          const other = alongX ? codeAt(fx < 0.5 ? ix - 1 : ix + 1, iz) : codeAt(ix, fz < 0.5 ? iz - 1 : iz + 1);
          if (other !== code) {
            const w = 0.5 * (1 - (alongX ? ex : ez) / BAND);
            const r0 = out[0];
            const g0 = out[1];
            const b0 = out[2];
            const h0 = outH;
            if (other >= 0) tileColor(other, x, z, patch, med, fine);
            else outer(h, slope, x, z, patch, med, fine);
            out[0] = mix(r0, out[0], w);
            out[1] = mix(g0, out[1], w);
            out[2] = mix(b0, out[2], w);
            outH = mix(h0, outH, w);
          }
        }
        // Pond bottoms: wet bank, pebbles, mud getting darker with depth.
        if (inGrid && h < -0.002) {
          const depth = -h;
          blend(BANK, smooth(0.0, 0.02, depth) * 0.8);
          const gx = Math.floor(x / 0.09);
          const gz = Math.floor(z / 0.09);
          const r = hash(gx, gz, 31);
          const pebble = r < 0.55 && Math.hypot(x - (gx + 0.5) * 0.09, z - (gz + 0.5) * 0.09) < 0.02 + r * 0.035;
          if (depth < 0.16 && pebble) {
            set(PEBBLE, 0.6 + hash(gx, gz, 32) * 0.4);
            outH = 1;
          } else {
            blend(MUD, smooth(0.01, 0.06, depth), 0.85 + fine * 0.3);
            blend(MUD_DEEP, smooth(0.08, 0.34, depth));
          }
        }
        color[i * 4] = out[0] > 255 ? 255 : out[0];
        color[i * 4 + 1] = out[1] > 255 ? 255 : out[1];
        color[i * 4 + 2] = out[2] > 255 ? 255 : out[2];
        color[i * 4 + 3] = 255;
        bump[i] = outH;
      }
    }
    // Normals from the detail height.
    const k = 2.2;
    for (let py = Math.max(0, py0 - 1); py < Math.min(R, py1 + 1); py++)
      for (let px = Math.max(0, px0 - 1); px < Math.min(R, px1 + 1); px++) {
        const i = py * R + px;
        const dx = (bump[py * R + Math.min(R - 1, px + 1)] - bump[py * R + Math.max(0, px - 1)]) * k;
        const dy = (bump[Math.min(R - 1, py + 1) * R + px] - bump[Math.max(0, py - 1) * R + px]) * k;
        const l = Math.sqrt(dx * dx + dy * dy + 1);
        normal[i * 4] = (-dx / l) * 127.5 + 127.5;
        normal[i * 4 + 1] = (-dy / l) * 127.5 + 127.5;
        normal[i * 4 + 2] = (1 / l) * 127.5 + 127.5;
        normal[i * 4 + 3] = 255;
      }
    map.needsUpdate = true;
    normalMap.needsUpdate = true;
  };
  paintRect(0, 0, R, R);

  const groundMat = new THREE.MeshStandardMaterial({ map, normalMap, roughness: 0.95, metalness: 0 });
  const ground = new THREE.Mesh(geo, groundMat);
  ground.receiveShadow = true;
  group.add(ground);
  disposables.push(geo, groundMat, map, normalMap);

  // ── Sea around the normal and snow islands.
  let seaMat: THREE.MeshPhysicalMaterial | null = null;
  if (kind !== 'cloud') {
    const span = size * 3 + 140;
    const seaGeo = new THREE.PlaneGeometry(span, span, 140, 140);
    seaMat = waterMaterial(
      {
        shallow: kind === 'snow' ? '#3D8FA8' : '#2E9AAA',
        deep: kind === 'snow' ? '#163F5A' : '#0F4A6C',
        alpha: [0.5, 1],
        ring: [1.6, 6],
        half: C,
        center: C,
        amp: 0.035,
        repeat: span / 6,
        sky: SKY[kind],
      },
      time,
    );
    const sea = new THREE.Mesh(seaGeo, seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(C, seaY, C);
    sea.receiveShadow = true;
    group.add(sea);
    // Deep water under it (seen through the sea, far from the shore).
    const deepGeo = new THREE.PlaneGeometry(span, span);
    const deepMat = new THREE.MeshBasicMaterial({ color: kind === 'snow' ? '#12384F' : '#0C3A55' });
    const deep = new THREE.Mesh(deepGeo, deepMat);
    deep.rotation.x = -Math.PI / 2;
    deep.position.set(C, -1.7, C);
    group.add(deep);
    disposables.push(seaGeo, seaMat, deepGeo, deepMat);
  }

  // ── Nature around the grid: rocks, a few trees (normal island), ice floes (snow), the floating base (clouds).
  const extras = new THREE.Group();
  group.add(extras);
  const r = rng(size * 31 + (kind === 'snow' ? 7 : kind === 'cloud' ? 13 : 1));
  const ring = (dMin: number, dMax: number) => {
    // A point at a distance from the grid, all around it.
    const per = 4 * size;
    const s = r() * per;
    const side = Math.floor(s / size);
    const u = s - side * size;
    const d = mix(dMin, dMax, r());
    const [bx, bz, nx, nz] =
      side === 0 ? [u, 0, 0, -1] : side === 1 ? [size, u, 1, 0] : side === 2 ? [size - u, size, 0, 1] : [0, size - u, -1, 0];
    return [bx + nx * d, bz + nz * d] as const;
  };
  const rockGeos: THREE.BufferGeometry[] = [];
  const addRock = (x: number, z: number, s: number, y = heightAt(x, z)) => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const seed = Math.floor(r() * 1000);
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i);
      const vy = p.getY(i);
      const vz = p.getZ(i);
      const k = 0.75 + fbm(vx * 1.6 + seed, vz * 1.6 + vy, seed, 2) * 0.5;
      p.setXYZ(i, vx * k * s, vy * k * s * 0.6, vz * k * s * (0.8 + r() * 0.05));
    }
    g.rotateY(r() * Math.PI * 2);
    g.translate(x, y + s * 0.15, z);
    rockGeos.push(g);
  };
  if (kind === 'normal') {
    for (let i = 0; i < 14; i++) {
      const [x, z] = ring(0.8, 2.6);
      addRock(x, z, 0.12 + r() * 0.22);
    }
    // A few trees on the slope, mostly near the corners.
    const trees = new THREE.Group();
    const corners = [
      [-0.9, -0.7],
      [size + 0.8, -0.9],
      [size + 0.9, size + 0.6],
      [-0.8, size + 0.9],
      [size * 0.5, -1.0],
      [-1.0, size * 0.55],
    ];
    corners.forEach(([x, z], i) => {
      const t = i % 3 === 1 ? buildPine(r) : buildBroadleaf(r);
      t.position.set(x, heightAt(x, z) - 0.03, z);
      t.scale.setScalar(0.9 + r() * 0.4);
      t.rotation.y = r() * Math.PI * 2;
      trees.add(t);
    });
    extras.add(flatten(trees));
    disposeGeometries(trees);
  } else if (kind === 'snow') {
    for (let i = 0; i < 16; i++) {
      const [x, z] = ring(0.3, 1.2);
      addRock(x, z, 0.15 + r() * 0.3);
    }
    // Ice floes drifting on the sea.
    const floes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const [x, z] = ring(3.2, 7);
      const g = new THREE.CylinderGeometry(0.4 + r() * 0.7, 0.5 + r() * 0.7, 0.12, 7);
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) p.setX(k, p.getX(k) * (0.8 + r() * 0.4));
      g.rotateY(r() * 6);
      g.translate(x, seaY + 0.02, z);
      floes.push(g.toNonIndexed());
      g.dispose();
    }
    const floe = new THREE.Mesh(mergeGeometries(floes, false)!, pbr('snow', { repeat: [2, 2] }));
    floe.geometry.computeVertexNormals();
    floe.receiveShadow = true;
    floes.forEach((g) => g.dispose());
    extras.add(floe);
  }
  if (rockGeos.length) {
    const merged = mergeGeometries(rockGeos, false)!;
    merged.computeVertexNormals();
    rockGeos.forEach((g) => g.dispose());
    const m = new THREE.Mesh(merged, pbr('rock', { repeat: [3, 3] }));
    m.castShadow = true;
    m.receiveShadow = true;
    extras.add(m);
  }

  let puffs: THREE.Group | null = null;
  if (kind === 'cloud') {
    // Floating rock base under the outline, tapering down to a point.
    const pts: { x: number; z: number; s: number }[] = [];
    let perim = 0;
    const push = (bx: number, bz: number, nx: number, nz: number) => {
      const o = outline(bx + nx * 1.25, bz + nz * 1.25);
      const x = bx + nx * o;
      const z = bz + nz * o;
      if (pts.length) perim += Math.hypot(x - pts[pts.length - 1].x, z - pts[pts.length - 1].z);
      pts.push({ x, z, s: perim });
    };
    const segs = Math.round(size * 2);
    const corner = (cx: number, cz: number, a0: number) => {
      for (let k = 0; k < 6; k++) {
        const a = a0 + (k / 6) * (Math.PI / 2);
        push(cx, cz, Math.cos(a), Math.sin(a));
      }
    };
    // Walk around: north side (z=0, normal -z), east, south, west, with corner arcs.
    for (let k = 0; k < segs; k++) push((k / segs) * size, 0, 0, -1);
    corner(size, 0, -Math.PI / 2);
    for (let k = 0; k < segs; k++) push(size, (k / segs) * size, 1, 0);
    corner(size, size, 0);
    for (let k = 0; k < segs; k++) push(size - (k / segs) * size, size, 0, 1);
    corner(0, size, Math.PI / 2);
    for (let k = 0; k < segs; k++) push(0, size - (k / segs) * size, -1, 0);
    corner(0, 0, Math.PI);
    const K = pts.length;
    const J = 14;
    const depth = size * 0.55 + 3;
    const bpos: number[] = [];
    const buv: number[] = [];
    for (let j = 0; j <= J; j++) {
      const t = j / J;
      const f = (1 + 0.1 * Math.sin(Math.PI * Math.min(1, t * 5))) * Math.pow(1 - t, 0.75);
      for (let k = 0; k <= K; k++) {
        const p = pts[k % K];
        const jag = j === 0 ? 0 : (fbm(p.s * 0.35, t * 4, 61, 3) - 0.5) * 1.6 * Math.sin(Math.PI * Math.min(1, t * 1.3));
        const dx = p.x - C;
        const dz = p.z - C;
        const len = Math.hypot(dx, dz) || 1;
        const rr = len * f + jag * (j === J ? 0 : 1);
        const y = j === 0 ? heightAt(p.x, p.z) + 0.01 : -0.5 - depth * Math.pow(t, 1.15) + (fbm(p.s * 0.5, t * 3, 62, 2) - 0.5) * 0.8 * t;
        bpos.push(C + (dx / len) * rr, y, C + (dz / len) * rr);
        buv.push(k === K ? perim / 2 : p.s / 2, (t * depth) / 2);
      }
    }
    const bidx: number[] = [];
    for (let j = 0; j < J; j++)
      for (let k = 0; k < K; k++) {
        const a = j * (K + 1) + k;
        bidx.push(a, a + 1, a + K + 1, a + 1, a + K + 2, a + K + 1);
      }
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3));
    bgeo.setAttribute('uv', new THREE.Float32BufferAttribute(buv, 2));
    bgeo.setIndex(bidx);
    bgeo.computeVertexNormals();
    const base = new THREE.Mesh(bgeo, pbr('rock', { side: THREE.DoubleSide }));
    base.receiveShadow = true;
    extras.add(base);
    disposables.push(bgeo);
    // Roots hanging from the rock.
    const roots: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 34; i++) {
      const j = 1 + Math.floor(r() * 6);
      const k = Math.floor(r() * K);
      const a = j * (K + 1) + k;
      const sx = bpos[a * 3];
      const sy = bpos[a * 3 + 1];
      const sz = bpos[a * 3 + 2];
      const len = 0.8 + r() * 2.6;
      const dx = (sx - C) * 0.04;
      const dz = (sz - C) * 0.04;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx - dx * 2, sy + 0.1, sz - dz * 2),
        new THREE.Vector3(sx + dx + (r() - 0.5) * 0.3, sy - len * 0.4, sz + dz + (r() - 0.5) * 0.3),
        new THREE.Vector3(sx + dx * 1.5 + (r() - 0.5) * 0.5, sy - len, sz + dz * 1.5 + (r() - 0.5) * 0.5),
      ]);
      roots.push(new THREE.TubeGeometry(curve, 10, 0.025 + r() * 0.035, 5, false));
    }
    const rootGeo = mergeGeometries(roots, false)!;
    roots.forEach((g) => g.dispose());
    extras.add(new THREE.Mesh(rootGeo, pbr('bark', { repeat: [1, 4] })));
    disposables.push(rootGeo);
    // Cloud puffs under and around the island, drifting slowly.
    puffs = new THREE.Group();
    puffs.position.set(C, 0, C);
    const puffGeos: THREE.BufferGeometry[] = [];
    const cluster = (x: number, y: number, z: number, s: number) => {
      const n = 4 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const g = new THREE.IcosahedronGeometry(s * (0.55 + r() * 0.5), 2);
        g.scale(1.3, 0.8, 1.1);
        g.translate(x + (r() - 0.5) * s * 2.4, y + (r() - 0.3) * s * 0.7, z + (r() - 0.5) * s * 1.6);
        puffGeos.push(g);
      }
    };
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + r() * 0.3;
      const rad = size * 0.72 + 0.5 + r() * 2.5;
      cluster(Math.cos(a) * rad, -1.2 - r() * depth * 0.5, Math.sin(a) * rad, 0.7 + r() * 0.8);
    }
    // Fluffy clouds hugging the rim.
    for (let k = 0; k < K; k += 3) {
      const p = pts[k];
      const dx = p.x - C;
      const dz = p.z - C;
      const len = Math.hypot(dx, dz);
      const s = 0.35 + r() * 0.3;
      const g = new THREE.IcosahedronGeometry(s, 2);
      g.scale(1.2, 0.7, 1.2);
      g.translate(dx + (dx / len) * s * 0.4, heightAt(p.x, p.z) - 0.12 - r() * 0.2, dz + (dz / len) * s * 0.4);
      puffGeos.push(g);
    }
    for (let i = 0; i < 5; i++) cluster((r() - 0.5) * size * 0.6, -depth * (0.65 + r() * 0.35), (r() - 0.5) * size * 0.6, 1 + r());
    const puffGeo = mergeGeometries(puffGeos, false)!;
    puffGeos.forEach((g) => g.dispose());
    const puffMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 1, emissive: '#E9E2F6', emissiveIntensity: 0.35 });
    puffs.add(new THREE.Mesh(puffGeo, puffMat));
    extras.add(puffs);
    disposables.push(puffGeo, puffMat);
  }

  // ── Things that follow tiles and objects: grass blades, flowers, deck planks, pond water.
  let detail: THREE.Group | null = null;
  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const pondMat = waterMaterial(
    { shallow: '#2C5F5C', deep: '#2C5F5C', alpha: [0.62, 0.62], ring: [100, 101], half: C, center: C, amp: 0.006, repeat: 3, sky: SKY[kind] },
    time,
  );
  disposables.push(grassMat, pondMat);
  const lin = (v: number) => Math.pow(v / 255, 2.2);
  const details = (world: World) => {
    if (detail) {
      group.remove(detail);
      detail.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
    }
    detail = new THREE.Group();
    const occupied = new Set(world.objects.map(([, x, z]) => z * size + x));
    const rr = rng(77);
    const bpos: number[] = [];
    const bcol: number[] = [];
    const blade = (x: number, y: number, z: number, hgt: number, g: number) => {
      const a = rr() * Math.PI;
      const w = 0.012 + rr() * 0.01;
      const dx = Math.cos(a) * w;
      const dz = Math.sin(a) * w;
      const bx = (rr() - 0.5) * 0.05;
      const bz = (rr() - 0.5) * 0.05;
      // Both faces, each lit from above (no dark backsides).
      bpos.push(x - dx, y, z - dz, x + dx, y, z + dz, x + bx, y + hgt, z + bz);
      bpos.push(x + dx, y, z + dz, x - dx, y, z - dz, x + bx, y + hgt, z + bz);
      const base = [lin(62) * g, lin(92) * g, lin(36) * g];
      const tip = [lin(128) * g, lin(160) * g, lin(70) * g];
      bcol.push(...base, ...base, ...tip, ...base, ...base, ...tip);
    };
    const flower = (x: number, y: number, z: number) => {
      const c = FLOWERS[Math.floor(rr() * 4)];
      const s = 0.022;
      const col = [lin(c[0]), lin(c[1]), lin(c[2])];
      bpos.push(x - s, y, z - s, x + s, y, z + s, x + s, y, z - s, x - s, y, z - s, x - s, y, z + s, x + s, y, z + s);
      for (let k = 0; k < 6; k++) bcol.push(...col);
    };
    const cells = size * size;
    const perCell = Math.max(5, Math.min(22, Math.round(7000 / cells)));
    const deck: THREE.BufferGeometry[] = [];
    const ponds: THREE.BufferGeometry[] = [];
    for (let z = 0; z < size; z++)
      for (let x = 0; x < size; x++) {
        const code = world.tiles.charCodeAt(z * size + x);
        if (code === 100) {
          const g = new THREE.BoxGeometry(1, 0.03, 1);
          if ((x + z) % 2) g.rotateY(Math.PI / 2);
          g.translate(x + 0.5, DECK_Y - 0.015, z + 0.5);
          deck.push(g);
        } else if (code === 119) {
          const g = new THREE.PlaneGeometry(1, 1);
          g.rotateX(-Math.PI / 2);
          g.translate(x + 0.5, POND_Y, z + 0.5);
          ponds.push(g);
        }
        if ((code !== 103 && code !== 102) || occupied.has(z * size + x)) continue;
        const meadow = code === 102;
        for (let i = 0; i < perCell; i++) {
          const px = x + rr();
          const pz = z + rr();
          if (pondDepth(px, pz) > 0.001) continue;
          blade(px, 0, pz, 0.05 + rr() * (meadow ? 0.12 : 0.09), 0.75 + rr() * 0.45);
        }
        if (meadow)
          for (let i = 0; i < 4; i++) {
            const px = x + 0.1 + rr() * 0.8;
            const pz = z + 0.1 + rr() * 0.8;
            const hgt = 0.06 + rr() * 0.06;
            blade(px, 0, pz, hgt, 0.9);
            flower(px, hgt, pz);
          }
      }
    // Grass on the slope around the normal island.
    if (kind === 'normal') {
      const n = Math.round(size * 4 * 40);
      for (let i = 0; i < n; i++) {
        const [px, pz] = ring(0.05, 1.6);
        const h = heightAt(px, pz);
        if (h < -0.17) continue;
        blade(px, h, pz, 0.05 + rr() * 0.08, 0.7 + rr() * 0.4);
      }
    }
    if (bpos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(bcol, 3));
      const nrm = new Float32Array(bpos.length);
      for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      const m = new THREE.Mesh(g, grassMat);
      m.receiveShadow = true;
      detail.add(m);
    }
    if (deck.length) {
      const g = mergeGeometries(deck, false)!;
      deck.forEach((d) => d.dispose());
      const m = new THREE.Mesh(g, pbr('wood'));
      m.castShadow = true;
      m.receiveShadow = true;
      detail.add(m);
    }
    if (ponds.length) {
      const g = mergeGeometries(ponds, false)!;
      ponds.forEach((d) => d.dispose());
      const m = new THREE.Mesh(g, pondMat);
      m.receiveShadow = true;
      detail.add(m);
    }
    group.add(detail);
  };
  details(world0);

  const paint = (world: World) => {
    if (world.tiles === tiles) return;
    // Changed cells → the texture area to repaint (one cell of margin for the soft borders).
    let minX = size;
    let minZ = size;
    let maxX = -1;
    let maxZ = -1;
    let water = false;
    for (let i = 0; i < size * size; i++) {
      if (world.tiles[i] === tiles[i]) continue;
      const x = i % size;
      const z = Math.floor(i / size);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      if (world.tiles[i] === 'w' || tiles[i] === 'w') water = true;
    }
    tiles = world.tiles;
    if (maxX < 0) return;
    if (water) fillHeights();
    const toPx = (v: number) => Math.max(0, Math.min(R, Math.round(((v - x0) / W) * R)));
    paintRect(toPx(minX - 1), toPx(minZ - 1), toPx(maxX + 2), toPx(maxZ + 2));
  };

  return {
    group,
    kind,
    size,
    heightAt,
    paint,
    details,
    update(t: number) {
      time.value = t;
      if (seaMat?.normalMap) seaMat.normalMap.offset.set(t * 0.012, t * 0.007);
      if (pondMat.normalMap) pondMat.normalMap.offset.set(t * 0.02, -t * 0.013);
      if (puffs) puffs.rotation.y = t * 0.012;
    },
    dispose() {
      if (detail) detail.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
      extras.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      disposables.forEach((d) => d.dispose());
      seaMat?.normalMap?.dispose();
      pondMat.normalMap?.dispose();
    },
  };
}
