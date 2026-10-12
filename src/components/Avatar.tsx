import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { DECORATIONS } from '../lib/premium';

// Soft background colors for initials, picked from the name so a person keeps the same color.
const PALETTE = ['#5856D6', '#007AFF', '#34C759', '#FF9500', '#FF2D55', '#AF52DE', '#30B0C7', '#A2845E'];

function colorFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

type Props = {
  name: string;
  photoUri?: string | null;
  size?: number;
  /** Green dot in the corner: the person is studying right now. */
  live?: boolean;
  /** Lockin+ decoration around the photo (see DECORATIONS). */
  decoration?: string | null;
};

export function Avatar({ name, photoUri, size = 44, live = false, decoration }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const dot = Math.max(10, size * 0.28);
  const deco = decoration ? DECORATIONS.find((d) => d.id === decoration) : undefined;

  return (
    <View style={{ width: size, height: size }}>
      {deco?.back && <DecorationLayer source={deco.back} size={size} />}
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View style={[styles.initials, { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(name) }]}>
          <Text style={{ color: '#FFF', fontSize: size * 0.42, fontWeight: '600' }}>{initial}</Text>
        </View>
      )}
      {deco && <DecorationLayer source={deco.image} flicker={deco.flicker} float={deco.id === 'angel' || deco.id === 'orbit'} size={size} />}
      {live && (
        <View style={[styles.dot, { width: dot, height: dot, borderRadius: dot / 2, borderWidth: Math.max(2, dot * 0.2) }]} />
      )}
    </View>
  );
}

/** A decoration image, 5/3 of the photo, centered on it. Flames switch between two frames; halos float. */
function DecorationLayer({ source, flicker, float, size }: { source: number | object; flicker?: number | object; float?: boolean; size: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!flicker && !float) return;
    const loop = flicker
      ? Animated.loop(Animated.sequence([Animated.timing(anim, { toValue: 1, duration: 0, delay: 180, useNativeDriver: true }), Animated.timing(anim, { toValue: 0, duration: 0, delay: 180, useNativeDriver: true })]))
      : Animated.loop(Animated.sequence([Animated.timing(anim, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }), Animated.timing(anim, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [anim, flicker, float]);
  const big = (size * 5) / 3;
  // Images never catch touches (pointerEvents on the box style).
  const box = { position: 'absolute' as const, left: -size / 3, top: -size / 3, width: big, height: big, pointerEvents: 'none' as const };
  if (flicker) {
    return (
      <View pointerEvents="none" style={box}>
        <Animated.Image source={source as number} style={[StyleSheet.absoluteFill, { opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} />
        <Animated.Image source={flicker as number} style={[StyleSheet.absoluteFill, { opacity: anim }]} />
      </View>
    );
  }
  return (
    <Animated.Image
      source={source as number}
      style={[box, float && { transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.06] }) }] }]}
    />
  );
}

const styles = StyleSheet.create({
  initials: { alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', right: 0, bottom: 0, backgroundColor: '#34C759', borderColor: '#FFF' },
});
