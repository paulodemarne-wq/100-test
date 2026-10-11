// Browser bundle for the design bestiary: renders Lockin creatures into a <canvas>.
// Build: npx esbuild scripts/bestiary/entry.ts --bundle --format=iife --minify --outfile=<out>.js
import * as THREE from 'three';
import { addLights, buildCreature, Creature } from '../../src/creatures/build';
import { buildIsland, IslandCamera, PetSpec } from '../../src/world/scene';
import { defaultWorld, World } from '../../src/world/world';
import { displayName, Equipped, LEVEL_HOURS, LEVEL_UNLOCKS, PLAN_NAMES, SHOP_ITEMS, SPECIES, TIERS, formFor, tierFor } from '../../src/creatures/species';

type Item = { species: number | null; level: number; equipped?: Equipped };

/** Renders a grid of creatures in ONE WebGL context. Drag to turn them all. */
function mount(canvas: HTMLCanvasElement, opts: { items: Item[]; cols: number; background?: string }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(3, Math.max(2, window.devicePixelRatio || 1)));
  renderer.setScissorTest(true);
  const scene = new THREE.Scene();
  addLights(scene);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 1.5, 4.8);
  camera.lookAt(0, 0.85, 0);

  let creatures: Creature[] = [];
  const build = () => {
    creatures.forEach((c) => c.dispose());
    creatures = opts.items.map((it) => buildCreature(it));
  };
  build();

  let yaw = 0.5;
  let dragging = false;
  let lastX = 0;
  let velocity = 0;
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    velocity = (e.clientX - lastX) * 0.012;
    yaw += velocity;
    lastX = e.clientX;
  });
  const stop = () => {
    dragging = false;
    canvas.style.cursor = 'grab';
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  let raf = 0;
  const start = performance.now();
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    if (!dragging) {
      velocity *= 0.95;
      yaw += velocity + 0.004;
    }
    const t = (performance.now() - start) / 1000;
    const cols = opts.cols;
    const rows = Math.ceil(creatures.length / cols);
    const cw = w / cols;
    const ch = h / rows;
    renderer.setClearColor(0x000000, 0);
    renderer.setScissor(0, 0, w, h);
    renderer.setViewport(0, 0, w, h);
    renderer.clear();
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
    creatures.forEach((c, i) => {
      const x = (i % cols) * cw;
      const y = h - (Math.floor(i / cols) + 1) * ch;
      renderer.setViewport(x, y, cw, ch);
      renderer.setScissor(x, y, cw, ch);
      c.group.rotation.y = yaw;
      c.update(t + i * 0.37);
      scene.add(c.group);
      renderer.render(scene, camera);
      scene.remove(c.group);
    });
  };
  frame();

  return {
    setItems(items: Item[], cols?: number) {
      opts.items = items;
      if (cols) opts.cols = cols;
      build();
    },
    destroy() {
      cancelAnimationFrame(raf);
      creatures.forEach((c) => c.dispose());
      renderer.dispose();
    },
  };
}

/** Renders an island with pets walking on it. Drag to move, wheel to zoom. */
function mountWorld(canvas: HTMLCanvasElement, opts: { world?: World; pets: PetSpec[]; yaw?: number; distance?: number }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(3, Math.max(2, window.devicePixelRatio || 1)));
  const scene = new THREE.Scene();
  addLights(scene);
  const island = buildIsland(opts.world ?? defaultWorld(), opts.pets);
  scene.add(island.group);
  const cam = new IslandCamera(1);
  if (opts.yaw !== undefined) cam.yaw = opts.yaw;
  if (opts.distance !== undefined) cam.distance = opts.distance;
  cam.apply();
  renderer.setClearColor(island.sky, 1);

  let dragging = false;
  let last = [0, 0];
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    last = [e.clientX, e.clientY];
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    cam.pan(e.clientX - last[0], e.clientY - last[1], canvas.clientHeight);
    last = [e.clientX, e.clientY];
  });
  canvas.addEventListener('pointerup', () => (dragging = false));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.zoom(e.deltaY < 0 ? 1.1 : 0.9);
  });

  let raf = 0;
  let prev = performance.now();
  const start = prev;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    cam.camera.aspect = w / h;
    cam.camera.updateProjectionMatrix();
    island.update((now - start) / 1000, Math.min(0.1, (now - prev) / 1000));
    prev = now;
    renderer.render(scene, cam.camera);
  };
  frame();
  return {
    setWorld: (world: World) => island.setWorld(world),
    destroy() {
      cancelAnimationFrame(raf);
      island.dispose();
      renderer.dispose();
    },
  };
}

(window as unknown as { LockinBestiary: unknown }).LockinBestiary = {
  mount,
  mountWorld,
  defaultWorld,
  species: SPECIES.map((s) => ({
    id: s.id,
    names: s.names,
    element: s.element.name,
    line: s.line.map((p) => PLAN_NAMES[p]),
    color: s.traits.body,
  })),
  tiers: TIERS,
  levelHours: LEVEL_HOURS,
  unlocks: LEVEL_UNLOCKS,
  tierFor,
  formFor,
  nameAt: (id: number, level: number) => displayName(SPECIES[id] ?? null, level),
  items: SHOP_ITEMS,
};
