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
    if (merged) out.add(new THREE.Mesh(merged, material));
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
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    for (const attr of [pos, nor]) {
      for (let i = 0; i < attr.count; i += 3) {
        const x = attr.getX(i + 1), y = attr.getY(i + 1), z = attr.getZ(i + 1);
        attr.setXYZ(i + 1, attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2));
        attr.setXYZ(i + 2, x, y, z);
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
