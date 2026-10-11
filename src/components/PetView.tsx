import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { useEffect, useMemo, useRef } from 'react';
import { PanResponder, View, ViewStyle } from 'react-native';
import * as THREE from 'three';
import { addLights, buildCreature, Creature } from '../creatures/build';
import { Equipped } from '../creatures/species';

type Props = {
  species: number | null;
  level: number;
  equipped?: Equipped;
  style?: ViewStyle;
  /** Allow turning the pet with a finger. */
  interactive?: boolean;
};

/** A pet in 3D. Drag horizontally to turn it; it keeps spinning slowly on its own. */
export function PetView({ species, level, equipped, style, interactive = true }: Props) {
  const yaw = useRef(0.5);
  const velocity = useRef(0);
  const dragging = useRef(false);
  const sceneRef = useRef<{ scene: THREE.Scene; creature: Creature | null } | null>(null);
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
        onPanResponderRelease: () => {
          dragging.current = false;
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

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      sceneRef.current?.creature?.dispose();
    },
    [],
  );

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
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
    camera.position.set(0, 1.5, 4.8);
    camera.lookAt(0, 0.85, 0);

    const creature = buildCreature({ species, level, equipped: JSON.parse(equippedKey) });
    scene.add(creature.group);
    sceneRef.current = { scene, creature };

    const start = Date.now();
    const render = () => {
      frame.current = requestAnimationFrame(render);
      if (!dragging.current) {
        velocity.current *= 0.94;
        yaw.current += velocity.current + 0.006;
      }
      const c = sceneRef.current?.creature;
      if (c) {
        c.group.rotation.y = yaw.current;
        c.update((Date.now() - start) / 1000);
      }
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    render();
  };

  return (
    <View style={style} {...pan.panHandlers}>
      <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
    </View>
  );
}
