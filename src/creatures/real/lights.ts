import * as THREE from 'three';

/** Natural daylight for the realistic animals: soft sky, warm sun (with a real shadow), cool fill, a rim to cut them out. */
export function addNatureLights(scene: THREE.Scene, shadowSize = 2.4): THREE.DirectionalLight {
  scene.add(new THREE.HemisphereLight('#dfeeff', '#6b5a43', 1.25));
  const sun = new THREE.DirectionalLight('#fff1dc', 2.6);
  sun.position.set(2.5, 5, 3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const c = sun.shadow.camera;
  c.left = -shadowSize;
  c.right = shadowSize;
  c.top = shadowSize;
  c.bottom = -shadowSize;
  c.near = 0.5;
  c.far = 15;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight('#b9d2ff', 0.7);
  fill.position.set(-3.5, 1.5, 2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight('#ffffff', 1.4);
  rim.position.set(-1.5, 3, -4);
  scene.add(rim);
  return sun;
}

/** An invisible floor that only shows the animal's shadow. */
export function shadowFloor(size = 6): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShadowMaterial({ opacity: 0.28 }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

/** Color handling and soft shadows for PBR materials. */
export function setupRenderer(renderer: THREE.WebGLRenderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
}
