// Preview of the realistic islands (normal, snow, cloud) rendered like the app (same camera, lights, fog).
// Build: npx esbuild scripts/real/island-preview.ts --bundle --format=iife --outfile=<dir>/real.js
// Hash options: #g,n,c (which islands), #...,close (zoomed in), #...,yaw=1.2
import * as THREE from 'three';
import { addNatureLights, setupRenderer } from '../../src/creatures/real/lights';
import { fitSun, updateFog } from '../../src/world/real/island';
import { buildIsland, IslandCamera, PetSpec } from '../../src/world/scene';
import { PlacedObject, readWorld, World } from '../../src/world/world';

const W = 1200;
const H = 800;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
setupRenderer(renderer);

const opts = (location.hash || '#g,n,c').slice(1).split(',');
const close = opts.includes('close');
const yawOpt = opts.find((o) => o.startsWith('yaw='));

function paint(size: number, base: string, cells: [string, number, number, number, number][]): string {
  const t = base.repeat(size * size).split('');
  for (const [c, x0, z0, w, h] of cells) for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) t[z * size + x] = c;
  return t.join('');
}

function normalWorld(): World {
  const tiles = paint(16, 'g', [
    ['p', 2, 7, 12, 1],
    ['p', 7, 2, 1, 12],
    ['o', 6, 6, 3, 3],
    ['w', 10, 9, 3, 3],
    ['w', 11, 12, 2, 1],
    ['d', 9, 9, 1, 3],
    ['f', 1, 1, 4, 4],
    ['f', 12, 2, 3, 2],
    ['s', 0, 13, 5, 3],
  ]);
  const objects: PlacedObject[] = [
    ['cottage', 3, 5, 0], ['cabin', 9, 4, 1], ['castle', 12, 5, 0], ['pine', 1, 9, 0], ['apple', 4, 10, 0],
    ['sakura', 13, 13, 0], ['palm', 1, 14, 0], ['bush', 5, 9, 0], ['fence', 2, 6, 0], ['fence', 3, 6, 0],
    ['rock', 14, 8, 0], ['flowerbed', 2, 2, 0], ['bench', 6, 5, 0], ['lamp', 8, 6, 0], ['fountain', 7, 7, 0],
    ['well', 5, 12, 0], ['campfire', 10, 7, 0], ['table', 9, 10, 0], ['windmill', 13, 1, 0], ['tent', 4, 14, 0],
    ['mailbox', 8, 3, 0], ['sunflower', 3, 3, 0], ['autumn', 14, 11, 0], ['hedge', 11, 0, 0], ['umbrella', 2, 15, 0],
    ['rowboat', 11, 10, 0], ['sailboat', -3, 6, 0], ['pumpkin', 6, 10, 0],
  ];
  return readWorld({ v: 2, size: 16, sea: true, tiles, objects });
}

function snowWorld(): World {
  const tiles = paint(16, 'n', [
    ['p', 3, 8, 10, 1],
    ['o', 6, 4, 4, 3],
    ['w', 11, 11, 2, 2],
    ['g', 1, 1, 3, 3],
  ]);
  const objects: PlacedObject[] = [
    ['igloo', 4, 4, 0], ['pine', 2, 11, 0], ['pine', 3, 13, 0], ['snowman', 8, 10, 0], ['cabin', 12, 5, 1],
    ['lamp', 6, 9, 0], ['pine', 14, 2, 0], ['rock', 10, 13, 0], ['bench', 9, 7, 0], ['lanterns', 7, 3, 0],
  ];
  return readWorld({ v: 2, size: 16, sea: false, tiles, objects }, 'n');
}

function cloudWorld(): World {
  const tiles = paint(16, 'c', [
    ['g', 3, 3, 6, 5],
    ['f', 9, 9, 4, 4],
    ['p', 2, 10, 10, 1],
    ['o', 10, 3, 3, 3],
  ]);
  const objects: PlacedObject[] = [
    ['castle', 5, 4, 0], ['rainbow', 11, 11, 0], ['crystal', 2, 13, 0], ['balloon', 13, 7, 0], ['gazebo', 11, 4, 0],
    ['portal', 7, 13, 0], ['sakura', 4, 8, 0], ['throne', 9, 2, 0], ['lanterns', 1, 6, 0],
  ];
  return readWorld({ v: 2, size: 16, sea: false, tiles, objects }, 'c');
}

const pets: PetSpec[] = [
  { id: 'a', species: 3, level: 12 },
  { id: 'b', species: 17, level: 25 },
  { id: 'c', species: 22, level: 18 },
  { id: 'd', species: 6, level: 36 },
];

function renderIsland(world: World): string {
  const scene = new THREE.Scene();
  const sun = addNatureLights(scene);
  fitSun(sun, world.size);
  const t0 = performance.now();
  const island = buildIsland(world, pets);
  console.log(`build: ${Math.round(performance.now() - t0)} ms`);
  // Repainting a few tiles (what the editor does on each tap).
  const t1 = performance.now();
  const i = 5 * world.size + 12;
  const painted = { ...world, tiles: world.tiles.slice(0, i) + 'p' + world.tiles.slice(i + 1) };
  island.setWorld(painted);
  island.setWorld(world);
  console.log(`2 repaints: ${Math.round(performance.now() - t1)} ms`);
  scene.add(island.group);
  const cam = new IslandCamera(W / H);
  cam.fit(world.size);
  if (yawOpt) cam.yaw = Number(yawOpt.slice(4));
  if (close) cam.distance = 9;
  cam.apply();
  renderer.setClearColor(island.sky, 1);
  updateFog(scene, island.sky, cam.distance);
  // Let the pets walk a little.
  for (let i = 0; i < 40; i++) island.update(2 + i * 0.05, 0.05, cam.camera.position);
  renderer.render(scene, cam.camera);
  const url = renderer.domElement.toDataURL('image/png');
  island.dispose();
  return url;
}

const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;background:#fff';
document.body.appendChild(wrap);
const worlds: [string, () => World][] = [
  ['g', normalWorld],
  ['n', snowWorld],
  ['c', cloudWorld],
];
for (const [key, make] of worlds) {
  if (!opts.includes(key)) continue;
  const t0 = performance.now();
  const img = document.createElement('img');
  img.src = renderIsland(make());
  img.width = W;
  wrap.appendChild(img);
  console.log(`${key}: ${Math.round(performance.now() - t0)} ms`);
}
(window as unknown as { done: boolean }).done = true;
