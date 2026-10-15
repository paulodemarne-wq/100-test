// Builds a Vainc animal in three.js: the realistic animals (src/creatures/real/), the egg before hatching,
// and the shop accessories on top. Shared by the app (expo-gl) and the design previews (browser).
import * as THREE from 'three';
import { buildAnimal, buildEgg, STAGE_FROM_LEVEL, stageFor } from './real/index';
import { addNatureLights } from './real/lights';
import { STAGES, type Anchors as RealAnchors } from './real/types';
import { Equipped, isPlusSpecies, Species, speciesById } from './species';

export type Creature = {
  group: THREE.Group;
  /** Call every frame with the time in seconds. */
  update: (t: number) => void;
  dispose: () => void;
};

type V3 = [number, number, number];

/** Where accessories attach (head parts in the head's space, the rest in the animal's space). */
type Anchors = {
  head: THREE.Group;
  R: number;
  faceZ: number;
  headTop: number;
  neck: V3;
  neckR: number;
  back: V3;
};

type Ctx = {
  add: (p: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, pos?: V3, scale?: V3, rot?: V3) => THREE.Mesh;
  sphere: (r: number, seg?: number) => THREE.BufferGeometry;
  cone: (r: number, h: number, seg?: number) => THREE.BufferGeometry;
  cyl: (r1: number, r2: number, h: number) => THREE.BufferGeometry;
  capsule: (r: number, len: number) => THREE.BufferGeometry;
  box: (w: number, h: number, d: number) => THREE.BufferGeometry;
  group: (p: THREE.Object3D, pos?: V3) => THREE.Group;
  mat: (color: string, o?: { glow?: number; metal?: boolean; opacity?: number; flat?: boolean }) => THREE.Material;
  animators: ((t: number) => void)[];
};

const GOLD = '#F5C542';
/** Accessories were drawn for a head of this radius: they are scaled to the real head. */
const ACCESSORY_HEAD_R = 0.3;

export function buildCreature(opts: { species: number | null; level: number; equipped?: Equipped; lite?: boolean }): Creature {
  const species = speciesById(opts.species);
  const L = Math.max(0, Math.min(40, Math.floor(opts.level)));
  const stage = species ? stageFor(L) : null;
  const animal = stage === null || !species ? buildEgg(L, isPlusSpecies(opts.species)) : buildAnimal(species.id, stage, opts.lite);
  const root = new THREE.Group();
  root.add(animal.group);
  const animators: ((t: number) => void)[] = [];
  const materials = new Map<string, THREE.Material>();

  // It grows a little at every level within its stage.
  if (stage !== null) {
    const from = STAGE_FROM_LEVEL[stage].from;
    const to = STAGE_FROM_LEVEL[stage + 1]?.from ?? 41;
    const next = STAGES[(Math.min(4, stage + 1)) as 0 | 1 | 2 | 3 | 4].size;
    const k = (L - from) / Math.max(1, to - from);
    const grow = stage < 4 ? 1 + (next / STAGES[stage].size - 1) * k * 0.6 : 1 + k * 0.08;
    animal.group.scale.multiplyScalar(grow);
  }

  // ─── Accessories ───────────────────────────────────────────────────────────
  const eq = opts.equipped ?? {};
  if (animal.anchors && Object.values(eq).some(Boolean)) {
    const mat = (color: string, o: { glow?: number; metal?: boolean; opacity?: number; flat?: boolean } = {}) => {
      const key = `${color}|${o.glow ?? 0}|${o.metal}|${o.opacity}|${o.flat}`;
      let m = materials.get(key);
      if (!m) {
        m = new THREE.MeshStandardMaterial({
          color,
          roughness: o.metal ? 0.25 : 0.6,
          metalness: o.metal ? 0.9 : 0.02,
          emissive: new THREE.Color(o.glow ? color : '#000000'),
          emissiveIntensity: o.glow ?? 0,
          transparent: o.opacity !== undefined,
          opacity: o.opacity ?? 1,
          depthWrite: o.opacity === undefined || o.opacity > 0.6,
          flatShading: o.flat ?? false,
          side: o.opacity !== undefined ? THREE.DoubleSide : THREE.FrontSide,
        });
        materials.set(key, m);
      }
      return m;
    };
    const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, pos: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], rot: V3 = [0, 0, 0]) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...pos);
      mesh.scale.set(...scale);
      mesh.rotation.set(...rot);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const group = (parent: THREE.Object3D, pos: V3 = [0, 0, 0]) => {
      const g = new THREE.Group();
      g.position.set(...pos);
      parent.add(g);
      return g;
    };
    const ctx: Ctx = {
      add,
      group,
      mat,
      animators,
      sphere: (r, seg = 24) => new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.7))),
      cone: (r, h, seg = 16) => new THREE.ConeGeometry(r, h, seg),
      cyl: (r1, r2, h) => new THREE.CylinderGeometry(r1, r2, h, 14),
      capsule: (r, len) => new THREE.CapsuleGeometry(r, len, 6, 12),
      box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
    };
    const a: RealAnchors = animal.anchors;
    // Head accessories are drawn at the reference size, inside a scaled head space.
    const k = a.R / ACCESSORY_HEAD_R;
    const head = new THREE.Group();
    head.scale.setScalar(k);
    a.head.add(head);
    // Neck and back accessories live in the animal's own space (the head group's parent).
    const A: Anchors = { head, R: ACCESSORY_HEAD_R, faceZ: a.faceZ / k, headTop: a.headTop / k, neck: a.neck, neckR: a.neckR, back: a.back };
    addAccessories(A, ctx, eq, a.head.parent!);
  }

  return {
    group: root,
    update: (t) => {
      animal.update(t);
      for (const f of animators) f(t);
    },
    dispose: () => {
      animal.dispose();
      materials.forEach((m) => m.dispose());
    },
  };
}

function addAccessories(A: Anchors, c: Ctx, eq: Equipped, pivot: THREE.Object3D) {
  const { head, R } = A;
  if (eq.head) {
    const hat = c.group(head, [0, A.headTop, 0]);
    switch (eq.head) {
      case 'cap':
        c.add(hat, new THREE.SphereGeometry(R * 0.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), c.mat('#E5484D'), [0, -R * 0.12, 0]);
        c.add(hat, c.cyl(R * 0.45, R * 0.45, 0.03), c.mat('#C93A3F'), [0, -R * 0.1, R * 0.4], [1, 1, 0.8]);
        break;
      case 'beanie':
        c.add(hat, new THREE.SphereGeometry(R * 0.66, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), c.mat('#3D7DD8'), [0, -R * 0.2, 0]);
        c.add(hat, new THREE.TorusGeometry(R * 0.62, 0.06, 10, 30), c.mat('#F2F2F2'), [0, -R * 0.18, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
        c.add(hat, c.sphere(0.1, 12), c.mat('#F2F2F2'), [0, R * 0.48, 0]);
        break;
      case 'flowers': {
        const colors = ['#FF6FA8', '#FFD43B', '#FFFFFF', '#C77DFF', '#7FE0FF'];
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          c.add(hat, c.sphere(0.07, 10), c.mat(colors[i % colors.length]), [Math.cos(a) * R * 0.55, -R * 0.12, Math.sin(a) * R * 0.55]);
        }
        break;
      }
      case 'wizard':
        c.add(hat, c.cyl(R * 0.75, R * 0.75, 0.03), c.mat('#5B3FA0'), [0, -R * 0.05, 0]);
        c.add(hat, c.cone(R * 0.45, R * 1.3), c.mat('#6E4CC2'), [0, R * 0.6, -R * 0.05], [1, 1, 1], [-0.15, 0, 0]);
        c.add(hat, c.sphere(0.05, 8), c.mat('#FFD43B', { glow: 1 }), [0, R * 0.5, R * 0.35]);
        break;
      case 'halo': {
        const h = c.add(hat, new THREE.TorusGeometry(R * 0.5, 0.04, 10, 40), c.mat('#FFE27A', { glow: 0.8 }), [0, R * 0.35, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
        c.animators.push((t) => (h.position.y = R * 0.35 + Math.sin(t * 2.5) * 0.04));
        break;
      }
      case 'party':
        c.add(hat, c.cone(R * 0.32, R * 0.9), c.mat('#FF6FA8'), [0, R * 0.38, 0], [1, 1, 1], [0, 0, 0.12]);
        for (let i = 0; i < 3; i++) c.add(hat, new THREE.TorusGeometry(R * (0.27 - i * 0.07), 0.02, 6, 20), c.mat(['#FFD43B', '#3BA7F5', '#7FE0A0'][i]), [0.03 * i, R * (0.12 + i * 0.22), 0], [1, 1, 1], [Math.PI / 2, 0, 0.12]);
        c.add(hat, c.sphere(0.06, 10), c.mat('#FFD43B'), [R * 0.1, R * 0.85, 0]);
        break;
      case 'headphones':
        c.add(hat, new THREE.TorusGeometry(R * 0.7, 0.035, 8, 30, Math.PI), c.mat('#2B2B33'), [0, -R * 0.35, 0]);
        for (const s of [-1, 1]) c.add(hat, c.cyl(R * 0.22, R * 0.22, 0.1), c.mat('#E5484D'), [s * R * 0.7, -R * 0.4, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
        break;
      case 'pirate':
        c.add(hat, c.cyl(R * 0.5, R * 0.6, R * 0.35), c.mat('#22222A'), [0, R * 0.05, 0]);
        c.add(hat, c.box(R * 1.5, R * 0.1, R * 0.6), c.mat('#22222A'), [0, -R * 0.1, 0]);
        c.add(hat, c.sphere(R * 0.12, 10), c.mat('#FFFFFF'), [0, R * 0.08, R * 0.5], [1, 1, 0.3]);
        c.add(hat, c.box(R * 1.52, 0.02, R * 0.62), c.mat(GOLD, { metal: true }), [0, -R * 0.04, 0]);
        break;
      case 'viking':
        c.add(hat, new THREE.SphereGeometry(R * 0.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), c.mat('#A1A1AA', { metal: true }), [0, -R * 0.15, 0]);
        c.add(hat, new THREE.TorusGeometry(R * 0.6, 0.04, 8, 30), c.mat('#8A5C35'), [0, -R * 0.15, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
        for (const s of [-1, 1]) c.add(hat, c.cone(0.08, R * 0.7), c.mat('#FFF4DC'), [s * R * 0.68, R * 0.15, 0], [1, 1, 1], [0, 0, -s * 0.9]);
        break;
      // Vainc+ accessories of the month.
      case 'tiara': {
        c.add(hat, new THREE.TorusGeometry(R * 0.55, 0.025, 8, 40, Math.PI), c.mat(GOLD, { metal: true }), [0, -R * 0.15, 0], [1, 1, 1], [0, 0, 0]);
        const stars = [-0.6, 0, 0.6];
        stars.forEach((x, i) => {
          const s = c.add(hat, new THREE.OctahedronGeometry(i === 1 ? 0.09 : 0.06), c.mat(i === 1 ? '#FF8BF2' : '#BDF4FF', { glow: 0.9, metal: true }), [x * R * 0.55, R * (i === 1 ? 0.48 : 0.32), 0]);
          c.animators.push((t) => (s.rotation.y = t * 2 + i));
        });
        break;
      }
      case 'bunny':
        for (const s of [-1, 1]) {
          c.add(hat, c.capsule(0.07, R * 0.7), c.mat('#FFFFFF'), [s * R * 0.28, R * 0.45, -R * 0.05], [1, 1, 0.55], [0, 0, -s * 0.18]);
          c.add(hat, c.capsule(0.04, R * 0.55), c.mat('#FFB3C1'), [s * R * 0.28, R * 0.45, -R * 0.0], [1, 1, 0.3], [0, 0, -s * 0.18]);
        }
        break;
      case 'crown':
        c.add(hat, new THREE.CylinderGeometry(R * 0.45, R * 0.42, R * 0.3, 24, 1, true), c.mat(GOLD, { metal: true }), [0, R * 0.05, 0]);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          c.add(hat, c.cone(0.06, 0.16), c.mat(GOLD, { metal: true }), [Math.cos(a) * R * 0.44, R * 0.27, Math.sin(a) * R * 0.44]);
          c.add(hat, c.sphere(0.035, 8), c.mat(i % 2 ? '#E5484D' : '#3BA7F5', { glow: 0.8 }), [Math.cos(a) * R * 0.46, R * 0.05, Math.sin(a) * R * 0.46]);
        }
        break;
    }
  }
  if (eq.eyes) {
    const g = c.group(head, [0, R * 0.12, A.faceZ * 0.98]);
    const ex = R * 0.38;
    if (eq.eyes === 'glasses' || eq.eyes === 'monocle') {
      const sides = eq.eyes === 'monocle' ? [1] : [-1, 1];
      for (const s of sides) c.add(g, new THREE.TorusGeometry(R * 0.23, 0.02, 8, 24), c.mat(eq.eyes === 'monocle' ? GOLD : '#2B2B33', { metal: eq.eyes === 'monocle' }), [s * ex, 0, 0]);
      if (eq.eyes === 'glasses') c.add(g, c.cyl(0.012, 0.012, ex * 0.6), c.mat('#2B2B33'), [0, 0.02, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
    } else if (eq.eyes === 'hearts') {
      for (const s of [-1, 1]) {
        c.add(g, c.sphere(R * 0.13, 12), c.mat('#FF4D8D', { glow: 0.3 }), [s * ex - R * 0.07, R * 0.04, 0.02], [1, 1, 0.4]);
        c.add(g, c.sphere(R * 0.13, 12), c.mat('#FF4D8D', { glow: 0.3 }), [s * ex + R * 0.07, R * 0.04, 0.02], [1, 1, 0.4]);
        c.add(g, c.cone(R * 0.18, R * 0.22, 12), c.mat('#FF4D8D', { glow: 0.3 }), [s * ex, -R * 0.1, 0.02], [1, 1, 0.4], [Math.PI, 0, 0]);
      }
      c.add(g, c.box(ex * 0.8, 0.02, 0.02), c.mat('#FF4D8D'), [0, R * 0.06, 0]);
    } else if (eq.eyes === 'patch') {
      c.add(g, c.sphere(R * 0.22, 14), c.mat('#16161C'), [ex, 0, 0.02], [1, 0.9, 0.3]);
      c.add(g, new THREE.TorusGeometry(R * 0.95, 0.015, 6, 30), c.mat('#16161C'), [0, R * 0.1, -A.faceZ * 0.5], [1, 1, 1], [0.1, 0, 0.35]);
    } else if (eq.eyes === 'shades') {
      for (const s of [-1, 1]) c.add(g, c.sphere(R * 0.24, 16), c.mat('#111116', { metal: true }), [s * ex, 0, 0.02], [1.15, 0.8, 0.3]);
      c.add(g, c.box(ex * 2.4, 0.03, 0.03), c.mat('#111116'), [0, R * 0.12, 0]);
    }
  }
  if (eq.neck) {
    const g = c.group(pivot, A.neck);
    const r = A.neckR;
    switch (eq.neck) {
      case 'bowtie':
        for (const s of [-1, 1]) c.add(g, c.cone(0.09, 0.16), c.mat('#E5484D'), [s * 0.09, 0, r * 0.95], [1, 1, 0.5], [0, 0, (s * Math.PI) / 2]);
        c.add(g, c.sphere(0.045, 10), c.mat('#C93A3F'), [0, 0, r * 0.98]);
        break;
      case 'scarf':
        c.add(g, new THREE.TorusGeometry(r * 0.95, 0.08, 12, 30), c.mat('#E5484D'), [0, 0, 0], [1, 1, 0.9], [Math.PI / 2, 0, 0]);
        c.add(g, c.capsule(0.06, 0.25), c.mat('#E5484D'), [r * 0.45, -0.18, r * 0.85], [1, 1, 0.6], [0, 0, 0.2]);
        break;
      case 'medal':
        c.add(g, new THREE.TorusGeometry(r * 0.9, 0.02, 8, 30), c.mat('#3D7DD8'), [0, 0, 0], [1, 1, 1], [Math.PI / 2 + 0.3, 0, 0]);
        c.add(g, c.cyl(0.09, 0.09, 0.025), c.mat(GOLD, { metal: true }), [0, -0.2, r * 0.95], [1, 1, 1], [Math.PI / 2, 0, 0]);
        break;
      case 'tie':
        c.add(g, c.box(0.08, 0.06, 0.04), c.mat('#3D7DD8'), [0, 0, r * 0.98]);
        c.add(g, c.cone(0.07, 0.32, 4), c.mat('#3D7DD8'), [0, -0.19, r * 0.98], [1, 1, 0.35], [Math.PI, Math.PI / 4, 0]);
        break;
      case 'bandana':
        c.add(g, new THREE.TorusGeometry(r * 0.95, 0.05, 10, 30), c.mat('#E5484D'), [0, 0, 0], [1, 1, 0.9], [Math.PI / 2, 0, 0]);
        c.add(g, c.cone(0.16, 0.22, 3), c.mat('#E5484D'), [0, -0.1, r * 0.9], [1, 1, 0.3], [Math.PI, 0, 0]);
        for (let i = 0; i < 3; i++) c.add(g, c.sphere(0.02, 6), c.mat('#FFFFFF'), [-0.05 + i * 0.05, -0.08 - (i % 2) * 0.04, r * 0.96]);
        break;
      case 'galaxy': {
        c.add(g, new THREE.TorusGeometry(r * 0.95, 0.09, 12, 30), c.mat('#1E1B4B'), [0, 0, 0], [1, 1, 0.9], [Math.PI / 2, 0, 0]);
        c.add(g, c.capsule(0.07, 0.28), c.mat('#312E81'), [r * 0.45, -0.2, r * 0.85], [1, 1, 0.6], [0, 0, 0.2]);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          c.add(g, new THREE.OctahedronGeometry(0.022), c.mat(i % 3 ? '#FFFFFF' : '#FF8BF2', { glow: 1 }), [Math.cos(a) * r * 0.98, 0.04 * Math.sin(i * 3), Math.sin(a) * r * 0.98]);
        }
        break;
      }
      case 'diamonds':
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          c.add(g, new THREE.OctahedronGeometry(0.045), c.mat('#BDF4FF', { glow: 0.6, metal: true }), [Math.cos(a) * r * 0.95, 0, Math.sin(a) * r * 0.95]);
        }
        break;
    }
  }
  if (eq.back) {
    const g = c.group(pivot, A.back);
    switch (eq.back) {
      case 'backpack':
        c.add(g, c.box(0.42, 0.45, 0.2), c.mat('#F08A24'), [0, 0, -0.06]);
        c.add(g, c.box(0.3, 0.16, 0.06), c.mat('#D9741A'), [0, -0.08, -0.18]);
        break;
      case 'cape':
        c.add(g, c.cone(0.55, 0.95), c.mat('#C9303A'), [0, -0.12, -0.08], [1, 1, 0.25], [0.12, 0, 0]);
        break;
      case 'angel':
        for (const s of [-1, 1]) {
          const w = c.add(g, c.sphere(0.32, 16), c.mat('#FFFFFF', { glow: 0.5 }), [s * 0.32, 0.18, -0.05], [0.9, 0.55, 0.12], [0, 0, s * 0.5]);
          c.animators.push((t) => (w.rotation.z = s * (0.5 + Math.sin(t * 3) * 0.12)));
        }
        break;
      case 'balloons': {
        const colors = ['#E5484D', '#FFD43B', '#3BA7F5'];
        colors.forEach((col, i) => {
          const b = c.add(g, c.sphere(0.16, 14), c.mat(col), [(i - 1) * 0.18, 0.95 + (i % 2) * 0.15, -0.15], [1, 1.15, 1]);
          c.add(g, c.cyl(0.004, 0.004, 0.9), c.mat('#FFFFFF'), [(i - 1) * 0.09, 0.45, -0.12], [1, 1, 1], [0, 0, (1 - i) * 0.18]);
          c.animators.push((t) => (b.position.y = 0.95 + (i % 2) * 0.15 + Math.sin(t * 2 + i) * 0.04));
        });
        break;
      }
      case 'surfboard':
        c.add(g, c.capsule(0.14, 0.75), c.mat('#7FE0FF'), [0, 0.05, -0.12], [1, 1, 0.22], [0, 0, 0.35]);
        c.add(g, c.box(0.04, 0.7, 0.02), c.mat('#FF8A1F'), [0, 0.05, -0.155], [1, 1, 1], [0, 0, 0.35]);
        break;
      case 'butterfly':
        for (const s of [-1, 1]) {
          const wing = c.group(g, [s * 0.04, 0.05, -0.08]);
          c.add(wing, c.sphere(0.24, 16), c.mat('#C084FC', { glow: 0.35, opacity: 0.75 }), [s * 0.2, 0.16, 0], [1, 0.8, 0.06], [0, 0, s * 0.5]);
          c.add(wing, c.sphere(0.16, 14), c.mat('#7DD3FC', { glow: 0.35, opacity: 0.75 }), [s * 0.17, -0.12, 0], [1, 0.8, 0.06], [0, 0, -s * 0.4]);
          c.add(wing, c.sphere(0.05, 8), c.mat('#FDE047', { glow: 1 }), [s * 0.24, 0.2, 0.02]);
          c.animators.push((t) => (wing.rotation.y = s * (0.35 + Math.sin(t * 7) * 0.35)));
        }
        break;
      case 'jetpack':
        for (const s of [-1, 1]) {
          c.add(g, c.cyl(0.1, 0.1, 0.42), c.mat('#A1A1AA', { metal: true }), [s * 0.12, 0, -0.08]);
          const flame = c.add(g, c.cone(0.08, 0.25), c.mat('#FF8A1F', { glow: 1 }), [s * 0.12, -0.33, -0.08], [1, 1, 1], [Math.PI, 0, 0]);
          c.animators.push((t) => (flame.scale.y = 0.8 + Math.sin(t * 20 + s) * 0.25));
        }
        break;
    }
  }
}

/** Natural daylight for the realistic animals (kept under this name for the screens that use it). */
export function addLights(scene: THREE.Scene) {
  addNatureLights(scene);
}

export type { Species };
