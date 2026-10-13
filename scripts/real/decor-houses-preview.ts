// Preview of the realistic house-family island objects, rendered in a browser page (Playwright).
// Build: npx esbuild scripts/real/decor-houses-preview.ts --bundle --format=iife --outfile=<dir>/real.js
// Optional hash: #tent,castle to render only some ids.
import * as THREE from 'three';
import { addNatureLights, setupRenderer, shadowFloor } from '../../src/creatures/real/lights';
import { buildHouses, HOUSE_IDS } from '../../src/world/real/decorHouses';
import { flatten } from '../../src/world/flatten';

const SIZE = Number(new URLSearchParams(location.search).get('s') ?? 300);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE);
renderer.setPixelRatio(1);
setupRenderer(renderer);

const hash = location.hash.slice(1);
const ids = hash ? hash.split(',') : HOUSE_IDS;
const COLS = Math.max(1, Math.min(6, Math.floor(1860 / (SIZE + 6))));

function triangles(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((m) => {
    if (m instanceof THREE.Mesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
  });
  return Math.round(n);
}

function render(id: string): { url: string; label: string } {
  const scene = new THREE.Scene();
  addNatureLights(scene, 2);
  const raw = buildHouses(id);
  if (!raw) return { url: '', label: `${id}: null` };
  const tris = triangles(raw);
  const obj = flatten(raw);
  scene.add(obj);
  scene.add(shadowFloor());
  // A 1×1 cell outline on the ground for scale.
  const cell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: '#9AA6B2' }));
  cell.rotation.x = -Math.PI / 2;
  cell.position.y = 0.001;
  scene.add(cell);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 0.75);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const dir = new THREE.Vector3(1.6, 1.4, 2.2).normalize();
  cam.position.copy(center).addScaledVector(dir, (radius / Math.sin((15 * Math.PI) / 180)) * 0.92);
  cam.lookAt(center);
  renderer.setClearColor('#E9EEF3', 1);
  renderer.render(scene, cam);
  return { url: renderer.domElement.toDataURL('image/png'), label: `${id} · ${tris} tris` };
}

const wrap = document.createElement('div');
wrap.style.cssText = `display:grid;grid-template-columns:repeat(${COLS},${SIZE}px);gap:6px;font:600 14px -apple-system,Helvetica,sans-serif;color:#333;padding:6px;background:#fff`;
document.body.appendChild(wrap);
for (const id of ids) {
  const { url, label } = render(id);
  const cell = document.createElement('div');
  const img = document.createElement('img');
  img.src = url;
  img.width = SIZE;
  cell.appendChild(img);
  cell.appendChild(document.createElement('br'));
  cell.appendChild(document.createTextNode(label));
  wrap.appendChild(cell);
}
(window as unknown as { done: boolean }).done = true;
