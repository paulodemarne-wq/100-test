import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PanResponder, StyleSheet, Text, View, ViewStyle } from 'react-native';
import * as THREE from 'three';
import { addLights } from '../creatures/build';
import { buildIsland, IslandCamera, IslandScene, PetSpec } from '../world/scene';
import { World } from '../world/world';

type Props = {
  world: World;
  pets: PetSpec[];
  /** Name shown above each pet, by pet id. */
  labels?: Record<string, string>;
  onTapCell?: (x: number, z: number) => void;
  onTapPet?: (petId: string) => void;
  /** Tapped pet: it stops, faces the camera and gets a bubble above its head. */
  focusId?: string | null;
  /** Content of that bubble. */
  renderFocus?: (petId: string) => ReactNode;
  style?: ViewStyle;
};

type Label = { id: string; x: number; y: number };

/**
 * An island in 3D. One finger moves around, two fingers zoom and turn, a tap picks a pet or a cell.
 */
export function WorldView({ world, pets, labels, onTapCell, onTapPet, focusId = null, renderFocus, style }: Props) {
  const islandRef = useRef<IslandScene | null>(null);
  const camRef = useRef<IslandCamera | null>(null);
  const size = useRef({ width: 1, height: 1 });
  const frame = useRef<number | null>(null);
  const callbacks = useRef({ onTapCell, onTapPet });
  callbacks.current = { onTapCell, onTapPet };
  const latest = useRef({ world, pets });
  latest.current = { world, pets };
  const [shown, setShown] = useState<Label[]>([]);
  // Bubble position, moved every frame without re-rendering.
  const bubble = useRef(new Animated.ValueXY({ x: -1000, y: -1000 })).current;
  const focus = useRef<{ id: string | null; glideUntil: number }>({ id: null, glideUntil: 0 });

  useEffect(() => {
    focus.current = { id: focusId, glideUntil: focusId ? Date.now() + 800 : 0 };
    islandRef.current?.setFocus(focusId);
    if (!focusId) bubble.setValue({ x: -1000, y: -1000 });
  }, [focusId, bubble]);
  const petsKey = JSON.stringify(pets);

  useEffect(() => {
    islandRef.current?.setWorld(world);
  }, [world]);

  useEffect(() => {
    islandRef.current?.setPets(JSON.parse(petsKey));
  }, [petsKey]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      islandRef.current?.dispose();
    },
    [],
  );

  // Name tags follow the pets (a few times per second is enough).
  useEffect(() => {
    if (!labels) return;
    const id = setInterval(() => {
      const island = islandRef.current;
      const cam = camRef.current;
      if (!island || !cam) return;
      const { width, height } = size.current;
      const next: Label[] = [];
      for (const p of island.petPositions()) {
        if (!labels[p.id] || p.id === focus.current.id) continue;
        const s = cam.project(new THREE.Vector3(p.x, p.y, p.z), width, height);
        if (s && s.x > -40 && s.x < width + 40 && s.y > -20 && s.y < height + 20) next.push({ id: p.id, x: s.x, y: s.y });
      }
      setShown(next);
    }, 120);
    return () => clearInterval(id);
  }, [labels]);

  const pan = useMemo(() => {
    let start = { x: 0, y: 0, time: 0 };
    let moved = false;
    let prev = { dx: 0, dy: 0, touches: 0, dist: 0, angle: 0 };
    const pinch = (touches: { pageX: number; pageY: number }[]) => {
      const [a, b] = touches;
      return { dist: Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY), angle: Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX) };
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        start = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY, time: Date.now() };
        moved = false;
        prev = { dx: 0, dy: 0, touches: 1, dist: 0, angle: 0 };
      },
      onPanResponderMove: (e, g) => {
        const cam = camRef.current;
        if (!cam) return;
        const touches = e.nativeEvent.touches;
        if (touches.length >= 2) {
          const p = pinch(touches);
          if (prev.touches >= 2) {
            cam.zoom(p.dist / Math.max(1, prev.dist));
            cam.rotate(-(p.angle - prev.angle));
          }
          prev = { dx: g.dx, dy: g.dy, touches: touches.length, ...p };
          moved = true;
          return;
        }
        if (prev.touches !== 1) prev = { ...prev, dx: g.dx, dy: g.dy, touches: 1 };
        if (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6) moved = true;
        cam.pan(g.dx - prev.dx, g.dy - prev.dy, size.current.height);
        prev = { ...prev, dx: g.dx, dy: g.dy };
      },
      onPanResponderRelease: () => {
        const cam = camRef.current;
        const island = islandRef.current;
        if (moved || !cam || !island || Date.now() - start.time > 600) return;
        const ray = cam.ray(start.x, start.y, size.current.width, size.current.height);
        const pet = island.pickPet(ray);
        if (pet && callbacks.current.onTapPet) {
          callbacks.current.onTapPet(pet);
          return;
        }
        const cell = island.pickCell(ray);
        if (cell) callbacks.current.onTapCell?.(cell[0], cell[1]);
      },
    });
  }, []);

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const canvas = {
      width,
      height,
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      clientHeight: height,
      getContext: () => gl,
    } as unknown as HTMLCanvasElement;
    const renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGL2RenderingContext, antialias: true });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);

    const scene = new THREE.Scene();
    addLights(scene);
    const island = buildIsland(latest.current.world, latest.current.pets);
    scene.add(island.group);
    renderer.setClearColor(island.sky, 1);
    islandRef.current = island;
    const cam = new IslandCamera(width / height);
    // On a tall phone screen, start a bit closer so pets are visible.
    if (width < height) cam.distance = 18;
    cam.apply();
    camRef.current = cam;

    const start = Date.now();
    let last = start;
    const render = () => {
      frame.current = requestAnimationFrame(render);
      const now = Date.now();
      const f = focus.current;
      const target = f.id ? island.petPosition(f.id) : null;
      // Glide the camera toward a tapped pet.
      if (target && now < f.glideUntil) {
        cam.target.lerp(new THREE.Vector3(target.x, 0, target.z), 0.12);
        cam.distance += (Math.min(cam.distance, 11) - cam.distance) * 0.12;
        cam.apply();
      }
      island.update((now - start) / 1000, Math.min(0.1, (now - last) / 1000), cam.camera.position);
      last = now;
      if (target) {
        const p = cam.project(target, size.current.width, size.current.height);
        if (p) bubble.setValue(p);
      }
      renderer.render(scene, cam.camera);
      gl.endFrameEXP();
    };
    render();
  };

  const onLayout = (e: LayoutChangeEvent) => {
    size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
  };

  return (
    <View style={style} onLayout={onLayout} {...pan.panHandlers}>
      <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
      {labels &&
        shown.map((l) => (
          <View key={l.id} pointerEvents="none" style={[styles.label, { left: l.x - 60, top: l.y - 26 }]}>
            <Text style={styles.labelText} numberOfLines={1}>
              {labels[l.id]}
            </Text>
          </View>
        ))}
      {focusId && renderFocus && (
        <Animated.View style={[styles.anchor, { transform: bubble.getTranslateTransform() }]} pointerEvents="box-none">
          <View style={styles.bubble}>{renderFocus(focusId)}</View>
          <View style={styles.tail} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, alignItems: 'center', overflow: 'visible' },
  bubble: {
    position: 'absolute',
    bottom: 14,
    width: 220,
    left: -110,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  tail: {
    position: 'absolute',
    bottom: 6,
    left: -8,
    width: 16,
    height: 16,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '45deg' }],
  },
  label: { position: 'absolute', width: 120, alignItems: 'center' },
  labelText: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#1C1C1E',
    overflow: 'hidden',
  },
});
