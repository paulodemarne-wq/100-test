import Ionicons from '@expo/vector-icons/Ionicons';
import { Fragment, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { getDemoFriends } from '../../lib/demoFriends';
import { useLockin } from '../../lib/store';
import { card, colors, type } from '../../lib/theme';
import { formatDuration } from '../../lib/time';

const PODIUM = ['#F5B400', '#A1A1AA', '#C77B30'];

export default function RankingScreen() {
  const { profile, weekSeconds, streak } = useLockin();

  const ranking = useMemo(() => {
    const me = {
      id: 'me',
      name: profile?.name ?? '?',
      photoUri: profile?.photoUri ?? null,
      seconds: weekSeconds,
      streak,
      isMe: true,
    };
    const friends = getDemoFriends().map((f) => ({
      id: f.id,
      name: f.name,
      photoUri: null,
      seconds: f.weekMinutes * 60,
      streak: f.streak,
      isMe: false,
    }));
    return [me, ...friends].sort((a, b) => b.seconds - a.seconds);
  }, [profile, weekSeconds, streak]);

  const leader = ranking[0];
  const myRank = ranking.findIndex((r) => r.isMe);
  const ahead = myRank > 0 ? ranking[myRank - 1] : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[type.largeTitle, { marginTop: 8 }]}>Classement</Text>
        <Text style={type.subhead}>Cette semaine · remis à zéro le lundi</Text>

        <View style={styles.hero}>
          <View style={styles.heroRankBox}>
            <Text style={styles.heroRank}>{myRank + 1}</Text>
            <Text style={styles.heroRankSuffix}>{myRank === 0 ? 'er' : 'e'}</Text>
          </View>
          <Text style={styles.heroText}>
            {ahead
              ? `Encore ${formatDuration(ahead.seconds - weekSeconds + 60)} pour dépasser ${ahead.name}`
              : weekSeconds > 0
                ? 'Tu es en tête cette semaine. Ne lâche rien.'
                : 'Lance une session pour entrer dans le classement.'}
          </Text>
        </View>

        <View style={styles.group}>
          {ranking.map((r, i) => (
            <Fragment key={r.id}>
              {i > 0 && <View style={styles.separator} />}
              <View style={[styles.row, r.isMe && styles.rowMe]}>
                <View style={styles.rankCell}>
                  {i < 3 ? (
                    <View style={[styles.podium, { backgroundColor: PODIUM[i] }]}>
                      <Text style={styles.podiumText}>{i + 1}</Text>
                    </View>
                  ) : (
                    <Text style={styles.rank}>{i + 1}</Text>
                  )}
                </View>
                <Avatar name={r.name} photoUri={r.photoUri} size={40} />
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={styles.nameLine}>
                    <Text style={type.headline} numberOfLines={1}>
                      {r.isMe ? `${r.name} (toi)` : r.name}
                    </Text>
                    {r.streak > 0 && (
                      <View style={styles.streak}>
                        <Ionicons name="flame" size={12} color={colors.warning} />
                        <Text style={styles.streakText}>{r.streak}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${leader.seconds > 0 ? (r.seconds / leader.seconds) * 100 : 0}%` },
                        r.isMe && { backgroundColor: colors.accent },
                      ]}
                    />
                  </View>
                </View>
                <Text style={styles.time}>{formatDuration(r.seconds)}</Text>
              </View>
            </Fragment>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: 20, paddingBottom: 32 },
  hero: { ...card, marginTop: 20, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroRank: { fontSize: 48, fontWeight: '700', color: colors.accent, letterSpacing: -1 },
  heroRankBox: { flexDirection: 'row', alignItems: 'flex-start' },
  heroRankSuffix: { fontSize: 20, fontWeight: '600', color: colors.accent, marginTop: 8 },
  heroText: { flex: 1, fontSize: 15, color: colors.text, lineHeight: 20 },
  group: { ...card, marginTop: 20, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 102 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowMe: { backgroundColor: colors.accentSoft },
  rankCell: { width: 24, alignItems: 'center' },
  podium: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  podiumText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  rank: { fontSize: 15, fontWeight: '600', color: colors.secondary },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  streakText: { fontSize: 13, fontWeight: '600', color: colors.warning },
  barTrack: { height: 4, backgroundColor: colors.fill, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4, backgroundColor: colors.tertiary, borderRadius: 2 },
  time: { fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
});
