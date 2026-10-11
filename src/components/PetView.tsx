import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { useEffect, useMemo, useRef } from 'react';
import { PanResponder, View, ViewStyle } from 'react-native';
import * as THREE from 'three';
import { addLights, buildCreature, Creature } from '../creatures/build';
import { buildGarden, GARDEN_CAMERA, GardenScene } from '../creatures/garden';
import { Equipped, Garden } from '../creatures/species';

type Props = {
  species: number | null;
  level: number;
  equipped?: Equipped;
  style?: ViewStyle;
  /** Allow turning the pet with a finger. */
  interactive?: boolean;
  /** Show the pet in its garden (the garden stays still while the pet turns). */
  garden?: Garden | null;
  /** Called on a tap (not a drag). */
  onPress?: () => void;
};

/** A pet in 3D. Drag horizontally to turn it; it keeps spinning slowly on its own. */
export function PetView({ species, level, equipped, style, interactive = true, garden, onPress }: Props) {
  const yaw = useRef(0.5);
  const velocity = useRef(0);
  const dragging = useRef(false);
  const sceneRef = useRef<{ scene: THREE.Scene; creature: Creature | null; garden: GardenScene | null } | null>(null);
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const gardenKey = garden ? JSON.stringify(garden) : null;
  const frame = useRef<number | null>(null);
  const equippedKey = JSON.stringify(equipped ?? {});

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => interactive,
        onMoveShouldSetPanResponder: (_, g) => interactive && Math.abs(g.dx) > 4,
        onPanResponderGrant: () => {
          dragging.current = true;
        },
        onPanResponderMove: (_, g) => {
          velocity.current = g.vx * 0.25;
          yaw.current += velocity.current;
        },
        onPanResponderRelease: (_, g) => {
          dragging.current = false;
          if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) onPressRef.current?.();
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
        },
      }),
    [interactive],
  );

  // Rebuild the creature when what it looks like changes.
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    if (s.creature) {
      s.scene.remove(s.creature.group);
      s.creature.dispose();
    }
    s.creature = buildCreature({ species, level, equipped: JSON.parse(equippedKey) });
    s.scene.add(s.creature.group);
  }, [species, level, equippedKey]);

  // Swap garden items in place (switching garden on/off needs a new view: the camera changes).
  useEffect(() => {
    const s = sceneRef.current;
    if (!s || !s.garden || !gardenKey) return;
    s.scene.remove(s.garden.group);
    s.garden.dispose();
    s.garden = buildGarden(JSON.parse(gardenKey));
    s.scene.add(s.garden.group);
  }, [gardenKey]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      sceneRef.current?.creature?.dispose();
      sceneRef.current?.garden?.dispose();
    },
    [],
  );

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    sceneRef.current?.creature?.dispose();
    sceneRef.current?.garden?.dispose();
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
    const renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGL2RenderingContext, antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    addLights(scene);
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 50);
    const gardenScene = gardenKey ? buildGarden(JSON.parse(gardenKey)) : null;
    if (gardenScene) {
      camera.position.set(...GARDEN_CAMERA.position);
      camera.lookAt(...GARDEN_CAMERA.target);
      scene.add(gardenScene.group);
    } else {
      camera.position.set(0, 1.5, 4.8);
      camera.lookAt(0, 0.85, 0);
    }

    const creature = buildCreature({ species, level, equipped: JSON.parse(equippedKey) });
    scene.add(creature.group);
    sceneRef.current = { scene, creature, garden: gardenScene };

    const start = Date.now();
    const render = () => {
      frame.current = requestAnimationFrame(render);
      if (!dragging.current) {
        velocity.current *= 0.94;
        yaw.current += velocity.current + 0.006;
      }
      const t = (Date.now() - start) / 1000;
      const c = sceneRef.current?.creature;
      if (c) {
        c.group.rotation.y = yaw.current;
        c.update(t);
      }
      const g = sceneRef.current?.garden;
      if (g) {
        renderer.setClearColor(g.sky, 1);
        g.update(t);
      }
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    render();
  };

  return (
    <View style={style} {...pan.panHandlers}>
      <GLView key={garden ? 'garden' : 'plain'} style={{ flex: 1 }} onContextCreate={onContextCreate} />
    </View>
  );
}
