// Elemental powers and extra body parts that grow with the stages: spikes, horns, crystal wings,
// flames / frost / sparks (particles animated on the GPU), lightning arcs, an aura on the ground.
import * as THREE from 'three';
import { loft } from './loft';
import { fbm, mix, rng, smooth } from './noise';
import type { Stage } from './types';

export type Element = 'fire' | 'ice' | 'lightning';

/** What each stage adds. */
export const POWER: Record<Stage, { spikes: number; horns: number; tail: boolean; mane: boolean; particles: number; ground: boolean; wings: boolean; arcs: boolean }> = {
  0: { spikes: 0, horns: 0, tail: false, mane: false, particles: 0, ground: false, wings: false, arcs: false },
  1: { spikes: 0.4, horns: 0, tail: false, mane: false, particles: 0, ground: false, wings: false, arcs: false },
  2: { spikes: 0.65, horns: 0.55, tail: true, mane: false, particles: 0, ground: false, wings: false, arcs: false },
  3: { spikes: 0.9, horns: 0.85, tail: true, mane: true, particles: 160, ground: false, wings: false, arcs: true },
  4: { spikes: 1.15, horns: 1.2, tail: true, mane: true, particles: 320, ground: true, wings: true, arcs: true },
};

export const ELEMENT_COLORS: Record<Element, { core: string; mid: string; edge: string; eye: string; spike: string; tip: string }> = {
  fire: { core: '#FFF4C2', mid: '#FF9A2E', edge: '#B3200C', eye: '#FF8A1E', spike: '#1E1512', tip: '#FF6A00' },
  ice: { core: '#FFFFFF', mid: '#A8EEFF', edge: '#3E8FD8', eye: '#7FE2FF', spike: '#CFF4FF', tip: '#8FE6FF' },
  lightning: { core: '#FFFFFF', mid: '#FFF07A', edge: '#7A5CFF', eye: '#FFE54A', spike: '#2B2B3A', tip: '#FFF07A' },
};

// ── Materials ────────────────────────────────────────────────────────────────────

export function spikeMaterial(el: Element): THREE.Material {
  const c = ELEMENT_COLORS[el];
  if (el === 'ice')
    return new THREE.MeshPhysicalMaterial({ color: c.spike, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.88, emissive: new THREE.Color(c.edge), emissiveIntensity: 0.35, flatShading: true });
  // Dark obsidian / metal with a glowing tip (vertex colors carry the tip glow).
  return new THREE.MeshPhysicalMaterial({ color: c.spike, roughness: 0.25, metalness: el === 'lightning' ? 0.7 : 0.1, clearcoat: 0.8, flatShading: el === 'lightning' });
}

/** A cone (an hexagonal crystal for ice), standing on its base. */
function spikeGeometry(radius: number, height: number, sides: number, el: Element): THREE.BufferGeometry {
  const g = el === 'ice' ? new THREE.CylinderGeometry(0, radius, height, 6, 3) : new THREE.ConeGeometry(radius, height, sides, 4);
  g.translate(0, height / 2, 0);
  return g;
}

// ── Body parts ───────────────────────────────────────────────────────────────────

/** A row of spikes along a ridge: `points` with their outward `normals`, leaning toward `backs`, sizes peaking in the middle. */
export function spikes(points: THREE.Vector3[], normals: THREE.Vector3[], size: number, el: Element, backs: THREE.Vector3[] | THREE.Vector3 = new THREE.Vector3(-1, 0, 0)): THREE.Group {
  const g = new THREE.Group();
  const mat = spikeMaterial(el);
  const tipMat = new THREE.MeshStandardMaterial({ color: ELEMENT_COLORS[el].tip, emissive: new THREE.Color(ELEMENT_COLORS[el].tip), emissiveIntensity: 1.6 });
  points.forEach((p, i) => {
    const t = i / Math.max(1, points.length - 1);
    const h = size * (0.45 + 0.55 * Math.sin(t * Math.PI));
    const s = new THREE.Mesh(spikeGeometry(h * 0.28, h, 8, el), mat);
    if (el !== 'ice') {
      // A glowing tip.
      const tip = new THREE.Mesh(new THREE.ConeGeometry(h * 0.1, h * 0.34, 8), tipMat);
      tip.position.y = h * 0.84;
      s.add(tip);
    }
    s.position.copy(p);
    const back = Array.isArray(backs) ? backs[i] : backs;
    const dir = normals[i].clone().addScaledVector(back, 0.45).normalize();
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    s.castShadow = true;
    g.add(s);
  });
  return g;
}

/** A pair of curved horns sweeping back from `pos`; `side` axis is z. */
export function horns(pos: THREE.Vector3, size: number, el: Element, spread = 0.07, forward = new THREE.Vector3(1, 0, 0)): THREE.Group {
  const back = new THREE.Vector3(-1, 0, 0);
  const g = new THREE.Group();
  const mat = el === 'ice' ? spikeMaterial('ice') : new THREE.MeshPhysicalMaterial({ color: el === 'fire' ? '#6A5446' : '#7A7490', roughness: 0.35, clearcoat: 0.7, vertexColors: true });
  for (const side of [-1, 1]) {
    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(back.x * 0.25, 0.32, side * 0.12),
      new THREE.Vector3(back.x * 0.75, 0.5, side * 0.25),
      new THREE.Vector3(back.x * 1.15, 0.42, side * 0.32),
    ].map((p) => p.multiplyScalar(size));
    const curve = new THREE.CatmullRomCurve3(pts);
    const { geometry } = loft({ curve, rings: 24, radial: 10, up: new THREE.Vector3(0, 0, 1), section: (u) => ({ rx: size * 0.11 * (1 - u * 0.9), ry: size * 0.11 * (1 - u * 0.9) }) });
    // Ridges and a glowing tip.
    const p = geometry.getAttribute('position') as THREE.BufferAttribute;
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const col: number[] = [];
    for (let i = 0; i < p.count; i++) {
      // Growth rings, darker toward the tip.
      const u = uv.getX(i);
      const ring = (0.75 + 0.25 * Math.sin(u * 60)) * mix(1, 0.45, u);
      col.push(ring, ring, ring);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(geometry, mat);
    m.position.set(0, 0, side * spread);
    m.castShadow = true;
    g.add(m);
  }
  g.position.copy(pos);
  const f = forward.clone().setY(0).normalize();
  if (f.lengthSq() > 0) g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), f);
  return g;
}

/** Crystal (ice) or flame-feather wings: shards fanned out from the shoulders, raised. */
export function elementWings(shoulder: THREE.Vector3, span: number, el: Element): THREE.Group {
  const g = new THREE.Group();
  const c = ELEMENT_COLORS[el];
  const mat =
    el === 'ice'
      ? spikeMaterial('ice')
      : new THREE.MeshStandardMaterial({ color: c.mid, emissive: new THREE.Color(el === 'fire' ? c.edge : c.mid), emissiveIntensity: 1.4, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const len = span * mix(0.95, 0.45, t);
      const shard = new THREE.Mesh(spikeGeometry(span * 0.07, len, 6, el), mat);
      shard.scale.z = el === 'ice' ? 0.35 : 0.18;
      // Fan: front shards point up-out, back shards point back-out.
      const a = mix(0.25, 1.35, t);
      shard.rotation.set(0, 0, 0);
      shard.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-Math.sin(a) * 0.9, Math.cos(a) * 0.9 + 0.2, side * 0.75).normalize());
      shard.position.set(-t * span * 0.12, 0, side * t * span * 0.05);
      shard.castShadow = true;
      wing.add(shard);
    }
    wing.position.set(0, 0, side * span * 0.08);
    g.add(wing);
  }
  g.position.copy(shoulder);
  return g;
}

// ── Particles (flames, frost, sparks) — animated entirely in the shader ──────────

export type Emitter = { points: THREE.Points; update: (t: number) => void };

/**
 * Particles born at random points of `sources` (with a little jitter), rising and fading.
 * fire: flames licking up; ice: slow swirling frost; lightning: quick sparks jumping out.
 */
export function particles(el: Element, sources: THREE.Vector3[], count: number, scale = 1, seed = 1): Emitter {
  const r = rng(seed);
  const base = new Float32Array(count * 3);
  const extra = new Float32Array(count * 4); // phase, speed, sideways x, sideways z
  for (let i = 0; i < count; i++) {
    const p = sources[Math.floor(r() * sources.length)];
    base[i * 3] = p.x + (r() - 0.5) * 0.04 * scale;
    base[i * 3 + 1] = p.y + (r() - 0.5) * 0.03 * scale;
    base[i * 3 + 2] = p.z + (r() - 0.5) * 0.04 * scale;
    extra[i * 4] = r();
    extra[i * 4 + 1] = 0.7 + r() * 0.6;
    extra[i * 4 + 2] = r() - 0.5;
    extra[i * 4 + 3] = r() - 0.5;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(base, 3));
  g.setAttribute('extra', new THREE.BufferAttribute(extra, 4));
  const c = ELEMENT_COLORS[el];
  const cfg = {
    fire: { life: 0.9, rise: 0.36, spread: 0.06, size: 70, swirl: 0 },
    ice: { life: 3.2, rise: 0.22, spread: 0.18, size: 26, swirl: 1 },
    lightning: { life: 0.35, rise: 0.08, spread: 0.3, size: 22, swirl: 0 },
  }[el];
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    // Normal blending: flames stay orange on a light background (additive would turn them white).
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: scale },
      uCore: { value: new THREE.Color(c.core) },
      uMid: { value: new THREE.Color(c.mid) },
      uEdge: { value: new THREE.Color(c.edge) },
    },
    vertexShader: `
      attribute vec4 extra;
      uniform float uTime; uniform float uScale;
      varying float vAge;
      void main() {
        float life = ${cfg.life.toFixed(2)};
        float age = fract(uTime / (life * extra.y) + extra.x);
        vAge = age;
        vec3 p = position;
        p.y += age * ${cfg.rise.toFixed(2)} * uScale * extra.y;
        p.x += extra.z * ${cfg.spread.toFixed(2)} * uScale * age + sin(uTime * 3.0 + extra.x * 20.0) * 0.012 * uScale;
        p.z += extra.w * ${cfg.spread.toFixed(2)} * uScale * age;
        ${cfg.swirl ? 'float a = uTime * 0.6 + extra.x * 6.28; p.x += cos(a) * 0.05 * uScale * age; p.z += sin(a) * 0.05 * uScale * age;' : ''}
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float s = ${el === 'fire' ? '(1.0 - age) * (0.6 + age)' : el === 'ice' ? 'sin(age * 3.1416)' : '(1.0 - age)'};
        gl_PointSize = ${cfg.size.toFixed(1)} * s * uScale * (3.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uCore; uniform vec3 uMid; uniform vec3 uEdge;
      varying float vAge;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d) * 2.0;
        if (r > 1.0) discard;
        float soft = pow(1.0 - r, ${el === 'ice' ? '2.5' : '1.6'});
        vec3 col = vAge < 0.35 ? mix(uCore, uMid, vAge / 0.35) : mix(uMid, uEdge, (vAge - 0.35) / 0.65);
        float a = soft * (1.0 - smoothstep(0.6, 1.0, vAge)) * ${el === 'fire' ? '0.85' : '0.9'};
        gl_FragColor = vec4(col, a);
      }`,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  return { points, update: (t) => (mat.uniforms.uTime.value = t) };
}

// ── Lightning arcs ───────────────────────────────────────────────────────────────

/** Crackling arcs jumping between random pairs of `anchors`, redrawn a few times a second. */
export function arcs(anchors: THREE.Vector3[], el: Element, count = 3, seed = 3): Emitter {
  const segs = 10;
  const copies = 3;
  const pos = new Float32Array(count * copies * segs * 2 * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const color = el === 'lightning' ? '#7B4DFF' : el === 'ice' ? '#3E9BE0' : '#FF7A1A';
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  let last = -1;
  const r = rng(seed);
  const redraw = () => {
    let k = 0;
    for (let a = 0; a < count; a++) {
      const p0 = anchors[Math.floor(r() * anchors.length)];
      const p1 = anchors[Math.floor(r() * anchors.length)];
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const jitter = Math.sin(t * Math.PI) * 0.06;
        pts.push(p0.clone().lerp(p1, t).add(new THREE.Vector3((r() - 0.5) * jitter, (r() - 0.5) * jitter + Math.sin(t * Math.PI) * 0.05, (r() - 0.5) * jitter)));
      }
      for (let c = 0; c < copies; c++) {
        const o = (c - 1) * 0.004;
        for (let i = 0; i < segs; i++) {
          pos.set([pts[i].x + o, pts[i].y + o, pts[i].z, pts[i + 1].x + o, pts[i + 1].y + o, pts[i + 1].z], k);
          k += 6;
        }
      }
    }
    g.getAttribute('position').needsUpdate = true;
  };
  redraw();
  return {
    points: lines as unknown as THREE.Points,
    update: (t) => {
      const frame = Math.floor(t * 9);
      if (frame !== last) {
        last = frame;
        redraw();
        mat.opacity = 0.5 + r() * 0.5;
      }
    },
  };
}

// ── Aura on the ground ───────────────────────────────────────────────────────────

/** Embers and cracks (fire), frost (ice) or an electric ring (lightning) under the animal. */
export function groundAura(el: Element, radius: number): Emitter {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const c = ELEMENT_COLORS[el];
  const mid = new THREE.Color(c.mid);
  const edge = new THREE.Color(c.edge);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S - 0.5;
      const v = y / S - 0.5;
      const d = Math.hypot(u, v) * 2;
      const fade = smooth(1, 0.55, d);
      let k = 0;
      if (el === 'fire') {
        const n = fbm(u * 10 + 5, v * 10 + 5, 11, 4);
        k = (smooth(0.045, 0, Math.abs(n - 0.5)) * 1.3 + smooth(0.8, 0.1, d) * 0.35) * fade;
      } else if (el === 'ice') {
        const a = Math.atan2(v, u);
        const n = fbm(Math.cos(a) * 3 + 9, Math.sin(a) * 3 + d * 6, 4, 3);
        k = (smooth(0.62, 0.68, n) * 0.9 + smooth(0.95, 0.4, d) * 0.35) * fade;
      } else {
        k = (smooth(0.04, 0, Math.abs(d - 0.8)) + smooth(0.03, 0, Math.abs(d - 0.55)) * 0.6) * smooth(1.02, 0.9, d);
      }
      const col = el === 'fire' ? new THREE.Color(c.core).lerp(mid, smooth(0, 0.6, d)) : mid.clone().lerp(edge, smooth(0, 1, d));
      const i = (y * S + x) * 4;
      data[i] = col.r * 255;
      data[i + 1] = col.g * 255;
      data[i + 2] = col.b * 255;
      data[i + 3] = Math.min(255, k * 255);
    }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.006;
  return {
    points: disc as unknown as THREE.Points,
    update: (t) => {
      mat.opacity = 0.75 + 0.25 * Math.sin(t * (el === 'lightning' ? 9 : 2));
      disc.rotation.z = el === 'lightning' ? t * 0.8 : t * 0.05;
    },
  };
}
