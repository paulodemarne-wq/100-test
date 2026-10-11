// Builds a Lockin creature in three.js from simple shapes, so 100 species × 3 forms × 40 levels
// need no 3D files. Shared by the app (expo-gl) and the design bestiary (browser).
import * as THREE from 'three';
import { Element, Equipped, formFor, Plan, Species, speciesById, Traits } from './species';

export type Creature = {
  group: THREE.Group;
  /** Call every frame with the time in seconds. */
  update: (t: number) => void;
  dispose: () => void;
};

type V3 = [number, number, number];

/** Where generic parts attach, in the pivot's space (head parts in the head's space). */
type Anchors = {
  head: THREE.Group;
  /** head radius (face size) */
  R: number;
  /** z of the face surface in head space */
  faceZ: number;
  /** top of the head in head space */
  headTop: number;
  neck: V3;
  neckR: number;
  back: V3;
  tail: V3 | null;
  /** points along the top of the back for spikes and plates */
  spine: V3[];
  shoulders: V3[];
  /** feet/paw positions (for socks and golden claws) */
  feet: V3[];
  /** main body mesh, for whole-body tinting */
  bodyMeshes: THREE.Mesh[];
  /** where ears/horns make sense */
  hasEars: boolean;
  /** creature floats (fish, jelly, ghost) */
  floats: boolean;
  /** natural wings already */
  hasWings: boolean;
};

const GOLD = '#F5C542';
const FORM_SCALE = [0.8, 0.72, 0.92, 1.1];

export function buildCreature(opts: { species: number | null; level: number; equipped?: Equipped }): Creature {
  const species = speciesById(opts.species);
  const L = Math.max(0, Math.min(40, Math.floor(opts.level)));
  const form = species ? formFor(L) : 0;
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  root.add(pivot);
  const animators: ((t: number) => void)[] = [];
  const materials = new Map<string, THREE.Material>();

  // ─── Shape helpers ─────────────────────────────────────────────────────────
  const mat = (color: string, o: { glow?: number; metal?: boolean; opacity?: number; flat?: boolean } = {}) => {
    const key = `${color}|${o.glow ?? 0}|${o.metal}|${o.opacity}|${o.flat}`;
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        roughness: o.metal ? 0.25 : 0.55,
        metalness: o.metal ? 0.85 : 0.05,
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
  const add = (
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    pos: V3 = [0, 0, 0],
    scale: V3 = [1, 1, 1],
    rot: V3 = [0, 0, 0],
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...pos);
    mesh.scale.set(...scale);
    mesh.rotation.set(...rot);
    parent.add(mesh);
    return mesh;
  };
  const sphere = (r: number, seg = 24) => new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.7)));
  const cone = (r: number, h: number, seg = 16) => new THREE.ConeGeometry(r, h, seg);
  const cyl = (r1: number, r2: number, h: number) => new THREE.CylinderGeometry(r1, r2, h, 14);
  const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 12);
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const group = (parent: THREE.Object3D, pos: V3 = [0, 0, 0]) => {
    const g = new THREE.Group();
    g.position.set(...pos);
    parent.add(g);
    return g;
  };

  // ─── Egg ───────────────────────────────────────────────────────────────────
  if (!species || form === 0) {
    const [base, spotA, spotB] = species
      ? [species.traits.accent, species.traits.body, species.traits.detail]
      : ['#FFF6E5', '#C77DFF', '#3BA7F5'];
    const egg = group(pivot, [0, 0.72, 0]);
    add(egg, sphere(0.55, 32), mat(base), [0, 0, 0], [1, 1.3, 1]);
    for (let i = 0; i < 14; i++) {
      const theta = (i / 14) * Math.PI * 2 * 2.3;
      const y = -0.5 + (i / 14) * 1.1;
      const ring = Math.sqrt(Math.max(0, 1 - (y / 0.72) ** 2)) * 0.55;
      const pos: V3 = [Math.cos(theta) * ring, y * 0.94, Math.sin(theta) * ring];
      const spot = add(egg, sphere(0.09 + (i % 3) * 0.02, 12), mat(i % 2 ? spotA : spotB), pos, [1, 1, 0.35]);
      spot.lookAt(pos[0] * 3, pos[1] * 3 + 0.72, pos[2] * 3);
    }
    if (L >= 1) {
      // Cracks: a zig-zag of dark slivers around the middle.
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 1.4 - 0.5;
        const y = 0.15 + (i % 2 ? 0.07 : -0.05);
        add(egg, box(0.12, 0.025, 0.02), mat('#3A2A2A'), [Math.sin(a) * 0.56, y, Math.cos(a) * 0.56], [1, 1, 1], [0, a, i % 2 ? 0.6 : -0.6]);
      }
    }
    animators.push((t) => {
      const shake = L >= 1 ? 0.14 : 0.07;
      egg.rotation.z = Math.sin(t * (L >= 1 ? 5 : 2.2)) * shake * (Math.sin(t * 0.7) > 0.2 ? 1 : 0.15);
    });
    root.scale.setScalar(FORM_SCALE[0]);
    return finish();
  }

  // ─── Level features ────────────────────────────────────────────────────────
  const T = species.traits;
  const plan: Plan = species.line[form - 1];
  const shiny = L >= 16;
  const mythic = L >= 30;
  const legend = L >= 36;
  const col = {
    body: shiny ? shift(T.body, 28) : T.body,
    accent: T.accent,
    detail: L >= 7 ? deepen(T.detail) : T.detail,
    glow: T.glow,
  };
  const bodyMat = mat(col.body, { glow: mythic ? 0.12 : 0 });
  const accentMat = mat(col.accent);
  const detailMat = legend ? mat(GOLD, { metal: true }) : mat(col.detail, { glow: L >= 19 ? 0.35 : 0 });
  const glowMat = mat(col.glow, { glow: 0.9 });
  const ctx = { add, sphere, cone, cyl, capsule, box, group, mat, bodyMat, accentMat, detailMat, glowMat, col, T, form, L, animators };

  // ─── Body plan ─────────────────────────────────────────────────────────────
  const A = PLANS[plan](pivot, ctx);

  // Face
  addFace(A, ctx, L >= 29);
  if (L >= 4 && form === 1) {
    for (const s of [-1, 1]) add(A.head, sphere(A.R * 0.12, 12), mat('#FF8FA3', { opacity: 0.75 }), [s * A.R * 0.6, -A.R * 0.2, A.faceZ * 0.86], [1.3, 0.8, 0.4]);
  }
  // Pattern
  if (L >= 3) addPattern(A, ctx, L >= 10);
  // Ears and horns
  if (A.hasEars) {
    addEars(A, ctx, L >= 5 ? 1.2 : 0.9);
    if (form >= 2 && L >= 12) addHorns(A, ctx, L >= 18 ? 1.6 : 1.15);
    else if (form >= 2 || L >= 5) addHorns(A, ctx, 0.6);
  }
  // Tails
  if (A.tail) {
    const tails = form >= 2 ? (L >= 20 ? 3 : L >= 14 ? 2 : 1) : 1;
    addTails(A, ctx, tails, L >= 6 ? 1.15 : 0.8);
  }
  // Forehead mark, then gem
  if (L >= 8) {
    const gem = add(A.head, L >= 15 ? new THREE.OctahedronGeometry(A.R * 0.13) : sphere(A.R * 0.08, 10), L >= 15 ? glowMat : detailMat, [0, A.R * 0.48, A.faceZ * 0.8], [1, 1, 0.6]);
    if (L >= 15) animators.push((t) => (gem.rotation.y = t * 1.5));
  }
  // Spikes along the back
  if (form >= 2 && L >= 11) {
    const n = L >= 13 ? A.spine.length : Math.min(2, A.spine.length);
    A.spine.slice(0, n).forEach((p, i) => add(pivot, cone(0.06 + (L >= 23 ? 0.03 : 0), 0.16 + (i % 2) * 0.05), detailMat, p, [1, 1, 1], [-0.4, 0, 0]));
  }
  // Armor
  if (L >= 17) {
    for (const p of A.shoulders) add(pivot, sphere(0.15, 14), legend ? mat(GOLD, { metal: true }) : mat(col.detail, { metal: true }), p, [1.1, 0.6, 1.1]);
    if (L >= 25 && A.bodyMeshes[0]) {
      const plate = add(pivot, sphere(0.22, 16), legend ? mat(GOLD, { metal: true }) : mat(col.detail, { metal: true }), [A.neck[0], A.neck[1] - 0.12, A.neck[2] + A.neckR * 0.75], [1.3, 1, 0.35]);
      plate.lookAt(A.neck[0], A.neck[1] - 0.12, A.neck[2] + 5);
    }
  }
  // Wings (for creatures that have none)
  if (!A.hasWings && L >= 21) addWings(A, ctx, L >= 22 ? 1 : 0.5, L >= 33);
  // Crest
  if (L >= 24 && A.hasEars) {
    for (let i = -1; i <= 1; i++) add(A.head, cone(A.R * 0.09, A.R * (i === 0 ? 0.55 : 0.38)), detailMat, [i * A.R * 0.24, A.headTop * 0.98, -A.R * 0.1], [1, 1, 1], [-0.25, 0, -i * 0.3]);
  }
  // Element power
  if (L >= 26) addPower(species.element, A, ctx, mythic ? 3 : L >= 27 ? 2 : 1);
  // Golden claws
  if (L >= 28) for (const f of A.feet) add(pivot, cone(0.035, 0.09), mat(GOLD, { metal: true }), [f[0], f[1] + 0.02, f[2] + 0.12], [1, 1, 1], [Math.PI / 2, 0, 0]);
  // Orbs
  const orbs = L >= 40 ? 6 : L >= 32 ? 4 : L >= 31 ? 2 : 0;
  if (orbs) {
    const ring = group(pivot, [0, 0.85, 0]);
    for (let i = 0; i < orbs; i++) {
      const a = (i / orbs) * Math.PI * 2;
      add(ring, sphere(0.07, 12), glowMat, [Math.cos(a) * 0.78, Math.sin(a * 2) * 0.12, Math.sin(a) * 0.78]);
    }
    animators.push((t) => (ring.rotation.y = t * 0.9));
  }
  // Rune circle, auras
  if (L >= 34) {
    const runes = add(root, new THREE.RingGeometry(0.62, 0.7, 48), mat(col.glow, { glow: 1, opacity: 0.7 }), [0, 0.006, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      add(runes, box(0.06, 0.06, 0.005), mat(col.glow, { glow: 1 }), [Math.cos(a) * 0.78, Math.sin(a) * 0.78, 0], [1, 1, 1], [0, 0, a]);
    }
    animators.push((t) => (runes.rotation.z = t * 0.4));
  }
  if (L >= 35) {
    const aura = add(root, new THREE.CircleGeometry(0.85, 40), mat(legend && L >= 38 ? GOLD : col.glow, { glow: 0.8, opacity: 0.3 }), [0, 0.004, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]);
    animators.push((t) => aura.scale.setScalar(1 + Math.sin(t * 2) * 0.06));
  }
  // Legendary: halo, crown, hovering
  if (L >= 37) {
    const halo = add(A.head, new THREE.TorusGeometry(A.R * 0.55, 0.035, 10, 40), mat(GOLD, { metal: true, glow: 0.4 }), [0, A.headTop + A.R * 0.45, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    animators.push((t) => {
      halo.position.y = A.headTop + A.R * 0.45 + Math.sin(t * 2) * 0.03;
      halo.rotation.z = t;
    });
  }
  if (L >= 39 && !opts.equipped?.head) {
    const crown = group(A.head, [0, A.headTop + A.R * 0.15, 0]);
    add(crown, cyl(A.R * 0.42, A.R * 0.38, A.R * 0.26), mat(GOLD, { metal: true }));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(crown, cone(0.05, 0.14), mat(GOLD, { metal: true }), [Math.cos(a) * A.R * 0.4, A.R * 0.2, Math.sin(a) * A.R * 0.4]);
    }
  }
  if (L >= 40) {
    for (let i = 0; i < 10; i++) {
      const s = add(root, new THREE.OctahedronGeometry(0.025), mat('#FFFFFF', { glow: 1 }), [0, 0, 0]);
      const a0 = i * 0.63;
      animators.push((t) => {
        const a = a0 + t * 0.6;
        s.position.set(Math.cos(a) * (0.6 + (i % 3) * 0.15), 0.3 + ((t * 0.3 + i * 0.1) % 1) * 1.4, Math.sin(a) * (0.6 + (i % 3) * 0.15));
      });
    }
  }

  // Accessories
  addAccessories(A, ctx, opts.equipped ?? {});

  // Grow with the form, but never past what the camera frames (tall golems, long wings…).
  const bounds = new THREE.Box3().setFromObject(pivot);
  const height = Math.max(0.01, bounds.max.y);
  const reach = Math.max(0.01, -bounds.min.x, bounds.max.x, -bounds.min.z, bounds.max.z);
  root.scale.setScalar(Math.min(FORM_SCALE[form] + (legend ? 0.08 : 0), 1.85 / height, 1.15 / reach));
  const floatBase = A.floats || L >= 40 ? 0.12 : 0;
  animators.push((t) => {
    pivot.position.y = floatBase + (A.floats || L >= 40 ? Math.sin(t * 1.6) * 0.06 : Math.abs(Math.sin(t * 2)) * 0.04);
  });
  return finish();

  function finish(): Creature {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 32),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.12, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    root.add(shadow);
    return {
      group: root,
      update: (t) => animators.forEach((a) => a(t)),
      dispose: () => {
        root.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
        materials.forEach((m) => m.dispose());
        (shadow.material as THREE.Material).dispose();
      },
    };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Body plans
// ═════════════════════════════════════════════════════════════════════════════

type Ctx = {
  add: (p: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, pos?: V3, scale?: V3, rot?: V3) => THREE.Mesh;
  sphere: (r: number, seg?: number) => THREE.BufferGeometry;
  cone: (r: number, h: number, seg?: number) => THREE.BufferGeometry;
  cyl: (r1: number, r2: number, h: number) => THREE.BufferGeometry;
  capsule: (r: number, len: number) => THREE.BufferGeometry;
  box: (w: number, h: number, d: number) => THREE.BufferGeometry;
  group: (p: THREE.Object3D, pos?: V3) => THREE.Group;
  mat: (color: string, o?: { glow?: number; metal?: boolean; opacity?: number; flat?: boolean }) => THREE.Material;
  bodyMat: THREE.Material;
  accentMat: THREE.Material;
  detailMat: THREE.Material;
  glowMat: THREE.Material;
  col: { body: string; accent: string; detail: string; glow: string };
  T: Traits;
  form: number;
  L: number;
  animators: ((t: number) => void)[];
};

function headGroup(pivot: THREE.Object3D, c: Ctx, pos: V3, R: number, round = true) {
  const head = c.group(pivot, pos);
  if (round) c.add(head, c.sphere(R, 30), c.bodyMat);
  return head;
}

const PLANS: Record<Plan, (pivot: THREE.Group, c: Ctx) => Anchors> = {
  slime(pivot, c) {
    const R = 0.58 * c.T.chunky ** 0.3;
    const head = headGroup(pivot, c, [0, R * 0.9, 0], R);
    head.scale.set(1.08, 0.92, 1);
    c.add(head, c.sphere(R * 0.6, 20), c.accentMat, [0, -R * 0.3, R * 0.6], [1, 0.8, 0.45]);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      c.add(pivot, c.sphere(0.1, 12), c.bodyMat, [Math.cos(a) * R * 0.85, 0.08, Math.sin(a) * R * 0.85], [1, 0.6, 1]);
    }
    c.animators.push((t) => head.scale.set(1.08 + Math.sin(t * 3) * 0.03, 0.92 - Math.sin(t * 3) * 0.03, 1));
    return {
      head, R, faceZ: R, headTop: R * 0.95, neck: [0, R * 0.45, 0], neckR: R * 0.9, back: [0, R * 1.1, -R * 0.75],
      tail: [0, R * 0.5, -R * 0.95], spine: arc([0, R * 1.75, 0.1], [0, R * 0.9, -R * 0.95], 5), shoulders: [[-R * 0.75, R * 1.15, 0], [R * 0.75, R * 1.15, 0]],
      feet: [], bodyMeshes: [], hasEars: true, floats: false, hasWings: false,
    };
  },

  biped(pivot, c) {
    const bR = 0.4 * c.T.chunky;
    const legH = 0.08 * c.T.legs;
    const bodyY = bR + legH;
    const body = c.add(pivot, c.sphere(bR, 28), c.bodyMat, [0, bodyY, 0], [1, 0.95, 0.92]);
    c.add(pivot, c.sphere(bR * 0.72, 20), c.accentMat, [0, bodyY - 0.03, bR * 0.45], [1, 0.95, 0.5]);
    for (const s of [-1, 1]) c.add(pivot, c.sphere(0.1, 12), c.bodyMat, [s * bR * 0.98, bodyY + 0.03, 0.1], [0.8, 1.25, 0.8]);
    const feet: V3[] = [-1, 1].map((s) => [s * 0.18, 0.07, 0.12] as V3);
    for (const f of feet) c.add(pivot, c.sphere(0.11, 12), c.detailMat, f, [1.1, 0.6, 1.4]);
    const R = 0.42 * (c.form === 1 ? 1.12 : 1);
    const headY = bodyY + bR * 0.8 + R * 0.75;
    const head = headGroup(pivot, c, [0, headY, 0], R);
    return {
      head, R, faceZ: R, headTop: R * 0.95, neck: [0, headY - R * 0.85, 0], neckR: bR * 0.6, back: [0, bodyY + 0.05, -bR * 0.9],
      tail: [0, bodyY - 0.08, -bR * 0.9], spine: arc([0, bodyY + bR * 0.75, -bR * 0.3], [0, bodyY - bR * 0.2, -bR * 0.95], 4),
      shoulders: [[-bR * 0.85, bodyY + bR * 0.55, 0], [bR * 0.85, bodyY + bR * 0.55, 0]], feet, bodyMeshes: [body], hasEars: true, floats: false, hasWings: false,
    };
  },

  quadruped(pivot, c) {
    return beast(pivot, c, false);
  },

  dragon(pivot, c) {
    const A = beast(pivot, c, true);
    // Wings
    for (const s of [-1, 1]) {
      const wing = c.group(pivot, [s * 0.25, A.shoulders[0][1] + 0.1, -0.05]);
      c.add(wing, c.cone(0.42, 0.95, 3), c.mat(c.col.detail, { glow: c.L >= 30 ? 0.4 : 0 }), [s * 0.42, 0.2, 0], [1, 1, 0.08], [0, 0, s * 1.15]);
      c.add(wing, c.cyl(0.02, 0.02, 0.9), c.detailMat, [s * 0.38, 0.25, 0.02], [1, 1, 1], [0, 0, s * 1.15]);
      c.animators.push((t) => (wing.rotation.z = s * Math.sin(t * 2.5) * 0.18));
    }
    return { ...A, hasWings: true };
  },

  bird(pivot, c) {
    const bR = 0.42 * c.T.chunky;
    const bodyY = 0.12 + bR * 1.1;
    const body = c.add(pivot, c.sphere(bR, 28), c.bodyMat, [0, bodyY, 0], [1, 1.15, 1]);
    c.add(pivot, c.sphere(bR * 0.75, 20), c.accentMat, [0, bodyY - 0.05, bR * 0.4], [1, 1.05, 0.5]);
    const feet: V3[] = [];
    for (const s of [-1, 1]) {
      c.add(pivot, c.cyl(0.025, 0.025, 0.18), c.mat(c.col.glow), [s * 0.14, 0.09, 0.05]);
      c.add(pivot, c.cone(0.06, 0.12), c.mat(c.col.glow), [s * 0.14, 0.01, 0.1], [1, 1, 1], [Math.PI / 2, 0, 0]);
      feet.push([s * 0.14, 0.01, 0.1]);
      const wing = c.group(pivot, [s * bR * 0.95, bodyY + 0.08, -0.02]);
      c.add(wing, c.sphere(0.3 * (c.form === 3 ? 1.5 : 1), 16), c.detailMat, [s * 0.08, -0.05, 0], [0.3, 1, 0.7], [0, 0, s * 0.35]);
      c.animators.push((t) => (wing.rotation.z = s * (Math.sin(t * (c.form === 3 ? 3 : 6)) * 0.2)));
    }
    // Tail fan
    for (let i = -2; i <= 2; i++) c.add(pivot, c.capsule(0.05, 0.3 * (c.form === 3 ? 1.8 : 1)), i % 2 ? c.detailMat : c.accentMat, [i * 0.05, bodyY - 0.1, -bR * 1.05], [1, 1, 0.5], [-1.1, i * 0.25, 0]);
    const R = 0.34;
    const headY = bodyY + bR * 1.05 + R * 0.5;
    const head = headGroup(pivot, c, [0, headY, 0.02], R);
    c.add(head, c.cone(R * 0.2, R * 0.5 * c.T.snout + 0.05), c.mat(c.col.glow), [0, -R * 0.15, R * 1.05], [1, 1, 0.8], [Math.PI / 2, 0, 0]);
    // Feather crest
    for (let i = -1; i <= 1; i++) c.add(head, c.cone(R * 0.08, R * (0.5 + c.form * 0.15)), c.detailMat, [i * R * 0.15, R * 1.0, -R * 0.15], [1, 1, 1], [-0.35, 0, -i * 0.35]);
    return {
      head, R, faceZ: R, headTop: R * 0.95, neck: [0, headY - R * 0.8, 0.02], neckR: bR * 0.65, back: [0, bodyY + 0.05, -bR * 0.95],
      tail: null, spine: arc([0, bodyY + bR, -bR * 0.4], [0, bodyY, -bR * 1.0], 3), shoulders: [[-bR * 0.8, bodyY + bR * 0.75, 0], [bR * 0.8, bodyY + bR * 0.75, 0]],
      feet, bodyMeshes: [body], hasEars: false, floats: false, hasWings: true,
    };
  },

  fish(pivot, c) {
    const y = 0.75;
    const len = 0.5 * (1 + c.T.snout * 0.3);
    const body = c.add(pivot, c.sphere(0.45, 28), c.bodyMat, [0, y, -0.05], [0.8 * c.T.chunky, 0.85, len / 0.45]);
    c.add(pivot, c.sphere(0.35, 20), c.accentMat, [0, y - 0.15, 0.05], [0.7, 0.55, len / 0.4]);
    const tail = c.group(pivot, [0, y, -len - 0.1]);
    for (const s of [-1, 1]) c.add(tail, c.cone(0.22, 0.4, 3), c.detailMat, [0, s * 0.16, -0.1], [0.15, 1, 1], [s * 2.2, 0, 0]);
    c.animators.push((t) => (tail.rotation.y = Math.sin(t * 5) * 0.35));
    c.add(pivot, c.cone(0.18, 0.35 + c.form * 0.08, 3), c.detailMat, [0, y + 0.4, -0.1], [0.12, 1, 1.2], [-0.3, 0, 0]);
    for (const s of [-1, 1]) {
      const fin = c.add(pivot, c.cone(0.12, 0.28, 3), c.detailMat, [s * 0.35, y - 0.1, 0.1], [0.12, 1, 1], [0.6, 0, s * 2]);
      c.animators.push((t) => (fin.rotation.x = 0.6 + Math.sin(t * 4 + s) * 0.3));
    }
    const R = 0.4;
    const head = headGroup(pivot, c, [0, y + 0.02, len * 0.55], R, false);
    return {
      head, R, faceZ: R * 0.75, headTop: R * 0.85, neck: [0, y - 0.05, len * 0.35], neckR: 0.32, back: [0, y + 0.3, -0.15],
      tail: null, spine: arc([0, y + 0.38, 0.15], [0, y + 0.3, -0.35], 4), shoulders: [[-0.3, y + 0.25, 0.15], [0.3, y + 0.25, 0.15]],
      feet: [], bodyMeshes: [body], hasEars: false, floats: true, hasWings: false,
    };
  },

  serpent(pivot, c) {
    const pts: V3[] = [];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      pts.push([Math.sin(k * Math.PI * 2) * 0.32, 0.12 + Math.max(0, k - 0.6) * 1.3, -0.55 + k * 0.85]);
    }
    const segs: THREE.Mesh[] = [];
    pts.forEach((p, i) => {
      const r = 0.12 + 0.07 * Math.sin((i / n) * Math.PI) * c.T.chunky;
      segs.push(c.add(pivot, c.sphere(r, 18), i % 2 && c.T.pattern === 'stripes' ? c.detailMat : c.bodyMat, p));
    });
    c.animators.push((t) => segs.forEach((s, i) => (s.position.x = pts[i][0] + Math.sin(t * 2 + i * 0.7) * 0.04)));
    const R = 0.3;
    const last = pts[n - 1];
    const head = headGroup(pivot, c, [last[0], last[1] + 0.2, last[2] + 0.12], R);
    head.scale.set(1, 0.9, 1.15);
    c.add(head, c.sphere(R * 0.55, 16), c.accentMat, [0, -R * 0.35, R * 0.55], [1, 0.6, 0.8]);
    c.add(head, c.cone(R * 0.05, R * 0.25), c.mat('#E5484D'), [0, -R * 0.4, R * 1.1], [1, 1, 1], [Math.PI / 2, 0, 0]);
    return {
      head, R, faceZ: R * 1.05, headTop: R * 0.9, neck: [last[0], last[1] - 0.05, last[2]], neckR: 0.2, back: [pts[3][0], pts[3][1] + 0.15, pts[3][2]],
      tail: [pts[0][0], pts[0][1], pts[0][2] - 0.1], spine: pts.slice(1, 6).map((p) => [p[0], p[1] + 0.15, p[2]] as V3),
      shoulders: [[pts[5][0] - 0.18, pts[5][1] + 0.1, pts[5][2]], [pts[5][0] + 0.18, pts[5][1] + 0.1, pts[5][2]]], feet: [], bodyMeshes: segs, hasEars: true, floats: false, hasWings: false,
    };
  },

  frog(pivot, c) {
    const bR = 0.45 * c.T.chunky;
    const body = c.add(pivot, c.sphere(bR, 28), c.bodyMat, [0, bR * 0.75, 0], [1.25, 0.8, 1.05]);
    c.add(pivot, c.sphere(bR * 0.8, 20), c.accentMat, [0, bR * 0.6, bR * 0.45], [1.1, 0.7, 0.55]);
    const feet: V3[] = [];
    for (const s of [-1, 1]) {
      c.add(pivot, c.sphere(0.2, 16), c.bodyMat, [s * bR * 1.05, 0.16, -0.12], [0.8, 0.7, 1.4]);
      c.add(pivot, c.sphere(0.12, 12), c.detailMat, [s * bR * 1.1, 0.04, 0.12], [1.3, 0.4, 1.5]);
      c.add(pivot, c.sphere(0.08, 12), c.detailMat, [s * bR * 0.55, 0.05, bR * 0.85], [1.3, 0.5, 1.3]);
      feet.push([s * bR * 0.55, 0.05, bR * 0.85]);
    }
    const R = 0.36;
    const head = headGroup(pivot, c, [0, bR * 1.25, bR * 0.25], R);
    head.scale.set(1.25, 0.85, 1);
    c.animators.push((t) => (body.scale.y = 0.8 + Math.max(0, Math.sin(t * 4)) * 0.03));
    return {
      head, R, faceZ: R * 0.95, headTop: R * 0.85, neck: [0, bR * 0.95, bR * 0.4], neckR: bR * 0.8, back: [0, bR * 1.05, -bR * 0.7],
      tail: null, spine: arc([0, bR * 1.3, -bR * 0.1], [0, bR * 0.9, -bR * 0.85], 4), shoulders: [[-bR * 0.95, bR * 1.0, 0.05], [bR * 0.95, bR * 1.0, 0.05]],
      feet, bodyMeshes: [body], hasEars: false, floats: false, hasWings: false,
    };
  },

  insect(pivot, c) {
    const y = 0.32 + 0.12 * c.T.legs;
    const abdomen = c.add(pivot, c.sphere(0.32 * c.T.chunky, 24), c.bodyMat, [0, y + 0.05, -0.38], [1, 0.85, 1.35]);
    if (c.T.pattern !== 'none' || c.L >= 3) for (let i = 0; i < 3; i++) c.add(pivot, new THREE.TorusGeometry(0.27 - i * 0.04, 0.025, 8, 24), c.detailMat, [0, y + 0.05, -0.3 - i * 0.14], [1, 0.85, 1]);
    c.add(pivot, c.sphere(0.2, 18), c.detailMat, [0, y + 0.08, 0]);
    const feet: V3[] = [];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const z = 0.08 - i * 0.14;
        const leg = c.add(pivot, c.cyl(0.02, 0.015, 0.4 * c.T.legs), c.mat(c.col.detail), [s * 0.22, y - 0.08, z], [1, 1, 1], [0, 0, s * 0.9]);
        void leg;
        feet.push([s * 0.36, 0.02, z]);
      }
      if (c.form >= 2) {
        const wing = c.group(pivot, [s * 0.1, y + 0.25, -0.15]);
        c.add(wing, c.sphere(0.32 * (c.form === 3 ? 1.4 : 1), 16), c.mat(c.col.glow, { opacity: 0.45, glow: 0.3 }), [s * 0.28, 0.08, -0.1], [1, 0.08, 0.55], [0, s * 0.3, s * 0.35]);
        c.animators.push((t) => (wing.rotation.z = s * Math.sin(t * 18) * 0.25));
      }
    }
    const R = 0.27;
    const head = headGroup(pivot, c, [0, y + 0.12, 0.28], R);
    for (const s of [-1, 1]) {
      c.add(head, c.cyl(0.012, 0.012, 0.35), c.mat(c.col.detail), [s * R * 0.35, R * 1.1, -R * 0.1], [1, 1, 1], [-0.3, 0, -s * 0.35]);
      c.add(head, c.sphere(0.04, 10), c.glowMat, [s * R * 0.62, R * 1.6, -R * 0.35]);
    }
    if (c.form === 3) c.add(head, c.cone(R * 0.12, R * 0.9), c.detailMat, [0, R * 0.9, R * 0.3], [1, 1, 1], [0.4, 0, 0]);
    return {
      head, R, faceZ: R, headTop: R * 0.95, neck: [0, y + 0.08, 0.15], neckR: 0.18, back: [0, y + 0.25, -0.3],
      tail: null, spine: arc([0, y + 0.3, -0.15], [0, y + 0.2, -0.65], 4), shoulders: [[-0.18, y + 0.2, 0], [0.18, y + 0.2, 0]],
      feet, bodyMeshes: [abdomen], hasEars: false, floats: false, hasWings: c.form >= 2,
    };
  },

  octopus(pivot, c) {
    const R = 0.48 * c.T.chunky ** 0.5;
    const head = headGroup(pivot, c, [0, 0.35 + R, 0], R);
    head.scale.set(1, 1.18, 1);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const arm = c.group(pivot, [Math.cos(a) * R * 0.55, 0.3, Math.sin(a) * R * 0.55]);
      arm.rotation.y = -a + Math.PI / 2;
      const segs: THREE.Mesh[] = [];
      for (let k = 0; k < 5; k++) segs.push(c.add(arm, c.sphere(0.1 - k * 0.014, 12), k % 2 ? c.bodyMat : c.accentMat, [0, -0.06 * k, 0.11 * k]));
      c.animators.push((t) => segs.forEach((s, k) => (s.position.y = -0.06 * k + Math.sin(t * 2.5 + i + k * 0.8) * 0.04 * k)));
    }
    return {
      head, R, faceZ: R * 0.98, headTop: R * 1.0, neck: [0, 0.4, 0], neckR: R * 0.7, back: [0, 0.35 + R * 1.1, -R * 0.8],
      tail: null, spine: arc([0, 0.35 + R * 2.1, -R * 0.2], [0, 0.35 + R * 1.3, -R * 0.9], 4), shoulders: [[-R * 0.8, 0.35 + R * 1.3, 0], [R * 0.8, 0.35 + R * 1.3, 0]],
      feet: [], bodyMeshes: [], hasEars: true, floats: false, hasWings: false,
    };
  },

  jelly(pivot, c) {
    const R = 0.5;
    const y = 0.95;
    const head = c.group(pivot, [0, y, 0]);
    c.add(head, new THREE.SphereGeometry(R, 30, 18, 0, Math.PI * 2, 0, Math.PI / 1.9), c.mat(c.col.body, { opacity: 0.75, glow: 0.15 }));
    c.add(head, c.sphere(R * 0.45, 16), c.glowMat, [0, R * 0.25, 0]);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const len = 0.35 + (i % 3) * 0.15 + c.form * 0.12;
      const t = c.add(pivot, c.capsule(0.03, len), c.mat(c.col.glow, { opacity: 0.7, glow: 0.4 }), [Math.cos(a) * R * 0.6, y - len / 2 - 0.05, Math.sin(a) * R * 0.6]);
      c.animators.push((time) => (t.rotation.x = Math.sin(time * 2 + i) * 0.2));
    }
    return {
      head, R, faceZ: R * 0.9, headTop: R * 0.95, neck: [0, y - 0.02, 0], neckR: R * 0.95, back: [0, y + 0.15, -R * 0.85],
      tail: null, spine: arc([0, y + R * 0.95, 0], [0, y + R * 0.4, -R * 0.85], 4), shoulders: [[-R * 0.75, y + R * 0.35, 0], [R * 0.75, y + R * 0.35, 0]],
      feet: [], bodyMeshes: [], hasEars: false, floats: true, hasWings: false,
    };
  },

  crab(pivot, c) {
    const y = 0.32;
    const body = c.add(pivot, c.sphere(0.4, 26), c.bodyMat, [0, y, 0], [1.45 * c.T.chunky, 0.62, 1]);
    c.add(pivot, c.sphere(0.3, 18), c.accentMat, [0, y - 0.08, 0.15], [1.4, 0.45, 0.9]);
    const feet: V3[] = [];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        c.add(pivot, c.cyl(0.03, 0.02, 0.32), c.detailMat, [s * 0.55, y - 0.15, -0.15 + i * 0.13], [1, 1, 1], [0, 0, s * 0.9]);
        feet.push([s * 0.68, 0.02, -0.15 + i * 0.13]);
      }
      const claw = c.group(pivot, [s * 0.55, y + 0.05, 0.35]);
      const k = c.form === 3 ? 1.5 : 1;
      c.add(claw, c.sphere(0.15 * k, 16), c.detailMat, [0, 0, 0], [1, 0.8, 1.3]);
      const pincer = c.add(claw, c.cone(0.07 * k, 0.22 * k), c.detailMat, [s * 0.04, 0.06, 0.18 * k], [1, 1, 0.6], [1.2, 0, 0]);
      c.animators.push((t) => (pincer.rotation.x = 1.2 + Math.max(0, Math.sin(t * 3 + s)) * 0.4));
    }
    const R = 0.3;
    const head = c.group(pivot, [0, y + 0.3, 0.22]);
    for (const s of [-1, 1]) c.add(head, c.cyl(0.025, 0.025, 0.22), c.detailMat, [s * R * 0.4, -0.08, 0]);
    return {
      head, R, faceZ: R * 0.15, headTop: R * 0.5, neck: [0, y + 0.1, 0.25], neckR: 0.3, back: [0, y + 0.22, -0.2],
      tail: null, spine: [[-0.25, y + 0.24, -0.05], [0, y + 0.27, -0.1], [0.25, y + 0.24, -0.05], [0, y + 0.22, 0.12]], shoulders: [[-0.45, y + 0.15, 0.05], [0.45, y + 0.15, 0.05]],
      feet, bodyMeshes: [body], hasEars: false, floats: false, hasWings: false,
    };
  },

  snail(pivot, c) {
    const body = c.add(pivot, c.capsule(0.16, 0.6), c.accentMat, [0, 0.16, 0.05], [1.2 * c.T.chunky, 0.8, 1], [Math.PI / 2, 0, 0]);
    const shell = c.group(pivot, [0, 0.55, -0.12]);
    const turns = 3 + c.form;
    for (let i = 0; i < turns * 6; i++) {
      const k = i / (turns * 6);
      const a = k * turns * Math.PI * 2;
      const r = 0.36 * (1 - k * 0.85);
      c.add(shell, c.sphere(0.16 * (1 - k * 0.75) + 0.03, 14), i % 6 < 3 ? c.bodyMat : c.detailMat, [0, Math.sin(a) * r, Math.cos(a) * r]);
    }
    if (c.form === 3) c.add(shell, c.cone(0.12, 0.4), c.detailMat, [0, 0.42, 0]);
    const R = 0.24;
    const head = headGroup(pivot, c, [0, 0.36, 0.42], R, false);
    c.add(head, c.sphere(R, 20), c.accentMat);
    for (const s of [-1, 1]) c.add(head, c.cyl(0.02, 0.02, 0.28), c.accentMat, [s * R * 0.4, R * 0.9, 0], [1, 1, 1], [0.2, 0, -s * 0.2]);
    return {
      head, R, faceZ: R, headTop: R * 0.9, neck: [0, 0.25, 0.4], neckR: 0.17, back: [0, 0.75, -0.3],
      tail: null, spine: arc([0, 0.95, -0.05], [0, 0.7, -0.45], 3), shoulders: [[-0.18, 0.62, 0.05], [0.18, 0.62, 0.05]], feet: [], bodyMeshes: [body], hasEars: false, floats: false, hasWings: false,
    };
  },

  ghost(pivot, c) {
    const R = 0.46;
    const y = 0.8;
    const head = headGroup(pivot, c, [0, y, 0], R);
    const tail = c.add(pivot, c.cone(R * 0.95, 0.75, 24), c.bodyMat, [0, y - 0.48, 0], [1, 1, 1], [Math.PI, 0, 0]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.add(pivot, c.sphere(0.1, 10), c.bodyMat, [Math.cos(a) * R * 0.62, y - 0.42, Math.sin(a) * R * 0.62]);
    }
    for (const s of [-1, 1]) {
      const arm = c.add(pivot, c.sphere(0.12, 12), c.bodyMat, [s * R * 1.0, y - 0.15, 0.05], [0.7, 1.3, 0.7], [0, 0, s * 0.6]);
      c.animators.push((t) => (arm.rotation.z = s * (0.6 + Math.sin(t * 2.5) * 0.25)));
    }
    c.animators.push((t) => (tail.rotation.z = Math.PI + Math.sin(t * 1.8) * 0.08));
    return {
      head, R, faceZ: R, headTop: R * 0.95, neck: [0, y - R * 0.6, 0], neckR: R * 0.8, back: [0, y - 0.05, -R * 0.9],
      tail: null, spine: arc([0, y + R, -0.1], [0, y + R * 0.2, -R * 0.95], 4), shoulders: [[-R * 0.75, y + R * 0.3, 0], [R * 0.75, y + R * 0.3, 0]],
      feet: [], bodyMeshes: [], hasEars: true, floats: true, hasWings: false,
    };
  },

  plant(pivot, c) {
    const bR = 0.38 * c.T.chunky;
    const body = c.add(pivot, c.sphere(bR, 26), c.bodyMat, [0, bR + 0.06, 0], [1, 1.05, 1]);
    const feet: V3[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      c.add(pivot, c.capsule(0.04, 0.18), c.mat(c.col.detail), [Math.cos(a) * bR * 0.7, 0.07, Math.sin(a) * bR * 0.7], [1, 1, 1], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]);
      feet.push([Math.cos(a) * bR * 0.85, 0.02, Math.sin(a) * bR * 0.85]);
    }
    const R = bR * 0.95;
    const head = c.group(pivot, [0, bR + 0.06, 0]);
    // Leaves (form 1), petals (form 2), a blooming crown (form 3)
    const petals = c.form === 1 ? 2 : c.form === 2 ? 5 : 8;
    const crown = c.group(head, [0, R * 1.0, 0]);
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2;
      const len = c.form === 1 ? 0.28 : 0.32 + c.form * 0.05;
      c.add(crown, c.sphere(len, 14), c.form === 1 ? c.mat(c.col.detail) : i % 2 ? c.accentMat : c.mat(c.col.glow), [Math.cos(a) * len * 0.7, 0.05, Math.sin(a) * len * 0.7], [0.45, 0.12, 1], [0, -a + Math.PI / 2, 0.3]);
    }
    if (c.form >= 2) c.add(crown, c.sphere(0.1, 14), c.glowMat, [0, 0.07, 0]);
    c.animators.push((t) => (crown.rotation.y = Math.sin(t * 0.8) * 0.3));
    return {
      head, R, faceZ: R * 1.0, headTop: R * 1.15, neck: [0, bR * 0.35, 0], neckR: bR * 0.85, back: [0, bR + 0.06, -bR * 0.9],
      tail: null, spine: arc([0, bR * 1.6, -bR * 0.4], [0, bR * 0.6, -bR * 1.0], 4), shoulders: [[-bR * 0.8, bR * 1.25, 0], [bR * 0.8, bR * 1.25, 0]],
      feet, bodyMeshes: [body], hasEars: false, floats: false, hasWings: false,
    };
  },

  golem(pivot, c) {
    const k = c.form === 3 ? 1.15 : 1;
    const flat = c.mat(c.col.body, { flat: true, glow: c.L >= 30 ? 0.12 : 0 });
    const legH = 0.25 * c.T.legs * k;
    const feet: V3[] = [];
    for (const s of [-1, 1]) {
      c.add(pivot, c.box(0.2 * k, legH, 0.22 * k), c.mat(c.col.detail, { flat: true }), [s * 0.17 * k, legH / 2, 0]);
      feet.push([s * 0.17 * k, 0.02, 0.05]);
    }
    const torsoH = 0.5 * k;
    const torso = c.add(pivot, new THREE.DodecahedronGeometry(0.36 * k * c.T.chunky ** 0.5, 0), flat, [0, legH + torsoH / 2 + 0.05, 0], [1.2, 1, 0.9]);
    c.add(pivot, new THREE.OctahedronGeometry(0.09 * k), c.glowMat, [0, legH + torsoH / 2 + 0.05, 0.3 * k]);
    for (const s of [-1, 1]) {
      const arm = c.group(pivot, [s * 0.48 * k, legH + torsoH * 0.8, 0]);
      c.add(arm, new THREE.DodecahedronGeometry(0.13 * k, 0), flat);
      c.add(arm, c.box(0.17 * k, 0.38 * k, 0.17 * k), c.mat(c.col.body, { flat: true }), [s * 0.04, -0.25 * k, 0.03]);
      c.add(arm, new THREE.DodecahedronGeometry(0.13 * k, 0), c.mat(c.col.detail, { flat: true }), [s * 0.05, -0.5 * k, 0.05]);
      c.animators.push((t) => (arm.rotation.x = Math.sin(t * 1.5 + s) * 0.12));
    }
    const R = 0.28 * k;
    const headY = legH + torsoH + 0.05 + R * 0.75;
    const head = c.group(pivot, [0, headY, 0.02]);
    c.add(head, c.box(R * 1.7, R * 1.5, R * 1.5), flat);
    return {
      head, R, faceZ: R * 0.76, headTop: R * 0.75, neck: [0, headY - R * 0.85, 0.02], neckR: 0.25 * k, back: [0, legH + torsoH * 0.6, -0.3 * k],
      tail: null, spine: arc([0, legH + torsoH + 0.08, -0.12], [0, legH + torsoH * 0.4, -0.32 * k], 4),
      shoulders: [[-0.48 * k, legH + torsoH * 0.95, 0], [0.48 * k, legH + torsoH * 0.95, 0]], feet, bodyMeshes: [torso], hasEars: false, floats: false, hasWings: false,
    };
  },
};

/** Four-legged body shared by beasts and dragons. */
function beast(pivot: THREE.Group, c: Ctx, dragon: boolean): Anchors {
  const legH = (0.22 + 0.12 * c.T.legs) * (c.form === 1 ? 0.7 : 1);
  const bodyLen = 0.45 * (c.form === 3 ? 1.2 : 1);
  const bodyY = legH + 0.22;
  const w = 0.3 * c.T.chunky;
  const body = c.add(pivot, c.sphere(0.36, 26), c.bodyMat, [0, bodyY, -0.05], [w / 0.36, 0.8, bodyLen / 0.36 + 0.15]);
  c.add(pivot, c.sphere(0.28, 18), c.accentMat, [0, bodyY - 0.1, 0.05], [w / 0.34, 0.6, bodyLen / 0.3]);
  const feet: V3[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pos: V3 = [sx * w * 0.6, legH / 2, sz * bodyLen * 0.65 - 0.05];
      c.add(pivot, c.cyl(0.075, 0.065, legH), c.bodyMat, pos);
      c.add(pivot, c.sphere(0.085, 12), c.T.pattern === 'socks' ? c.accentMat : c.detailMat, [pos[0], 0.05, pos[2] + 0.03], [1, 0.6, 1.25]);
      feet.push([pos[0], 0.02, pos[2] + 0.04]);
    }
  }
  const R = 0.33 * (c.form === 1 ? 1.15 : 1);
  const neckLen = 0.12 + 0.12 * c.T.snout;
  const headPos: V3 = [0, bodyY + 0.22 + neckLen, bodyLen * 0.85 + 0.05];
  c.add(pivot, c.cyl(0.12, 0.16, neckLen + 0.2), c.bodyMat, [0, bodyY + 0.15 + neckLen / 2, bodyLen * 0.7], [1, 1, 1], [0.5, 0, 0]);
  const head = headGroup(pivot, c, headPos, R);
  c.add(head, c.sphere(R * 0.55, 18), c.accentMat, [0, -R * 0.3, R * (0.7 + 0.25 * c.T.snout)], [1, 0.75, 0.9 + 0.3 * c.T.snout]);
  c.add(head, c.sphere(R * 0.12, 10), c.mat('#2A1D18'), [0, -R * 0.1, R * (1.05 + 0.35 * c.T.snout)], [1.3, 0.9, 0.8]);
  if (dragon) for (const s of [-1, 1]) c.add(head, c.cone(R * 0.1, R * 0.5), c.detailMat, [s * R * 0.35, R * 0.85, -R * 0.3], [1, 1, 1], [-0.7, 0, -s * 0.25]);
  return {
    head, R, faceZ: R * 0.95, headTop: R * 0.95, neck: [0, headPos[1] - R * 0.85, headPos[2] - 0.08], neckR: 0.16, back: [0, bodyY + 0.2, -0.15],
    tail: [0, bodyY + 0.05, -bodyLen - 0.12], spine: arc([0, bodyY + 0.3, bodyLen * 0.5], [0, bodyY + 0.24, -bodyLen * 0.85], 5),
    shoulders: [[-w * 0.85, bodyY + 0.18, bodyLen * 0.5], [w * 0.85, bodyY + 0.18, bodyLen * 0.5]], feet, bodyMeshes: [body], hasEars: true, floats: false, hasWings: false,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Generic parts
// ═════════════════════════════════════════════════════════════════════════════

function addFace(A: Anchors, c: Ctx, glowing: boolean) {
  const { head, R, faceZ } = A;
  const iris = glowing ? c.mat(c.col.glow, { glow: 1 }) : c.mat('#1B1B24');
  const eye = (x: number, y: number, size: number, sleepy = false) => {
    const g = c.group(head, [x, y, faceZ * 0.86]);
    c.add(g, c.sphere(R * 0.22 * size, 18), c.mat('#FFFFFF'), [0, 0, 0], [1, 1.1, 0.6]);
    c.add(g, c.sphere(R * 0.15 * size, 16), iris, [0, -R * 0.01, R * 0.07 * size], [1, 1.15, 0.6]);
    c.add(g, c.sphere(R * 0.05 * size, 10), c.mat('#FFFFFF', { glow: 1 }), [R * 0.05 * size, R * 0.06 * size, R * 0.14 * size]);
    if (sleepy) c.add(g, c.sphere(R * 0.235 * size, 18, ), c.bodyMat, [0, R * 0.09 * size, R * 0.02], [1.05, 0.6, 0.7]);
    c.animators.push((t) => (g.scale.y = (t + x * 3) % 3.7 < 0.12 ? 0.15 : 1));
  };
  const ex = R * 0.38;
  const ey = R * 0.12;
  switch (c.T.eyes) {
    case 'cyclops':
      eye(0, ey, 1.6);
      break;
    case 'four':
      for (const s of [-1, 1]) {
        eye(s * ex * 1.05, ey + R * 0.12, 0.7);
        eye(s * ex * 0.7, ey - R * 0.15, 0.6);
      }
      break;
    case 'visor': {
      c.add(head, c.box(R * 1.2, R * 0.25, R * 0.1), c.mat('#1B1B24'), [0, ey, faceZ * 0.92]);
      c.add(head, c.box(R * 1.0, R * 0.07, R * 0.12), glowing ? c.mat(c.col.glow, { glow: 1 }) : c.mat('#7FE0FF', { glow: 0.8 }), [0, ey, faceZ * 0.95]);
      break;
    }
    default:
      for (const s of [-1, 1]) eye(s * ex, ey, c.T.eyes === 'big' ? 1.25 : 1, c.T.eyes === 'sleepy');
  }
  c.add(head, c.sphere(R * 0.06, 10), c.mat('#3A2328'), [0, -R * 0.22, faceZ * 0.97], [1.6, 0.7, 0.6]);
}

function addPattern(A: Anchors, c: Ctx, strong: boolean) {
  const m = strong ? c.detailMat : c.mat(c.col.detail, { opacity: 0.85 });
  const target = A.bodyMeshes[0];
  switch (c.T.pattern) {
    case 'spots':
    case 'none': {
      const host = target ?? A.head;
      for (let i = 0; i < (strong ? 7 : 4); i++) {
        const a = i * 2.4;
        const yy = ((i * 37) % 10) / 10 - 0.5;
        c.add(host, c.sphere(0.06, 10), m, [Math.cos(a) * 0.33, yy * 0.4, Math.sin(a) * 0.33 - 0.03], [1, 1, 0.45]).lookAt(new THREE.Vector3(Math.cos(a) * 3, yy, Math.sin(a) * 3));
      }
      break;
    }
    case 'stripes': {
      const host = target ?? A.head;
      for (let i = 0; i < (strong ? 3 : 2); i++) c.add(host, new THREE.TorusGeometry(0.3, 0.025, 6, 24), m, [0, 0.12 - i * 0.12, 0], [1.02, 1, 1.02], [Math.PI / 2, 0, 0]);
      break;
    }
    case 'mask':
      c.add(A.head, c.sphere(A.R * 0.55, 16), m, [0, A.R * 0.1, A.faceZ * 0.62], [1.3, 0.5, 0.5]);
      break;
    case 'belly':
    case 'socks':
      c.add(A.head, c.sphere(A.R * 0.35, 14), c.accentMat, [0, A.R * 0.55, A.faceZ * 0.62], [1, 0.6, 0.5]);
      break;
  }
}

function addEars(A: Anchors, c: Ctx, k: number) {
  const { head, R } = A;
  const top = A.headTop;
  for (const s of [-1, 1]) {
    switch (c.T.ears) {
      case 'pointy':
        c.add(head, c.cone(R * 0.25 * k, R * 0.6 * k), c.bodyMat, [s * R * 0.55, top * 0.82, 0], [1, 1, 0.6], [0, 0, -s * 0.35]);
        c.add(head, c.cone(R * 0.13 * k, R * 0.38 * k), c.accentMat, [s * R * 0.55, top * 0.8, R * 0.07], [1, 1, 0.4], [0, 0, -s * 0.35]);
        break;
      case 'round':
        c.add(head, c.sphere(R * 0.26 * k, 16), c.bodyMat, [s * R * 0.68, top * 0.72, 0], [1, 1, 0.6]);
        c.add(head, c.sphere(R * 0.14 * k, 12), c.accentMat, [s * R * 0.68, top * 0.72, R * 0.08], [1, 1, 0.5]);
        break;
      case 'long':
        c.add(head, c.capsule(R * 0.15, R * 0.85 * k), c.bodyMat, [s * R * 0.32, top * 1.25, -R * 0.05], [1, 1, 0.6], [0, 0, -s * 0.15]);
        c.add(head, c.capsule(R * 0.08, R * 0.65 * k), c.accentMat, [s * R * 0.32, top * 1.25, R * 0.04], [1, 1, 0.4], [0, 0, -s * 0.15]);
        break;
      case 'fin':
        c.add(head, c.cone(R * 0.3 * k, R * 0.6 * k, 3), c.detailMat, [s * R * 0.9, R * 0.1, -R * 0.1], [0.15, 1, 1], [0, 0, -s * 1.3]);
        break;
      case 'droopy':
        c.add(head, c.capsule(R * 0.16, R * 0.5 * k), c.detailMat, [s * R * 0.85, -R * 0.05, 0], [0.6, 1, 1], [0, 0, s * 0.3]);
        break;
      case 'antenna':
        c.add(head, c.cyl(0.015, 0.015, R * 0.7 * k), c.mat(c.col.detail), [s * R * 0.3, top + R * 0.25 * k, 0], [1, 1, 1], [0, 0, -s * 0.3]);
        c.add(head, c.sphere(0.055, 10), c.glowMat, [s * R * (0.3 + 0.2 * k), top + R * 0.58 * k, 0]);
        break;
      case 'none':
        break;
    }
  }
}

function addHorns(A: Anchors, c: Ctx, k: number) {
  const { head, R } = A;
  const top = A.headTop;
  switch (c.T.horns) {
    case 'single':
      c.add(head, c.cone(R * 0.12, R * 0.6 * k), c.detailMat, [0, top * 0.95, R * 0.3], [1, 1, 1], [0.35, 0, 0]);
      break;
    case 'double':
      for (const s of [-1, 1]) c.add(head, c.cone(R * 0.1, R * 0.5 * k), c.detailMat, [s * R * 0.32, top * 0.92, -R * 0.1], [1, 1, 1], [-0.35, 0, -s * 0.3]);
      break;
    case 'antlers':
      for (const s of [-1, 1]) {
        const g = c.group(head, [s * R * 0.35, top * 0.9, -R * 0.05]);
        g.rotation.z = -s * 0.4;
        c.add(g, c.cyl(0.02, 0.025, R * 0.7 * k), c.detailMat, [0, R * 0.3 * k, 0]);
        c.add(g, c.cyl(0.015, 0.02, R * 0.35 * k), c.detailMat, [s * R * 0.12, R * 0.4 * k, 0], [1, 1, 1], [0, 0, -s * 0.9]);
        c.add(g, c.cyl(0.015, 0.02, R * 0.3 * k), c.detailMat, [-s * R * 0.08, R * 0.55 * k, 0], [1, 1, 1], [0, 0, s * 0.8]);
      }
      break;
    case 'ram':
      for (const s of [-1, 1]) c.add(head, new THREE.TorusGeometry(R * 0.22 * k, 0.04, 8, 20, Math.PI * 1.5), c.detailMat, [s * R * 0.62, top * 0.55, -R * 0.1], [1, 1, 1], [0, s * Math.PI / 2, 0.5]);
      break;
    case 'none':
      break;
  }
}

function addTails(A: Anchors, c: Ctx, count: number, k: number) {
  const base = A.tail!;
  for (let n = 0; n < count; n++) {
    const spread = count === 1 ? 0 : (n - (count - 1) / 2) * 0.45;
    const g = c.group(c.add.length ? (A.head.parent as THREE.Object3D) : A.head, base);
    g.rotation.y = spread;
    switch (c.T.tail) {
      case 'thin':
        for (let i = 0; i < 5; i++) c.add(g, c.sphere(0.055, 10), c.bodyMat, [0, i * 0.09 * k, -0.06 - Math.sin(i / 2) * 0.1 * k]);
        break;
      case 'bushy': {
        const t = c.add(g, c.sphere(0.22, 16), c.bodyMat, [0, 0.18 * k, -0.18 * k], [0.75 * k, 1.35 * k, 0.75 * k], [-0.7, 0, 0]);
        c.add(t, c.sphere(0.14, 12), c.accentMat, [0, 0.2, 0]);
        break;
      }
      case 'flame':
        c.add(g, c.cone(0.07, 0.35 * k), c.bodyMat, [0, 0.05, -0.15], [1, 1, 1], [-1.2, 0, 0]);
        c.add(g, c.cone(0.09, 0.22 * k), c.mat('#FF8A1F', { glow: 0.9 }), [0, 0.18 * k, -0.32 * k]);
        break;
      case 'fin':
        c.add(g, c.cone(0.18 * k, 0.3 * k, 3), c.detailMat, [0, 0.05, -0.22 * k], [0.12, 1, 1], [-1.6, 0, 0]);
        break;
      case 'club':
        c.add(g, c.cyl(0.04, 0.06, 0.35 * k), c.bodyMat, [0, 0, -0.17 * k], [1, 1, 1], [-1.4, 0, 0]);
        c.add(g, new THREE.DodecahedronGeometry(0.1 * k, 0), c.detailMat, [0, 0.03, -0.36 * k]);
        break;
      case 'leaf':
        c.add(g, c.cyl(0.02, 0.03, 0.25 * k), c.mat(c.col.detail), [0, 0.08, -0.1], [1, 1, 1], [-0.8, 0, 0]);
        c.add(g, c.sphere(0.14 * k, 12), c.mat('#5CC46A'), [0, 0.2 * k, -0.22 * k], [0.4, 0.12, 1], [0.5, 0, 0]);
        break;
      case 'spiral':
        c.add(g, new THREE.TorusGeometry(0.1 * k, 0.03, 8, 20, Math.PI * 1.7), c.bodyMat, [0, 0.12 * k, -0.12], [1, 1, 1], [0, Math.PI / 2, 0]);
        break;
      case 'none':
        if (c.form >= 2) c.add(g, c.sphere(0.08, 10), c.accentMat, [0, 0, -0.04]);
        break;
    }
    c.animators.push((t) => (g.rotation.z = Math.sin(t * 3 + n) * 0.15));
  }
}

function addWings(A: Anchors, c: Ctx, k: number, elemental: boolean) {
  const pivot = A.head.parent as THREE.Object3D;
  for (const s of [-1, 1]) {
    const wing = c.group(pivot, [s * 0.2, A.back[1] + 0.1, A.back[2]]);
    const m = elemental ? c.mat(c.col.glow, { glow: 0.7, opacity: 0.8 }) : c.mat(c.col.accent, { opacity: 0.95 });
    c.add(wing, c.sphere(0.32 * k, 16), m, [s * 0.3 * k, 0.12 * k, 0], [1, 0.55, 0.1], [0, 0, s * 0.5]);
    c.add(wing, c.sphere(0.22 * k, 14), m, [s * 0.22 * k, -0.08 * k, 0.02], [1, 0.45, 0.1], [0, 0, s * -0.2]);
    c.animators.push((t) => (wing.rotation.y = s * Math.sin(t * 3) * 0.25));
  }
}

/** Element powers grow with level: 1 small, 2 medium, 3 mythic transformation. */
function addPower(el: Element, A: Anchors, c: Ctx, power: number) {
  const pivot = A.head.parent as THREE.Object3D;
  const n = power * 2 + 1;
  switch (el.id) {
    case 'fire':
      for (let i = 0; i < n; i++) {
        const p = A.spine[i % A.spine.length];
        const f = c.add(pivot, c.cone(0.07, 0.25), c.mat(i % 2 ? '#FF8A1F' : '#FFD43B', { glow: 1 }), [p[0], p[1] + 0.12, p[2]]);
        c.animators.push((t) => (f.scale.y = 0.8 + Math.sin(t * 14 + i) * 0.3));
      }
      break;
    case 'water':
      for (let i = 0; i < n + 2; i++) {
        const b = c.add(pivot, c.sphere(0.04 + (i % 3) * 0.015, 10), c.mat('#BDEBFF', { opacity: 0.6, glow: 0.3 }));
        c.animators.push((t) => {
          const k = (t * 0.4 + i / (n + 2)) % 1;
          b.position.set(Math.cos(i * 2.1) * 0.55, 0.2 + k * 1.4, Math.sin(i * 2.1) * 0.55);
        });
      }
      break;
    case 'plant':
      for (let i = 0; i < n; i++) {
        const p = A.spine[i % A.spine.length];
        c.add(pivot, c.sphere(0.1, 10), c.mat(i % 2 ? '#FF9CC8' : '#5CC46A'), [p[0] + (i % 2 ? 0.06 : -0.06), p[1] + 0.06, p[2]], [1, 0.4, 1]);
      }
      break;
    case 'spark':
      for (let i = 0; i < n; i++) {
        const z = c.group(pivot, [Math.cos(i * 2) * 0.6, 0.6 + (i % 3) * 0.2, Math.sin(i * 2) * 0.6]);
        for (let k = 0; k < 3; k++) c.add(z, c.box(0.03, 0.14, 0.03), c.mat('#FFF06A', { glow: 1 }), [k % 2 ? 0.04 : -0.04, k * 0.11, 0], [1, 1, 1], [0, 0, k % 2 ? 0.6 : -0.6]);
        c.animators.push((t) => (z.visible = Math.sin(t * 9 + i * 1.7) > -0.3));
      }
      break;
    case 'ice':
      for (let i = 0; i < n; i++) {
        const p = A.spine[i % A.spine.length];
        c.add(pivot, new THREE.OctahedronGeometry(0.08 + power * 0.02), c.mat('#E6FBFF', { opacity: 0.8, glow: 0.4, metal: true }), [p[0], p[1] + 0.1, p[2]], [0.6, 1.6, 0.6]);
      }
      break;
    case 'rock':
      for (let i = 0; i < n; i++) {
        const r = c.add(pivot, new THREE.DodecahedronGeometry(0.07 + (i % 2) * 0.03, 0), c.mat('#8C6A4A', { flat: true }));
        c.animators.push((t) => {
          const a = t * 0.6 + (i / n) * Math.PI * 2;
          r.position.set(Math.cos(a) * 0.7, 0.4 + Math.sin(t * 2 + i) * 0.08, Math.sin(a) * 0.7);
          r.rotation.set(t, t * 0.7, 0);
        });
      }
      break;
    case 'psy': {
      c.add(A.head, c.sphere(A.R * 0.12, 12), c.mat('#FF8BF2', { glow: 1 }), [0, A.R * 0.45, A.faceZ * 0.9], [1, 1.3, 0.5]);
      for (let i = 0; i < power; i++) {
        const ring = c.add(pivot, new THREE.TorusGeometry(0.55 + i * 0.12, 0.012, 6, 48), c.mat('#C77DFF', { glow: 1 }), [0, 0.7 + i * 0.15, 0]);
        c.animators.push((t) => ring.rotation.set(Math.PI / 2 + Math.sin(t + i) * 0.4, t * (0.5 + i * 0.3), 0));
      }
      break;
    }
    case 'shadow':
      for (let i = 0; i < n + 1; i++) {
        const w = c.add(pivot, c.sphere(0.09, 10), c.mat('#2A2840', { opacity: 0.55 }));
        c.animators.push((t) => {
          const a = t * 0.8 + i * 1.3;
          w.position.set(Math.cos(a) * 0.5, 0.25 + ((t * 0.3 + i * 0.2) % 1) * 1.1, Math.sin(a) * 0.5 - 0.15);
        });
      }
      break;
    case 'fairy':
      for (const s of [-1, 1]) {
        const g = c.group(pivot, [s * 0.15, A.back[1] + 0.1, A.back[2] - 0.05]);
        c.add(g, c.sphere(0.24 + power * 0.06, 14), c.mat('#FFC6F1', { opacity: 0.6, glow: 0.4 }), [s * 0.25, 0.12, 0], [1, 0.75, 0.06], [0, 0, s * 0.4]);
        c.add(g, c.sphere(0.16 + power * 0.04, 12), c.mat('#C77DFF', { opacity: 0.6, glow: 0.4 }), [s * 0.18, -0.12, 0], [1, 0.75, 0.06], [0, 0, -s * 0.4]);
        c.animators.push((t) => (g.rotation.y = s * Math.sin(t * 6) * 0.3));
      }
      break;
    case 'wind': {
      const swirl = c.group(pivot, [0, 0.6, 0]);
      for (let i = 0; i < n + 2; i++) {
        const a = (i / (n + 2)) * Math.PI * 2;
        c.add(swirl, c.sphere(0.06, 10), c.mat(i % 2 ? '#FFFFFF' : '#C7FFF0', { opacity: 0.85 }), [Math.cos(a) * 0.62, i * 0.06, Math.sin(a) * 0.62], [1.8, 0.4, 0.9], [0, -a, 0]);
      }
      c.animators.push((t) => (swirl.rotation.y = t * 2.2));
      break;
    }
  }
}

function addAccessories(A: Anchors, c: Ctx, eq: Equipped) {
  const { head, R } = A;
  const pivot = head.parent as THREE.Object3D;
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

// ─── Small utilities ─────────────────────────────────────────────────────────

/** n points on a gentle arc from a to b. */
function arc(a: V3, b: V3, n: number): V3[] {
  return Array.from({ length: n }, (_, i) => {
    const k = n === 1 ? 0 : i / (n - 1);
    const lift = Math.sin(k * Math.PI) * 0.05;
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k + lift, a[2] + (b[2] - a[2]) * k] as V3;
  });
}

function shift(hex: string, deg: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL((hsl.h + deg / 360 + 1) % 1, Math.min(1, hsl.s * 1.15 + 0.05), hsl.l);
  return '#' + c.getHexString();
}

function deepen(hex: string): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s * 1.2), hsl.l * 0.92);
  return '#' + c.getHexString();
}

/** Soft studio lighting that flatters the toy-like look. */
export function addLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9c4ff', 1.6));
  const key = new THREE.DirectionalLight('#ffffff', 1.8);
  key.position.set(2, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#b8c7ff', 0.8);
  rim.position.set(-3, 2, -3);
  scene.add(rim);
}

export type { Species };
