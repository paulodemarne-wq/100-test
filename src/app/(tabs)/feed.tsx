import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Fragment, ReactNode, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { Friend, useSocial } from '../../lib/social';
import { useLockin, useNow } from '../../lib/store';
import { card, colors, DEFAULT_LABEL, type } from '../../lib/theme';
import { formatDuration, formatTimer, timeAgo } from '../../lib/time';

export default function FeedScreen() {
  const { profile } = useAuth();
  const { friends, incomingRequests, outgoingRequests, mySessions, refresh, acceptRequest, removeFriend, nudge } =
    useSocial();
  const { active } = useLockin();
  const now = useNow();
  const [nudged, setNudged] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  const working = friends.filter((f) => f.status.kind === 'working');
  const others = friends.filter((f) => f.status.kind !== 'working');
  const liveCount = working.length + (active ? 1 : 0);
  const pastSessions = mySessions.filter((s) => s.status !== 'active');

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const sendNudge = async (friend: Friend) => {
    setNudged((n) => ({ ...n, [friend.profile.id]: true }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await nudge(friend.profile.id);
    } catch (e) {
      setNudged((n) => ({ ...n, [friend.profile.id]: false }));
      Alert.alert('Oups', (e as Error).message);
    }
  };

  const confirmRemove = (id: string, name: string, isRequest = false) => {
    Alert.alert(
      isRequest ? `Refuser la demande de ${name} ?` : `Retirer ${name} de tes amis ?`,
      undefined,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: isRequest ? 'Refuser' : 'Retirer',
          style: 'destructive',
          onPress: () => removeFriend(id).catch((e) => Alert.alert('Oups', (e as Error).message)),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={type.largeTitle}>Amis</Text>
          <Pressable onPress={() => router.push('/add-friend')} hitSlop={10} style={styles.addButton}>
            <Ionicons name="person-add" size={20} color={colors.accent} />
          </Pressable>
        </View>
        {friends.length > 0 && (
          <Text style={type.subhead}>
            {liveCount} {liveCount > 1 ? 'personnes bossent' : 'personne bosse'} en ce moment
          </Text>
        )}

        <Section title="Demandes d'amis">
          {incomingRequests.map((p) => (
            <Row
              key={p.id}
              avatar={<Avatar name={p.display_name} photoUri={p.avatar_url} />}
              title={p.display_name}
              subtitle={`@${p.username} veut être ton ami`}
              right={
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => confirmRemove(p.id, p.display_name, true)}
                    style={[styles.pill, { backgroundColor: colors.fill }]}
                  >
                    <Ionicons name="close" size={16} color={colors.secondary} />
                  </Pressable>
                  <Pressable
                    onPress={() => acceptRequest(p.id).catch((e) => Alert.alert('Oups', (e as Error).message))}
                    style={[styles.pill, { backgroundColor: colors.accent }]}
                  >
                    <Text style={[styles.pillText, { color: colors.onAccent }]}>Accepter</Text>
                  </Pressable>
                </View>
              }
            />
          ))}
        </Section>

        {friends.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people" size={34} color={colors.accent} />
            </View>
            <Text style={[type.title, { textAlign: 'center' }]}>Ajoute tes amis</Text>
            <Text style={[type.subhead, { textAlign: 'center' }]}>
              Tu verras quand ils bossent, et ils verront quand tu lâches 😏
            </Text>
            <Button title="Ajouter des amis" onPress={() => router.push('/add-friend')} style={{ alignSelf: 'stretch' }} />
          </View>
        )}

        <Section title="En train de bosser">
          {friends.length > 0 && active && profile && (
            <Row
              avatar={<Avatar name={profile.display_name} photoUri={profile.avatar_url} live />}
              title={`${profile.display_name} (toi)`}
              subtitle={labelOr(active.subject, 'En focus')}
              right={<Text style={styles.liveTimer}>{formatTimer((now - active.startedAt) / 1000)}</Text>}
            />
          )}
          {working.map((f) =>
            f.status.kind === 'working' ? (
              <Row
                key={f.profile.id}
                onLongPress={() => confirmRemove(f.profile.id, f.profile.display_name)}
                avatar={<Avatar name={f.profile.display_name} photoUri={f.profile.avatar_url} live />}
                title={f.profile.display_name}
                subtitle={labelOr(f.status.subject, 'En focus')}
                right={<Text style={styles.liveTimer}>{formatTimer((now - f.status.startedAt) / 1000)}</Text>}
              />
            ) : null,
          )}
        </Section>

        <Section title="Les autres">
          {others.map((f) => (
            <Row
              key={f.profile.id}
              onLongPress={() => confirmRemove(f.profile.id, f.profile.display_name)}
              avatar={<Avatar name={f.profile.display_name} photoUri={f.profile.avatar_url} />}
              title={f.profile.display_name}
              subtitle={describe(f, now)}
              subtitleColor={f.status.kind === 'abandoned' ? colors.danger : undefined}
              right={
                <Pressable
                  onPress={() => sendNudge(f)}
                  disabled={nudged[f.profile.id]}
                  style={[styles.pill, { backgroundColor: nudged[f.profile.id] ? colors.fill : colors.accentSoft }]}
                >
                  <Text style={[styles.pillText, nudged[f.profile.id] && { color: colors.secondary }]}>
                    {nudged[f.profile.id] ? 'Envoyé' : 'Relancer'}
                  </Text>
                </Pressable>
              }
            />
          ))}
        </Section>

        <Section title="Demandes envoyées">
          {outgoingRequests.map((p) => (
            <Row
              key={p.id}
              onLongPress={() => confirmRemove(p.id, p.display_name)}
              avatar={<Avatar name={p.display_name} photoUri={p.avatar_url} />}
              title={p.display_name}
              subtitle={`@${p.username} · en attente`}
            />
          ))}
        </Section>

        <Section title="Mes sessions">
          {pastSessions.slice(0, 10).map((s) => (
            <Row
              key={s.id}
              avatar={
                <View
                  style={[
                    styles.sessionIcon,
                    { backgroundColor: s.status === 'done' ? colors.successSoft : colors.dangerSoft },
                  ]}
                >
                  <Ionicons
                    name={s.status === 'done' ? 'checkmark' : 'close'}
                    size={20}
                    color={s.status === 'done' ? colors.success : colors.danger}
                  />
                </View>
              }
              title={labelOr(s.subject, 'Session focus')}
              subtitle={
                s.status === 'done'
                  ? timeAgo(Date.parse(s.ended_at ?? s.started_at), now)
                  : `Abandonnée · ${timeAgo(Date.parse(s.ended_at ?? s.started_at), now)}`
              }
              right={<Text style={styles.duration}>{formatDuration(s.duration_sec ?? 0)}</Text>}
            />
          ))}
        </Section>

        {friends.length > 0 && (
          <Text style={[styles.footer, { marginTop: 16 }]}>Appui long sur un ami pour le retirer.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function describe(f: Friend, now: number): string {
  const s = f.status;
  switch (s.kind) {
    case 'abandoned':
      return `A lâché après ${formatDuration(s.durationSec)}${labelSuffix(s.subject)}`;
    case 'done':
      return `${formatDuration(s.durationSec)} de focus${labelSuffix(s.subject)} · ${timeAgo(s.at, now)}`;
    case 'idle':
      return 'Pas encore de session';
    case 'working':
      return labelOr(s.subject, 'En focus');
  }
}

function labelOr(label: string, fallback: string): string {
  return label === DEFAULT_LABEL ? fallback : label;
}

function labelSuffix(label: string): string {
  return label === DEFAULT_LABEL ? '' : ` · ${label}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
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
    </View>
  );
}

type RowProps = {
  avatar: ReactNode;
  title: string;
  subtitle: string;
  subtitleColor?: string;
  right?: ReactNode;
  onLongPress?: () => void;
};

function Row({ avatar, title, subtitle, subtitleColor, right, onLongPress }: RowProps) {
  return (
    <Pressable onLongPress={onLongPress} disabled={!onLongPress} style={styles.row}>
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: 20, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { ...type.footnote, marginLeft: 16, marginBottom: 8 },
  group: { ...card, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 72 },
  footer: { ...type.footnote, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 11 },
  liveTimer: { fontSize: 17, fontWeight: '500', color: colors.success, fontVariant: ['tabular-nums'] },
  duration: { fontSize: 15, color: colors.secondary, fontVariant: ['tabular-nums'] },
  pill: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { color: colors.accent, fontWeight: '600', fontSize: 14 },
  sessionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  empty: { ...card, marginTop: 24, padding: 24, alignItems: 'center', gap: 12 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
});
