// Realistic four-legged mammals (wolf, fox, tiger, lion, bear…): one smooth body from rump to nose, four jointed
// legs, a tail, ears, eyes and a nose, covered with real fur shells. Babies have big heads, short snouts, short legs.
import * as THREE from 'three';
import { addFur } from './fur';
import { loft, Section } from './loft';
import { clamp01, fbm, glowLines, hex, mix, mixHex, noise2, smooth } from './noise';
import { auraMotes } from './snake';
import { bake, eyeTexture } from './textures';
import { STAGES, type Age, type Animal, type Stage } from './types';

type RGB = [number, number, number];
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const mul = (c: RGB, k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];

export type CoatPattern = 'wolf' | 'fox' | 'tiger' | 'leopard' | 'plain' | 'lion' | 'panda' | 'zebra' | 'deer';

export type QuadLook = {
  coat: CoatPattern;
  /** Main fur, darker back, light belly/muzzle, accent (stripes, spots, tail tip, socks). */
  base: string;
  back: string;
  belly: string;
  accent: string;
  iris: string;
  nose?: string;
  majestic?: Partial<Pick<QuadLook, 'base' | 'back' | 'belly' | 'accent' | 'iris'>>;
  /** Body proportions (1 = wolf). */
  length?: number;
  height?: number;
  girth?: number;
  snout?: number;
  head?: number;
  ears?: 'pointy' | 'round' | 'big' | 'none';
  tail?: 'bushy' | 'thin' | 'tuft' | 'short';
  /** Fur length (1 = wolf). 0 = short coat (tiger, deer). */
  fur?: number;
  /** Color of the glowing markings (legend). */
  glow?: string;
  /** Lion's mane on the majestic adult (or every adult). */
  mane?: 'adult' | 'majestic';
  /** Antlers on the adult (deer). */
  antlers?: boolean;
};

const AGES: Record<Age, { size: number; head: number; snout: number; legs: number; body: number; fur: number; ears: number }> = {
  0: { size: 0.5, head: 1.45, snout: 0.55, legs: 0.72, body: 0.78, fur: 1.5, ears: 0.8 },
  1: { size: 0.72, head: 1.2, snout: 0.78, legs: 0.88, body: 0.9, fur: 1.2, ears: 0.92 },
  2: { size: 0.95, head: 1.0, snout: 1.0, legs: 1.0, body: 1.0, fur: 1.0, ears: 1.0 },
  3: { size: 1.1, head: 1.02, snout: 1.0, legs: 1.02, body: 1.04, fur: 1.25, ears: 1.0 },
};

export function buildQuadruped(look: QuadLook, stage: Stage, seed: number): Animal {
  const S = STAGES[stage];
  const age = S.age;
  const A = AGES[age];
  // Alpha and legend: the mane / ruff grows (it used to be the majestic adult's).
  const majestic = stage >= 3;
  const m = look.majestic ?? {};
  const col = {
    ...look,
    base: mixHex(look.base, m.base, S.rich),
    back: mixHex(look.back, m.back, S.rich),
    belly: mixHex(look.belly, m.belly, S.rich),
    accent: mixHex(look.accent, m.accent, S.rich),
    iris: mixHex(look.iris, m.iris, S.rich),
  };
  const glowColor = look.glow ?? '#9FE3FF';
  const L = (look.length ?? 1) * A.body;
  const Ht = (look.height ?? 1) * A.legs;
  const G = look.girth ?? 1;
  const headK = (look.head ?? 1) * A.head;
  const snoutK = (look.snout ?? 1) * A.snout;
  const furK = (look.fur ?? 1) * A.fur;
  const group = new THREE.Group();

  // ── Spine from rump to nose (x forward, y up). Legs set the back height.
  const leg = 0.74 * Ht;
  const backY = leg + 0.12;
  const rumpX = -0.62 * L;
  const shoulderX = 0.3 * L;
  const neckX = shoulderX + 0.16 * L;
  const skullX = neckX + 0.12 * headK;
  const snoutX = skullX + 0.12 * headK;
  const noseX = snoutX + 0.16 * snoutK * headK;
  const headY = backY + 0.3 * Math.max(0.85, Ht);
  const spinePts = [
    new THREE.Vector3(rumpX - 0.02, backY - 0.05, 0),
    new THREE.Vector3(rumpX + 0.18 * L, backY + 0.01, 0),
    new THREE.Vector3(-0.1 * L, backY - 0.03, 0),
    new THREE.Vector3(shoulderX, backY + 0.04, 0),
    new THREE.Vector3(neckX, backY + 0.2 * Ht, 0),
    new THREE.Vector3(skullX, headY, 0),
    new THREE.Vector3(snoutX, headY - 0.04 * headK, 0),
    new THREE.Vector3(noseX, headY - 0.09 * headK, 0),
  ];
  const spine = new THREE.CatmullRomCurve3(spinePts, false, 'centripetal');

  // Cross-sections by position along the body (x), so they don't depend on the curve's length.
  type Key = [number, number, number, number]; // x, rx, ry, dy
  const k = (x: number, rx: number, ry: number, dy = 0): Key => [x, rx * G, ry * G, dy];
  const H = headK;
  const keys: Key[] = [
    k(rumpX - 0.03, 0.04, 0.05),
    k(rumpX + 0.04, 0.15, 0.17, -0.01),
    k(rumpX + 0.2 * L, 0.18, 0.21, -0.02),
    k(-0.18 * L, 0.15, 0.17, 0.02),
    k(0.1 * L, 0.19, 0.27, -0.07),
    k(shoulderX, 0.18, 0.27, -0.06),
    [neckX - 0.02, 0.13 * G * Math.max(1, H * 0.8), 0.16 * G, 0],
    [skullX - 0.06 * H, 0.115 * H, 0.12 * H, 0],
    [skullX + 0.03 * H, 0.125 * H, 0.115 * H, 0.01 * H],
    [snoutX, 0.075 * H, 0.075 * H, -0.02 * H],
    [noseX - 0.04 * H, 0.05 * H, 0.055 * H, -0.02 * H],
    [noseX, 0.028 * H, 0.03 * H, -0.02 * H],
  ];
  const at = (x: number): Section => {
    if (x <= keys[0][0]) return { rx: keys[0][1], ry: keys[0][2], dy: keys[0][3], flat: 0.2 };
    for (let i = 1; i < keys.length; i++) {
      if (x <= keys[i][0]) {
        const a = keys[i - 1];
        const b = keys[i];
        let t = (x - a[0]) / (b[0] - a[0] || 1);
        t = t * t * (3 - 2 * t);
        return { rx: mix(a[1], b[1], t), ry: mix(a[2], b[2], t), dy: mix(a[3], b[3], t), flat: 0.2 };
      }
    }
    const l = keys[keys.length - 1];
    return { rx: l[1], ry: l[2], dy: l[3] };
  };
  const { geometry: bodyGeo } = loft({ curve: spine, rings: 140, radial: 40, section: (u) => at(spine.getPointAt(u).x) });

  // ── Coat colors, painted over the body's u (rump → nose) and v (around: .25 back, .75 belly).
  const base = hex(col.base) as RGB;
  const back = hex(col.back) as RGB;
  const belly = hex(col.belly) as RGB;
  const accent = hex(col.accent) as RGB;
  const xOf = (u: number) => spine.getPointAt(Math.min(1, Math.max(0, u))).x;
  const xs = Array.from({ length: 257 }, (_, i) => xOf(i / 256));
  const xAt = (u: number) => xs[Math.round(u * 256)];
  const coat = (u: number, v: number, x: number): RGB => {
    const top = Math.cos((v - 0.25) * Math.PI * 2); // 1 back, -1 belly
    const streak = 0.9 + 0.2 * noise2(u * 220, v * 14, seed + 1);
    const cloud = fbm(u * 9, v * 4, seed, 4, 0, 4);
    let c = lerp3(base, back, smooth(0.25, 0.85, top + (cloud - 0.5) * 0.6));
    c = lerp3(c, belly, smooth(-0.15, -0.6, top));
    const inHead = x > skullX - 0.1 * H;
    const muzzle = x > snoutX - 0.03 * H;
    switch (look.coat) {
      case 'wolf':
        if (inHead) c = lerp3(c, belly, smooth(0.2, -0.4, top) * 0.9);
        if (muzzle) c = lerp3(c, belly, 0.5 + smooth(0.4, -0.2, top) * 0.5);
        break;
      case 'fox':
        if (muzzle || inHead) c = lerp3(c, belly, smooth(0.1, -0.35, top));
        break;
      case 'tiger':
      case 'zebra': {
        const s = Math.sin((x * (look.coat === 'zebra' ? 26 : 19) + (fbm(x * 3, v * 3, seed, 2, 0, 3) - 0.5) * 3.2 + Math.abs(top) * 0.8) * Math.PI);
        const stripe = smooth(0.55, 0.75, s) * smooth(-0.85, -0.3, -Math.abs(v - 0.75) * 4 + 0.6);
        c = lerp3(c, accent, stripe * (look.coat === 'zebra' ? 1 : smooth(-0.7, -0.2, top) < 1 ? 1 : 0.4));
        if (muzzle) c = lerp3(c, belly, 0.6);
        break;
      }
      case 'leopard': {
        const n = fbm(u * 60, v * 22, seed + 4, 3, 0, 22);
        const ring = smooth(0.58, 0.62, n) * (1 - smooth(0.66, 0.7, n));
        c = lerp3(c, accent, ring * 0.95 + smooth(0.7, 0.74, n) * 0.25);
        break;
      }
      case 'lion':
        if (muzzle) c = lerp3(c, belly, 0.55);
        break;
      case 'panda': {
        const band = smooth(0.08, 0.02, Math.abs(x - shoulderX + 0.05)) ;
        c = lerp3(belly, accent, Math.max(band, smooth(-0.2, -0.6, top) * (x < shoulderX + 0.05 && x > rumpX + 0.3 ? 1 : 0)));
        break;
      }
      case 'deer':
        if (x < rumpX + 0.12) c = lerp3(c, belly, smooth(0.3, -0.3, top));
        break;
      case 'plain':
        break;
    }
    return mul(c, streak);
  };
  const skin = bake(512, 256, (u, v) => {
    const c = coat(u, v, xAt(u));
    const top = Math.cos((v - 0.25) * Math.PI * 2);
    const glow = S.marks ? glowLines(u * 7, v * 4, seed + 50, 4, 0.045) * smooth(-0.3, 0.3, top) : 0;
    return { c, height: noise2(u * 300, v * 60, seed) * 0.4, rough: 0.9, glow };
  });
  // Longer fur on the neck (ruff/mane), shorter on the face.
  const lenMap = bake(256, 64, (u) => {
    const x = xAt(u);
    const ruff = smooth(shoulderX - 0.15, neckX, x) * (1 - smooth(skullX - 0.04, skullX + 0.04 * H, x));
    const mane = look.mane === 'adult' ? age >= 2 : look.mane === 'majestic' ? majestic : false;
    const face = smooth(skullX - 0.05, snoutX, x);
    const l = clamp01(0.55 + ruff * (mane ? 1.6 : 0.45) - face * 0.45);
    const g = Math.round(l * 255);
    return { c: [g, g, g], height: 0, rough: 1 };
  });

  const skinMat = new THREE.MeshStandardMaterial({ map: skin.map, normalMap: skin.normalMap, roughness: 0.95, emissiveMap: skin.glowMap, emissive: new THREE.Color(skin.glowMap ? glowColor : '#000000'), emissiveIntensity: S.marks });
  const body = new THREE.Mesh(bodyGeo, skinMat);
  body.castShadow = true;
  group.add(body);
  const furLen = 0.045 * furK;
  const breathing: THREE.Mesh[] = [body];
  if (furK > 0.05)
    for (const s of addFur(body, { map: skin.map, length: furLen * (look.mane && (look.mane === 'adult' ? age >= 2 : majestic) ? 1.8 : 1), lengthMap: lenMap.map, density: [900, 140], shells: 16, gravity: 0.6, glowMap: skin.glowMap, glowColor, glow: S.marks })) {
      group.add(s);
      breathing.push(s);
    }

  // ── Legs: shoulder → elbow → wrist → paw (hind legs bend the other way at the hock).
  const legMat = (u0: number) => {
    const t = bake(64, 128, (u, v) => {
      const c0 = coat(u0, 0.5, shoulderX);
      let c = lerp3(c0, belly, smooth(0.35, 0.8, u) * (look.coat === 'tiger' || look.coat === 'leopard' ? 0.3 : 0.6));
      if (look.coat === 'fox') c = lerp3(c, accent, smooth(0.45, 0.65, u));
      if (look.coat === 'panda') c = accent;
      if (look.coat === 'zebra') c = lerp3(belly, accent, smooth(0.4, 0.6, Math.sin(u * 30) * 0.5 + 0.5));
      return { c: mul(c, 0.92 + 0.16 * noise2(u * 40, v * 20, 3)), height: 0, rough: 0.9 };
    });
    return t.map;
  };
  const frontLeg = legMat(0.75);
  const hindLeg = legMat(0.25);
  const legR = 0.062 * G * (age === 0 ? 1.15 : 1);
  for (const side of [-1, 1]) {
    const z = side * 0.1 * G;
    // Legs start inside the body (shoulder blade / thigh), then elbow, wrist, paw.
    const front = new THREE.CatmullRomCurve3([
      new THREE.Vector3(shoulderX + 0.02, backY + 0.01, z * 0.6),
      new THREE.Vector3(shoulderX - 0.05, leg * 0.62, z),
      new THREE.Vector3(shoulderX - 0.02, leg * 0.2, z),
      new THREE.Vector3(shoulderX + 0.02, 0.03, z),
    ]);
    const hind = new THREE.CatmullRomCurve3([
      new THREE.Vector3(rumpX + 0.19 * L, backY + 0.02, z * 0.55),
      new THREE.Vector3(rumpX + 0.29 * L, leg * 0.6, z),
      new THREE.Vector3(rumpX + 0.1 * L, leg * 0.27, z),
      new THREE.Vector3(rumpX + 0.13 * L, 0.03, z),
    ]);
    for (const [curve, map, thick] of [
      [front, frontLeg, 1],
      [hind, hindLeg, 1.12],
    ] as const) {
      const { geometry } = loft({
        curve,
        rings: 44,
        radial: 18,
        up: new THREE.Vector3(1, 0, 0),
        section: (u) => {
          const r = legR * mix(2.3 * thick, 0.62, smooth(0.05, 0.55, u)) * mix(1, 0.85, smooth(0.6, 1, u));
          return { rx: r * 0.72, ry: r * 1.1 };
        },
      });
      const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map, roughness: 0.92 }));
      m.castShadow = true;
      group.add(m);
      if (furK > 0.05) for (const s of addFur(m, { map, length: furLen * 0.45, density: [120, 60], shells: 10, gravity: 0.2 })) group.add(s);
      // Paw.
      const end = curve.getPointAt(1);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(legR, 18, 12), new THREE.MeshStandardMaterial({ map, roughness: 0.9 }));
      paw.scale.set(1.45, 0.55, 1.05);
      paw.position.set(end.x + legR * 0.35, legR * 0.5, end.z);
      paw.castShadow = true;
      group.add(paw);
    }
  }

  // ── Tail.
  const tailType = look.tail ?? 'bushy';
  if (tailType !== 'short') {
    const tl = tailType === 'thin' || tailType === 'tuft' ? 0.75 : 0.62;
    const tail = new THREE.CatmullRomCurve3([
      new THREE.Vector3(rumpX + 0.04, backY - 0.02, 0),
      new THREE.Vector3(rumpX - 0.18 * tl, backY - 0.08, 0),
      new THREE.Vector3(rumpX - 0.28 * tl, backY - 0.3 * tl, 0.03),
      new THREE.Vector3(rumpX - 0.3 * tl, backY - 0.55 * tl, 0.06),
    ]);
    const thick = tailType === 'bushy' ? 1 : 0.45;
    const tailMap = bake(128, 32, (u, v) => {
      let c = lerp3(lerp3(base, back, 0.35), belly, smooth(0.1, -0.6, Math.cos((v - 0.25) * Math.PI * 2)) * 0.5);
      if (look.coat === 'tiger' || look.coat === 'leopard' || look.coat === 'lion' || look.coat === 'plain') c = coat(0.05, v, rumpX);
      if (tailType === 'bushy' || tailType === 'tuft') c = lerp3(c, look.coat === 'fox' ? belly : accent, smooth(0.8, 0.93, u));
      if (look.coat === 'tiger' || look.coat === 'leopard') c = lerp3(c, accent, smooth(0.6, 0.75, Math.sin(u * 24) * 0.5 + 0.5));
      return { c: mul(c, 0.9 + 0.2 * noise2(u * 60, v * 10, 7)), height: 0, rough: 0.9 };
    }).map;
    const { geometry } = loft({
      curve: tail,
      rings: 40,
      radial: 16,
      section: (u) => {
        const r = 0.055 * G * thick * (tailType === 'bushy' ? mix(0.8, 1.35, Math.sin(u * Math.PI)) : mix(1, 0.5, u)) * (u > 0.94 ? 0.6 : 1);
        return { rx: r, ry: r };
      },
    });
    const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: tailMap, roughness: 0.9 }));
    m.castShadow = true;
    group.add(m);
    if (tailType === 'bushy' && furK > 0.05) for (const s of addFur(m, { map: tailMap, length: furLen * 2.2, density: [80, 40], shells: 14, gravity: 0.5 })) group.add(s);
    if (tailType === 'tuft') {
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), new THREE.MeshStandardMaterial({ color: col.accent, roughness: 0.95 }));
      tuft.position.copy(tail.getPointAt(1));
      tuft.scale.set(1, 1.5, 1);
      group.add(tuft);
    }
  }

  // ── Ears.
  const earType = look.ears ?? 'pointy';
  if (earType !== 'none') {
    const ek = A.ears * H * (earType === 'big' ? 1.6 : earType === 'round' ? 0.75 : 1);
    const earMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(col.back).lerp(new THREE.Color(col.base), 0.4), roughness: 0.9, side: THREE.DoubleSide });
    const innerMat = new THREE.MeshStandardMaterial({ color: col.belly, roughness: 1, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const ear = new THREE.Group();
      const shape =
        earType === 'round'
          ? new THREE.SphereGeometry(0.06 * ek, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)
          : new THREE.ConeGeometry(0.062 * ek, 0.17 * ek, 16, 1, false);
      const outer = new THREE.Mesh(shape, earMat);
      outer.scale.set(0.42, 1, 1);
      const inner = new THREE.Mesh(shape, innerMat);
      inner.scale.set(0.2, 0.82, 0.72);
      inner.position.set(0.016 * ek, -0.01 * ek, 0);
      ear.add(outer, inner);
      ear.position.set(skullX - 0.045 * H, headY + 0.12 * H + 0.06 * ek, side * 0.07 * H);
      ear.rotation.set(side * 0.28, side * 0.3, -0.12);
      group.add(ear);
    }
  }

  // ── Eyes and nose.
  const eyeTex = eyeTexture(col.iris, false);
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTex, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, emissiveMap: eyeTex, emissive: new THREE.Color(S.eyes ? '#ffffff' : '#000000'), emissiveIntensity: S.eyes });
  const eyeR = 0.026 * H * (age === 0 ? 1.25 : 1);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 20, 14), eyeMat);
    const ex = skullX + 0.075 * H;
    const s = at(ex);
    eye.position.set(ex, spine.getPointAt(0.93).y * 0 + headY + 0.03 * H, side * s.rx * 0.78);
    eye.lookAt(eye.position.clone().add(new THREE.Vector3(0.8, 0.05, side * 0.6)));
    group.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03 * H, 18, 12), new THREE.MeshPhysicalMaterial({ color: col.nose ?? '#151212', roughness: 0.35, clearcoat: 0.8 }));
  nose.scale.set(0.8, 0.75, 1.05);
  nose.position.set(noseX - 0.005, headY - 0.065 * H, 0);
  group.add(nose);

  // ── Lion's mane / antlers.
  if (look.antlers && age >= 2) group.add(antlers(skullX, headY + 0.1 * H, H * (majestic ? 1.25 : 1)));

  const motes = S.motes ? auraMotes(glowColor, 0.9, 1.3) : null;
  if (motes) group.add(motes);

  // Center, face three-quarters toward the camera, scale to age.
  const box = new THREE.Box3().setFromObject(body);
  const cx = (box.min.x + box.max.x) / 2;
  group.children.forEach((c) => {
    if (c !== motes) c.position.x -= cx;
  });
  group.rotation.y = -0.85;
  group.scale.setScalar(S.size);
  const top = new THREE.Box3().setFromObject(group).max.y;

  return {
    group,
    height: top,
    update: (t) => {
      // Breathing.
      const b = 1 + Math.sin(t * 2.2) * 0.01;
      for (const m of breathing) m.scale.set(1, b, b);
      if (motes) motes.rotation.y = t * 0.25;
      if (S.marks) {
        const g = S.marks * (0.65 + 0.35 * Math.sin(t * 2.2));
        for (const m of breathing) (m.material as THREE.MeshStandardMaterial).emissiveIntensity = g;
      }
    },
    dispose: () => {
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}

function antlers(x: number, y: number, k: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#6E5A44', roughness: 0.8 });
  for (const side of [-1, 1]) {
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.05, 0.15, side * 0.08), new THREE.Vector3(-0.12, 0.32, side * 0.18), new THREE.Vector3(-0.08, 0.48, side * 0.26)].map((p) =>
      p.multiplyScalar(k),
    );
    const main = new THREE.CatmullRomCurve3(pts);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(main, 20, 0.018 * k, 8), mat));
    for (const u of [0.35, 0.6, 0.85]) {
      const p = main.getPointAt(u);
      const tine = new THREE.CatmullRomCurve3([p, p.clone().add(new THREE.Vector3(0.08 * k, 0.09 * k, side * 0.02 * k)), p.clone().add(new THREE.Vector3(0.1 * k, 0.17 * k, side * 0.03 * k))]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(tine, 10, 0.012 * k, 6), mat));
    }
  }
  g.position.set(x, y, 0);
  return g;
}
