import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Fragment, ReactNode, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { Friend, getDemoFriends } from '../../lib/demoFriends';
import { useLockin, useNow } from '../../lib/store';
import { card, colors, type } from '../../lib/theme';
import { formatDuration, formatTimer, timeAgo } from '../../lib/time';

export default function FeedScreen() {
  const { profile, active, sessions } = useLockin();
  const now = useNow();
  const friends = useMemo(() => getDemoFriends(), []);
  const [nudged, setNudged] = useState<Record<string, boolean>>({});

  const working = friends.filter((f) => f.status.kind === 'working');
  const others = friends.filter((f) => f.status.kind !== 'working');
  const liveCount = working.length + (active ? 1 : 0);

  const nudge = (friend: Friend) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNudged((n) => ({ ...n, [friend.id]: true }));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[type.largeTitle, { marginTop: 8 }]}>Amis</Text>
        <Text style={type.subhead}>
          {liveCount} {liveCount > 1 ? 'personnes bossent' : 'personne bosse'} en ce moment
        </Text>

        <Section title="En train de bosser">
          {active && profile && (
            <Row
              avatar={<Avatar name={profile.name} photoUri={profile.photoUri} live />}
              title={`${profile.name} (toi)`}
              subtitle={active.subject}
              right={<Text style={styles.liveTimer}>{formatTimer((now - active.startedAt) / 1000)}</Text>}
            />
          )}
          {working.map((f) =>
            f.status.kind === 'working' ? (
              <Row
                key={f.id}
                avatar={<Avatar name={f.name} live />}
                title={f.name}
                subtitle={f.status.subject}
                right={<Text style={styles.liveTimer}>{formatTimer((now - f.status.startedAt) / 1000)}</Text>}
              />
            ) : null,
          )}
        </Section>

        <Section title="Récemment" footer="Ces amis sont des exemples. L'ajout de vrais amis arrive bientôt.">
          {others.map((f) => (
            <Row
              key={f.id}
              avatar={<Avatar name={f.name} />}
              title={f.name}
              subtitle={describe(f, now)}
              subtitleColor={f.status.kind === 'abandoned' ? colors.danger : undefined}
              right={
                f.status.kind === 'done' ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                ) : (
                  <Pressable
                    onPress={() => nudge(f)}
                    disabled={nudged[f.id]}
                    style={[styles.nudge, nudged[f.id] && styles.nudgeDone]}
                  >
                    <Text style={[styles.nudgeText, nudged[f.id] && { color: colors.secondary }]}>
                      {nudged[f.id] ? 'Envoyé' : 'Relancer'}
                    </Text>
                  </Pressable>
                )
              }
            />
          ))}
        </Section>

        {sessions.length > 0 && (
          <Section title="Mes sessions">
            {sessions.slice(0, 10).map((s) => (
              <Row
                key={s.id}
                avatar={
                  <View style={[styles.sessionIcon, { backgroundColor: s.status === 'done' ? colors.successSoft : colors.dangerSoft }]}>
                    <Ionicons
                      name={s.status === 'done' ? 'checkmark' : 'close'}
                      size={20}
                      color={s.status === 'done' ? colors.success : colors.danger}
                    />
                  </View>
                }
                title={s.subject}
                subtitle={s.status === 'done' ? timeAgo(s.endedAt, now) : `Abandonnée · ${timeAgo(s.endedAt, now)}`}
                right={<Text style={styles.duration}>{formatDuration(s.durationSec)}</Text>}
              />
            ))}
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function describe(f: Friend, now: number): string {
  const s = f.status;
  switch (s.kind) {
    case 'abandoned':
      return `A abandonné en ${s.subject} après ${s.afterMin} min`;
    case 'done':
      return `${formatDuration(s.durationMin * 60)} de ${s.subject} · ${timeAgo(s.at, now)}`;
    case 'idle':
      return `Pas de session · ${timeAgo(s.lastSeenAt, now)}`;
    case 'working':
      return s.subject;
  }
}

function Section({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  const rows = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={styles.group}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <View style={styles.separator} />}
            {row}
          </Fragment>
        ))}
      </View>
      {footer && <Text style={styles.footer}>{footer}</Text>}
    </View>
  );
}

type RowProps = { avatar: ReactNode; title: string; subtitle: string; subtitleColor?: string; right?: ReactNode };

function Row({ avatar, title, subtitle, subtitleColor, right }: RowProps) {
  return (
    <View style={styles.row}>
      {avatar}
      <View style={{ flex: 1 }}>
        <Text style={type.headline} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[type.subhead, subtitleColor && { color: subtitleColor }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: 20, paddingBottom: 32 },
  sectionTitle: { ...type.caption, fontWeight: '400', fontSize: 13, marginLeft: 16, marginBottom: 8 },
  group: { ...card, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 72 },
  footer: { ...type.footnote, marginHorizontal: 16, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 11 },
  liveTimer: { fontSize: 17, fontWeight: '500', color: colors.success, fontVariant: ['tabular-nums'] },
  duration: { fontSize: 15, color: colors.secondary, fontVariant: ['tabular-nums'] },
  nudge: { backgroundColor: colors.accentSoft, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 },
  nudgeDone: { backgroundColor: colors.fill },
  nudgeText: { color: colors.accent, fontWeight: '600', fontSize: 14 },
  sessionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
