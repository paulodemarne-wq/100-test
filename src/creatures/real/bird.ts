// Realistic perched birds (eagle, owl, parrot…): egg-shaped body, head with a hooked or straight beak, folded wings
// made of real feathers, a tail fan, scaly legs gripping a branch. The majestic adult spreads its wings.
import * as THREE from 'three';
import { addFur } from './fur';
import { loft } from './loft';
import { glowLines, hex, mix, mixHex, noise2, smooth } from './noise';
import { auraMotes } from './snake';
import { bake, eyeTexture } from './textures';
import { STAGES, type Age, type Animal, type Stage } from './types';

type RGB = [number, number, number];
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const mul = (c: RGB, k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];

export type BirdLook = {
  /** Head, body, wings, tail, chest (front), and the down of the chick. */
  head: string;
  body: string;
  wing: string;
  tail: string;
  chest: string;
  chick: string;
  beak: string;
  legs: string;
  iris: string;
  /** Hooked (raptor) or straight beak; owls get a flat face. */
  beakShape?: 'hook' | 'straight' | 'parrot';
  owl?: boolean;
  majestic?: Partial<Pick<BirdLook, 'head' | 'body' | 'wing' | 'tail' | 'chest' | 'iris' | 'beak' | 'legs'>>;
  /** Color of the glowing markings (legend). */
  glow?: string;
  size?: number;
};

const AGES: Record<Age, { size: number; head: number; down: number; spread: boolean }> = {
  0: { size: 0.55, head: 1.45, down: 1, spread: false },
  1: { size: 0.78, head: 1.15, down: 0.25, spread: false },
  2: { size: 0.95, head: 1, down: 0, spread: false },
  3: { size: 1.02, head: 1, down: 0, spread: true },
};

/** Overlapping feathers, row after row (u along, v across), with a shaft in each. */
function featherPixel(u: number, v: number, rows: number, cols: number, seed: number) {
  const fy = u * rows;
  const row = Math.floor(fy);
  const off = row % 2 ? 0.5 : 0;
  const fx = v * cols + off;
  const col = Math.floor(fx);
  const lx = fx - col - 0.5; // -0.5..0.5 across the feather
  const ly = fy - row; // 0 top .. 1 tip
  const edge = smooth(0.5, 0.36, Math.abs(lx) + ly * ly * 0.25);
  const shaft = smooth(0.05, 0.0, Math.abs(lx)) * 0.35;
  const barbs = 0.9 + 0.1 * Math.sin((ly * 40 + Math.abs(lx) * 30) * 1.0);
  const id = noise2(col * 1.7, row * 2.3, seed);
  return { edge, shaft, barbs, id, ly };
}

export function buildBird(look: BirdLook, stage: Stage, seed: number): Animal {
  const S = STAGES[stage];
  const age = S.age;
  const A = AGES[age];
  const m = look.majestic ?? {};
  const col = {
    ...look,
    head: mixHex(look.head, m.head, S.rich),
    body: mixHex(look.body, m.body, S.rich),
    wing: mixHex(look.wing, m.wing, S.rich),
    tail: mixHex(look.tail, m.tail, S.rich),
    chest: mixHex(look.chest, m.chest, S.rich),
    iris: mixHex(look.iris, m.iris, S.rich),
    beak: mixHex(look.beak, m.beak, S.rich),
    legs: mixHex(look.legs, m.legs, S.rich),
  };
  const glowColor = look.glow ?? '#FFC86B';
  const glowing: THREE.MeshStandardMaterial[] = [];
  const H = A.head;
  const group = new THREE.Group();
  const C = (c: string) => hex(c) as RGB;
  const headC = age <= 1 ? (age === 0 ? C(look.chick) : lerp3(C(col.body), C(col.head), 0.25)) : C(col.head);
  const bodyC = age === 0 ? C(look.chick) : C(col.body);
  const chestC = age === 0 ? C(look.chick) : C(col.chest);
  const wingC = age === 0 ? lerp3(C(look.chick), C(col.wing), 0.3) : C(col.wing);
  const tailC = age <= 1 ? lerp3(C(col.body), C(col.tail), age === 0 ? 0 : 0.35) : C(col.tail);

  // ── Body + neck + head along one curve: tail base → belly → chest → neck → crown → beak base.
  const headY = 1.0 + (H - 1) * 0.05;
  const spine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.2, 0.4, 0),
    new THREE.Vector3(-0.08, 0.56, 0),
    new THREE.Vector3(0.03, 0.74, 0),
    new THREE.Vector3(0.06, 0.88, 0),
    new THREE.Vector3(0.08, headY, 0),
    new THREE.Vector3(0.15 + 0.03 * H, headY + 0.03, 0),
    new THREE.Vector3(0.21 + 0.06 * H, headY - 0.0, 0),
  ]);
  const up = new THREE.Vector3(-0.62, 0.78, 0).normalize();
  const yOf = (u: number) => spine.getPointAt(u);
  const sec = (u: number) => {
    const p = yOf(u);
    // By height: tail base, body, chest, neck, head.
    const y = p.y;
    const bodyR = mix(0.1, 0.22, smooth(0.38, 0.6, y)) * mix(1, 0.62, smooth(0.78, 0.92, y));
    const headR = 0.105 * H * (age === 0 ? 1.08 : 1);
    const toHead = smooth(0.86, headY - 0.03, y);
    let r = mix(bodyR, headR, toHead);
    // Toward the beak base the head narrows.
    r *= mix(1, 0.55, smooth(0.86, 1, u));
    return { rx: r * (look.owl ? 1.15 : 0.95), ry: r * 1.05, flat: 0 };
  };
  const { geometry } = loft({ curve: spine, rings: 110, radial: 36, up, section: sec });

  const plumage = bake(512, 256, (u, v) => {
    const p = yOf(u);
    const front = smooth(0.1, -0.7, Math.cos((v - 0.25) * Math.PI * 2)); // 1 on the chest
    const isHead = smooth(0.86, 0.92, p.y);
    let c = lerp3(bodyC, chestC, front * 0.85);
    c = lerp3(c, headC, isHead);
    const f = featherPixel(u, v, isHead > 0.5 ? 70 : 38, isHead > 0.5 ? 40 : 22, seed);
    c = mul(c, (0.82 + 0.18 * f.edge) * f.barbs * (0.92 + f.id * 0.16));
    // Mottled juvenile.
    if (age === 1) c = lerp3(c, C(col.chest), smooth(0.62, 0.7, noise2(u * 30, v * 20, seed + 9)) * 0.6);
    const glow = S.marks ? glowLines(u * 6, v * 4, seed + 50, 4, 0.05) * smooth(-0.6, 0.2, front) * (1 - isHead) : 0;
    return { c, height: f.edge * 0.6 + f.shaft * 0.2, rough: 0.85, glow };
  });
  const bodyMat = new THREE.MeshStandardMaterial({ map: plumage.map, normalMap: plumage.normalMap, roughness: 0.85, emissiveMap: plumage.glowMap, emissive: new THREE.Color(plumage.glowMap ? glowColor : '#000000'), emissiveIntensity: S.marks });
  glowing.push(bodyMat);
  const bodyMesh = new THREE.Mesh(geometry, bodyMat);
  bodyMesh.castShadow = true;
  group.add(bodyMesh);
  // Soft feathers on the head (and fluffy down on chicks).
  const downLen = age === 0 ? 0.028 : 0.012;
  for (const s of addFur(bodyMesh, { map: plumage.map, length: downLen, density: [600, 200], shells: age === 0 ? 16 : 8, gravity: 0.1 })) group.add(s);

  // ── Beak.
  const beakShape = look.beakShape ?? 'hook';
  const beakStart = spine.getPointAt(0.965);
  const bk = 0.11 * (age === 0 ? 0.9 : 1) * (beakShape === 'parrot' ? 1.1 : 1);
  const beakCurve = new THREE.CatmullRomCurve3(
    beakShape === 'straight'
      ? [new THREE.Vector3(0, 0, 0), new THREE.Vector3(bk * 0.7, -bk * 0.05, 0), new THREE.Vector3(bk * 1.3, -bk * 0.12, 0)]
      : [new THREE.Vector3(-bk * 0.1, 0, 0), new THREE.Vector3(bk * 0.55, bk * 0.05, 0), new THREE.Vector3(bk * 0.95, -bk * 0.12, 0), new THREE.Vector3(bk * 1.02, -bk * 0.45, 0)],
  );
  const { geometry: beakGeo } = loft({
    curve: beakCurve,
    rings: 30,
    radial: 16,
    section: (u) => {
      const r = bk * mix(0.42, 0.04, smooth(0, 1, u)) * (beakShape === 'parrot' ? 1.3 : 1);
      return { rx: r * 0.62, ry: r, flat: 0 };
    },
  });
  const beakColor = age === 0 ? '#6B6560' : col.beak;
  const beak = new THREE.Mesh(beakGeo, new THREE.MeshPhysicalMaterial({ color: beakColor, roughness: 0.35, clearcoat: 0.6 }));
  beak.position.copy(beakStart).add(new THREE.Vector3(downLen * 0.6, 0, 0));
  group.add(beak);
  // Lower jaw.
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(bk * 0.3, 14, 10), new THREE.MeshPhysicalMaterial({ color: beakColor, roughness: 0.4 }));
  jaw.scale.set(1.6, 0.5, 0.75);
  jaw.position.copy(beakStart).add(new THREE.Vector3(bk * 0.3, -bk * 0.22, 0));
  group.add(jaw);

  // ── Eyes with a heavy brow (the raptor stare).
  const eyeTex = eyeTexture(age === 0 ? '#3A2A20' : col.iris, false);
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTex, roughness: 0.05, clearcoat: 1, emissiveMap: eyeTex, emissive: new THREE.Color(S.eyes ? '#ffffff' : '#000000'), emissiveIntensity: S.eyes });
  const eyeR = 0.026 * H * (look.owl ? 1.7 : 1);
  const ep = spine.getPointAt(0.9);
  const er = sec(0.9).rx;
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 20, 14), eyeMat);
    eye.position.set(ep.x + 0.02 + downLen * 0.5, ep.y + 0.02 * H, side * (er * (look.owl ? 0.55 : 0.82) + downLen * 0.7));
    eye.lookAt(eye.position.clone().add(new THREE.Vector3(look.owl ? 1 : 0.55, 0, side * (look.owl ? 0.25 : 0.8))));
    group.add(eye);
    if (!look.owl && age >= 1) {
      const brow = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.4, 14, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(headC[0] / 255, headC[1] / 255, headC[2] / 255, THREE.SRGBColorSpace), roughness: 0.9 }));
      brow.scale.set(1.5, 0.45, 0.8);
      brow.position.copy(eye.position).add(new THREE.Vector3(0.0, eyeR * 0.85, -side * eyeR * 0.15));
      group.add(brow);
    }
  }

  // ── Alpha and legend: a crest of long feathers at the back of the head.
  if (stage >= 3) {
    const crestMat = new THREE.MeshStandardMaterial({ map: plumage.map, roughness: 0.85, side: THREE.DoubleSide, emissiveMap: plumage.glowMap, emissive: new THREE.Color(plumage.glowMap ? glowColor : '#000000'), emissiveIntensity: S.marks });
    const hp = spine.getPointAt(0.84);
    for (let i = 0; i < 7; i++) {
      const t = i / 6 - 0.5;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.16 + (0.5 - Math.abs(t)) * 0.08, 8), crestMat);
      c.scale.z = 0.35;
      c.position.set(hp.x - 0.07, hp.y + 0.05, t * 0.1);
      c.rotation.set(t * 0.6, 0, 1.15 + Math.abs(t) * 0.3);
      group.add(c);
    }
  }

  // ── Wings: a covert surface + long primary feathers. Folded along the body, or spread wide.
  const featherMat = (c: RGB, tipDark = 0.75) => {
    const t = bake(64, 256, (u, v) => {
      const across = Math.abs(v - 0.5) * 2;
      const shaft = smooth(0.06, 0.0, across);
      const barbs = 0.9 + 0.1 * Math.sin(u * 120 + across * 20);
      const cc = mul(c, (0.85 + 0.15 * (1 - across)) * barbs * mix(1, tipDark, smooth(0.6, 1, u)));
      const glow = S.marks ? Math.max(smooth(0.62, 0.9, across), smooth(0.05, 0.0, across) * 0.8) * smooth(0.2, 0.8, u) : 0;
      return { c: lerp3(cc, mul(c, 1.25), shaft * 0.5), height: 1 - across * across + shaft * 0.3, rough: 0.8, glow };
    });
    const fm = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.8, side: THREE.DoubleSide, emissiveMap: t.glowMap, emissive: new THREE.Color(t.glowMap ? glowColor : '#000000'), emissiveIntensity: S.marks });
    glowing.push(fm);
    return fm;
  };
  const wingMat = featherMat(wingC);
  const tailMat = featherMat(tailC, 0.92);
  const feather = (len: number, width: number, curve = 0.15) => {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(len * 0.5, 0, curve * len * 0.4), new THREE.Vector3(len, 0, curve * len)]);
    return loft({ curve: c, rings: 16, radial: 10, up: new THREE.Vector3(0, 1, 0), section: (u) => ({ rx: width * mix(0.55, 1, Math.sin(Math.min(1, u * 1.2) * Math.PI * 0.5)) * (u > 0.85 ? mix(1, 0.2, (u - 0.85) / 0.15) : 1), ry: 0.006 }) }).geometry;
  };
  if (age >= 1 || A.down < 1) {
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      const n = 8;
      if (!A.spread) {
        // Folded: feathers lie along the flank, from the shoulder down past the tail.
        for (let i = 0; i < n; i++) {
          const f = new THREE.Mesh(feather(0.52 - i * 0.02, 0.07), wingMat);
          f.position.set(0.02 - i * 0.012, 0.86 - i * 0.03, side * (0.2 + i * 0.004));
          f.rotation.set(0, side * 0.12, -1.95 - i * 0.04);
          f.castShadow = true;
          wing.add(f);
        }
        // Coverts (the shoulder of the wing).
        const cov = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), new THREE.MeshStandardMaterial({ map: plumage.map, roughness: 0.85 }));
        cov.scale.set(0.9, 1.25, 0.32);
        cov.position.set(-0.03, 0.72, side * 0.17);
        cov.rotation.z = 0.35;
        wing.add(cov);
      } else {
        // Spread and raised: built for the right wing (arm along +z, feathers trailing back), mirrored for the left.
        const reach = 0.95;
        const armMat = featherMat(wingC, 1);
        const arm = new THREE.CatmullRomCurve3([new THREE.Vector3(0.02, 0, 0.1), new THREE.Vector3(0.05, 0.03, reach * 0.45), new THREE.Vector3(0.0, 0.0, reach)]);
        const { geometry: armGeo } = loft({ curve: arm, rings: 30, radial: 14, up: new THREE.Vector3(0, 1, 0), section: (u) => ({ rx: mix(0.11, 0.05, u), ry: mix(0.05, 0.02, u) }) });
        const armMesh = new THREE.Mesh(armGeo, armMat);
        armMesh.castShadow = true;
        wing.add(armMesh);
        for (let i = 0; i < 16; i++) {
          const t = i / 15;
          const primary = smooth(0.55, 1, t);
          const f = new THREE.Mesh(feather(mix(0.42, 0.55, t), 0.07, 0.05), wingMat);
          f.position.copy(arm.getPointAt(Math.min(1, 0.05 + t * 0.95))).add(new THREE.Vector3(-0.02, -0.005 * i, 0));
          // Secondaries point back, primaries fan outward.
          f.rotation.set(0, Math.PI - primary * 1.15, 0);
          f.castShadow = true;
          wing.add(f);
        }
        // A row of coverts over the base of the flight feathers.
        for (let i = 0; i < 12; i++) {
          const t = i / 11;
          const f = new THREE.Mesh(feather(0.2, 0.06, 0.02), wingMat);
          f.position.copy(arm.getPointAt(0.04 + t * 0.9)).add(new THREE.Vector3(-0.03, 0.012, 0));
          f.rotation.set(0, Math.PI - smooth(0.6, 1, t) * 0.9, 0);
          wing.add(f);
        }
        wing.position.set(0.0, 0.9, side * 0.08);
        wing.scale.z = side;
        wing.rotation.set(-side * 0.7, 0, 0.25);
      }
      group.add(wing);
    }
  }

  // ── Tail fan.
  if (age >= 1) {
    for (let i = 0; i < 7; i++) {
      const t = i / 6 - 0.5;
      const f = new THREE.Mesh(feather(0.32, 0.06, 0), tailMat);
      f.position.set(-0.18, 0.44, t * 0.1);
      f.rotation.set(t * 0.5, 0, -2.05);
      f.castShadow = true;
      group.add(f);
    }
  }

  // ── Legs and talons on a branch.
  const legMat = new THREE.MeshStandardMaterial({ color: age === 0 ? '#C9B98F' : col.legs, roughness: 0.55 });
  const talonMat = new THREE.MeshPhysicalMaterial({ color: '#1A1714', roughness: 0.3, clearcoat: 0.6 });
  const branchY = 0.3;
  for (const side of [-1, 1]) {
    const z = side * 0.08;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.1, 10), legMat);
    leg.position.set(0.02, branchY + 0.08, z);
    leg.castShadow = true;
    group.add(leg);
    // Feathered "trousers".
    const pants = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), new THREE.MeshStandardMaterial({ map: plumage.map, roughness: 0.9 }));
    pants.scale.set(1, 1.5, 1);
    pants.position.set(0.0, branchY + 0.15, z);
    group.add(pants);
    for (const [a, len] of [
      [0.35, 0.07],
      [0, 0.075],
      [-0.35, 0.07],
      [Math.PI, 0.05],
    ] as const) {
      const toe = new THREE.Group();
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, len, 8), legMat);
      bone.rotation.z = Math.PI / 2;
      bone.position.x = len / 2;
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.04, 8), talonMat);
      claw.rotation.z = -Math.PI * 0.85;
      claw.position.set(len + 0.01, -0.015, 0);
      toe.add(bone, claw);
      toe.position.set(0.02, branchY + 0.035, z);
      toe.rotation.y = a;
      toe.rotation.z = -0.35;
      group.add(toe);
    }
  }
  const bark = bake(256, 64, (u, v) => {
    const n = noise2(u * 40, v * 6, seed + 3, 0, 6);
    const c: RGB = mul([96, 72, 52], 0.7 + 0.5 * n);
    return { c, height: n, rough: 0.95 };
  }, 4, true);
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.3, 16), new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, roughness: 0.95 }));
  branch.rotation.x = Math.PI / 2;
  branch.position.set(0.03, branchY, 0);
  branch.castShadow = true;
  group.add(branch);

  const motes = S.motes ? auraMotes(glowColor, 0.9, 1.4) : null;
  if (motes) group.add(motes);

  group.rotation.y = -0.75;
  group.scale.setScalar(S.size * (look.size ?? 1));
  return {
    group,
    height: 1.2 * S.size,
    update: (t) => {
      bodyMesh.rotation.z = Math.sin(t * 0.7) * 0.01;
      if (motes) motes.rotation.y = t * 0.25;
      if (S.marks) for (const mm of glowing) mm.emissiveIntensity = S.marks * (0.65 + 0.35 * Math.sin(t * 2.2));
    },
    dispose: () => group.traverse((o) => (o as THREE.Mesh).geometry?.dispose()),
  };
}
