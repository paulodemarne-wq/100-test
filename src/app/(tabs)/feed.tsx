import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { Pill, Row, Section } from '../../components/List';
import { Button } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { countdown, describeStatus, formatEventTime, labelOr } from '../../lib/labels';
import { Person, useSocial } from '../../lib/social';
import { useLockin, useNow } from '../../lib/store';
import { card, colors, type } from '../../lib/theme';
import { formatDuration, formatTimer, timeAgo } from '../../lib/time';

export default function FeedScreen() {
  const { profile } = useAuth();
  const {
    friends,
    incomingRequests,
    outgoingRequests,
    events,
    mySessions,
    refresh,
    acceptRequest,
    removeFriend,
    nudge,
    answerEvent,
  } = useSocial();
  const { active } = useLockin();
  const now = useNow();
  const [nudged, setNudged] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  const working = friends.filter((f) => f.status.kind === 'working');
  const others = friends.filter((f) => f.status.kind !== 'working');
  const liveCount = working.length + (active ? 1 : 0);
  const pastSessions = mySessions.filter((s) => s.status !== 'active');
  const visibleEvents = events.filter((e) => e.myRsvp !== 'declined');

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const sendNudge = async (friend: Person) => {
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
    Alert.alert(isRequest ? `Refuser la demande de ${name} ?` : `Retirer ${name} de tes amis ?`, undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: isRequest ? 'Refuser' : 'Retirer',
        style: 'destructive',
        onPress: () => removeFriend(id).catch((e) => Alert.alert('Oups', (e as Error).message)),
      },
    ]);
  };

  const fail = (e: unknown) => Alert.alert('Oups', (e as Error).message);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={type.largeTitle}>Amis</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {friends.length > 0 && (
              <Pressable onPress={() => router.push('/new-event')} hitSlop={10} style={styles.headerButton}>
                <Ionicons name="calendar" size={19} color={colors.accent} />
              </Pressable>
            )}
            <Pressable onPress={() => router.push('/add-friend')} hitSlop={10} style={styles.headerButton}>
              <Ionicons name="person-add" size={19} color={colors.accent} />
            </Pressable>
          </View>
        </View>
        {friends.length > 0 && (
          <Text style={type.subhead}>
            {liveCount} {liveCount > 1 ? 'potes sont en lock in' : 'pote en lock in'} en ce moment
          </Text>
        )}

        <Section title="Demandes d'amis">
          {incomingRequests.map((p) => (
            <Row
              key={p.id}
              left={<Avatar name={p.display_name} photoUri={p.avatar_url} />}
              title={p.display_name}
              subtitle={`@${p.username} veut lock in avec toi`}
              right={
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pill title="✕" tone="muted" onPress={() => confirmRemove(p.id, p.display_name, true)} />
                  <Pill title="Accepter" tone="solid" onPress={() => acceptRequest(p.id).catch(fail)} />
                </View>
              }
            />
          ))}
        </Section>

        <Section title="Lock in de groupe">
          {visibleEvents.map((e) => {
            const going = e.participants.filter((p) => p.rsvp === 'going');
            return (
              <Row
                key={e.id}
                onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
                left={
                  <View style={styles.eventIcon}>
                    <Ionicons name="people" size={20} color={colors.accent} />
                  </View>
                }
                title={e.title}
                subtitle={
                  e.myRsvp === 'invited'
                    ? `${e.hostProfile.display_name} t'invite · ${formatEventTime(e.startsAt, now)}`
                    : `${formatEventTime(e.startsAt, now)} · ${countdown(e.startsAt, now)} · ${going.length} ${going.length > 1 ? 'partants' : 'partant'}`
                }
                right={
                  e.myRsvp === 'invited' ? (
                    <Pill title="Je viens" tone="solid" onPress={() => answerEvent(e.id, 'going').catch(fail)} />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={colors.tertiary} />
                  )
                }
              />
            );
          })}
        </Section>

        {friends.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people" size={34} color={colors.accent} />
            </View>
            <Text style={[type.title, { textAlign: 'center' }]}>Ajoute tes potes</Text>
            <Text style={[type.subhead, { textAlign: 'center' }]}>
              Tu verras quand ils bossent. Et eux verront quand tu craques 😏
            </Text>
            <Button title="Ajouter des amis" onPress={() => router.push('/add-friend')} style={{ alignSelf: 'stretch' }} />
          </View>
        )}

        <Section title="En lock in">
          {friends.length > 0 && active && profile ? (
            <Row
              left={<Avatar name={profile.display_name} photoUri={profile.avatar_url} live />}
              title={`${profile.display_name} (toi)`}
              subtitle={labelOr(active.subject, 'En lock in')}
              right={<Text style={styles.liveTimer}>{formatTimer((now - active.startedAt) / 1000)}</Text>}
            />
          ) : null}
          {working.map((f) =>
            f.status.kind === 'working' ? (
              <Row
                key={f.profile.id}
                onLongPress={() => confirmRemove(f.profile.id, f.profile.display_name)}
                left={<Avatar name={f.profile.display_name} photoUri={f.profile.avatar_url} live />}
                title={f.profile.display_name}
                subtitle={describeStatus(f.status, now)}
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
              left={<Avatar name={f.profile.display_name} photoUri={f.profile.avatar_url} />}
              title={f.profile.display_name}
              subtitle={describeStatus(f.status, now)}
              subtitleColor={f.status.kind === 'abandoned' ? colors.danger : undefined}
              right={
                <Pill
                  title={nudged[f.profile.id] ? 'Envoyé' : 'Relancer'}
                  tone={nudged[f.profile.id] ? 'muted' : 'soft'}
                  disabled={nudged[f.profile.id]}
                  onPress={() => sendNudge(f)}
                />
              }
            />
          ))}
        </Section>

        <Section title="Demandes envoyées">
          {outgoingRequests.map((p) => (
            <Row
              key={p.id}
              onLongPress={() => confirmRemove(p.id, p.display_name)}
              left={<Avatar name={p.display_name} photoUri={p.avatar_url} />}
              title={p.display_name}
              subtitle={`@${p.username} · en attente`}
            />
          ))}
        </Section>

        <Section title="Mes sessions">
          {pastSessions.slice(0, 10).map((s) => (
            <Row
              key={s.id}
              left={
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
              title={labelOr(s.subject, 'Lock in')}
              subtitle={
                s.status === 'done'
                  ? timeAgo(Date.parse(s.ended_at ?? s.started_at), now)
                  : `Craqué · ${timeAgo(Date.parse(s.ended_at ?? s.started_at), now)}`
              }
              right={<Text style={styles.duration}>{formatDuration(s.duration_sec ?? 0)}</Text>}
            />
          ))}
        </Section>

        {friends.length > 0 && (
          <Text style={[type.footnote, { textAlign: 'center', marginTop: 16 }]}>
            Appui long sur un ami pour le retirer.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: 20, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveTimer: { fontSize: 17, fontWeight: '500', color: colors.success, fontVariant: ['tabular-nums'] },
  duration: { fontSize: 15, color: colors.secondary, fontVariant: ['tabular-nums'] },
  sessionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  eventIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
