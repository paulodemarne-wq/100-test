// A player's island: a square grid of ground tiles plus objects placed on cells.
// Stored as profiles.world (validated by the save_world function in supabase/schema.sql).
import { Garden, SHOP_ITEMS } from '../creatures/species';

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

/** A starter island: grass, a winding path, a few trees. Keeps what the old garden had. */
export function defaultWorld(garden?: Garden | null): World {
  const tiles = Array.from({ length: WORLD_SIZE * WORLD_SIZE }, () => 'g');
  for (let z = 0; z < WORLD_SIZE; z++) {
    const x = 7 + Math.round(Math.sin(z * 0.6) * 1.5);
    tiles[z * WORLD_SIZE + x] = 'p';
  }
  const ground = garden?.ground && TILE_CHARS[garden.ground];
  if (ground) for (let i = 0; i < tiles.length; i++) if (tiles[i] === 'g' && (i * 7) % 5 === 0) tiles[i] = ground;
  const objects: PlacedObject[] = [
    ['pine', 2, 2, 0],
    ['pine', 13, 3, 0],
    ['rock', 11, 12, 0],
    ['pine', 3, 12, 0],
    ['fence', 4, 6, 0],
    ['fence', 5, 6, 0],
  ];
  if (garden?.house) objects.push([garden.house, 5, 4, 0]);
  if (garden?.tree) objects.push([garden.tree, 10, 5, 0]);
  if (garden?.deco) objects.push([garden.deco, 10, 9, 0]);
  return { v: 1, tiles: tiles.join(''), objects };
}

/** Accepts whatever is stored (maybe nothing yet) and returns a usable world. */
export function readWorld(raw: unknown, garden?: Garden | null): World {
  const w = raw as Partial<World> | null;
  if (w && typeof w.tiles === 'string' && w.tiles.length === WORLD_SIZE * WORLD_SIZE && Array.isArray(w.objects)) {
    return { v: 1, tiles: w.tiles, objects: w.objects.filter((o) => Array.isArray(o) && o.length === 4) as PlacedObject[] };
  }
  return defaultWorld(garden);
}
