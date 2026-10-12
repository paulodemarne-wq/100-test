// The island in 3D: ground tiles, placed objects and pets walking around.
import * as THREE from 'three';
import { buildCreature, Creature } from '../creatures/build';
import { Equipped } from '../creatures/species';
import { buildDecor, makeKit, TILE_COLORS, tileDetails } from './decor';
import { disposeGeometries, flatten } from './flatten';
import { inside, isBoat, MIN_SIZE, SEA, tileAt, walkable, World } from './world';

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
  boutique: 1.9, igloo: 1.35, treehouse: 1.5, windmill: 1.5, autumn: 1.35, bamboo: 1.2, lighthouse: 1.5,
  rowboat: 1.2, duckboat: 1.2, sailboat: 1.6, yacht: 1.7, pirateship: 2.2,
};

/**
 * A boat that sails by itself. On the sea it goes round the island; on a pond it cruises from
 * one water cell to the next. cell = where it was placed (what the editor knows it by).
 */
type Boat = {
  group: THREE.Group;
  cell: [number, number];
  baseY: number;
  seed: number;
  sea: boolean;
  /** Sea: angle and distance around the island centre, and which way it goes (1 or -1). */
  angle: number;
  radius: number;
  dir: number;
  /** Pond: where it is and the water cell it heads to. */
  x: number;
  z: number;
  tx: number;
  tz: number;
  heading: number;
};

/** Sailing speed, in cells per second. */
const BOAT_SPEED = 0.45;

/** A rounded square from lo to hi (in shape x/y). */
function roundedSquare<T extends THREE.Path>(shape: T, lo: number, hi: number, radius: number): T {
  shape.moveTo(lo + radius, lo);
  shape.lineTo(hi - radius, lo);
  shape.quadraticCurveTo(hi, lo, hi, lo + radius);
  shape.lineTo(hi, hi - radius);
  shape.quadraticCurveTo(hi, hi, hi - radius, hi);
  shape.lineTo(lo + radius, hi);
  shape.quadraticCurveTo(lo, hi, lo, hi - radius);
  shape.lineTo(lo, lo + radius);
  shape.quadraticCurveTo(lo, lo, lo + radius, lo);
  return shape;
}

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

  // The island's earth (rebuilt when the island grows), with soft rounded corners.
  const lawnMat = new THREE.MeshLambertMaterial({ color: TILE_COLORS.grass[0] });
  let base: THREE.Group | null = null;
  let baseSize = 0;
  const buildBase = (size: number) => {
    const b = new THREE.Group();
    const slab = (margin: number, radius: number, depth: number, y: number, color: string) => {
      const shape = roundedSquare(new THREE.Shape(), -margin, size + margin, radius);
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.08, bevelSegments: 3, curveSegments: 10 });
      // Shape is drawn in x/y; lay it flat so it extends downward from y.
      kit.add(b, geo, kit.mat(color), [0, y, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
      return shape;
    };
    const top = slab(0.35, 1.4, 0.06, -0.09, TILE_COLORS.grass[0]);
    // A perfectly flat, matte lawn on top (the bevelled, shiny slab alone shades unevenly).
    kit.add(b, new THREE.ShapeGeometry(top, 10), lawnMat, [0, -0.004, 0], [1, -1, 1], [-Math.PI / 2, 0, 0]);
    slab(0.3, 1.4, 0.45, -0.17, '#B07D52');
    slab(-0.6, 1.8, 0.5, -0.62, '#94663F');
    const flat = flatten(b);
    disposeGeometries(b);
    return flat;
  };

  // The sea: a wide water plane, a foam ring around the island and glints that drift.
  let sea: THREE.Group | null = null;
  const seaAnim: ((t: number) => void)[] = [];
  const buildSea = (size: number) => {
    const g = new THREE.Group();
    const c = size / 2;
    const water = new THREE.Mesh(new THREE.CircleGeometry(size * 2.2 + 30, 64), new THREE.MeshLambertMaterial({ color: '#4FB6EA' }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(c, -0.3, c);
    g.add(water);
    const foamMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.55, depthWrite: false });
    // Foam hugging the island's rounded shore, breathing in and out.
    const foamShape = roundedSquare(new THREE.Shape(), -c - 1.0, c + 1.0, 2.0);
    foamShape.holes.push(roundedSquare(new THREE.Path(), -c - 0.3, c + 0.3, 1.5));
    const foam = new THREE.Mesh(new THREE.ShapeGeometry(foamShape, 12), foamMat);
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(c, -0.28, c);
    g.add(foam);
    seaAnim.push((t) => {
      const k = 1 + Math.sin(t * 1.2) * (0.6 / size);
      foam.scale.set(k, k, 1);
      foamMat.opacity = 0.45 + Math.sin(t * 1.2) * 0.12;
    });
    const glintMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.7, depthWrite: false });
    const glintGeo = new THREE.PlaneGeometry(0.5, 0.06);
    for (let i = 0; i < 40; i++) {
      const glint = new THREE.Mesh(glintGeo, glintMat);
      glint.rotation.x = -Math.PI / 2;
      const a = (i / 40) * Math.PI * 2 + i;
      const r = size * 0.75 + 1 + ((i * 37) % 13);
      glint.position.set(c + Math.cos(a) * r, -0.29, c + Math.sin(a) * r);
      g.add(glint);
      seaAnim.push((t) => {
        glint.position.x = c + Math.cos(a) * r + Math.sin(t * 0.6 + i) * 0.4;
        glint.scale.x = 0.6 + Math.abs(Math.sin(t * 1.5 + i)) * 0.8;
      });
    }
    return {
      group: g,
      dispose: () => {
        g.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
        (water.material as THREE.Material).dispose();
        foamMat.dispose();
        glintMat.dispose();
      },
    };
  };
  let seaHandle: ReturnType<typeof buildSea> | null = null;

  // A soft square that lights up on the cell just tapped in the editor.
  const flashMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, depthWrite: false });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), flashMat);
  flash.rotation.x = -Math.PI / 2;
  flash.visible = false;
  root.add(flash);
  let flashUntil = 0;
  let flashColor = '#FFFFFF';

  // Boats float on their own (not merged) so they can bob on the waves.
  let boats: Boat[] = [];
  const boatGroup = new THREE.Group();
  root.add(boatGroup);
  const buildBoats = () => {
    boats.forEach((b) => {
      boatGroup.remove(b.group);
      disposeGeometries(b.group);
    });
    boats = [];
    world.objects.forEach(([id, x, z, turns], i) => {
      if (!isBoat(id)) return;
      const model = buildDecor(id, kit);
      model.scale.setScalar(DECOR_SCALE[id] ?? 1);
      const flat = flatten(model);
      disposeGeometries(model);
      flat.position.set(x + 0.5, 0, z + 0.5);
      flat.rotation.y = (turns * Math.PI) / 2;
      boatGroup.add(flat);
      const c = world.size / 2;
      const sea = !inside(world, x, z);
      // Far enough out to clear the island's corners.
      const radius = Math.max(Math.hypot(x + 0.5 - c, z + 0.5 - c), world.size * 0.71 + 1.2);
      const angle = Math.atan2(z + 0.5 - c, x + 0.5 - c);
      const dir = i % 2 === 0 ? 1 : -1;
      // On the sea, start on its round, already facing the way it sails.
      const px = sea ? c + Math.cos(angle) * radius : x + 0.5;
      const pz = sea ? c + Math.sin(angle) * radius : z + 0.5;
      if (sea) flat.rotation.y = Math.atan2(-Math.sin(angle) * dir, Math.cos(angle) * dir);
      boats.push({
        group: flat,
        cell: [x, z],
        // On the sea the water is lower than on a pond inside the island.
        baseY: sea ? -0.36 : -0.04,
        seed: i * 1.7,
        sea,
        angle,
        radius,
        dir,
        x: px,
        z: pz,
        tx: px,
        tz: pz,
        heading: flat.rotation.y,
      });
    });
  };

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
    const size = world.size;
    for (let z = 0; z < size; z++)
      for (let x = 0; x < size; x++) {
        const id = tileAt(world, x, z);
        // Painted ground: squares that round their outer corners, so paths and ponds look smooth.
        if (id !== 'grass') {
          const [top] = TILE_COLORS[id] ?? TILE_COLORS.grass;
          const same = (dx: number, dz: number) => {
            const nx = x + dx;
            const nz = z + dz;
            return inside(world, nx, nz) && tileAt(world, nx, nz) === id;
          };
          const n = same(0, -1);
          const sTile = same(0, 1);
          const w = same(-1, 0);
          const e = same(1, 0);
          const shape = cellShape([!n && !w, !n && !e, !sTile && !e, !sTile && !w]);
          kit.add(g, shape, kit.mat(top, id === 'water' ? 0.12 : 0), [x + 0.5, LAYER[id] ?? 0.004, z + 0.5], [1, 1, 1], [-Math.PI / 2, 0, 0]);
        }
        tileDetails(id, kit, g, x, z, z * size + x + 1);
      }
    const flat = flatten(g);
    disposeGeometries(g);
    return flat;
  };

  /** Where each object really is in 3D (its box), to pick it with a tap even on its roof. */
  let objectBoxes: { x: number; z: number; box: THREE.Box3 }[] = [];
  const buildObjects = () => {
    const g = new THREE.Group();
    objectBoxes = [];
    for (const [id, x, z, turns] of world.objects) {
      const o = buildDecor(id, kit);
      o.scale.setScalar(DECOR_SCALE[id] ?? 1);
      o.position.set(x + 0.5, isBoat(id) ? (inside(world, x, z) ? -0.04 : -0.36) : 0, z + 0.5);
      o.rotation.y = (turns * Math.PI) / 2;
      o.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(o);
      // Flat things (paths of flowers…) still get a tappable height.
      box.max.y = Math.max(box.max.y, 0.3);
      objectBoxes.push({ x, z, box });
      if (isBoat(id)) {
        disposeGeometries(o);
        continue;
      }
      g.add(o);
    }
    const flat = flatten(g);
    disposeGeometries(g);
    return flat;
  };

  /** Moves a boat a little: round the island on the sea, from water cell to water cell on a pond. */
  const sail = (b: Boat, dt: number) => {
    const c = world.size / 2;
    let dx: number;
    let dz: number;
    if (b.sea) {
      b.angle += (b.dir * BOAT_SPEED * dt) / b.radius;
      const nx = c + Math.cos(b.angle) * b.radius;
      const nz = c + Math.sin(b.angle) * b.radius;
      dx = nx - b.x;
      dz = nz - b.z;
      b.x = nx;
      b.z = nz;
    } else {
      dx = b.tx - b.x;
      dz = b.tz - b.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) {
        // Next stop: a random water cell next to this one (stays put on a 1-cell pond).
        const cx = Math.floor(b.x);
        const cz = Math.floor(b.z);
        const next = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
          .map(([ox, oz]) => [cx + ox, cz + oz] as const)
          .filter(([nx, nz]) => inside(world, nx, nz) && tileAt(world, nx, nz) === 'water');
        b.seed = (b.seed * 16807 + 11) % 2147483647;
        if (next.length) {
          const [nx, nz] = next[Math.floor((b.seed / 2147483647) * next.length) % next.length];
          b.tx = nx + 0.5;
          b.tz = nz + 0.5;
        }
        dx = 0;
        dz = 0;
      } else {
        const step = Math.min(d, BOAT_SPEED * 0.7 * dt);
        b.x += (dx / d) * step;
        b.z += (dz / d) * step;
      }
    }
    b.group.position.x = b.x;
    b.group.position.z = b.z;
    // Turn smoothly toward where it goes (the models face +z).
    if (Math.hypot(dx, dz) > 1e-4) {
      let turn = Math.atan2(dx, dz) - b.heading;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      b.heading += turn * Math.min(1, dt * 3);
    }
    b.group.rotation.y = b.heading;
  };

  const rand = (w: Walker) => {
    w.seed = (w.seed * 16807) % 2147483647;
    return w.seed / 2147483647;
  };
  const freeCell = (w: Walker | null, nearX?: number, nearZ?: number): [number, number] | null => {
    for (let tries = 0; tries < 40; tries++) {
      const r = w ? rand(w) : Math.random();
      const r2 = w ? rand(w) : Math.random();
      const x = nearX === undefined ? Math.floor(r * world.size) : Math.round(nearX - 0.5 + (r - 0.5) * 7);
      const z = nearZ === undefined ? Math.floor(r2 * world.size) : Math.round(nearZ - 0.5 + (r2 - 0.5) * 7);
      if (inside(world, x, z) && canWalk[z * world.size + x]) return [x + 0.5, z + 0.5];
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
    const seaChanged = !!seaHandle !== next.sea || (next.sea && baseSize !== next.size);
    world = next;
    canWalk = walkable(world);
    if (baseSize !== world.size) {
      if (base) {
        root.remove(base);
        disposeGeometries(base);
      }
      base = buildBase(world.size);
      baseSize = world.size;
      root.add(base);
    }
    if (seaChanged) {
      if (seaHandle) {
        root.remove(seaHandle.group);
        seaHandle.dispose();
        seaHandle = null;
        seaAnim.length = 0;
      }
      if (world.sea) {
        seaHandle = buildSea(world.size);
        root.add(seaHandle.group);
      }
    }
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
      buildBoats();
    }
    // Pets standing where something was just placed hop to a free spot.
    for (const w of walkers) {
      const cx = Math.floor(w.x);
      const cz = Math.floor(w.z);
      if (!inside(world, cx, cz) || !canWalk[cz * world.size + cx]) {
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
    /** Current island size (cells per side). */
    get size() {
      return world.size;
    },
    setWorld,
    setPets,
    /** Moves the pets around. dt in seconds. */
    /** Pet that was tapped: it stops and looks at the camera. */
    setFocus(id: string | null) {
      if (id !== focusId) focusSince = -1;
      focusId = id;
    },
    /** Lights up a cell for a moment (green: placed, red: not allowed). */
    flashCell(x: number, z: number, ok = true) {
      flash.position.set(x + 0.5, inside(world, x, z) ? 0.06 : -0.25, z + 0.5);
      flashColor = ok ? '#7CFF9B' : '#FF6B6B';
      flashMat.color.set(flashColor);
      flashUntil = -1;
    },
    update(t: number, dt: number, camera?: THREE.Vector3) {
      seaAnim.forEach((a) => a(t));
      if (flashUntil === -1) flashUntil = t + 0.6;
      if (flashUntil > t) {
        flash.visible = true;
        flashMat.opacity = 0.65 * ((flashUntil - t) / 0.6);
      } else flash.visible = false;
      for (const b of boats) {
        sail(b, dt);
        b.group.position.y = b.baseY + Math.sin(t * 1.4 + b.seed) * 0.04;
        b.group.rotation.z = Math.sin(t * 1.1 + b.seed) * 0.05;
        b.group.rotation.x = Math.sin(t * 0.9 + b.seed * 2) * 0.03;
      }
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
        if (!inside(world, Math.floor(nx), Math.floor(nz)) || !canWalk[Math.floor(nz) * world.size + Math.floor(nx)]) {
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
      // With the sea, cells around the island can be picked too (for boats).
      const m = world.sea ? SEA : 0;
      return x >= -m && z >= -m && x < world.size + m && z < world.size + m ? [x, z] : null;
    },
    /** The object hit by a ray (a tap), nearest first: its cell. */
    pickObject(ray: THREE.Ray): [number, number] | null {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      const hit = new THREE.Vector3();
      const boxes = [
        ...objectBoxes.filter((o) => !boats.some((b) => b.cell[0] === o.x && b.cell[1] === o.z)),
        // Boats sail away from their cell: pick them where they are now.
        ...boats.map((b) => ({ x: b.cell[0], z: b.cell[1], box: new THREE.Box3().setFromObject(b.group) })),
      ];
      for (const o of boxes) {
        if (!ray.intersectBox(o.box, hit)) continue;
        const d = hit.distanceTo(ray.origin);
        if (d < bestD) {
          bestD = d;
          best = [o.x, o.z];
        }
      }
      return best;
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
      [base, ground, objects].forEach((g) => g && disposeGeometries(g));
      boats.forEach((b) => disposeGeometries(b.group));
      seaHandle?.dispose();
      flash.geometry.dispose();
      flashMat.dispose();
      lawnMat.dispose();
      kit.dispose();
    },
  };
}

/** Orbit camera around a point of the island. */
export class IslandCamera {
  camera: THREE.PerspectiveCamera;
  target = new THREE.Vector3(MIN_SIZE / 2, 0, MIN_SIZE / 2);
  distance = 22;
  /** Island size, to keep the view on it. */
  size = MIN_SIZE;
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
    const m = SEA + 1;
    this.target.x = Math.max(-m, Math.min(this.size + m, this.target.x));
    this.target.z = Math.max(-m, Math.min(this.size + m, this.target.z));
    this.apply();
  }

  /** The point of the ground (y = 0) under a point of the view, if any. */
  groundAt(x: number, y: number, width: number, height: number): THREE.Vector3 | null {
    const hit = this.ray(x, y, width, height).intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    // Too close to the horizon: ignore, it would fling the view away.
    if (!hit || hit.distanceTo(this.camera.position) > this.distance * 4) return null;
    return hit;
  }

  /** Drags the map like a sheet: the ground under the finger stays under the finger. */
  grab(fromX: number, fromY: number, toX: number, toY: number, width: number, height: number) {
    const a = this.groundAt(fromX, fromY, width, height);
    const b = this.groundAt(toX, toY, width, height);
    if (!a || !b) return;
    this.target.x += a.x - b.x;
    this.target.z += a.z - b.z;
    const m = SEA + 1;
    this.target.x = Math.max(-m, Math.min(this.size + m, this.target.x));
    this.target.z = Math.max(-m, Math.min(this.size + m, this.target.z));
    this.apply();
  }

  /** Moves smoothly toward a point (call every frame). Returns true once there. */
  glideTo(p: THREE.Vector3, dt: number, closeDistance = 11): boolean {
    const k = 1 - Math.pow(0.002, dt);
    this.target.lerp(new THREE.Vector3(p.x, 0, p.z), k);
    const want = Math.min(this.distance, closeDistance);
    this.distance += (want - this.distance) * k;
    this.apply();
    return this.target.distanceTo(new THREE.Vector3(p.x, 0, p.z)) < 0.05 && Math.abs(this.distance - want) < 0.05;
  }

  zoom(factor: number) {
    this.distance = Math.max(4, Math.min(this.size * 2 + 6, this.distance / factor));
    this.apply();
  }

  /** Frames a whole island of this size. */
  fit(size: number, closer = false) {
    this.size = size;
    this.target.set(size / 2, 0, size / 2);
    this.distance = size * (closer ? 1.15 : 1.4);
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
