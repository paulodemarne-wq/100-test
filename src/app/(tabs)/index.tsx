import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { PauseSheet } from '../../components/PauseSheet';
import { ProgressRing } from '../../components/ProgressRing';
import { PetView } from '../../components/PetView';
import { themeOf, useChronoPrefs } from '../../lib/chronoPrefs';
import { isPremium as hasPlus } from '../../lib/premium';
import { TodoItem } from '../../components/TodoItem';
import { useAuth } from '../../lib/auth';
import { countdown } from '../../lib/labels';
import { useSocial } from '../../lib/social';
import { formFor, levelFor, PLAN_EMOJI, speciesById, tierFor } from '../../creatures/species';
import { focusSeconds, MAX_AWAY_MS, Notice, todoSplitAt, useLockin, useNow } from '../../lib/store';
import { isFinished, sortTodos } from '../../lib/todos';
import { countdown as examCountdown, planExam } from '../../lib/exams';
import { card, colors, DEFAULT_LABEL, type } from '../../lib/theme';
import { formatDuration, formatTimer, startOfWeek } from '../../lib/time';
import { decorationOf } from '../../lib/premium';
import { Named } from '../../components/Badge';
import { SubscribeBar } from '../../components/SubscribeBar';

/** The ring fills up over one focus block, Pomodoro-style. */
const FOCUS_BLOCK_SEC = 25 * 60;

const NOTICE_STYLE: Record<Notice['kind'], { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  abandoned: { bg: colors.dangerSoft, fg: colors.danger, icon: 'close-circle' },
  warning: { bg: colors.warningSoft, fg: colors.warning, icon: 'warning' },
  done: { bg: colors.successSoft, fg: colors.success, icon: 'checkmark-circle' },
  tooShort: { bg: colors.fill, fg: colors.secondary, icon: 'information-circle' },
  error: { bg: colors.warningSoft, fg: colors.warning, icon: 'cloud-offline' },
  pause: { bg: colors.accentSoft, fg: colors.accent, icon: 'cafe' },
};

export default function FocusScreen() {
  const { profile } = useAuth();
  const { myWeekSeconds, myStreak, nudges, markNudgesSeen, mySessions, exams, examInvites, events, pets, todos } = useSocial();
  const { active, notice, clearNotice, startSession, stopSession, startPause, endPause, switchTodo } = useLockin();
  const [label, setLabel] = useState('');
  const [todoId, setTodoId] = useState<string | null>(null);
  // The 4 nearest unfinished to-dos, to pick one before locking in.
  const nextTodos = useMemo(() => sortTodos(todos).filter((t) => !isFinished(t)).slice(0, 4), [todos]);
  const chosenTodo = nextTodos.find((t) => t.id === todoId) ?? null;
  const [pauseSheet, setPauseSheet] = useState(false);
  const pet = pets[0];
  // Lockin+: timer theme, animated background, the pet next to the timer and how it reacts.
  const plus = hasPlus(profile);
  const chrono = useChronoPrefs();
  const theme = themeOf(plus ? chrono.theme : 'classic');
  const [mood, setMood] = useState<'party' | 'sad' | null>(null);
  useEffect(() => {
    if (!notice || (notice.kind !== 'done' && notice.kind !== 'abandoned')) return;
    setMood(notice.kind === 'done' ? 'party' : 'sad');
    const t = setTimeout(() => setMood(null), notice.kind === 'done' ? 6000 : 9000);
    return () => clearTimeout(t);
  }, [notice]);
  // Finishing a to-do is a party too.
  const finishedTodos = todos.filter(isFinished).length;
  const lastFinished = useRef(finishedTodos);
  useEffect(() => {
    if (finishedTodos > lastFinished.current) {
      setMood('party');
      const t = setTimeout(() => setMood(null), 6000);
      lastFinished.current = finishedTodos;
      return () => clearTimeout(t);
    }
    lastFinished.current = finishedTodos;
  }, [finishedTodos]);
  const showPet = plus && chrono.pet && !!pet && (!!active || mood !== null);
  const petSpecies = speciesById(pet?.species);
  const petLevel = pet ? levelFor(pet.xp_seconds) : 0;
  const petTier = pet ? tierFor(petLevel) : null;

  // Upcoming exams first, then the user's last few labels, as one-tap shortcuts.
  const recentLabels = useMemo(() => {
    const seen = new Set<string>(exams.map((x) => x.name));
    for (const s of mySessions) {
      if (seen.size >= exams.length + 4) break;
      if (s.subject !== DEFAULT_LABEL && !s.event_id) seen.add(s.subject);
    }
    return [...seen];
  }, [mySessions, exams]);
  const now = useNow();

  const goalSeconds = (profile?.weekly_goal_minutes ?? 0) * 60;
  const nextExam = exams[0];
  const nextPlan = useMemo(() => (nextExam ? planExam(nextExam, mySessions) : null), [nextExam, mySessions]);
  // A group lock-in I'm going to that starts within 10 minutes or is running.
  const liveEvent = events.find(
    (e) => e.myRsvp === 'going' && now >= e.startsAt - 10 * 60_000 && now < e.startsAt + 3 * 3_600_000,
  );
  // Fewer pixels for the ring when banners take up room.
  const banners = [nudges.length > 0, !!notice, !!nextExam && !active, !!liveEvent].filter(Boolean).length >= 2;

  const elapsedSec = active ? focusSeconds(active, now) : 0;
  // The week total moves with the lock-in in progress (it is saved for good at the end).
  const weekLive = myWeekSeconds + (active && active.startedAt >= startOfWeek(new Date(now)) ? elapsedSec : 0);
  const blocks = Math.floor(elapsedSec / FOCUS_BLOCK_SEC);
  const pause = active?.pause ?? null;
  const pauseLeftSec = pause ? Math.max(0, (pause.until - now) / 1000) : 0;
  const ringProgress = pause
    ? pauseLeftSec / ((pause.until - pause.startedAt) / 1000)
    : active
      ? (elapsedSec % FOCUS_BLOCK_SEC) / FOCUS_BLOCK_SEC
      : 0;

  // During the lock-in: every unfinished to-do (and any already worked on), tap one to send the time to it.
  const split = active ? todoSplitAt(active, now) : {};
  const liveTodos = active ? sortTodos(todos).filter((t) => !isFinished(t) || t.id in split) : [];
  const pickLive = (id: string, title: string) => {
    if (!active) return;
    Haptics.selectionAsync();
    const current = todos.find((t) => t.id === active.todoId);
    // The ring shows the to-do's name, unless a label was typed by hand.
    const keepLabel = active.subject !== DEFAULT_LABEL && active.subject !== current?.title.slice(0, 30);
    const next = active.todoId === id ? null : id;
    switchTodo(next, keepLabel ? undefined : next ? title.slice(0, 30) : DEFAULT_LABEL);
  };

  const start = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startSession(label.trim() || chosenTodo?.title.slice(0, 30) || DEFAULT_LABEL, null, [], chosenTodo?.id ?? null);
    setLabel('');
    setTodoId(null);
  };

  const confirmStop = () => {
    Alert.alert('Terminer la session ?', 'Ton temps sera ajouté à ta semaine.', [
      { text: 'Je continue', style: 'cancel' },
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
      {plus && active && !active.pause && <Blobs colors={theme.blobs} />}
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={type.footnote}>
              {active ? 'Téléphone posé. Tes potes te regardent 👀' : `Prêt à lock in, ${profile?.display_name} ?`}
            </Text>
            <View style={styles.titleRow}>
              <Text style={type.largeTitle}>Focus</Text>
              {pet && (
                <Pressable onPress={() => router.navigate('/pet')} hitSlop={8} style={styles.locky}>
                  <Text style={{ fontSize: 22 }}>{petSpecies && formFor(petLevel) > 0 ? PLAN_EMOJI[petSpecies.line[formFor(petLevel) - 1]] : '🥚'}</Text>
                  {petTier && <Text style={[styles.lockyStage, { color: petTier.color }]}>Niv. {petLevel}</Text>}
                </Pressable>
              )}
            </View>
          </View>
          <Pressable onPress={() => router.push('/profile')} hitSlop={8}>
            <Avatar name={profile?.display_name ?? '?'} photoUri={profile?.avatar_url} decoration={decorationOf(profile)} size={40} live={!!active} />
          </Pressable>
        </View>

        <View style={styles.stats}>
          <Stat
            icon="time-outline"
            label={goalSeconds > 0 ? `sur ${formatDuration(goalSeconds)} cette semaine` : 'Cette semaine'}
            value={formatDuration(weekLive)}
            progress={goalSeconds > 0 ? weekLive / goalSeconds : undefined}
            onPress={() => router.push('/profile')}
          />
          <Stat icon="flame-outline" label="Série" value={`${myStreak} j`} onPress={() => router.push('/profile')} />
        </View>

        {!active && <SubscribeBar />}

        {(nextPlan || examInvites.length > 0) && !active && (
          <Pressable
            onPress={() => router.push('/exams')}
            style={[styles.notice, { backgroundColor: nextPlan && nextPlan.behind >= 3600 ? colors.warningSoft : colors.card }]}
          >
            <Text style={styles.countdown}>{nextPlan ? examCountdown(nextPlan.exam.daysLeft).toUpperCase() : '📚'}</Text>
            <Text style={styles.noticeText}>
              {nextPlan ? (
                <>
                  <Text style={{ fontWeight: '700' }}>{nextPlan.exam.name}</Text>
                  {nextPlan.leftTotal === 0
                    ? ' · objectif atteint 🎉'
                    : nextPlan.leftToday < 60
                      ? " · objectif du jour fait ✓"
                      : ` · encore ${formatDuration(nextPlan.leftToday)} aujourd'hui`}
                  {nextPlan.behind >= 3600 ? `\n⚠️ ${formatDuration(nextPlan.behind)} de retard` : ''}
                </>
              ) : (
                `${examInvites.length} invitation${examInvites.length > 1 ? 's' : ''} à réviser un partiel`
              )}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.tertiary} />
          </Pressable>
        )}

        {liveEvent && active?.eventId !== liveEvent.id && (
          <Pressable
            onPress={() => router.push({ pathname: '/event/[id]', params: { id: liveEvent.id } })}
            style={[styles.notice, { backgroundColor: colors.accent }]}
          >
            <Ionicons name="people" size={20} color={colors.onAccent} />
            <Text style={[styles.noticeText, { color: colors.onAccent }]}>
              Lock in de groupe « {liveEvent.title} » {now < liveEvent.startsAt ? countdown(liveEvent.startsAt, now) : 'en cours'} →
            </Text>
          </Pressable>
        )}

        {nudges.length > 0 && (
          <Pressable onPress={markNudgesSeen} style={[styles.notice, { backgroundColor: colors.accentSoft }]}>
            <Avatar name={nudges[0].from.display_name} photoUri={nudges[0].from.avatar_url} decoration={decorationOf(nudges[0].from)} size={28} />
            <Text style={styles.noticeText}>
              <Text style={{ fontWeight: '600' }}><Named person={nudges[0].from} /></Text>
              {nudges.length > 1 ? ` et ${nudges.length - 1} autre${nudges.length > 2 ? 's' : ''}` : ''}{' '}
              {nudges.length > 1 ? "t'attendent" : "t'attend"}. Lock in. 📣
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
          <ProgressRing size={banners ? 220 : 260} stroke={12} progress={ringProgress} colors={plus ? theme.ring : undefined}>
            <Text style={styles.ringLabel} numberOfLines={1}>
              {pause ? 'En pause ☕' : active ? (active.subject === DEFAULT_LABEL ? 'En lock in' : active.subject) : 'Prêt ?'}
            </Text>
            <Text style={[styles.timer, pause && { color: colors.accent }]}>
              {formatTimer(pause ? pauseLeftSec : elapsedSec)}
            </Text>
            {pause && <Text style={styles.ringLabel}>{formatTimer(elapsedSec)} de lock in</Text>}
            {active && !pause && blocks > 0 && (
              <Text style={styles.ringLabel}>
                {blocks} bloc{blocks > 1 ? 's' : ''} de 25 min
              </Text>
            )}
          </ProgressRing>
          {showPet && pet && (
            <View style={styles.chronoPet} pointerEvents="none">
              <PetView species={pet.species} level={petLevel} equipped={pet.equipped} interactive={false} mood={mood ?? (active?.pause ? 'sleep' : null)} style={{ flex: 1 }} />
              {mood && <Text style={styles.moodText}>{mood === 'party' ? 'Trop fier de toi ! 🎉' : 'Pfff… 😤'}</Text>}
            </View>
          )}

          {active ? (
            <>
              {!pause && Platform.OS !== 'web' && <KeepAwake />}
              <Text style={styles.hint}>
                {pause
                  ? "Tu peux quitter l'app. Reviens avant la fin de la pause, on te prévient 1 min avant ⏰"
                  : `Reste sur Lockin. Plus de ${MAX_AWAY_MS / 1000} s dehors et c'est l'abandon 💀`}
              </Text>
              <View style={styles.todoBox}>
                <View style={styles.todoHeader}>
                  <Text style={styles.todoTitle}>📝 Tu bosses sur quoi ?</Text>
                  <Pressable onPress={() => router.navigate({ pathname: '/todos', params: { new: '1' } })} hitSlop={8}>
                    <Text style={styles.todoLink}>+ Nouvelle</Text>
                  </Pressable>
                </View>
                {liveTodos.length > 0 ? (
                  <>
                    <Text style={type.footnote}>Touche une to-do : le chrono remplit ses heures. Tu peux changer quand tu veux.</Text>
                    {liveTodos.map((t) => (
                      <TodoItem
                        key={t.id}
                        todo={t}
                        liveSeconds={split[t.id] ?? 0}
                        selected={t.id === active.todoId}
                        onPress={() => pickLive(t.id, t.title)}
                      />
                    ))}
                  </>
                ) : (
                  <Text style={type.footnote}>Pas de to-do. Crée-en une (ex : Maths, 4 h) et touche-la pour que ton temps aille dessus.</Text>
                )}
              </View>
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
              <View style={styles.todoBox}>
                <View style={styles.todoHeader}>
                  <Text style={styles.todoTitle}>📝 Mes to-do</Text>
                  <Pressable onPress={() => router.navigate('/todos')} hitSlop={8}>
                    <Text style={styles.todoLink}>{nextTodos.length ? 'Tout voir' : ''}</Text>
                  </Pressable>
                </View>
                {nextTodos.length > 0 ? (
                  <>
                    <Text style={type.footnote}>Choisis sur quoi tu lock in : ton temps s'ajoutera à sa barre.</Text>
                    {nextTodos.map((t) => (
                      <TodoItem
                        key={t.id}
                        todo={t}
                        selected={t.id === todoId}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setTodoId(t.id === todoId ? null : t.id);
                        }}
                      />
                    ))}
                  </>
                ) : (
                  <Text style={type.footnote}>Crée une to-do avec le temps de travail et la date : tu la choisis ici avant de lock in.</Text>
                )}
                <Pressable onPress={() => router.navigate({ pathname: '/todos', params: { new: '1' } })} style={styles.todoAdd}>
                  <Ionicons name="add" size={20} color={colors.accent} />
                  <Text style={styles.todoLink}>Nouvelle to-do</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

      </ScrollView>
      {/* Always on screen: no need to scroll to lock in. */}
      <View style={styles.footer}>
        {active ? (
          <View style={styles.buttonRow}>
            <Pressable
              onPress={() => (pause ? endPause() : setPauseSheet(true))}
              style={({ pressed }) => [styles.button, styles.pauseButton, pressed && styles.pressed]}
            >
              <Ionicons name={pause ? 'play' : 'cafe'} size={18} color={colors.accent} />
              <Text style={[styles.buttonText, { color: colors.accent }]}>{pause ? 'Reprendre' : 'Pause'}</Text>
            </Pressable>
            <Pressable
              onPress={confirmStop}
              style={({ pressed }) => [styles.button, styles.stopButton, { flex: 1 }, pressed && styles.pressed]}
            >
              <Text style={[styles.buttonText, { color: colors.danger }]}>J'ai fini</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={start} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Ionicons name="lock-closed" size={18} color={colors.onAccent} />
            <Text style={styles.buttonText}>Lock in</Text>
          </Pressable>
        )}
      </View>
      <PauseSheet
        visible={pauseSheet}
        onClose={() => setPauseSheet(false)}
        onStart={(minutes) => {
          setPauseSheet(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          startPause(minutes);
        }}
      />
    </SafeAreaView>
  );
}

/** Lockin+: soft colored circles drifting slowly behind the timer. */
function Blobs({ colors: tint }: { colors: [string, string, string] }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  const move = (dx: number, dy: number) => [
    { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
    { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
  ];
  return (
    <View pointerEvents="none" style={styles.blobs}>
      <Animated.View style={[styles.blob, { backgroundColor: tint[0], top: 80, left: -80, transform: move(120, 60) }]} />
      <Animated.View style={[styles.blob, { backgroundColor: tint[1], top: 300, right: -90, transform: move(-100, -80) }]} />
      <Animated.View style={[styles.blob, { backgroundColor: tint[2], bottom: 40, left: 20, transform: move(80, -120) }]} />
    </View>
  );
}

/** Keeps the screen on during a session: locking the phone would count as leaving the app. */
function KeepAwake() {
  useKeepAwake();
  return null;
}

type StatProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  /** 0..1, shows a progress bar under the value. */
  progress?: number;
  onPress?: () => void;
};

function Stat({ icon, label, value, progress, onPress }: StatProps) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.stat}>
      <Ionicons name={icon} size={18} color={progress !== undefined && progress >= 1 ? colors.success : colors.accent} />
      <Text style={styles.statValue}>{value}</Text>
      {progress !== undefined && (
        <View style={styles.goalTrack}>
          <View
            style={[
              styles.goalFill,
              { width: `${Math.min(1, progress) * 100}%` },
              progress >= 1 && { backgroundColor: colors.success },
            ]}
          />
        </View>
      )}
      <Text style={type.footnote}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  todoBox: { ...card, alignSelf: 'stretch', padding: 12, gap: 6 },
  todoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todoTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  todoLink: { fontSize: 15, fontWeight: '600', color: colors.accent },
  todoAdd: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  safe: { flex: 1, backgroundColor: colors.bg },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  container: { paddingHorizontal: 20, paddingBottom: 24, gap: 16, flexGrow: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { ...card, flex: 1, padding: 16, gap: 4 },
  goalTrack: { height: 4, backgroundColor: colors.fill, borderRadius: 2, overflow: 'hidden', marginVertical: 2 },
  goalFill: { height: 4, backgroundColor: colors.accent, borderRadius: 2 },
  statValue: { fontSize: 24, fontWeight: '700', color: colors.text, marginTop: 6, fontVariant: ['tabular-nums'] },
  countdown: { fontSize: 17, fontWeight: '900', color: colors.accent, minWidth: 44, textAlign: 'center' },
  blobs: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  blob: { position: 'absolute', width: 300, height: 300, borderRadius: 150, opacity: 0.16 },
  chronoPet: { position: 'absolute', right: -6, top: 150, width: 120, height: 140, alignItems: 'center' },
  moodText: { position: 'absolute', bottom: -6, fontSize: 12, fontWeight: '800', color: colors.text, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
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
  pauseButton: { backgroundColor: colors.accentSoft, paddingHorizontal: 22 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locky: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  lockyStage: { fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  buttonText: { color: colors.onAccent, fontSize: 17, fontWeight: '600' },
});
