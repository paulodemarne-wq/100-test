import type * as THREE from 'three';

/** Body shape: 0 baby, 1 young, 2 adult, 3 adult in its display pose (wings spread, raised high…). */
export type Age = 0 | 1 | 2 | 3;

/** The 5 stages an animal goes through: baby, young, adult, alpha, legend (max level). */
export type Stage = 0 | 1 | 2 | 3 | 4;

export const STAGE_NAMES = ['Bébé', 'Jeune', 'Adulte', 'Alpha', 'Légende'] as const;

export type StageLook = {
  /** Body shape to use. */
  age: Age;
  /** Overall size. */
  size: number;
  /** 0 = everyday colors, 1 = the rich "legendary" palette. */
  rich: number;
  /** Glowing markings on the body (0 = none). */
  marks: number;
  /** Glowing eyes (0 = normal). */
  eyes: number;
  /** Light dust around it. */
  motes: boolean;
};

export const STAGES: Record<Stage, StageLook> = {
  0: { age: 0, size: 0.5, rich: 0, marks: 0, eyes: 0, motes: false },
  1: { age: 1, size: 0.72, rich: 0, marks: 0, eyes: 0, motes: false },
  2: { age: 2, size: 0.9, rich: 0, marks: 0, eyes: 0, motes: false },
  3: { age: 2, size: 0.98, rich: 0.6, marks: 0, eyes: 0.5, motes: false },
  4: { age: 3, size: 1.06, rich: 1, marks: 2.2, eyes: 1.4, motes: true },
};

export type Animal = {
  group: THREE.Group;
  /** Height once scaled, to frame it. */
  height: number;
  update: (t: number) => void;
  dispose: () => void;
};
