import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, Text, View } from 'react-native';
import { FRAMES } from '../lib/premium';

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
  /** Lockin+ frame around the photo (see FRAMES). */
  frame?: string | null;
};

export function Avatar({ name, photoUri, size = 44, live = false, frame }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const dot = Math.max(10, size * 0.28);
  const ring = frame ? FRAMES[frame] : undefined;
  // With a frame, the picture shrinks a little inside a gradient ring (white gap between them).
  const border = ring ? Math.max(2, Math.round(size * 0.07)) : 0;
  const gap = ring ? Math.max(1, Math.round(size * 0.03)) : 0;
  const inner = size - 2 * (border + gap);

  const picture = photoUri ? (
    <Image source={{ uri: photoUri }} style={{ width: inner, height: inner, borderRadius: inner / 2 }} />
  ) : (
    <View style={[styles.initials, { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: colorFor(name) }]}>
      <Text style={{ color: '#FFF', fontSize: inner * 0.42, fontWeight: '600' }}>{initial}</Text>
    </View>
  );

  return (
    <View style={{ width: size, height: size }}>
      {ring ? (
        <LinearGradient
          colors={ring.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
        >
          <View style={{ padding: gap, borderRadius: size / 2, backgroundColor: '#FFF' }}>{picture}</View>
        </LinearGradient>
      ) : (
        picture
      )}
      {live && (
        <View style={[styles.dot, { width: dot, height: dot, borderRadius: dot / 2, borderWidth: Math.max(2, dot * 0.2) }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  initials: { alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', right: 0, bottom: 0, backgroundColor: '#34C759', borderColor: '#FFF' },
});
