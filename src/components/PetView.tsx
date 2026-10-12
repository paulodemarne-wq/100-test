import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { useEffect, useMemo, useRef } from 'react';
import { PanResponder, View, ViewStyle } from 'react-native';
import * as THREE from 'three';
import { createGLRenderer } from '../lib/glRenderer';
import { addLights, buildCreature, Creature } from '../creatures/build';
import { Equipped } from '../creatures/species';

type Props = {
  species: number | null;
  level: number;
  equipped?: Equipped;
  style?: ViewStyle;
  /** Allow turning the pet with a finger. */
  interactive?: boolean;
  /** Called on a tap (not a drag). */
  onPress?: () => void;
  /** How it feels: jumps and spins for joy, sulks with its head down, or dozes. */
  mood?: 'party' | 'sad' | 'sleep' | null;
};

/** A pet in 3D. Drag horizontally to turn it; it keeps spinning slowly on its own. */
export function PetView({ species, level, equipped, style, interactive = true, onPress, mood = null }: Props) {
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const yaw = useRef(0.5);
  const velocity = useRef(0);
  const dragging = useRef(false);
  const sceneRef = useRef<{ scene: THREE.Scene; creature: Creature | null } | null>(null);
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
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

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      sceneRef.current?.creature?.dispose();
    },
    [],
  );

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    sceneRef.current?.creature?.dispose();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const renderer = createGLRenderer(gl, { alpha: true });
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
        // A dozing or sulking pet stays turned toward you.
        yaw.current += velocity.current + (moodRef.current === 'sleep' || moodRef.current === 'sad' ? 0 : 0.006);
      }
      const t = (Date.now() - start) / 1000;
      const c = sceneRef.current?.creature;
      if (c) {
        c.update(t);
        const m = moodRef.current;
        // Moods move the whole creature on top of its own animation.
        c.group.rotation.y = yaw.current + (m === 'party' ? t * 7 : 0);
        c.group.position.y = m === 'party' ? Math.abs(Math.sin(t * 7)) * 0.35 : 0;
        c.group.rotation.x = m === 'sad' ? 0.38 : m === 'sleep' ? 0.12 : 0;
        c.group.rotation.z = m === 'sleep' ? Math.sin(t * 0.8) * 0.12 : m === 'sad' ? Math.sin(t * 0.6) * 0.05 : 0;
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
