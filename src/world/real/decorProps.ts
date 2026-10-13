// Realistic island objects (Props). Each fits one 1×1 cell, centered on the origin, base at y = 0, facing +z.
// Boats: hull bottom at y = 0, bow toward +z. In the scene the water surface sits about y = 0.05 of the model
// (the boat group is lowered by baseY, then scaled by DECOR_SCALE), so hulls are drawn with a shallow draft.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { loft } from '../../creatures/real/loft';
import { noise2, rng } from '../../creatures/real/noise';
import { MaterialName, MatOptions, pbr } from './materials';

type V3 = [number, number, number];
const v3 = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);
const DS = THREE.DoubleSide;
const PI = Math.PI;
const mat = (n: MaterialName, o?: MatOptions) => pbr(n, o);

// ─── Small geometry helpers ─────────────────────────────────────────────────

function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scl: V3 = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.set(rot[0], rot[1], rot[2]);
  mesh.scale.set(scl[0], scl[1], scl[2]);
  parent.add(mesh);
  return mesh;
}

function sub(parent: THREE.Object3D, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]) {
  const g = new THREE.Group();
  g.position.set(pos[0], pos[1], pos[2]);
  g.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(g);
  return g;
}

/** Grain runs along x, and each face shows a single board of the plank texture (a different one per seed). */
function grainX(geo: THREE.BufferGeometry, seed: number) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const r = rng(seed * 7 + 3);
  const row = Math.floor(r() * 4);
  const off = r() * 3;
  const sy = bb.max.y - bb.min.y || 1;
  const sz = bb.max.z - bb.min.z || 1;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const fy = (pos.getY(i) - bb.min.y) / sy;
    const fz = (pos.getZ(i) - bb.min.z) / sz;
    const across = ny > nz && ny > nx ? fz : fy;
    const u = nx > ny && nx > nz ? off + fz * 0.08 : off + pos.getX(i) * 1.3;
    uv.setXY(i, u, (row + 0.08 + across * 0.84) / 4);
  }
  uv.needsUpdate = true;
  return geo;
}

/** A board / beam with slightly rounded edges, long axis along x. */
function beam(len: number, h: number, d: number, seed = 1, r = 0.004) {
  const rr = Math.min(r, h / 2.2, d / 2.2);
  return grainX(new RoundedBoxGeometry(len, h, d, 1, rr), seed);
}

/** A round log / pole along x (wood grain or bark ridges along its length). */
function logX(len: number, r1: number, r2 = r1, seg = 10, seed = 1, around = 0.84) {
  const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1);
  g.rotateZ(-PI / 2);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const r = rng(seed * 13 + 5);
  const row = Math.floor(r() * 4);
  const off = r() * 3;
  for (let i = 0; i < pos.count; i++) {
    const u0 = uv.getX(i);
    const isCap = Math.abs(Math.abs(pos.getX(i)) - len / 2) < 1e-6 && uv.getY(i) !== 0 && uv.getY(i) !== 1 ? false : false;
    void isCap;
    uv.setXY(i, off + pos.getX(i) * 1.3, around < 1 ? (row + 0.08 + u0 * around) / 4 : u0 * around);
  }
  uv.needsUpdate = true;
  return g;
}

/** Places a geometry built along x between two points; `up` decides which way its height faces. */
function between(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, a: V3, b: V3, up: V3 = [0, 1, 0]) {
  const A = v3(a);
  const B = v3(b);
  const X = B.clone().sub(A).normalize();
  let U = v3(up);
  if (Math.abs(U.dot(X)) > 0.98) U = new THREE.Vector3(0, 0, 1);
  const Z = new THREE.Vector3().crossVectors(X, U).normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X).normalize();
  const mesh = new THREE.Mesh(geo, m);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  mesh.position.copy(A).add(B).multiplyScalar(0.5);
  parent.add(mesh);
  return mesh;
}
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** A wooden beam between two points. */
function beamAB(parent: THREE.Object3D, a: V3, b: V3, h: number, d: number, m: THREE.Material, seed = 1, up: V3 = [0, 1, 0]) {
  return between(parent, beam(dist(a, b), h, d, seed), m, a, b, up);
}
/** A round pole (wood grain) between two points. */
function poleAB(parent: THREE.Object3D, a: V3, b: V3, r: number, m: THREE.Material, seed = 1, seg = 10, r2 = r) {
  return between(parent, logX(dist(a, b), r, r2, seg, seed), m, a, b);
}
/** A plain rod (metal, rope) between two points. */
function rodAB(parent: THREE.Object3D, a: V3, b: V3, r: number, m: THREE.Material, seg = 6) {
  const g = new THREE.CylinderGeometry(r, r, dist(a, b), seg, 1);
  g.rotateZ(-PI / 2);
  return between(parent, g, m, a, b);
}

/** A tube swept through points (ropes, bent iron, rails). */
function tube(pts: V3[], r: number | [number, number], rings = 16, radial = 6, caps = true) {
  const curve = new THREE.CatmullRomCurve3(pts.map(v3));
  const [rx, ry] = typeof r === 'number' ? [r, r] : r;
  return loft({ curve, section: () => ({ rx, ry }), rings, radial, caps }).geometry;
}

/** A sagging rope between two points. */
function sagPts(a: V3, b: V3, sag: number, n = 8): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  return out;
}

/** A surface f(u, v) on a grid, its front facing roughly `want`. */
function grid(nu: number, nv: number, f: (u: number, v: number) => V3, want: V3, uvf?: (u: number, v: number) => [number, number]) {
  const g = new THREE.PlaneGeometry(1, 1, nu, nv);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    const p = f(u, v);
    pos.setXYZ(i, p[0], p[1], p[2]);
    if (uvf) {
      const [a, b] = uvf(u, v);
      uv.setXY(i, a, b);
    }
  }
  g.computeVertexNormals();
  const nor = g.getAttribute('normal');
  let s = 0;
  for (let i = 0; i < nor.count; i++) s += nor.getX(i) * want[0] + nor.getY(i) * want[1] + nor.getZ(i) * want[2];
  if (s < 0) {
    const idx = g.index!;
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** A cloth panel through 4 corners (p00 → p10 along u, p00 → p01 along v) that bellies out along `belly`. */
function cloth(p00: V3, p10: V3, p01: V3, p11: V3, belly: V3, n = 8, m = 8) {
  return grid(
    n,
    m,
    (u, v) => {
      const b = Math.sin(PI * u) * Math.sin(PI * Math.min(1, v * 1.05)) ;
      const out: V3 = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        const a = p00[k] + (p10[k] - p00[k]) * u;
        const c = p01[k] + (p11[k] - p01[k]) * u;
        out[k] = a + (c - a) * v + belly[k] * b;
      }
      return out;
    },
    belly,
    (u, v) => [u * 2, v * 2],
  );
}

/** A lumpy rock. */
function rockGeo(r: number, seed: number, flat = 0.7, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = noise2(x * 9 / r * 0.1 + seed * 3.1, z * 9 / r * 0.1 + y * 5 / r * 0.1, seed);
    const k = 0.78 + n * 0.45;
    pos.setXYZ(i, x * k, Math.max(y * k * flat, -r * 0.25), z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A small round bolt head (or nail) on a face looking along `dir`. */
function bolt(parent: THREE.Object3D, p: V3, dir: 'x' | 'y' | 'z', m: THREE.Material, r = 0.007) {
  const g = new THREE.CylinderGeometry(r, r * 1.1, 0.004, 6);
  const rot: V3 = dir === 'x' ? [0, 0, PI / 2] : dir === 'z' ? [PI / 2, 0, 0] : [0, 0, 0];
  put(parent, g, m, p, rot);
}

// ─── Boat hulls ─────────────────────────────────────────────────────────────

type Hull = {
  L: number;
  B: number;
  D: number;
  /** Half-width of the transom (stern) as a fraction of the beam; 0 = pointed. */
  stern: number;
  /** Rise of the gunwale at the stern and the bow. */
  sheer: [number, number];
  /** Rise of the keel at the stern and the bow (fraction of D). */
  rise: [number, number];
  /** Section shape: e < 1 fuller topsides, k < 1 flatter / harder bilge. */
  e: number;
  k: number;
  thick: number;
};

const hw = (h: Hull, t: number) => {
  const m = 0.45;
  if (t >= m) {
    const q = (t - m) / (1 - m);
    return (h.B / 2) * Math.pow(Math.max(0, 1 - q ** 2.2), 0.72);
  }
  const q = (m - t) / m;
  return (h.B / 2) * (h.stern + (1 - h.stern) * Math.pow(Math.max(0, 1 - q ** 2.4), 0.6));
};
const htop = (h: Hull, t: number) => h.D + (t > 0.5 ? h.sheer[1] * ((t - 0.5) * 2) ** 2 : h.sheer[0] * ((0.5 - t) * 2) ** 2);
const hbot = (h: Hull, t: number) =>
  t > 0.55 ? h.rise[1] * h.D * ((t - 0.55) / 0.45) ** 2 : t < 0.25 ? h.rise[0] * h.D * ((0.25 - t) / 0.25) ** 2 : 0;
const hz = (h: Hull, t: number) => -h.L / 2 + t * h.L;

function hullPt(h: Hull, t: number, a: number, side: number, inset: number): V3 {
  const w = Math.max(0, hw(h, t) - inset);
  const T = htop(h, t);
  const Bt = Math.min(T - 0.002, hbot(h, t) + inset);
  return [side * w * Math.pow(Math.max(0, Math.cos(a)), h.e), T - (T - Bt) * Math.pow(Math.sin(a), h.k), hz(h, t)];
}
/** Angle of the section where it crosses height y. */
function hullA(h: Hull, t: number, y: number, inset: number) {
  const T = htop(h, t);
  const Bt = Math.min(T - 0.002, hbot(h, t) + inset);
  const d = Math.min(1, Math.max(0, (T - y) / (T - Bt)));
  return Math.asin(Math.pow(d, 1 / h.k));
}
/** Half width of the hull (inside when inset > 0) at height y. */
function hullX(h: Hull, t: number, y: number, inset = 0) {
  return hullPt(h, t, hullA(h, t, y, inset), 1, inset)[0];
}

/** The hull skin between two heights (outer, or the inside face with `inner`). */
function hullSkin(h: Hull, yLo: number, yHi: number, inner = false, rings = 26, radial = 8, uvs: [number, number] = [1.6, 1]) {
  const inset = inner ? h.thick : 0;
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [1, -1]) {
    parts.push(
      grid(
        radial,
        rings,
        (u, v) => {
          const aA = hullA(h, v, yHi, inset);
          const aB = hullA(h, v, yLo, inset);
          return hullPt(h, v, aA + (aB - aA) * u, side, inset);
        },
        inner ? [-side, 1, 0] : [side, -0.4, 0],
        (u, v) => {
          const aA = hullA(h, v, yHi, inset);
          const aB = hullA(h, v, yLo, inset);
          return [v * h.L * uvs[0], ((aA + (aB - aA) * u) / (PI / 2)) * uvs[1]];
        },
      ),
    );
  }
  return merge(parts);
}

function merge(parts: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const g of parts) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const t = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
    }
    const ix = g.index;
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(i + base);
    base += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

/** The flat transom board closing the stern. */
function transom(h: Hull, uvScale = 4) {
  const sh = new THREE.Shape();
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const p = hullPt(h, 0, (i / n) * (PI / 2), 1, 0);
    if (i === 0) sh.moveTo(p[0], p[1]);
    else sh.lineTo(p[0], p[1]);
  }
  for (let i = n; i >= 0; i--) {
    const p = hullPt(h, 0, (i / n) * (PI / 2), -1, 0);
    sh.lineTo(p[0], p[1]);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: h.thick, bevelEnabled: false, curveSegments: 2 });
  g.translate(0, 0, hz(h, 0));
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
  return g;
}

/** A deck (or floor) at a given drop below the gunwale (or at a fixed height), from t0 to t1. */
function deck(h: Hull, t0: number, t1: number, opts: { drop?: number; y?: number; camber?: number; inset?: number; rings?: number } = {}) {
  const drop = opts.drop ?? 0.01;
  const inset = opts.inset ?? h.thick * 0.5;
  return grid(
    4,
    opts.rings ?? 16,
    (u, v) => {
      const t = t0 + (t1 - t0) * v;
      const y = opts.y ?? htop(h, t) - drop;
      const w = hullX(h, t, y, inset);
      const x = (u - 0.5) * 2 * w;
      return [x, y + (opts.camber ?? 0.006) * (1 - (2 * u - 1) ** 2), hz(h, t)];
    },
    [0, 1, 0],
    (u, v) => {
      const t = t0 + (t1 - t0) * v;
      const y = opts.y ?? htop(h, t) - drop;
      return [hz(h, t) * 1.2, (u - 0.5) * 2 * hullX(h, t, y, inset) * 7];
    },
  );
}

/** The capping rail along the top of both sides (and across the transom). */
function gunwale(parent: THREE.Object3D, h: Hull, m: THREE.Material, size: [number, number] = [0.012, 0.008], t0 = 0) {
  for (const side of [1, -1]) {
    const pts: V3[] = [];
    for (let i = 0; i <= 18; i++) {
      const t = t0 + ((1 - t0) * i) / 18;
      pts.push([side * Math.max(0, hw(h, t) - h.thick * 0.4), htop(h, t) + size[1] * 0.5, hz(h, t)]);
    }
    put(parent, tube(pts, [size[0], size[1]], 30, 4), m);
  }
  if (h.stern > 0 && t0 === 0) {
    const w = hw(h, 0) - h.thick * 0.4;
    rodAB(parent, [-w, htop(h, 0) + size[1] * 0.5, hz(h, 0) + h.thick / 2], [w, htop(h, 0) + size[1] * 0.5, hz(h, 0) + h.thick / 2], size[1] * 1.1, m, 6);
  }
}

/** Keel along the bottom and up the stem. */
function keel(parent: THREE.Object3D, h: Hull, m: THREE.Material, r: [number, number] = [0.006, 0.008]) {
  const pts: V3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = 0.02 + (0.97 * i) / 12;
    pts.push([0, hbot(h, t) - r[1] * 0.4, hz(h, t)]);
  }
  pts.push([0, htop(h, 1) - 0.01, hz(h, 1) + 0.008]);
  put(parent, tube(pts, r, 30, 4), m);
}

/** Planked hull: outer bands (lowest first: [top height, material]), inner face, transom. */
function hull(parent: THREE.Object3D, h: Hull, bands: [number, THREE.Material][], inner: THREE.Material | null, transomMat?: THREE.Material, rings = 26, radial = 8, uvs: [number, number] = [1.6, 1]) {
  let lo = -1;
  for (const [hi, m] of bands) {
    put(parent, hullSkin(h, lo, hi, false, rings, Math.max(3, Math.round(radial * 0.6)), uvs), m);
    lo = hi;
  }
  if (inner) put(parent, hullSkin(h, -1, 9, true, rings, radial, uvs), inner);
  if (h.stern > 0) put(parent, transom(h), transomMat ?? bands[bands.length - 1][1]);
}

// ─── Objects ────────────────────────────────────────────────────────────────

function fence() {
  const g = new THREE.Group();
  const post = mat('wood', { color: '#B9A994' });
  const rail = mat('wood', { color: '#CDBDA6' });
  const iron = mat('iron');
  const xs = [-0.43, 0, 0.43];
  xs.forEach((x, i) => {
    const h = 0.4 + (i - 1) * 0.01;
    put(g, beam(h, 0.066, 0.066, 10 + i), post, [x, h / 2, 0], [0, 0, PI / 2]);
    put(g, new THREE.ConeGeometry(0.047, 0.035, 4), post, [x, h + 0.0175, 0], [0, PI / 4, 0]);
  });
  [0.14, 0.29].forEach((y, j) => {
    put(g, beam(1.0, 0.07, 0.026, 20 + j), rail, [0, y, 0.047], [0, 0, (j - 0.5) * 0.012]);
    for (const x of xs) {
      bolt(g, [x - 0.012, y + 0.015, 0.061], 'z', iron, 0.005);
      bolt(g, [x + 0.012, y - 0.015, 0.061], 'z', iron, 0.005);
    }
  });
  // A few blades of grass at the foot of the posts.
  const grass = mat('leaves', { color: '#7A9A4A' });
  for (const x of xs) put(g, new THREE.ConeGeometry(0.05, 0.05, 6, 1, true), grass, [x, 0.02, 0], [0, 0, 0], [1, 1, 1]);
  return g;
}

function bench() {
  const g = new THREE.Group();
  const wood = mat('wood', { color: '#C99A6A' });
  const iron = mat('metal', { color: '#2A2E2B' });
  const boltM = mat('iron');
  // Seat slats.
  [0.105, 0.035, -0.035, -0.105].forEach((z, i) => {
    put(g, beam(0.84, 0.024, 0.062, 30 + i), wood, [0, 0.238, z]);
    for (const x of [-0.34, 0.34]) bolt(g, [x, 0.251, z], 'y', boltM, 0.006);
  });
  // Back slats, leaning back.
  for (let i = 0; i < 3; i++) {
    const y = 0.32 + i * 0.075;
    const z = -0.135 - i * 0.022;
    put(g, beam(0.84, 0.058, 0.022, 40 + i), wood, [0, y, z], [-0.28, 0, 0]);
    for (const x of [-0.34, 0.34]) bolt(g, [x, y, z + 0.012], 'z', boltM, 0.006);
  }
  // Cast-iron ends: front leg, rear leg + back support, seat bracket, curled armrest.
  for (const x of [-0.34, 0.34]) {
    put(g, tube([[x, 0, 0.125], [x, 0.12, 0.118], [x, 0.226, 0.115]], [0.013, 0.018], 6, 6), iron);
    put(g, tube([[x, 0, -0.15], [x, 0.11, -0.13], [x, 0.226, -0.125], [x, 0.36, -0.155], [x, 0.5, -0.19], [x, 0.53, -0.2]], [0.013, 0.018], 18, 6), iron);
    put(g, tube([[x, 0.218, 0.14], [x, 0.214, 0], [x, 0.218, -0.135]], [0.012, 0.012], 6, 4), iron);
    put(g, tube([[x, 0.226, 0.118], [x, 0.3, 0.135], [x, 0.345, 0.12], [x, 0.36, 0.06], [x, 0.36, -0.06], [x, 0.37, -0.15]], [0.014, 0.011], 18, 6), iron);
    put(g, new THREE.TorusGeometry(0.018, 0.007, 5, 10), iron, [x, 0.33, 0.145], [0, PI / 2, 0]);
    for (const z of [0.125, -0.15]) put(g, new THREE.CylinderGeometry(0.02, 0.024, 0.012, 8), iron, [x, 0.006, z]);
  }
  return g;
}

function lamp() {
  const g = new THREE.Group();
  const iron = mat('metal', { color: '#263029' });
  const glass = mat('glass', { color: '#FFE3A6', glow: 0.9, opacity: 0.55 });
  const bulb = mat('glass', { color: '#FFF4D6', glow: 3, opacity: 0.95 });
  const lathe = (pts: [number, number][], seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  // Fluted base.
  put(g, lathe([[0.001, 0], [0.105, 0], [0.105, 0.025], [0.09, 0.035], [0.085, 0.06], [0.065, 0.085], [0.055, 0.15], [0.05, 0.2], [0.058, 0.215], [0.04, 0.235], [0.03, 0.26], [0.001, 0.26]]), iron);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    put(g, new THREE.CylinderGeometry(0.006, 0.009, 0.11, 4), iron, [Math.cos(a) * 0.056, 0.145, Math.sin(a) * 0.056], [0, 0, 0]);
  }
  // Pole with collars.
  put(g, new THREE.CylinderGeometry(0.017, 0.022, 0.68, 12), iron, [0, 0.6, 0]);
  for (const y of [0.45, 0.82]) put(g, lathe([[0.001, -0.012], [0.026, -0.01], [0.03, 0], [0.026, 0.01], [0.001, 0.012]], 12), iron, [0, y, 0]);
  // Ladder bar.
  rodAB(g, [-0.12, 0.86, 0], [0.12, 0.86, 0], 0.008, iron);
  for (const x of [-0.12, 0.12]) put(g, new THREE.SphereGeometry(0.014, 8, 6), iron, [x, 0.86, 0]);
  for (const s of [-1, 1]) put(g, tube([[s * 0.1, 0.86, 0], [s * 0.05, 0.89, 0], [s * 0.018, 0.92, 0]], 0.005, 6, 4), iron);
  // Lantern head.
  put(g, lathe([[0.001, 0.92], [0.04, 0.92], [0.06, 0.94], [0.065, 0.955], [0.001, 0.955]], 4), iron, [0, 0, 0], [0, PI / 4, 0]);
  put(g, new THREE.CylinderGeometry(0.085, 0.062, 0.17, 4, 1, true), glass, [0, 1.04, 0], [0, PI / 4, 0]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2;
    rodAB(g, [Math.cos(a) * 0.064, 0.955, Math.sin(a) * 0.064], [Math.cos(a) * 0.087, 1.125, Math.sin(a) * 0.087], 0.005, iron, 4);
  }
  put(g, new THREE.SphereGeometry(0.03, 12, 8), bulb, [0, 1.03, 0], [0, 0, 0], [1, 1.3, 1]);
  put(g, new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), iron, [0, 0.98, 0]);
  // Roof and finial.
  put(g, lathe([[0.001, 1.125], [0.11, 1.125], [0.112, 1.135], [0.07, 1.17], [0.03, 1.2], [0.001, 1.21]], 4), iron, [0, 0, 0], [0, PI / 4, 0]);
  put(g, lathe([[0.001, 1.2], [0.018, 1.205], [0.012, 1.22], [0.016, 1.235], [0.001, 1.26]], 10), iron);
  return g;
}

function campfire() {
  const g = new THREE.Group();
  const rock = mat('rock', { color: '#A39C92' });
  const sooty = mat('rock', { color: '#6A625B' });
  const ash = mat('rock', { color: '#55504C' });
  const bark = mat('bark', { color: '#8A7360' });
  const charred = mat('bark', { color: '#2E2622' });
  const ember = mat('rock', { color: '#FF6A1A', glow: 1.8 });
  const emberRed = mat('rock', { color: '#D2361A', glow: 1.1 });
  const coal = mat('rock', { color: '#2A2523' });
  const flame = mat('glass', { color: '#FFB347', glow: 2.6, opacity: 0.8 });
  const r = rng(77);
  put(g, new THREE.CylinderGeometry(0.2, 0.23, 0.014, 22), ash, [0, 0.007, 0]);
  // Stone ring.
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + r() * 0.15;
    const s = 0.055 + r() * 0.025;
    put(g, rockGeo(s, 30 + i, 0.75), i % 3 === 0 ? sooty : rock, [Math.cos(a) * (0.27 + r() * 0.02), s * 0.45, Math.sin(a) * (0.27 + r() * 0.02)], [r() * 0.4, r() * 6, 0]);
  }
  // Two big crossed logs and a small teepee of split sticks, charred toward the middle.
  const logs: [V3, V3, number][] = [
    [[-0.2, 0.03, -0.07], [0.2, 0.05, 0.08], 0.032],
    [[-0.17, 0.03, 0.12], [0.18, 0.06, -0.1], 0.028],
  ];
  logs.forEach(([a, b, rad], i) => {
    const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const q1: V3 = [a[0] * 0.4 + mid[0] * 0.6, a[1] * 0.4 + mid[1] * 0.6, a[2] * 0.4 + mid[2] * 0.6];
    const q2: V3 = [b[0] * 0.4 + mid[0] * 0.6, b[1] * 0.4 + mid[1] * 0.6, b[2] * 0.4 + mid[2] * 0.6];
    poleAB(g, a, q1, rad, bark, 50 + i, 9);
    poleAB(g, q1, q2, rad * 0.92, charred, 52 + i, 9);
    poleAB(g, q2, b, rad, bark, 54 + i, 9);
    for (const [p, q] of [[a, q1], [b, q2]] as [V3, V3][]) {
      const d = v3(p).sub(v3(q)).normalize().multiplyScalar(0.002);
      const disc = new THREE.CylinderGeometry(rad * 0.93, rad * 0.93, 0.004, 9);
      disc.rotateZ(-PI / 2);
      between(g, disc, mat('wood', { color: '#D8B48A' }), [p[0] + d.x, p[1] + d.y, p[2] + d.z], [p[0] + d.x * 2, p[1] + d.y * 2, p[2] + d.z * 2]);
    }
  });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2 + 0.3;
    poleAB(g, [Math.cos(a) * 0.12, 0.02, Math.sin(a) * 0.12], [Math.cos(a) * 0.015, 0.17, Math.sin(a) * 0.015], 0.012, i % 2 ? charred : bark, 60 + i, 6);
  }
  // Embers and coals.
  for (let i = 0; i < 34; i++) {
    const a = r() * PI * 2;
    const d = Math.sqrt(r()) * 0.14;
    const s = 0.012 + r() * 0.02;
    const m = d < 0.08 ? (r() < 0.6 ? ember : emberRed) : r() < 0.5 ? emberRed : coal;
    put(g, rockGeo(s, 90 + i, 0.6, 0), m, [Math.cos(a) * d, 0.015 + (0.14 - d) * 0.25 + r() * 0.01, Math.sin(a) * d], [r(), r() * 6, r()]);
  }
  // Low flames licking the logs.
  const tongue = (h: number, w: number) =>
    new THREE.LatheGeometry([0, 0.15, 0.35, 0.55, 0.75, 0.9, 1].map((t) => new THREE.Vector2(w * Math.sin(PI * Math.pow(t, 0.6)) * (1 - t * 0.6), t * h)), 8);
  const fl: [number, number, number, number][] = [[0, 0, 0.17, 0.05], [0.04, 0.03, 0.11, 0.035], [-0.045, 0.02, 0.12, 0.033], [0.01, -0.05, 0.1, 0.03]];
  fl.forEach(([x, z, h, w], i) => put(g, tongue(h, w), flame, [x, 0.04, z], [(i - 1.5) * 0.08, i, 0.05 * i]));
  return g;
}

function table() {
  const g = new THREE.Group();
  const wood = mat('wood', { color: '#C7A07A' });
  const frame = mat('wood', { color: '#A8835E' });
  const boltM = mat('iron');
  for (let i = 0; i < 5; i++) put(g, beam(0.84, 0.03, 0.084, 70 + i), wood, [0, 0.415, -0.172 + i * 0.086]);
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) put(g, beam(0.84, 0.028, 0.07, 80 + i + s), wood, [0, 0.25, s * (0.3 + i * 0.075)]);
  for (const x of [-0.3, 0.3]) {
    // Crossbeams under the top and under the seats.
    put(g, beam(0.4, 0.04, 0.03, 90), frame, [x, 0.38, 0], [0, PI / 2, 0]);
    put(g, beam(0.86, 0.045, 0.03, 91), frame, [x, 0.215, 0], [0, PI / 2, 0]);
    // A-frame legs.
    for (const s of [-1, 1]) beamAB(g, [x + 0.03 * Math.sign(x), 0.4, s * 0.12], [x + 0.03 * Math.sign(x), 0.0, s * 0.36], 0.05, 0.03, frame, 92 + s, [0, 0, 1]);
    for (const s of [-1, 1]) {
      bolt(g, [x + 0.05 * Math.sign(x), 0.215, s * 0.25], 'x', boltM);
      bolt(g, [x + 0.05 * Math.sign(x), 0.38, s * 0.12], 'x', boltM);
    }
  }
  // Diagonal braces from the seat beams to the middle of the top.
  for (const x of [-0.3, 0.3]) beamAB(g, [x * 0.92, 0.22, 0], [0, 0.39, 0], 0.035, 0.03, frame, 96, [0, 1, 0]);
  return g;
}

function mailbox() {
  const g = new THREE.Group();
  const post = mat('wood', { color: '#B49B7E' });
  const metal = mat('metal', { color: '#2F5B86' });
  const dark = mat('metal', { color: '#1F3C5A' });
  const red = mat('metal', { color: '#C2382E' });
  const iron = mat('iron');
  put(g, beam(0.56, 0.06, 0.06, 101), post, [0, 0.28, 0], [0, 0, PI / 2]);
  put(g, beam(0.34, 0.025, 0.11, 102), post, [0, 0.57, 0.02], [0, PI / 2, 0]);
  beamAB(g, [0, 0.4, 0.03], [0, 0.555, 0.13], 0.03, 0.03, post, 103, [0, 0, 1]);
  // The box: flat bottom, rounded top, hollow look via a darker door frame.
  const r = 0.095;
  const sh = new THREE.Shape();
  sh.moveTo(-r, 0);
  sh.lineTo(r, 0);
  sh.lineTo(r, 0.1);
  sh.absarc(0, 0.1, r, 0, PI, false);
  sh.lineTo(-r, 0);
  const body = new THREE.ExtrudeGeometry(sh, { depth: 0.34, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 14 });
  put(g, body, metal, [0, 0.587, -0.15]);
  // Ribs pressed into the top.
  for (const z of [-0.08, 0.0, 0.08]) {
    const rib = new THREE.TorusGeometry(r + 0.003, 0.004, 4, 16, PI);
    put(g, rib, metal, [0, 0.687, z]);
  }
  const door = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 1, curveSegments: 14 });
  put(g, door, dark, [0, 0.587, 0.19], [0, 0, 0], [1.02, 1.02, 1]);
  put(g, beam(0.05, 0.016, 0.014, 1), mat('metal', { color: '#B8B8B0' }), [0, 0.75, 0.212]);
  // Flag on its pivot, raised.
  put(g, new THREE.CylinderGeometry(0.01, 0.01, 0.01, 8), iron, [r + 0.008, 0.66, 0.0], [0, 0, PI / 2]);
  put(g, new RoundedBoxGeometry(0.006, 0.16, 0.014, 1, 0.002), red, [r + 0.014, 0.72, 0.0]);
  put(g, new RoundedBoxGeometry(0.006, 0.05, 0.075, 1, 0.002), red, [r + 0.014, 0.79, 0.03]);
  bolt(g, [0, 0.45, 0.031], 'z', iron);
  return g;
}

function signpost() {
  const g = new THREE.Group();
  const post = mat('wood', { color: '#A88C6E' });
  const board = mat('wood', { color: '#D2B48C', repeat: [2, 2] });
  const board2 = mat('wood', { color: '#BFA07C', repeat: [2, 2] });
  const carve = mat('woodDark', { color: '#5A4532' });
  const iron = mat('iron');
  put(g, beam(0.8, 0.065, 0.065, 111), post, [0, 0.4, 0], [0, 0, PI / 2]);
  put(g, new THREE.ConeGeometry(0.047, 0.04, 4), post, [0, 0.82, 0], [0, PI / 4, 0]);
  const arrow = (len: number, h: number) => {
    const s = new THREE.Shape();
    s.moveTo(0, -h / 2);
    s.lineTo(len - h * 0.6, -h / 2);
    s.lineTo(len, 0);
    s.lineTo(len - h * 0.6, h / 2);
    s.lineTo(0, h / 2);
    s.lineTo(0, -h / 2);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 });
    geo.translate(0, 0, -0.01);
    return geo;
  };
  const signs: [number, number, number, THREE.Material][] = [
    [0.66, 1, 0.25, board],
    [0.5, -1, -0.35, board2],
    [0.36, 1, -0.9, board],
  ];
  signs.forEach(([y, dir, yaw, m], i) => {
    const s = sub(g, [0, y, 0], [0, yaw, (i - 1) * 0.02]);
    const len = 0.42 - i * 0.04;
    const a = put(s, arrow(len, 0.1), m, [dir > 0 ? -0.06 : 0.06, 0, 0.045], [0, dir > 0 ? 0 : PI, 0]);
    void a;
    // Carved lettering: a few dark strokes.
    const rr = rng(120 + i);
    let x = 0.0;
    while (x < len - 0.16) {
      const w = 0.018 + rr() * 0.03;
      const cx = (dir > 0 ? -0.06 + 0.03 + x : 0.06 - 0.03 - x) + (w / 2) * dir;
      put(s, new THREE.BoxGeometry(w, 0.034, 0.003), carve, [cx, 0, 0.0565]);
      x += w + 0.009 + (rr() < 0.25 ? 0.02 : 0);
    }
    bolt(s, [0, 0.025, 0.06], 'z', iron, 0.006);
    bolt(s, [0, -0.025, 0.06], 'z', iron, 0.006);
  });
  // Stones packed at its foot.
  const rk = mat('rock', { color: '#9C968C' });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + 0.4;
    put(g, rockGeo(0.035, 130 + i), rk, [Math.cos(a) * 0.07, 0.012, Math.sin(a) * 0.07]);
  }
  return g;
}

function umbrella() {
  const g = new THREE.Group();
  const red = mat('fabric', { color: '#C8382F', side: DS });
  const white = mat('fabric', { color: '#F1ECE2', side: DS });
  const pole = mat('wood', { color: '#D3B48D' });
  const metal = mat('metal', { color: '#C9CCCF' });
  const p = sub(g, [0.0, 0, 0], [0, 0, 0.08]);
  put(p, logX(0.95, 0.016, 0.014, 10, 140), pole, [0, 0.475, 0], [0, 0, PI / 2]);
  put(p, new THREE.CylinderGeometry(0.02, 0.02, 0.05, 10), metal, [0, 0.55, 0]);
  put(p, new THREE.CylinderGeometry(0.019, 0.019, 0.03, 10), metal, [0, 0.79, 0]);
  const R = 0.47;
  const apex = 0.96;
  const drop = 0.13;
  const n = 8;
  const surfY = (rr: number, f: number) => apex - Math.pow(rr / R, 1.4) * drop - Math.sin(PI * f) * 0.022 * (rr / R);
  const parts: [THREE.BufferGeometry[], THREE.BufferGeometry[]] = [[], []];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * PI * 2;
    const a1 = ((i + 1) / n) * PI * 2;
    parts[i % 2].push(
      grid(4, 6, (u, v) => {
        const rr = v * R;
        const a = a0 + (a1 - a0) * u;
        // Panels are pulled straight between ribs (chord), so the edge is a polygon, not a circle.
        const chord = Math.cos(PI / n) / Math.cos(a - (a0 + a1) / 2);
        const rx = rr * (1 - (1 - chord) * Math.pow(v, 0.5));
        return [Math.cos(a) * rx, surfY(rr, u), Math.sin(a) * rx];
      }, [0, 1, 0]),
    );
    // Scalloped valance hanging from the edge.
    parts[i % 2].push(
      grid(6, 1, (u, v) => {
        const a = a0 + (a1 - a0) * u;
        const chord = Math.cos(PI / n) / Math.cos(a - (a0 + a1) / 2);
        const rx = R * chord;
        const y = surfY(R, u) - (1 - v) * (0.035 + 0.012 * Math.sin(PI * u));
        return [Math.cos(a) * rx, y, Math.sin(a) * rx];
      }, [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]),
    );
    // Rib under the seam.
    rodAB(p, [Math.cos(a0) * 0.02, apex - 0.012, Math.sin(a0) * 0.02], [Math.cos(a0) * R * 0.98, apex - drop * 0.98 - 0.008, Math.sin(a0) * R * 0.98], 0.0035, metal, 4);
    rodAB(p, [Math.cos(a0) * 0.012, 0.79, Math.sin(a0) * 0.012], [Math.cos(a0) * R * 0.5, apex - drop * 0.4 - 0.012, Math.sin(a0) * R * 0.5], 0.0028, metal, 4);
  }
  put(p, merge(parts[0]), red);
  put(p, merge(parts[1]), white);
  put(p, new THREE.SphereGeometry(0.022, 10, 8), pole, [0, apex + 0.012, 0]);
  // Beach towel.
  const towel = mat('fabric', { color: '#2E78B8' });
  const stripe = mat('fabric', { color: '#F2EEE6' });
  const t = sub(g, [0.16, 0.004, 0.14], [0, 0.25, 0]);
  put(t, new THREE.BoxGeometry(0.34, 0.006, 0.62), towel);
  for (const z of [-0.25, -0.22, 0.22, 0.25]) put(t, new THREE.BoxGeometry(0.341, 0.0065, 0.014), stripe, [0, 0, z]);
  return g;
}

function deckchair() {
  const g = new THREE.Group();
  const wood = mat('wood', { color: '#D2B08A' });
  const blue = mat('fabric', { color: '#2F6EA8', side: DS });
  const white = mat('fabric', { color: '#F2EFE8', side: DS });
  const brass = mat('gold', { color: '#B49A62' });
  const X = 0.19;
  for (const s of [-1, 1]) {
    // Back frame (front foot → top of the back) and seat frame (rear foot → front bar).
    beamAB(g, [s * X, 0.0, 0.3], [s * X, 0.64, -0.3], 0.038, 0.02, wood, 150 + s, [0, 0, 1]);
    beamAB(g, [s * (X + 0.022), 0.0, -0.26], [s * (X + 0.022), 0.38, 0.33], 0.038, 0.02, wood, 152 + s, [0, 0, 1]);
    // Rest frame (holds the back at its angle).
    beamAB(g, [s * (X - 0.024), 0.0, -0.33], [s * (X - 0.024), 0.36, -0.05], 0.034, 0.018, wood, 154 + s, [0, 0, 1]);
    bolt(g, [s * (X + 0.034), 0.205, 0.04], 'x', brass, 0.007);
  }
  rodAB(g, [-X, 0.62, -0.28], [X, 0.62, -0.28], 0.013, wood, 8);
  rodAB(g, [-X - 0.022, 0.37, 0.32], [X + 0.022, 0.37, 0.32], 0.013, wood, 8);
  beamAB(g, [-X - 0.01, 0.06, 0.24], [X + 0.01, 0.06, 0.24], 0.03, 0.018, wood, 157);
  // Striped canvas sling from the top bar to the front bar.
  const P0: V3 = [0, 0.62, -0.28];
  const P2: V3 = [0, 0.37, 0.32];
  const C: V3 = [0, 0.14, -0.04];
  const along = (v: number): [number, number] => {
    const a = (1 - v) ** 2;
    const b = 2 * v * (1 - v);
    const c = v * v;
    return [a * P0[1] + b * C[1] + c * P2[1], a * P0[2] + b * C[2] + c * P2[2]];
  };
  const strips = 7;
  const w = X - 0.012;
  const parts: [THREE.BufferGeometry[], THREE.BufferGeometry[]] = [[], []];
  for (let i = 0; i < strips; i++) {
    parts[i % 2].push(
      grid(1, 14, (u, v) => {
        const x = -w + ((i + u) / strips) * 2 * w;
        const [y, z] = along(v);
        return [x, y + 0.012 + 0.008 * (1 - (x / w) ** 2) * Math.sin(PI * v) * -1, z];
      }, [0, 1, 0.3]),
    );
  }
  put(g, merge(parts[0]), blue);
  put(g, merge(parts[1]), white);
  return g;
}

function swing() {
  const g = new THREE.Group();
  const wood = mat('wood', { color: '#B88A5E' });
  const top = mat('wood', { color: '#A67A50' });
  const iron = mat('metal', { color: '#9A9EA2' });
  const seatM = mat('woodPainted', { color: '#3E6E5A' });
  const H = 0.86;
  for (const x of [-0.42, 0.42]) {
    const o = Math.sign(x) * 0.03;
    poleAB(g, [x, H, 0], [x + o, 0, 0.26], 0.025, wood, 160 + x, 10);
    poleAB(g, [x, H, 0], [x + o, 0, -0.26], 0.025, wood, 162 + x, 10);
    beamAB(g, [x + o * 0.6, 0.3, 0.17], [x + o * 0.6, 0.3, -0.17], 0.04, 0.022, wood, 164, [0, 1, 0]);
    put(g, new THREE.BoxGeometry(0.03, 0.06, 0.06), iron, [x, H - 0.02, 0]);
  }
  poleAB(g, [-0.49, H + 0.025, 0], [0.49, H + 0.025, 0], 0.032, top, 166, 12);
  // Chains: alternating links down to the seat.
  const link = new THREE.TorusGeometry(0.0085, 0.0024, 4, 8);
  for (const x of [-0.14, 0.14]) {
    put(g, new THREE.TorusGeometry(0.014, 0.004, 5, 10), iron, [x, H - 0.01, 0], [0, PI / 2, 0]);
    const y0 = H - 0.03;
    const y1 = 0.27;
    const n = Math.floor((y0 - y1) / 0.022);
    for (let i = 0; i < n; i++) put(g, link, iron, [x, y0 - i * 0.022, 0], [0, i % 2 ? PI / 2 : 0, 0], [1, 1.45, 1]);
    put(g, new THREE.BoxGeometry(0.03, 0.012, 0.1), iron, [x, 0.265, 0]);
  }
  put(g, beam(0.36, 0.022, 0.11, 168, 0.006), seatM, [0, 0.255, 0]);
  return g;
}

function slide() {
  const g = new THREE.Group();
  const wood = mat('wood', { color: '#B8916A' });
  const deckM = mat('wood', { color: '#C9A47C' });
  const chuteM = mat('metal', { color: '#D4D8DB', side: DS });
  const rail = mat('metal', { color: '#2E6B47' });
  const X0 = -0.4;
  const X1 = -0.12;
  const PY = 0.52;
  // Tower posts and platform.
  for (const x of [X0, X1]) for (const z of [-0.14, 0.14]) put(g, beam(0.8, 0.05, 0.05, 170 + x + z), wood, [x, 0.4, z], [0, 0, PI / 2]);
  for (let i = 0; i < 4; i++) put(g, beam(0.32, 0.02, 0.07, 175 + i), deckM, [(X0 + X1) / 2, PY, -0.105 + i * 0.07], [0, 0, 0]);
  for (const z of [-0.14, 0.14]) {
    beamAB(g, [X0, PY - 0.03, z], [X1, PY - 0.03, z], 0.04, 0.02, wood, 180, [0, 1, 0]);
    // Side rails with balusters.
    rodAB(g, [X0, 0.76, z], [X1, 0.76, z], 0.01, rail, 8);
    for (let i = 1; i < 4; i++) rodAB(g, [X0 + ((X1 - X0) * i) / 4, PY, z], [X0 + ((X1 - X0) * i) / 4, 0.76, z], 0.005, rail, 5);
  }
  rodAB(g, [X0, 0.76, -0.14], [X0, 0.76, 0.14], 0.01, rail, 8);
  // Ladder at the back (−x side).
  for (const z of [-0.1, 0.1]) beamAB(g, [X0 - 0.2, 0, z], [X0 - 0.01, PY, z], 0.045, 0.022, wood, 182, [-1, 0, 0]);
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    rodAB(g, [X0 - 0.2 + 0.19 * t, PY * t, -0.1], [X0 - 0.2 + 0.19 * t, PY * t, 0.1], 0.009, rail, 6);
  }
  // Chute: a U-shaped steel trough curving down toward +x.
  const path = (u: number): [number, number] => {
    const x = X1 + u * 0.62;
    const y = PY + 0.01 - (PY - 0.06) * (u < 0.12 ? 0 : u > 0.9 ? 1 : (1 - Math.cos(((u - 0.12) / 0.78) * PI)) / 2);
    return [x, y];
  };
  const prof: [number, number][] = [[-0.12, 0.075], [-0.11, 0.07], [-0.1, 0.012], [-0.08, 0], [0.08, 0], [0.1, 0.012], [0.11, 0.07], [0.12, 0.075]];
  const chute = grid(prof.length - 1, 24, (u, v) => {
    const k = u * (prof.length - 1);
    const i = Math.min(prof.length - 2, Math.floor(k));
    const f = k - i;
    const z = prof[i][0] + (prof[i + 1][0] - prof[i][0]) * f;
    const dy = prof[i][1] + (prof[i + 1][1] - prof[i][1]) * f;
    const [x, y] = path(v);
    return [x, y + dy, z];
  }, [0, 1, 0]);
  put(g, chute, chuteM);
  for (const s of [-1, 1]) {
    const pts: V3[] = [];
    for (let i = 0; i <= 10; i++) {
      const [x, y] = path(i / 10);
      pts.push([x, y + 0.078, s * 0.12]);
    }
    put(g, tube(pts, 0.009, 24, 6), chuteM);
  }
  // Supports under the chute.
  const [sx, sy] = path(0.6);
  for (const z of [-0.08, 0.08]) rodAB(g, [sx, 0, z], [sx, sy, z], 0.009, rail, 6);
  return g;
}

function hammock() {
  const g = new THREE.Group();
  const bark = mat('bark', { color: '#8F7A66' });
  const endM = mat('wood', { color: '#D8B88E' });
  const rope = mat('rope');
  const wood = mat('wood', { color: '#C49A6C' });
  const cloths = [mat('fabric', { color: '#D9C7A1', side: DS }), mat('fabric', { color: '#A6452F', side: DS }), mat('fabric', { color: '#3F6D5C', side: DS })];
  const PX = 0.44;
  const PH = 0.78;
  for (const s of [-1, 1]) {
    put(g, logX(PH, 0.038, 0.032, 12, 190 + s, 2), bark, [s * PX, PH / 2, 0], [0, 0, PI / 2 - s * 0.04]);
    put(g, new THREE.CircleGeometry(0.032, 12), endM, [s * PX - s * PH * 0.04 * 0.5, PH + 0.001, 0], [-PI / 2, 0, 0]);
    put(g, new THREE.TorusGeometry(0.038, 0.007, 5, 12), rope, [s * (PX - 0.012), 0.66, 0], [PI / 2, 0, 0]);
  }
  const BX = 0.27;
  const W = 0.14;
  const Y = 0.47;
  const sag = 0.17;
  const yAt = (x: number, z: number) => Y - sag * (1 - (x / BX) ** 2) - 0.03 * (1 - (z / W) ** 2) * (1 - (x / BX) ** 4);
  const strips = 6;
  const parts: THREE.BufferGeometry[][] = [[], [], []];
  for (let i = 0; i < strips; i++) {
    const m = i === 0 || i === strips - 1 ? 1 : i === 2 || i === 3 ? 2 : 0;
    parts[m].push(
      grid(16, 1, (u, v) => {
        const x = -BX + u * 2 * BX;
        const z = -W + ((i + v) / strips) * 2 * W;
        return [x, yAt(x, z), z];
      }, [0, 1, 0]),
    );
  }
  parts.forEach((p, i) => put(g, merge(p), cloths[i]));
  for (const s of [-1, 1]) {
    poleAB(g, [s * (BX + 0.008), Y + 0.004, -W - 0.02], [s * (BX + 0.008), Y + 0.004, W + 0.02], 0.009, wood, 195, 8);
    const ring: V3 = [s * 0.37, 0.62, 0];
    for (const z of [-W * 0.9, -W * 0.3, W * 0.3, W * 0.9]) rodAB(g, [s * (BX + 0.008), Y + 0.006, z], ring, 0.0022, rope, 4);
    put(g, new THREE.TorusGeometry(0.012, 0.003, 4, 10), mat('metal', { color: '#8C8F92' }), ring, [0, PI / 2, 0]);
    rodAB(g, ring, [s * (PX - 0.04), 0.66, 0], 0.004, rope, 5);
  }
  // A cushion at one end.
  put(g, new RoundedBoxGeometry(0.12, 0.04, 0.16, 2, 0.018), mat('fabric', { color: '#EDE5D2' }), [-0.18, yAt(-0.18, 0) + 0.022, 0], [0, 0, -0.35]);
  return g;
}

function trampoline() {
  const g = new THREE.Group();
  const steel = mat('metal', { color: '#B9BDC1' });
  const pad = mat('fabric', { color: '#2F69AE' });
  const matM = mat('rubber', { color: '#1C1D21' });
  const H = 0.22;
  const R = 0.39;
  put(g, new THREE.TorusGeometry(R, 0.011, 6, 40), steel, [0, H, 0], [PI / 2, 0, 0]);
  // U-shaped legs.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    const at = (da: number, rr: number, y: number): V3 => [Math.cos(a + da) * rr, y, Math.sin(a + da) * rr];
    put(g, tube([at(-0.24, R, H), at(-0.23, R, 0.12), at(-0.2, R - 0.01, 0.012), at(0, R - 0.03, 0.012), at(0.2, R - 0.01, 0.012), at(0.23, R, 0.12), at(0.24, R, H)], 0.011, 30, 6), steel);
    for (const da of [-0.24, 0.24]) put(g, new THREE.CylinderGeometry(0.014, 0.014, 0.03, 8), steel, at(da, R, H - 0.02));
  }
  // Springs between the frame and the mat.
  const n = 40;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    rodAB(g, [Math.cos(a) * (R - 0.01), H + 0.002, Math.sin(a) * (R - 0.01)], [Math.cos(a) * 0.31, H - 0.006, Math.sin(a) * 0.31], 0.0045, steel, 5);
  }
  // Jump mat, slightly dipped, with a stitched border.
  const jm = new THREE.LatheGeometry([0, 0.1, 0.2, 0.28, 0.315].map((r) => new THREE.Vector2(r, H - 0.006 - 0.012 * (1 - (r / 0.315) ** 2))), 40);
  // Lathe faces outward/down when the profile goes outward; flip it to face up.
  jm.scale(1, 1, -1);
  put(g, jm, matM);
  put(g, new THREE.TorusGeometry(0.312, 0.004, 4, 40), mat('fabric', { color: '#3A3B40' }), [0, H - 0.006, 0], [PI / 2, 0, 0]);
  // Padded spring cover, partly over the springs.
  const cover = new THREE.TorusGeometry(R - 0.035, 0.05, 6, 48);
  put(g, cover, pad, [0, H + 0.004, 0], [PI / 2, 0, 0], [1, 1, 0.22]);
  return g;
}

function treasure() {
  const g = new THREE.Group();
  const wood = mat('woodDark', { color: '#9A6E48' });
  const woodIn = mat('woodDark', { color: '#7A563A', side: DS });
  const brass = mat('gold', { color: '#A88648' });
  const iron = mat('iron');
  const gold = mat('gold', { color: '#FFD978', glow: 0.08 });
  const W = 0.5;
  const H = 0.25;
  const Dp = 0.32;
  const t = 0.022;
  // Box made of boards.
  put(g, new THREE.BoxGeometry(W, t, Dp), wood, [0, t / 2, 0]);
  for (const s of [-1, 1]) {
    put(g, new THREE.BoxGeometry(W, H, t), wood, [0, H / 2, s * (Dp / 2 - t / 2)]);
    put(g, new THREE.BoxGeometry(t, H, Dp - 2 * t), wood, [s * (W / 2 - t / 2), H / 2, 0]);
  }
  // Brass corners and iron straps.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) put(g, new THREE.BoxGeometry(0.03, H + 0.006, 0.03), brass, [sx * (W / 2 - 0.012), H / 2, sz * (Dp / 2 - 0.012)]);
  for (const x of [-0.15, 0.15]) {
    put(g, new THREE.BoxGeometry(0.035, H + 0.004, Dp + 0.008), iron, [x, H / 2, 0]);
    for (const s of [-1, 1]) for (const y of [0.05, 0.13, 0.21]) bolt(g, [x, y, s * (Dp / 2 + 0.006)], 'z', brass, 0.006);
  }
  put(g, new THREE.BoxGeometry(W + 0.006, 0.02, Dp + 0.006), brass, [0, H - 0.01, 0]);
  // Lock plate and hasp.
  put(g, new RoundedBoxGeometry(0.07, 0.08, 0.012, 1, 0.004), brass, [0, H - 0.055, Dp / 2 + 0.004]);
  put(g, new THREE.CylinderGeometry(0.008, 0.008, 0.014, 8), mat('iron', { color: '#222222' }), [0, H - 0.06, Dp / 2 + 0.008], [PI / 2, 0, 0]);
  // Heaped gold inside.
  const heap = new THREE.SphereGeometry(0.2, 16, 8, 0, PI * 2, 0, PI / 2);
  put(g, heap, gold, [0, H - 0.04, 0], [0, 0, 0], [1.15, 0.5, 0.7]);
  const coin = new THREE.CylinderGeometry(0.024, 0.024, 0.005, 12);
  const r = rng(201);
  for (let i = 0; i < 46; i++) {
    const a = r() * PI * 2;
    const d = Math.sqrt(r());
    const x = Math.cos(a) * d * 0.21;
    const z = Math.sin(a) * d * 0.12;
    const y = H - 0.04 + 0.1 * Math.sqrt(Math.max(0, 1 - (x / 0.23) ** 2 - (z / 0.14) ** 2)) + 0.003;
    put(g, coin, gold, [x, y, z], [(r() - 0.5) * 0.9, r() * 3, (r() - 0.5) * 0.9]);
  }
  // Spilled coins and a few gems.
  for (let i = 0; i < 14; i++) {
    const x = 0.12 + r() * 0.24;
    const z = 0.18 + r() * 0.15;
    put(g, coin, gold, [x - 0.08, 0.003 + (i % 4) * 0.005 * (i < 6 ? 1 : 0), z], [(r() - 0.5) * 0.2, r() * 3, (r() - 0.5) * 0.2]);
  }
  const gems: [V3, string][] = [[[0.05, H + 0.055, 0.02], '#D7263D'], [[-0.09, H + 0.04, -0.03], '#2E9E5B'], [[0.12, H + 0.02, 0.06], '#3B6FD8'], [[-0.22, 0.02, 0.24], '#D7263D']];
  for (const [p, c] of gems) put(g, new THREE.OctahedronGeometry(0.022, 0), mat('crystal', { color: c, glow: 0.25 }), p, [0.3, 0.5, 0], [1, 0.8, 1]);
  // Open lid, hinged at the back.
  const lid = sub(g, [0, H, -Dp / 2], [-1.95, 0, 0]);
  const R = Dp / 2;
  const shell = new THREE.CylinderGeometry(R, R, W, 18, 1, false, 0, PI);
  shell.rotateZ(PI / 2);
  put(lid, shell, wood, [0, 0, R]);
  const inner = new THREE.CylinderGeometry(R - 0.018, R - 0.018, W - 0.03, 14, 1, true, 0, PI);
  inner.rotateZ(PI / 2);
  put(lid, inner, woodIn, [0, 0, R]);
  for (const x of [-0.15, 0.15]) {
    const band = new THREE.CylinderGeometry(R + 0.005, R + 0.005, 0.035, 18, 1, true, 0, PI);
    band.rotateZ(PI / 2);
    put(lid, band, iron, [x, 0, R]);
  }
  for (const x of [-W / 2 + 0.01, W / 2 - 0.01]) {
    const edge = new THREE.CylinderGeometry(R + 0.004, R + 0.004, 0.02, 18, 1, true, 0, PI);
    edge.rotateZ(PI / 2);
    put(lid, edge, brass, [x, 0, R]);
  }
  for (const x of [-0.15, 0.15]) put(g, new THREE.CylinderGeometry(0.01, 0.01, 0.05, 8), brass, [x, H + 0.002, -Dp / 2 - 0.006], [0, 0, PI / 2]);
  return g;
}

function telescope() {
  const g = new THREE.Group();
  const wood = mat('wood', { color: '#8E5E3A' });
  const brass = mat('gold', { color: '#C9A15A' });
  const dark = mat('iron', { color: '#3A3A3E' });
  const leather = mat('fabric', { color: '#4A2E1F' });
  const lens = mat('glass', { color: '#24384A', opacity: 0.9 });
  const HY = 0.5;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + PI / 2;
    const foot: V3 = [Math.cos(a) * 0.26, 0.0, Math.sin(a) * 0.26];
    const top: V3 = [Math.cos(a) * 0.035, HY, Math.sin(a) * 0.035];
    beamAB(g, top, foot, 0.028, 0.02, wood, 210 + i, [Math.cos(a), 0, Math.sin(a)]);
    put(g, new THREE.ConeGeometry(0.012, 0.03, 6), brass, [foot[0], 0.012, foot[2]], [PI, 0, 0]);
    // Spreader chain.
    put(g, tube(sagPts([Math.cos(a) * 0.12, 0.27, Math.sin(a) * 0.12], [0, 0.22, 0], 0.01, 4), 0.0025, 8, 4), dark);
    for (const s of [-1, 1]) bolt(g, [top[0] + Math.cos(a) * 0.012, HY - 0.02, top[2] + Math.sin(a) * 0.012 + s * 0.0], 'y', brass, 0.004);
  }
  put(g, new THREE.CylinderGeometry(0.05, 0.045, 0.04, 14), brass, [0, HY + 0.01, 0]);
  put(g, new THREE.CylinderGeometry(0.02, 0.02, 0.06, 10), brass, [0, HY + 0.05, 0]);
  // Fork holding the tube.
  for (const s of [-1, 1]) put(g, new RoundedBoxGeometry(0.01, 0.09, 0.03, 1, 0.003), brass, [s * 0.05, HY + 0.1, 0]);
  rodAB(g, [-0.05, HY + 0.075, 0], [0.05, HY + 0.075, 0], 0.008, brass);
  // Tube, pointing up toward +z.
  const tubeG = sub(g, [0, HY + 0.13, 0], [0.98, 0, 0]);
  const prof: [number, number][] = [[0.001, -0.3], [0.014, -0.3], [0.016, -0.285], [0.012, -0.27], [0.012, -0.25], [0.02, -0.245], [0.02, -0.22], [0.024, -0.215], [0.026, -0.2], [0.026, -0.12], [0.032, -0.115], [0.034, -0.1], [0.034, 0.25], [0.04, 0.255], [0.046, 0.27], [0.046, 0.33], [0.043, 0.335], [0.043, 0.33], [0.001, 0.33]];
  put(tubeG, new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 20), brass);
  put(tubeG, new THREE.CylinderGeometry(0.036, 0.036, 0.12, 20, 1, true), leather, [0, 0.02, 0]);
  for (const y of [-0.04, 0.08, 0.2]) put(tubeG, new THREE.TorusGeometry(0.036, 0.004, 5, 20), brass, [0, y, 0], [PI / 2, 0, 0]);
  put(tubeG, new THREE.CircleGeometry(0.041, 20), lens, [0, 0.326, 0], [-PI / 2, 0, 0]);
  // Finder scope.
  put(tubeG, new THREE.CylinderGeometry(0.008, 0.009, 0.12, 10), brass, [0, 0.12, 0.05]);
  for (const y of [0.08, 0.16]) put(tubeG, new THREE.BoxGeometry(0.006, 0.006, 0.018), brass, [0, y, 0.04]);
  return g;
}

function lanterns() {
  const g = new THREE.Group();
  const pole = mat('wood', { color: '#8C6A4A' });
  const rope = mat('rope', { color: '#6E5C48' });
  const cap = mat('iron', { color: '#2A2A2E' });
  const colors = ['#E8432E', '#F28C28', '#F5C542', '#E8432E', '#F28C28'];
  const PX = 0.46;
  const PH = 1.02;
  for (const s of [-1, 1]) {
    poleAB(g, [s * PX, 0, 0], [s * PX, PH, 0], 0.022, pole, 220 + s, 10, 0.018);
    put(g, new THREE.SphereGeometry(0.022, 10, 6), pole, [s * PX, PH + 0.008, 0]);
    put(g, rockGeo(0.04, 222 + s, 0.6), mat('rock', { color: '#9C968C' }), [s * PX + 0.03, 0.01, 0.03]);
    put(g, new THREE.TorusGeometry(0.024, 0.005, 4, 10), rope, [s * PX, PH - 0.04, 0], [PI / 2, 0, 0]);
  }
  const A: V3 = [-PX + 0.02, PH - 0.04, 0];
  const B: V3 = [PX - 0.02, PH - 0.04, 0];
  const sag = 0.14;
  put(g, tube(sagPts(A, B, sag, 12), 0.0035, 30, 4), rope);
  const ribbed = (h: number, r: number) => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector2(Math.max(0.004, r * Math.pow(Math.sin(PI * (0.08 + t * 0.84)), 0.8)), -h / 2 + t * h));
    }
    const geo = new THREE.LatheGeometry(pts, 16);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + 0.05 * Math.abs(Math.cos(a * 4));
      pos.setXYZ(i, x * k, pos.getY(i), z * k);
    }
    // Horizontal ribs of the paper.
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const k = 1 - 0.035 * Math.abs(Math.sin(((y + h / 2) / h) * PI * 6));
      pos.setXYZ(i, pos.getX(i) * k, y, pos.getZ(i) * k);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const xs = [-0.32, -0.16, 0, 0.16, 0.32];
  xs.forEach((x, i) => {
    const t = (x - A[0]) / (B[0] - A[0]);
    const ys = A[1] - sag * 4 * t * (1 - t);
    const h = i % 2 ? 0.12 : 0.15;
    const r = i % 2 ? 0.05 : 0.058;
    const cy = ys - 0.04 - h / 2;
    rodAB(g, [x, ys, 0], [x, cy + h / 2, 0], 0.0018, cap, 4);
    put(g, ribbed(h, r), mat('fabric', { color: colors[i], glow: 0.95 }), [x, cy, 0]);
    put(g, new THREE.CylinderGeometry(r * 0.42, r * 0.5, 0.012, 12), cap, [x, cy + h / 2, 0]);
    put(g, new THREE.CylinderGeometry(r * 0.5, r * 0.42, 0.01, 12), cap, [x, cy - h / 2, 0]);
    put(g, new THREE.ConeGeometry(0.008, 0.05, 6), mat('fabric', { color: '#B5281C' }), [x, cy - h / 2 - 0.03, 0], [PI, 0, 0]);
  });
  return g;
}

// ─── Boats ──────────────────────────────────────────────────────────────────

function rowboat() {
  const g = new THREE.Group();
  const h: Hull = { L: 0.9, B: 0.42, D: 0.2, stern: 0.5, sheer: [0.03, 0.07], rise: [0.15, 0.7], e: 0.75, k: 0.85, thick: 0.012 };
  const paint = mat('woodPainted', { color: '#3E7480', repeat: [1, 2] });
  const bottomM = mat('woodPainted', { color: '#7A3A2C', repeat: [1, 2] });
  const inner = mat('wood', { color: '#C69866', repeat: [1, 2] });
  const trim = mat('wood', { color: '#9C6A40' });
  const brass = mat('gold', { color: '#B08A4A' });
  hull(g, h, [[0.05, bottomM], [9, paint]], inner, mat('woodPainted', { color: '#3E7480', repeat: [2, 2] }));
  gunwale(g, h, trim, [0.012, 0.009]);
  keel(g, h, trim);
  // Ribs inside.
  for (let i = 0; i < 7; i++) {
    const t = 0.16 + i * 0.11;
    const pts: V3[] = [];
    for (let j = 0; j <= 4; j++) pts.push(hullPt(h, t, (j / 4) * (PI / 2) * 0.98, 1, h.thick + 0.003));
    for (let j = 4; j >= 0; j--) pts.push(hullPt(h, t, (j / 4) * (PI / 2) * 0.98, -1, h.thick + 0.003));
    put(g, tube(pts, [0.006, 0.004], 20, 4), trim);
  }
  // Floorboards, thwarts, stern seat.
  for (const x of [-0.05, 0, 0.05]) put(g, beam(0.5, 0.008, 0.04, 230 + x * 10), inner, [x, 0.03, -0.02], [0, PI / 2, 0]);
  for (const [t, d] of [[0.35, 0.09], [0.62, 0.08]]) {
    const y = htop(h, t) - 0.055;
    const w = hullX(h, t, y, h.thick) * 2;
    put(g, beam(w, 0.016, d, 233 + t), trim, [0, y, hz(h, t)]);
  }
  {
    const y = htop(h, 0.1) - 0.06;
    const w = hullX(h, 0.08, y, h.thick) * 2;
    put(g, beam(w, 0.016, 0.12, 236), trim, [0, y, hz(h, 0.1)]);
  }
  // Rowlocks and oars, blades out on the water.
  const oar = mat('wood', { color: '#D8B88C' });
  for (const s of [-1, 1]) {
    const t = 0.5;
    const top = htop(h, t) + 0.012;
    const x = s * hw(h, t);
    put(g, new THREE.TorusGeometry(0.012, 0.003, 4, 8, PI), brass, [x, top + 0.01, hz(h, t)], [0, PI / 2, 0]);
    const a: V3 = [x - s * 0.17, top + 0.04, hz(h, t) + 0.08];
    const b: V3 = [x + s * 0.3, 0.06, hz(h, t) - 0.2];
    poleAB(g, a, b, 0.008, oar, 240 + s, 8);
    const dir = v3(b).sub(v3(a)).normalize();
    const bladeC = v3(b).addScaledVector(dir, 0.06);
    const blade = new RoundedBoxGeometry(0.13, 0.004, 0.034, 1, 0.0018);
    between(g, grainX(blade, 242), oar, [b[0], b[1], b[2]], [bladeC.x + dir.x * 0.07, bladeC.y + dir.y * 0.07, bladeC.z + dir.z * 0.07], [0, 1, 0]);
    put(g, new THREE.CylinderGeometry(0.01, 0.01, 0.05, 8), mat('wood', { color: '#6E4A2E' }), [a[0], a[1], a[2]], [0, 0, 0]).quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }
  // Bow ring and a coiled painter rope.
  put(g, new THREE.TorusGeometry(0.012, 0.003, 4, 10), brass, [0, htop(h, 1) - 0.03, hz(h, 1) + 0.012]);
  for (let i = 0; i < 3; i++) put(g, new THREE.TorusGeometry(0.03 - i * 0.006, 0.004, 4, 14), mat('rope'), [0, hbot(h, 0.84) + h.thick + 0.02 + i * 0.006, hz(h, 0.84)], [PI / 2, 0, 0]);
  return g;
}

function duckboat() {
  const g = new THREE.Group();
  const h: Hull = { L: 0.92, B: 0.56, D: 0.24, stern: 0.55, sheer: [0.03, 0.03], rise: [0.25, 0.45], e: 0.45, k: 0.55, thick: 0.02 };
  const yellow = mat('plastic', { color: '#F2C230' });
  const yellowDk = mat('plastic', { color: '#E0A91E' });
  const white = mat('plastic', { color: '#F2F2EE' });
  const blue = mat('plastic', { color: '#2E6FB0' });
  const orange = mat('plastic', { color: '#F07A1A' });
  const black = mat('plastic', { color: '#141414' });
  hull(g, h, [[0.07, white], [9, yellow]], white, yellow, 24, 8);
  gunwale(g, h, white, [0.016, 0.012]);
  // Decks fore and aft, cockpit between.
  put(g, deck(h, 0.0, 0.3, { drop: 0.008, camber: 0.02 }), yellow);
  put(g, deck(h, 0.62, 1.0, { drop: 0.008, camber: 0.025 }), yellow);
  put(g, deck(h, 0.28, 0.66, { y: 0.07, camber: 0, inset: h.thick }), white);
  // Moulded bench with backrest.
  put(g, new RoundedBoxGeometry(0.4, 0.05, 0.12, 2, 0.02), blue, [0, 0.16, -0.06]);
  put(g, new RoundedBoxGeometry(0.4, 0.14, 0.035, 2, 0.015), blue, [0, 0.24, -0.13], [-0.25, 0, 0]);
  // Pedals and steering stick.
  for (const x of [-0.1, 0.1]) put(g, new RoundedBoxGeometry(0.05, 0.015, 0.07, 1, 0.005), black, [x, 0.12, 0.12], [-0.4, 0, 0]);
  rodAB(g, [0.0, 0.08, 0.08], [0.0, 0.2, 0.06], 0.007, black);
  put(g, new THREE.SphereGeometry(0.015, 8, 6), black, [0, 0.205, 0.06]);
  // Wings moulded on the sides.
  for (const s of [-1, 1]) {
    const wing = loft({
      curve: new THREE.CatmullRomCurve3([v3([s * 0.27, 0.2, 0.18]), v3([s * 0.285, 0.22, 0.0]), v3([s * 0.28, 0.24, -0.2]), v3([s * 0.25, 0.3, -0.32])]),
      section: (u) => ({ rx: 0.02, ry: 0.06 * Math.sin(PI * Math.min(1, u * 1.1 + 0.08)) + 0.005 }),
      rings: 14,
      radial: 8,
    }).geometry;
    put(g, wing, yellowDk);
  }
  // Tail flicked up at the stern.
  put(g, loft({ curve: new THREE.CatmullRomCurve3([v3([0, 0.24, -0.4]), v3([0, 0.3, -0.47]), v3([0, 0.4, -0.5])]), section: (u) => ({ rx: 0.1 * (1 - u * 0.8), ry: 0.04 * (1 - u * 0.7) }), rings: 8, radial: 10 }).geometry, yellow);
  // Neck and head at the bow.
  const neck = loft({
    curve: new THREE.CatmullRomCurve3([v3([0, 0.22, 0.26]), v3([0, 0.36, 0.3]), v3([0, 0.5, 0.31]), v3([0, 0.6, 0.31])]),
    section: (u) => ({ rx: 0.1 - u * 0.03, ry: 0.11 - u * 0.04 }),
    rings: 10,
    radial: 14,
  }).geometry;
  put(g, neck, yellow);
  put(g, new THREE.SphereGeometry(0.115, 20, 14), yellow, [0, 0.67, 0.33], [0, 0, 0], [0.95, 0.9, 1.05]);
  // Bill: flattened and slightly upturned.
  const bill = loft({
    curve: new THREE.CatmullRomCurve3([v3([0, 0.64, 0.4]), v3([0, 0.635, 0.47]), v3([0, 0.645, 0.52])]),
    section: (u) => ({ rx: 0.055 - u * 0.012, ry: 0.024 - u * 0.012, flat: 0.5 }),
    rings: 8,
    radial: 12,
  }).geometry;
  put(g, bill, orange);
  for (const s of [-1, 1]) {
    put(g, new THREE.SphereGeometry(0.024, 12, 8), white, [s * 0.065, 0.7, 0.41], [0, 0, 0], [0.7, 1, 0.8]);
    put(g, new THREE.SphereGeometry(0.016, 10, 8), black, [s * 0.071, 0.705, 0.42]);
  }
  return g;
}

function sailboat() {
  const g = new THREE.Group();
  const h: Hull = { L: 0.96, B: 0.4, D: 0.18, stern: 0.62, sheer: [0.01, 0.05], rise: [0.05, 0.7], e: 0.55, k: 0.75, thick: 0.012 };
  const white = mat('plastic', { color: '#F3F2EE' });
  const navy = mat('plastic', { color: '#1F3550' });
  const anti = mat('plastic', { color: '#2C4F78' });
  const teak = mat('wood', { color: '#B98A5C' });
  const alu = mat('metal', { color: '#C8CDD2' });
  const sailM = mat('fabric', { color: '#F5F2EA', side: DS });
  const wire = mat('metal', { color: '#9DA3A8' });
  hull(g, h, [[0.045, anti], [0.12, white], [0.135, navy], [9, white]], white, white);
  gunwale(g, h, teak, [0.01, 0.007]);
  put(g, deck(h, 0.6, 1.0, { drop: 0.004, camber: 0.012 }), white);
  for (const s of [-1, 1]) put(g, grid(1, 10, (u, v) => {
    const t = 0.06 + 0.56 * v;
    const y = htop(h, t) - 0.004;
    const xo = hullX(h, t, y, h.thick);
    return [s * (xo - u * 0.06), y, hz(h, t)];
  }, [0, 1, 0]), white);
  put(g, deck(h, 0.06, 0.6, { y: 0.07, camber: 0, inset: h.thick, rings: 8 }), teak);
  // Cockpit benches.
  for (const s of [-1, 1]) put(g, beam(0.38, 0.016, 0.07, 250 + s), teak, [s * 0.11, 0.12, -0.17], [0, PI / 2, 0]);
  // Mast, boom, sails.
  const MZ = 0.14;
  const top = 1.5;
  put(g, new THREE.CylinderGeometry(0.009, 0.013, top - 0.17, 10), alu, [0, (top + 0.17) / 2, MZ]);
  const boomEnd: V3 = [0.09, 0.32, -0.42];
  rodAB(g, [0, 0.32, MZ], boomEnd, 0.009, alu, 8);
  put(g, cloth([0, 0.335, MZ - 0.015], boomEnd.map((c, i) => (i === 1 ? c + 0.012 : c)) as V3, [0, top - 0.04, MZ - 0.012], [0, top - 0.04, MZ - 0.012], [0.07, 0, 0.0], 10, 12), sailM);
  // Battens.
  for (let i = 1; i < 4; i++) {
    const v = i / 4;
    const y = 0.335 + (top - 0.04 - 0.335) * v;
    const zEnd = MZ - 0.015 + (boomEnd[2] - (MZ - 0.015)) * (1 - v);
    rodAB(g, [0.01 + 0.07 * 0.45, y, MZ - 0.03], [boomEnd[0] * (1 - v) + 0.01, y + 0.006 * (1 - v), zEnd + 0.02], 0.002, wire, 3);
  }
  const bow: V3 = [0, htop(h, 1) - 0.01, hz(h, 1) - 0.01];
  const jibHead: V3 = [0, 1.12, MZ + 0.012];
  put(g, cloth([0, bow[1] + 0.05, bow[2] - 0.02], [0.14, 0.3, 0.06], jibHead, jibHead, [0.05, 0, 0.02], 8, 10), sailM);
  rodAB(g, bow, [0, 1.16, MZ], 0.0018, wire, 3);
  for (const s of [-1, 1]) rodAB(g, [s * (hw(h, 0.6) - 0.005), htop(h, 0.6), hz(h, 0.6)], [0, 1.16, MZ], 0.0016, wire, 3);
  rodAB(g, [0, htop(h, 0) + 0.005, hz(h, 0) + 0.01], [0, top, MZ], 0.0016, wire, 3);
  // Spreaders.
  rodAB(g, [-0.07, 0.86, MZ - 0.01], [0.07, 0.86, MZ - 0.01], 0.004, alu, 4);
  // Burgee at the masthead.
  put(g, cloth([0, top + 0.02, MZ], [0, top - 0.005, MZ - 0.12], [0, top + 0.06, MZ], [0, top + 0.06, MZ], [0.012, 0, 0], 3, 2), mat('fabric', { color: '#C8382F', side: DS }));
  // Rudder and tiller.
  put(g, new RoundedBoxGeometry(0.012, 0.2, 0.08, 1, 0.005), teak, [0, 0.07, hz(h, 0) - 0.04]);
  rodAB(g, [0, 0.2, hz(h, 0) - 0.03], [0, 0.22, hz(h, 0) + 0.2], 0.007, teak, 6);
  return g;
}

function yacht() {
  const g = new THREE.Group();
  const h: Hull = { L: 1.22, B: 0.46, D: 0.22, stern: 0.82, sheer: [0.0, 0.07], rise: [0.08, 0.6], e: 0.4, k: 0.6, thick: 0.014 };
  const white = mat('plastic', { color: '#F4F4F1' });
  const navy = mat('plastic', { color: '#1B2F4A' });
  const anti = mat('plastic', { color: '#5E2A26' });
  const teak = mat('wood', { color: '#B98856' });
  const steel = mat('metal', { color: '#DADDE0' });
  const tint = mat('glass', { color: '#18232E', opacity: 0.95 });
  hull(g, h, [[0.045, anti], [0.07, navy], [9, white]], white, white, 30, 8);
  gunwale(g, h, steel, [0.006, 0.006]);
  put(g, deck(h, 0.0, 1.0, { drop: 0.006, camber: 0.012, rings: 20 }), teak);
  // Swim platform.
  put(g, beam(hw(h, 0) * 2 - 0.02, 0.016, 0.08, 270), teak, [0, 0.08, hz(h, 0) - 0.04]);
  // Hull windows.
  for (const s of [-1, 1])
    for (const [t, len] of [[0.48, 0.12], [0.63, 0.08]]) {
      const y = 0.16;
      const x = hullX(h, t, y) + 0.002;
      const win = new THREE.CapsuleGeometry(0.01, len, 2, 8);
      win.rotateX(PI / 2);
      put(g, win, tint, [s * x, y, hz(h, t)], [0, 0, 0], [0.3, 1, 1]);
    }
  // Cabin: side profile extruded across the boat.
  const prof = (pts: [number, number][], width: number, m: THREE.Material, bevel = 0.012) => {
    const sh = new THREE.Shape();
    pts.forEach(([z, y], i) => (i ? sh.lineTo(-z, y) : sh.moveTo(-z, y)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3 });
    geo.rotateY(PI / 2);
    geo.translate(-(width - bevel * 2) / 2, 0, 0);
    put(g, geo, m);
  };
  const DY = htop(h, 0.5) - 0.01;
  prof([[-0.44, DY], [0.3, DY], [0.16, DY + 0.16], [-0.44, DY + 0.16]], 0.38, white);
  prof([[-0.36, DY + 0.06], [0.24, DY + 0.06], [0.16, DY + 0.135], [-0.36, DY + 0.135]], 0.388, tint, 0.004);
  // Flybridge.
  prof([[-0.4, DY + 0.16], [0.08, DY + 0.16], [0.02, DY + 0.24], [-0.32, DY + 0.24]], 0.3, white);
  prof([[-0.3, DY + 0.18], [0.05, DY + 0.18], [0.015, DY + 0.225], [-0.29, DY + 0.225]], 0.306, tint, 0.003);
  // Radar arch and dome.
  put(g, tube([[-0.13, DY + 0.24, -0.22], [-0.11, DY + 0.36, -0.25], [0, DY + 0.38, -0.25], [0.11, DY + 0.36, -0.25], [0.13, DY + 0.24, -0.22]], [0.012, 0.03], 20, 6), white);
  put(g, new THREE.CylinderGeometry(0.035, 0.035, 0.02, 14), white, [0, DY + 0.395, -0.25]);
  put(g, new THREE.SphereGeometry(0.03, 12, 8, 0, PI * 2, 0, PI / 2), white, [0, DY + 0.405, -0.25]);
  rodAB(g, [0.04, DY + 0.38, -0.25], [0.04, DY + 0.46, -0.25], 0.003, steel);
  // Rails around the flybridge and the bow pulpit.
  for (const s of [-1, 1]) {
    rodAB(g, [s * 0.15, DY + 0.3, -0.33], [s * 0.15, DY + 0.3, 0.02], 0.004, steel);
    for (const z of [-0.33, -0.15, 0.02]) rodAB(g, [s * 0.15, DY + 0.24, z], [s * 0.15, DY + 0.3, z], 0.003, steel);
    const pts: V3[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = 0.62 + (0.37 * i) / 8;
      pts.push([s * (hw(h, t) - 0.02), htop(h, t) + 0.06, hz(h, t)]);
      if (i % 2 === 0) rodAB(g, [s * (hw(h, t) - 0.02), htop(h, t), hz(h, t)], [s * (hw(h, t) - 0.02), htop(h, t) + 0.06, hz(h, t)], 0.003, steel);
    }
    put(g, tube(pts, 0.004, 16, 4), steel);
  }
  // Windshield frame + anchor.
  put(g, new THREE.BoxGeometry(0.08, 0.02, 0.02), steel, [0, htop(h, 0.98) - 0.03, hz(h, 0.98) + 0.012]);
  return g;
}

function pirateship() {
  const g = new THREE.Group();
  const h: Hull = { L: 0.98, B: 0.36, D: 0.3, stern: 0.68, sheer: [0.13, 0.09], rise: [0.08, 0.55], e: 0.65, k: 0.8, thick: 0.014 };
  const plank = mat('woodDark', { color: '#7A5638', repeat: [2, 3] });
  const pitch = mat('woodDark', { color: '#3A2E26', repeat: [2, 3] });
  const band = mat('woodPainted', { color: '#C59A3A', repeat: [2, 3] });
  const inner = mat('wood', { color: '#8A6444', repeat: [2, 3] });
  const deckM = mat('wood', { color: '#B08860' });
  const spar = mat('woodDark', { color: '#5A4330' });
  const iron = mat('iron');
  const sail = mat('fabric', { color: '#E8DDC3', side: DS });
  const ropeM = mat('rope', { color: '#5C4A36' });
  const glow = mat('glass', { color: '#FFC86A', glow: 1.6, opacity: 0.95 });
  hull(g, h, [[0.06, pitch], [0.19, plank], [0.23, band], [9, plank]], inner, plank, 26, 8, [1.6, 1]);
  gunwale(g, h, spar, [0.012, 0.009]);
  keel(g, h, spar, [0.008, 0.012]);
  put(g, deck(h, 0.0, 1.0, { drop: 0.07, camber: 0.01, inset: h.thick, rings: 16 }), deckM);
  // Raised quarterdeck at the stern, with a rail and glowing stern windows.
  const qy = htop(h, 0.2) - 0.02;
  put(g, deck(h, 0.0, 0.24, { y: qy, camber: 0.006, inset: h.thick, rings: 6 }), deckM);
  {
    const w = hullX(h, 0.24, qy, h.thick) * 2;
    put(g, new THREE.BoxGeometry(w, qy - (htop(h, 0.24) - 0.07), 0.012), plank, [0, (qy + htop(h, 0.24) - 0.07) / 2, hz(h, 0.24)]);
    put(g, new THREE.BoxGeometry(0.05, 0.06, 0.004), mat('woodDark', { color: '#2E231A' }), [0, htop(h, 0.24) - 0.04, hz(h, 0.24) + 0.007]);
    for (let i = 0; i < 4; i++) put(g, new THREE.BoxGeometry(0.035, 0.035, 0.01), glow, [-0.09 + i * 0.06, htop(h, 0) - 0.06, hz(h, 0) - 0.004]);
    put(g, new THREE.BoxGeometry(hw(h, 0) * 2, 0.012, 0.012), band, [0, htop(h, 0) - 0.035, hz(h, 0) - 0.006]);
    for (const s of [-1, 1]) {
      put(g, new THREE.CylinderGeometry(0.004, 0.004, 0.06, 5), iron, [s * 0.1, htop(h, 0) + 0.03, hz(h, 0) - 0.015]);
      put(g, new THREE.SphereGeometry(0.016, 10, 8), glow, [s * 0.1, htop(h, 0) + 0.07, hz(h, 0) - 0.015], [0, 0, 0], [1, 1.3, 1]);
    }
  }
  // Gun ports with cannons.
  for (const s of [-1, 1])
    for (const t of [0.34, 0.5, 0.66, 0.8]) {
      const y = 0.21;
      const x = hullX(h, t, y);
      put(g, new THREE.BoxGeometry(0.008, 0.032, 0.036), mat('woodDark', { color: '#15110E' }), [s * (x + 0.001), y, hz(h, t)]);
      put(g, new THREE.BoxGeometry(0.004, 0.036, 0.042), band, [s * (x + 0.0), y, hz(h, t)]);
      const c = new THREE.CylinderGeometry(0.008, 0.01, 0.06, 8);
      c.rotateZ(PI / 2);
      put(g, c, iron, [s * (x + 0.015), y, hz(h, t)]);
    }
  // Bowsprit and figurehead.
  const bowTop: V3 = [0, htop(h, 1) - 0.02, hz(h, 1)];
  const spritEnd: V3 = [0, bowTop[1] + 0.16, bowTop[2] + 0.28];
  poleAB(g, [0, bowTop[1] - 0.02, bowTop[2] - 0.1], spritEnd, 0.011, spar, 300, 8, 0.007);
  // Masts, yards and square sails billowing forward.
  const masts: { z: number; top: number; yards: [number, number][] }[] = [
    { z: 0.25, top: 1.2, yards: [[0.6, 0.36], [0.92, 0.28]] },
    { z: -0.02, top: 1.36, yards: [[0.62, 0.42], [0.98, 0.32]] },
  ];
  const deckY = (z: number) => htop(h, (z + h.L / 2) / h.L) - 0.07;
  masts.forEach(({ z, top, yards }, mi) => {
    poleAB(g, [0, deckY(z), z], [0, top, z], 0.015, spar, 310 + mi, 10, 0.009);
    yards.forEach(([y, w], yi) => {
      poleAB(g, [-w / 2, y, z + 0.02], [w / 2, y, z + 0.02], 0.007, spar, 320 + mi * 2 + yi, 6, 0.007);
      const bottom = yi === 0 ? 0.36 : yards[0][0] + 0.03;
      const bw = (yi === 0 ? w * 1.02 : yards[0][1] * 0.92) / 2;
      put(g, cloth([-w / 2 + 0.01, y - 0.01, z + 0.025], [w / 2 - 0.01, y - 0.01, z + 0.025], [-bw, bottom, z + 0.03], [bw, bottom, z + 0.03], [0, 0.0, 0.07], 8, 8), sail);
      // Sheets from the lower corners.
      if (yi === 0) for (const s of [-1, 1]) rodAB(g, [s * bw, bottom, z + 0.03], [s * (hullX(h, (z + 0.12 + h.L / 2) / h.L, deckY(z)) - 0.01), deckY(z) + 0.05, z - 0.12], 0.0015, ropeM, 3);
    });
    // Shrouds with a few ratlines.
    for (const s of [-1, 1]) {
      const t = (z + h.L / 2) / h.L;
      const base: V3 = [s * (hw(h, t) + 0.006), htop(h, t), z - 0.03];
      const tip: V3 = [s * 0.012, yards[0][0] + 0.03, z];
      for (const dz of [-0.04, 0.0]) rodAB(g, [base[0], base[1], base[2] + dz], tip, 0.0018, ropeM, 3);
      for (let i = 1; i < 4; i++) {
        const f = i / 4;
        const p: V3 = [base[0] + (tip[0] - base[0]) * f, base[1] + (tip[1] - base[1]) * f, base[2] - 0.02 + (tip[2] - base[2]) * f];
        rodAB(g, [p[0], p[1], p[2] - 0.022 * (1 - f)], [p[0], p[1], p[2] + 0.022 * (1 - f)], 0.0012, ropeM, 3);
      }
    }
  });
  // Crow's nest on the mainmast.
  put(g, new THREE.CylinderGeometry(0.045, 0.04, 0.035, 12, 1, true), mat('woodDark', { color: '#5A4330', side: DS }), [0, 1.07, -0.02]);
  put(g, new THREE.CylinderGeometry(0.04, 0.04, 0.006, 12), spar, [0, 1.055, -0.02]);
  // Mizzen with a gaff sail (fore-and-aft).
  const MZ = -0.3;
  poleAB(g, [0, qy, MZ], [0, 1.05, MZ], 0.012, spar, 330, 10, 0.008);
  poleAB(g, [0, 0.98, MZ - 0.01], [0, 1.04, MZ - 0.28], 0.006, spar, 331, 6);
  poleAB(g, [0, qy + 0.1, MZ - 0.01], [0, qy + 0.1, MZ - 0.33], 0.006, spar, 332, 6);
  put(g, cloth([0, qy + 0.11, MZ - 0.015], [0, qy + 0.11, MZ - 0.32], [0, 0.975, MZ - 0.015], [0, 1.03, MZ - 0.27], [0.045, 0, 0], 8, 8), sail);
  // Jib from the bowsprit to the foremast.
  put(g, cloth([0, spritEnd[1] - 0.06, spritEnd[2] - 0.08], [0, bowTop[1] + 0.06, bowTop[2] - 0.05], [0, 1.02, 0.27], [0, 1.02, 0.27], [0.05, 0, 0], 6, 8), sail);
  rodAB(g, spritEnd, [0, 1.12, 0.25], 0.0018, ropeM, 3);
  rodAB(g, [0, 1.18, 0.25], [0, 1.3, -0.02], 0.0018, ropeM, 3);
  rodAB(g, [0, 1.32, -0.02], [0, 1.04, MZ], 0.0018, ropeM, 3);
  // Black flag with skull and crossbones.
  const fx = 0.0;
  const fy = 1.36;
  const fz = -0.02;
  put(g, cloth([fx, fy, fz - 0.005], [fx, fy, fz - 0.17], [fx, fy - 0.1, fz - 0.005], [fx, fy - 0.1, fz - 0.17], [0.015, 0, 0], 6, 4), mat('fabric', { color: '#141416', side: DS }));
  const bone = mat('fabric', { color: '#EDE8DC' });
  for (const s of [-1, 1]) {
    const x = s * 0.0075 + fx + 0.013;
    put(g, new THREE.SphereGeometry(0.016, 10, 8), bone, [x, fy - 0.04, fz - 0.087], [0, 0, 0], [0.5, 1, 1]);
    for (const r of [0.75, -0.75]) put(g, new THREE.BoxGeometry(0.004, 0.006, 0.06), bone, [x, fy - 0.068, fz - 0.087], [r, 0, 0]);
  }
  put(g, new THREE.SphereGeometry(0.012, 8, 6), mat('gold', { color: '#C9A04A' }), [0, 1.37, -0.02]);
  return g;
}

const BUILDERS: Record<string, () => THREE.Group> = {
  fence,
  bench,
  lamp,
  campfire,
  table,
  mailbox,
  signpost,
  umbrella,
  deckchair,
  swing,
  slide,
  hammock,
  trampoline,
  treasure,
  telescope,
  lanterns,
  rowboat,
  duckboat,
  sailboat,
  yacht,
  pirateship,
};

/** Every id this family builds. */
export const PROP_IDS = Object.keys(BUILDERS);

/** Builds one object of this family, or null if the id isn't one of them. */
export function buildProps(id: string): THREE.Group | null {
  const make = BUILDERS[id];
  return make ? make() : null;
}
