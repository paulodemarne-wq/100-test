// Realistic island objects (Houses). Each fits one 1×1 cell, centered on the origin, base at y = 0, facing +z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm, mix, rng } from '../../creatures/real/noise';
import { loft, profile } from '../../creatures/real/loft';
import { pbr, type MaterialName, type MatOptions } from './materials';
import { leafCards } from './nature';

type V3 = [number, number, number];
type R = () => number;
type UVS = number | [number, number];
const PI = Math.PI;
const DS = THREE.DoubleSide;

// ─── Small helpers ───────────────────────────────────────────────────────────

const mat = (name: MaterialName, color?: string, o: MatOptions = {}) => pbr(name, color ? { ...o, color } : o);
const GLASS_LIT = () => pbr('glass', { glow: 0.8, color: '#FFD9A0' });
const GLASS = () => pbr('glass', { color: '#5E7686', opacity: 0.75 });
const DARK = () => mat('woodDark', '#2A211B');

function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scl: V3 = [1, 1, 1]): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(pos[0], pos[1], pos[2]);
  o.rotation.set(rot[0], rot[1], rot[2]);
  o.scale.set(scl[0], scl[1], scl[2]);
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}

function grp(parent: THREE.Object3D, pos: V3 = [0, 0, 0], rotY = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(pos[0], pos[1], pos[2]);
  g.rotation.y = rotY;
  parent.add(g);
  return g;
}

/** UVs projected on the dominant axis, in world units (s = texture tiles per unit), so texel size stays realistic. */
function planar<G extends THREE.BufferGeometry>(g: G, s: UVS = 6, swap = false, off: [number, number] = [0, 0]): G {
  const [su, sv] = typeof s === 'number' ? [s, s] : s;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = p.getX(i);
      v = p.getZ(i);
    } else if (ax >= az) {
      u = p.getZ(i);
      v = p.getY(i);
    } else {
      u = p.getX(i);
      v = p.getY(i);
    }
    if (swap) [u, v] = [v, u];
    uv[i * 2] = u * su + off[0];
    uv[i * 2 + 1] = v * sv + off[1];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function scaleUV<G extends THREE.BufferGeometry>(g: G, su: number, sv: number, swap = false): G {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i) * su;
    let v = uv.getY(i) * sv;
    if (swap) [u, v] = [v, u];
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  return g;
}

/** Flat-shaded copy (crisp facets for octagonal roofs, cut stones…). */
function facet(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  n.computeVertexNormals();
  return n;
}

const box = (w: number, h: number, d: number, s: UVS = 6, swap = false, off?: [number, number]) => planar(new THREE.BoxGeometry(w, h, d), s, swap, off);
const rbox = (w: number, h: number, d: number, rad = 0.01, s: UVS = 6, swap = false, seg = 1) =>
  planar(new RoundedBoxGeometry(w, h, d, seg, Math.min(rad, w / 2.01, h / 2.01, d / 2.01)), s, swap);

/** One board: the texture shows exactly one plank across its width. */
const board = (len: number, t: number, w: number, k: number, s = 6) => box(len, t, w, [s, 0.25 / w], false, [k * 0.37, (k % 4) * 0.25 + 0.125]);

function cyl(rt: number, rb: number, h: number, seg = 16, s = 6, o: { open?: boolean; swap?: boolean; t0?: number; tl?: number; hs?: number } = {}) {
  const tl = o.tl ?? PI * 2;
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, o.hs ?? 1, o.open ?? false, o.t0 ?? 0, tl);
  const circ = PI * (rt + rb) * (tl / (PI * 2));
  const su = tl >= PI * 2 - 1e-3 ? Math.max(1, Math.round(circ * s)) : circ * s;
  return scaleUV(g, su, h * s, o.swap);
}

function lathe(pts: [number, number][], seg = 24, s = 4, phiStart = 0, phiLength = PI * 2) {
  const g = new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    seg,
    phiStart,
    phiLength,
  );
  let len = 0;
  let maxR = 0;
  for (let i = 0; i < pts.length; i++) {
    maxR = Math.max(maxR, pts[i][0]);
    if (i) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return scaleUV(g, Math.max(1, Math.round(2 * PI * maxR * s * (phiLength / (2 * PI)))), len * s);
}

/** Smooth profile through a few (r, y) keys. */
function smoothProfile(keys: [number, number][], n = 20): [number, number][] {
  const c = new THREE.SplineCurve(keys.map(([x, y]) => new THREE.Vector2(x, y)));
  return c.getPoints(n).map((p) => [Math.max(0, p.x), p.y] as [number, number]);
}

function ext(shape: THREE.Shape, depth: number, bevel = 0.004, s: UVS = 6, swap = false, curveSegments = 10) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  return planar(g, s, swap);
}

function rectShape(w: number, h: number, y0 = 0): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, y0);
  s.lineTo(w / 2, y0);
  s.lineTo(w / 2, y0 + h);
  s.lineTo(-w / 2, y0 + h);
  s.closePath();
  return s;
}

/** Opening with a round top (bottom at y = 0). */
function archShape(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h - w / 2);
  s.absarc(0, h - w / 2, w / 2, 0, PI, false);
  s.closePath();
  return s;
}

/** U-shaped frame of width f around an opening (rectangular or arched). */
function frameShape(w: number, h: number, f: number, arch: boolean): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 - f, 0);
  if (arch) {
    s.lineTo(-w / 2 - f, h - w / 2);
    s.absarc(0, h - w / 2, w / 2 + f, PI, 0, true);
    s.lineTo(w / 2 + f, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, h - w / 2);
    s.absarc(0, h - w / 2, w / 2, 0, PI, false);
  } else {
    s.lineTo(-w / 2 - f, h + f);
    s.lineTo(w / 2 + f, h + f);
    s.lineTo(w / 2 + f, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, h);
    s.lineTo(-w / 2, h);
  }
  s.lineTo(-w / 2, 0);
  s.closePath();
  return s;
}

/** Walls of a gabled house: a pentagon (W wide, H to the eaves, + rise to the ridge) extruded D deep. */
function houseBody(W: number, H: number, rise: number, D: number, s: UVS, swap = false) {
  const sh = new THREE.Shape();
  sh.moveTo(-W / 2, 0);
  sh.lineTo(W / 2, 0);
  sh.lineTo(W / 2, H);
  sh.lineTo(0, H + rise);
  sh.lineTo(-W / 2, H);
  sh.closePath();
  return ext(sh, D, 0.004, s, swap, 1);
}

/** A two-slope roof (ridge along z) sitting on walls W wide whose eaves are at eaveY. */
function gableRoof(
  parent: THREE.Object3D,
  W: number,
  D: number,
  eaveY: number,
  rise: number,
  m: THREE.Material,
  o: { over?: number; overZ?: number; t?: number; s?: UVS; trim?: THREE.Material; ridge?: THREE.Material | null } = {},
) {
  const over = o.over ?? 0.06;
  const overZ = o.overZ ?? over;
  const t = o.t ?? 0.03;
  const a = Math.atan2(rise, W / 2);
  const L = Math.hypot(W / 2, rise) + over;
  for (const sd of [-1, 1]) {
    const dx = Math.cos(a) * sd;
    const dy = -Math.sin(a);
    const nx = Math.sin(a) * sd;
    const ny = Math.cos(a);
    const cx = (dx * L) / 2 + (nx * t) / 2;
    const cy = eaveY + rise + (dy * L) / 2 + (ny * t) / 2;
    put(parent, box(L, t, D + 2 * overZ, o.s ?? 3.5, true), m, [cx, cy, 0], [0, 0, -a * sd]);
    if (o.trim)
      for (const zs of [-1, 1])
        put(parent, box(L + 0.004, t * 1.7, 0.012), o.trim, [cx - nx * t * 0.25, cy - ny * t * 0.25, zs * (D / 2 + overZ + 0.006)], [0, 0, -a * sd]);
  }
  if (o.ridge !== null) {
    const ry = eaveY + rise + t / Math.cos(a) - t * 0.25;
    put(parent, cyl(t * 0.85, t * 0.85, D + 2 * overZ + 0.012, 10, 4), o.ridge ?? m, [0, ry, 0], [PI / 2, 0, 0]);
  }
}

type WinOpt = { w: number; h: number; lit?: boolean; frame?: THREE.Material; shutters?: string; flowers?: boolean; mullion?: boolean; arch?: boolean; sill?: THREE.Material };

/** A window on a wall: dark recess, glass, frame, cross bars, sill, optional shutters and flower box. Outward = +z of the group. */
function windowAt(parent: THREE.Object3D, pos: V3, rotY: number, o: WinOpt, r: R) {
  const g = grp(parent, pos, rotY);
  const fm = o.frame ?? mat('plaster', '#F3F0EA');
  const f = Math.max(0.012, o.w * 0.1);
  const y0 = -o.h / 2;
  const shape = o.arch ? archShape(o.w, o.h) : rectShape(o.w, o.h);
  put(g, ext(shape, 0.006, 0), DARK(), [0, y0, 0.002]);
  put(g, ext(shape, 0.003, 0), o.lit ? GLASS_LIT() : GLASS(), [0, y0, 0.006]);
  put(g, ext(frameShape(o.w, o.h, f, !!o.arch), 0.016, 0.002), fm, [0, y0, 0.008]);
  if (o.mullion !== false) {
    put(g, box(f * 0.45, o.h - 0.004, 0.008), fm, [0, 0, 0.009]);
    put(g, box(o.w - 0.004, f * 0.45, 0.008), fm, [0, o.arch ? y0 + (o.h - o.w / 2) : 0, 0.009]);
  }
  put(g, rbox(o.w + 0.05, 0.016, 0.04, 0.004, 5), o.sill ?? mat('stone', '#C8C1B4'), [0, y0 - 0.008, 0.016]);
  if (o.shutters) {
    const sm = mat('woodPainted', o.shutters);
    for (const sd of [-1, 1]) {
      const sg = grp(g, [sd * (o.w / 2 + f + 0.002), 0, 0.012], sd * 0.12);
      put(sg, box(o.w * 0.5, o.h + 0.01, 0.01, 7, true), sm, [sd * o.w * 0.25, 0, 0]);
      put(sg, box(o.w * 0.5, 0.008, 0.012), sm, [sd * o.w * 0.25, o.h * 0.3, 0.003]);
      put(sg, box(o.w * 0.5, 0.008, 0.012), sm, [sd * o.w * 0.25, -o.h * 0.3, 0.003]);
    }
  }
  if (o.flowers) {
    put(g, box(o.w + 0.03, 0.035, 0.04, 6), mat('wood', '#7B5A3E'), [0, y0 - 0.038, 0.032]);
    flowerTuft(g, [0, y0 - 0.02, 0.032], o.w * 0.45, 0.018, 9, r, ['#C8323C', '#E85A6A', '#F1E4C8']);
  }
  return g;
}

/** Little foliage + blossoms clump (flower boxes, borders). */
function flowerTuft(parent: THREE.Object3D, c: V3, sx: number, sz: number, n: number, r: R, colors: string[]) {
  const leafGeo = new THREE.IcosahedronGeometry(0.016, 0);
  planar(leafGeo, 6);
  const flowerGeo = new THREE.IcosahedronGeometry(0.009, 0);
  planar(flowerGeo, 6);
  for (let i = 0; i < n; i++) {
    const x = c[0] + (r() - 0.5) * 2 * sx;
    const z = c[2] + (r() - 0.5) * 2 * sz;
    put(parent, leafGeo, mat('leaves', i % 2 ? '#4E7A35' : '#5F8C3E'), [x, c[1] + 0.006 + r() * 0.01, z], [r() * 3, r() * 3, 0], [1, 0.8, 1]);
    put(parent, flowerGeo, mat('leaves', colors[i % colors.length]), [x + (r() - 0.5) * 0.02, c[1] + 0.02 + r() * 0.012, z + 0.006]);
  }
}

type DoorOpt = { w: number; h: number; color?: string; m?: THREE.Material; arch?: boolean; frame?: THREE.Material; knob?: THREE.Material; hinges?: boolean; glass?: boolean };

/** A door on a wall (bottom at pos.y), planks running vertically, frame, handle. Outward = +z. */
function doorAt(parent: THREE.Object3D, pos: V3, rotY: number, o: DoorOpt) {
  const g = grp(parent, pos, rotY);
  const shape = o.arch ? archShape(o.w, o.h) : rectShape(o.w, o.h);
  put(g, ext(shape, 0.006, 0), DARK(), [0, 0, 0.002]);
  const dm = o.m ?? (o.color ? mat('woodPainted', o.color) : mat('woodDark'));
  put(g, ext(shape, 0.012, 0.002, [7, 7], true), dm, [0, 0, 0.007]);
  if (o.glass) put(g, ext(o.arch ? archShape(o.w * 0.6, o.h * 0.42) : rectShape(o.w * 0.6, o.h * 0.35), 0.004, 0), GLASS_LIT(), [0, o.h * 0.5, 0.015]);
  const f = Math.max(0.014, o.w * 0.11);
  put(g, ext(frameShape(o.w, o.h, f, !!o.arch), 0.02, 0.003, 6), o.frame ?? mat('plaster', '#F0ECE4'), [0, 0, 0.01]);
  const km = o.knob ?? mat('gold', '#C9A45C');
  put(g, new THREE.SphereGeometry(0.008, 8, 6), km, [o.w * 0.32, o.h * 0.45, 0.02]);
  if (o.hinges)
    for (const y of [0.22, 0.72]) put(g, box(o.w * 0.7, 0.012, 0.004), mat('iron'), [-o.w * 0.12, o.h * y, 0.016]);
  return g;
}

function rope(parent: THREE.Object3D, a: V3, b: V3, rad = 0.004, m: THREE.Material = mat('rope'), seg = 5) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const o = put(parent, cyl(rad, rad, len, seg, 30, { open: true }), m);
  o.position.copy(va).add(vb).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return o;
}

function lantern(parent: THREE.Object3D, pos: V3, sc = 1) {
  const g = grp(parent, pos);
  g.scale.setScalar(sc);
  const iron = mat('iron');
  put(g, box(0.04, 0.008, 0.04), iron, [0, 0, 0]);
  put(g, box(0.028, 0.044, 0.028), GLASS_LIT(), [0, 0.026, 0]);
  put(g, new THREE.SphereGeometry(0.009, 8, 6), pbr('glass', { glow: 2, color: '#FFC870' }), [0, 0.024, 0]);
  for (const x of [-1, 1]) for (const z of [-1, 1]) put(g, box(0.005, 0.048, 0.005), iron, [x * 0.016, 0.026, z * 0.016]);
  put(g, planar(new THREE.ConeGeometry(0.03, 0.025, 4), 6), iron, [0, 0.062, 0], [0, PI / 4, 0]);
  put(g, new THREE.TorusGeometry(0.008, 0.002, 4, 10), iron, [0, 0.08, 0]);
  return g;
}

/** A rough stone (smooth, noisy, flat-bottomed). */
function rockGeo(r: R, size: number, flat = 0.6, detail = 1): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(size, detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const seed = Math.floor(r() * 1000);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm(v.x / size * 1.3 + seed, v.y / size * 1.3 + v.z / size * 1.1, seed, 3);
    v.multiplyScalar(0.72 + n * 0.55);
    v.y *= flat;
    if (v.y < 0) v.y *= 0.35;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return planar(g, 3);
}

function bush(parent: THREE.Object3D, c: V3, radius: number, count: number, r: R, color = '#4F7A3A') {
  // The leaf texture is already green: the tint only nudges it (light colors).
  const t = new THREE.Color(color).lerp(new THREE.Color('#FFFFFF'), 0.5);
  parent.add(leafCards(new THREE.Vector3(...c), radius, count, r, t));
}

function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ─── Houses ────────────────────────────────────────────────────────────────

function tent(r: R): THREE.Group {
  const g = new THREE.Group();
  const W = 0.78;
  const H = 0.56;
  const L = 0.72;
  const canvas = mat('fabric', '#B8793F', { side: DS });
  const canvasDark = mat('fabric', '#7E5130', { side: DS });
  const shell = (k: number) => {
    const s = new THREE.Shape();
    const w = W / 2 - k;
    s.moveTo(-w, k * 0.3);
    s.quadraticCurveTo(-W * 0.215 + k, H * 0.44, 0, H - k * 1.3);
    s.quadraticCurveTo(W * 0.215 - k, H * 0.44, w, k * 0.3);
    s.closePath();
    return s;
  };
  const outer = shell(0);
  outer.holes.push(shell(0.012));
  const body = new THREE.ExtrudeGeometry(outer, { depth: L, bevelEnabled: false, curveSegments: 10 });
  body.translate(0, 0, -L / 2);
  put(g, planar(body, 4), canvas);
  // Back wall and ground sheet.
  put(g, planar(new THREE.ShapeGeometry(shell(0.006), 10), 4), canvasDark, [0, 0, -L / 2 + 0.004]);
  put(g, box(W - 0.04, 0.006, L, 4), mat('fabric', '#3E4A35'), [0, 0.003, 0]);
  // Door flaps tied back on each side.
  for (const sd of [-1, 1]) {
    const f = new THREE.Shape();
    f.moveTo(0, H - 0.02);
    f.lineTo(sd * (W / 2 - 0.01), 0);
    f.lineTo(sd * (W / 2 - 0.15), 0);
    f.quadraticCurveTo(sd * 0.1, 0.18, 0, H - 0.08);
    f.closePath();
    put(g, planar(new THREE.ShapeGeometry(f, 6), 4), canvas, [0, 0, L / 2 + 0.006]);
    put(g, cyl(0.016, 0.016, 0.26, 8, 4), canvas, [sd * 0.24, 0.17, L / 2 + 0.014], [0, 0, sd * 0.97]);
    put(g, new THREE.TorusGeometry(0.018, 0.003, 4, 10), mat('rope'), [sd * 0.24, 0.17, L / 2 + 0.014], [0, PI / 2, sd * 0.97]);
  }
  // Ridge seam, poles, guy lines and pegs.
  put(g, cyl(0.009, 0.009, L + 0.02, 8, 4), canvasDark, [0, H - 0.004, 0], [PI / 2, 0, 0]);
  const pole = mat('woodDark');
  for (const zs of [-1, 1]) {
    put(g, cyl(0.007, 0.008, H + 0.05, 6, 6), pole, [0, (H + 0.05) / 2, zs * (L / 2 + 0.012)]);
    rope(g, [0, H + 0.035, zs * (L / 2 + 0.012)], [0, 0.012, zs * (L / 2 + 0.2)], 0.0025);
    put(g, box(0.012, 0.04, 0.012), mat('wood'), [0, 0.012, zs * (L / 2 + 0.2)], [zs * 0.3, 0, 0]);
  }
  for (const sx of [-1, 1])
    for (const zs of [-1, 1]) {
      rope(g, [sx * 0.29, 0.12, zs * 0.22], [sx * 0.49, 0.012, zs * 0.3], 0.0022);
      put(g, box(0.01, 0.035, 0.01), mat('wood'), [sx * 0.49, 0.01, zs * 0.3], [0, 0, -sx * 0.3]);
    }
  // Inside: a rolled sleeping bag. Outside: a lantern and a log seat.
  put(g, cyl(0.05, 0.05, 0.32, 12, 4), mat('fabric', '#4C6A3A'), [-0.14, 0.05, -0.08], [PI / 2, 0, 0]);
  lantern(g, [0.3, 0, L / 2 + 0.12], 1.2);
  put(g, cyl(0.05, 0.055, 0.09, 12, 6), mat('bark'), [-0.33, 0.045, L / 2 + 0.1]);
  put(g, cyl(0.05, 0.05, 0.002, 12, 6), mat('wood', '#D2B48C'), [-0.33, 0.091, L / 2 + 0.1]);
  void r;
  return g;
}

function doghouse(r: R): THREE.Group {
  const g = new THREE.Group();
  const W = 0.5;
  const D = 0.46;
  const H = 0.38;
  const rise = 0.22;
  const B = 0.03;
  for (const x of [-0.2, 0.2]) put(g, box(0.04, B, D + 0.04, 6), mat('woodDark'), [x, B / 2, 0]);
  put(g, houseBody(W, H, rise, D, 6.5), mat('woodPainted', '#9A3B2E'), [0, B, 0]);
  gableRoof(g, W, D, B + H, rise, mat('slate', '#6E6A66'), { over: 0.06, overZ: 0.06, t: 0.024, s: 4.5, trim: mat('woodPainted', '#ECE6DA') });
  const white = mat('woodPainted', '#ECE6DA');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(g, box(0.024, H, 0.024, 6, true), white, [sx * (W / 2 - 0.008), B + H / 2, sz * (D / 2 - 0.008)]);
  // Arched doorway (dark inside, straw on the floor), white trim.
  put(g, ext(archShape(0.22, 0.27), 0.01, 0), mat('woodDark', '#120D0A'), [0, B + 0.004, D / 2 + 0.002]);
  put(g, ext(frameShape(0.22, 0.27, 0.024, true), 0.018, 0.003), white, [0, B, D / 2 + 0.01]);
  put(g, box(0.2, 0.012, 0.05, 4), mat('thatch'), [0, B + 0.006, D / 2 + 0.018], [0.15, 0, 0]);
  // Name plate.
  put(g, rbox(0.15, 0.045, 0.012, 0.004, 6), mat('wood', '#C49A6C'), [0, B + H + 0.08, D / 2 + 0.01]);
  for (const x of [-0.06, 0.06]) put(g, new THREE.SphereGeometry(0.004, 6, 4), mat('iron'), [x, B + H + 0.08, D / 2 + 0.017]);
  // Food bowl with kibble, and a bone.
  put(g, lathe([[0.001, 0], [0.05, 0], [0.062, 0.035], [0.058, 0.037], [0.046, 0.014], [0.001, 0.014]], 20, 6), mat('metal', '#A8B2BA'), [0.18, 0, 0.38]);
  const kib = new THREE.IcosahedronGeometry(0.008, 0);
  planar(kib, 6);
  for (let i = 0; i < 9; i++) put(g, kib, mat('wood', '#7A4A28'), [0.18 + (r() - 0.5) * 0.06, 0.022, 0.38 + (r() - 0.5) * 0.06], [r(), r(), 0]);
  const bone = grp(g, [-0.17, 0.012, 0.36], 0.6);
  const bm = mat('plaster', '#EDE6D8');
  put(bone, cyl(0.01, 0.01, 0.09, 8, 4), bm, [0, 0, 0], [0, 0, PI / 2]);
  for (const x of [-0.045, 0.045]) for (const z of [-0.011, 0.011]) put(bone, new THREE.SphereGeometry(0.013, 8, 6), bm, [x, 0, z]);
  return g;
}

function cabin(r: R): THREE.Group {
  const g = new THREE.Group();
  const W = 0.82;
  const D = 0.66;
  const B = 0.05;
  const lr = 0.036;
  const rows = 7;
  const H = rows * lr * 2;
  const rise = 0.3;
  put(g, box(W + 0.06, B, D + 0.06, 4.5), mat('stone', '#8F8A80'), [0, B / 2, 0]);
  // Chinking behind the logs.
  put(g, box(W - 0.04, H, D - 0.04, 3), mat('plaster', '#B9AC96'), [0, B + H / 2, 0]);
  const logMats = ['#C9B39A', '#BBA488', '#D2BDA2'].map((c) => mat('wood', c));
  for (let i = 0; i < rows; i++) {
    const y = B + lr + i * lr * 2;
    for (const zs of [-1, 1]) {
      const m = logMats[(i + (zs > 0 ? 0 : 1)) % 3];
      put(g, cyl(lr, lr, W + 0.1 + (r() - 0.5) * 0.02, 12, 6, { swap: true, t0: PI }), m, [0, y, zs * (D / 2 - lr)], [0, 0, PI / 2]);
    }
    for (const xs of [-1, 1]) {
      const m = logMats[(i + (xs > 0 ? 2 : 1)) % 3];
      put(g, cyl(lr, lr, D + 0.1 + (r() - 0.5) * 0.02, 12, 6, { swap: true, t0: PI }), m, [xs * (W / 2 - lr), y + lr * 0.9, 0], [-PI / 2, 0, 0]);
    }
  }
  // Gables in vertical boards.
  const gable = new THREE.Shape();
  gable.moveTo(-W / 2, 0);
  gable.lineTo(W / 2, 0);
  gable.lineTo(0, rise);
  gable.closePath();
  for (const zs of [-1, 1]) put(g, ext(gable, 0.02, 0.002, 7, true), mat('woodDark', '#7A5638'), [0, B + H, zs * (D / 2 - 0.02)]);
  gableRoof(g, W, D, B + H, rise, mat('slate', '#7A6656'), { over: 0.08, overZ: 0.08, t: 0.03, s: 4.5, trim: mat('woodDark') });
  // Stone chimney on the right side.
  const top = B + H + rise + 0.14;
  put(g, box(0.15, top, 0.16, 4.5), mat('stone', '#9C958A'), [W / 2 + 0.065, top / 2, -0.05]);
  put(g, box(0.18, 0.025, 0.19, 4.5), mat('stone', '#7E786E'), [W / 2 + 0.065, top + 0.012, -0.05]);
  // Door, window, step, lantern.
  doorAt(g, [-0.17, B, D / 2 + 0.002], 0, { w: 0.17, h: 0.3, m: mat('woodDark', '#6A4A30'), frame: mat('woodDark'), knob: mat('iron'), hinges: true });
  put(g, rbox(0.25, 0.035, 0.08, 0.008, 4), mat('stone', '#A8A196'), [-0.17, B - 0.015, D / 2 + 0.045]);
  windowAt(g, [0.19, B + 0.28, D / 2 + 0.004], 0, { w: 0.17, h: 0.15, lit: true, frame: mat('wood', '#8A6240') }, r);
  windowAt(g, [-W / 2 - 0.004, B + 0.28, 0], -PI / 2, { w: 0.15, h: 0.14, lit: false, frame: mat('wood', '#8A6240') }, r);
  lantern(g, [0.0, B + 0.26, D / 2 + 0.03], 0.9);
  // Firewood stack against the left wall.
  for (let i = 0; i < 9; i++) {
    const row = i < 4 ? 0 : i < 7 ? 1 : 2;
    const k = i < 4 ? i : i < 7 ? i - 4 : i - 7;
    put(g, cyl(0.026, 0.026, 0.18, 8, 6, { swap: true }), mat('bark'), [-W / 2 - 0.05, 0.026 + row * 0.046, 0.12 + (k - 1.5 + row * 0.5) * 0.054], [0, 0, PI / 2]);
  }
  return g;
}

function cottage(r: R): THREE.Group {
  const g = new THREE.Group();
  const W = 0.84;
  const D = 0.62;
  const H = 0.47;
  const rise = 0.32;
  const F = 0.06;
  put(g, box(W + 0.04, F, D + 0.04, 4.5), mat('stone', '#9A9387'), [0, F / 2, 0]);
  put(g, houseBody(W, H, rise, D, 2.5), mat('plaster', '#EFE6D2'), [0, F, 0]);
  // Stone quoins at the corners.
  const quoin = mat('stone', '#CBC3B2');
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      for (let k = 0; k < 8; k++) {
        const bx = k % 2 ? 0.09 : 0.055;
        const bz = k % 2 ? 0.055 : 0.09;
        put(g, box(bx, 0.052, bz, 5), quoin, [sx * (W / 2 - bx / 2 + 0.008), F + 0.028 + k * 0.058, sz * (D / 2 - bz / 2 + 0.008)]);
      }
  gableRoof(g, W, D, F + H, rise, mat('roofTiles', '#B0533A'), { over: 0.07, overZ: 0.06, t: 0.032, s: 3.6, trim: mat('plaster', '#F0ECE4'), ridge: mat('roofTiles', '#8F3F2C') });
  // Brick chimney with pots.
  const chTop = F + H + rise + 0.16;
  const chY0 = F + H;
  put(g, box(0.13, chTop - chY0, 0.13, 5.5), mat('brick', '#B9705A'), [0.25, (chTop + chY0) / 2, -0.12]);
  put(g, rbox(0.16, 0.025, 0.16, 0.005, 4), mat('stone', '#A8A196'), [0.25, chTop + 0.012, -0.12]);
  for (const x of [0.22, 0.28]) put(g, cyl(0.022, 0.027, 0.06, 10, 4), mat('roofTiles', '#9C4B34'), [x, chTop + 0.055, -0.12]);
  // Front: door with stone surround, step, windows with shutters and flower boxes.
  doorAt(g, [0, F, D / 2 + 0.004], 0, { w: 0.16, h: 0.29, color: '#3D5C49', arch: true, frame: mat('stone', '#CBC3B2') });
  put(g, rbox(0.26, 0.04, 0.09, 0.008, 4), mat('stone', '#A39C90'), [0, F - 0.02, D / 2 + 0.05]);
  put(g, rbox(0.32, 0.03, 0.1, 0.008, 4), mat('stone', '#938C80'), [0, 0.015, D / 2 + 0.09]);
  for (const sx of [-1, 1]) windowAt(g, [sx * 0.26, F + 0.27, D / 2 + 0.004], 0, { w: 0.15, h: 0.17, lit: sx > 0, shutters: '#5F7D8E', flowers: true }, r);
  for (const sx of [-1, 1]) windowAt(g, [sx * (W / 2 + 0.004), F + 0.27, 0.02], sx * PI / 2, { w: 0.14, h: 0.16, lit: false, shutters: '#5F7D8E' }, r);
  // Round attic window in the front gable.
  put(g, new THREE.TorusGeometry(0.05, 0.011, 6, 20), mat('plaster', '#F3F0EA'), [0, F + H + 0.12, D / 2 + 0.01]);
  put(g, planar(new THREE.CircleGeometry(0.05, 18), 4), GLASS_LIT(), [0, F + H + 0.12, D / 2 + 0.008]);
  put(g, box(0.1, 0.006, 0.006), mat('plaster', '#F3F0EA'), [0, F + H + 0.12, D / 2 + 0.012]);
  put(g, box(0.006, 0.1, 0.006), mat('plaster', '#F3F0EA'), [0, F + H + 0.12, D / 2 + 0.012]);
  lantern(g, [0.13, F + 0.27, D / 2 + 0.02], 0.85);
  bush(g, [-0.41, 0.08, D / 2 + 0.03], 0.09, 22, r, '#557F3C');
  bush(g, [0.42, 0.07, D / 2 + 0.02], 0.08, 18, r, '#4B7536');
  flowerTuft(g, [-0.41, 0.1, D / 2 + 0.06], 0.06, 0.03, 6, r, ['#E8C3D8', '#F4F0E4']);
  return g;
}

function mushroom(r: R): THREE.Group {
  const g = new THREE.Group();
  // Stem: bulbous base, slight taper, a hanging ring (annulus) under the cap.
  const stemProf = smoothProfile([[0.001, 0], [0.33, 0.0], [0.34, 0.06], [0.3, 0.2], [0.27, 0.4], [0.25, 0.58], [0.24, 0.64]], 14);
  const stem = lathe(stemProf, 24, 2.5);
  bumpLathe(stem, 0.012, r);
  put(g, stem, mat('plaster', '#EFE6D3'));
  put(g, lathe([[0.25, 0.47], [0.31, 0.44], [0.33, 0.42], [0.32, 0.415], [0.26, 0.44]], 32, 3), mat('plaster', '#E6DCC6', { side: DS }));
  // Cap: dome with a thick rim, gills underneath.
  const capProf = smoothProfile([[0.14, 0.56], [0.48, 0.56], [0.57, 0.6], [0.58, 0.64], [0.55, 0.74], [0.45, 0.88], [0.28, 0.98], [0.001, 1.02]], 18);
  const cap = lathe(capProf, 30, 2);
  bumpLathe(cap, 0.01, r);
  put(g, cap, mat('plaster', '#B8261C'));
  // Gills: thin radial blades.
  const gill = box(0.3, 0.024, 0.004, 4);
  const gm = mat('plaster', '#E7D9BE');
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * PI * 2;
    put(g, gill, gm, [Math.sin(a) * 0.32, 0.55, Math.cos(a) * 0.32], [0, a + PI / 2, 0]);
  }
  // White warts on the cap.
  const capR = (y: number) => {
    for (let i = 1; i < capProf.length; i++) if (capProf[i][1] >= y) {
      const t = (y - capProf[i - 1][1]) / (capProf[i][1] - capProf[i - 1][1] || 1);
      return mix(capProf[i - 1][0], capProf[i][0], t);
    }
    return 0;
  };
  const wart = mat('plaster', '#F3EEE2');
  for (let i = 0; i < 20; i++) {
    const y = 0.68 + r() * 0.32;
    const a = r() * PI * 2;
    const rr = capR(y);
    const n = new THREE.Vector3(Math.sin(a) * rr, (y - 0.6) * 0.9, Math.cos(a) * rr).normalize();
    const s = 0.022 + r() * 0.03;
    const o = put(g, rockGeo(r, s, 0.45, 0), wart, [Math.sin(a) * rr, y, Math.cos(a) * rr]);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  }
  // Fairy door, round windows, steps, lantern.
  doorAt(g, [0, 0.03, 0.31], 0, { w: 0.15, h: 0.25, m: mat('woodDark', '#6B4428'), arch: true, frame: mat('wood', '#8A603C'), knob: mat('gold'), hinges: true });
  for (const [x, y, a] of [[0.19, 0.33, 0.6], [-0.13, 0.36, -0.55]] as const) {
    const w = grp(g, [Math.sin(a) * 0.285, y, Math.cos(a) * 0.285], a);
    put(w, new THREE.TorusGeometry(0.045, 0.01, 6, 18), mat('wood', '#8A603C'), [0, 0, 0.004]);
    put(w, planar(new THREE.CircleGeometry(0.045, 16), 4), GLASS_LIT(), [0, 0, 0]);
    put(w, box(0.09, 0.005, 0.006), mat('wood', '#8A603C'), [0, 0, 0.004]);
    put(w, box(0.005, 0.09, 0.006), mat('wood', '#8A603C'), [0, 0, 0.004]);
    void x;
  }
  for (let i = 0; i < 3; i++) put(g, rockGeo(r, 0.05, 0.35), mat('rock', '#A39C90'), [(i - 1) * 0.07, 0.008, 0.41 + (i % 2) * 0.03]);
  lantern(g, [0.13, 0.25, 0.3], 0.9);
  bush(g, [-0.33, 0.06, -0.05], 0.09, 20, r, '#5B7F3A');
  flowerTuft(g, [0.28, 0.02, 0.24], 0.05, 0.04, 6, r, ['#F2E6A0', '#FFFFFF']);
  return g;
}

/** Random radial bumps on a lathe (organic surfaces). */
function bumpLathe(geo: THREE.BufferGeometry, amp: number, r: R) {
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const seed = Math.floor(r() * 100);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const rad = Math.hypot(x, z);
    if (rad < 1e-3) continue;
    const a = Math.atan2(x, z);
    const n = fbm(Math.cos(a) * 2 + seed, Math.sin(a) * 2 + p.getY(i) * 6, seed, 3) - 0.5;
    const k = 1 + (n * amp * 2) / rad;
    p.setXYZ(i, x * k, p.getY(i), z * k);
  }
  geo.computeVertexNormals();
}

function castle(r: R): THREE.Group {
  const g = new THREE.Group();
  const stone = mat('stone', '#B3AC9E');
  const stoneDark = mat('stone', '#99928A');
  const W = 0.72;
  const D = 0.5;
  const H = 0.58;
  put(g, box(W + 0.08, 0.06, D + 0.08, 4.5), stoneDark, [0, 0.03, 0]);
  put(g, box(W, H, D, 4.5), stone, [0, H / 2, 0]);
  // Corbelled parapet + merlons.
  put(g, box(W + 0.03, 0.025, D + 0.03, 4.5), stoneDark, [0, H + 0.0125, 0]);
  const merlon = rbox(0.07, 0.075, 0.05, 0.005, 4.5);
  for (let i = 0; i < 6; i++) for (const zs of [-1, 1]) put(g, merlon, stone, [-W / 2 + 0.05 + i * ((W - 0.1) / 5), H + 0.06, zs * (D / 2 - 0.01)]);
  for (let i = 1; i < 4; i++) for (const xs of [-1, 1]) put(g, merlon, stone, [xs * (W / 2 - 0.01), H + 0.06, -D / 2 + i * (D / 4)], [0, PI / 2, 0]);
  // Round towers with slate cones.
  for (const xs of [-1, 1]) {
    const x = xs * 0.42;
    put(g, cyl(0.17, 0.19, 0.08, 24, 4.5), stoneDark, [x, 0.04, 0]);
    put(g, cyl(0.15, 0.17, 0.95, 24, 4.5), stone, [x, 0.475, 0]);
    put(g, cyl(0.185, 0.15, 0.06, 24, 4.5), stoneDark, [x, 0.95 + 0.02, 0]);
    put(g, cyl(0.19, 0.19, 0.06, 24, 4.5), stone, [x, 1.03, 0]);
    put(g, lathe([[0.215, 0], [0.2, 0.04], [0.12, 0.2], [0.04, 0.38], [0.004, 0.44]], 24, 3.5), mat('slate', '#5A6370'), [x, 1.05, 0]);
    put(g, new THREE.SphereGeometry(0.016, 10, 8), mat('gold'), [x, 1.5, 0]);
    // Arrow slits and a lit window.
    for (const [y, a] of [[0.3, 0.4], [0.62, -0.3], [0.45, xs * 1.2]] as const) {
      const w = grp(g, [x + Math.sin(a) * 0.162, y, Math.cos(a) * 0.162], a);
      put(w, box(0.016, 0.09, 0.01), DARK());
      put(w, box(0.034, 0.012, 0.012), stoneDark, [0, -0.05, 0]);
    }
    const lw = grp(g, [x + Math.sin(xs * -0.25) * 0.152, 0.8, Math.cos(xs * -0.25) * 0.152], xs * -0.25);
    put(lw, ext(archShape(0.05, 0.08), 0.01, 0), GLASS_LIT());
    put(lw, ext(frameShape(0.05, 0.08, 0.012, true), 0.014, 0.002, 4.5), stoneDark, [0, 0, 0.002]);
  }
  // Gate: stone voussoir arch, oak doors with iron studs.
  put(g, ext(archShape(0.2, 0.3), 0.012, 0), DARK(), [0, 0.06, D / 2 + 0.002]);
  const dg = grp(g, [0, 0.06, D / 2 + 0.008]);
  put(dg, ext(archShape(0.2, 0.3), 0.012, 0.002, [7, 7], true), mat('woodDark', '#5A3E28'));
  for (const y of [0.06, 0.15, 0.24]) put(dg, box(0.2, 0.012, 0.016), mat('iron'), [0, y, 0.002]);
  put(dg, box(0.004, 0.27, 0.016), DARK(), [0, 0.13, 0.002]);
  for (const y of [0.06, 0.15, 0.24]) for (const x of [-0.07, -0.025, 0.025, 0.07]) put(dg, new THREE.SphereGeometry(0.005, 6, 4), mat('iron'), [x, y, 0.01]);
  put(g, ext(frameShape(0.2, 0.3, 0.04, true), 0.04, 0.004, 4.5), mat('stone', '#C5BEB0'), [0, 0.06, D / 2 + 0.012]);
  put(g, rbox(0.04, 0.05, 0.05, 0.004, 4.5), mat('stone', '#C5BEB0'), [0, 0.06 + 0.3 + 0.03, D / 2 + 0.02]);
  // Lit window above the gate, two hanging banners.
  windowAt(g, [0, 0.47, D / 2 + 0.002], 0, { w: 0.07, h: 0.1, lit: true, arch: true, frame: mat('stone', '#C5BEB0'), mullion: false }, r);
  for (const xs of [-1, 1]) {
    const bx = xs * 0.2;
    const sh = new THREE.Shape();
    sh.moveTo(-0.045, 0);
    sh.lineTo(0.045, 0);
    sh.lineTo(0.045, -0.2);
    sh.lineTo(0, -0.24);
    sh.lineTo(-0.045, -0.2);
    sh.closePath();
    put(g, ext(sh, 0.004, 0, 6), mat('fabric', '#8E2424'), [bx, H - 0.03, D / 2 + 0.006]);
    put(g, cyl(0.004, 0.004, 0.11, 6, 6), mat('gold'), [bx, H - 0.028, D / 2 + 0.01], [0, 0, PI / 2]);
    put(g, box(0.03, 0.03, 0.004), mat('gold', '#D9B25A'), [bx, H - 0.11, D / 2 + 0.01], [0, 0, PI / 4]);
  }
  // Flag on the right tower.
  put(g, cyl(0.005, 0.005, 0.28, 6, 6), mat('iron'), [0.42, 1.62, 0]);
  const flag = new THREE.PlaneGeometry(0.2, 0.12, 10, 2);
  const fp = flag.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin((fp.getX(i) + 0.1) * 22) * 0.015 * ((fp.getX(i) + 0.1) / 0.2));
  flag.computeVertexNormals();
  put(g, flag, mat('fabric', '#9C2A2A', { side: DS }), [0.525, 1.69, 0]);
  // Ivy at the foot of the left tower.
  bush(g, [-0.5, 0.12, 0.12], 0.1, 24, r, '#4A6E35');
  bush(g, [-0.55, 0.3, 0.05], 0.07, 14, r, '#47693A');
  return g;
}

function boutique(r: R): THREE.Group {
  const g = new THREE.Group();
  const W = 0.94;
  const D = 0.66;
  const H = 0.58;
  const rise = 0.3;
  const F = 0.05;
  const z0 = -0.06;
  const front = z0 + D / 2;
  put(g, box(W + 0.06, F, D + 0.08, 4), mat('cobble', '#A9A397'), [0, F / 2, z0 + 0.01]);
  put(g, houseBody(W, H, rise, D, 2.5), mat('plaster', '#E9DCC0'), [0, F, z0]);
  gableRoof(g, W, D, F + H, rise, mat('slate', '#5E6873'), { over: 0.07, overZ: 0.06, t: 0.03, s: 4.2, trim: mat('woodPainted', '#2F5552') });
  // Painted wooden shopfront: pilasters, base panels, fascia with the sign.
  const paint = mat('woodPainted', '#2F5552');
  const sf = grp(g, [0, F, front + 0.004]);
  for (const x of [-0.44, -0.15, 0.15, 0.44]) put(sf, box(0.045, 0.38, 0.03, [7, 7], true), paint, [x, 0.19, 0.012]);
  put(sf, box(0.94, 0.08, 0.03, 7), paint, [0, 0.42, 0.012]);
  put(sf, box(0.72, 0.05, 0.034, 6), mat('woodPainted', '#1E3836'), [0, 0.42, 0.016]);
  put(sf, box(0.5, 0.008, 0.004), mat('gold'), [0, 0.445, 0.034]);
  put(sf, box(0.5, 0.008, 0.004), mat('gold'), [0, 0.395, 0.034]);
  // Gold "lettering": small raised gold blocks of varying width.
  let lx = -0.2;
  for (let i = 0; i < 8; i++) {
    const w = 0.025 + r() * 0.02;
    put(sf, box(w, 0.024, 0.004), mat('gold', '#D7B062'), [lx + w / 2, 0.42, 0.035]);
    lx += w + 0.012;
  }
  // Two display windows on low panels.
  for (const xs of [-1, 1]) {
    const cx = xs * 0.295;
    put(sf, box(0.25, 0.1, 0.025, 7), paint, [cx, 0.05, 0.012]);
    put(sf, box(0.25, 0.26, 0.004), GLASS_LIT(), [cx, 0.23, 0.005]);
    put(sf, box(0.25, 0.012, 0.022), paint, [cx, 0.36, 0.012]);
    put(sf, box(0.012, 0.26, 0.02), paint, [cx, 0.23, 0.012]);
    put(sf, box(0.25, 0.012, 0.02), paint, [cx, 0.2, 0.012]);
    // Goods on display behind the glass.
    for (let i = 0; i < 4; i++)
      put(sf, box(0.04, 0.04 + r() * 0.04, 0.03, 6), mat('plastic', ['#C24A3A', '#D8B04A', '#3F6F8E', '#E8DCC2'][i]), [cx - 0.08 + i * 0.05, 0.12 + 0.02, -0.02]);
  }
  doorAt(sf, [0, 0, 0.004], 0, { w: 0.18, h: 0.34, color: '#244341', glass: true, frame: paint });
  put(g, rbox(0.3, 0.03, 0.1, 0.008, 4), mat('stone', '#A39C90'), [0, F - 0.005, front + 0.06]);
  // Striped awning (sloped) with a scalloped valance.
  const aw = grp(g, [0, F + 0.53, front + 0.02]);
  const stripes = 12;
  const aW = 0.94 / stripes;
  const red = mat('fabric', '#A8322E', { side: DS });
  const cream = mat('fabric', '#EDE4CF', { side: DS });
  for (let i = 0; i < stripes; i++) {
    const m = i % 2 ? cream : red;
    const x = -0.47 + aW * (i + 0.5);
    put(aw, box(aW, 0.006, 0.22, 4), m, [x, -0.05, 0.1], [0.47, 0, 0]);
    const v = new THREE.CircleGeometry(aW / 2, 10, PI, PI);
    planar(v, 4);
    put(aw, v, m, [x, -0.097, 0.2]);
    put(aw, box(aW, 0.03, 0.002, 4), m, [x, -0.085, 0.2]);
  }
  for (const xs of [-1, 1]) put(aw, cyl(0.004, 0.004, 0.24, 6), mat('iron'), [xs * 0.47, -0.05, 0.1], [PI / 2 + 0.47, 0, 0]);
  // Hanging blade sign on an iron bracket.
  const br = grp(g, [W / 2 + 0.004, F + 0.5, front - 0.04]);
  put(br, box(0.16, 0.008, 0.008), mat('iron'), [0.08, 0, 0]);
  put(br, new THREE.TorusGeometry(0.05, 0.004, 4, 12, PI / 2), mat('iron'), [0.0, -0.05, 0], [0, 0, 0]);
  put(br, rbox(0.12, 0.12, 0.014, 0.006, 6), mat('woodPainted', '#2F5552'), [0.1, -0.075, 0]);
  put(br, ext(frameShape(0.09, 0.09, 0.008, false), 0.018, 0), mat('gold'), [0.1, -0.12, 0]);
  put(br, new THREE.SphereGeometry(0.022, 12, 8), mat('gold'), [0.1, -0.075, 0], [0, 0, 0], [1, 1, 0.45]);
  for (const x of [0.055, 0.145]) put(br, cyl(0.0015, 0.0015, 0.016, 4), mat('iron'), [x, -0.008, 0]);
  // Upper windows, roof finial (gold star), wall lamp.
  for (const xs of [-1, 1]) windowAt(g, [xs * (W / 2 + 0.004), F + 0.33, z0], xs * PI / 2, { w: 0.15, h: 0.18, lit: true, shutters: '#2F5552', flowers: true }, r);
  windowAt(g, [0, F + H + 0.12, front + 0.004], 0, { w: 0.1, h: 0.1, lit: true, arch: true }, r);
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2;
    const rr = i % 2 ? 0.022 : 0.05;
    if (i === 0) star.moveTo(Math.sin(a) * rr, Math.cos(a) * rr);
    else star.lineTo(Math.sin(a) * rr, Math.cos(a) * rr);
  }
  star.closePath();
  put(g, cyl(0.005, 0.005, 0.1, 6), mat('iron'), [0, F + H + rise + 0.07, z0 + D / 2 - 0.02]);
  put(g, ext(star, 0.012, 0.004, 6), mat('gold'), [0, F + H + rise + 0.16, z0 + D / 2 - 0.02]);
  // Crates of produce and a flower pot outside.
  for (const xs of [-1, 1]) {
    const cg = grp(g, [xs * 0.6, 0, 0.26], xs * 0.15);
    const crate = mat('wood', '#A27B52');
    put(cg, box(0.16, 0.1, 0.13, [6, 6]), crate, [0, 0.05, 0]);
    put(cg, box(0.17, 0.012, 0.14), mat('wood', '#8C6844'), [0, 0.1, 0]);
    const fruit = new THREE.IcosahedronGeometry(0.022, 1);
    planar(fruit, 6);
    const fc = xs < 0 ? ['#A8231E', '#C0352A', '#8E1E1A'] : ['#E0A030', '#D98A26', '#E8B440'];
    for (let i = 0; i < 9; i++) put(cg, fruit, mat('plastic', fc[i % 3]), [-0.055 + (i % 3) * 0.055, 0.115 + (i % 2) * 0.008, -0.04 + Math.floor(i / 3) * 0.04]);
  }
  put(g, lathe([[0.001, 0], [0.05, 0], [0.065, 0.1], [0.07, 0.1], [0.07, 0.11], [0.06, 0.11]], 18, 6), mat('roofTiles', '#B5643E'), [-0.45, 0, front + 0.08]);
  bush(g, [-0.45, 0.17, front + 0.08], 0.07, 16, r, '#4F7D38');
  flowerTuft(g, [-0.45, 0.17, front + 0.08], 0.05, 0.05, 6, r, ['#E85A8A', '#F4E9F0']);
  lantern(g, [0.3, F + 0.62, front + 0.02], 0.8);
  return g;
}

function igloo(r: R): THREE.Group {
  const g = new THREE.Group();
  const R0 = 0.42;
  const rows = 7;
  const snowMats = ['#F4F7FB', '#E8EEF5', '#DCE5EF'].map((c) => mat('snow', c));
  put(g, new THREE.SphereGeometry(R0 - 0.035, 24, 10, 0, PI * 2, 0, PI / 2), mat('snow', '#B9C7D6'));
  const tmp = new THREE.Object3D();
  const phiMax = 1.25;
  for (let i = 0; i < rows; i++) {
    const p0 = (i / rows) * phiMax;
    const p1 = ((i + 1) / rows) * phiMax;
    const pm = (p0 + p1) / 2;
    const ringR = R0 * Math.cos(pm);
    const n = Math.max(5, Math.round((2 * PI * ringR) / 0.12));
    const bh = R0 * (p1 - p0) - 0.008;
    const bw = (2 * PI * ringR) / n - 0.008;
    const geo = box(bw, bh, 0.07, 2);
    for (let j = 0; j < n; j++) {
      const a = ((j + (i % 2) * 0.5) / n) * PI * 2;
      // Leave room for the entrance tunnel.
      const da = Math.abs(((a + PI) % (2 * PI)) - PI);
      if (i < 3 && da < 0.42) continue;
      const pos = new THREE.Vector3(Math.sin(a) * ringR, R0 * Math.sin(pm), Math.cos(a) * ringR).multiplyScalar(1 - 0.035 / R0);
      tmp.position.copy(pos);
      tmp.lookAt(pos.clone().multiplyScalar(2));
      put(g, geo, snowMats[Math.floor(r() * 3)], [pos.x, pos.y, pos.z], [tmp.rotation.x, tmp.rotation.y, tmp.rotation.z]);
    }
  }
  put(g, new THREE.SphereGeometry(R0 * Math.cos(phiMax) + 0.02, 16, 6, 0, PI * 2, 0, PI / 2), snowMats[0], [0, R0 * Math.sin(phiMax) - 0.02, 0], [0, 0, 0], [1, 0.45, 1]);
  // Entrance tunnel: arches of blocks, dark doorway.
  const tr = 0.17;
  put(g, planar(new THREE.CircleGeometry(tr - 0.03, 16, 0, PI), 4), mat('snow', '#1E2833'), [0, 0, 0.36]);
  put(g, cyl(tr - 0.03, tr - 0.03, 0.17, 16, 2, { open: true, t0: -PI / 2, tl: PI }), mat('snow', '#56677A', { side: DS }), [0, 0, 0.44], [PI / 2, 0, 0]);
  for (let k = 0; k < 3; k++) {
    const z = 0.36 + k * 0.08;
    for (let j = 0; j < 7; j++) {
      const a = ((j + (k % 2) * 0.5) / 6) * PI - PI / 2;
      if (a > PI / 2 + 0.01) continue;
      const pos = new THREE.Vector3(Math.sin(a) * tr, Math.cos(a) * tr, z);
      const geo = box(0.085, 0.07, 0.075, 2);
      put(g, geo, snowMats[Math.floor(r() * 3)], [pos.x, pos.y, pos.z], [0, 0, -a]);
    }
  }
  // Snow drift around the base, a little ice window.
  const drift = rockGeo(r, 0.44, 0.1, 2);
  put(g, drift, snowMats[0], [0, 0, 0.03]);
  const iw = grp(g, [0.3, 0.2, -0.04], PI / 2 + 0.1);
  put(iw, rbox(0.1, 0.08, 0.05, 0.01, 4), mat('ice'), [0, 0, 0.27 - 0.3]);
  return g;
}

function treehouse(r: R): THREE.Group {
  const g = new THREE.Group();
  const bark = mat('bark', '#8C7764');
  // Trunk with a flaring base and roots.
  const trunkCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.02, -0.05), new THREE.Vector3(0.02, 0.5, -0.05), new THREE.Vector3(-0.01, 1.0, -0.06), new THREE.Vector3(0.02, 1.4, -0.08)]);
  const tw = profile([[0, 0.17], [0.08, 0.11], [0.5, 0.09], [1, 0.06]]);
  const { geometry: trunk } = loft({ curve: trunkCurve, rings: 22, radial: 14, up: new THREE.Vector3(0, 0, 1), section: (u) => ({ rx: tw(u), ry: tw(u) }) });
  scaleUV(trunk, 1, 3);
  put(g, trunk, bark);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + 0.4;
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(Math.sin(a) * 0.05, 0.1, -0.05 + Math.cos(a) * 0.05), new THREE.Vector3(Math.sin(a) * 0.17, 0.03, -0.05 + Math.cos(a) * 0.17), new THREE.Vector3(Math.sin(a) * 0.27, -0.01, -0.05 + Math.cos(a) * 0.27)]);
    const { geometry } = loft({ curve: c, rings: 8, radial: 8, section: (u) => ({ rx: mix(0.05, 0.012, u), ry: mix(0.045, 0.01, u) }) });
    put(g, geometry, bark);
  }
  // Branches up into the crown.
  const crowns: [number, number, number, number][] = [
    [0, 1.5, -0.1, 0.42],
    [0.32, 1.3, -0.06, 0.3],
    [-0.32, 1.32, -0.14, 0.3],
    [0.06, 1.28, -0.36, 0.3],
  ];
  for (const [x, y, z] of crowns.slice(1)) {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.95, -0.06), new THREE.Vector3(x * 0.6, (y + 0.95) / 2 + 0.05, z * 0.6 - 0.03), new THREE.Vector3(x, y, z)]);
    const { geometry } = loft({ curve: c, rings: 8, radial: 8, section: (u) => ({ rx: mix(0.04, 0.015, u), ry: mix(0.04, 0.015, u) }) });
    put(g, geometry, bark);
  }
  crowns.forEach(([x, y, z, rad], i) => bush(g, [x, y, z], rad, i === 0 ? 110 : 60, r, ['#6E9A45', '#7BA64C', '#668F40', '#76A04A'][i]));
  // Platform on beams with knee braces.
  const PY = 0.62;
  const deck = grp(g, [0, PY, 0.02]);
  for (let i = 0; i < 9; i++) put(deck, board(0.64, 0.022, 0.066, i), mat('wood', i % 3 ? '#9C7450' : '#A47C58'), [0, 0, -0.29 + i * 0.0715]);
  for (const x of [-0.24, 0.24]) put(deck, box(0.04, 0.045, 0.66, 6), mat('woodDark'), [x, -0.034, 0]);
  for (const x of [-0.24, 0.24]) put(g, box(0.03, 0.34, 0.03, 6, true), mat('woodDark'), [x * 0.55, PY - 0.17, 0.02], [0, 0, -Math.sign(x) * 0.7]);
  // Hut around the trunk.
  const hut = grp(g, [0, PY + 0.011, -0.03]);
  const HW = 0.44;
  const HD = 0.38;
  const HH = 0.3;
  put(hut, houseBody(HW, HH, 0.16, HD, 6.5), mat('wood', '#A87F55'));
  gableRoof(hut, HW, HD, HH, 0.16, mat('roofTiles', '#8E4A35'), { over: 0.06, overZ: 0.05, t: 0.025, s: 4, trim: mat('woodDark') });
  doorAt(hut, [-0.08, 0, HD / 2 + 0.004], 0, { w: 0.12, h: 0.22, m: mat('woodDark', '#6B4A30'), frame: mat('woodDark'), knob: mat('iron') });
  windowAt(hut, [0.11, 0.17, HD / 2 + 0.004], 0, { w: 0.1, h: 0.09, lit: true, frame: mat('woodDark') }, r);
  windowAt(hut, [HW / 2 + 0.004, 0.17, 0], PI / 2, { w: 0.1, h: 0.09, lit: false, frame: mat('woodDark') }, r);
  // Railing along the front edge.
  const rail = mat('wood', '#8E6A48');
  for (const x of [-0.3, -0.15, 0.15, 0.3]) put(g, box(0.022, 0.15, 0.022), rail, [x, PY + 0.085, 0.33]);
  put(g, box(0.2, 0.02, 0.024), rail, [-0.22, PY + 0.16, 0.33]);
  put(g, box(0.2, 0.02, 0.024), rail, [0.22, PY + 0.16, 0.33]);
  for (const xs of [-1, 1]) {
    put(g, box(0.022, 0.15, 0.022), rail, [xs * 0.31, PY + 0.085, 0.0]);
    put(g, box(0.024, 0.02, 0.33), rail, [xs * 0.31, PY + 0.16, 0.165]);
  }
  // Ladder from the ground up to the gap in the railing.
  const lad = grp(g, [0, 0, 0.44]);
  lad.rotation.x = -0.16;
  for (const x of [-0.07, 0.07]) put(lad, box(0.024, 0.7, 0.024, 6, true), mat('woodDark'), [x, 0.35, 0]);
  for (let i = 0; i < 6; i++) put(lad, cyl(0.009, 0.009, 0.15, 6, 6, { swap: true }), mat('wood'), [0, 0.07 + i * 0.105, 0], [0, 0, PI / 2]);
  lantern(g, [0.2, PY + 0.17, 0.33], 0.8);
  return g;
}

function windmill(r: R): THREE.Group {
  const g = new THREE.Group();
  const prof = smoothProfile([[0.34, 0.06], [0.32, 0.3], [0.29, 0.6], [0.26, 0.9], [0.255, 0.96]], 12);
  const radAt = (y: number) => mix(0.34, 0.255, (y - 0.06) / 0.9);
  put(g, cyl(0.36, 0.37, 0.07, 28, 4), mat('stone', '#9B958B'), [0, 0.035, 0]);
  put(g, lathe(prof, 32, 2.2), mat('plaster', '#ECE6DA'));
  put(g, cyl(0.27, 0.265, 0.03, 28, 6), mat('woodDark'), [0, 0.965, 0]);
  // Thatched cap.
  put(g, lathe(smoothProfile([[0.3, 0], [0.29, 0.06], [0.24, 0.17], [0.14, 0.28], [0.04, 0.34], [0.001, 0.35]], 14), 28, 3), mat('thatch', '#B89A68'), [0, 0.975, 0]);
  put(g, cyl(0.01, 0.02, 0.06, 8, 6), mat('woodDark'), [0, 1.34, 0]);
  // Door and windows following the tower.
  doorAt(g, [0, 0.07, radAt(0.07) - 0.006], 0.0, { w: 0.13, h: 0.24, m: mat('woodDark', '#5E4430'), arch: true, frame: mat('stone', '#BDB6A8'), knob: mat('iron'), hinges: true });
  put(g, rbox(0.2, 0.03, 0.08, 0.006, 4), mat('stone', '#A39C90'), [0, 0.06, radAt(0.06) + 0.035]);
  for (const [y, a] of [[0.5, 0.5], [0.7, -0.45], [0.42, -1.6], [0.62, 1.7]] as const)
    windowAt(g, [Math.sin(a) * (radAt(y) - 0.006), y, Math.cos(a) * (radAt(y) - 0.006)], a, { w: 0.07, h: 0.1, lit: y < 0.55, frame: mat('woodPainted', '#5C4632'), arch: true, mullion: false }, r);
  // Windshaft, hub and four lattice sails with canvas.
  const hubZ = 0.33;
  const hubY = 0.98;
  put(g, cyl(0.035, 0.035, 0.2, 12, 6), mat('woodDark'), [0, hubY, hubZ - 0.09], [PI / 2, 0, 0]);
  put(g, cyl(0.05, 0.05, 0.05, 12, 6), mat('iron'), [0, hubY, hubZ + 0.01], [PI / 2, 0, 0]);
  const sails = grp(g, [0, hubY, hubZ + 0.025]);
  const frame = mat('wood', '#8A6A4A');
  const canvas = mat('fabric', '#E3D8C0', { side: DS });
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i * PI) / 2 + 0.35;
    sails.add(arm);
    put(arm, box(0.03, 0.66, 0.028, 6, true), frame, [0, 0.33, 0]);
    for (const x of [0.03, 0.17]) put(arm, box(0.012, 0.5, 0.012, 6, true), frame, [x, 0.4, 0.004]);
    for (let k = 0; k < 9; k++) put(arm, box(0.165, 0.009, 0.01), frame, [0.09, 0.15 + k * 0.0625, 0.006]);
    // Canvas: fully spread on two sails, half-reefed on the others.
    const full = i % 2 === 0;
    const len = full ? 0.48 : 0.26;
    put(arm, box(0.13, len, 0.004, 4), canvas, [0.1, 0.65 - len / 2, -0.004]);
    if (!full) put(arm, cyl(0.012, 0.012, 0.13, 8, 4), canvas, [0.1, 0.65 - len, -0.004], [0, 0, PI / 2]);
  }
  put(sails, new THREE.SphereGeometry(0.035, 12, 8), mat('iron'), [0, 0, 0.02]);
  // Flour sacks by the door.
  for (const [x, z] of [[0.24, 0.32], [0.3, 0.26]] as const)
    put(g, new THREE.SphereGeometry(0.05, 12, 8), mat('fabric', '#D8C9A6'), [x, 0.045, z], [0, x * 10, 0], [0.9, 1, 0.8]);
  return g;
}

function lighthouse(r: R): THREE.Group {
  const g = new THREE.Group();
  put(g, facet(cyl(0.37, 0.39, 0.1, 8, 4)), mat('stone', '#8F897F'), [0, 0.05, 0]);
  const y0 = 0.1;
  const y1 = 1.16;
  const rAt = (y: number) => mix(0.3, 0.19, (y - y0) / (y1 - y0));
  const bands = 4;
  for (let i = 0; i < bands; i++) {
    const a = y0 + ((y1 - y0) * i) / bands;
    const b = y0 + ((y1 - y0) * (i + 1)) / bands;
    put(g, cyl(rAt(b), rAt(a), b - a, 32, 2.2, { open: true }), mat('plaster', i % 2 ? '#EFEBE3' : '#A8352D'), [0, (a + b) / 2, 0]);
  }
  // Gallery: corbel, deck, railing.
  put(g, cyl(0.26, 0.19, 0.06, 24, 4), mat('stone', '#BDB6AA'), [0, y1 + 0.03, 0]);
  put(g, cyl(0.265, 0.265, 0.025, 24, 4), mat('iron'), [0, y1 + 0.072, 0]);
  const iron = mat('iron');
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2;
    put(g, box(0.006, 0.09, 0.006), iron, [Math.sin(a) * 0.25, y1 + 0.13, Math.cos(a) * 0.25]);
  }
  for (const y of [0.17, 0.12]) put(g, new THREE.TorusGeometry(0.25, y > 0.15 ? 0.005 : 0.003, 4, 32), iron, [0, y1 + y, 0], [PI / 2, 0, 0]);
  // Lantern room: glazing with mullions, glowing lamp.
  const LY = y1 + 0.085;
  put(g, facet(cyl(0.155, 0.16, 0.05, 8, 4)), mat('metal', '#8E2B25'), [0, LY + 0.025, 0]);
  put(g, facet(cyl(0.145, 0.145, 0.19, 8, 4, { open: true })), GLASS_LIT(), [0, LY + 0.145, 0]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2 + PI / 8;
    put(g, box(0.01, 0.19, 0.01), iron, [Math.sin(a) * 0.137, LY + 0.145, Math.cos(a) * 0.137], [0, a, 0]);
  }
  put(g, new THREE.SphereGeometry(0.055, 16, 12), pbr('glass', { glow: 2.2, color: '#FFF0C0', opacity: 0.95 }), [0, LY + 0.14, 0]);
  put(g, cyl(0.025, 0.035, 0.05, 10, 6), mat('copper'), [0, LY + 0.07, 0]);
  // Dome roof, vent ball, lightning rod.
  put(g, facet(cyl(0.165, 0.165, 0.016, 8, 4)), mat('metal', '#8E2B25'), [0, LY + 0.245, 0]);
  put(g, lathe(smoothProfile([[0.17, 0], [0.16, 0.05], [0.11, 0.11], [0.04, 0.15], [0.001, 0.155]], 10), 24, 4), mat('metal', '#8E2B25'), [0, LY + 0.253, 0]);
  put(g, new THREE.SphereGeometry(0.03, 12, 8), mat('copper'), [0, LY + 0.42, 0]);
  put(g, cyl(0.003, 0.004, 0.12, 4, 6), iron, [0, LY + 0.49, 0]);
  // Door with a small porch and windows up the tower.
  doorAt(g, [0, y0, rAt(y0) - 0.012], 0, { w: 0.11, h: 0.2, color: '#2F4A5A', arch: true, frame: mat('stone', '#C7C0B3') });
  put(g, rbox(0.2, 0.03, 0.08, 0.006, 4), mat('stone', '#A39C90'), [0, y0 + 0.002, rAt(y0) + 0.04]);
  for (const [y, a] of [[0.45, 0.35], [0.7, -0.4], [0.95, 0.3], [0.58, PI * 0.9]] as const)
    windowAt(g, [Math.sin(a) * (rAt(y) - 0.006), y, Math.cos(a) * (rAt(y) - 0.006)], a, { w: 0.05, h: 0.08, lit: false, arch: true, frame: mat('stone', '#C7C0B3'), mullion: false }, r);
  // Rocks at the foot.
  for (let i = 0; i < 6; i++) {
    const a = PI * 0.6 + i * 0.75;
    put(g, rockGeo(r, 0.06 + r() * 0.04, 0.6), mat('rock', '#8E887E'), [Math.sin(a) * 0.4, 0.0, Math.cos(a) * 0.4]);
  }
  return g;
}

function gazebo(r: R): THREE.Group {
  const g = new THREE.Group();
  const R0 = 0.46;
  const o8 = PI / 8;
  put(g, facet(cyl(R0, R0 + 0.02, 0.07, 8, 4, { t0: o8 })), mat('stone', '#A49D91'), [0, 0.035, 0]);
  const deck = planar(facet(new THREE.CylinderGeometry(R0 - 0.02, R0 - 0.02, 0.02, 8, 1, false, o8)), 6);
  put(g, deck, mat('wood', '#C4AC90'), [0, 0.08, 0]);
  // Steps in front.
  put(g, rbox(0.3, 0.035, 0.1, 0.006, 4), mat('stone', '#A49D91'), [0, 0.0175, R0 + 0.04]);
  const white = mat('plaster', '#F2EFE8');
  const PH = 0.6;
  const pr = 0.4;
  const corners: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = o8 + (i / 8) * PI * 2 + o8;
    corners.push(new THREE.Vector3(Math.sin(a) * pr, 0, Math.cos(a) * pr));
  }
  for (const c of corners) {
    put(g, rbox(0.04, PH, 0.04, 0.006, [7, 7], true), white, [c.x, 0.09 + PH / 2, c.z]);
    put(g, rbox(0.055, 0.04, 0.055, 0.006, 5), white, [c.x, 0.11, c.z]);
  }
  // Balustrades on every side but the front one.
  for (let i = 0; i < 8; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 8];
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b) - 0.04;
    const rotY = Math.atan2(b.x - a.x, b.z - a.z) - PI / 2;
    const side = grp(g, [mid.x, 0, mid.z], rotY);
    // Top beam all round, with brackets.
    put(side, box(len + 0.04, 0.05, 0.035, 7), white, [0, 0.09 + PH - 0.02, 0]);
    for (const sx of [-1, 1]) put(side, box(0.012, 0.09, 0.012), white, [sx * (len / 2 - 0.03), 0.09 + PH - 0.07, 0], [0, 0, sx * 0.8]);
    if (mid.z > 0.3) continue;
    put(side, box(len, 0.022, 0.03, 7), white, [0, 0.33, 0]);
    put(side, box(len, 0.018, 0.026, 7), white, [0, 0.12, 0]);
    for (let k = 0; k < 6; k++) put(side, cyl(0.007, 0.009, 0.2, 6, 6), white, [-len / 2 + (len * (k + 0.5)) / 6, 0.225, 0]);
  }
  // Octagonal shingled roof, fascia and finial.
  const RY = 0.09 + PH + 0.005;
  put(g, facet(cyl(0.02, 0.56, 0.34, 8, 3.5, { t0: o8 })), mat('slate', '#4F5B67'), [0, RY + 0.17, 0]);
  put(g, facet(cyl(0.56, 0.56, 0.035, 8, 6, { t0: o8, open: true })), white, [0, RY + 0.0, 0]);
  put(g, lathe([[0.04, 0], [0.03, 0.03], [0.012, 0.05], [0.025, 0.08], [0.004, 0.14], [0.001, 0.15]], 12, 6), mat('copper', '#6E9C8A'), [0, RY + 0.33, 0]);
  // Lantern hanging from the roof, a bench inside.
  put(g, cyl(0.002, 0.002, 0.12, 4), mat('iron'), [0, RY + 0.06, 0]);
  lantern(g, [0, RY - 0.08, 0], 1.2);
  const bench = grp(g, [0, 0.09, -0.2]);
  put(bench, board(0.36, 0.02, 0.1, 1), mat('wood', '#8A6442'), [0, 0.12, 0]);
  for (const x of [-0.15, 0.15]) put(bench, box(0.02, 0.12, 0.08), mat('wood', '#7A5638'), [x, 0.06, 0]);
  bush(g, [-0.42, 0.1, 0.4], 0.09, 20, r, '#4F7A38');
  flowerTuft(g, [-0.42, 0.12, 0.42], 0.06, 0.05, 6, r, ['#C04A8A', '#F0E0F0']);
  bush(g, [0.42, 0.1, 0.4], 0.08, 18, r, '#557F3A');
  return g;
}

function well(r: R): THREE.Group {
  const g = new THREE.Group();
  const stone = mat('stone', '#A39D92');
  put(g, lathe([[0.3, 0], [0.305, 0.15], [0.3, 0.32], [0.24, 0.32], [0.24, 0.1]], 28, 4.5), stone);
  // Coping stones on the rim.
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    put(g, rbox(0.15, 0.04, 0.085, 0.01, 4.5), mat('stone', ['#B5AFA3', '#A8A296', '#BCB5A8'][i % 3]), [Math.sin(a) * 0.27, 0.34, Math.cos(a) * 0.27], [0, a + PI / 2 + (r() - 0.5) * 0.08, 0]);
  }
  put(g, planar(new THREE.CircleGeometry(0.24, 24), 4), mat('water', '#1F3A3E'), [0, 0.2, 0], [-PI / 2, 0, 0]);
  // Posts, roller with rope, crank.
  const post = mat('woodDark', '#6E5038');
  for (const x of [-0.27, 0.27]) {
    put(g, rbox(0.05, 0.58, 0.05, 0.006, [7, 7], true), post, [x, 0.36 + 0.29 - 0.04, 0]);
  }
  put(g, cyl(0.03, 0.03, 0.56, 12, 6, { swap: true }), mat('wood'), [0, 0.7, 0], [0, 0, PI / 2]);
  put(g, cyl(0.04, 0.04, 0.18, 12, 30), mat('rope'), [0, 0.7, 0], [0, 0, PI / 2]);
  rope(g, [0.06, 0.66, 0.03], [0.06, 0.35, 0.03], 0.004);
  put(g, box(0.012, 0.1, 0.012), mat('iron'), [0.32, 0.66, 0]);
  put(g, cyl(0.008, 0.008, 0.06, 6, 6), mat('woodDark'), [0.35, 0.615, 0], [0, 0, PI / 2]);
  // Bucket hanging just above the water? No: resting on the rim, iron bands.
  const bk = grp(g, [0.06, 0.36, 0.2]);
  put(bk, lathe([[0.001, 0], [0.045, 0], [0.055, 0.09], [0.05, 0.09], [0.041, 0.006]], 16, 7), mat('wood', '#8A6544'));
  for (const y of [0.02, 0.07]) put(bk, new THREE.TorusGeometry(0.047 + y * 0.11, 0.003, 4, 16), mat('iron'), [0, y, 0], [PI / 2, 0, 0]);
  put(bk, new THREE.TorusGeometry(0.052, 0.0025, 4, 12, PI), mat('iron'), [0, 0.09, 0]);
  // Small gable roof (ridge along x).
  const roof = grp(g, [0, 0, 0], PI / 2);
  gableRoof(roof, 0.5, 0.62, 0.8, 0.17, mat('roofTiles', '#A24F3A'), { over: 0.06, overZ: 0.04, t: 0.022, s: 3.6, trim: mat('woodDark') });
  for (const zs of [-1, 1]) put(roof, box(0.5, 0.035, 0.035, 6), post, [0, 0.8 - 0.017, zs * 0.27]);
  bush(g, [-0.33, 0.05, 0.25], 0.07, 14, r, '#557F3A');
  for (let i = 0; i < 4; i++) put(g, rockGeo(r, 0.035, 0.5), mat('rock'), [-0.34 + i * 0.05, 0, 0.32 + (i % 2) * 0.04]);
  return g;
}

function fountain(r: R): THREE.Group {
  const g = new THREE.Group();
  const carved = mat('plaster', '#CFC8BA');
  const masonry = mat('stone', '#B9B2A5');
  put(g, lathe([[0.001, 0], [0.43, 0], [0.43, 0.12], [0.445, 0.14], [0.445, 0.175], [0.43, 0.185], [0.37, 0.185], [0.36, 0.17], [0.36, 0.05], [0.001, 0.05]], 40, 4.5), masonry);
  put(g, planar(new THREE.CircleGeometry(0.362, 36), 3), mat('water', '#2E6E7E'), [0, 0.15, 0], [-PI / 2, 0, 0]);
  // Pedestal and upper bowl.
  put(g, lathe(smoothProfile([[0.09, 0.05], [0.08, 0.14], [0.05, 0.2], [0.07, 0.3], [0.045, 0.42], [0.06, 0.48], [0.07, 0.5]], 22), 20, 4), carved);
  put(g, lathe(smoothProfile([[0.06, 0.48], [0.14, 0.51], [0.2, 0.55], [0.215, 0.585], [0.2, 0.59], [0.17, 0.57], [0.001, 0.56]], 18), 32, 4), carved);
  put(g, planar(new THREE.CircleGeometry(0.2, 28), 3), mat('water', '#3C8696'), [0, 0.58, 0], [-PI / 2, 0, 0]);
  // Spout finial with a little jet.
  put(g, lathe(smoothProfile([[0.04, 0.56], [0.03, 0.62], [0.045, 0.66], [0.02, 0.7], [0.012, 0.72]], 12), 16, 4), carved);
  put(g, cyl(0.006, 0.01, 0.08, 8, 4, { open: true }), mat('water', '#CFEFF6', { opacity: 0.55 }), [0, 0.76, 0]);
  put(g, new THREE.SphereGeometry(0.03, 12, 8, 0, PI * 2, 0, PI / 2), mat('water', '#DDF3F8', { opacity: 0.4, side: DS }), [0, 0.78, 0], [PI, 0, 0], [1, 1.6, 1]);
  // Water curtain falling from the upper bowl into the basin, ripples.
  const fall = mat('water', '#D8F1F6', { opacity: 0.38, side: DS });
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * PI * 2 + 0.2;
    put(g, cyl(0.216, 0.245, 0.43, 4, 3, { open: true, t0: a0, tl: 0.16 }), fall, [0, 0.37, 0]);
    put(g, new THREE.TorusGeometry(0.012, 0.004, 4, 8), mat('water', '#EAF8FB', { opacity: 0.6 }), [Math.sin(a0 + 0.08) * 0.245, 0.153, Math.cos(a0 + 0.08) * 0.245], [PI / 2, 0, 0], [2.2, 1.2, 1]);
  }
  put(g, new THREE.TorusGeometry(0.25, 0.008, 4, 40), mat('water', '#E7F7FA', { opacity: 0.6 }), [0, 0.152, 0], [PI / 2, 0, 0]);
  put(g, new THREE.TorusGeometry(0.29, 0.005, 4, 40), mat('water', '#E7F7FA', { opacity: 0.45 }), [0, 0.152, 0], [PI / 2, 0, 0]);
  // Lily pad, moss.
  const pad = new THREE.CircleGeometry(0.04, 14, 0.3, PI * 2 - 0.6);
  planar(pad, 6);
  put(g, pad, mat('leaves', '#4F7A36', { side: DS }), [-0.3, 0.152, 0.08], [-PI / 2, 0, 0]);
  void r;
  return g;
}

function statue(r: R): THREE.Group {
  const g = new THREE.Group();
  const stone = mat('stone', '#B8B2A6');
  const smooth = mat('plaster', '#B4AEA2');
  // Moulded plinth: base, die, cornice.
  put(g, rbox(0.44, 0.06, 0.44, 0.01, 4.5, false, 2), stone, [0, 0.03, 0]);
  put(g, rbox(0.38, 0.04, 0.38, 0.012, 4, false, 2), smooth, [0, 0.08, 0]);
  put(g, rbox(0.32, 0.22, 0.32, 0.008, 3, false, 2), smooth, [0, 0.21, 0]);
  put(g, rbox(0.37, 0.04, 0.37, 0.012, 4, false, 2), smooth, [0, 0.34, 0]);
  // Bronze plaque.
  put(g, rbox(0.15, 0.08, 0.01, 0.003, 6), mat('copper', '#D2A868'), [0, 0.21, 0.162]);
  // Robed figure in weathered stone, one arm raising a torch.
  const fig = mat('plaster', '#D3CEC4');
  const S = 0.36;
  const robe = lathe(smoothProfile([[0.12, 0], [0.11, 0.04], [0.085, 0.18], [0.07, 0.3], [0.08, 0.38], [0.075, 0.42], [0.04, 0.45], [0.001, 0.455]], 18), 28, 3);
  const p = robe.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const y = p.getY(i);
    const a = Math.atan2(x, z);
    const k = 1 + Math.sin(a * 9 + 1.3) * 0.06 * (1 - y / 0.46) + Math.sin(a * 4) * 0.03 * (1 - y / 0.46);
    p.setXYZ(i, x * k, y, z * k * 0.82);
  }
  robe.computeVertexNormals();
  put(g, robe, fig, [0, S, 0]);
  put(g, new THREE.SphereGeometry(0.045, 18, 14), fig, [0, S + 0.5, 0.005], [0, 0, 0], [0.95, 1.1, 1]);
  put(g, cyl(0.022, 0.026, 0.05, 10, 4), fig, [0, S + 0.455, 0]);
  put(g, new THREE.SphereGeometry(0.049, 18, 10, 0, PI * 2, 0, PI * 0.55), fig, [0, S + 0.51, -0.006], [-0.3, 0, 0]);
  put(g, new THREE.ConeGeometry(0.008, 0.02, 6), fig, [0, S + 0.5, 0.05], [PI / 2, 0, 0]);
  // Raised right arm with torch, left arm holding a book.
  const armUp = new THREE.CatmullRomCurve3([new THREE.Vector3(0.07, S + 0.41, 0), new THREE.Vector3(0.11, S + 0.5, 0.02), new THREE.Vector3(0.12, S + 0.62, 0.03)]);
  put(g, loft({ curve: armUp, rings: 10, radial: 10, section: (u) => ({ rx: mix(0.03, 0.018, u), ry: mix(0.03, 0.018, u) }) }).geometry, fig);
  put(g, new THREE.SphereGeometry(0.02, 10, 8), fig, [0.12, S + 0.63, 0.03]);
  put(g, cyl(0.016, 0.008, 0.1, 10, 4), fig, [0.122, S + 0.67, 0.03]);
  put(g, lathe([[0.008, 0], [0.03, 0.02], [0.03, 0.035], [0.001, 0.04]], 12, 4), fig, [0.122, S + 0.715, 0.03]);
  const armDown = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.07, S + 0.41, 0), new THREE.Vector3(-0.09, S + 0.32, 0.03), new THREE.Vector3(-0.05, S + 0.27, 0.08)]);
  put(g, loft({ curve: armDown, rings: 10, radial: 10, section: (u) => ({ rx: mix(0.03, 0.02, u), ry: mix(0.03, 0.02, u) }) }).geometry, fig);
  put(g, rbox(0.07, 0.09, 0.02, 0.004, 4), fig, [-0.03, S + 0.29, 0.085], [0.2, 0.3, 0]);
  // Moss at the foot of the plinth.
  bush(g, [0.2, 0.04, 0.18], 0.06, 12, r, '#5C7A3A');
  return g;
}

function pier(r: R): THREE.Group {
  const g = new THREE.Group();
  const DY = 0.13;
  const woods = ['#A89279', '#9A8670', '#B19C82', '#94806A'].map((c) => mat('wood', c));
  for (let i = 0; i < 11; i++) {
    const len = 0.52 + (r() - 0.5) * 0.03;
    put(g, board(len, 0.022, 0.084, i), woods[Math.floor(r() * 4)], [(r() - 0.5) * 0.015, DY + 0.011 + (r() - 0.5) * 0.003, -0.455 + i * 0.091], [(r() - 0.5) * 0.01, (r() - 0.5) * 0.02, (r() - 0.5) * 0.01]);
  }
  const dark = mat('wood', '#8A7560');
  for (const x of [-0.19, 0.19]) put(g, box(0.035, 0.05, 1.0, 6, true), dark, [x, DY - 0.025, 0]);
  for (const z of [-0.42, 0, 0.42]) {
    put(g, box(0.58, 0.04, 0.045, 6), dark, [0, DY - 0.07, z]);
    for (const x of [-0.26, 0.26]) {
      const top = z > 0.3 ? DY + 0.16 : DY - 0.05;
      put(g, cyl(0.03, 0.034, top + 0.3, 12, 6, { swap: true }), dark, [x, (top - 0.3) / 2, z]);
      put(g, cyl(0.036, 0.037, 0.24, 12, 6, { open: true }), mat('wood', '#6E7458'), [x, -0.18, z]);
    }
  }
  // Cross bracing.
  for (const x of [-0.26, 0.26]) for (const zs of [-1, 1]) put(g, box(0.014, 0.03, 0.47), dark, [x + Math.sign(x) * 0.03, DY - 0.15, zs * 0.21], [zs * 0.38, 0, 0]);
  // Mooring rope on the end posts, a coil and a lantern.
  for (const x of [-0.26, 0.26]) {
    put(g, new THREE.TorusGeometry(0.036, 0.008, 6, 14), mat('rope'), [x, DY + 0.1, 0.42], [PI / 2, 0, 0]);
    put(g, new THREE.SphereGeometry(0.034, 10, 6, 0, PI * 2, 0, PI / 2), dark, [x, DY + 0.16, 0.42]);
  }
  for (let k = 0; k < 3; k++) put(g, new THREE.TorusGeometry(0.05 - k * 0.012, 0.008, 6, 18), mat('rope'), [-0.12, DY + 0.03 + k * 0.012, 0.28], [PI / 2, 0, 0]);
  put(g, cyl(0.01, 0.012, 0.3, 8, 6), dark, [0.2, DY + 0.15, -0.38]);
  put(g, box(0.08, 0.012, 0.012), dark, [0.17, DY + 0.29, -0.38]);
  lantern(g, [0.135, DY + 0.2, -0.38], 1);
  put(g, cyl(0.002, 0.002, 0.02, 4), mat('iron'), [0.135, DY + 0.28, -0.38]);
  return g;
}

function portal(r: R): THREE.Group {
  const g = new THREE.Group();
  const tints = ['#B5AD9D', '#A49C8C', '#BFB8A9', '#9D9586'];
  const stoneM = () => mat('rock', tints[Math.floor(r() * tints.length)]);
  put(g, rbox(1.0, 0.06, 0.38, 0.012, 4, false, 2), mat('stone', '#8E887E'), [0, 0.03, 0]);
  put(g, rbox(0.56, 0.035, 0.12, 0.01, 4), mat('stone', '#9A948A'), [0, 0.0175, 0.24]);
  const B = 0.06;
  const SY = 0.46;
  const Ri = 0.28;
  const Ro = 0.43;
  // Pillars of stacked blocks.
  for (const xs of [-1, 1]) {
    let y = B;
    const hs = [0.12, 0.1, 0.09, 0.09];
    hs.forEach((h, i) => {
      const w = Ro - Ri + (i === 0 ? 0.03 : 0) + (r() - 0.5) * 0.01;
      put(g, rbox(w, h - 0.006, 0.17 + (i === 0 ? 0.02 : 0), 0.012, 3.5), stoneM(), [xs * ((Ri + Ro) / 2) + (r() - 0.5) * 0.008, y + h / 2, (r() - 0.5) * 0.006], [0, (r() - 0.5) * 0.04, 0]);
      y += h;
    });
  }
  // Voussoirs and keystone.
  const nV = 9;
  for (let i = 0; i < nV; i++) {
    const a0 = (i / nV) * PI + 0.008;
    const a1 = ((i + 1) / nV) * PI - 0.008;
    const key = i === Math.floor(nV / 2);
    const ro = key ? Ro + 0.04 : Ro;
    const s = new THREE.Shape();
    s.moveTo(Math.cos(a0) * Ri, Math.sin(a0) * Ri);
    s.lineTo(Math.cos(a0) * ro, Math.sin(a0) * ro);
    s.absarc(0, 0, ro, a0, a1, false);
    s.lineTo(Math.cos(a1) * Ri, Math.sin(a1) * Ri);
    s.absarc(0, 0, Ri, a1, a0, true);
    put(g, ext(s, key ? 0.19 : 0.16, 0.008, 3.5, false, 4), stoneM(), [0, SY, 0]);
    // Glowing rune carved on the face.
    const am = (a0 + a1) / 2;
    const rr = (Ri + ro) / 2;
    put(g, box(0.012, 0.035, 0.004), mat('crystal', '#8FD6FF', { glow: 1.6 }), [Math.cos(am) * rr, SY + Math.sin(am) * rr, (key ? 0.095 : 0.08) + 0.009], [0, 0, am + (i % 2 ? 0.4 : -0.3)]);
  }
  // Magical surface: layered glowing veils filling the opening.
  const opening = (k: number, cy: number) => {
    const s = new THREE.Shape();
    const w = Ri * k;
    s.moveTo(-w, B + (SY - B) * (1 - k));
    s.lineTo(w, B + (SY - B) * (1 - k));
    s.lineTo(w, cy);
    s.absarc(0, cy, w, 0, PI, false);
    s.closePath();
    return planar(new THREE.ShapeGeometry(s, 24), 2);
  };
  put(g, opening(1, SY), mat('crystal', '#5B3FD9', { glow: 1.2, opacity: 0.88, side: DS }), [0, 0, 0]);
  put(g, opening(0.72, SY + 0.02), mat('crystal', '#8C6BFF', { glow: 1.5, opacity: 0.7, side: DS }), [0, 0.02, 0.006]);
  put(g, opening(0.45, SY + 0.04), mat('crystal', '#C3B2FF', { glow: 1.9, opacity: 0.6, side: DS }), [0, 0.05, 0.012]);
  put(g, opening(0.2, SY + 0.06), mat('crystal', '#F1EBFF', { glow: 2.5, opacity: 0.7, side: DS }), [0, 0.07, 0.018]);
  for (const zs of [-1, 1]) put(g, opening(0.6, SY), mat('crystal', '#A28CFF', { glow: 1.4, opacity: 0.5, side: DS }), [0, 0.03, zs * -0.006]);
  // Ivy and a few loose stones.
  bush(g, [-0.38, 0.2, 0.08], 0.08, 18, r, '#4A6E35');
  bush(g, [0.31, 0.8, 0.06], 0.07, 14, r, '#4F7538');
  for (let i = 0; i < 3; i++) put(g, rockGeo(r, 0.03 + r() * 0.02, 0.6), mat('rock', '#9D9586'), [0.4 + i * 0.03, 0.06, 0.12 + i * 0.03]);
  return g;
}

function throne(r: R): THREE.Group {
  const g = new THREE.Group();
  const stone = mat('rock', '#C4BDB0');
  const gold = mat('gold');
  const velvet = mat('fabric', '#7A1624');
  put(g, rbox(0.66, 0.06, 0.58, 0.012, 4, false, 2), mat('stone', '#9E978B'), [0, 0.03, 0]);
  put(g, rbox(0.44, 0.03, 0.08, 0.008, 4), mat('stone', '#A8A195'), [0, 0.015, 0.33]);
  // Seat block, gold band, cushion.
  put(g, rbox(0.5, 0.26, 0.42, 0.02, 3, false, 2), stone, [0, 0.06 + 0.13, 0.02]);
  put(g, box(0.5, 0.022, 0.006), gold, [0, 0.29, 0.234]);
  put(g, box(0.5, 0.012, 0.006), gold, [0, 0.1, 0.234]);
  put(g, rbox(0.44, 0.06, 0.36, 0.025, 4, false, 2), velvet, [0, 0.35, 0.04]);
  // Pointed back with gold border and velvet panel, gem on top.
  const backShape = (k: number) => {
    const s = new THREE.Shape();
    const w = 0.25 * k;
    s.moveTo(-w, 0);
    s.lineTo(w, 0);
    s.lineTo(w, 0.42 * k);
    s.quadraticCurveTo(w, 0.6 * k, 0, 0.68 * k);
    s.quadraticCurveTo(-w, 0.6 * k, -w, 0.42 * k);
    s.closePath();
    return s;
  };
  put(g, ext(backShape(1), 0.08, 0.012, 3), stone, [0, 0.32, -0.16]);
  const ring = backShape(0.92);
  ring.holes.push(backShape(0.84));
  put(g, ext(ring, 0.012, 0.002, 6), gold, [0, 0.33, -0.11]);
  put(g, ext(backShape(0.82), 0.01, 0.004, 4), velvet, [0, 0.36, -0.115]);
  put(g, new THREE.OctahedronGeometry(0.035, 0), mat('crystal', '#3E8BFF', { glow: 0.8 }), [0, 0.32 + 0.62, -0.1], [0, 0, 0], [0.8, 1.2, 0.5]);
  put(g, new THREE.TorusGeometry(0.035, 0.007, 6, 16), gold, [0, 0.94, -0.105]);
  // Side posts with finials, armrests with gold knobs.
  for (const xs of [-1, 1]) {
    put(g, rbox(0.07, 0.58, 0.09, 0.012, 3), stone, [xs * 0.27, 0.06 + 0.29, -0.15]);
    put(g, lathe([[0.03, 0], [0.04, 0.015], [0.02, 0.03], [0.035, 0.06], [0.001, 0.1]], 12, 6), gold, [xs * 0.27, 0.64, -0.15]);
    put(g, rbox(0.07, 0.045, 0.4, 0.012, 3), stone, [xs * 0.27, 0.5, 0.04]);
    put(g, rbox(0.055, 0.14, 0.055, 0.01, 3), stone, [xs * 0.27, 0.41, 0.2]);
    put(g, new THREE.SphereGeometry(0.03, 14, 10), gold, [xs * 0.27, 0.535, 0.22]);
    put(g, new THREE.SphereGeometry(0.03, 12, 8), gold, [xs * 0.22, 0.085, 0.2], [0, 0, 0], [1, 0.7, 1]);
  }
  void r;
  return g;
}

/** Envelope gores: each panel bulges a little between its seams. */
function gores(parent: THREE.Object3D, prof: [number, number][], n: number, cols: number, bulge: number, mats: THREE.Material[]) {
  for (let gi = 0; gi < n; gi++) {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j < prof.length; j++) {
      for (let c = 0; c <= cols; c++) {
        const t = c / cols;
        const phi = ((gi + t) / n) * PI * 2;
        const rr = prof[j][0] * (1 + bulge * Math.sin(PI * t));
        pos.push(Math.sin(phi) * rr, prof[j][1], Math.cos(phi) * rr);
        uv.push(t * 2, (j / (prof.length - 1)) * 8);
      }
    }
    const row = cols + 1;
    for (let j = 0; j < prof.length - 1; j++)
      for (let c = 0; c < cols; c++) {
        const a = j * row + c;
        const b = a + row;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    put(parent, geo, mats[gi % mats.length]);
  }
}

function balloon(r: R): THREE.Group {
  const g = new THREE.Group();
  const prof = smoothProfile([[0.075, 0.8], [0.15, 0.88], [0.27, 0.99], [0.36, 1.12], [0.4, 1.27], [0.39, 1.42], [0.33, 1.56], [0.22, 1.66], [0.1, 1.71], [0.001, 1.725]], 20);
  const colors = ['#B3312B', '#E8DDC2', '#D9A03A', '#E8DDC2', '#2D4A78', '#E8DDC2'];
  gores(g, prof, 18, 3, 0.035, colors.map((c) => mat('fabric', c)));
  // Load tapes along the seams.
  const tape = mat('fabric', '#6E5A40');
  put(g, new THREE.TorusGeometry(0.4, 0.006, 4, 48), tape, [0, 1.27, 0], [PI / 2, 0, 0]);
  put(g, cyl(0.08, 0.08, 0.012, 16, 6), tape, [0, 1.722, 0]);
  // Skirt (scoop).
  put(g, cyl(0.075, 0.1, 0.1, 18, 4, { open: true }), mat('fabric', '#3A2E25', { side: DS }), [0, 0.75, 0]);
  // Basket: wicker, leather rim, burner frame and burner.
  const BY = 0.13;
  const BH = 0.2;
  put(g, rbox(0.27, BH, 0.27, 0.025, 12, false, 2), mat('rope', '#9E7A4E'), [0, BY + BH / 2, 0]);
  const leather = mat('woodDark', '#3E2A1C');
  for (const sd of [-1, 1]) {
    put(g, rbox(0.29, 0.03, 0.03, 0.012, 6), leather, [0, BY + BH, sd * 0.135]);
    put(g, rbox(0.03, 0.03, 0.29, 0.012, 6), leather, [sd * 0.135, BY + BH, 0]);
  }
  const steel = mat('metal', '#9AA2A8');
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      rope(g, [sx * 0.12, BY + BH + 0.01, sz * 0.12], [sx * 0.06, 0.6, sz * 0.06], 0.005, steel, 6);
      rope(g, [sx * 0.06, 0.62, sz * 0.06], [sx * 0.07, 0.77, sz * 0.07], 0.0025, mat('rope'), 4);
    }
  put(g, box(0.14, 0.012, 0.14), steel, [0, 0.61, 0]);
  for (const x of [-0.03, 0.03]) put(g, cyl(0.025, 0.025, 0.06, 12, 6), mat('metal', '#C0C6CA'), [x, 0.65, 0]);
  put(g, new THREE.SphereGeometry(0.02, 10, 6), pbr('glass', { glow: 2.4, color: '#FFB24A', opacity: 0.85 }), [0, 0.7, 0], [0, 0, 0], [1, 1.6, 1]);
  // Sandbags on the basket, tethers to ground stakes.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    const sd = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    put(g, new THREE.SphereGeometry(0.028, 10, 8), mat('fabric', '#B79E72'), [sd.x * 0.148, BY + 0.08, sd.z * 0.148], [0, 0, 0], [1, 1.3, 1]);
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      rope(g, [sx * 0.13, BY + 0.02, sz * 0.13], [sx * 0.38, 0.015, sz * 0.38], 0.003);
      put(g, cyl(0.007, 0.005, 0.05, 6, 6), mat('iron'), [sx * 0.38, 0.015, sz * 0.38], [sz * 0.3, 0, -sx * 0.3]);
    }
  void r;
  return g;
}

function rainbow(r: R): THREE.Group {
  const g = new THREE.Group();
  const colors = ['#D8433C', '#E8823A', '#EFCB4A', '#6DB55A', '#4A9BD0', '#5562BE', '#8A5AB0'];
  const outer = 1.0;
  const bw = 0.042;
  colors.forEach((c, i) => {
    const rad = outer - i * bw - bw / 2;
    const geo = new THREE.TorusGeometry(rad, bw * 0.55, 4, 44, PI);
    put(g, geo, pbr('glass', { color: c, glow: 0.9, opacity: 0.62, side: DS }), [0, 0, 0], [0, 0, 0], [1, 1, 0.35]);
  });
  // Soft cumulus puffs at both feet.
  const top = mat('snow', '#FFFFFF');
  const under = mat('snow', '#D7DEE8');
  for (const xs of [-1, 1]) {
    const cx = xs * 0.84;
    const puffs: [number, number, number, number][] = [
      [0, 0.1, 0, 0.17],
      [0.15, 0.06, 0.05, 0.12],
      [-0.14, 0.06, 0.03, 0.12],
      [0.05, 0.05, 0.13, 0.11],
      [-0.06, 0.18, -0.02, 0.11],
      [0.08, 0.16, -0.06, 0.1],
      [-0.03, 0.03, -0.1, 0.11],
    ];
    puffs.forEach(([x, y, z, s], i) => {
      const geo = rockGeo(r, s, 0.85, i < 3 ? 2 : 1);
      put(g, geo, i < 4 ? top : under, [cx + x * xs, y, z], [0, r() * 6, 0]);
    });
  }
  return g;
}

function pond(r: R): THREE.Group {
  const g = new THREE.Group();
  const seed = r() * 10;
  const outline = (k: number) => {
    const s = new THREE.Shape();
    const N = 40;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * PI * 2;
      const rr = (0.36 + (fbm(Math.cos(a) * 1.5 + seed, Math.sin(a) * 1.5, 7, 3) - 0.5) * 0.14) * k;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr * 0.85;
      if (i === 0) s.moveTo(x, -z);
      else s.lineTo(x, -z);
    }
    s.closePath();
    return s;
  };
  const flat = (s: THREE.Shape) => planar(new THREE.ShapeGeometry(s, 1), 3);
  // Muddy bank ring, dark bed, water.
  const bank = outline(1.18);
  bank.holes.push(outline(0.98));
  put(g, flat(bank), mat('sand', '#6E5E46'), [0, 0.004, 0], [-PI / 2, 0, 0]);
  put(g, flat(outline(1.0)), mat('rock', '#3C4436'), [0, 0.002, 0], [-PI / 2, 0, 0]);
  put(g, flat(outline(1.02)), mat('water', '#2F6170'), [0, 0.01, 0], [-PI / 2, 0, 0]);
  // Stones around the edge.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2 + r() * 0.2;
    const rr = (0.36 + (fbm(Math.cos(a) * 1.5 + seed, Math.sin(a) * 1.5, 7, 3) - 0.5) * 0.14) * 1.07;
    if (a > 4.1 && a < 5.0) continue;
    put(g, rockGeo(r, 0.03 + r() * 0.03, 0.55), mat('rock', ['#8F8A80', '#7E796F', '#A19B90'][i % 3]), [Math.cos(a) * rr, 0.004, Math.sin(a) * rr * 0.85]);
  }
  // Reeds and cattails at the back-left.
  const reed = mat('leaves', '#6E8A42');
  const reed2 = mat('leaves', '#879B4E');
  for (let i = 0; i < 26; i++) {
    const cx = -0.24 + (r() - 0.5) * 0.14;
    const cz = -0.2 + (r() - 0.5) * 0.12;
    const h = 0.16 + r() * 0.16;
    const geo = new THREE.ConeGeometry(0.006, h, 4);
    planar(geo, 6);
    put(g, geo, i % 3 ? reed : reed2, [cx, h / 2, cz], [(r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4]);
  }
  for (let i = 0; i < 4; i++) {
    const x = -0.24 + (i - 1.5) * 0.04;
    const z = -0.2 + (r() - 0.5) * 0.06;
    const h = 0.26 + r() * 0.06;
    put(g, cyl(0.0025, 0.003, h, 4, 6), reed, [x, h / 2, z]);
    put(g, cyl(0.009, 0.009, 0.05, 8, 6), mat('woodDark', '#4A3122'), [x, h - 0.04, z]);
  }
  // Second smaller reed clump on the right.
  for (let i = 0; i < 10; i++) {
    const h = 0.1 + r() * 0.1;
    const geo = new THREE.ConeGeometry(0.005, h, 4);
    planar(geo, 6);
    put(g, geo, reed, [0.33 + (r() - 0.5) * 0.08, h / 2, 0.08 + (r() - 0.5) * 0.08], [(r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5]);
  }
  // Lily pads and a water lily.
  const padM = mat('leaves', '#4C7A34', { side: DS });
  for (const [x, z, s] of [[0.08, 0.06, 1], [0.15, -0.02, 0.8], [-0.02, 0.15, 0.7], [0.12, 0.14, 0.6]] as const) {
    const pad = new THREE.CircleGeometry(0.045 * s, 14, 0.25, PI * 2 - 0.5);
    planar(pad, 6);
    put(g, pad, padM, [x, 0.013, z], [-PI / 2, 0, r() * 6]);
  }
  const petal = new THREE.SphereGeometry(0.014, 8, 6);
  planar(petal, 6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    put(g, petal, mat('plaster', i % 2 ? '#F7EEF2' : '#F0D4E0'), [0.08 + Math.sin(a) * 0.014, 0.022, 0.06 + Math.cos(a) * 0.014], [0.5, a, 0], [0.5, 0.35, 1.2]);
  }
  put(g, new THREE.SphereGeometry(0.007, 8, 6), mat('leaves', '#E8C440'), [0.08, 0.026, 0.06]);
  bush(g, [0.3, 0.04, -0.28], 0.07, 14, r, '#557F3A');
  return g;
}

const BUILDERS: Record<string, (r: R) => THREE.Group> = {
  tent,
  doghouse,
  cabin,
  cottage,
  mushroom,
  castle,
  boutique,
  igloo,
  treehouse,
  windmill,
  lighthouse,
  gazebo,
  well,
  fountain,
  statue,
  pier,
  portal,
  throne,
  balloon,
  rainbow,
  pond,
};

/** Builds one object of this family, or null if the id isn't one of them. */
export function buildHouses(id: string): THREE.Group | null {
  const make = BUILDERS[id];
  if (!make) return null;
  const g = make(rng(seedOf(id)));
  g.name = id;
  return g;
}

export const HOUSE_IDS = Object.keys(BUILDERS);
