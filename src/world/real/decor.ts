// Realistic island objects: one entry point for the three families (houses, nature, props & boats).
import * as THREE from 'three';
import { buildHouses } from './decorHouses';
import { buildNature } from './decorNature';
import { buildProps } from './decorProps';

/** Builds one realistic object, or null when it has no realistic model yet. */
export function buildRealDecor(id: string): THREE.Group | null {
  return buildHouses(id) ?? buildNature(id) ?? buildProps(id);
}
