// The little garden behind a pet: a floating island with a house, a tree, a decoration and a ground style.
// It stays still while the pet turns. Items come from SHOP_ITEMS (kind 'garden').
import * as THREE from 'three';
import { Garden } from './species';

export type GardenScene = {
  group: THREE.Group;
  /** Sky color to clear the view with. */
  sky: string;
  update: (t: number) => void;
  dispose: () => void;
};

type V3 = [number, number, number];

/** Camera framing that shows the pet and its whole garden. */
export const GARDEN_CAMERA = { position: [0, 2.0, 6.2] as V3, target: [0, 0.75, -0.6] as V3 };

const GROUNDS: Record<string, { top: string; side: string; sky: string }> = {
  grass: { top: '#8BD46A', side: '#A9764C', sky: '#DFF3FF' },
  meadow: { top: '#9BDB6E', side: '#A9764C', sky: '#E4F7FF' },
  beach: { top: '#F2D59B', side: '#D9AE6A', sky: '#CDEBFF' },
  snow: { top: '#F4F8FF', side: '#B9C6D8', sky: '#E3ECF7' },
  clouds: { top: '#F3EEFF', side: '#FFFFFF', sky: '#E9E1FF' },
};

// Where things stand, around a pet at the origin (camera looks from +z).
const HOUSE_AT: V3 = [-1.3, 0, -1.9];
const TREE_AT: V3 = [1.35, 0, -1.75];
const DECO_AT: V3 = [1.05, 0, 0.1];

export function buildGarden(garden: Garden): GardenScene {
  const root = new THREE.Group();
  const animators: ((t: number) => void)[] = [];
  const materials = new Map<string, THREE.Material>();

  const mat = (color: string, glow = 0, opacity?: number) => {
    const key = `${color}|${glow}|${opacity}`;
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        metalness: 0.02,
        emissive: new THREE.Color(glow ? color : '#000000'),
        emissiveIntensity: glow,
        transparent: opacity !== undefined,
        opacity: opacity ?? 1,
        side: opacity !== undefined ? THREE.DoubleSide : THREE.FrontSide,
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
  const group = (parent: THREE.Object3D, pos: V3) => {
    const g = new THREE.Group();
    g.position.set(...pos);
    parent.add(g);
    return g;
  };
  const sphere = (r: number, seg = 16) => new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.7)));
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r1: number, r2: number, h: number, seg = 16) => new THREE.CylinderGeometry(r1, r2, h, seg);
  const cone = (r: number, h: number, seg = 16) => new THREE.ConeGeometry(r, h, seg);
  /** A four-sided roof, ridge facing the camera. */
  const roof = (parent: THREE.Object3D, w: number, h: number, y: number, color: string) =>
    add(parent, cone(w * 0.75, h, 4), mat(color), [0, y + h / 2, 0], [1, 1, 0.85], [0, Math.PI / 4, 0]);
  const flower = (parent: THREE.Object3D, pos: V3, color: string, s = 1) => {
    add(parent, cyl(0.012 * s, 0.012 * s, 0.14 * s, 6), mat('#4E9A3A'), [pos[0], pos[1] + 0.07 * s, pos[2]]);
    add(parent, sphere(0.045 * s, 10), mat(color), [pos[0], pos[1] + 0.15 * s, pos[2]]);
  };

  // ─── Ground ────────────────────────────────────────────────────────────────
  const groundId = garden.ground ?? 'grass';
  const look = GROUNDS[groundId] ?? GROUNDS.grass;
  const island = group(root, [0, -0.012, -0.6]);
  add(island, cyl(2.6, 2.6, 0.06, 48), mat(look.top), [0, -0.03, 0]);
  add(island, cyl(2.6, 2.1, 0.45, 48), mat(look.side), [0, -0.285, 0]);
  const rand = mulberry(groundId.length * 97 + 13);
  const scatter = (n: number, fn: (x: number, z: number, i: number) => void) => {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.9 + rand() * 1.55;
      const x = Math.cos(a) * r;
      const z = -0.6 + Math.sin(a) * r;
      fn(x, z, i);
    }
  };
  if (groundId === 'grass') {
    scatter(16, (x, z) => add(root, cone(0.035, 0.12, 5), mat('#6FBF4E'), [x, 0.05, z]));
    scatter(3, (x, z) => add(root, sphere(0.08, 8), mat('#B8B2A7'), [x, 0.02, z], [1, 0.55, 0.8]));
  } else if (groundId === 'meadow') {
    const colors = ['#FF6B9A', '#FFD23F', '#FFFFFF', '#B57BFF', '#FF8C42'];
    scatter(34, (x, z, i) => flower(root, [x, 0, z], colors[i % colors.length], 0.9));
  } else if (groundId === 'beach') {
    add(root, new THREE.TorusGeometry(2.45, 0.12, 8, 48), mat('#7FD3F5', 0.05, 0.85), [0, -0.01, -0.6], [1, 1, 0.4], [Math.PI / 2, 0, 0]);
    scatter(5, (x, z, i) => add(root, cone(0.06, 0.08, 6), mat(i % 2 ? '#FFB3C1' : '#FFF1D6'), [x, 0.03, z]));
    const ball = add(root, sphere(0.14, 16), mat('#FF5A5F'), [-0.95, 0.14, 0.55]);
    add(ball, sphere(0.142, 16), mat('#FFFFFF'), [0, 0, 0], [1, 0.35, 1]);
  } else if (groundId === 'snow') {
    scatter(6, (x, z) => add(root, sphere(0.09 + rand() * 0.06, 12), mat('#FFFFFF'), [x, 0.04, z]));
    const man = group(root, [-1.0, 0, 0.45]);
    add(man, sphere(0.2, 16), mat('#FFFFFF'), [0, 0.18, 0]);
    add(man, sphere(0.14, 16), mat('#FFFFFF'), [0, 0.47, 0]);
    add(man, cone(0.025, 0.12, 8), mat('#FF8C2B'), [0, 0.48, 0.15], [1, 1, 1], [Math.PI / 2, 0, 0]);
    add(man, sphere(0.018, 6), mat('#222222'), [-0.05, 0.52, 0.12]);
    add(man, sphere(0.018, 6), mat('#222222'), [0.05, 0.52, 0.12]);
    const flakes: THREE.Mesh[] = [];
    for (let i = 0; i < 18; i++) flakes.push(add(root, sphere(0.022, 6), mat('#FFFFFF', 0.4), [rand() * 4 - 2, rand() * 2.4, -2 + rand() * 2.6]));
    animators.push((t) =>
      flakes.forEach((f, i) => {
        f.position.y = 2.4 - ((t * 0.25 + i * 0.37) % 2.4);
        f.position.x += Math.sin(t + i) * 0.0015;
      }),
    );
  } else if (groundId === 'clouds') {
    const under = group(root, [0, -0.35, -0.6]);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      add(under, sphere(0.55, 16), mat('#FFFFFF'), [Math.cos(a) * 2.1, -0.1 + (i % 2) * 0.1, Math.sin(a) * 2.1]);
    }
    animators.push((t) => {
      root.position.y = Math.sin(t * 0.8) * 0.03;
    });
    scatter(8, (x, z) => add(root, sphere(0.03, 8), mat('#FFD54A', 0.6), [x, 0.05, z]));
  }

  // ─── House ─────────────────────────────────────────────────────────────────
  const house = group(root, HOUSE_AT);
  house.rotation.y = 0.35;
  switch (garden.house) {
    case 'doghouse':
      add(house, box(0.6, 0.45, 0.55), mat('#E0564B'), [0, 0.225, 0]);
      roof(house, 0.75, 0.35, 0.45, '#8C3B33');
      add(house, cyl(0.13, 0.13, 0.02, 20), mat('#3A2622'), [0, 0.18, 0.28], [1, 1.3, 1], [Math.PI / 2, 0, 0]);
      add(house, box(0.2, 0.05, 0.05), mat('#FFFFFF'), [0, 0.38, 0.29]);
      add(house, sphere(0.06, 10), mat('#F2E2C4'), [0.4, 0.04, 0.3], [1.6, 0.5, 0.8]);
      break;
    case 'cabin':
      for (let i = 0; i < 5; i++) add(house, cyl(0.07, 0.07, 1.0, 10), mat(i % 2 ? '#9C6B3F' : '#8A5C35'), [0, 0.07 + i * 0.13, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
      add(house, box(0.95, 0.66, 0.75), mat('#9C6B3F'), [0, 0.33, -0.05]);
      roof(house, 1.2, 0.5, 0.66, '#5E3B23');
      add(house, box(0.22, 0.38, 0.03), mat('#4A2E1B'), [-0.2, 0.19, 0.34]);
      add(house, box(0.2, 0.18, 0.03), mat('#FFE08A', 0.5), [0.22, 0.4, 0.34]);
      break;
    case 'cottage':
      add(house, box(1.1, 0.8, 0.85), mat('#FFF7EC'), [0, 0.4, 0]);
      roof(house, 1.4, 0.6, 0.8, '#E2574C');
      add(house, box(0.14, 0.4, 0.14), mat('#B0574A'), [0.32, 1.25, -0.1]);
      add(house, box(0.24, 0.42, 0.03), mat('#6B4BA8'), [0, 0.21, 0.44]);
      add(house, box(0.22, 0.2, 0.03), mat('#8FD3FF', 0.35), [-0.33, 0.5, 0.44]);
      add(house, box(0.22, 0.2, 0.03), mat('#8FD3FF', 0.35), [0.33, 0.5, 0.44]);
      for (let i = 0; i < 4; i++) add(house, cyl(0.09, 0.09, 0.02, 12), mat('#C8C2B8'), [0.05 * (i % 2), 0.01, 0.6 + i * 0.22]);
      flower(house, [-0.45, 0, 0.5], '#FF6B9A');
      flower(house, [0.45, 0, 0.5], '#FFD23F');
      break;
    case 'mushroom': {
      add(house, cyl(0.36, 0.42, 0.75, 24), mat('#FFF1DC'), [0, 0.375, 0]);
      const cap = add(house, new THREE.SphereGeometry(0.72, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat('#E8413A'), [0, 0.7, 0], [1, 0.8, 1]);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        add(cap, sphere(0.09, 10), mat('#FFFFFF'), [Math.cos(a) * 0.5, 0.42, Math.sin(a) * 0.5], [1, 0.4, 1]);
      }
      add(cap, sphere(0.1, 10), mat('#FFFFFF'), [0, 0.7, 0], [1, 0.4, 1]);
      add(house, cyl(0.12, 0.12, 0.02, 20), mat('#7A4A2A'), [0, 0.2, 0.39], [1, 1.6, 1], [Math.PI / 2, 0, 0]);
      add(house, cyl(0.07, 0.07, 0.02, 16), mat('#FFE08A', 0.6), [0.2, 0.5, 0.36], [1, 1, 1], [Math.PI / 2, 0, 0]);
      break;
    }
    case 'castle': {
      add(house, box(1.0, 0.8, 0.7), mat('#C9C7D6'), [0, 0.4, 0]);
      for (let i = 0; i < 4; i++) add(house, box(0.14, 0.14, 0.14), mat('#B4B1C4'), [-0.38 + i * 0.25, 0.87, 0.28]);
      for (const x of [-0.6, 0.6]) {
        add(house, cyl(0.22, 0.24, 1.2, 18), mat('#B4B1C4'), [x, 0.6, 0]);
        add(house, cone(0.3, 0.5, 18), mat('#5B6CFF'), [x, 1.45, 0]);
        add(house, box(0.08, 0.16, 0.02), mat('#FFE08A', 0.5), [x, 0.85, 0.23]);
      }
      add(house, cyl(0.008, 0.008, 0.35, 6), mat('#555555'), [0.6, 1.85, 0]);
      const flag = add(house, box(0.2, 0.12, 0.01), mat('#FF2D55'), [0.7, 1.95, 0]);
      animators.push((t) => {
        flag.rotation.y = Math.sin(t * 3) * 0.3;
      });
      add(house, new THREE.CylinderGeometry(0.17, 0.17, 0.03, 20, 1, false, 0, Math.PI), mat('#4A2E1B'), [0, 0.3, 0.36], [1, 1, 1], [Math.PI / 2, 0, Math.PI / 2]);
      add(house, box(0.34, 0.3, 0.03), mat('#4A2E1B'), [0, 0.15, 0.36]);
      break;
    }
  }

  // ─── Tree ──────────────────────────────────────────────────────────────────
  const tree = group(root, TREE_AT);
  const trunk = (h: number) => add(tree, cyl(0.07, 0.11, h, 10), mat('#8A5C35'), [0, h / 2, 0]);
  switch (garden.tree) {
    case 'bush':
      add(tree, sphere(0.32, 16), mat('#5DBB4C'), [0, 0.25, 0]);
      add(tree, sphere(0.25, 16), mat('#6CCB5A'), [-0.32, 0.18, 0.15]);
      add(tree, sphere(0.22, 16), mat('#4FA83F'), [0.3, 0.16, 0.12]);
      break;
    case 'apple': {
      trunk(0.8);
      const crown = group(tree, [0, 1.05, 0]);
      add(crown, sphere(0.45, 18), mat('#4FAE48'));
      add(crown, sphere(0.32, 16), mat('#5DBB4C'), [-0.35, -0.12, 0.1]);
      add(crown, sphere(0.32, 16), mat('#5DBB4C'), [0.35, -0.1, -0.05]);
      for (let i = 0; i < 7; i++) {
        const a = i * 2.1;
        add(crown, sphere(0.055, 10), mat('#E8322E'), [Math.cos(a) * 0.42, -0.15 + (i % 3) * 0.15, Math.sin(a) * 0.3 + 0.18]);
      }
      add(tree, sphere(0.055, 10), mat('#E8322E'), [0.3, 0.05, 0.25]);
      break;
    }
    case 'sakura': {
      trunk(0.75);
      add(tree, cyl(0.04, 0.06, 0.45, 8), mat('#7A4E31'), [0.18, 0.85, 0], [1, 1, 1], [0, 0, -0.6]);
      const crown = group(tree, [0, 1.05, 0]);
      const pinks = ['#FFB7D0', '#FFC9DC', '#FF9EC2'];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        add(crown, sphere(0.26 + (i % 2) * 0.06, 14), mat(pinks[i % 3]), [Math.cos(a) * 0.35, Math.sin(i) * 0.12, Math.sin(a) * 0.25]);
      }
      add(crown, sphere(0.34, 14), mat('#FFC9DC'), [0, 0.18, 0]);
      const petals: THREE.Mesh[] = [];
      for (let i = 0; i < 10; i++) petals.push(add(tree, sphere(0.028, 6), mat('#FFB7D0'), [0, 0, 0], [1, 0.4, 1]));
      animators.push((t) =>
        petals.forEach((p, i) => {
          const k = (t * 0.22 + i * 0.1) % 1;
          p.position.set(Math.sin(i * 1.7 + t) * 0.5 - k * 0.6, 1.1 - k * 1.1, Math.cos(i * 2.3) * 0.4 + k * 0.3);
          p.rotation.z = t * 2 + i;
        }),
      );
      break;
    }
    case 'crystal': {
      const shards = group(tree, [0, 0, 0]);
      const colors = ['#7FE7FF', '#B69CFF', '#9FF5E1'];
      add(shards, cone(0.2, 1.4, 6), mat(colors[0], 0.45, 0.85), [0, 0.7, 0]);
      add(shards, cone(0.13, 0.9, 6), mat(colors[1], 0.45, 0.85), [-0.25, 0.42, 0.08], [1, 1, 1], [0, 0, 0.35]);
      add(shards, cone(0.12, 0.8, 6), mat(colors[2], 0.45, 0.85), [0.24, 0.38, -0.05], [1, 1, 1], [0, 0, -0.3]);
      add(shards, cone(0.09, 0.5, 6), mat(colors[1], 0.45, 0.85), [0.1, 0.25, 0.22], [1, 1, 1], [0.4, 0, -0.1]);
      const sparkle = add(tree, sphere(0.06, 10), mat('#FFFFFF', 1), [0, 1.55, 0]);
      animators.push((t) => {
        shards.rotation.y = t * 0.3;
        sparkle.scale.setScalar(0.7 + Math.sin(t * 3) * 0.3);
      });
      break;
    }
  }

  // ─── Decoration ────────────────────────────────────────────────────────────
  const deco = group(root, DECO_AT);
  switch (garden.deco) {
    case 'flowerbed': {
      add(deco, box(0.6, 0.08, 0.32), mat('#7A4E31'), [0, 0.04, 0]);
      const colors = ['#FF6B9A', '#FFD23F', '#B57BFF', '#FF8C42', '#FFFFFF'];
      for (let i = 0; i < 8; i++) flower(deco, [-0.24 + (i % 4) * 0.16, 0.08, -0.08 + Math.floor(i / 4) * 0.16], colors[i % 5]);
      break;
    }
    case 'lamp': {
      add(deco, cyl(0.025, 0.035, 0.9, 10), mat('#3D3D4A'), [0, 0.45, 0]);
      add(deco, cyl(0.08, 0.1, 0.04, 12), mat('#3D3D4A'), [0, 0.02, 0]);
      const light = add(deco, sphere(0.09, 14), mat('#FFE08A', 0.9), [0, 0.95, 0]);
      add(deco, cone(0.12, 0.1, 12), mat('#3D3D4A'), [0, 1.07, 0]);
      animators.push((t) => {
        (light.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8 + Math.sin(t * 2) * 0.15;
      });
      break;
    }
    case 'pond': {
      add(deco, cyl(0.42, 0.42, 0.02, 28), mat('#5CC4F2', 0.1), [0, 0.012, 0], [1, 1, 0.75]);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        add(deco, sphere(0.07, 8), mat('#A9A39A'), [Math.cos(a) * 0.45, 0.03, Math.sin(a) * 0.34], [1, 0.6, 1]);
      }
      const pad = add(deco, cyl(0.09, 0.09, 0.01, 14), mat('#4FAE48'), [0.1, 0.03, 0.05]);
      flower(deco, [-0.12, 0.0, -0.08], '#FFB7D0', 0.6);
      animators.push((t) => {
        pad.position.x = 0.1 + Math.sin(t * 0.7) * 0.05;
      });
      break;
    }
    case 'fountain': {
      add(deco, cyl(0.4, 0.42, 0.16, 24), mat('#D8D4CC'), [0, 0.08, 0]);
      add(deco, cyl(0.34, 0.34, 0.02, 24), mat('#5CC4F2', 0.15), [0, 0.15, 0]);
      add(deco, cyl(0.06, 0.08, 0.45, 12), mat('#D8D4CC'), [0, 0.38, 0]);
      add(deco, cyl(0.18, 0.12, 0.06, 16), mat('#D8D4CC'), [0, 0.6, 0]);
      const drops: THREE.Mesh[] = [];
      for (let i = 0; i < 6; i++) drops.push(add(deco, sphere(0.03, 8), mat('#8FD9FF', 0.3), [0, 0.7, 0]));
      animators.push((t) =>
        drops.forEach((d, i) => {
          const k = (t * 0.9 + i / 6) % 1;
          const a = (i / 6) * Math.PI * 2;
          d.position.set(Math.cos(a) * 0.25 * k, 0.7 + 0.25 * k - 0.6 * k * k, Math.sin(a) * 0.25 * k);
        }),
      );
      break;
    }
    case 'rainbow': {
      // Big enough to arch over the whole garden, from behind.
      const arch = group(root, [0, 0, -2.6]);
      const colors = ['#FF4D4D', '#FF9F43', '#FFE14D', '#4CD964', '#4DA6FF', '#9B6BFF'];
      colors.forEach((c, i) =>
        add(arch, new THREE.TorusGeometry(2.1 - i * 0.09, 0.05, 8, 48, Math.PI), mat(c, 0.25)),
      );
      for (const x of [-1.9, 1.9]) {
        add(arch, sphere(0.25, 14), mat('#FFFFFF'), [x, 0.05, 0.05]);
        add(arch, sphere(0.2, 14), mat('#FFFFFF'), [x + 0.22, 0, 0.1]);
        add(arch, sphere(0.18, 14), mat('#FFFFFF'), [x - 0.2, -0.02, 0.1]);
      }
      break;
    }
  }

  return {
    group: root,
    sky: look.sky,
    update: (t) => animators.forEach((a) => a(t)),
    dispose: () => {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      materials.forEach((m) => m.dispose());
    },
  };
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
