// The island in 3D: ground tiles, placed objects and pets walking around.
import * as THREE from 'three';
import { buildCreature, Creature } from '../creatures/build';
import { Equipped } from '../creatures/species';
import { buildDecor, makeKit, TILE_COLORS, tileDetails } from './decor';
import { disposeGeometries, flatten } from './flatten';
import { tileAt, walkable, World, WORLD_SIZE } from './world';

export type PetSpec = { id: string; species: number | null; level: number; equipped?: Equipped };

type Walker = {
  spec: PetSpec;
  creature: Creature;
  body: THREE.Group;
  x: number;
  z: number;
  tx: number;
  tz: number;
  wait: number;
  seed: number;
};

const PET_SCALE = 0.62;
const SPEED = 0.7;
/** Height of each painted ground, so overlaps between kinds stay clean. */
const LAYER: Record<string, number> = {
  path: 0.006, meadow: 0.012, beach: 0.018, snow: 0.024, cobble: 0.03, wood: 0.036, clouds: 0.042, water: 0.048,
};
/** Big things may overflow their cell a little, it looks better. */
const DECOR_SCALE: Record<string, number> = {
  tent: 1.3, doghouse: 1.3, cabin: 1.35, cottage: 1.4, mushroom: 1.4, castle: 1.5,
  pine: 1.3, apple: 1.35, palm: 1.35, sakura: 1.35, crystal: 1.3, fountain: 1.15, well: 1.1, rainbow: 1.6,
};

export type IslandScene = ReturnType<typeof buildIsland>;

export function buildIsland(initial: World, pets: PetSpec[]) {
  const root = new THREE.Group();
  const kit = makeKit();
  let world = initial;
  let canWalk = walkable(world);
  let ground: THREE.Group | null = null;
  let objects: THREE.Group | null = null;
  let walkers: Walker[] = [];
  let focusId: string | null = null;
  let focusSince = -1;

  // The island's earth underneath, never changes.
  // Soft rounded corners: a cartoon island, not a grid of squares.
  const base = new THREE.Group();
  const slab = (margin: number, radius: number, depth: number, y: number, color: string) => {
    const lo = -margin;
    const hi = WORLD_SIZE + margin;
    const shape = new THREE.Shape();
    shape.moveTo(lo + radius, lo);
    shape.lineTo(hi - radius, lo);
    shape.quadraticCurveTo(hi, lo, hi, lo + radius);
    shape.lineTo(hi, hi - radius);
    shape.quadraticCurveTo(hi, hi, hi - radius, hi);
    shape.lineTo(lo + radius, hi);
    shape.quadraticCurveTo(lo, hi, lo, hi - radius);
    shape.lineTo(lo, lo + radius);
    shape.quadraticCurveTo(lo, lo, lo + radius, lo);
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.08, bevelSegments: 3, curveSegments: 10 });
    // Shape is drawn in x/y; lay it flat so it extends downward from y.
    kit.add(base, geo, kit.mat(color), [0, y, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    return shape;
  };
  const top = slab(0.35, 1.4, 0.06, -0.09, TILE_COLORS.grass[0]);
  // A perfectly flat lawn on top (the bevelled slab alone shades unevenly).
  kit.add(base, new THREE.ShapeGeometry(top, 10), kit.mat('#8BD46B'), [0, -0.004, 0], [1, -1, 1], [-Math.PI / 2, 0, 0]);
  slab(0.3, 1.4, 0.45, -0.17, '#B07D52');
  slab(-0.6, 1.8, 0.5, -0.62, '#94663F');
  const flatBase = flatten(base);
  root.add(flatBase);
  disposeGeometries(base);

  /** A flat 1×1 square whose outer corners are rounded (corners in order: nw, ne, se, sw). */
  const cellShape = (round: [boolean, boolean, boolean, boolean]) => {
    const r = 0.45;
    const [nw, ne, se, sw] = round;
    const sh = new THREE.Shape();
    // Shape y is world -z (north up).
    sh.moveTo(-0.5, nw ? 0.5 - r : 0.5);
    if (nw) sh.quadraticCurveTo(-0.5, 0.5, -0.5 + r, 0.5);
    sh.lineTo(ne ? 0.5 - r : 0.5, 0.5);
    if (ne) sh.quadraticCurveTo(0.5, 0.5, 0.5, 0.5 - r);
    sh.lineTo(0.5, se ? -0.5 + r : -0.5);
    if (se) sh.quadraticCurveTo(0.5, -0.5, 0.5 - r, -0.5);
    sh.lineTo(sw ? -0.5 + r : -0.5, -0.5);
    if (sw) sh.quadraticCurveTo(-0.5, -0.5, -0.5, -0.5 + r);
    sh.closePath();
    return new THREE.ShapeGeometry(sh, 6);
  };
  const buildGround = () => {
    const g = new THREE.Group();
    for (let z = 0; z < WORLD_SIZE; z++)
      for (let x = 0; x < WORLD_SIZE; x++) {
        const id = tileAt(world, x, z);
        // Painted ground: squares that round their outer corners, so paths and ponds look smooth.
        if (id !== 'grass') {
          const [top] = TILE_COLORS[id] ?? TILE_COLORS.grass;
          const same = (dx: number, dz: number) => {
            const nx = x + dx;
            const nz = z + dz;
            return nx < 0 || nz < 0 || nx >= WORLD_SIZE || nz >= WORLD_SIZE ? false : tileAt(world, nx, nz) === id;
          };
          const n = same(0, -1);
          const sTile = same(0, 1);
          const w = same(-1, 0);
          const e = same(1, 0);
          const shape = cellShape([!n && !w, !n && !e, !sTile && !e, !sTile && !w]);
          kit.add(g, shape, kit.mat(top, id === 'water' ? 0.12 : 0), [x + 0.5, LAYER[id] ?? 0.004, z + 0.5], [1, 1, 1], [-Math.PI / 2, 0, 0]);
        }
        tileDetails(id, kit, g, x, z, z * WORLD_SIZE + x + 1);
      }
    const flat = flatten(g);
    disposeGeometries(g);
    return flat;
  };

  const buildObjects = () => {
    const g = new THREE.Group();
    for (const [id, x, z, turns] of world.objects) {
      const o = buildDecor(id, kit);
      o.scale.setScalar(DECOR_SCALE[id] ?? 1);
      o.position.set(x + 0.5, 0, z + 0.5);
      o.rotation.y = (turns * Math.PI) / 2;
      g.add(o);
    }
    const flat = flatten(g);
    disposeGeometries(g);
    return flat;
  };

  const rand = (w: Walker) => {
    w.seed = (w.seed * 16807) % 2147483647;
    return w.seed / 2147483647;
  };
  const freeCell = (w: Walker | null, nearX?: number, nearZ?: number): [number, number] | null => {
    for (let tries = 0; tries < 40; tries++) {
      const r = w ? rand(w) : Math.random();
      const r2 = w ? rand(w) : Math.random();
      const x = nearX === undefined ? Math.floor(r * WORLD_SIZE) : Math.round(nearX - 0.5 + (r - 0.5) * 7);
      const z = nearZ === undefined ? Math.floor(r2 * WORLD_SIZE) : Math.round(nearZ - 0.5 + (r2 - 0.5) * 7);
      if (x >= 0 && z >= 0 && x < WORLD_SIZE && z < WORLD_SIZE && canWalk[z * WORLD_SIZE + x]) return [x + 0.5, z + 0.5];
    }
    return null;
  };

  const addWalker = (spec: PetSpec, i: number) => {
    const creature = buildCreature({ species: spec.species, level: spec.level, equipped: spec.equipped });
    const body = flatten(creature.group);
    body.scale.setScalar(PET_SCALE);
    const w: Walker = { spec, creature, body, x: 8, z: 8, tx: 8, tz: 8, wait: i * 0.4, seed: 1 + i * 7919 };
    const start = freeCell(w) ?? [8, 8];
    [w.x, w.z] = start;
    [w.tx, w.tz] = start;
    body.position.set(w.x, 0, w.z);
    body.rotation.y = rand(w) * Math.PI * 2;
    root.add(body);
    walkers.push(w);
  };

  const removeWalkers = () => {
    walkers.forEach((w) => {
      root.remove(w.body);
      disposeGeometries(w.body);
      w.creature.dispose();
    });
    walkers = [];
  };

  const setWorld = (next: World) => {
    const tilesChanged = !ground || next.tiles !== world.tiles;
    const objectsChanged = !objects || next.objects !== world.objects;
    world = next;
    canWalk = walkable(world);
    if (tilesChanged) {
      if (ground) {
        root.remove(ground);
        disposeGeometries(ground);
      }
      ground = buildGround();
      root.add(ground);
    }
    if (objectsChanged) {
      if (objects) {
        root.remove(objects);
        disposeGeometries(objects);
      }
      objects = buildObjects();
      root.add(objects);
    }
    // Pets standing where something was just placed hop to a free spot.
    for (const w of walkers) {
      const cell = Math.floor(w.z) * WORLD_SIZE + Math.floor(w.x);
      if (!canWalk[cell]) {
        const spot = freeCell(w, w.x, w.z) ?? freeCell(w);
        if (spot) [w.x, w.z, w.tx, w.tz] = [spot[0], spot[1], spot[0], spot[1]];
      }
    }
  };

  const setPets = (next: PetSpec[]) => {
    const key = (p: PetSpec) => `${p.id}|${p.species}|${p.level}|${JSON.stringify(p.equipped ?? {})}`;
    if (next.map(key).join() === walkers.map((w) => key(w.spec)).join()) return;
    removeWalkers();
    next.forEach(addWalker);
  };

  setWorld(initial);
  setPets(pets);

  return {
    group: root,
    sky: '#CFEBFF',
    setWorld,
    setPets,
    /** Moves the pets around. dt in seconds. */
    /** Pet that was tapped: it stops and looks at the camera. */
    setFocus(id: string | null) {
      if (id !== focusId) focusSince = -1;
      focusId = id;
    },
    update(t: number, dt: number, camera?: THREE.Vector3) {
      for (const w of walkers) {
        if (w.spec.id === focusId) {
          if (focusSince < 0) focusSince = t;
          const face = camera ? Math.atan2(camera.x - w.x, camera.z - w.z) : w.body.rotation.y;
          let turn = face - w.body.rotation.y;
          turn = Math.atan2(Math.sin(turn), Math.cos(turn));
          w.body.rotation.y += turn * Math.min(1, dt * 10);
          // Two happy hops, then stands still.
          const k = t - focusSince;
          w.body.position.set(w.x, k < 0.9 ? Math.abs(Math.sin(k * 7)) * 0.18 : 0, w.z);
          w.tx = w.x;
          w.tz = w.z;
          w.wait = 1;
          continue;
        }
        if (w.wait > 0) {
          w.wait -= dt;
          w.body.position.y = 0;
          if (w.wait <= 0) {
            const next = freeCell(w, w.x, w.z);
            if (next) [w.tx, w.tz] = next;
          }
          continue;
        }
        const dx = w.tx - w.x;
        const dz = w.tz - w.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) {
          w.wait = 1 + rand(w) * 4;
          continue;
        }
        const step = Math.min(d, SPEED * dt);
        const nx = w.x + (dx / d) * step;
        const nz = w.z + (dz / d) * step;
        // Stop at obstacles (something placed on the way, water).
        if (!canWalk[Math.floor(nz) * WORLD_SIZE + Math.floor(nx)]) {
          w.wait = 0.5;
          continue;
        }
        w.x = nx;
        w.z = nz;
        const face = Math.atan2(dx, dz);
        let turn = face - w.body.rotation.y;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        w.body.rotation.y += turn * Math.min(1, dt * 8);
        w.body.position.set(w.x, Math.abs(Math.sin(t * 9 + w.seed)) * 0.05, w.z);
      }
    },
    /** Grid cell under a ray, if it hits the island. */
    pickCell(ray: THREE.Ray): [number, number] | null {
      const hit = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      if (!hit) return null;
      const x = Math.floor(hit.x);
      const z = Math.floor(hit.z);
      return x >= 0 && z >= 0 && x < WORLD_SIZE && z < WORLD_SIZE ? [x, z] : null;
    },
    /** The pet closest to a ray (a tap), if any. */
    pickPet(ray: THREE.Ray): string | null {
      let best: string | null = null;
      let bestD = 0.45;
      const p = new THREE.Vector3();
      for (const w of walkers) {
        p.set(w.x, 0.35, w.z);
        const d = ray.distanceToPoint(p);
        if (d < bestD) {
          bestD = d;
          best = w.spec.id;
        }
      }
      return best;
    },
    /** Where a pet stands (top of its head), if it is here. */
    petPosition(id: string): THREE.Vector3 | null {
      const w = walkers.find((x) => x.spec.id === id);
      return w ? new THREE.Vector3(w.x, 0.95, w.z) : null;
    },
    /** Where each pet stands (for name labels). */
    petPositions(): { id: string; x: number; y: number; z: number }[] {
      return walkers.map((w) => ({ id: w.spec.id, x: w.x, y: 1.0, z: w.z }));
    },
    dispose() {
      removeWalkers();
      [flatBase, ground, objects].forEach((g) => g && disposeGeometries(g));
      kit.dispose();
    },
  };
}

/** Orbit camera around a point of the island. */
export class IslandCamera {
  camera: THREE.PerspectiveCamera;
  target = new THREE.Vector3(WORLD_SIZE / 2, 0, WORLD_SIZE / 2);
  distance = 22;
  yaw = 0;
  pitch = 0.85;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 100);
    this.apply();
  }

  apply() {
    const { target, distance, yaw, pitch } = this;
    this.camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      target.y + Math.sin(pitch) * distance,
      target.z + Math.cos(yaw) * Math.cos(pitch) * distance,
    );
    this.camera.lookAt(target);
  }

  /** Drag by (dx, dy) pixels on a view `height` pixels tall. */
  pan(dx: number, dy: number, height: number) {
    const k = (this.distance / height) * 1.1;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    this.target.x -= (dx * cos + dy * sin) * k;
    this.target.z -= (-dx * sin + dy * cos) * k;
    this.target.x = Math.max(-1, Math.min(WORLD_SIZE + 1, this.target.x));
    this.target.z = Math.max(-1, Math.min(WORLD_SIZE + 1, this.target.z));
    this.apply();
  }

  zoom(factor: number) {
    this.distance = Math.max(4, Math.min(32, this.distance / factor));
    this.apply();
  }

  rotate(angle: number) {
    this.yaw += angle;
    this.apply();
  }

  /** Ray from a point of the view (pixels). */
  ray(x: number, y: number, width: number, height: number): THREE.Ray {
    const r = new THREE.Raycaster();
    r.setFromCamera(new THREE.Vector2((x / width) * 2 - 1, -(y / height) * 2 + 1), this.camera);
    return r.ray;
  }

  /** Screen position (pixels) of a world point, or null if behind the camera. */
  project(p: THREE.Vector3, width: number, height: number): { x: number; y: number } | null {
    const v = p.clone().project(this.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
  }
}
