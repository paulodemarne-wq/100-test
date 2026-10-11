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
    add,
    group,
    materials,
    sphere: (r: number, seg = 20) => new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.7))),
    box: (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d),
    cyl: (r1: number, r2: number, h: number, seg = 20) => new THREE.CylinderGeometry(r1, r2, h, seg),
    cone: (r: number, h: number, seg = 18) => new THREE.ConeGeometry(r, h, seg),
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
