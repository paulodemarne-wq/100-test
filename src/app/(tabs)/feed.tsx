import * as Haptics from 'expo-haptics';
import { ReactNode, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Friend, getDemoFriends } from '../../lib/demoFriends';
import { Session, useLockin, useNow } from '../../lib/store';
import { colors } from '../../lib/theme';
import { formatDuration, formatTimer, timeAgo } from '../../lib/time';

export default function FeedScreen() {
  const { profile, active, sessions } = useLockin();
  const now = useNow();
  const friends = useMemo(() => getDemoFriends(), []);
  const [nudged, setNudged] = useState<Record<string, boolean>>({});

  const nudge = (friend: Friend) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setNudged((n) => ({ ...n, [friend.id]: true }));
  };

  const working = friends.filter((f) => f.status.kind === 'working').length + (active ? 1 : 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Amis</Text>
        <Text style={styles.subtitle}>
          {working} {working > 1 ? 'personnes bossent' : 'personne bosse'} en ce moment
        </Text>

        <View style={styles.demoBanner}>
          <Text style={styles.demoText}>
            👀 Amis de démo : l'ajout de vrais amis arrive dans la prochaine version.
          </Text>
        </View>

        {/* Me */}
        <Row emoji={profile?.emoji ?? '🙂'} name={`${profile?.name} (toi)`}>
          {active ? (
            <Text style={styles.statusWorking}>
              🟢 Bosse en {active.subject} · {formatTimer((now - active.startedAt) / 1000)}
            </Text>
          ) : (
            <Text style={styles.statusMuted}>{describeLastSession(sessions[0], now)}</Text>
          )}
        </Row>

        {friends.map((f) => (
          <Row key={f.id} emoji={f.emoji} name={f.name}>
            <FriendStatusLine friend={f} now={now} />
            {(f.status.kind === 'idle' || f.status.kind === 'abandoned') && (
              <Pressable
                onPress={() => nudge(f)}
                disabled={nudged[f.id]}
                style={[styles.nudge, nudged[f.id] && styles.nudgeDone]}
              >
                <Text style={[styles.nudgeText, nudged[f.id] && { color: colors.muted }]}>
                  {nudged[f.id] ? 'Relance envoyée ✓' : '📣 Viens bosser !'}
                </Text>
              </Pressable>
            )}
          </Row>
        ))}

        {sessions.length > 0 && (
          <>
            <Text style={[styles.title, { fontSize: 22, marginTop: 16 }]}>Mes dernières sessions</Text>
            {sessions.slice(0, 10).map((s) => (
              <View key={s.id} style={styles.historyRow}>
                <Text style={styles.historyText}>
                  {s.status === 'done' ? '✅' : '🔴'} {s.subject} · {formatDuration(s.durationSec)}
                </Text>
                <Text style={styles.statusMuted}>{timeAgo(s.endedAt, now)}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function describeLastSession(session: Session | undefined, now: number): string {
  if (!session) return "Pas encore de session. Lance-toi !";
  if (session.status === 'abandoned') {
    return `🔴 A abandonné en ${session.subject} après ${formatDuration(session.durationSec)} 😬`;
  }
  return `✅ ${formatDuration(session.durationSec)} de ${session.subject} · ${timeAgo(session.endedAt, now)}`;
}

function FriendStatusLine({ friend, now }: { friend: Friend; now: number }) {
  const s = friend.status;
  switch (s.kind) {
    case 'working':
      return (
        <Text style={styles.statusWorking}>
          🟢 Bosse en {s.subject} · {formatTimer((now - s.startedAt) / 1000)}
        </Text>
      );
    case 'abandoned':
      return (
        <Text style={styles.statusDanger}>
          🔴 A abandonné en {s.subject} après {s.afterMin} min 😬 · {timeAgo(s.at, now)}
        </Text>
      );
    case 'done':
      return (
        <Text style={styles.statusMuted}>
          ✅ {formatDuration(s.durationMin * 60)} de {s.subject} · {timeAgo(s.at, now)}
        </Text>
      );
    case 'idle':
      return <Text style={styles.statusMuted}>💤 Pas de session · vu {timeAgo(s.lastSeenAt, now)}</Text>;
  }
}

function Row({ emoji, name, children }: { emoji: string; name: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.avatar}>{emoji}</Text>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.name}>{name}</Text>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, gap: 12 },
  title: { color: colors.text, fontSize: 32, fontWeight: '900' },
  subtitle: { color: colors.accent, fontSize: 15, fontWeight: '600', marginTop: -4 },
  demoBanner: { backgroundColor: colors.card, borderRadius: 12, padding: 12, marginVertical: 4 },
  demoText: { color: colors.muted, fontSize: 13 },
  row: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: 'flex-start',
  },
  avatar: { fontSize: 34 },
  name: { color: colors.text, fontSize: 17, fontWeight: '700' },
  statusWorking: { color: colors.accent, fontSize: 14, fontVariant: ['tabular-nums'] },
  statusDanger: { color: colors.danger, fontSize: 14 },
  statusMuted: { color: colors.muted, fontSize: 14 },
  nudge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  nudgeDone: { backgroundColor: colors.cardBorder },
  nudgeText: { color: colors.accentText, fontWeight: '700', fontSize: 13 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  historyText: { color: colors.text, fontSize: 15 },
});
