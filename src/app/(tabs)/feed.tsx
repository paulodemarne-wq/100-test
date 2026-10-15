import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { Pill, Row, Section } from '../../components/List';
import { askReaction, ReactionSummary } from '../../components/Reactions';
import { Button } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { countdown, describeStatus, formatEventTime, labelOr } from '../../lib/labels';
import { Person, useSocial } from '../../lib/social';
import { focusSeconds, useVainc, useNow } from '../../lib/store';
import { card, colors, type } from '../../lib/theme';
import { formatDuration, formatTimer, timeAgo } from '../../lib/time';
import { decorationOf } from '../../lib/premium';
import { Named } from '../../components/Badge';
import { useChat } from '../../lib/chat';

export default function FeedScreen() {
  const { profile, userId } = useAuth();
  const { unreadTotal } = useChat();
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
    reactions,
    react,
    weekLeaderId,
  } = useSocial();
  const { active } = useVainc();
  const now = useNow();
  const [nudged, setNudged] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  const isLive = (f: Person) => f.status.kind === 'working' || f.status.kind === 'paused';
  const working = friends.filter(isLive);
  const others = friends.filter((f) => !isLive(f));
  const crown = (id: string, name: string) => (id === weekLeaderId ? `${name} 👑` : name);

  /** Tap a friend to react to their latest session. */
  const reactTo = (f: Person) => {
    if (f.status.kind === 'idle') return;
    const sessionId = f.status.sessionId;
    const mine = reactions[sessionId]?.find((r) => r.user_id === userId)?.emoji;
    askReaction(f.profile.display_name, mine, (emoji) => {
      Haptics.selectionAsync();
      react(sessionId, emoji).catch(fail);
    });
  };
  const reactionsOf = (f: Person) =>
    f.status.kind === 'idle' ? null : <ReactionSummary reactions={reactions[f.status.sessionId]} myId={userId} />;
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
            <Pressable onPress={() => router.push('/messages')} hitSlop={10} style={styles.headerButton} accessibilityLabel="Messages">
              <Ionicons name="chatbubbles" size={19} color={colors.accent} />
              {unreadTotal > 0 && (
                <View style={styles.unreadDot}>
                  <Text style={styles.unreadDotText}>{unreadTotal > 9 ? '9+' : unreadTotal}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
        {friends.length > 0 && (
          <Text style={type.subhead}>
            {liveCount} {liveCount > 1 ? 'potes sont en vainc' : 'pote en vainc'} en ce moment
          </Text>
        )}

        <Section title="Demandes d'amis">
          {incomingRequests.map((p) => (
            <Row
              key={p.id}
              left={<Avatar name={p.display_name} photoUri={p.avatar_url} decoration={decorationOf(p)} />}
              title={<Named person={p} />}
              subtitle={`@${p.username} veut vainc avec toi`}
              right={
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pill title="✕" tone="muted" onPress={() => confirmRemove(p.id, p.display_name, true)} />
                  <Pill title="Accepter" tone="solid" onPress={() => acceptRequest(p.id).catch(fail)} />
                </View>
              }
            />
          ))}
        </Section>

        <Section title="vainc de groupe">
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

        <Section title="En vainc">
          {friends.length > 0 && active && profile ? (
            <Row
              left={<Avatar name={profile.display_name} photoUri={profile.avatar_url} decoration={decorationOf(profile)} live />}
              title={<Named person={profile} name={crown(profile.id, profile.display_name)} suffix=" (toi)" />}
              subtitle={active.pause ? 'En pause ☕' : labelOr(active.subject, 'En vainc')}
              right={<Text style={styles.liveTimer}>{formatTimer(focusSeconds(active, now))}</Text>}
            />
          ) : null}
          {working.map((f) => (
            <Row
              key={f.profile.id}
              onPress={() => reactTo(f)}
              onLongPress={() => confirmRemove(f.profile.id, f.profile.display_name)}
              left={<Avatar name={f.profile.display_name} photoUri={f.profile.avatar_url} decoration={decorationOf(f.profile)} live={f.status.kind === 'working'} />}
              title={<Named person={f.profile} name={crown(f.profile.id, f.profile.display_name)} />}
              subtitle={describeStatus(f.status, now)}
              footer={reactionsOf(f)}
              right={
                f.status.kind === 'working' ? (
                  <Text style={styles.liveTimer}>
                    {formatTimer((now - f.status.startedAt) / 1000 - f.status.pausedSeconds)}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 22 }}>☕</Text>
                )
              }
            />
          ))}
        </Section>

        <Section title="Les autres">
          {others.map((f) => (
            <Row
              key={f.profile.id}
              onPress={() => reactTo(f)}
              onLongPress={() => confirmRemove(f.profile.id, f.profile.display_name)}
              left={<Avatar name={f.profile.display_name} photoUri={f.profile.avatar_url} decoration={decorationOf(f.profile)} />}
              title={<Named person={f.profile} name={crown(f.profile.id, f.profile.display_name)} />}
              subtitle={describeStatus(f.status, now)}
              subtitleColor={f.status.kind === 'abandoned' ? colors.danger : undefined}
              footer={reactionsOf(f)}
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
              left={<Avatar name={p.display_name} photoUri={p.avatar_url} decoration={decorationOf(p)} />}
              title={<Named person={p} />}
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
              title={labelOr(s.subject, 'vainc')}
              subtitle={
                s.status === 'done'
                  ? timeAgo(Date.parse(s.ended_at ?? s.started_at), now)
                  : `Craqué · ${timeAgo(Date.parse(s.ended_at ?? s.started_at), now)}`
              }
              footer={<ReactionSummary reactions={reactions[s.id]} myId={userId} />}
              right={<Text style={styles.duration}>{formatDuration(s.duration_sec ?? 0)}</Text>}
            />
          ))}
        </Section>

        {friends.length > 0 && (
          <Text style={[type.footnote, { textAlign: 'center', marginTop: 16 }]}>
            Touche un pote pour réagir à sa session. Appui long pour le retirer.
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
  unreadDot: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  unreadDotText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
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
