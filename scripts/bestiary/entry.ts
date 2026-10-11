// Browser bundle for the design bestiary: renders Lockin creatures into a <canvas>.
// Build: npx esbuild scripts/bestiary/entry.ts --bundle --format=iife --minify --outfile=<out>.js
import * as THREE from 'three';
import { addLights, buildCreature, Creature } from '../../src/creatures/build';
import { buildDecor, makeKit, TILE_COLORS } from '../../src/world/decor';
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
function mountWorld(
  canvas: HTMLCanvasElement,
  opts: { world?: World; pets: PetSpec[]; yaw?: number; distance?: number; names?: Record<string, string>; onVisit?: (id: string) => void },
) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(3, Math.max(2, window.devicePixelRatio || 1)));
  const scene = new THREE.Scene();
  addLights(scene);
  const world0 = opts.world ?? defaultWorld();
  const island = buildIsland(world0, opts.pets);
  scene.add(island.group);
  const cam = new IslandCamera(1);
  cam.fit(world0.size);
  if (opts.yaw !== undefined) cam.yaw = opts.yaw;
  if (opts.distance !== undefined) cam.distance = opts.distance;
  cam.apply();
  renderer.setClearColor(island.sky, 1);

  let dragging = false;
  let moved = 0;
  let last = [0, 0];
  let focusId: string | null = null;
  let gliding = false;
  // Bubble above a clicked pet: name + "visit" button (same as the app).
  const bubble = document.createElement('div');
  bubble.style.cssText =
    'position:absolute;left:0;top:0;display:none;transform:translate(-50%,-100%);background:#fff;border-radius:16px;padding:10px 14px;' +
    'box-shadow:0 6px 20px rgba(0,0,0,.18);font:600 15px system-ui,sans-serif;color:#1B1A2E;text-align:center;pointer-events:auto;white-space:nowrap';
  if (canvas.parentElement) canvas.parentElement.appendChild(bubble);
  const focus = (id: string | null) => {
    focusId = id;
    island.setFocus(id);
    gliding = !!id;
    bubble.style.display = id ? 'block' : 'none';
    if (!id) return;
    bubble.innerHTML = '';
    const name = document.createElement('div');
    name.textContent = opts.names?.[id] ?? 'Ami';
    name.style.cssText = 'font-size:17px;font-weight:800;margin-bottom:6px';
    bubble.appendChild(name);
    if (opts.onVisit) {
      const btn = document.createElement('button');
      btn.textContent = '🏝️ Voir son île';
      btn.style.cssText = 'border:none;border-radius:999px;background:#5856D6;color:#fff;font:700 14px system-ui;padding:8px 14px;cursor:pointer';
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      btn.addEventListener('click', () => {
        const target = id;
        focus(null);
        opts.onVisit?.(target);
      });
      bubble.appendChild(btn);
    }
  };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    gliding = false;
    moved = 0;
    last = [e.clientX, e.clientY];
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    moved += Math.abs(e.clientX - last[0]) + Math.abs(e.clientY - last[1]);
    const r = canvas.getBoundingClientRect();
    const sx = canvas.clientWidth / r.width;
    const sy = canvas.clientHeight / r.height;
    cam.grab((last[0] - r.left) * sx, (last[1] - r.top) * sy, (e.clientX - r.left) * sx, (e.clientY - r.top) * sy, canvas.clientWidth, canvas.clientHeight);
    last = [e.clientX, e.clientY];
  });
  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    if (moved > 6) return;
    const r = canvas.getBoundingClientRect();
    // The canvas may be scaled (zoomed design canvas): work in its own CSS pixels.
    const x = ((e.clientX - r.left) / r.width) * canvas.clientWidth;
    const y = ((e.clientY - r.top) / r.height) * canvas.clientHeight;
    focus(island.pickPet(cam.ray(x, y, canvas.clientWidth, canvas.clientHeight)));
  });
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
    const target = focusId ? island.petPosition(focusId) : null;
    if (target && gliding && cam.glideTo(target, Math.min(0.1, (now - prev) / 1000))) gliding = false;
    island.update((now - start) / 1000, Math.min(0.1, (now - prev) / 1000), cam.camera.position);
    prev = now;
    renderer.render(scene, cam.camera);
    if (target) {
      const p = cam.project(target, w, h);
      if (p) {
        bubble.style.left = canvas.offsetLeft + p.x + 'px';
        bubble.style.top = canvas.offsetTop + p.y - 8 + 'px';
      }
    }
  };
  frame();
  return {
    setWorld: (world: World) => {
      const grew = world.size !== island.size;
      island.setWorld(world);
      if (grew) cam.fit(world.size);
    },
    setFocus: focus,
    destroy() {
      cancelAnimationFrame(raf);
      island.dispose();
      renderer.dispose();
      bubble.remove();
    },
  };
}

/** Renders island objects (or ground tiles) one per cell, slowly turning — for the shop board. */
function mountDecor(canvas: HTMLCanvasElement, opts: { ids: string[]; cols: number }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(3, Math.max(2, window.devicePixelRatio || 1)));
  renderer.setScissorTest(true);
  const scene = new THREE.Scene();
  addLights(scene);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.6, 4.2);
  camera.lookAt(0, 0.45, 0);
  const kit = makeKit();
  const models = opts.ids.map((id) => {
    const g = new THREE.Group();
    const tile = TILE_COLORS[id];
    // A little plot of ground under each object (the tile itself for grounds).
    const boat = SHOP_ITEMS.some((it) => it.id === id && it.slot === 'boat');
    kit.add(g, new THREE.CylinderGeometry(0.85, 0.9, 0.12, 32), kit.mat(tile ? tile[0] : boat ? '#4FB6EA' : '#8BD46A'), [0, -0.06, 0]);
    if (id === 'sea') {
      kit.add(g, new THREE.CylinderGeometry(0.86, 0.86, 0.02, 32), kit.mat('#4FB6EA', 0.1), [0, 0.0, 0]);
      kit.add(g, new THREE.CylinderGeometry(0.35, 0.4, 0.1, 24), kit.mat('#F2D59B'), [0, 0.03, 0]);
      kit.add(g, new THREE.ConeGeometry(0.06, 0.4, 3), kit.mat('#FFFFFF'), [0.5, 0.25, 0.2], [0.1, 1, 1]);
    } else if (/^size/.test(id)) {
      const n = Number(id.slice(4)) / 4;
      const cell = 1.1 / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) kit.add(g, new THREE.BoxGeometry(cell * 0.95, 0.04, cell * 0.95), kit.mat((i + j) % 2 ? '#8BD46A' : '#A2DE74'), [(i - (n - 1) / 2) * cell, 0.02, (j - (n - 1) / 2) * cell]);
    } else if (!tile) {
      const o = buildDecor(id, kit);
      const box = new THREE.Box3().setFromObject(o);
      const size = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z, 0.01);
      o.scale.setScalar(Math.min(1.3, 1.25 / size));
      g.add(o);
    }
    return g;
  });
  let raf = 0;
  const start = performance.now();
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    const rows = Math.ceil(models.length / opts.cols);
    const cw = w / opts.cols;
    const ch = h / rows;
    renderer.setClearColor(0x000000, 0);
    renderer.setScissor(0, 0, w, h);
    renderer.setViewport(0, 0, w, h);
    renderer.clear();
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
    const t = (performance.now() - start) / 1000;
    models.forEach((m, i) => {
      const x = (i % opts.cols) * cw;
      const y = h - (Math.floor(i / opts.cols) + 1) * ch;
      renderer.setViewport(x, y + ch * 0.12, cw, ch * 0.88);
      renderer.setScissor(x, y, cw, ch);
      m.rotation.y = t * 0.4 + i;
      scene.add(m);
      renderer.render(scene, camera);
      scene.remove(m);
    });
  };
  frame();
  return {
    destroy() {
      cancelAnimationFrame(raf);
      models.forEach((m) => m.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose()));
      kit.dispose();
      renderer.dispose();
    },
  };
}

(window as unknown as { LockinBestiary: unknown }).LockinBestiary = {
  mountDecor,
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
