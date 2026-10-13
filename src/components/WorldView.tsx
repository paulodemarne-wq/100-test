import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PanResponder, StyleSheet, Text, View, ViewStyle } from 'react-native';
import * as THREE from 'three';
import { createGLRenderer } from '../lib/glRenderer';
import { addNatureLights, setupRenderer } from '../creatures/real/lights';
import { fitSun, updateFog } from '../world/real/island';
import { buildIsland, IslandCamera, IslandScene, PetSpec } from '../world/scene';
import { World } from '../world/world';

type Props = {
  world: World;
  pets: PetSpec[];
  /** Name shown above each pet, by pet id. */
  labels?: Record<string, string>;
  /** Fixed tags above places of the island (e.g. the shop building). */
  markers?: { id: string; x: number; y: number; z: number; text: string }[];
  /** Return true/false to light the cell green/red (editor feedback). */
  onTapCell?: (x: number, z: number, object: [number, number] | null) => boolean | void;
  onTapPet?: (petId: string) => void;
  /** Tapped pet: it stops, faces the camera and gets a bubble above its head. */
  focusId?: string | null;
  /** Content of that bubble. */
  renderFocus?: (petId: string) => ReactNode;
  /** Selected object (its cell): a square with arrows under it, and buttons above and below it. */
  selected?: [number, number] | null;
  selectedTop?: ReactNode;
  selectedBottom?: ReactNode;
  /** Holding a finger on an object picks it up (return false to refuse); it follows the finger cell by cell. */
  onDragStart?: (x: number, z: number) => boolean;
  onDragMove?: (x: number, z: number) => void;
  onDragEnd?: () => void;
  style?: ViewStyle;
};

/** How long to hold a finger on an object before it can be dragged. */
const HOLD_MS = 350;

type Label = { id: string; x: number; y: number; text: string; marker?: boolean };

/**
 * An island in 3D. One finger moves around, two fingers zoom and turn, a tap picks a pet or a cell.
 */
export function WorldView({
  world,
  pets,
  labels,
  markers,
  onTapCell,
  onTapPet,
  focusId = null,
  renderFocus,
  selected = null,
  selectedTop,
  selectedBottom,
  onDragStart,
  onDragMove,
  onDragEnd,
  style,
}: Props) {
  const islandRef = useRef<IslandScene | null>(null);
  const camRef = useRef<IslandCamera | null>(null);
  const sunRef = useRef<THREE.DirectionalLight | null>(null);
  const size = useRef({ width: 1, height: 1 });
  const frame = useRef<number | null>(null);
  const callbacks = useRef({ onTapCell, onTapPet, onDragStart, onDragMove, onDragEnd });
  callbacks.current = { onTapCell, onTapPet, onDragStart, onDragMove, onDragEnd };
  const latest = useRef({ world, pets });
  latest.current = { world, pets };
  const [shown, setShown] = useState<Label[]>([]);
  // Bubble position, moved every frame without re-rendering.
  const bubble = useRef(new Animated.ValueXY({ x: -1000, y: -1000 })).current;
  const focus = useRef<{ id: string | null; gliding: boolean }>({ id: null, gliding: false });
  // Buttons above and below the selected object, moved every frame.
  const selTop = useRef(new Animated.ValueXY({ x: -1000, y: -1000 })).current;
  const selFoot = useRef(new Animated.ValueXY({ x: -1000, y: -1000 })).current;
  const selectedKey = selected ? `${selected[0]},${selected[1]}` : '';
  useEffect(() => {
    const cell = selectedKey ? (selectedKey.split(',').map(Number) as [number, number]) : null;
    islandRef.current?.setSelection(cell);
    if (!cell) {
      selTop.setValue({ x: -1000, y: -1000 });
      selFoot.setValue({ x: -1000, y: -1000 });
    }
  }, [selectedKey, selTop, selFoot]);
  const selectedRef = useRef(selectedKey);
  selectedRef.current = selectedKey;

  useEffect(() => {
    focus.current = { id: focusId, gliding: !!focusId };
    islandRef.current?.setFocus(focusId);
    if (!focusId) bubble.setValue({ x: -1000, y: -1000 });
  }, [focusId, bubble]);
  const petsKey = JSON.stringify(pets);

  useEffect(() => {
    const island = islandRef.current;
    if (!island) return;
    const grew = island.size !== world.size;
    island.setWorld(world);
    if (grew) {
      camRef.current?.fit(world.size, size.current.width < size.current.height);
      // The sun's shadow covers the whole (bigger) island.
      if (sunRef.current) fitSun(sunRef.current, world.size);
    }
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
  const markersKey = JSON.stringify(markers ?? []);
  useEffect(() => {
    const fixed = JSON.parse(markersKey) as NonNullable<Props['markers']>;
    if (!labels && fixed.length === 0) return;
    const id = setInterval(() => {
      const island = islandRef.current;
      const cam = camRef.current;
      if (!island || !cam) return;
      const { width, height } = size.current;
      const next: Label[] = [];
      const show = (key: string, x: number, y: number, z: number, text: string, marker?: boolean) => {
        const s = cam.project(new THREE.Vector3(x, y, z), width, height);
        if (s && s.x > -40 && s.x < width + 40 && s.y > -20 && s.y < height + 20) next.push({ id: key, x: s.x, y: s.y, text, marker });
      };
      for (const m of fixed) show(`m:${m.id}`, m.x, m.y, m.z, m.text, true);
      for (const p of island.petPositions()) {
        if (!labels?.[p.id] || p.id === focus.current.id) continue;
        show(p.id, p.x, p.y, p.z, labels[p.id]);
      }
      setShown(next);
    }, 120);
    return () => clearInterval(id);
  }, [labels, markersKey]);

  const pan = useMemo(() => {
    let start = { x: 0, y: 0, time: 0 };
    let moved = false;
    // Hold-to-drag: a timer started when the finger lands; dragging once it fires on an object.
    let hold: ReturnType<typeof setTimeout> | null = null;
    let dragging = false;
    let lastCell = '';
    const stopHold = () => {
      if (hold) clearTimeout(hold);
      hold = null;
    };
    const cellUnder = (px: number, py: number) => {
      const cam = camRef.current;
      const island = islandRef.current;
      if (!cam || !island) return null;
      return island.pickCell(cam.ray(px, py, size.current.width, size.current.height));
    };
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
        // Touching the island stops the camera from gliding to a pet.
        focus.current.gliding = false;
        moved = false;
        dragging = false;
        lastCell = '';
        prev = { dx: 0, dy: 0, touches: 1, dist: 0, angle: 0 };
        stopHold();
        if (callbacks.current.onDragStart) {
          const at = { ...start };
          hold = setTimeout(() => {
            hold = null;
            const cam = camRef.current;
            const island = islandRef.current;
            if (moved || !cam || !island) return;
            const object = island.pickObject(cam.ray(at.x, at.y, size.current.width, size.current.height));
            if (object && callbacks.current.onDragStart?.(object[0], object[1])) {
              dragging = true;
              lastCell = `${object[0]},${object[1]}`;
            }
          }, HOLD_MS);
        }
      },
      onPanResponderMove: (e, g) => {
        const cam = camRef.current;
        if (!cam) return;
        const touches = e.nativeEvent.touches;
        if (dragging) {
          // The object follows the finger, cell by cell; the map stays still.
          const cell = cellUnder(start.x + g.dx, start.y + g.dy);
          if (cell && `${cell[0]},${cell[1]}` !== lastCell) {
            lastCell = `${cell[0]},${cell[1]}`;
            callbacks.current.onDragMove?.(cell[0], cell[1]);
          }
          return;
        }
        if (touches.length >= 2) {
          stopHold();
          const p = pinch(touches);
          if (prev.touches >= 2) {
            cam.zoom(p.dist / Math.max(1, prev.dist));
            // Turning the fingers clockwise turns the map clockwise.
            let turn = p.angle - prev.angle;
            turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            cam.rotate(turn);
          }
          prev = { dx: g.dx, dy: g.dy, touches: touches.length, ...p };
          moved = true;
          return;
        }
        if (prev.touches !== 1) prev = { ...prev, dx: g.dx, dy: g.dy, touches: 1 };
        // A small wobble of the finger is still a tap (to place things), not a drag.
        if (!moved && Math.hypot(g.dx, g.dy) < 12) return;
        moved = true;
        stopHold();
        const { width, height } = size.current;
        cam.grab(start.x + prev.dx, start.y + prev.dy, start.x + g.dx, start.y + g.dy, width, height);
        prev = { ...prev, dx: g.dx, dy: g.dy };
      },
      onPanResponderTerminate: () => {
        stopHold();
        if (dragging) {
          dragging = false;
          callbacks.current.onDragEnd?.();
        }
      },
      onPanResponderRelease: () => {
        stopHold();
        if (dragging) {
          dragging = false;
          callbacks.current.onDragEnd?.();
          return;
        }
        const cam = camRef.current;
        const island = islandRef.current;
        if (moved || !cam || !island || Date.now() - start.time > 800) return;
        const ray = cam.ray(start.x, start.y, size.current.width, size.current.height);
        const pet = island.pickPet(ray);
        if (pet && callbacks.current.onTapPet) {
          callbacks.current.onTapPet(pet);
          return;
        }
        const cell = island.pickCell(ray);
        // The object under the finger (even its roof, which is over another ground cell).
        const object = island.pickObject(ray);
        if (!cell && !object) return;
        const [x, z] = cell ?? object!;
        const ok = callbacks.current.onTapCell?.(x, z, object);
        if (typeof ok === 'boolean') {
          const [fx, fz] = ok && object && !cell ? object : [x, z];
          island.flashCell(fx, fz, ok);
        }
      },
    });
  }, []);

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const renderer = createGLRenderer(gl);
    // Realistic look: sRGB + filmic tone mapping + soft shadows, natural daylight with a sun.
    setupRenderer(renderer);

    const scene = new THREE.Scene();
    const sun = addNatureLights(scene);
    fitSun(sun, latest.current.world.size);
    sunRef.current = sun;
    const island = buildIsland(latest.current.world, latest.current.pets);
    scene.add(island.group);
    let sky = island.sky;
    renderer.setClearColor(sky, 1);
    islandRef.current = island;
    if (selectedRef.current) island.setSelection(selectedRef.current.split(',').map(Number) as [number, number]);
    const cam = new IslandCamera(width / height);
    // On a tall phone screen, start a bit closer so pets are visible.
    cam.fit(latest.current.world.size, width < height);
    camRef.current = cam;

    const start = Date.now();
    let last = start;
    const render = () => {
      frame.current = requestAnimationFrame(render);
      const now = Date.now();
      const f = focus.current;
      const target = f.id ? island.petPosition(f.id) : null;
      // Glide the camera toward a tapped pet.
      if (target && f.gliding && cam.glideTo(target, Math.min(0.1, (now - last) / 1000))) f.gliding = false;
      island.update((now - start) / 1000, Math.min(0.1, (now - last) / 1000), cam.camera.position);
      last = now;
      if (target) {
        const p = cam.project(target, size.current.width, size.current.height);
        if (p) bubble.setValue(p);
      }
      const anchors = selectedRef.current ? island.selectionAnchors() : null;
      if (anchors) {
        const top = cam.project(anchors.top, size.current.width, size.current.height);
        const foot = cam.project(anchors.foot, size.current.width, size.current.height);
        if (top) selTop.setValue(top);
        if (foot) selFoot.setValue(foot);
      }
      // Sky and fog follow the kind of island (it can change while painting) and the zoom.
      if (island.sky !== sky) {
        sky = island.sky;
        renderer.setClearColor(sky, 1);
      }
      updateFog(scene, sky, cam.distance);
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
      {shown.map((l) => (
        <View key={l.id} pointerEvents="none" style={[styles.label, { left: l.x - 90, top: l.y - 26 }]}>
          <Text style={[styles.labelText, l.marker && styles.markerText]} numberOfLines={1}>
            {l.text}
          </Text>
        </View>
      ))}
      {selected && selectedTop && (
        <Animated.View style={[styles.anchor, { transform: selTop.getTranslateTransform() }]} pointerEvents="box-none">
          <View style={styles.above}>{selectedTop}</View>
        </Animated.View>
      )}
      {selected && selectedBottom && (
        <Animated.View style={[styles.anchor, { transform: selFoot.getTranslateTransform() }]} pointerEvents="box-none">
          <View style={styles.below}>{selectedBottom}</View>
        </Animated.View>
      )}
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
  above: { position: 'absolute', bottom: 8, width: 240, left: -120, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  below: { position: 'absolute', top: 44, width: 240, left: -120, flexDirection: 'row', justifyContent: 'center', gap: 8 },
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
  label: { position: 'absolute', width: 180, alignItems: 'center' },
  markerText: { backgroundColor: '#5856D6', color: '#FFFFFF', fontSize: 13, paddingHorizontal: 10, paddingVertical: 4 },
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
