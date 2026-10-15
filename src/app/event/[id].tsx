import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { Row, Section } from '../../components/List';
import { Button } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { countdown, formatEventTime } from '../../lib/labels';
import { effectiveStatus, EventParticipant, useSocial } from '../../lib/social';
import { useVainc, useNow } from '../../lib/store';
import { card, colors, type } from '../../lib/theme';
import { formatDuration, formatTimer } from '../../lib/time';
import { decorationOf } from '../../lib/premium';
import { Named } from '../../components/Badge';

/** Joining opens a little before the start. */
const JOIN_EARLY_MS = 10 * 60_000;

function abandonedAt(p: EventParticipant, now: number): number | null {
  const s = p.session;
  if (!s || effectiveStatus(s, now) !== 'abandoned') return null;
  return Date.parse(s.ended_at ?? s.last_seen_at);
}

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const { events, answerEvent, cancelEvent, loading } = useSocial();
  const { active, startSession } = useVainc();
  const now = useNow();
  const event = events.find((e) => e.id === id);

  if (!event) {
    return (
      <SafeAreaView style={styles.safe}>
        <BackButton />
        <Text style={[type.subhead, { textAlign: 'center', marginTop: 40 }]}>
          {loading ? 'Chargement…' : 'Ce vainc a été annulé ou est terminé.'}
        </Text>
      </SafeAreaView>
    );
  }

  const isHost = event.host === userId;
  const started = now >= event.startsAt;
  const canJoin = event.myRsvp === 'going' && now >= event.startsAt - JOIN_EARLY_MS && !active;
  const inThisEvent = active?.eventId === event.id;
  const fail = (e: unknown) => Alert.alert('Oups', (e as Error).message);

  // First person to crack, if anyone has.
  const cracked = event.participants
    .map((p) => ({ p, at: abandonedAt(p, now) }))
    .filter((x): x is { p: EventParticipant; at: number } => x.at !== null)
    .sort((a, b) => a.at - b.at);
  const firstToCrack = cracked[0]?.p;

  const order = { working: 0, done: 1, going: 2, invited: 3, abandoned: 4, declined: 5 } as const;
  const stateOf = (p: EventParticipant): keyof typeof order => {
    if (p.session) {
      const st = effectiveStatus(p.session, now);
      return st === 'active' ? 'working' : st;
    }
    return p.rsvp;
  };
  const participants = [...event.participants].sort((a, b) => order[stateOf(a)] - order[stateOf(b)]);

  const join = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Session labels are limited to 30 characters.
    startSession(event.title.slice(0, 30), event.id);
    router.navigate('/');
  };

  const confirmCancel = () =>
    Alert.alert('Annuler ce vainc ?', 'Les invités ne le verront plus.', [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Annuler le vainc',
        style: 'destructive',
        onPress: () =>
          cancelEvent(event.id)
            .then(() => router.back())
            .catch(fail),
      },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <BackButton />

        <View style={[card, styles.hero]}>
          <Text style={type.footnote}>Organisé par {isHost ? 'toi' : event.hostProfile.display_name}</Text>
          <Text style={[type.largeTitle, { textAlign: 'center' }]}>{event.title}</Text>
          <Text style={styles.when}>{formatEventTime(event.startsAt, now)}</Text>
          <Text style={[styles.countdown, started && { color: colors.success }]}>
            {started ? '🟢 En cours' : countdown(event.startsAt, now)}
          </Text>
        </View>

        {firstToCrack && (
          <View style={[card, styles.shame]}>
            <Text style={{ fontSize: 28 }}>💀</Text>
            <Avatar name={firstToCrack.profile.display_name} photoUri={firstToCrack.profile.avatar_url} decoration={decorationOf(firstToCrack.profile)} size={36} />
            <Text style={styles.shameText}>
              <Text style={{ fontWeight: '700' }}>
                {firstToCrack.profile.id === userId ? 'Toi' : <Named person={firstToCrack.profile} />}
              </Text>{' '}
              {firstToCrack.profile.id === userId ? 'as craqué en premier' : 'a craqué en premier'}
            </Text>
          </View>
        )}

        <View style={{ marginTop: 16, gap: 10 }}>
          {event.myRsvp === 'invited' && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                title="Pas dispo"
                variant="secondary"
                onPress={() => answerEvent(event.id, 'declined').catch(fail)}
                style={{ flex: 1 }}
              />
              <Button title="Je viens" onPress={() => answerEvent(event.id, 'going').catch(fail)} style={{ flex: 1 }} />
            </View>
          )}
          {inThisEvent && <Button title="Tu es en vainc → voir le chrono" onPress={() => router.navigate('/')} />}
          {canJoin && (
            <Button
              title="vainc maintenant"
              onPress={join}
              icon={<Ionicons name="lock-closed" size={18} color={colors.onAccent} />}
            />
          )}
          {event.myRsvp === 'going' && !started && !canJoin && !inThisEvent && (
            <Text style={[type.footnote, { textAlign: 'center' }]}>
              Tu recevras une notif à l'heure. Le bouton pour lancer apparaît 10 min avant.
            </Text>
          )}
        </View>

        <Section title="Participants">
          {participants.map((p) => {
            const st = stateOf(p);
            const s = p.session;
            const me = p.profile.id === userId;
            let subtitle = '';
            let color: string | undefined;
            let right = null;
            if (st === 'working' && s) {
              subtitle = 'En vainc';
              color = colors.success;
              right = <Text style={styles.timer}>{formatTimer((now - Date.parse(s.started_at)) / 1000)}</Text>;
            } else if (st === 'done' && s) {
              subtitle = `Terminé · ${formatDuration(s.duration_sec ?? 0)} ✓`;
            } else if (st === 'abandoned' && s) {
              const at = abandonedAt(p, now) ?? now;
              subtitle = `A craqué après ${formatDuration((at - Date.parse(s.started_at)) / 1000)} 💀`;
              color = colors.danger;
            } else {
              subtitle = { going: 'Partant', invited: 'Pas encore répondu', declined: 'Pas dispo' }[p.rsvp];
            }
            return (
              <Row
                key={p.profile.id}
                left={<Avatar name={p.profile.display_name} photoUri={p.profile.avatar_url} decoration={decorationOf(p.profile)} live={st === 'working'} />}
                title={<Named person={p.profile} suffix={me ? ' (toi)' : ''} />}
                subtitle={subtitle}
                subtitleColor={color}
                right={right}
              />
            );
          })}
        </Section>

        {isHost && (
          <Button title="Annuler le vainc" variant="destructive" onPress={confirmCancel} style={{ marginTop: 24 }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BackButton() {
  return (
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.navigate('/feed'))} hitSlop={10} style={styles.back}>
      <Ionicons name="chevron-back" size={24} color={colors.accent} />
      <Text style={styles.backText}>Retour</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: 20, paddingBottom: 40 },
  back: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: -6, marginBottom: 8, alignSelf: 'flex-start' },
  backText: { fontSize: 17, color: colors.accent },
  hero: { padding: 20, alignItems: 'center', gap: 6 },
  when: { ...type.headline, color: colors.secondary },
  countdown: { fontSize: 28, fontWeight: '700', color: colors.accent, marginTop: 4 },
  shame: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 12, backgroundColor: colors.dangerSoft },
  shameText: { flex: 1, fontSize: 15, color: colors.text },
  timer: { fontSize: 17, fontWeight: '500', color: colors.success, fontVariant: ['tabular-nums'] },
});
