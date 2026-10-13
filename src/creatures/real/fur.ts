// Fur by "shells": the same body drawn a few times, each copy pushed out a bit along its normals and keeping only
// the hairs that reach that height. Cheap, and it really looks like fur.
import * as THREE from 'three';
import { rng } from './noise';
import { QUALITY } from './types';

let strands: THREE.DataTexture | null = null;

/** Random hair tips (one value per hair), tiled over the body. */
function strandTexture(): THREE.DataTexture {
  if (strands) return strands;
  const size = 256;
  const r = rng(4242);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(Math.pow(r(), 0.8) * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = Math.round(r() * 255);
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  strands = t;
  return t;
}

export type FurOptions = {
  map: THREE.Texture;
  /** Fur height (scene units), and a map of how long it is where (red channel, optional). */
  length: number;
  lengthMap?: THREE.Texture;
  /** How many hairs per unit of texture (u, v). */
  density: [number, number];
  shells?: number;
  /** Hairs droop down a little. */
  gravity?: number;
  roughness?: number;
  /** Hair sheen color (e.g. silver for the majestic adult). */
  sheen?: string;
  /** Glowing markings showing through the fur. */
  glowMap?: THREE.Texture | null;
  glowColor?: string;
  glow?: number;
};

/** Adds the fur shells on top of a body mesh (which keeps its own skin material). */
export function addFur(body: THREE.Mesh, o: FurOptions): THREE.Mesh[] {
  const shells = QUALITY.lite ? Math.min(5, o.shells ?? 14) : (o.shells ?? 14);
  const tex = strandTexture();
  const out: THREE.Mesh[] = [];
  for (let i = 1; i <= shells; i++) {
    const level = i / shells;
    const m = new THREE.MeshStandardMaterial({
      map: o.map,
      roughness: o.roughness ?? 0.9,
      transparent: false,
      alphaTest: 0.5,
      side: THREE.FrontSide,
      emissiveMap: o.glowMap ?? null,
      emissive: new THREE.Color(o.glowMap ? (o.glowColor ?? '#9FE3FF') : '#000000'),
      emissiveIntensity: o.glow ?? 0,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uLevel = { value: level };
      shader.uniforms.uLength = { value: o.length };
      shader.uniforms.uGravity = { value: o.gravity ?? 0.25 };
      shader.uniforms.uStrands = { value: tex };
      shader.uniforms.uDensity = { value: new THREE.Vector2(o.density[0], o.density[1]) };
      shader.uniforms.uLengthMap = { value: o.lengthMap ?? null };
      shader.uniforms.uHasLengthMap = { value: o.lengthMap ? 1 : 0 };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uLevel; uniform float uLength; uniform float uGravity;
          uniform sampler2D uLengthMap; uniform float uHasLengthMap;
          varying vec2 vFurUv;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float furLen = uLength * (uHasLengthMap > 0.5 ? texture2D(uLengthMap, uv).r : 1.0);
          transformed += normalize(objectNormal) * furLen * uLevel;
          transformed.y -= uGravity * furLen * uLevel * uLevel;
          vFurUv = uv;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uLevel; uniform sampler2D uStrands; uniform vec2 uDensity;
          varying vec2 vFurUv;`,
        )
        .replace(
          '#include <alphatest_fragment>',
          `vec4 hair = texture2D(uStrands, vFurUv * uDensity);
          // Each hair is thinner near its tip; shorter hairs stop earlier.
          float tip = hair.r;
          if (tip < uLevel) discard;
          diffuseColor.a = 1.0;
          #include <alphatest_fragment>`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // Darker at the roots (light gets lost between hairs), a touch lighter at the tips.
          diffuseColor.rgb *= mix(0.45, 1.08, uLevel);`,
        );
    };
    m.customProgramCacheKey = () => 'fur-shell';
    const shell = new THREE.Mesh(body.geometry, m);
    shell.castShadow = i === 1;
    shell.position.copy(body.position);
    shell.quaternion.copy(body.quaternion);
    shell.scale.copy(body.scale);
    out.push(shell);
  }
  return out;
}
