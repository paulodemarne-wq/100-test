// A player's island: a square grid of ground tiles plus objects placed on cells.
// It can grow (16×16 → 32×32) and have the sea around it, where boats float.
// Stored as profiles.world (validated by the save_world function in supabase/schema.sql).
import { SHOP_ITEMS } from '../creatures/species';

export const SIZES = [16, 20, 24, 28, 32] as const;
export const MIN_SIZE = 16;
/** How far around the island boats can be placed (cells). */
export const SEA = 4;
export const MAX_OBJECTS = 200;

/** One letter per ground tile in World.tiles. Must match save_world in schema.sql. */
export const TILE_CHARS: Record<string, string> = {
  grass: 'g',
  path: 'p',
  cobble: 'o',
  water: 'w',
  meadow: 'f',
  beach: 's',
  wood: 'd',
  snow: 'n',
  clouds: 'c',
};
export const TILE_BY_CHAR: Record<string, string> = Object.fromEntries(Object.entries(TILE_CHARS).map(([id, c]) => [c, id]));

/** [item id, x, z, quarter turns]. Boats may sit outside the grid, on the sea. */
export type PlacedObject = [string, number, number, number];

export type World = {
  v: 2;
  size: number;
  /** Whether the sea surrounds the island. */
  sea: boolean;
  /** size × size letters, row by row (z then x). */
  tiles: string;
  objects: PlacedObject[];
};

export const isTile = (id: string) => id in TILE_CHARS;
export const isBoat = (id: string) => SHOP_ITEMS.some((i) => i.id === id && i.slot === 'boat');

/** Biggest island size the player has unlocked. */
export function ownedSize(inventory: string[]): number {
  return Math.max(MIN_SIZE, ...SIZES.filter((s) => inventory.includes(`size${s}`)));
}

export const ownsSea = (inventory: string[]) => inventory.includes('sea');

export const inside = (world: World, x: number, z: number) => x >= 0 && z >= 0 && x < world.size && z < world.size;

export function tileAt(world: World, x: number, z: number): string {
  return TILE_BY_CHAR[world.tiles[z * world.size + x]] ?? 'grass';
}

export function setTile(world: World, x: number, z: number, id: string): World {
  if (!inside(world, x, z)) return world;
  const i = z * world.size + x;
  const c = TILE_CHARS[id];
  if (!c || world.tiles[i] === c) return world;
  return { ...world, tiles: world.tiles.slice(0, i) + c + world.tiles.slice(i + 1) };
}

/** Boats go on the sea around the island (or on water inside it); everything else on the island. */
export function canPlace(world: World, id: string, x: number, z: number): boolean {
  if (isBoat(id)) {
    if (inside(world, x, z)) return tileAt(world, x, z) === 'water';
    return world.sea && x >= -SEA && z >= -SEA && x < world.size + SEA && z < world.size + SEA;
  }
  return inside(world, x, z);
}

export function objectAt(world: World, x: number, z: number): PlacedObject | undefined {
  return world.objects.find((o) => o[1] === x && o[2] === z);
}

/** Puts an object on a cell (replacing what was there). */
export function placeObject(world: World, x: number, z: number, id: string): World {
  if (!canPlace(world, id, x, z)) return world;
  const others = world.objects.filter((o) => !(o[1] === x && o[2] === z));
  if (others.length >= MAX_OBJECTS) return world;
  return { ...world, objects: [...others, [id, x, z, 0]] };
}

export function removeAt(world: World, x: number, z: number): World {
  return { ...world, objects: world.objects.filter((o) => !(o[1] === x && o[2] === z)) };
}

export function rotateAt(world: World, x: number, z: number): World {
  return {
    ...world,
    objects: world.objects.map((o) => (o[1] === x && o[2] === z ? [o[0], o[1], o[2], (o[3] + 1) % 4] : o)),
  };
}

/** Grows the island evenly on every side; what was built stays in the middle. */
export function resizeWorld(world: World, size: number): World {
  if (size <= world.size) return world;
  const d = Math.floor((size - world.size) / 2);
  const rows: string[] = [];
  for (let z = 0; z < size; z++) {
    let row = '';
    for (let x = 0; x < size; x++) {
      const ox = x - d;
      const oz = z - d;
      row += inside(world, ox, oz) ? world.tiles[oz * world.size + ox] : 'g';
    }
    rows.push(row);
  }
  const next: World = { ...world, size, tiles: rows.join(''), objects: [] };
  next.objects = world.objects
    .map((o): PlacedObject => [o[0], o[1] + d, o[2] + d, o[3]])
    .filter((o) => canPlace(next, o[0], o[1], o[2]));
  return next;
}

/** Cells a pet can walk on: not water, no object. */
export function walkable(world: World): boolean[] {
  const ok = Array.from({ length: world.size * world.size }, (_, i) => world.tiles[i] !== 'w');
  for (const [, x, z] of world.objects) if (inside(world, x, z)) ok[z * world.size + x] = false;
  return ok;
}

/** A new island starts empty: only grass. */
export function defaultWorld(ground = 'g'): World {
  return { v: 2, size: MIN_SIZE, sea: false, tiles: ground.repeat(MIN_SIZE * MIN_SIZE), objects: [] };
}

/** The ground a new island starts with (grass). */
export const ISLAND_GROUND = 'g';

/** Accepts whatever is stored (maybe nothing yet, or the first 16×16 format) and returns a usable world. */
export function readWorld(raw: unknown, ground = 'g'): World {
  const w = raw as (Partial<World> & { v?: number }) | null;
  const size = typeof w?.size === 'number' && (SIZES as readonly number[]).includes(w.size) ? w.size : MIN_SIZE;
  if (w && typeof w.tiles === 'string' && w.tiles.length === size * size && Array.isArray(w.objects)) {
    return {
      v: 2,
      size,
      sea: w.sea === true,
      tiles: w.tiles,
      objects: w.objects.filter((o) => Array.isArray(o) && o.length === 4) as PlacedObject[],
    };
  }
  return defaultWorld(ground);
}
