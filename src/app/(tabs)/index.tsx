import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MAX_AWAY_MS, Notice, useLockin, useNow } from '../../lib/store';
import { colors, SUBJECTS } from '../../lib/theme';
import { formatDuration, formatTimer } from '../../lib/time';

const NOTICE_COLORS: Record<Notice['kind'], string> = {
  abandoned: colors.danger,
  warning: colors.warning,
  done: colors.accent,
  tooShort: colors.muted,
};

export default function WorkScreen() {
  const { profile, active, notice, clearNotice, startSession, stopSession, weekSeconds, streak } = useLockin();
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const now = useNow();

  const start = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    startSession(subject);
  };

  const confirmStop = () => {
    Alert.alert('Terminer la session ?', 'Ton temps sera ajouté à ton total de la semaine.', [
      { text: 'Continuer à bosser', style: 'cancel' },
      {
        text: 'Terminer',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          stopSession();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.hello}>
            Salut {profile?.name} {profile?.emoji}
          </Text>
          <View style={styles.stats}>
            <Stat label="Cette semaine" value={formatDuration(weekSeconds)} />
            <Stat label="Série" value={`${streak} 🔥`} />
          </View>
        </View>

        {notice && (
          <Pressable onPress={clearNotice} style={[styles.notice, { borderColor: NOTICE_COLORS[notice.kind] }]}>
            <Text style={styles.noticeText}>{notice.message}</Text>
          </Pressable>
        )}

        {active ? (
          <View style={styles.center}>
            <KeepAwake />
            <Text style={styles.liveBadge}>🟢 EN TRAIN DE BOSSER · {active.subject.toUpperCase()}</Text>
            <Text style={styles.timer}>{formatTimer((now - active.startedAt) / 1000)}</Text>
            <Text style={styles.hint}>
              Ne quitte pas l'app ! Au-delà de {MAX_AWAY_MS / 1000} s dehors, la session est perdue et tes amis le
              verront.
            </Text>
            <Pressable onPress={confirmStop} style={[styles.bigButton, styles.stopButton]}>
              <Text style={[styles.bigButtonText, { color: colors.text }]}>Terminer</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.center}>
            <Text style={styles.sectionTitle}>Tu bosses sur quoi ?</Text>
            <View style={styles.chips}>
              {SUBJECTS.map((s) => (
                <Pressable key={s} onPress={() => setSubject(s)} style={[styles.chip, s === subject && styles.chipSelected]}>
                  <Text style={[styles.chipText, s === subject && { color: colors.accentText }]}>{s}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={start} style={({ pressed }) => [styles.bigButton, pressed && { transform: [{ scale: 0.97 }] }]}>
              <Text style={styles.bigButtonText}>🔒 Je bosse</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Keeps the screen on during a session: locking the phone would count as leaving the app. */
function KeepAwake() {
  useKeepAwake();
  return null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, gap: 24, flexGrow: 1 },
  header: { gap: 16 },
  hello: { color: colors.text, fontSize: 28, fontWeight: '800' },
  stats: { flexDirection: 'row', gap: 12 },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  statLabel: { color: colors.muted, fontSize: 13, marginTop: 4 },
  notice: { backgroundColor: colors.card, borderWidth: 1, borderRadius: 14, padding: 14 },
  noticeText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '600' },
  bigButton: {
    backgroundColor: colors.accent,
    width: 220,
    height: 220,
    borderRadius: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  stopButton: { backgroundColor: colors.card, borderColor: colors.danger, borderWidth: 2, width: 180, height: 64 },
  bigButtonText: { color: colors.accentText, fontSize: 26, fontWeight: '900' },
  liveBadge: { color: colors.accent, fontWeight: '800', letterSpacing: 1 },
  timer: { color: colors.text, fontSize: 72, fontWeight: '900', fontVariant: ['tabular-nums'] },
  hint: { color: colors.muted, textAlign: 'center', fontSize: 15, lineHeight: 21, paddingHorizontal: 12 },
});
