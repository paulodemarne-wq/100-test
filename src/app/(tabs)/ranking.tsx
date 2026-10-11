import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDemoFriends } from '../../lib/demoFriends';
import { useLockin } from '../../lib/store';
import { colors } from '../../lib/theme';
import { formatDuration } from '../../lib/time';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function RankingScreen() {
  const { profile, weekSeconds, streak } = useLockin();

  const ranking = useMemo(() => {
    const me = {
      id: 'me',
      name: `${profile?.name} (toi)`,
      emoji: profile?.emoji ?? '🙂',
      seconds: weekSeconds,
      streak,
      isMe: true,
    };
    const friends = getDemoFriends().map((f) => ({
      id: f.id,
      name: f.name,
      emoji: f.emoji,
      seconds: f.weekMinutes * 60,
      streak: f.streak,
      isMe: false,
    }));
    return [me, ...friends].sort((a, b) => b.seconds - a.seconds);
  }, [profile, weekSeconds, streak]);

  const leader = ranking[0];
  const myRank = ranking.findIndex((r) => r.isMe);
  const gapToNext = myRank > 0 ? ranking[myRank - 1].seconds - weekSeconds : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Classement</Text>
        <Text style={styles.subtitle}>Cette semaine · remis à zéro chaque lundi</Text>

        {myRank > 0 && (
          <View style={styles.callout}>
            <Text style={styles.calloutText}>
              Encore {formatDuration(gapToNext + 60)} pour dépasser {ranking[myRank - 1].name} 💪
            </Text>
          </View>
        )}
        {myRank === 0 && weekSeconds > 0 && (
          <View style={styles.callout}>
            <Text style={styles.calloutText}>Tu es 1er cette semaine 👑 Ne lâche rien.</Text>
          </View>
        )}

        {ranking.map((r, i) => (
          <View key={r.id} style={[styles.row, r.isMe && styles.rowMe]}>
            <Text style={styles.rank}>{MEDALS[i] ?? `${i + 1}`}</Text>
            <Text style={styles.avatar}>{r.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{r.name}</Text>
              <Text style={styles.streak}>{r.streak > 0 ? `🔥 ${r.streak} j de série` : 'Pas de série'}</Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${leader.seconds > 0 ? (r.seconds / leader.seconds) * 100 : 0}%` },
                  ]}
                />
              </View>
            </View>
            <Text style={styles.time}>{formatDuration(r.seconds)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, gap: 10 },
  title: { color: colors.text, fontSize: 32, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 14, marginBottom: 6 },
  callout: { backgroundColor: colors.accent, borderRadius: 14, padding: 14, marginBottom: 6 },
  calloutText: { color: colors.accentText, fontWeight: '800', fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  rowMe: { borderColor: colors.accent },
  rank: { color: colors.muted, fontSize: 20, fontWeight: '800', width: 30, textAlign: 'center' },
  avatar: { fontSize: 30 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  streak: { color: colors.muted, fontSize: 12, marginTop: 2 },
  barTrack: { height: 6, backgroundColor: colors.cardBorder, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.accent, borderRadius: 3 },
  time: { color: colors.text, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] },
});
