// A player's island: a square grid of ground tiles plus objects placed on cells.
// Stored as profiles.world (validated by the save_world function in supabase/schema.sql).
import { SHOP_ITEMS } from '../creatures/species';

export const WORLD_SIZE = 16;
export const MAX_OBJECTS = 150;

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

/** [item id, x, z, quarter turns] */
export type PlacedObject = [string, number, number, number];

export type World = {
  v: 1;
  /** WORLD_SIZE × WORLD_SIZE letters, row by row (z then x). */
  tiles: string;
  objects: PlacedObject[];
};

export const isTile = (id: string) => id in TILE_CHARS;
export const isObject = (id: string) => SHOP_ITEMS.some((i) => i.id === id && i.kind === 'garden' && i.slot !== 'ground');

export function tileAt(world: World, x: number, z: number): string {
  return TILE_BY_CHAR[world.tiles[z * WORLD_SIZE + x]] ?? 'grass';
}

export function setTile(world: World, x: number, z: number, id: string): World {
  const i = z * WORLD_SIZE + x;
  const c = TILE_CHARS[id];
  if (!c || world.tiles[i] === c) return world;
  return { ...world, tiles: world.tiles.slice(0, i) + c + world.tiles.slice(i + 1) };
}

export function objectAt(world: World, x: number, z: number): PlacedObject | undefined {
  return world.objects.find((o) => o[1] === x && o[2] === z);
}

/** Puts an object on a cell (replacing what was there). */
export function placeObject(world: World, x: number, z: number, id: string): World {
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

/** Cells a pet can walk on: not water, no object. */
export function walkable(world: World): boolean[] {
  const ok = Array.from({ length: WORLD_SIZE * WORLD_SIZE }, (_, i) => world.tiles[i] !== 'w');
  for (const [, x, z] of world.objects) ok[z * WORLD_SIZE + x] = false;
  return ok;
}

/** A new island starts empty: only grass. Players build everything themselves. */
export function defaultWorld(): World {
  return { v: 1, tiles: 'g'.repeat(WORLD_SIZE * WORLD_SIZE), objects: [] };
}

/** Accepts whatever is stored (maybe nothing yet) and returns a usable world. */
export function readWorld(raw: unknown): World {
  const w = raw as Partial<World> | null;
  if (w && typeof w.tiles === 'string' && w.tiles.length === WORLD_SIZE * WORLD_SIZE && Array.isArray(w.objects)) {
    return { v: 1, tiles: w.tiles, objects: w.objects.filter((o) => Array.isArray(o) && o.length === 4) as PlacedObject[] };
  }
  return defaultWorld();
}
