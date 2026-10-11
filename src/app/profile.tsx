import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { DateField } from '../components/DateField';
import { Row, Section } from '../components/List';
import { Button } from '../components/ui';
import { useAuth } from '../lib/auth';
import { syncDailyReminders } from '../lib/notifications';
import { pickProfilePhoto } from '../lib/photo';
import { DEFAULT_REMINDER, loadReminder, ReminderSetting, saveReminder } from '../lib/reminder';
import { useSocial } from '../lib/social';
import * as stats from '../lib/stats';
import { useLockin } from '../lib/store';
import { card, colors, type } from '../lib/theme';
import { dayKey, formatDuration } from '../lib/time';

function Stepper({ value, onChange, min, max, unit }: { value: number; onChange: (v: number) => void; min: number; max: number; unit: string }) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} hitSlop={6} style={styles.stepButton}>
        <Ionicons name="remove" size={18} color={colors.accent} />
      </Pressable>
      <Text style={styles.stepValue}>
        {value} {unit}
      </Text>
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} hitSlop={6} style={styles.stepButton}>
        <Ionicons name="add" size={18} color={colors.accent} />
      </Pressable>
    </View>
  );
}

export default function Profile() {
  const { profile, setPhoto, signOut, updateSettings } = useAuth();
  const { mySessions, myWeekSeconds, myStreak, myStreakInfo, exams, addExam, deleteExam } = useSocial();
  const [reminder, setReminder] = useState<ReminderSetting>(DEFAULT_REMINDER);
  useEffect(() => {
    loadReminder().then(setReminder);
  }, []);
  const updateReminder = (next: ReminderSetting) => {
    setReminder(next);
    saveReminder(next);
    const today = dayKey(new Date());
    const lockedInToday = mySessions.some((s) => s.status === 'done' && dayKey(new Date(s.started_at)) === today);
    syncDailyReminders(next, lockedInToday, myStreak).catch(() => {});
  };
  const { active, stopSession } = useLockin();
  const [examName, setExamName] = useState('');
  const [examDate, setExamDate] = useState(() => new Date(Date.now() + 14 * 86_400_000));
  const [examGoal, setExamGoal] = useState(20);
  const [adding, setAdding] = useState(false);

  const badges = useMemo(
    () => stats.badges(mySessions, profile?.weekly_goal_minutes ?? 0),
    [mySessions, profile?.weekly_goal_minutes],
  );
  const totalSeconds = mySessions.filter((s) => s.status === 'done').reduce((sum, s) => sum + (s.duration_sec ?? 0), 0);
  const fail = (e: unknown) => Alert.alert('Oups', (e as Error).message);

  if (!profile) return null;

  const goalHours = Math.round(profile.weekly_goal_minutes / 60);
  const reminderTime = new Date();
  reminderTime.setHours(reminder.hour, reminder.minute, 0, 0);

  const changePhoto = () => {
    const run = async (source: 'library' | 'camera' | 'remove') => {
      try {
        if (source === 'remove') return await setPhoto(null);
        const uri = await pickProfilePhoto(source);
        if (uri) await setPhoto(uri);
      } catch (e) {
        fail(e);
      }
    };
    Alert.alert('Photo de profil', undefined, [
      { text: 'Prendre une photo', onPress: () => run('camera') },
      { text: 'Choisir dans la galerie', onPress: () => run('library') },
      ...(profile.avatar_url ? [{ text: 'Supprimer la photo', style: 'destructive' as const, onPress: () => run('remove') }] : []),
      { text: 'Annuler', style: 'cancel' as const },
    ]);
  };

  const submitExam = async () => {
    if (!examName.trim()) return Alert.alert('Oups', 'Donne un nom à ton partiel.');
    setAdding(true);
    try {
      await addExam({ name: examName, date: examDate, goalMinutes: examGoal * 60 });
      setExamName('');
    } catch (e) {
      fail(e);
    } finally {
      setAdding(false);
    }
  };

  const confirmSignOut = () =>
    Alert.alert('Se déconnecter ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Se déconnecter',
        style: 'destructive',
        onPress: () => {
          if (active) stopSession();
          signOut();
        },
      },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
          <Text style={styles.backText}>Retour</Text>
        </Pressable>

        <View style={styles.top}>
          <Pressable onPress={changePhoto}>
            <Avatar name={profile.display_name} photoUri={profile.avatar_url} size={96} />
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color={colors.onAccent} />
            </View>
          </Pressable>
          <Text style={[type.title, { marginTop: 12 }]}>{profile.display_name}</Text>
          <Text style={type.subhead}>@{profile.username}</Text>
        </View>

        <View style={styles.stats}>
          {[
            ['Cette semaine', formatDuration(myWeekSeconds)],
            ['Série', `${myStreak} j 🔥`],
            ['Au total', formatDuration(profile.total_seconds ?? totalSeconds)],
          ].map(([label, value]) => (
            <View key={label} style={styles.stat}>
              <Text style={styles.statValue}>{value}</Text>
              <Text style={type.footnote}>{label}</Text>
            </View>
          ))}
        </View>

        <Section
          title="Série"
          footer="Un jour raté par mois est pardonné automatiquement, pour ne pas perdre ta série sur une journée de flemme."
        >
          <Row
            left={<Text style={{ fontSize: 28 }}>🛡️</Text>}
            title={myStreakInfo.jokerAvailable ? 'Joker du mois disponible' : 'Joker du mois utilisé'}
            subtitle={
              myStreakInfo.jokerDays.length
                ? `Il a sauvé ta série le ${myStreakInfo.jokerDays
                    .map((k) => {
                      const [, m, d] = k.split('-');
                      return `${d}/${m}`;
                    })
                    .join(', ')}`
                : 'Pas encore utilisé'
            }
          />
        </Section>

        <Section title="Objectif de la semaine">
          <Row
            title="Heures de lock in"
            subtitle={`${formatDuration(myWeekSeconds)} faites sur ${goalHours} h`}
            right={
              <Stepper
                value={goalHours}
                min={1}
                max={80}
                unit="h"
                onChange={(h) => updateSettings({ weekly_goal_minutes: h * 60 }).catch(fail)}
              />
            }
          />
        </Section>

        <Section title="Mes partiels" footer="Écris le nom du partiel comme sujet de session pour que tes heures comptent. Appui long pour supprimer.">
          {exams.map((x) => {
            const pct = x.goal_minutes > 0 ? Math.min(1, x.doneSeconds / (x.goal_minutes * 60)) : 0;
            return (
              <Pressable
                key={x.id}
                onLongPress={() =>
                  Alert.alert(`Supprimer « ${x.name} » ?`, undefined, [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Supprimer', style: 'destructive', onPress: () => deleteExam(x.id).catch(fail) },
                  ])
                }
                style={styles.exam}
              >
                <View style={styles.examTop}>
                  <Text style={type.headline}>{x.name}</Text>
                  <Text style={[styles.examDays, x.daysLeft <= 3 && { color: colors.danger }]}>
                    {x.daysLeft === 0 ? "aujourd'hui" : x.daysLeft === 1 ? 'demain' : `J-${x.daysLeft}`}
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
                </View>
                <Text style={type.footnote}>
                  {formatDuration(x.doneSeconds)} / {Math.round(x.goal_minutes / 60)} h
                </Text>
              </Pressable>
            );
          })}
        </Section>

        <View style={[card, { marginTop: exams.length ? 12 : 20 }]}>
          <TextInput
            value={examName}
            onChangeText={setExamName}
            placeholder="Nouveau partiel (ex : Compta)"
            placeholderTextColor={colors.tertiary}
            maxLength={30}
            style={styles.examInput}
          />
          <View style={styles.separator} />
          <DateField label="Date" mode="date" value={examDate} onChange={setExamDate} minimumDate={new Date()} />
          <View style={styles.separator} />
          <View style={styles.goalRow}>
            <Text style={type.body}>Objectif</Text>
            <Stepper value={examGoal} min={1} max={200} unit="h" onChange={setExamGoal} />
          </View>
          <View style={{ padding: 12 }}>
            <Button title="Ajouter le partiel" onPress={submitExam} loading={adding} disabled={!examName.trim()} />
          </View>
        </View>

        <Section title={`Badges · ${badges.filter((b) => b.unlocked).length}/${badges.length}`}>
          <View style={styles.badges}>
            {badges.map((b) => (
              <View key={b.id} style={[styles.badge, !b.unlocked && { opacity: 0.35 }]}>
                <Text style={styles.badgeEmoji}>{b.unlocked ? b.emoji : '🔒'}</Text>
                <Text style={styles.badgeName} numberOfLines={1}>
                  {b.name}
                </Text>
                <Text style={styles.badgeDesc} numberOfLines={2}>
                  {b.description}
                </Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Notifications">
          <Row
            title="Rappel quotidien"
            subtitle="Si tu n'as pas encore lock in ce jour-là"
            right={
              <Switch
                value={reminder.enabled}
                onValueChange={(enabled) => updateReminder({ ...reminder, enabled })}
                trackColor={{ true: colors.accent }}
              />
            }
          />
          {reminder.enabled ? (
            <DateField
              label="Heure du rappel"
              mode="time"
              value={reminderTime}
              onChange={(d) => updateReminder({ ...reminder, hour: d.getHours(), minute: d.getMinutes() })}
            />
          ) : null}
          <Row
            title="Quand un pote lock in"
            subtitle="Reçois une notif quand un ami lance une session"
            right={
              <Switch
                value={profile.notify_friend_sessions}
                onValueChange={(v) => updateSettings({ notify_friend_sessions: v }).catch(fail)}
                trackColor={{ true: colors.accent }}
              />
            }
          />
        </Section>

        <Button title="Se déconnecter" variant="destructive" onPress={confirmSignOut} style={{ marginTop: 28 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: 20, paddingBottom: 48 },
  back: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: -6, alignSelf: 'flex-start' },
  backText: { fontSize: 17, color: colors.accent },
  top: { alignItems: 'center', marginTop: 8 },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: { flexDirection: 'row', gap: 10, marginTop: 20 },
  duo: { flexDirection: 'row', gap: 10, marginTop: 20 },
  duoCard: { ...card, flex: 1, padding: 14, gap: 2 },
  stat: { ...card, flex: 1, padding: 12, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.text },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { fontSize: 17, fontWeight: '600', minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] },
  exam: { padding: 14, gap: 8 },
  examTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  examDays: { fontSize: 15, fontWeight: '700', color: colors.accent },
  barTrack: { height: 6, backgroundColor: colors.fill, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.accent, borderRadius: 3 },
  examInput: { fontSize: 17, color: colors.text, paddingHorizontal: 16, paddingVertical: 15 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 16 },
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  badge: { width: '33.33%', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, gap: 2 },
  badgeEmoji: { fontSize: 34 },
  badgeName: { fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' },
  badgeDesc: { fontSize: 11, color: colors.secondary, textAlign: 'center' },
});
