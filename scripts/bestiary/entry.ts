// Browser bundle for the design bestiary: renders Lockin creatures into a <canvas>.
// Build: npx esbuild scripts/bestiary/entry.ts --bundle --format=iife --minify --outfile=<out>.js
import * as THREE from 'three';
import { addLights, buildCreature, Creature } from '../../src/creatures/build';
import { buildGarden, GARDEN_CAMERA, GardenScene } from '../../src/creatures/garden';
import { displayName, Equipped, Garden, LEVEL_HOURS, LEVEL_UNLOCKS, PLAN_NAMES, SHOP_ITEMS, SPECIES, TIERS, formFor, tierFor } from '../../src/creatures/species';

type Item = { species: number | null; level: number; equipped?: Equipped; garden?: Garden };

/** Renders a grid of creatures in ONE WebGL context. Drag to turn them all. */
function mount(canvas: HTMLCanvasElement, opts: { items: Item[]; cols: number; background?: string }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setScissorTest(true);
  const scene = new THREE.Scene();
  addLights(scene);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 1.5, 4.8);
  camera.lookAt(0, 0.85, 0);

  const gardenCamera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  gardenCamera.position.set(...GARDEN_CAMERA.position);
  gardenCamera.lookAt(...GARDEN_CAMERA.target);

  let creatures: Creature[] = [];
  let gardens: (GardenScene | null)[] = [];
  const build = () => {
    creatures.forEach((c) => c.dispose());
    gardens.forEach((g) => g?.dispose());
    creatures = opts.items.map((it) => buildCreature(it));
    gardens = opts.items.map((it) => (it.garden ? buildGarden(it.garden) : null));
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
    gardenCamera.aspect = cw / ch;
    gardenCamera.updateProjectionMatrix();
    creatures.forEach((c, i) => {
      const x = (i % cols) * cw;
      const y = h - (Math.floor(i / cols) + 1) * ch;
      renderer.setViewport(x, y, cw, ch);
      renderer.setScissor(x, y, cw, ch);
      c.group.rotation.y = yaw;
      c.update(t + i * 0.37);
      const g = gardens[i];
      if (g) {
        renderer.setClearColor(g.sky, 1);
        renderer.clear();
        g.update(t);
        scene.add(g.group);
      }
      scene.add(c.group);
      renderer.render(scene, g ? gardenCamera : camera);
      scene.remove(c.group);
      if (g) scene.remove(g.group);
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
      gardens.forEach((g) => g?.dispose());
      renderer.dispose();
    },
  };
}

(window as unknown as { LockinBestiary: unknown }).LockinBestiary = {
  mount,
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
