// Preview of the realistic nature objects (one 300×300 tile each), rendered in a browser page (Playwright).
// Build: npx esbuild scripts/real/decor-nature-preview.ts --bundle --format=iife --outfile=<dir>/real.js
import * as THREE from 'three';
import { addNatureLights, setupRenderer, shadowFloor } from '../../src/creatures/real/lights';
import { buildNature } from '../../src/world/real/decorNature';
import { flatten } from '../../src/world/flatten';

const IDS = ['pine', 'bush', 'apple', 'palm', 'sakura', 'crystal', 'autumn', 'bamboo', 'cactus', 'sunflower', 'rock', 'hedge', 'flowerbed', 'crystals', 'pumpkin', 'snowman'];
const only = location.hash.slice(1).split(',').filter(Boolean);
const BIG = only.includes('big');
const SIZE = BIG ? 560 : 300;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE);
renderer.setPixelRatio(1);
setupRenderer(renderer);

function triangles(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((m) => {
    if (m instanceof THREE.Mesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
  });
  return Math.round(n);
}

function render(id: string): { url: string; label: string } {
  const scene = new THREE.Scene();
  addNatureLights(scene);
  const t0 = performance.now();
  const model = buildNature(id);
  const ms = Math.round(performance.now() - t0);
  let label = id;
  if (model) {
    const flat = flatten(model);
    scene.add(flat);
    label = `${id} · ${triangles(flat)} tris · ${flat.children.length} draws · ${ms} ms`;
  } else label = `${id} · (null)`;
  // The 1×1 cell outline.
  const cell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: '#9aa6b2' }));
  cell.rotation.x = -Math.PI / 2;
  cell.position.y = 0.001;
  scene.add(cell);
  scene.add(shadowFloor());
  const cam = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
  cam.position.set(1.6, 1.4, 2.2);
  cam.lookAt(0, 0.45, 0);
  renderer.setClearColor('#E9EEF3', 1);
  renderer.render(scene, cam);
  return { url: renderer.domElement.toDataURL('image/png'), label };
}

const wrap = document.createElement('div');
wrap.style.cssText = 'display:grid;grid-template-columns:repeat(' + (BIG ? 3 : 4) + ',' + SIZE + 'px);gap:6px;font:600 13px -apple-system,Helvetica,sans-serif;color:#333;padding:6px;background:#fff';
document.body.appendChild(wrap);
for (const id of IDS) {
  if (only.filter((o) => o !== 'big').length && !only.includes(id)) continue;
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
