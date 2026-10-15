// Renders the Vainc+ profile-photo decorations in 3D (PBR) to transparent PNGs (assets/decorations).
// Build: npx esbuild scripts/decorations/render.ts --bundle --format=iife --outfile=<dir>/deco.js, open it in a
// browser page and save what window.renderAll() returns (one PNG data URL per decoration), resized to 360 px.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const SIZE = 720;
const HALF = 5 / 3; // the image spans 5/3 of the photo's diameter
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.OrthographicCamera(-HALF, HALF, HALF, -HALF, 0.1, 20);
camera.position.set(0, 0, 8);
camera.lookAt(0, 0, 0);

const gold = () => new THREE.MeshPhysicalMaterial({ color: '#FFC23A', metalness: 1, roughness: 0.2, clearcoat: 0.4 });
const goldDark = () => new THREE.MeshPhysicalMaterial({ color: '#E09A10', metalness: 1, roughness: 0.32 });
const gem = (color: string) =>
  new THREE.MeshPhysicalMaterial({ color, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, flatShading: true, emissive: new THREE.Color(color), emissiveIntensity: 0.12 });
const gloss = (color: string, rough = 0.25) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 1, clearcoatRoughness: 0.08 });
const matte = (color: string, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough });

function mesh(g: THREE.BufferGeometry, m: THREE.Material, pos: number[] = [0, 0, 0], rot: number[] = [0, 0, 0], scale: number[] = [1, 1, 1]) {
  const o = new THREE.Mesh(g, m);
  o.position.set(pos[0], pos[1], pos[2]);
  o.rotation.set(rot[0], rot[1], rot[2]);
  o.scale.set(scale[0], scale[1], scale[2]);
  return o;
}
function star(outer: number, inner: number, depth: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? inner : outer;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.6, bevelSize: outer * 0.12, bevelSegments: 4 });
  g.center();
  return g;
}
const mirror = (g: THREE.Object3D) => {
  const m = g.clone();
  m.scale.x *= -1;
  m.position.x *= -1;
  m.rotation.y *= -1;
  m.rotation.z *= -1;
  return m;
};
/** A leaf: a flat almond shape with a slight fold. */
function leafGeo() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.11, 0.12, 0, 0.3);
  s.quadraticCurveTo(-0.11, 0.12, 0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 3, curveSegments: 16 });
  return g;
}

const BUILD: Record<string, (seed?: number) => THREE.Group> = {
  crown() {
    const g = new THREE.Group();
    const crown = new THREE.Group();
    const r = 0.5;
    crown.add(mesh(new THREE.CylinderGeometry(r, r * 0.95, 0.26, 64, 1, true), new THREE.MeshPhysicalMaterial({ color: '#FFC23A', metalness: 1, roughness: 0.2, side: THREE.DoubleSide })));
    crown.add(mesh(new THREE.TorusGeometry(r * 0.97, 0.035, 12, 64), goldDark(), [0, -0.13, 0], [Math.PI / 2, 0, 0]));
    crown.add(mesh(new THREE.TorusGeometry(r, 0.03, 12, 64), goldDark(), [0, 0.13, 0], [Math.PI / 2, 0, 0]));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const tall = i % 2 === 0;
      const h = tall ? 0.42 : 0.26;
      crown.add(mesh(new THREE.ConeGeometry(0.11, h, 4), gold(), [Math.cos(a) * r, 0.13 + h / 2, Math.sin(a) * r], [0, -a + Math.PI / 4, 0]));
      crown.add(mesh(new THREE.SphereGeometry(tall ? 0.055 : 0.04, 24, 16), new THREE.MeshPhysicalMaterial({ color: '#FFF6E0', roughness: 0.15, clearcoat: 1 }), [Math.cos(a) * r, 0.13 + h + 0.02, Math.sin(a) * r]));
      crown.add(mesh(new THREE.IcosahedronGeometry(0.06, 0), gem(i % 2 ? '#1FA2FF' : '#E0115F'), [Math.cos(a) * r * 1.02, 0, Math.sin(a) * r * 1.02], [0, -a, 0], [1, 1, 0.55]));
    }
    crown.rotation.set(0.32, 0.3, -0.32);
    crown.position.set(0.5, 1.02, 0.2);
    crown.scale.setScalar(0.95);
    g.add(crown);
    return g;
  },
  laurel() {
    const g = new THREE.Group();
    const side = new THREE.Group();
    const R = 1.16;
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const a = THREE.MathUtils.degToRad(258 - i * 6.6);
      pts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0.1));
    }
    side.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.022, 8), goldDark()));
    const leaf = leafGeo();
    for (let i = 0; i < 7; i++) {
      const a = THREE.MathUtils.degToRad(250 - i * 18);
      const x = Math.cos(a) * R;
      const y = Math.sin(a) * R;
      // The leaf points along the stem, upward, tilted out (s = 1) or in (s = -1).
      const along = a - Math.PI / 2;
      for (const s of [-1, 1]) {
        const l = mesh(leaf, s > 0 ? gold() : goldDark(), [x, y, 0.15 + s * 0.02], [0.25 * s, 0, along + s * 0.55]);
        l.scale.setScalar(1.15 - i * 0.04);
        side.add(l);
      }
    }
    const tip = THREE.MathUtils.degToRad(122);
    side.add(mesh(leaf, gold(), [Math.cos(tip) * R, Math.sin(tip) * R, 0.15], [0, 0, tip - Math.PI / 2], [0.9, 0.9, 0.9]));
    g.add(side, mirror(side));
    g.add(mesh(new THREE.IcosahedronGeometry(0.075, 0), gem('#E0115F'), [0, -R - 0.02, 0.2]));
    return g;
  },
  angel() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(0.55, 0.075, 24, 96), new THREE.MeshPhysicalMaterial({ color: '#FFD54A', metalness: 1, roughness: 0.15, emissive: new THREE.Color('#FFB300'), emissiveIntensity: 0.35 }), [0, 1.3, 0], [1.25, 0, 0]));
    return g;
  },
  angel_back() {
    const g = new THREE.Group();
    const wing = new THREE.Group();
    const feather = new THREE.SphereGeometry(0.1, 24, 16);
    const white = new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0.4, sheen: 1, sheenColor: new THREE.Color('#E0E7FF'), sheenRoughness: 0.4 });
    const shade = new THREE.MeshPhysicalMaterial({ color: '#B8C4E0', roughness: 0.5, sheen: 1, sheenColor: new THREE.Color('#8B9BD6') });
    const tipGold = new THREE.MeshPhysicalMaterial({ color: '#FFD54A', metalness: 1, roughness: 0.2 });
    const rows = [
      { n: 7, len: 0.8, spread: 1.3, r: 0.25, m: shade },
      { n: 6, len: 0.58, spread: 1.15, r: 0.2, m: white },
      { n: 5, len: 0.36, spread: 1.0, r: 0.15, m: white },
    ];
    rows.forEach((row, k) => {
      for (let i = 0; i < row.n; i++) {
        const t = i / (row.n - 1);
        const ang = 0.35 + t * row.spread;
        const len = row.len * (1 - t * 0.4);
        wing.add(mesh(feather, row.m, [-Math.cos(ang) * (row.r + len * 0.5), Math.sin(ang) * (row.r + len * 0.5), k * 0.06], [0, 0, ang + Math.PI / 2], [1.7, len * 5, 0.5]));
      }
    });
    // A golden edge along the top of the wing.
    for (let i = 0; i < 6; i++) {
      const ang = 0.35 + (i / 5) * 1.3;
      wing.add(mesh(new THREE.SphereGeometry(0.035, 12, 8), tipGold, [-Math.cos(ang) * 0.3, Math.sin(ang) * 0.3, 0.2]));
    }
    wing.position.set(-0.78, 0.05, -0.3);
    wing.rotation.set(0, 0.15, -0.15);
    wing.scale.setScalar(0.85);
    g.add(wing, mirror(wing));
    return g;
  },
  cat() {
    const g = new THREE.Group();
    const ear = new THREE.Group();
    const fur = new THREE.MeshPhysicalMaterial({ color: '#3A3542', roughness: 0.7, sheen: 1, sheenColor: new THREE.Color('#8E86A3'), sheenRoughness: 0.45 });
    const pink = new THREE.MeshPhysicalMaterial({ color: '#F06292', roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color('#FFC1D6') });
    // A rounded triangle, thick, then a pink inner part slightly in front.
    const tri = (w: number, h: number) => {
      const s = new THREE.Shape();
      s.moveTo(-w, 0);
      s.quadraticCurveTo(-w * 0.5, h * 0.55, -0.03, h);
      s.quadraticCurveTo(0, h + 0.03, 0.03, h);
      s.quadraticCurveTo(w * 0.5, h * 0.55, w, 0);
      s.quadraticCurveTo(0, -0.05, -w, 0);
      return s;
    };
    const outer = new THREE.ExtrudeGeometry(tri(0.32, 0.6), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 6, curveSegments: 20 });
    const inner = new THREE.ExtrudeGeometry(tri(0.19, 0.4), { depth: 0.02, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 4, curveSegments: 20 });
    ear.add(mesh(outer, fur));
    ear.add(mesh(inner, pink, [0, 0.06, 0.12]));
    ear.position.set(-0.62, 0.72, 0);
    ear.rotation.set(0, 0.25, 0.4);
    g.add(ear, mirror(ear));
    return g;
  },
  devil() {
    const g = new THREE.Group();
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push(new THREE.Vector3(-0.55 - Math.sin(t * 1.4) * 0.28, 0.85 + t * 0.62, 0.05));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 64, 0.1, 24);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const p = new THREE.Vector3();
    for (let v = 0; v < pos.count; v++) {
      p.fromBufferAttribute(pos, v);
      const seg = Math.floor(v / 25) / 64;
      const c = curve.getPoint(seg);
      const k = 1 - seg * 0.95;
      pos.setXYZ(v, c.x + (p.x - c.x) * k, c.y + (p.y - c.y) * k, c.z + (p.z - c.z) * k);
    }
    geo.computeVertexNormals();
    const hornG = new THREE.Group();
    hornG.add(mesh(geo, gloss('#C8102E', 0.22)));
    g.add(hornG, mirror(hornG));
    return g;
  },
  grad() {
    const g = new THREE.Group();
    const cap = new THREE.Group();
    const cloth = matte('#18171F', 0.7);
    cap.add(mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.32, 64), cloth, [0, -0.12, 0]));
    cap.add(mesh(new THREE.BoxGeometry(1.5, 0.05, 1.5), cloth, [0, 0.07, 0], [0, Math.PI / 4, 0]));
    cap.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 24), gold(), [0, 0.11, 0]));
    const cord = [new THREE.Vector3(0, 0.11, 0), new THREE.Vector3(0.45, 0.1, 0.45), new THREE.Vector3(0.68, 0.06, 0.62), new THREE.Vector3(0.7, -0.35, 0.64)];
    cap.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cord), 40, 0.018, 8), gold()));
    for (let i = 0; i < 9; i++) cap.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 6), gold(), [0.7 + ((i % 3) - 1) * 0.025, -0.5, 0.64 + (Math.floor(i / 3) - 1) * 0.025]));
    cap.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 16), gold(), [0.7, -0.33, 0.64]));
    cap.rotation.set(0.38, -0.2, -0.12);
    cap.position.set(0.05, 1.08, 0);
    g.add(cap);
    return g;
  },
  headset() {
    const g = new THREE.Group();
    const black = gloss('#1A1A22', 0.32);
    const band = [];
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI * (i / 40);
      band.push(new THREE.Vector3(Math.cos(a) * 1.12, Math.sin(a) * 1.12 - 0.05, 0));
    }
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(band), 80, 0.07, 16), black));
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(band.slice(8, 33)), 60, 0.075, 16), matte('#5856D6', 0.5), [0, 0, 0.02]));
    for (const s of [-1, 1]) {
      const cup = new THREE.Group();
      cup.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 48), black, [0, 0, 0], [0, 0, Math.PI / 2]));
      cup.add(mesh(new THREE.TorusGeometry(0.24, 0.03, 12, 48), new THREE.MeshStandardMaterial({ color: '#22D3EE', emissive: new THREE.Color('#22D3EE'), emissiveIntensity: 1.6 }), [s * 0.105, 0, 0], [0, Math.PI / 2, 0]));
      cup.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 32), gloss('#2E2E3A', 0.2), [s * 0.11, 0, 0], [0, 0, Math.PI / 2]));
      cup.position.set(s * 1.12, -0.12, 0.05);
      cup.rotation.y = -s * 0.5;
      g.add(cup);
    }
    return g;
  },
  orbit() {
    const g = new THREE.Group();
    const ring = new THREE.Group();
    ring.add(mesh(new THREE.TorusGeometry(1.42, 0.028, 12, 160), new THREE.MeshStandardMaterial({ color: '#D9CCFF', emissive: new THREE.Color('#A78BFA'), emissiveIntensity: 1.2 })));
    const stars = [
      [0.35, 0.3, '#FFC23A'],
      [2.5, 0.22, '#FFFFFF'],
      [4.4, 0.26, '#FF8BF2'],
    ] as const;
    for (const [a, s, c] of stars) {
      const m = c === '#FFC23A' ? gold() : new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.6, roughness: 0.2, clearcoat: 1, emissive: new THREE.Color(c), emissiveIntensity: 0.25 });
      ring.add(mesh(star(s, s * 0.45, s * 0.3), m, [Math.cos(a) * 1.42, Math.sin(a) * 1.42, 0], [Math.PI / 2, 0.4, 0]));
    }
    ring.rotation.set(1.2, 0.0, 0.35);
    g.add(ring);
    return g;
  },
  sakura() {
    const g = new THREE.Group();
    const bark = matte('#5B3A29', 0.9);
    const branch = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.55, -0.2, 0.1), new THREE.Vector3(-1.2, 0.55, 0.15), new THREE.Vector3(-0.65, 1.05, 0.2), new THREE.Vector3(0.1, 1.3, 0.2)]);
    g.add(mesh(new THREE.TubeGeometry(branch, 60, 0.045, 10), bark));
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.9, 0.85, 0.18), new THREE.Vector3(-1.0, 1.2, 0.2), new THREE.Vector3(-0.85, 1.45, 0.2)]), 30, 0.028, 8), bark));
    const petal = new THREE.SphereGeometry(0.1, 24, 16);
    const pinks = ['#FFB7CF', '#FF9DBB', '#FFC9DA'].map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.55, sheen: 1, sheenColor: new THREE.Color('#FFFFFF'), sheenRoughness: 0.3 }));
    const heart = new THREE.MeshStandardMaterial({ color: '#FFD86B', emissive: new THREE.Color('#FFB020'), emissiveIntensity: 0.3 });
    const flowerAt = (p: THREE.Vector3, size: number, k: number) => {
      const f = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        f.add(mesh(petal, pinks[(i + k) % 3], [Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0], [0, 0, a - Math.PI / 2], [0.9, 1.25, 0.3]));
      }
      f.add(mesh(new THREE.SphereGeometry(0.05, 16, 12), heart));
      f.position.copy(p);
      f.rotation.set(0.2 * (k % 3), 0.3 * ((k + 1) % 2), k);
      f.scale.setScalar(size);
      g.add(f);
    };
    [[0.05, 0.9], [0.2, 1.1], [0.38, 1.25], [0.55, 1.0], [0.72, 1.2], [0.9, 0.95]].forEach(([t, s], k) => {
      const p = branch.getPoint(t);
      flowerAt(new THREE.Vector3(p.x + (k % 2 ? 0.08 : -0.08), p.y + (k % 2 ? -0.1 : 0.1), 0.3), s, k);
    });
    flowerAt(new THREE.Vector3(-0.85, 1.45, 0.25), 1, 2);
    return g;
  },
  flames(seed = 1) {
    // Flame tongues all around: yellow-white at the root, orange then red at the tip, glowing (additive).
    const g = new THREE.Group();
    let s = seed * 9301;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const tongue = (len: number, w: number, colors: [string, string, string]) => {
      const geo = new THREE.ConeGeometry(w, len, 24, 12, true);
      geo.translate(0, len / 2, 0);
      const col = new Float32Array(geo.attributes.position.count * 3);
      const [c0, c1, c2] = colors.map((c) => new THREE.Color(c));
      const tmp = new THREE.Color();
      for (let v = 0; v < geo.attributes.position.count; v++) {
        const t = geo.attributes.position.getY(v) / len;
        if (t < 0.5) tmp.copy(c0).lerp(c1, t * 2);
        else tmp.copy(c1).lerp(c2, (t - 0.5) * 2);
        col.set([tmp.r, tmp.g, tmp.b], v * 3);
        // Wavy flame: bend sideways along the height.
        const pos = geo.attributes.position;
        pos.setX(v, pos.getX(v) * (1 - t * 0.85) + Math.sin(t * 5 + seed + v * 0.0) * 0.04 * t);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return geo;
    };
    const layers: { n: number; len: number; w: number; colors: [string, string, string]; op: number }[] = [
      { n: 22, len: 0.55, w: 0.14, colors: ['#FF8A00', '#FF3D00', '#8B0000'], op: 0.85 },
      { n: 20, len: 0.38, w: 0.11, colors: ['#FFD54A', '#FF8A00', '#FF3D00'], op: 0.9 },
      { n: 18, len: 0.22, w: 0.08, colors: ['#FFFFFF', '#FFE58A', '#FFB020'], op: 0.95 },
    ];
    layers.forEach((L, k) => {
      for (let i = 0; i < L.n; i++) {
        const a = (i / L.n) * Math.PI * 2 + k * 0.13 + rand() * 0.1;
        const len = L.len * (0.65 + rand() * 0.6);
        const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: L.op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const f = mesh(tongue(len, L.w * (0.8 + rand() * 0.4), L.colors), m, [Math.cos(a) * 0.98, Math.sin(a) * 0.98, 0.1 + k * 0.05], [0, 0, a - Math.PI / 2 + (rand() - 0.5) * 0.35]);
        g.add(f);
      }
    });
    return g;
  },
};

function render(id: string, seed?: number): string {
  const scene = new THREE.Scene();
  scene.environment = env;
  const key = new THREE.DirectionalLight('#FFFFFF', 2.2);
  key.position.set(-2, 3, 4);
  scene.add(key, new THREE.AmbientLight('#FFFFFF', 0.35));
  scene.add(BUILD[id](seed));
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
}

(window as unknown as { renderAll: () => Record<string, string> }).renderAll = () => {
  const out: Record<string, string> = Object.fromEntries(Object.keys(BUILD).filter((id) => id !== 'flames').map((id) => [id, render(id)]));
  out.flames = render('flames', 1);
  out.flames_b = render('flames', 2);
  return out;
};
