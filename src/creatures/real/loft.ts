// A smooth body swept along a curve: the base shape of every animal (snake, shark, wolf torso, legs, tails…).
import * as THREE from 'three';

export type Section = {
  /** Half width (sideways) and half height (up) of the cross-section. */
  rx: number;
  ry: number;
  /** 0 = round belly, 1 = flat belly. */
  flat?: number;
  /** Moves the section up/down (relative to the curve), e.g. a skull above the jaw line. */
  dy?: number;
};

export type Frame = { p: THREE.Vector3; t: THREE.Vector3; n: THREE.Vector3; b: THREE.Vector3 };

export type LoftOptions = {
  curve: THREE.Curve<THREE.Vector3>;
  section: (u: number) => Section;
  /** Rings along the curve and points around each ring. */
  rings?: number;
  radial?: number;
  /** Which way is "up" for the cross-sections (the belly faces the other way). */
  up?: THREE.Vector3;
  /** Closes both ends with a cap. */
  caps?: boolean;
};

/** Frames along the curve, with the normal kept as close to `up` as possible (no twisting). */
export function frames(curve: THREE.Curve<THREE.Vector3>, rings: number, up = new THREE.Vector3(0, 1, 0)): Frame[] {
  const out: Frame[] = [];
  let prevN: THREE.Vector3 | null = null;
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u).normalize();
    let n = up.clone().sub(t.clone().multiplyScalar(up.dot(t)));
    if (n.lengthSq() < 1e-4) n = prevN ? prevN.clone().sub(t.clone().multiplyScalar(prevN.dot(t))) : new THREE.Vector3(0, 0, 1);
    n.normalize();
    // Avoid sudden flips where the curve goes almost straight up.
    if (prevN && n.dot(prevN) < 0.2) {
      const pt = prevN.clone().sub(t.clone().multiplyScalar(prevN.dot(t))).normalize();
      n = pt.lerp(n, 0.35).normalize();
    }
    const b = new THREE.Vector3().crossVectors(t, n).normalize();
    out.push({ p, t, n, b });
    prevN = n;
  }
  return out;
}

export function loft(o: LoftOptions): { geometry: THREE.BufferGeometry; frames: Frame[] } {
  const rings = o.rings ?? 96;
  const radial = o.radial ?? 28;
  const fr = frames(o.curve, rings, o.up);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const s = o.section(u);
    const { p, n, b } = fr[i];
    for (let j = 0; j <= radial; j++) {
      // a = 0 on the right side, π/2 on top, 3π/2 under the belly.
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a);
      let sn = Math.sin(a);
      if (sn < 0 && s.flat) sn *= 1 - s.flat * 0.55 * (1 - Math.abs(c) ** 2);
      v.copy(p)
        .addScaledVector(b, c * s.rx)
        .addScaledVector(n, sn * s.ry + (s.dy ?? 0));
      pos.push(v.x, v.y, v.z);
      uv.push(u, j / radial);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * row + j;
      const b = a + row;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  if (o.caps !== false) {
    for (const [ring, flip] of [
      [0, true],
      [rings, false],
    ] as const) {
      const s = o.section(ring / rings);
      const center = fr[ring].p.clone().addScaledVector(fr[ring].n, s.dy ?? 0);
      const ci = pos.length / 3;
      pos.push(center.x, center.y, center.z);
      uv.push(ring / rings, 0.25);
      for (let j = 0; j < radial; j++) {
        const a = ring * row + j;
        if (flip) idx.push(ci, a, a + 1);
        else idx.push(ci, a + 1, a);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  seamNormals(g, rings, radial);
  return { geometry: g, frames: fr };
}

/** The first and last point of each ring are the same place: give them the same normal (no visible seam). */
function seamNormals(g: THREE.BufferGeometry, rings: number, radial: number) {
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const row = radial + 1;
  for (let i = 0; i <= rings; i++) {
    const a = i * row;
    const b = a + radial;
    const x = n.getX(a) + n.getX(b);
    const y = n.getY(a) + n.getY(b);
    const z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }
  n.needsUpdate = true;
}

/** Point and frame at a fraction of the curve (to attach eyes, ears, fins…). */
export function frameAt(curve: THREE.Curve<THREE.Vector3>, u: number, up = new THREE.Vector3(0, 1, 0)): Frame {
  const p = curve.getPointAt(u);
  const t = curve.getTangentAt(u).normalize();
  const n = up.clone().sub(t.clone().multiplyScalar(up.dot(t))).normalize();
  const b = new THREE.Vector3().crossVectors(t, n).normalize();
  return { p, t, n, b };
}

/** A smooth profile through (u, value) keys, eased between them. */
export function profile(keys: [number, number][]): (u: number) => number {
  return (u: number) => {
    if (u <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [u1, v1] = keys[i];
      const [u0, v0] = keys[i - 1];
      if (u <= u1) {
        const t = (u - u0) / (u1 - u0 || 1);
        const e = t * t * (3 - 2 * t);
        return v0 + (v1 - v0) * e;
      }
    }
    return keys[keys.length - 1][1];
  };
}
