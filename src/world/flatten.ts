import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merges every mesh under `root` into one mesh per material, in root's local space.
 * Hundreds of small shapes become a handful of draw calls (much faster on phones).
 * Animations inside `root` are lost; move the returned group as a whole instead.
 */
export function flatten(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || !o.visible) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', o.geometry.getAttribute('position'));
    g.setAttribute('normal', o.geometry.getAttribute('normal'));
    // Textured (realistic) objects need their UVs; vertex-colored ones (leaves) their colors.
    const count = o.geometry.getAttribute('position').count;
    g.setAttribute('uv', o.geometry.getAttribute('uv') ?? new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    if ((o.material as THREE.MeshStandardMaterial).vertexColors)
      g.setAttribute('color', o.geometry.getAttribute('color') ?? new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3));
    if (o.geometry.index) g.setIndex(o.geometry.index);
    const m = new THREE.Matrix4().multiplyMatrices(toLocal, o.matrixWorld);
    const placed = g.clone().applyMatrix4(m);
    // A mirrored shape needs its triangles flipped to stay lit from the outside.
    if (m.determinant() < 0) flipWinding(placed);
    const list = byMaterial.get(o.material) ?? [];
    list.push(placed);
    byMaterial.set(o.material, list);
  });
  const out = new THREE.Group();
  byMaterial.forEach((list, material) => {
    const anyLoose = list.some((g) => !g.index);
    const parts = anyLoose ? list.map((g) => (g.index ? g.toNonIndexed() : g)) : list;
    const merged = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    if (merged) {
      const mesh = new THREE.Mesh(merged, material);
      // Realistic lighting: everything casts and receives shadows (except see-through things).
      mesh.castShadow = !(material as THREE.Material).transparent;
      mesh.receiveShadow = true;
      out.add(mesh);
    }
  });
  return out;
}

function flipWinding(g: THREE.BufferGeometry) {
  const index = g.index;
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b);
    }
  } else {
    const attrs = ['position', 'normal', 'uv', 'color'].map((n) => g.getAttribute(n)).filter(Boolean);
    for (const attr of attrs) {
      for (let i = 0; i < attr.count; i += 3) {
        for (let c = 0; c < attr.itemSize; c++) {
          const a = attr.getComponent(i + 1, c);
          attr.setComponent(i + 1, c, attr.getComponent(i + 2, c));
          attr.setComponent(i + 2, c, a);
        }
      }
    }
  }
}

/** Frees the geometries of a flattened group (materials are shared and freed elsewhere). */
export function disposeGeometries(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}
