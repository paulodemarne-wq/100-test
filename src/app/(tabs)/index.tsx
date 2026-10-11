import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { ProgressRing } from '../../components/ProgressRing';
import { askProfilePhoto } from '../../lib/photo';
import { MAX_AWAY_MS, Notice, useLockin, useNow } from '../../lib/store';
import { card, colors, SUBJECTS, type } from '../../lib/theme';
import { formatDuration, formatTimer } from '../../lib/time';

/** The ring fills up over one focus block, Pomodoro-style. */
const FOCUS_BLOCK_SEC = 25 * 60;

const NOTICE_STYLE: Record<Notice['kind'], { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  abandoned: { bg: colors.dangerSoft, fg: colors.danger, icon: 'close-circle' },
  warning: { bg: colors.warningSoft, fg: colors.warning, icon: 'warning' },
  done: { bg: colors.successSoft, fg: colors.success, icon: 'checkmark-circle' },
  tooShort: { bg: colors.fill, fg: colors.secondary, icon: 'information-circle' },
};

export default function FocusScreen() {
  const { profile, setProfile, active, notice, clearNotice, startSession, stopSession, weekSeconds, streak } =
    useLockin();
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const now = useNow();

  const elapsedSec = active ? (now - active.startedAt) / 1000 : 0;
  const blocks = Math.floor(elapsedSec / FOCUS_BLOCK_SEC);
  const ringProgress = active ? (elapsedSec % FOCUS_BLOCK_SEC) / FOCUS_BLOCK_SEC : 0;

  const editPhoto = () => {
    if (!profile) return;
    askProfilePhoto(
      (photoUri) => setProfile({ ...profile, photoUri }),
      profile.photoUri ? () => setProfile({ ...profile, photoUri: null }) : undefined,
    );
  };

  const start = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startSession(subject);
  };

  const confirmStop = () => {
    Alert.alert('Terminer la session ?', 'Ton temps sera ajouté à ton total de la semaine.', [
      { text: 'Continuer', style: 'cancel' },
      {
        text: 'Terminer',
        style: 'destructive',
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
          <View>
            <Text style={type.footnote}>Salut {profile?.name}</Text>
            <Text style={type.largeTitle}>Focus</Text>
          </View>
          <Pressable onPress={editPhoto} hitSlop={8}>
            <Avatar name={profile?.name ?? '?'} photoUri={profile?.photoUri} size={40} live={!!active} />
          </Pressable>
        </View>

        <View style={styles.stats}>
          <Stat icon="time-outline" label="Cette semaine" value={formatDuration(weekSeconds)} />
          <Stat icon="flame-outline" label="Série" value={`${streak} j`} />
        </View>

        {notice && (
          <Pressable onPress={clearNotice} style={[styles.notice, { backgroundColor: NOTICE_STYLE[notice.kind].bg }]}>
            <Ionicons name={NOTICE_STYLE[notice.kind].icon} size={20} color={NOTICE_STYLE[notice.kind].fg} />
            <Text style={styles.noticeText}>{notice.message}</Text>
          </Pressable>
        )}

        <View style={styles.center}>
          <ProgressRing size={260} stroke={12} progress={ringProgress}>
            <Text style={styles.ringLabel}>{active ? active.subject : 'Prêt ?'}</Text>
            <Text style={styles.timer}>{formatTimer(elapsedSec)}</Text>
            {active && blocks > 0 && (
              <Text style={styles.ringLabel}>
                {blocks} bloc{blocks > 1 ? 's' : ''} de 25 min
              </Text>
            )}
          </ProgressRing>

          {active ? (
            <>
              <KeepAwake />
              <Text style={styles.hint}>
                Reste sur Lockin. Au-delà de {MAX_AWAY_MS / 1000} s hors de l'app, la session est perdue.
              </Text>
            </>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chips}
            >
              {SUBJECTS.map((s) => {
                const selected = s === subject;
                return (
                  <Pressable
                    key={s}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSubject(s);
                    }}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{s}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        {active ? (
          <Pressable onPress={confirmStop} style={({ pressed }) => [styles.button, styles.stopButton, pressed && styles.pressed]}>
            <Text style={[styles.buttonText, { color: colors.danger }]}>Terminer</Text>
          </Pressable>
        ) : (
          <Pressable onPress={start} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Ionicons name="lock-closed" size={18} color={colors.onAccent} />
            <Text style={styles.buttonText}>Commencer</Text>
          </Pressable>
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

function Stat({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={type.footnote}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: 20, paddingBottom: 24, gap: 16, flexGrow: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { ...card, flex: 1, padding: 16, gap: 4 },
  statValue: { fontSize: 24, fontWeight: '700', color: colors.text, marginTop: 6, fontVariant: ['tabular-nums'] },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 14 },
  noticeText: { flex: 1, fontSize: 15, color: colors.text, lineHeight: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingVertical: 16 },
  ringLabel: { ...type.subhead, fontWeight: '500' },
  timer: { fontSize: 56, fontWeight: '200', color: colors.text, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  hint: { ...type.footnote, textAlign: 'center', paddingHorizontal: 24, lineHeight: 18 },
  chipsScroll: { flexGrow: 0, alignSelf: 'stretch', marginHorizontal: -20 },
  chips: { gap: 8, paddingHorizontal: 20, alignItems: 'center' },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.card },
  chipSelected: { backgroundColor: colors.text },
  chipText: { fontSize: 15, fontWeight: '500', color: colors.text },
  chipTextSelected: { color: colors.card },
  button: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: { backgroundColor: colors.card },
  pressed: { opacity: 0.85 },
  buttonText: { color: colors.onAccent, fontSize: 17, fontWeight: '600' },
});
