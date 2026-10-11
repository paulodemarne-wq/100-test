import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { ProgressRing } from '../../components/ProgressRing';
import { useAuth } from '../../lib/auth';
import { pickProfilePhoto } from '../../lib/photo';
import { useSocial } from '../../lib/social';
import { MAX_AWAY_MS, Notice, useLockin, useNow } from '../../lib/store';
import { card, colors, DEFAULT_LABEL, type } from '../../lib/theme';
import { formatDuration, formatTimer } from '../../lib/time';

/** The ring fills up over one focus block, Pomodoro-style. */
const FOCUS_BLOCK_SEC = 25 * 60;

const NOTICE_STYLE: Record<Notice['kind'], { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  abandoned: { bg: colors.dangerSoft, fg: colors.danger, icon: 'close-circle' },
  warning: { bg: colors.warningSoft, fg: colors.warning, icon: 'warning' },
  done: { bg: colors.successSoft, fg: colors.success, icon: 'checkmark-circle' },
  tooShort: { bg: colors.fill, fg: colors.secondary, icon: 'information-circle' },
  error: { bg: colors.warningSoft, fg: colors.warning, icon: 'cloud-offline' },
};

export default function FocusScreen() {
  const { profile, setPhoto, signOut } = useAuth();
  const { myWeekSeconds, myStreak, nudges, markNudgesSeen, mySessions } = useSocial();
  const { active, notice, clearNotice, startSession, stopSession } = useLockin();
  const [label, setLabel] = useState('');

  // The user's last few labels, as one-tap shortcuts.
  const recentLabels = useMemo(() => {
    const seen = new Set<string>();
    for (const s of mySessions) {
      if (s.subject !== DEFAULT_LABEL) seen.add(s.subject);
      if (seen.size === 4) break;
    }
    return [...seen];
  }, [mySessions]);
  const now = useNow();

  const elapsedSec = active ? (now - active.startedAt) / 1000 : 0;
  const blocks = Math.floor(elapsedSec / FOCUS_BLOCK_SEC);
  const ringProgress = active ? (elapsedSec % FOCUS_BLOCK_SEC) / FOCUS_BLOCK_SEC : 0;

  const changePhoto = async (source: 'library' | 'camera' | 'remove') => {
    try {
      if (source === 'remove') return await setPhoto(null);
      const uri = await pickProfilePhoto(source);
      if (uri) await setPhoto(uri);
    } catch (e) {
      Alert.alert('Oups', (e as Error).message);
    }
  };

  const openProfileMenu = () => {
    if (!profile) return;
    Alert.alert(profile.display_name, `@${profile.username}`, [
      { text: 'Prendre une photo', onPress: () => changePhoto('camera') },
      { text: 'Choisir une photo', onPress: () => changePhoto('library') },
      ...(profile.avatar_url ? [{ text: 'Supprimer la photo', onPress: () => changePhoto('remove') }] : []),
      {
        text: 'Se déconnecter',
        style: 'destructive' as const,
        onPress: () => {
          if (active) stopSession();
          signOut();
        },
      },
      { text: 'Annuler', style: 'cancel' as const },
    ]);
  };

  const start = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startSession(label.trim() || DEFAULT_LABEL);
    setLabel('');
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
            <Text style={type.footnote}>Salut {profile?.display_name}</Text>
            <Text style={type.largeTitle}>Focus</Text>
          </View>
          <Pressable onPress={openProfileMenu} hitSlop={8}>
            <Avatar name={profile?.display_name ?? '?'} photoUri={profile?.avatar_url} size={40} live={!!active} />
          </Pressable>
        </View>

        <View style={styles.stats}>
          <Stat icon="time-outline" label="Cette semaine" value={formatDuration(myWeekSeconds)} />
          <Stat icon="flame-outline" label="Série" value={`${myStreak} j`} />
        </View>

        {nudges.length > 0 && (
          <Pressable onPress={markNudgesSeen} style={[styles.notice, { backgroundColor: colors.accentSoft }]}>
            <Avatar name={nudges[0].from.display_name} photoUri={nudges[0].from.avatar_url} size={28} />
            <Text style={styles.noticeText}>
              <Text style={{ fontWeight: '600' }}>{nudges[0].from.display_name}</Text>
              {nudges.length > 1 ? ` et ${nudges.length - 1} autre${nudges.length > 2 ? 's' : ''}` : ''} te
              relance{nudges.length > 1 ? 'nt' : ''} : viens bosser ! 📣
            </Text>
          </Pressable>
        )}

        {notice && (
          <Pressable onPress={clearNotice} style={[styles.notice, { backgroundColor: NOTICE_STYLE[notice.kind].bg }]}>
            <Ionicons name={NOTICE_STYLE[notice.kind].icon} size={20} color={NOTICE_STYLE[notice.kind].fg} />
            <Text style={styles.noticeText}>{notice.message}</Text>
          </Pressable>
        )}

        <View style={styles.center}>
          <ProgressRing size={260} stroke={12} progress={ringProgress}>
            <Text style={styles.ringLabel} numberOfLines={1}>
              {active ? (active.subject === DEFAULT_LABEL ? 'En focus' : active.subject) : 'Prêt ?'}
            </Text>
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
            <View style={styles.labelBox}>
              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder="Sur quoi tu bosses ? (facultatif)"
                placeholderTextColor={colors.tertiary}
                style={styles.labelInput}
                maxLength={30}
                returnKeyType="go"
                onSubmitEditing={start}
              />
              {recentLabels.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.chipsScroll}
                  contentContainerStyle={styles.chips}
                  keyboardShouldPersistTaps="handled"
                >
                  {recentLabels.map((l) => {
                    const selected = l === label.trim();
                    return (
                      <Pressable
                        key={l}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setLabel(selected ? '' : l);
                        }}
                        style={[styles.chip, selected && styles.chipSelected]}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{l}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>
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
  labelBox: { alignSelf: 'stretch', gap: 10 },
  labelInput: {
    ...card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: colors.text,
    textAlign: 'center',
  },
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
