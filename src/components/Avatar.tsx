import { Image, StyleSheet, Text, View } from 'react-native';

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
};

export function Avatar({ name, photoUri, size = 44, live = false }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const dot = Math.max(10, size * 0.28);

  return (
    <View style={{ width: size, height: size }}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View
          style={[
            styles.initials,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(name) },
          ]}
        >
          <Text style={{ color: '#FFF', fontSize: size * 0.42, fontWeight: '600' }}>{initial}</Text>
        </View>
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
