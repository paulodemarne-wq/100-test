// Realistic snake: coiled on the ground, front raised, looking at you. Same snake at every age, it just grows up.
import * as THREE from 'three';
import { frameAt, loft, profile } from './loft';
import { mixHex, rng } from './noise';
import { eyeTexture, snakeSkin, SnakePattern } from './textures';
import { STAGES, type Age, type Animal, type Stage } from './types';

export type SnakeLook = {
  pattern: SnakePattern;
  base: string;
  dark: string;
  light: string;
  belly: string;
  iris: string;
  /** Colors of the majestic adult (richer). */
  majestic?: Partial<Pick<SnakeLook, 'base' | 'dark' | 'light' | 'belly' | 'iris'>>;
  /** Color of the glowing markings (legend). */
  glow?: string;
  /** Cobra hood when raised. */
  hood?: boolean;
  /** Body thickness (1 = python, 0.7 = slender). */
  girth?: number;
};

/** Per age: overall size, how coiled, head size, thickness. */
const AGES: Record<Age, { size: number; loops: number; head: number; girth: number; raise: number }> = {
  0: { size: 0.55, loops: 1.25, head: 1.35, girth: 0.85, raise: 0.55 },
  1: { size: 0.75, loops: 1.6, head: 1.15, girth: 0.92, raise: 0.75 },
  2: { size: 0.95, loops: 1.9, head: 1.0, girth: 1.0, raise: 0.9 },
  3: { size: 1.12, loops: 2.1, head: 1.0, girth: 1.06, raise: 1.12 },
};

export function buildSnake(look: SnakeLook, stage: Stage, seed: number): Animal {
  const S = STAGES[stage];
  const age = S.age;
  const A = AGES[age];
  const m = look.majestic ?? {};
  const col = {
    base: mixHex(look.base, m.base, S.rich),
    dark: mixHex(look.dark, m.dark, S.rich),
    light: mixHex(look.light, m.light, S.rich),
    belly: mixHex(look.belly, m.belly, S.rich),
    iris: mixHex(look.iris, m.iris, S.rich),
  };
  const girth = (look.girth ?? 1) * A.girth;
  const R = 0.16 * girth; // max body radius (before the size factor)
  const r = rng(seed);

  // ── Centerline: a spiral coil from the tail (inside) outward, then the neck rises toward the camera.
  const pts: THREE.Vector3[] = [];
  const turns = A.loops;
  const spacing = R * 2.25;
  const r0 = R * 1.6;
  const steps = Math.round(turns * 28);
  const theta1 = turns * Math.PI * 2;
  // Turn the coil so it ends at the back: the neck rises behind and the head comes forward.
  const phase = -Math.PI / 2 - theta1;
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * theta1;
    const rad = r0 + (spacing * th) / (Math.PI * 2);
    pts.push(new THREE.Vector3(Math.cos(th + phase) * rad, R * 0.82, Math.sin(th + phase) * rad));
  }
  const end = pts[pts.length - 1];
  const radEnd = r0 + (spacing * theta1) / (Math.PI * 2);
  const H = (0.55 + 0.5 * A.raise) * (0.6 + girth * 0.4);
  const side = r() < 0.5 ? -1 : 1;
  const headLenAbs = R * 3.3 * A.head;
  // An S up from the back: out of the coil, up, over toward the front, head turned three-quarters.
  pts.push(end.clone().add(new THREE.Vector3(R * 2.2, R * 0.2, -R * 0.4)));
  pts.push(new THREE.Vector3(radEnd * 0.55 * side, H * 0.35, -radEnd * 0.95));
  pts.push(new THREE.Vector3(radEnd * 0.3 * side, H * 0.75, -radEnd * 0.55));
  pts.push(new THREE.Vector3(radEnd * 0.05 * side, H, -radEnd * 0.05));
  const headDir = new THREE.Vector3(-0.45 * side, -0.08, 1).normalize();
  const headStart = new THREE.Vector3(-radEnd * 0.08 * side, H * 1.0, radEnd * 0.22);
  pts.push(headStart);
  pts.push(headStart.clone().addScaledVector(headDir, headLenAbs * 1.1));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const length = curve.getLength();

  // ── Thickness along the body: thin tail, thick middle, slimmer neck, wider head, snout.
  const headLen = headLenAbs / length;
  const hs = 1 - headLen; // head start
  const width = profile([
    [0, 0.06],
    [0.06, 0.42],
    [0.25, 0.92],
    [0.5, 1],
    [hs - 0.12, 0.8],
    [hs - 0.005, 0.6],
    [hs + headLen * 0.28, 0.92 * A.head],
    [hs + headLen * 0.6, 0.74 * A.head],
    [hs + headLen * 0.9, 0.5 * A.head],
    [1, 0.22],
  ]);
  const height = profile([
    [0, 0.06],
    [0.06, 0.4],
    [0.5, 0.86],
    [hs - 0.02, 0.56],
    [hs + headLen * 0.3, 0.5 * A.head],
    [hs + headLen * 0.75, 0.38 * A.head],
    [hs + headLen * 0.95, 0.27 * A.head],
    [1, 0.12],
  ]);
  const hoodAmt = (u: number) => (look.hood && age >= 2 ? Math.max(0, 1 - Math.abs(u - (hs - 0.09)) / 0.07) : 0);
  const { geometry } = loft({
    curve,
    rings: Math.round(length * 90),
    radial: 30,
    section: (u) => {
      const hood = hoodAmt(u);
      return { rx: R * (width(u) + hood * 1.6), ry: R * height(u) * (1 - hood * 0.35), flat: 0.6 };
    },
  });

  const skin = snakeSkin(
    {
      pattern: look.pattern,
      base: col.base,
      dark: col.dark,
      light: col.light,
      belly: col.belly,
      seed,
      rows: Math.round(length / (R * 0.17)),
      around: 40,
      head: hs,
      shine: age === 0 ? 0.15 : 0.3 + S.rich * 0.7,
      marks: S.marks > 0,
    },
    age === 0 ? 1024 : 2048,
    160,
  );
  const body = new THREE.MeshPhysicalMaterial({
    map: skin.map,
    normalMap: skin.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: skin.roughnessMap,
    roughness: 1,
    metalness: 0,
    clearcoat: 0.3 + S.rich * 0.4,
    clearcoatRoughness: mix01(0.35, 0.12, S.rich),
    iridescence: S.rich * 0.55,
    emissiveMap: skin.glowMap,
    emissive: new THREE.Color(skin.glowMap ? (look.glow ?? '#54E6FF') : '#000000'),
    emissiveIntensity: S.marks,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [200, 600],
  });
  const group = new THREE.Group();
  const bodyMesh = new THREE.Mesh(geometry, body);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // ── Eyes on both sides of the head.
  const eyeTex = eyeTexture(col.iris, look.pattern !== 'cobra' && look.pattern !== 'bands' && look.pattern !== 'emerald' ? true : look.pattern === 'emerald');
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTex, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02, emissiveMap: eyeTex, emissive: new THREE.Color(S.eyes ? '#ffffff' : '#000000'), emissiveIntensity: S.eyes });
  const eyeU = hs + headLen * 0.5;
  const fe = frameAt(curve, eyeU);
  const eyeR = R * 0.115 * A.head * (age === 0 ? 1.2 : 1);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 24, 16), eyeMat);
    const w = R * width(eyeU) * 0.86;
    eye.position.copy(fe.p).addScaledVector(fe.b, s * w).addScaledVector(fe.n, R * height(eyeU) * 0.55);
    // Look sideways and a bit forward.
    const look3 = fe.b.clone().multiplyScalar(s).addScaledVector(fe.t, 0.55).normalize();
    eye.lookAt(eye.position.clone().add(look3));
    group.add(eye);
  }

  // ── Forked tongue, flicking now and then (not for babies).
  const tongue = new THREE.Group();
  if (age >= 1) {
    const tm = new THREE.MeshStandardMaterial({ color: '#B0103A', roughness: 0.4 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.035, R * 0.045, R * 0.9, 6), tm);
    stem.rotation.x = Math.PI / 2;
    stem.position.z = R * 0.45;
    tongue.add(stem);
    for (const s of [-1, 1]) {
      const fork = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.012, R * 0.03, R * 0.35, 5), tm);
      fork.rotation.set(Math.PI / 2, 0, 0);
      fork.rotation.y = s * 0.45;
      fork.position.set(s * R * 0.07, 0, R * 1.02);
      tongue.add(fork);
    }
    const tip = frameAt(curve, 0.995);
    tongue.position.copy(tip.p).addScaledVector(tip.n, -R * 0.08);
    tongue.lookAt(tongue.position.clone().add(tip.t));
    tongue.scale.setScalar(0.001);
    group.add(tongue);
  }

  // ── Majestic adult: a slow ring of light motes around it.
  const motes: THREE.Points | null = S.motes ? auraMotes(look.glow ?? col.light, radEnd * 1.3, H) : null;
  if (motes) group.add(motes);

  // Center on the ground and scale to its age.
  const box = new THREE.Box3().setFromObject(bodyMesh);
  const center = box.getCenter(new THREE.Vector3());
  group.children.forEach((c) => {
    if (c !== motes) c.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
  });
  group.scale.setScalar(S.size);

  return {
    group,
    height: (box.max.y - box.min.y) * S.size,
    update: (t) => {
      // Gentle breathing and a head sway.
      bodyMesh.scale.set(1, 1 + Math.sin(t * 1.6) * 0.012, 1);
      group.rotation.y = Math.sin(t * 0.5) * 0.08;
      if (age >= 1) {
        const k = (t * 0.6 + seed * 0.13) % 3;
        const out = k < 0.35 ? Math.sin((k / 0.35) * Math.PI) : 0;
        tongue.scale.setScalar(Math.max(0.001, out));
      }
      if (motes) motes.rotation.y = t * 0.25;
      if (S.marks) body.emissiveIntensity = S.marks * (0.65 + 0.35 * Math.sin(t * 2.2));
    },
    dispose: () => {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
      });
      [skin.map, skin.normalMap, skin.roughnessMap].forEach((x) => x.dispose());
    },
  };
}

/** Floating golden dust around a majestic adult. */
const mix01 = (a: number, b: number, t: number) => a + (b - a) * t;

export function auraMotes(color: string, radius: number, height: number): THREE.Points {
  const r = rng(77);
  const n = 70;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = radius * (0.7 + r() * 0.5);
    pos[i * 3] = Math.cos(a) * d;
    pos[i * 3 + 1] = r() * height * 1.2 + 0.05;
    pos[i * 3 + 2] = Math.sin(a) * d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#FFE9A8'), 0.6), size: 0.035, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  return new THREE.Points(g, m);
}
