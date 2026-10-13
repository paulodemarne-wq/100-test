// Realistic nature island: a heightfield terrain (beach, grass plateau, hills), a sea with moving waves,
// broadleaf trees and pines with leaf cards, rocks, grass blades. The plateau stays flat to build on.
import * as THREE from 'three';
import { loft } from '../../creatures/real/loft';
import { fbm, hex, mix, noise2, rng, smooth } from '../../creatures/real/noise';
import { bake } from '../../creatures/real/textures';

type RGB = [number, number, number];
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const mul = (c: RGB, k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];

export const WATER_Y = 0;

export type Island = { group: THREE.Group; height: (x: number, z: number) => number; update: (t: number) => void };

/**
 * `size`: width of the flat plateau (the buildable grid). The island extends a bit further (slopes, beach).
 */
export function buildNatureIsland(size: number, seed = 1): Island {
  const group = new THREE.Group();
  const R = size * 0.5;
  const outer = R * 1.55;
  const plateauY = 0.32;

  // Height: flat plateau, slope down to the beach, then under the sea. Noise breaks the outline.
  const height = (x: number, z: number) => {
    const ang = Math.atan2(z, x);
    const wobble = (fbm(Math.cos(ang) * 2 + 5, Math.sin(ang) * 2 + 5, seed, 3) - 0.5) * R * 0.35;
    // Square-ish plateau (the grid) with rounded corners.
    const qx = Math.max(Math.abs(x) - R * 0.62, 0);
    const qz = Math.max(Math.abs(z) - R * 0.62, 0);
    const d = Math.hypot(qx, qz) - R * 0.24 - wobble * 0.6;
    const edge = R * 0.25;
    let h: number;
    if (d <= 0) h = plateauY;
    else if (d < edge) h = mix(plateauY, 0.08, smooth(0, edge, d));
    else h = mix(0.08, -0.6, smooth(edge, edge + R * 0.55, d));
    // A little relief on the plateau (very gentle, objects still sit flat) and more on the slopes.
    const n = fbm(x * 0.25 + 10, z * 0.25 + 10, seed + 2, 4);
    h += (n - 0.5) * (d <= 0 ? 0.04 : 0.18);
    return h;
  };

  // ── Terrain mesh.
  const seg = 160;
  const geo = new THREE.PlaneGeometry(outer * 2, outer * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  // Ground colors from height and slope: wet sand, sand, grass (patchy), dry grass, rock, dirt.
  const sand: RGB = hex('#D9C49A') as RGB;
  const wetSand: RGB = hex('#A8916A') as RGB;
  const grass: RGB = hex('#5E8A3A') as RGB;
  const grassDark: RGB = hex('#3F6B2A') as RGB;
  const grassDry: RGB = hex('#8C9A4A') as RGB;
  const rock: RGB = hex('#7D7A73') as RGB;
  const skin = bake(
    512,
    512,
    (u, v) => {
      const x = (u - 0.5) * outer * 2;
      const z = (v - 0.5) * outer * 2;
      const h = height(x, z);
      const hx = height(x + 0.05, z) - h;
      const hz = height(x, z + 0.05) - h;
      const slope = Math.hypot(hx, hz) / 0.05;
      const patch = fbm(x * 0.6, z * 0.6, seed + 5, 4);
      const fine = noise2(x * 18, z * 18, seed + 6);
      let c: RGB = lerp3(grass, grassDark, smooth(0.4, 0.65, patch));
      c = lerp3(c, grassDry, smooth(0.62, 0.8, fbm(x * 0.3 + 3, z * 0.3, seed + 7, 3)) * 0.7);
      c = lerp3(c, sand, smooth(0.2, 0.1, h));
      c = lerp3(c, wetSand, smooth(0.05, -0.02, h));
      c = lerp3(c, rock, smooth(0.9, 1.5, slope) * 0.85);
      // Under water: fades into the deep blue.
      c = lerp3(c, [14, 60, 85], smooth(-0.02, -0.55, h));
      // Foam line at the waterline.
      const foam = smooth(0.035, 0.0, Math.abs(h - 0.015)) * (0.6 + 0.4 * noise2(x * 6, z * 6, 3));
      c = lerp3(c, [245, 245, 238], foam * 0.7);
      return { c: mul(c, 0.85 + fine * 0.3), height: fine * 0.5 + patch, rough: h < 0.02 ? 0.45 : 0.95 };
    },
    1.5,
  );
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: skin.map, normalMap: skin.normalMap, roughness: 0.95 }));
  ground.receiveShadow = true;
  group.add(ground);

  // ── Sea: a big plane with moving waves (vertex shader) and a sparkle normal map.
  const waterNormal = bake(
    256,
    256,
    (u, v) => ({ c: [0, 0, 0], height: fbm(u * 8, v * 8, 31, 4, 8, 8), rough: 0 }),
    6,
    true,
  ).normalMap;
  waterNormal.wrapS = THREE.RepeatWrapping;
  waterNormal.repeat.set(10, 10);
  const water = new THREE.MeshPhysicalMaterial({
    color: '#1E6F86',
    roughness: 0.12,
    metalness: 0,
    transparent: true,
    opacity: 0.82,
    normalMap: waterNormal,
    normalScale: new THREE.Vector2(0.35, 0.35),
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    specularIntensity: 1,
  });
  const time = { value: 0 };
  water.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vShore;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float w = sin(position.x * 1.3 + uTime * 1.1) * 0.025 + sin(position.y * 1.7 - uTime * 0.9) * 0.02 + sin((position.x + position.y) * 3.1 + uTime * 2.0) * 0.008;
        transformed.z += w;`,
      );
    // Scroll the ripples.
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;');
  };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(outer * 14, outer * 14, 160, 160), water);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = WATER_Y;
  sea.receiveShadow = true;
  group.add(sea);
  // Deep water color under the sea (seen through it).
  const deep = new THREE.Mesh(new THREE.CircleGeometry(outer * 7, 64), new THREE.MeshBasicMaterial({ color: '#0E3C55' }));
  deep.rotation.x = -Math.PI / 2;
  deep.position.y = -0.65;
  group.add(deep);

  // ── Vegetation and rocks, kept off the middle (so the grid stays free) in this preview.
  const r = rng(seed * 13 + 1);
  const place = (minD: number, maxD: number, minH: number) => {
    for (let tries = 0; tries < 40; tries++) {
      const a = r() * Math.PI * 2;
      const d = mix(minD, maxD, r());
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const h = height(x, z);
      if (h > minH) return new THREE.Vector3(x, h, z);
    }
    return null;
  };
  for (let i = 0; i < 9; i++) {
    const p = place(R * 0.55, R * 1.05, 0.2);
    if (!p) continue;
    const tree = r() < 0.45 ? buildPine(r) : buildBroadleaf(r);
    tree.position.copy(p).add(new THREE.Vector3(0, -0.02, 0));
    tree.scale.setScalar(0.8 + r() * 0.5);
    tree.rotation.y = r() * Math.PI * 2;
    group.add(tree);
  }
  for (let i = 0; i < 10; i++) {
    const p = place(R * 0.6, R * 1.35, 0.0);
    if (!p) continue;
    const rk = buildRock(r, 0.12 + r() * 0.3);
    rk.position.copy(p);
    group.add(rk);
  }
  group.add(buildGrass(height, R * 1.1, 0.12, r, 5000));

  return {
    group,
    height,
    update: (t) => {
      time.value = t;
      waterNormal.offset.set(t * 0.01, t * 0.006);
    },
  };
}

// ── Trees ───────────────────────────────────────────────────────────────────────

let leafTex: THREE.DataTexture | null = null;
/** A cluster of leaves drawn into an alpha texture (one card = dozens of leaves). */
function leafTexture(): THREE.DataTexture {
  if (leafTex) return leafTex;
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const r = rng(99);
  const leaves = Array.from({ length: 70 }, () => {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 0.42;
    return { x: 0.5 + Math.cos(a) * d, y: 0.5 + Math.sin(a) * d, ang: r() * Math.PI, len: 0.07 + r() * 0.05, shade: 0.7 + r() * 0.45 };
  });
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = x / S;
      const py = y / S;
      let best = -1;
      let shade = 0;
      for (const l of leaves) {
        const dx = px - l.x;
        const dy = py - l.y;
        const ca = Math.cos(l.ang);
        const sa = Math.sin(l.ang);
        const lx = (dx * ca + dy * sa) / l.len;
        const ly = (-dx * sa + dy * ca) / (l.len * 0.45);
        const d = lx * lx + ly * ly;
        if (d < 1) {
          const k = 1 - d;
          if (k > best) {
            best = k;
            // Midrib and a lighter edge.
            shade = l.shade * (Math.abs(ly) < 0.08 ? 1.15 : 1) * (0.85 + k * 0.25);
          }
        }
      }
      const i = (y * S + x) * 4;
      if (best > 0) {
        data[i] = Math.min(255, 70 * shade);
        data[i + 1] = Math.min(255, 118 * shade);
        data[i + 2] = Math.min(255, 48 * shade);
        data[i + 3] = 255;
      } else data[i + 3] = 0;
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  leafTex = t;
  return t;
}

let barkMat: THREE.MeshStandardMaterial | null = null;
function bark(): THREE.MeshStandardMaterial {
  if (barkMat) return barkMat;
  const t = bake(128, 256, (u, v) => {
    const ridge = Math.abs(Math.sin(v * 40 + fbm(u * 6, v * 3, 5, 3) * 6));
    const c: RGB = mul([92, 72, 56], 0.6 + ridge * 0.5);
    return { c, height: ridge, rough: 1 };
  }, 4, true);
  barkMat = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 1 });
  return barkMat;
}

function leafCards(center: THREE.Vector3, radius: number, count: number, r: () => number, tint: THREE.Color, mat?: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  const pos: number[] = [];
  const uv: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < count; i++) {
    // Cards spread in a ball, facing outward (so the crown is lit like a volume).
    const dir = new THREE.Vector3(r() - 0.5, (r() - 0.35) * 0.9, r() - 0.5).normalize();
    const p = center.clone().addScaledVector(dir, radius * Math.cbrt(r()) * 0.9);
    const s = radius * (0.45 + r() * 0.35);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().lerp(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5), 0.5).normalize());
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    const base = pos.length / 3;
    // Inner leaves darker (self-shadowing).
    const ao = 0.55 + 0.45 * (p.distanceTo(center) / radius);
    for (const [cx, cy] of corners) {
      const v = new THREE.Vector3(cx * s, cy * s, 0).applyQuaternion(q).add(p);
      pos.push(v.x, v.y, v.z);
      uv.push((cx + 1) / 2, (cy + 1) / 2);
      // Normals point away from the crown's center: soft, volumetric lighting.
      const n = v.clone().sub(center).normalize();
      nrm.push(n.x, n.y, n.z);
      col.push(tint.r * ao, tint.g * ao, tint.b * ao);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const m =
    mat ??
    new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85 });
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildBroadleaf(r: () => number): THREE.Group {
  const g = new THREE.Group();
  const h = 1.1 + r() * 0.4;
  const trunk = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.05, 0), new THREE.Vector3((r() - 0.5) * 0.1, h * 0.5, (r() - 0.5) * 0.1), new THREE.Vector3((r() - 0.5) * 0.15, h, 0)]);
  const { geometry } = loft({ curve: trunk, rings: 20, radial: 12, up: new THREE.Vector3(1, 0, 0), section: (u) => ({ rx: mix(0.09, 0.045, u) * (u < 0.08 ? 1.4 : 1), ry: mix(0.09, 0.045, u) * (u < 0.08 ? 1.4 : 1) }) });
  const t = new THREE.Mesh(geometry, bark());
  t.castShadow = true;
  g.add(t);
  // A few branches and three or four leaf clumps.
  const top = trunk.getPointAt(1);
  const clumps = 3 + Math.floor(r() * 2);
  for (let i = 0; i < clumps; i++) {
    const a = (i / clumps) * Math.PI * 2 + r();
    const c = top.clone().add(new THREE.Vector3(Math.cos(a) * 0.3, 0.1 + r() * 0.3, Math.sin(a) * 0.3));
    const br = new THREE.CatmullRomCurve3([trunk.getPointAt(0.75), c]);
    const { geometry: bg } = loft({ curve: br, rings: 6, radial: 8, up: new THREE.Vector3(0, 1, 0), section: (u) => ({ rx: mix(0.04, 0.02, u), ry: mix(0.04, 0.02, u) }) });
    g.add(new THREE.Mesh(bg, bark()));
    const tint = new THREE.Color().setHSL(0.24 + r() * 0.05, 0.35 + r() * 0.15, 0.42 + r() * 0.12);
    g.add(leafCards(c, 0.42 + r() * 0.12, 70, r, tint));
  }
  g.add(leafCards(top.clone().add(new THREE.Vector3(0, 0.45, 0)), 0.48, 80, r, new THREE.Color().setHSL(0.25, 0.4, 0.5)));
  return g;
}

let needleTex: THREE.DataTexture | null = null;
function needleTexture(): THREE.DataTexture {
  if (needleTex) return needleTex;
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  const r = rng(7);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const u = x / S;
      const v = y / S;
      // A sprig: a central twig with needles angled outward.
      const twig = Math.abs(u - 0.5) < 0.02;
      const needle = Math.abs(((u - 0.5) * 2.2 - (v * 2 % 0.25) * 0) % 1) < 1 && (Math.abs(((v * 26 + Math.abs(u - 0.5) * 14) % 1) - 0.5) < 0.16) && Math.abs(u - 0.5) < 0.45 * (1 - v * 0.6);
      if (twig || needle) {
        const s = 0.75 + r() * 0.35;
        data[i] = 70 * s;
        data[i + 1] = 120 * s;
        data[i + 2] = 72 * s;
        data[i + 3] = 255;
      } else data[i + 3] = 0;
    }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  needleTex = t;
  return t;
}

export function buildPine(r: () => number): THREE.Group {
  const g = new THREE.Group();
  const h = 1.6 + r() * 0.5;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.08, h, 10), bark());
  trunk.position.y = h / 2 - 0.05;
  trunk.castShadow = true;
  g.add(trunk);
  const mat = new THREE.MeshStandardMaterial({ map: needleTexture(), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.9 });
  // Tiers of drooping branches covered in needle cards, smaller toward the top.
  const tiers = 7;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y = mix(0.35, h * 0.98, t);
    const rad = mix(0.62, 0.12, t);
    const tint = new THREE.Color().setHSL(0.33, 0.3, 0.55 + r() * 0.1);
    const ring = leafCards(new THREE.Vector3(0, y, 0), rad, Math.round(mix(60, 14, t)), r, tint, mat);
    ring.scale.y = 0.45;
    ring.position.y = y * 0.55;
    g.add(ring);
  }
  return g;
}

export function buildRock(r: () => number, size: number): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(size, 4);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const seed = Math.floor(r() * 1000);
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    const n = fbm(v.x * 3 / size + seed, v.y * 3 / size, seed, 4) * 0.5 + fbm(v.z * 3 / size, v.y * 2 / size + seed, seed + 1, 3) * 0.5;
    v.multiplyScalar(0.7 + n * 0.6);
    v.y *= 0.65;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const t = bake(128, 128, (u, v) => {
    const n = fbm(u * 8, v * 8, seed, 4, 8, 8);
    const lichen = smooth(0.62, 0.7, fbm(u * 5 + 3, v * 5, seed + 2, 3, 5, 5));
    const c = lerp3(mul([128, 124, 116], 0.7 + n * 0.5), [118, 128, 80], lichen * 0.6);
    return { c, height: n, rough: 0.9 };
  }, 4, true);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.92 }));
  m.castShadow = true;
  m.receiveShadow = true;
  m.rotation.y = r() * Math.PI * 2;
  return m;
}

/** Thousands of grass blades on the green parts (one mesh). */
export function buildGrass(height: (x: number, z: number) => number, radius: number, minH: number, r: () => number, count: number): THREE.Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = (r() - 0.5) * radius * 2;
    const z = (r() - 0.5) * radius * 2;
    const y = height(x, z);
    if (y < minH) continue;
    const a = r() * Math.PI;
    const w = 0.012 + r() * 0.01;
    const h = 0.05 + r() * 0.09;
    const bend = (r() - 0.5) * 0.05;
    const dx = Math.cos(a) * w;
    const dz = Math.sin(a) * w;
    // Both faces (each lit from above), so no black backsides.
    pos.push(x - dx, y, z - dz, x + dx, y, z + dz, x + bend, y + h, z + bend * 0.5);
    pos.push(x + dx, y, z + dz, x - dx, y, z - dz, x + bend, y + h, z + bend * 0.5);
    const g = 0.42 + r() * 0.25;
    for (let k = 0; k < 2; k++) col.push(g * 0.2, g * 0.36, g * 0.08, g * 0.2, g * 0.36, g * 0.08, g * 0.42, g * 0.6, g * 0.16);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // Lit like the ground under them (normals up), not like thin cards.
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  return m;
}
