import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Fragment, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { Row, Section } from '../../components/List';
import { useAuth } from '../../lib/auth';
import { labelSuffix } from '../../lib/labels';
import { Person, useSocial } from '../../lib/social';
import { useNow } from '../../lib/store';
import { card, colors, type } from '../../lib/theme';
import { formatDuration, timeAgo } from '../../lib/time';
import { decorationOf } from '../../lib/premium';
import { Named } from '../../components/Badge';
import type { ProfileRow } from '../../lib/supabase';

const PODIUM = ['#F5B400', '#A1A1AA', '#C77B30'];

type Entry = {
  id: string;
  name: string;
  /** For the Lockin+ badge and decoration. */
  person: ProfileRow | null;
  photoUri: string | null;
  seconds: number;
  streak: number;
  totalSeconds: number;
  isMe: boolean;
};

export default function RankingScreen() {
  const { profile, userId } = useAuth();
  const { friends, groups, shameWall, myWeekSeconds, myStreak, weekLeaderId } = useSocial();
  const now = useNow(30_000);
  const [scope, setScope] = useState<string>('friends');
  const group = groups.find((g) => g.id === scope);

  const ranking = useMemo(() => {
    const toEntry = (p: Person): Entry => ({
      id: p.profile.id,
      name: p.profile.display_name,
      person: p.profile,
      photoUri: p.profile.avatar_url,
      seconds: p.weekSeconds,
      streak: p.streak,
      totalSeconds: p.profile.total_seconds ?? 0,
      isMe: p.profile.id === userId,
    });
    const me: Entry = {
      id: userId ?? 'me',
      name: profile?.display_name ?? '?',
      person: profile,
      photoUri: profile?.avatar_url ?? null,
      seconds: myWeekSeconds,
      streak: myStreak,
      totalSeconds: profile?.total_seconds ?? 0,
      isMe: true,
    };
    const others = (group ? group.members : friends).map(toEntry).filter((e) => !e.isMe);
    return [me, ...others].sort((a, b) => b.seconds - a.seconds);
  }, [group, friends, profile, userId, myWeekSeconds, myStreak]);

  const leader = ranking[0];
  const myRank = ranking.findIndex((r) => r.isMe);
  const ahead = myRank > 0 ? ranking[myRank - 1] : null;
  const alone = ranking.length === 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={type.largeTitle}>Classement</Text>
          <Pressable onPress={() => router.push('/recap')} style={styles.recapButton} hitSlop={8}>
            <Ionicons name="sparkles" size={16} color={colors.accent} />
            <Text style={styles.recapText}>Mon récap</Text>
          </Pressable>
        </View>
        <Text style={type.subhead}>Cette semaine · remis à zéro le lundi</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scopes} contentContainerStyle={styles.scopesContent}>
          {[{ id: 'friends', name: 'Amis' }, ...groups].map((s) => (
            <Pressable key={s.id} onPress={() => setScope(s.id)} style={[styles.scope, scope === s.id && styles.scopeOn]}>
              <Text style={[styles.scopeText, scope === s.id && styles.scopeTextOn]}>{s.name}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => router.push('/groups')} style={[styles.scope, styles.scopeAdd]}>
            <Ionicons name="add" size={16} color={colors.accent} />
            <Text style={[styles.scopeText, { color: colors.accent }]}>{groups.length ? 'Groupes' : 'Ma promo'}</Text>
          </Pressable>
        </ScrollView>

        <View style={styles.hero}>
          <View style={styles.heroRankBox}>
            <Text style={styles.heroRank}>{myRank + 1}</Text>
            <Text style={styles.heroRankSuffix}>{myRank === 0 ? 'er' : 'e'}</Text>
          </View>
          <Text style={styles.heroText}>
            {alone
              ? group
                ? 'Partage le code du groupe pour que ta promo te rejoigne.'
                : 'Ajoute des potes dans l’onglet Amis pour te mesurer à eux.'
              : ahead
                ? `Encore ${formatDuration(ahead.seconds - myWeekSeconds + 60)} pour passer devant ${ahead.name} 🔥`
                : myWeekSeconds > 0
                  ? 'T’es devant tout le monde. Lâche rien 👑'
                  : 'Lock in pour entrer dans le classement.'}
          </Text>
        </View>

        <View style={styles.group}>
          {ranking.map((r, i) => (
            <Fragment key={r.id}>
              {i > 0 && <View style={styles.separator} />}
              <View style={[styles.row, r.isMe && styles.rowMe]}>
                <View style={styles.rankCell}>
                  {i < 3 && r.seconds > 0 ? (
                    <View style={[styles.podium, { backgroundColor: PODIUM[i] }]}>
                      <Text style={styles.podiumText}>{i + 1}</Text>
                    </View>
                  ) : (
                    <Text style={styles.rank}>{i + 1}</Text>
                  )}
                </View>
                <Avatar name={r.name} photoUri={r.photoUri} decoration={decorationOf(r.person)} size={40} />
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={styles.nameLine}>
                    <Text style={[type.headline, { flexShrink: 1 }]} numberOfLines={1}>
                      <Named person={r.person} name={r.name} suffix={r.isMe ? ' (toi)' : ''} />
                      {scope === 'friends' && r.id === weekLeaderId ? ' 👑' : ''}
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

        {scope === 'friends' && (
          <Section title="💀 Mur de la honte" footer="Les sessions lâchées cette semaine. Personne n’y échappe.">
            {shameWall.slice(0, 15).map(({ profile: p, session: s }) => {
              const end = Date.parse(s.ended_at ?? s.last_seen_at);
              return (
                <Row
                  key={s.id}
                  left={<Avatar name={p.display_name} photoUri={p.avatar_url} decoration={decorationOf(p)} />}
                  title={<Named person={p} suffix={p.id === userId ? ' (toi)' : ''} />}
                  subtitle={`A craqué après ${formatDuration((end - Date.parse(s.started_at)) / 1000)}${labelSuffix(s.subject)} · ${timeAgo(end, now)}`}
                  subtitleColor={colors.danger}
                />
              );
            })}
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: 20, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  recapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  recapText: { color: colors.accent, fontWeight: '600', fontSize: 14 },
  scopes: { flexGrow: 0, marginHorizontal: -20, marginTop: 16 },
  scopesContent: { gap: 8, paddingHorizontal: 20 },
  scope: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.card,
  },
  scopeOn: { backgroundColor: colors.text },
  scopeAdd: { backgroundColor: colors.accentSoft },
  scopeText: { fontSize: 15, fontWeight: '500', color: colors.text },
  scopeTextOn: { color: colors.card },
  hero: { ...card, marginTop: 16, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroRankBox: { flexDirection: 'row', alignItems: 'flex-start' },
  heroRank: { fontSize: 48, fontWeight: '700', color: colors.accent, letterSpacing: -1 },
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
