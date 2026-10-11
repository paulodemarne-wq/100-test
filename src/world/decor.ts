// 3D models for island objects. Each fits one 1×1 cell, centered on the origin, facing +z.
import * as THREE from 'three';

type V3 = [number, number, number];

export type Kit = ReturnType<typeof makeKit>;

/** Shared materials and shape helpers, so a whole island uses few materials. */
export function makeKit() {
  const materials = new Map<string, THREE.Material>();
  const mat = (color: string, glow = 0, opacity?: number) => {
    const key = `${color}|${glow}|${opacity}`;
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.75,
        metalness: 0.02,
        emissive: new THREE.Color(glow ? color : '#000000'),
        emissiveIntensity: glow,
        transparent: opacity !== undefined,
        opacity: opacity ?? 1,
        depthWrite: opacity === undefined,
      });
      materials.set(key, m);
    }
    return m;
  };
  /** For open shapes seen from above (boat hulls): lit on both sides. */
  const matTwoSided = (color: string) => {
    const key = `${color}|two-sided`;
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.02, side: THREE.DoubleSide });
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
  const group = (parent: THREE.Object3D, pos: V3 = [0, 0, 0]) => {
    const g = new THREE.Group();
    g.position.set(...pos);
    parent.add(g);
    return g;
  };
  return {
    mat,
    matTwoSided,
    add,
    group,
    materials,
    sphere: (r: number, seg = 20) => new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.7))),
    box: (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d),
    cyl: (r1: number, r2: number, h: number, seg = 20) => new THREE.CylinderGeometry(r1, r2, h, seg),
    cone: (r: number, h: number, seg = 18) => new THREE.ConeGeometry(r, h, seg),
    capsuleGeo: (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 14),
    dispose: () => materials.forEach((m) => m.dispose()),
  };
}

/** Ground tile colors: [top, side]. */
export const TILE_COLORS: Record<string, [string, string]> = {
  grass: ['#8BD46A', '#6FB552'],
  path: ['#D9B07A', '#BF955F'],
  cobble: ['#C9C6C0', '#A9A59E'],
  water: ['#5CC4F2', '#3FA6D6'],
  meadow: ['#A2DE74', '#84C25A'],
  beach: ['#F2D59B', '#DDBC7C'],
  wood: ['#C08A55', '#9C6B3F'],
  snow: ['#F4F8FF', '#D5DEEA'],
  clouds: ['#F6F2FF', '#E2DAF7'],
};

/** Small details drawn on some tiles (flowers, stones, planks…). */
export function tileDetails(id: string, k: Kit, parent: THREE.Object3D, x: number, z: number, seed: number) {
  const r = (n: number) => ((Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  const cx = x + 0.5;
  const cz = z + 0.5;
  if (id === 'grass' && r(1) < 0.35) {
    k.add(parent, k.cone(0.03, 0.1, 5), k.mat('#6FBF4E'), [cx + r(2) * 0.6 - 0.3, 0.05, cz + r(3) * 0.6 - 0.3]);
  } else if (id === 'meadow') {
    const colors = ['#FF6B9A', '#FFD23F', '#FFFFFF', '#B57BFF', '#FF8C42'];
    for (let i = 0; i < 3; i++)
      k.add(parent, k.sphere(0.045, 8), k.mat(colors[Math.floor(r(i + 4) * 5)]), [cx + r(i + 7) * 0.7 - 0.35, 0.05, cz + r(i + 11) * 0.7 - 0.35]);
  } else if (id === 'cobble') {
    for (let i = 0; i < 4; i++)
      k.add(parent, k.box(0.36, 0.02, 0.36), k.mat(i % 2 ? '#D8D5CF' : '#BBB7B0'), [cx + (i % 2 ? 0.2 : -0.2), 0.005, cz + (i < 2 ? 0.2 : -0.2)]);
  } else if (id === 'wood') {
    for (let i = 0; i < 3; i++) k.add(parent, k.box(0.96, 0.012, 0.02), k.mat('#8A5C35'), [cx, 0.003, cz - 0.33 + i * 0.33]);
  } else if (id === 'snow' && r(1) < 0.25) {
    k.add(parent, k.sphere(0.07, 8), k.mat('#FFFFFF'), [cx + r(2) * 0.5 - 0.25, 0.03, cz + r(3) * 0.5 - 0.25]);
  } else if (id === 'beach' && r(1) < 0.15) {
    k.add(parent, k.cone(0.05, 0.06, 6), k.mat(r(2) < 0.5 ? '#FFB3C1' : '#FFF1D6'), [cx + r(3) * 0.5 - 0.25, 0.03, cz + r(4) * 0.5 - 0.25]);
  } else if (id === 'clouds' && r(1) < 0.5) {
    k.add(parent, k.sphere(0.22, 10), k.mat('#FFFFFF'), [cx + r(2) * 0.4 - 0.2, 0.0, cz + r(3) * 0.4 - 0.2], [1, 0.45, 1]);
  }
}

/** Builds one object. Unknown ids give an empty group. */
export function buildDecor(id: string, k: Kit): THREE.Group {
  const g = new THREE.Group();
  const { add, mat, sphere, box, cyl, cone } = k;
  const roof = (w: number, h: number, y: number, color: string) =>
    add(g, cone(w * 0.75, h, 4), mat(color), [0, y + h / 2, 0], [1, 1, 0.85], [0, Math.PI / 4, 0]);
  const flower = (pos: V3, color: string, s = 1) => {
    add(g, cyl(0.012 * s, 0.012 * s, 0.14 * s, 5), mat('#4E9A3A'), [pos[0], pos[1] + 0.07 * s, pos[2]]);
    add(g, sphere(0.045 * s, 8), mat(color), [pos[0], pos[1] + 0.15 * s, pos[2]]);
  };
  const trunk = (h: number, r = 0.06) => add(g, cyl(r * 0.7, r, h, 8), mat('#8A5C35'), [0, h / 2, 0]);

  switch (id) {
    // ─── Houses ────────────────────────────────────────────────────────────
    case 'tent':
      add(g, cone(0.45, 0.6, 4), mat('#F28C38'), [0, 0.3, 0], [1, 1, 1.1], [0, Math.PI / 4, 0]);
      add(g, cone(0.17, 0.4, 3), mat('#5B3A1E'), [0, 0.2, 0.2], [1, 1, 0.5], [0, Math.PI, 0]);
      break;
    case 'doghouse':
      add(g, box(0.55, 0.42, 0.5), mat('#E0564B'), [0, 0.21, 0]);
      roof(0.7, 0.32, 0.42, '#8C3B33');
      add(g, cyl(0.12, 0.12, 0.02, 16), mat('#3A2622'), [0, 0.17, 0.26], [1, 1.3, 1], [Math.PI / 2, 0, 0]);
      break;
    case 'cabin':
      add(g, box(0.85, 0.6, 0.7), mat('#9C6B3F'), [0, 0.3, 0]);
      for (let i = 0; i < 4; i++) add(g, cyl(0.04, 0.04, 0.88, 8), mat('#8A5C35'), [0, 0.08 + i * 0.15, 0.35], [1, 1, 1], [0, 0, Math.PI / 2]);
      roof(1.05, 0.45, 0.6, '#5E3B23');
      add(g, box(0.2, 0.34, 0.03), mat('#4A2E1B'), [-0.18, 0.17, 0.37]);
      add(g, box(0.18, 0.16, 0.03), mat('#FFE08A', 0.5), [0.2, 0.38, 0.37]);
      break;
    case 'cottage':
      add(g, box(0.9, 0.66, 0.75), mat('#FFF7EC'), [0, 0.33, 0]);
      roof(1.15, 0.5, 0.66, '#E2574C');
      add(g, box(0.12, 0.34, 0.12), mat('#B0574A'), [0.26, 1.02, -0.08]);
      add(g, box(0.2, 0.36, 0.03), mat('#6B4BA8'), [0, 0.18, 0.39]);
      add(g, box(0.18, 0.17, 0.03), mat('#8FD3FF', 0.35), [-0.28, 0.42, 0.39]);
      add(g, box(0.18, 0.17, 0.03), mat('#8FD3FF', 0.35), [0.28, 0.42, 0.39]);
      break;
    case 'mushroom': {
      add(g, cyl(0.28, 0.33, 0.6, 18), mat('#FFF1DC'), [0, 0.3, 0]);
      const cap = add(g, new THREE.SphereGeometry(0.55, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('#E8413A'), [0, 0.56, 0], [1, 0.8, 1]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(cap, sphere(0.07, 8), mat('#FFFFFF'), [Math.cos(a) * 0.38, 0.33, Math.sin(a) * 0.38], [1, 0.4, 1]);
      }
      add(g, cyl(0.1, 0.1, 0.02, 16), mat('#7A4A2A'), [0, 0.16, 0.31], [1, 1.6, 1], [Math.PI / 2, 0, 0]);
      add(g, cyl(0.06, 0.06, 0.02, 12), mat('#FFE08A', 0.6), [0.16, 0.4, 0.29], [1, 1, 1], [Math.PI / 2, 0, 0]);
      break;
    }
    case 'castle':
      add(g, box(0.75, 0.6, 0.55), mat('#C9C7D6'), [0, 0.3, 0]);
      for (let i = 0; i < 4; i++) add(g, box(0.11, 0.11, 0.11), mat('#B4B1C4'), [-0.29 + i * 0.19, 0.65, 0.22]);
      for (const x of [-0.42, 0.42]) {
        add(g, cyl(0.15, 0.17, 0.95, 14), mat('#B4B1C4'), [x, 0.475, 0]);
        add(g, cone(0.21, 0.4, 14), mat('#5B6CFF'), [x, 1.15, 0]);
      }
      add(g, cyl(0.006, 0.006, 0.3, 5), mat('#555555'), [0.42, 1.48, 0]);
      add(g, box(0.16, 0.1, 0.01), mat('#FF2D55'), [0.5, 1.57, 0]);
      add(g, box(0.24, 0.26, 0.03), mat('#4A2E1B'), [0, 0.13, 0.29]);
      break;

    // ─── Trees ─────────────────────────────────────────────────────────────
    case 'pine':
      trunk(0.2);
      add(g, cone(0.36, 0.45, 9), mat('#2F8F4E'), [0, 0.4, 0]);
      add(g, cone(0.28, 0.4, 9), mat('#35A057'), [0, 0.65, 0]);
      add(g, cone(0.18, 0.32, 9), mat('#3DB062'), [0, 0.88, 0]);
      break;
    case 'bush':
      add(g, sphere(0.26, 12), mat('#5DBB4C'), [0, 0.2, 0]);
      add(g, sphere(0.2, 12), mat('#6CCB5A'), [-0.22, 0.14, 0.1]);
      add(g, sphere(0.18, 12), mat('#4FA83F'), [0.22, 0.13, 0.08]);
      break;
    case 'apple':
      trunk(0.6);
      add(g, sphere(0.36, 14), mat('#4FAE48'), [0, 0.85, 0]);
      add(g, sphere(0.25, 12), mat('#5DBB4C'), [-0.26, 0.75, 0.08]);
      add(g, sphere(0.25, 12), mat('#5DBB4C'), [0.26, 0.76, -0.04]);
      for (let i = 0; i < 6; i++) {
        const a = i * 2.1;
        add(g, sphere(0.045, 8), mat('#E8322E'), [Math.cos(a) * 0.32, 0.72 + (i % 3) * 0.12, Math.sin(a) * 0.24 + 0.14]);
      }
      break;
    case 'palm': {
      for (let i = 0; i < 5; i++) add(g, cyl(0.05, 0.06, 0.2, 8), mat(i % 2 ? '#B98A57' : '#A57A4A'), [i * 0.03, 0.1 + i * 0.19, 0], [1, 1, 1], [0, 0, -0.1]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(g, box(0.5, 0.02, 0.13), mat('#3DAA4E'), [0.15 + Math.cos(a) * 0.22, 0.98, Math.sin(a) * 0.22], [1, 1, 1], [0, -a, -0.35]);
      }
      add(g, sphere(0.06, 8), mat('#6B4A2A'), [0.1, 0.92, 0.06]);
      add(g, sphere(0.06, 8), mat('#6B4A2A'), [0.18, 0.92, -0.05]);
      break;
    }
    case 'sakura': {
      trunk(0.6);
      const pinks = ['#FFB7D0', '#FFC9DC', '#FF9EC2'];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(g, sphere(0.2 + (i % 2) * 0.05, 12), mat(pinks[i % 3]), [Math.cos(a) * 0.27, 0.82 + Math.sin(i) * 0.08, Math.sin(a) * 0.2]);
      }
      add(g, sphere(0.27, 12), mat('#FFC9DC'), [0, 0.98, 0]);
      for (let i = 0; i < 5; i++) add(g, sphere(0.025, 6), mat('#FFB7D0'), [Math.cos(i * 1.3) * 0.35, 0.01, Math.sin(i * 1.3) * 0.35], [1, 0.4, 1]);
      break;
    }
    case 'crystal': {
      const colors = ['#7FE7FF', '#B69CFF', '#9FF5E1'];
      add(g, cone(0.16, 1.1, 6), mat(colors[0], 0.45), [0, 0.55, 0]);
      add(g, cone(0.1, 0.7, 6), mat(colors[1], 0.45), [-0.2, 0.33, 0.06], [1, 1, 1], [0, 0, 0.35]);
      add(g, cone(0.1, 0.65, 6), mat(colors[2], 0.45), [0.19, 0.3, -0.04], [1, 1, 1], [0, 0, -0.3]);
      add(g, sphere(0.05, 8), mat('#FFFFFF', 1), [0, 1.2, 0]);
      break;
    }

    // ─── Decorations ───────────────────────────────────────────────────────
    case 'fence':
      for (const x of [-0.42, 0, 0.42]) add(g, box(0.07, 0.36, 0.07), mat('#C9A27A'), [x, 0.18, 0]);
      for (const y of [0.13, 0.27]) add(g, box(0.98, 0.05, 0.04), mat('#DDB991'), [0, y, 0]);
      break;
    case 'rock':
      add(g, new THREE.DodecahedronGeometry(0.22, 0), mat('#A9A39A'), [0, 0.12, 0], [1.2, 0.7, 1]);
      add(g, new THREE.DodecahedronGeometry(0.12, 0), mat('#BDB7AE'), [0.22, 0.06, 0.12], [1, 0.7, 1]);
      break;
    case 'hedge':
      add(g, box(0.94, 0.4, 0.36), mat('#4FA83F'), [0, 0.2, 0]);
      for (let i = 0; i < 4; i++) add(g, sphere(0.14, 10), mat('#5DBB4C'), [-0.36 + i * 0.24, 0.4, 0]);
      break;
    case 'flowerbed': {
      add(g, box(0.7, 0.08, 0.5), mat('#7A4E31'), [0, 0.04, 0]);
      const colors = ['#FF6B9A', '#FFD23F', '#B57BFF', '#FF8C42', '#FFFFFF'];
      for (let i = 0; i < 8; i++) flower([-0.24 + (i % 4) * 0.16, 0.08, -0.1 + Math.floor(i / 4) * 0.2], colors[i % 5]);
      break;
    }
    case 'bench':
      add(g, box(0.8, 0.05, 0.28), mat('#B5824F'), [0, 0.24, 0]);
      add(g, box(0.8, 0.22, 0.04), mat('#B5824F'), [0, 0.4, -0.13]);
      for (const x of [-0.33, 0.33]) add(g, box(0.05, 0.24, 0.26), mat('#3D3D4A'), [x, 0.12, 0]);
      break;
    case 'lamp':
      add(g, cyl(0.025, 0.035, 0.9, 8), mat('#3D3D4A'), [0, 0.45, 0]);
      add(g, cyl(0.08, 0.1, 0.04, 10), mat('#3D3D4A'), [0, 0.02, 0]);
      add(g, sphere(0.09, 12), mat('#FFE08A', 0.9), [0, 0.95, 0]);
      add(g, cone(0.12, 0.1, 10), mat('#3D3D4A'), [0, 1.07, 0]);
      break;
    case 'campfire':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        add(g, sphere(0.07, 8), mat('#8F8A82'), [Math.cos(a) * 0.25, 0.04, Math.sin(a) * 0.25], [1, 0.7, 1]);
      }
      add(g, cyl(0.04, 0.04, 0.4, 6), mat('#6B4A2A'), [0, 0.05, 0], [1, 1, 1], [0, 0.6, Math.PI / 2]);
      add(g, cyl(0.04, 0.04, 0.4, 6), mat('#6B4A2A'), [0, 0.05, 0], [1, 1, 1], [0, -0.6, Math.PI / 2]);
      add(g, cone(0.13, 0.32, 8), mat('#FF8C2B', 0.9), [0, 0.22, 0]);
      add(g, cone(0.07, 0.22, 8), mat('#FFE14D', 1), [0, 0.2, 0.02]);
      break;
    case 'pumpkin':
      for (const [x, z, s] of [[-0.15, 0.05, 1], [0.2, -0.1, 0.8], [0.1, 0.22, 0.6]] as V3[]) {
        add(g, sphere(0.17 * s, 12), mat('#FF8C2B'), [x, 0.14 * s, z], [1.15, 0.85, 1.15]);
        add(g, cyl(0.02, 0.02, 0.08, 5), mat('#4E7A2A'), [x, 0.29 * s, z]);
      }
      break;
    case 'table':
      add(g, box(0.8, 0.05, 0.5), mat('#C08A55'), [0, 0.4, 0]);
      add(g, box(0.8, 0.01, 0.5), mat('#E5484D'), [0, 0.43, 0], [1, 1, 1]);
      for (const z of [-0.36, 0.36]) add(g, box(0.8, 0.04, 0.14), mat('#B5824F'), [0, 0.22, z]);
      for (const x of [-0.3, 0.3]) add(g, box(0.05, 0.4, 0.05), mat('#8A5C35'), [x, 0.2, 0]);
      add(g, sphere(0.05, 8), mat('#E8322E'), [0.15, 0.48, 0.05]);
      break;
    case 'pond':
      add(g, cyl(0.4, 0.4, 0.02, 22), mat('#5CC4F2', 0.1), [0, 0.012, 0], [1, 1, 0.8]);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        add(g, sphere(0.06, 8), mat('#A9A39A'), [Math.cos(a) * 0.42, 0.03, Math.sin(a) * 0.34], [1, 0.6, 1]);
      }
      add(g, cyl(0.08, 0.08, 0.01, 12), mat('#4FAE48'), [0.1, 0.03, 0.05]);
      flower([-0.12, 0, -0.08], '#FFB7D0', 0.6);
      break;
    case 'well':
      add(g, cyl(0.3, 0.32, 0.35, 16), mat('#B8B2A7'), [0, 0.175, 0]);
      add(g, cyl(0.24, 0.24, 0.02, 16), mat('#3F7FB5'), [0, 0.33, 0]);
      for (const x of [-0.27, 0.27]) add(g, box(0.05, 0.5, 0.05), mat('#8A5C35'), [x, 0.6, 0]);
      add(g, cone(0.38, 0.25, 4), mat('#A0473C'), [0, 0.95, 0], [1, 1, 0.7], [0, Math.PI / 4, 0]);
      break;
    case 'fountain':
      add(g, cyl(0.4, 0.42, 0.16, 20), mat('#D8D4CC'), [0, 0.08, 0]);
      add(g, cyl(0.34, 0.34, 0.02, 20), mat('#5CC4F2', 0.15), [0, 0.15, 0]);
      add(g, cyl(0.06, 0.08, 0.45, 10), mat('#D8D4CC'), [0, 0.38, 0]);
      add(g, cyl(0.18, 0.12, 0.06, 14), mat('#D8D4CC'), [0, 0.6, 0]);
      add(g, sphere(0.09, 10), mat('#8FD9FF', 0.3), [0, 0.7, 0], [1, 0.7, 1]);
      break;
    case 'statue':
      add(g, box(0.4, 0.3, 0.4), mat('#E9E5DC'), [0, 0.15, 0]);
      add(g, cyl(0.06, 0.08, 0.2, 10), mat('#F5B400', 0.15), [0, 0.4, 0]);
      add(g, new THREE.CylinderGeometry(0.18, 0.08, 0.25, 14, 1, true), mat('#F5B400', 0.2), [0, 0.62, 0]);
      for (const s of [-1, 1]) add(g, new THREE.TorusGeometry(0.08, 0.02, 6, 14, Math.PI), mat('#F5B400', 0.2), [s * 0.17, 0.62, 0], [1, 1, 1], [0, 0, s * Math.PI / 2]);
      add(g, new THREE.OctahedronGeometry(0.05), mat('#FFFFFF', 1), [0, 0.86, 0]);
      break;
    // ─── The daily shop building (featured islands only) ──────────────────
    case 'boutique': {
      // Shop front with big windows, a striped awning, a sign and a golden star on top.
      add(g, box(0.95, 0.62, 0.7), mat('#FFF4E0'), [0, 0.31, -0.05]);
      add(g, box(1.0, 0.06, 0.75), mat('#C9A27A'), [0, 0.03, -0.05]);
      add(g, cone(0.72, 0.36, 4), mat('#5856D6'), [0, 0.8, -0.05], [1, 1, 0.75], [0, Math.PI / 4, 0]);
      for (let i = 0; i < 6; i++)
        add(g, box(0.165, 0.025, 0.3), mat(i % 2 ? '#FFFFFF' : '#E5484D'), [-0.41 + i * 0.165, 0.6, 0.38], [1, 1, 1], [0.45, 0, 0]);
      for (let i = 0; i < 6; i++) add(g, sphere(0.083, 10), mat(i % 2 ? '#FFFFFF' : '#E5484D'), [-0.41 + i * 0.165, 0.535, 0.52], [1, 0.6, 0.6]);
      add(g, box(0.22, 0.36, 0.03), mat('#6B4BA8'), [0, 0.2, 0.31]);
      add(g, sphere(0.02, 6), mat('#F5B400'), [0.07, 0.2, 0.33]);
      for (const x of [-0.3, 0.3]) {
        add(g, box(0.26, 0.24, 0.03), mat('#8FD3FF', 0.35), [x, 0.27, 0.31]);
        add(g, box(0.28, 0.03, 0.05), mat('#FFFFFF'), [x, 0.14, 0.33]);
      }
      add(g, box(0.62, 0.16, 0.04), mat('#F5B400', 0.15), [0, 0.86, 0.22], [1, 1, 1], [-0.3, 0, 0]);
      add(g, box(0.55, 0.1, 0.01), mat('#5856D6'), [0, 0.86, 0.245], [1, 1, 1], [-0.3, 0, 0]);
      const star = k.group(g, [0, 1.08, -0.05]);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add(star, cone(0.05, 0.14, 4), mat('#FFD43B', 0.6), [Math.sin(a) * 0.07, Math.cos(a) * 0.07, 0], [1, 1, 0.4], [0, 0, -a]);
      }
      add(star, sphere(0.06, 10), mat('#FFD43B', 0.6), [0, 0, 0], [1, 1, 0.5]);
      // Little crates of goodies on each side.
      add(g, box(0.16, 0.12, 0.16), mat('#B5824F'), [-0.6, 0.06, 0.25]);
      add(g, sphere(0.05, 8), mat('#E8322E'), [-0.62, 0.14, 0.25]);
      add(g, sphere(0.05, 8), mat('#FFD43B'), [-0.56, 0.14, 0.28]);
      add(g, box(0.16, 0.12, 0.16), mat('#B5824F'), [0.6, 0.06, 0.25]);
      add(g, sphere(0.06, 8), mat('#FF6FA8'), [0.6, 0.15, 0.25]);
      break;
    }

    // ─── New houses ────────────────────────────────────────────────────────
    case 'igloo': {
      add(g, new THREE.SphereGeometry(0.42, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#F4F8FF'));
      for (let i = 1; i < 4; i++) add(g, new THREE.TorusGeometry(0.42 * Math.cos((i * Math.PI) / 9), 0.008, 4, 28), mat('#C9D6E8'), [0, 0.42 * Math.sin((i * Math.PI) / 9), 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
      add(g, new THREE.CylinderGeometry(0.16, 0.16, 0.3, 14, 1, false, 0, Math.PI), mat('#F4F8FF'), [0, 0, 0.42], [1, 1, 1], [Math.PI / 2, 0, -Math.PI / 2]);
      add(g, cyl(0.11, 0.11, 0.02, 14), mat('#26405E'), [0, 0.08, 0.57], [1, 1, 1.2], [Math.PI / 2, 0, 0]);
      break;
    }
    case 'treehouse': {
      add(g, cyl(0.1, 0.14, 1.0, 10), mat('#8A5C35'), [0, 0.5, 0]);
      add(g, sphere(0.45, 14), mat('#4FAE48'), [0, 1.35, -0.05]);
      add(g, sphere(0.3, 12), mat('#5DBB4C'), [0.3, 1.2, 0.1]);
      add(g, box(0.62, 0.05, 0.62), mat('#B5824F'), [0, 0.72, 0]);
      add(g, box(0.45, 0.32, 0.4), mat('#C08A55'), [0, 0.9, 0.05]);
      add(g, cone(0.4, 0.25, 4), mat('#E2574C'), [0, 1.18, 0.05], [1, 1, 0.9], [0, Math.PI / 4, 0]);
      add(g, box(0.12, 0.18, 0.02), mat('#4A2E1B'), [0, 0.84, 0.26]);
      for (let i = 0; i < 6; i++) add(g, box(0.18, 0.02, 0.03), mat('#8A5C35'), [0.2, 0.08 + i * 0.11, 0.3]);
      for (const x of [0.12, 0.28]) add(g, box(0.02, 0.7, 0.02), mat('#8A5C35'), [x, 0.35, 0.3]);
      break;
    }
    case 'windmill': {
      add(g, cyl(0.24, 0.34, 0.95, 12), mat('#F2E6D0'), [0, 0.475, 0]);
      add(g, cone(0.32, 0.35, 12), mat('#B0574A'), [0, 1.12, 0]);
      add(g, box(0.14, 0.24, 0.02), mat('#6B4A2A'), [0, 0.12, 0.33]);
      const blades = k.group(g, [0, 0.95, 0.3]);
      for (let i = 0; i < 4; i++) {
        const arm = k.group(blades);
        arm.rotation.z = (i * Math.PI) / 2 + 0.3;
        add(arm, box(0.04, 0.6, 0.02), mat('#8A5C35'), [0, 0.3, 0]);
        add(arm, box(0.16, 0.42, 0.01), mat('#FFFFFF'), [0.09, 0.36, 0]);
      }
      add(g, sphere(0.05, 8), mat('#6B4A2A'), [0, 0.95, 0.31]);
      break;
    }

    // ─── New trees ─────────────────────────────────────────────────────────
    case 'cactus':
      add(g, k.capsuleGeo(0.11, 0.55), mat('#4CAF50'), [0, 0.38, 0]);
      add(g, k.capsuleGeo(0.07, 0.2), mat('#4CAF50'), [0.18, 0.42, 0]);
      add(g, k.capsuleGeo(0.07, 0.16), mat('#4CAF50'), [-0.17, 0.32, 0]);
      add(g, sphere(0.05, 8), mat('#FF6FA8'), [0, 0.74, 0]);
      add(g, cyl(0.2, 0.16, 0.12, 12), mat('#C46A3C'), [0, 0.06, 0]);
      break;
    case 'sunflower':
      for (const [x, z, h] of [[-0.18, 0.05, 0.75], [0.15, -0.1, 0.9], [0.05, 0.2, 0.6]] as V3[]) {
        add(g, cyl(0.02, 0.025, h, 6), mat('#4E9A3A'), [x, h / 2, z]);
        add(g, cyl(0.15, 0.15, 0.03, 14), mat('#FFC928'), [x, h, z + 0.02], [1, 1, 1], [Math.PI / 2 - 0.3, 0, 0]);
        add(g, cyl(0.07, 0.07, 0.04, 12), mat('#6B4226'), [x, h + 0.01, z + 0.04], [1, 1, 1], [Math.PI / 2 - 0.3, 0, 0]);
        add(g, sphere(0.06, 8), mat('#4E9A3A'), [x + 0.05, h * 0.5, z], [1.4, 0.4, 0.8]);
      }
      break;
    case 'autumn':
      trunk(0.55);
      add(g, sphere(0.36, 14), mat('#E8702A'), [0, 0.85, 0]);
      add(g, sphere(0.26, 12), mat('#F2A93B'), [-0.25, 0.75, 0.1]);
      add(g, sphere(0.25, 12), mat('#D9481F'), [0.25, 0.78, -0.05]);
      for (let i = 0; i < 6; i++) add(g, sphere(0.04, 6), mat(i % 2 ? '#E8702A' : '#F2A93B'), [Math.cos(i * 1.4) * 0.35, 0.01, Math.sin(i * 1.4) * 0.35], [1, 0.3, 1]);
      break;
    case 'bamboo':
      for (const [x, z, h] of [[-0.15, 0, 1.0], [0.1, -0.12, 1.25], [0.12, 0.14, 0.85], [-0.05, 0.2, 1.1]] as V3[]) {
        for (let y = 0; y < h; y += 0.25) {
          add(g, cyl(0.035, 0.035, 0.23, 8), mat('#7CC36A'), [x, y + 0.12, z]);
          add(g, cyl(0.04, 0.04, 0.02, 8), mat('#5E9E4E'), [x, y + 0.24, z]);
        }
        add(g, box(0.22, 0.01, 0.05), mat('#5DBB4C'), [x + 0.1, h - 0.1, z], [1, 1, 1], [0, 0.4, -0.4]);
      }
      break;

    // ─── New decorations ───────────────────────────────────────────────────
    case 'mailbox':
      add(g, box(0.05, 0.5, 0.05), mat('#8A5C35'), [0, 0.25, 0]);
      add(g, k.capsuleGeo(0.11, 0.22), mat('#3D7DD8'), [0, 0.58, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
      add(g, box(0.02, 0.14, 0.02), mat('#E5484D'), [0.12, 0.66, -0.05]);
      add(g, box(0.06, 0.06, 0.02), mat('#E5484D'), [0.12, 0.74, -0.02]);
      break;
    case 'signpost':
      add(g, box(0.05, 0.7, 0.05), mat('#8A5C35'), [0, 0.35, 0]);
      add(g, box(0.5, 0.14, 0.03), mat('#C08A55'), [0.12, 0.58, 0.03]);
      add(g, cone(0.08, 0.1, 3), mat('#C08A55'), [0.41, 0.58, 0.03], [1, 1, 0.3], [0, 0, -Math.PI / 2]);
      add(g, box(0.4, 0.12, 0.03), mat('#B5824F'), [-0.08, 0.4, 0.03]);
      break;
    case 'snowman':
      add(g, sphere(0.22, 14), mat('#FFFFFF'), [0, 0.2, 0]);
      add(g, sphere(0.16, 14), mat('#FFFFFF'), [0, 0.5, 0]);
      add(g, cone(0.03, 0.14, 8), mat('#FF8C2B'), [0, 0.51, 0.18], [1, 1, 1], [Math.PI / 2, 0, 0]);
      for (const x of [-0.06, 0.06]) add(g, sphere(0.02, 6), mat('#222222'), [x, 0.56, 0.14]);
      add(g, cyl(0.12, 0.12, 0.03, 12), mat('#222222'), [0, 0.65, 0]);
      add(g, cyl(0.08, 0.08, 0.14, 12), mat('#222222'), [0, 0.72, 0]);
      add(g, new THREE.TorusGeometry(0.14, 0.03, 6, 18), mat('#E5484D'), [0, 0.38, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
      break;
    case 'umbrella':
      add(g, cyl(0.015, 0.015, 0.9, 6), mat('#EEEEEE'), [0, 0.45, 0], [1, 1, 1], [0, 0, 0.1]);
      for (let i = 0; i < 8; i++) {
        const seg = k.group(g, [0.04, 0.9, 0]);
        seg.rotation.y = (i * Math.PI) / 4;
        add(seg, new THREE.CylinderGeometry(0, 0.45, 0.18, 2, 1, true, 0, Math.PI / 4), mat(i % 2 ? '#FFFFFF' : '#E5484D'));
      }
      add(g, box(0.4, 0.02, 0.6), mat('#3BA7F5'), [0.15, 0.01, 0.15]);
      break;
    case 'deckchair':
      add(g, box(0.36, 0.03, 0.4), mat('#3BA7F5'), [0, 0.2, 0.12], [1, 1, 1], [0.2, 0, 0]);
      add(g, box(0.36, 0.03, 0.4), mat('#3BA7F5'), [0, 0.38, -0.18], [1, 1, 1], [-0.9, 0, 0]);
      for (const x of [-0.17, 0.17]) {
        add(g, box(0.03, 0.03, 0.7), mat('#FFFFFF'), [x, 0.2, 0], [1, 1, 1], [0.2, 0, 0]);
        add(g, box(0.03, 0.45, 0.03), mat('#FFFFFF'), [x, 0.2, -0.2], [1, 1, 1], [-0.5, 0, 0]);
      }
      break;
    case 'swing':
      for (const x of [-0.38, 0.38]) {
        add(g, box(0.05, 0.85, 0.05), mat('#C08A55'), [x, 0.42, 0.18], [1, 1, 1], [0.2, 0, 0]);
        add(g, box(0.05, 0.85, 0.05), mat('#C08A55'), [x, 0.42, -0.18], [1, 1, 1], [-0.2, 0, 0]);
      }
      add(g, cyl(0.03, 0.03, 0.85, 8), mat('#8A5C35'), [0, 0.82, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
      for (const x of [-0.12, 0.12]) add(g, cyl(0.006, 0.006, 0.55, 4), mat('#555555'), [x, 0.53, 0]);
      add(g, box(0.3, 0.03, 0.12), mat('#E5484D'), [0, 0.25, 0]);
      break;
    case 'slide':
      add(g, box(0.3, 0.6, 0.3), mat('#3BA7F5'), [-0.25, 0.3, 0]);
      add(g, box(0.28, 0.03, 0.85), mat('#FFC928'), [0.08, 0.3, 0], [1, 1, 1], [0, 0, 0], );
      g.children[g.children.length - 1].rotation.set(0, Math.PI / 2, -0.62);
      for (let i = 0; i < 4; i++) add(g, box(0.3, 0.03, 0.05), mat('#E5484D'), [-0.25, 0.12 + i * 0.15, -0.17]);
      break;
    case 'hammock': {
      for (const x of [-0.42, 0.42]) {
        add(g, cyl(0.04, 0.05, 0.7, 8), mat('#8A5C35'), [x, 0.35, 0]);
        add(g, sphere(0.15, 10), mat('#4FAE48'), [x, 0.75, 0]);
      }
      const net = new THREE.SphereGeometry(0.42, 16, 6, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4);
      add(g, net, mat('#F2D59B'), [0, 0.6, 0], [1, 0.45, 0.4]);
      break;
    }
    case 'trampoline':
      add(g, new THREE.TorusGeometry(0.38, 0.04, 8, 28), mat('#3BA7F5'), [0, 0.22, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
      add(g, cyl(0.36, 0.36, 0.01, 24), mat('#22222A'), [0, 0.21, 0]);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        add(g, cyl(0.02, 0.02, 0.22, 6), mat('#A1A1AA'), [Math.cos(a) * 0.36, 0.1, Math.sin(a) * 0.36]);
      }
      break;
    case 'pier':
      add(g, box(0.5, 0.05, 1.0), mat('#C08A55'), [0, 0.12, 0]);
      for (let i = 0; i < 5; i++) add(g, box(0.5, 0.01, 0.02), mat('#8A5C35'), [0, 0.15, -0.4 + i * 0.2]);
      for (const x of [-0.22, 0.22]) for (const z of [-0.42, 0.42]) add(g, cyl(0.04, 0.04, 0.4, 8), mat('#8A5C35'), [x, 0.0, z]);
      break;
    case 'treasure':
      add(g, box(0.5, 0.28, 0.34), mat('#8A5C35'), [0, 0.14, 0]);
      add(g, new THREE.CylinderGeometry(0.17, 0.17, 0.5, 14, 1, false, 0, Math.PI), mat('#9C6B3F'), [0, 0.28, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
      for (const x of [-0.18, 0.18]) add(g, box(0.05, 0.3, 0.36), mat('#F5B400', 0.1), [x, 0.15, 0]);
      add(g, box(0.08, 0.1, 0.03), mat('#F5B400', 0.2), [0, 0.26, 0.18]);
      for (let i = 0; i < 4; i++) add(g, cyl(0.05, 0.05, 0.015, 10), mat('#FFD43B', 0.3), [0.32 + (i % 2) * 0.06, 0.01 + i * 0.015, 0.15]);
      break;
    case 'telescope':
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        add(g, cyl(0.015, 0.015, 0.5, 6), mat('#6B4A2A'), [Math.cos(a) * 0.1, 0.23, Math.sin(a) * 0.1], [1, 1, 1], [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]);
      }
      add(g, cyl(0.05, 0.08, 0.55, 12), mat('#C9A227', 0.1), [0, 0.55, 0.05], [1, 1, 1], [-1.0, 0, 0]);
      add(g, cyl(0.085, 0.085, 0.03, 12), mat('#2B2B33'), [0, 0.67, 0.27], [1, 1, 1], [-1.0, 0, 0]);
      break;
    case 'lighthouse':
      for (let i = 0; i < 4; i++) add(g, cyl(0.3 - i * 0.04, 0.32 - i * 0.04, 0.3, 16), mat(i % 2 ? '#FFFFFF' : '#E5484D'), [0, 0.15 + i * 0.3, 0]);
      add(g, cyl(0.2, 0.2, 0.06, 16), mat('#2B2B33'), [0, 1.23, 0]);
      add(g, cyl(0.14, 0.14, 0.2, 12), mat('#FFE08A', 1), [0, 1.36, 0]);
      add(g, cone(0.2, 0.22, 16), mat('#E5484D'), [0, 1.57, 0]);
      add(g, box(0.12, 0.2, 0.02), mat('#4A2E1B'), [0, 0.1, 0.31]);
      break;

    // ─── Boats (hull bottom at y=0, waterline around y=0.35) ─────────────────
    case 'rowboat':
      add(g, new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), k.matTwoSided('#9C6B3F'), [0, 0.4, 0], [0.55, 0.6, 1.1]);
      add(g, box(0.4, 0.03, 0.1), mat('#C08A55'), [0, 0.38, 0]);
      for (const s2 of [-1, 1]) add(g, box(0.03, 0.03, 0.7), mat('#C08A55'), [s2 * 0.32, 0.45, 0.1], [1, 1, 1], [0.3, s2 * 0.4, 0]);
      break;
    case 'duckboat':
      add(g, k.capsuleGeo(0.28, 0.35), mat('#FFFFFF'), [0, 0.32, 0], [1, 0.55, 1], [Math.PI / 2, 0, 0]);
      add(g, sphere(0.2, 14), mat('#FFD43B'), [0, 0.62, 0.32]);
      add(g, cone(0.07, 0.16, 10), mat('#FF8C2B'), [0, 0.6, 0.53], [1, 1, 0.6], [Math.PI / 2, 0, 0]);
      for (const x of [-0.08, 0.08]) add(g, sphere(0.025, 6), mat('#222222'), [x, 0.68, 0.48]);
      add(g, sphere(0.22, 14), mat('#FFD43B'), [0, 0.5, -0.05], [1, 0.6, 1.3]);
      break;
    case 'sailboat':
      add(g, new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), k.matTwoSided('#FFFFFF'), [0, 0.4, 0], [0.55, 0.6, 1.2]);
      add(g, box(0.42, 0.03, 0.9), mat('#C08A55'), [0, 0.39, 0]);
      add(g, cyl(0.02, 0.02, 1.1, 6), mat('#8A5C35'), [0, 0.95, 0.05]);
      add(g, cone(0.35, 0.85, 3), mat('#FFFFFF'), [0.0, 1.0, -0.12], [0.05, 1, 1], [0, 0, 0]);
      add(g, cone(0.25, 0.6, 3), mat('#3BA7F5'), [0.0, 0.85, 0.3], [0.05, 1, 1], [0, Math.PI, 0]);
      add(g, box(0.12, 0.06, 0.01), mat('#E5484D'), [0.06, 1.48, 0.05]);
      break;
    case 'yacht':
      add(g, k.capsuleGeo(0.25, 0.7), mat('#FFFFFF'), [0, 0.3, 0], [1, 0.6, 1], [Math.PI / 2, 0, 0]);
      add(g, box(0.4, 0.04, 0.95), mat('#26405E'), [0, 0.26, 0]);
      add(g, box(0.36, 0.22, 0.45), mat('#FFFFFF'), [0, 0.55, -0.08]);
      add(g, box(0.37, 0.08, 0.4), mat('#26405E', 0.2), [0, 0.58, -0.08]);
      add(g, box(0.26, 0.16, 0.25), mat('#FFFFFF'), [0, 0.74, -0.12]);
      add(g, box(0.27, 0.05, 0.2), mat('#26405E', 0.2), [0, 0.76, -0.12]);
      break;
    case 'pirateship': {
      add(g, new THREE.SphereGeometry(0.4, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), k.matTwoSided('#6B4226'), [0, 0.42, 0], [0.6, 0.65, 1.15]);
      add(g, box(0.46, 0.03, 0.9), mat('#9C6B3F'), [0, 0.4, 0]);
      add(g, box(0.48, 0.18, 0.22), mat('#6B4226'), [0, 0.5, -0.38]);
      for (const z of [-0.15, 0.25]) {
        add(g, cyl(0.02, 0.025, 0.95, 6), mat('#4A2E1B'), [0, 0.85, z]);
        add(g, box(0.5, 0.32, 0.02), mat('#F2E6D0'), [0, 0.95, z + 0.02], [1, 1, 1], [0.12, 0, 0]);
      }
      add(g, box(0.18, 0.12, 0.01), mat('#16161C'), [0.1, 1.38, 0.25]);
      add(g, sphere(0.025, 6), mat('#FFFFFF'), [0.1, 1.39, 0.26]);
      for (const s2 of [-1, 1]) for (const z of [-0.1, 0.15]) add(g, cyl(0.035, 0.035, 0.12, 8), mat('#2B2B33'), [s2 * 0.25, 0.44, z], [1, 1, 1], [0, 0, Math.PI / 2]);
      break;
    }

    case 'rainbow': {
      const colors = ['#FF4D4D', '#FF9F43', '#FFE14D', '#4CD964', '#4DA6FF', '#9B6BFF'];
      colors.forEach((c, i) => add(g, new THREE.TorusGeometry(1.0 - i * 0.06, 0.035, 6, 32, Math.PI), mat(c, 0.25)));
      for (const x of [-0.93, 0.93]) {
        add(g, sphere(0.18, 10), mat('#FFFFFF'), [x, 0.05, 0.03]);
        add(g, sphere(0.13, 10), mat('#FFFFFF'), [x + 0.16, 0.0, 0.06]);
      }
      break;
    }
  }
  return g;
}
