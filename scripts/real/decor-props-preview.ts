// Preview of the realistic island props & boats, rendered in a browser page (Playwright) to check them before the app.
// Build: npx esbuild scripts/real/decor-props-preview.ts --bundle --format=iife --outfile=<dir>/real.js
import * as THREE from 'three';
import { addNatureLights, setupRenderer, shadowFloor } from '../../src/creatures/real/lights';
import { buildProps, PROP_IDS } from '../../src/world/real/decorProps';
import { flatten } from '../../src/world/flatten';

const BIG = location.hash.startsWith('#big');
const SIZE = BIG ? 600 : 300;
const BOATS = ['rowboat', 'duckboat', 'sailboat', 'yacht', 'pirateship'];
/** In the scene, the water surface is about this high on a boat model. */
const WATERLINE = 0.05;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE);
renderer.setPixelRatio(1);
setupRenderer(renderer);

const which = (location.hash || '').slice(1).replace(/^big:?/, '');
const ids = which ? which.split(',') : PROP_IDS;

function render(id: string): [string, number] {
  const scene = new THREE.Scene();
  addNatureLights(scene);
  const model = buildProps(id)!;
  const flat = flatten(model);
  let tris = 0;
  flat.traverse((o) => {
    if (o instanceof THREE.Mesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3;
  });
  scene.add(flat);
  const boat = BOATS.includes(id);
  if (boat) {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: '#3F8DB0', roughness: 0.15, transparent: true, opacity: 0.82 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATERLINE;
    water.receiveShadow = true;
    scene.add(water);
  } else scene.add(shadowFloor());
  const box = new THREE.Box3().setFromObject(flat);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const dir = new THREE.Vector3(1.6, 1.4, 2.2).normalize();
  const d = Math.max(1.0, sphere.radius / Math.sin((15 * Math.PI) / 180)) * 0.92;
  cam.position.copy(sphere.center).addScaledVector(dir, d);
  cam.lookAt(sphere.center);
  renderer.setClearColor('#E9EEF3', 1);
  renderer.render(scene, cam);
  return [renderer.domElement.toDataURL('image/png'), tris];
}

const wrap = document.createElement('div');
wrap.style.cssText = `display:grid;grid-template-columns:repeat(${BIG ? 3 : 5},${SIZE}px);gap:6px;font:600 14px -apple-system,Helvetica,sans-serif;color:#333;padding:6px;background:#fff`;
document.body.appendChild(wrap);
for (const id of ids) {
  const cell = document.createElement('div');
  const img = document.createElement('img');
  const [url, tris] = render(id);
  img.src = url;
  img.width = SIZE;
  cell.appendChild(img);
  cell.appendChild(document.createElement('br'));
  cell.appendChild(document.createTextNode(`${id} · ${Math.round(tris)} tris`));
  wrap.appendChild(cell);
}
(window as unknown as { done: boolean }).done = true;
