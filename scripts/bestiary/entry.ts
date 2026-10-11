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
function mountWorld(
  canvas: HTMLCanvasElement,
  opts: { world?: World; pets: PetSpec[]; yaw?: number; distance?: number; names?: Record<string, string>; onVisit?: (id: string) => void },
) {
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
    cam.pan(e.clientX - last[0], e.clientY - last[1], canvas.clientHeight);
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
    setWorld: (world: World) => island.setWorld(world),
    setFocus: focus,
    destroy() {
      cancelAnimationFrame(raf);
      island.dispose();
      renderer.dispose();
      bubble.remove();
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
