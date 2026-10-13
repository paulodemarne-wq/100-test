import type * as THREE from 'three';

/** 0 baby, 1 young, 2 adult, 3 majestic adult. */
export type Age = 0 | 1 | 2 | 3;

export type Animal = {
  group: THREE.Group;
  /** Height once scaled, to frame it. */
  height: number;
  update: (t: number) => void;
  dispose: () => void;
};
