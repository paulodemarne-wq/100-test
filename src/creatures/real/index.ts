// Realistic animals: picks the right builder for a species, turns the level into a stage,
// and draws a realistic egg before hatching.
import * as THREE from 'three';
import { buildBird, BirdLook } from './bird';
import { REAL_SPECIES } from './catalog';
import { mixHex, noise2, rng, smooth } from './noise';
import { buildQuadruped, QuadLook } from './quadruped';
import { buildSnake, SnakeLook } from './snake';
import { bake } from './textures';
import { QUALITY, type Animal, type Stage } from './types';

/** Levels 0..1 are the egg; then 5 stages up to level 40. */
export const STAGE_FROM_LEVEL: { stage: Stage; from: number }[] = [
  { stage: 0, from: 2 },
  { stage: 1, from: 8 },
  { stage: 2, from: 16 },
  { stage: 3, from: 25 },
  { stage: 4, from: 34 },
];

export function stageFor(level: number): Stage | null {
  if (level < 2) return null;
  let s: Stage = 0;
  for (const x of STAGE_FROM_LEVEL) if (level >= x.from) s = x.stage;
  return s;
}

export function buildAnimal(species: number, stage: Stage, lite = false): Animal {
  const sp = REAL_SPECIES[species] ?? REAL_SPECIES[0];
  QUALITY.lite = lite;
  try {
    if (sp.kind === 'snake') return buildSnake(sp.look as SnakeLook, stage, sp.id * 31 + 7);
    if (sp.kind === 'bird') return buildBird(sp.look as BirdLook, stage, sp.id * 31 + 7);
    return buildQuadruped(sp.look as QuadLook, stage, sp.id * 31 + 7);
  } finally {
    QUALITY.lite = false;
  }
}

/** A realistic speckled egg (golden for Vainc+), cracking at level 1. */
export function buildEgg(level: number, plus: boolean): Animal {
  const group = new THREE.Group();
  const shell = plus ? '#E8C46A' : '#EFE6D6';
  const spots = plus ? '#8A5A1E' : '#8A6E52';
  const skin = bake(256, 256, (u, v) => {
    const n = noise2(u * 30, v * 30, 5, 30, 30);
    const speck = smooth(0.78, 0.86, noise2(u * 60, v * 60, 7, 60, 60));
    const big = smooth(0.7, 0.78, noise2(u * 12, v * 12, 9, 12, 12)) * 0.7;
    const base = new THREE.Color(mixHex(shell, spots, Math.max(speck, big)));
    const k = 0.92 + n * 0.12;
    return { c: [base.r * 255 * k, base.g * 255 * k, base.b * 255 * k], height: n * 0.3, rough: plus ? 0.3 : 0.6 };
  }, 1.5, true);
  // Egg profile (pointier on top).
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    const a = t * Math.PI;
    const r = Math.sin(a) * (1 - 0.18 * (t - 0.5) * 2 * (t > 0.5 ? 1 : 0.5)) * 0.42;
    pts.push(new THREE.Vector2(Math.max(0.001, r), -Math.cos(a) * 0.55 + 0.55));
  }
  const geo = new THREE.LatheGeometry(pts, 48);
  const mat = new THREE.MeshPhysicalMaterial({ map: skin.map, normalMap: skin.normalMap, roughness: plus ? 0.3 : 0.6, clearcoat: plus ? 0.8 : 0.2, metalness: plus ? 0.3 : 0 });
  const egg = new THREE.Mesh(geo, mat);
  egg.castShadow = true;
  const pivot = new THREE.Group();
  pivot.add(egg);
  // Nest of straw.
  const r = rng(3);
  const strawMat = new THREE.MeshStandardMaterial({ color: '#B89A5E', roughness: 1 });
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2;
    const d = 0.33 + r() * 0.12;
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3 + r() * 0.15, 4), strawMat);
    straw.position.set(Math.cos(a) * d, 0.05 + r() * 0.05, Math.sin(a) * d);
    straw.rotation.set(Math.PI / 2 + (r() - 0.5) * 0.5, 0, a + Math.PI / 2 + (r() - 0.5) * 0.6);
    group.add(straw);
  }
  if (level >= 1) {
    // Cracks: dark zig-zag lines around the middle.
    const crackMat = new THREE.MeshBasicMaterial({ color: '#2A2018' });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 1.3 - 0.6;
      const y = 0.62 + (i % 2 ? 0.035 : -0.03);
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.008, 0.008), crackMat);
      c.position.set(Math.sin(a) * 0.405, y, Math.cos(a) * 0.405);
      c.rotation.set(0, a, i % 2 ? 0.7 : -0.7);
      pivot.add(c);
    }
  }
  group.add(pivot);
  if (plus) {
    const glow = new THREE.PointLight('#FFD27A', 1.5, 2);
    glow.position.set(0, 0.6, 0.5);
    group.add(glow);
  }
  return {
    group,
    height: 1.15,
    update: (t) => {
      const shake = level >= 1 ? 0.12 : 0.05;
      pivot.rotation.z = Math.sin(t * (level >= 1 ? 6 : 2.2)) * shake * (Math.sin(t * 0.7) > 0.3 ? 1 : 0.15);
    },
    dispose: () => {
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      skin.map.dispose();
      skin.normalMap.dispose();
    },
  };
}
