import { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';

/**
 * A three.js renderer on an expo-gl context.
 *
 * three.js (r163+) refuses any context that is `instanceof WebGLRenderingContext`, to reject WebGL 1.
 * expo-gl makes its WebGL 2 contexts extend WebGLRenderingContext (as the spec does), so that check
 * wrongly fails on phones. We hide the WebGL 1 class while three.js inspects the context.
 */
export function createGLRenderer(gl: ExpoWebGLRenderingContext, options: { alpha?: boolean } = {}): THREE.WebGLRenderer {
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  // three.js expects a canvas; expo-gl only gives a context, so pass a minimal stand-in.
  const canvas = {
    width,
    height,
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    clientHeight: height,
    getContext: () => gl,
  } as unknown as HTMLCanvasElement;

  const g = globalThis as { WebGLRenderingContext?: unknown };
  const webgl1 = g.WebGLRenderingContext;
  let renderer: THREE.WebGLRenderer;
  try {
    g.WebGLRenderingContext = undefined;
    renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl as unknown as WebGL2RenderingContext,
      antialias: true,
      alpha: options.alpha ?? false,
    });
  } finally {
    g.WebGLRenderingContext = webgl1;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  return renderer;
}
