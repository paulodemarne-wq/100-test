import { Alert, StyleSheet, Text, View } from 'react-native';
import { REACTIONS, ReactionRow } from '../lib/supabase';
import { colors } from '../lib/theme';

/** "🔥 2  💪 1" under a session. Your own reaction is highlighted. */
export function ReactionSummary({ reactions, myId }: { reactions: ReactionRow[] | undefined; myId: string | null }) {
  if (!reactions?.length) return null;
  const counts = new Map<string, number>();
  for (const r of reactions) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  const mine = reactions.find((r) => r.user_id === myId)?.emoji;
  return (
    <View style={styles.row}>
      {[...counts].map(([emoji, n]) => (
        <View key={emoji} style={[styles.pill, emoji === mine && styles.pillMine]}>
          <Text style={styles.text}>
            {emoji} {n}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Native action sheet to react to a friend's session. */
export function askReaction(name: string, current: string | undefined, onPick: (emoji: string | null) => void) {
  Alert.alert(`Réagir à la session de ${name}`, undefined, [
    ...REACTIONS.map((emoji) => ({ text: emoji === current ? `${emoji} ✓` : emoji, onPress: () => onPick(emoji) })),
    ...(current ? [{ text: 'Retirer ma réaction', style: 'destructive' as const, onPress: () => onPick(null) }] : []),
    { text: 'Annuler', style: 'cancel' as const },
  ]);
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  pill: { backgroundColor: colors.fill, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillMine: { backgroundColor: colors.accentSoft },
  text: { fontSize: 13, color: colors.text },
});
