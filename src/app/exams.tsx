import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { DateField } from '../components/DateField';
import { Stepper } from '../components/Stepper';
import { Button } from '../components/ui';
import { countdown, ExamPlan, PACE_TEXT, planExam, weekPlan } from '../lib/exams';
import { Exam, useSocial } from '../lib/social';
import { useVainc } from '../lib/store';
import { errorMessage, supabase } from '../lib/supabase';
import { card, colors, type } from '../lib/theme';
import { formatDuration } from '../lib/time';

const dayName = (d: Date, i: number) => (i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' }));
const examDay = (x: Exam) => new Date(`${x.exam_date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

/** Mode partiels: countdown, hours to do per day, today's goal, week plan, delay alerts, revising with friends. */
export default function Exams() {
  const { exams, examInvites, mySessions, friends, addExam, deleteExam, inviteToExam, answerExam } = useSocial();
  const { active, startSession } = useVainc();
  const plans = useMemo(() => exams.map((x) => planExam(x, mySessions)), [exams, mySessions]);
  const week = useMemo(() => weekPlan(plans), [plans]);
  const next = plans[0];

  const [name, setName] = useState('');
  const [date, setDate] = useState(() => new Date(Date.now() + 14 * 86_400_000));
  const [goal, setGoal] = useState(20);
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [ranking, setRanking] = useState<{ examId: string; rows: { user_id: string; display_name: string; avatar_url: string | null; seconds: number }[] } | null>(null);
  const fail = (e: unknown) => Alert.alert('Oups', errorMessage(e));

  const vainc = (x: Exam) => {
    if (active) return Alert.alert('Déjà en vainc', 'Termine ta session en cours d’abord.');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startSession(x.name);
    router.navigate('/');
  };
  const submit = async () => {
    if (!name.trim()) return Alert.alert('Oups', 'Donne un nom à ton partiel (ex : Compta).');
    setAdding(true);
    try {
      await addExam({ name, date, goalMinutes: goal * 60 });
      setName('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      fail(e);
    } finally {
      setAdding(false);
    }
  };
  const showRanking = async (x: Exam) => {
    if (ranking?.examId === x.id) return setRanking(null);
    const { data, error } = await supabase.rpc('exam_ranking', { exam: x.id });
    if (error) return fail(error);
    setRanking({ examId: x.id, rows: (data ?? []) as NonNullable<typeof ranking>['rows'] });
  };
  const invite = async (x: Exam, friendId: string) => {
    try {
      await inviteToExam(x.id, friendId);
      Haptics.selectionAsync();
      setInvited((s) => new Set(s).add(`${x.id}:${friendId}`));
    } catch (e) {
      fail(e);
    }
  };
  const remove = (x: Exam) =>
    Alert.alert(x.owner ? `Supprimer « ${x.name} » ?` : `Quitter « ${x.name} » ?`, x.owner ? 'Pour toi et tous ceux qui l’ont rejoint.' : undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: x.owner ? 'Supprimer' : 'Quitter', style: 'destructive', onPress: () => (x.owner ? deleteExam(x.id) : answerExam(x.id, false)).catch(fail) },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={type.title}>Mode partiels 🎓</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close} accessibilityLabel="Fermer">
          <Ionicons name="close" size={20} color={colors.secondary} />
        </Pressable>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {examInvites.map((x) => (
            <View key={x.id} style={[card, styles.invite]}>
              <Ionicons name="people" size={22} color={colors.accent} />
              <Text style={[type.body, { flex: 1 }]}>
                <Text style={{ fontWeight: '700' }}>{x.invitedBy?.display_name ?? 'Un pote'}</Text> t'invite à réviser{' '}
                <Text style={{ fontWeight: '700' }}>{x.name}</Text> ({countdown(x.daysLeft)})
              </Text>
              <Pressable onPress={() => answerExam(x.id, true).catch(fail)} style={styles.smallButton}>
                <Text style={styles.smallButtonText}>Rejoindre</Text>
              </Pressable>
              <Pressable onPress={() => answerExam(x.id, false).catch(fail)} hitSlop={8} accessibilityLabel="Refuser">
                <Ionicons name="close" size={20} color={colors.secondary} />
              </Pressable>
            </View>
          ))}

          {next && <Hero plan={next} onVainc={() => vainc(next.exam)} />}

          {plans.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>PLANNING DE LA SEMAINE</Text>
              <View style={[card, styles.week]}>
                {week.map((d, i) => (
                  <View key={i} style={[styles.weekRow, i > 0 && styles.weekBorder]}>
                    <Text style={[styles.weekDay, i === 0 && { color: colors.accent }]}>{dayName(d.date, i)}</Text>
                    <View style={styles.weekParts}>
                      {d.parts.length === 0 ? (
                        <Text style={type.footnote}>Repos 😌</Text>
                      ) : (
                        d.parts.map((p) => (
                          <View key={p.name} style={styles.part}>
                            <Text style={styles.partText}>
                              {p.name} · {formatDuration(p.seconds)}
                            </Text>
                          </View>
                        ))
                      )}
                    </View>
                    <Text style={styles.weekTotal}>{d.total ? formatDuration(d.total) : ''}</Text>
                  </View>
                ))}
              </View>
              <Text style={type.footnote}>Le planning se recalcule tout seul : si tu prends du retard, les jours suivants augmentent.</Text>
            </>
          )}

          {plans.length > 0 && <Text style={styles.sectionTitle}>MES PARTIELS</Text>}
          {plans.map((p) => {
            const x = p.exam;
            const pct = x.goal_minutes > 0 ? Math.min(1, x.doneSeconds / (x.goal_minutes * 60)) : 0;
            const late = p.pace === 'late' || p.pace === 'hard';
            return (
              <View key={x.id} style={[card, styles.exam]}>
                <View style={styles.examTop}>
                  <Text style={[type.headline, { flex: 1 }]} numberOfLines={1}>
                    {x.name}
                    {!x.owner && <Text style={type.footnote}>  · avec des potes</Text>}
                  </Text>
                  <Text style={[styles.days, x.daysLeft <= 3 && { color: colors.danger }]}>{countdown(x.daysLeft)}</Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${pct * 100}%` }, late && { backgroundColor: colors.warning }]} />
                </View>
                <Text style={type.footnote}>
                  {formatDuration(x.doneSeconds)} / {Math.round(x.goal_minutes / 60)} h · ≈ {formatDuration(p.perDay)} par jour · {examDay(x)}
                </Text>
                <Text style={[styles.pace, late && { color: p.pace === 'late' ? colors.danger : colors.warning }]}>
                  {p.behind >= 3600 ? `⚠️ ${formatDuration(p.behind)} de retard. ` : ''}
                  {PACE_TEXT[p.pace]}
                </Text>
                <View style={styles.actions}>
                  <Pressable onPress={() => vainc(x)} style={styles.smallButton}>
                    <Ionicons name="lock-closed" size={13} color={colors.onAccent} />
                    <Text style={styles.smallButtonText}>vainc</Text>
                  </Pressable>
                  <Pressable onPress={() => setInviting(inviting === x.id ? null : x.id)} style={styles.ghostButton}>
                    <Ionicons name="person-add" size={13} color={colors.accent} />
                    <Text style={styles.ghostText}>Inviter</Text>
                  </Pressable>
                  <Pressable onPress={() => showRanking(x)} style={styles.ghostButton}>
                    <Ionicons name="trophy" size={13} color={colors.accent} />
                    <Text style={styles.ghostText}>Classement</Text>
                  </Pressable>
                  <Pressable onPress={() => remove(x)} hitSlop={8} style={{ marginLeft: 'auto' }} accessibilityLabel={x.owner ? 'Supprimer' : 'Quitter'}>
                    <Ionicons name={x.owner ? 'trash-outline' : 'exit-outline'} size={18} color={colors.secondary} />
                  </Pressable>
                </View>
                {inviting === x.id && (
                  <View style={styles.sub}>
                    {friends.length === 0 && <Text style={type.footnote}>Ajoute des amis pour réviser ensemble.</Text>}
                    {friends.map((f) => {
                      const done = invited.has(`${x.id}:${f.profile.id}`);
                      return (
                        <View key={f.profile.id} style={styles.subRow}>
                          <Avatar name={f.profile.display_name} photoUri={f.profile.avatar_url} size={32} />
                          <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                            {f.profile.display_name}
                          </Text>
                          <Pressable onPress={() => invite(x, f.profile.id)} disabled={done} style={[styles.ghostButton, done && { opacity: 0.5 }]}>
                            <Text style={styles.ghostText}>{done ? 'Invité ✓' : 'Inviter'}</Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                )}
                {ranking?.examId === x.id && (
                  <View style={styles.sub}>
                    {ranking.rows.length <= 1 && <Text style={type.footnote}>Invite des potes qui ont aussi ce partiel pour vous comparer.</Text>}
                    {ranking.rows.map((r, i) => (
                      <View key={r.user_id} style={styles.subRow}>
                        <Text style={styles.rank}>{i + 1}</Text>
                        <Avatar name={r.display_name} photoUri={r.avatar_url} size={32} />
                        <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                          {r.display_name}
                        </Text>
                        <Text style={type.headline}>{formatDuration(r.seconds)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}

          <Text style={styles.sectionTitle}>NOUVEAU PARTIEL</Text>
          <View style={card}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nom du partiel (ex : Compta)"
              placeholderTextColor={colors.tertiary}
              maxLength={30}
              style={styles.input}
            />
            <View style={styles.separator} />
            <DateField label="Date" mode="date" value={date} onChange={setDate} minimumDate={new Date()} />
            <View style={styles.separator} />
            <View style={styles.goalRow}>
              <Text style={type.body}>Heures de révision</Text>
              <Stepper value={goal} min={1} max={200} unit="h" onChange={setGoal} />
            </View>
            <View style={{ padding: 12 }}>
              <Button title="Ajouter le partiel" onPress={submit} loading={adding} disabled={!name.trim()} />
            </View>
          </View>
          <Text style={type.footnote}>Tes vainc comptent pour un partiel quand leur sujet porte son nom (le bouton « vainc » le fait pour toi).</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The next exam, big: countdown, today's goal with its bar, and the alert if behind. */
function Hero({ plan, onVainc }: { plan: ExamPlan; onVainc: () => void }) {
  const x = plan.exam;
  const todayGoal = plan.doneToday + plan.leftToday;
  const pct = todayGoal > 0 ? Math.min(1, plan.doneToday / todayGoal) : 1;
  return (
    <View style={styles.hero}>
      <Text style={styles.heroDays}>{countdown(x.daysLeft).toUpperCase()}</Text>
      <Text style={styles.heroName} numberOfLines={1}>
        {x.name}
      </Text>
      <Text style={styles.heroDate}>{examDay(x)}</Text>
      <View style={styles.heroTrack}>
        <View style={[styles.heroFill, { width: `${pct * 100}%` }]} />
      </View>
      <Text style={styles.heroGoal}>
        {plan.leftTotal === 0
          ? 'Objectif atteint 🎉'
          : plan.leftToday < 60
            ? `Objectif du jour fait ✓ (${formatDuration(plan.doneToday)})`
            : `Encore ${formatDuration(plan.leftToday)} aujourd'hui`}
      </Text>
      {plan.behind >= 3600 && (
        <View style={styles.alert}>
          <Ionicons name="warning" size={16} color="#FFFFFF" />
          <Text style={styles.alertText}>Tu as {formatDuration(plan.behind)} de retard sur {x.name}</Text>
        </View>
      )}
      <Pressable onPress={onVainc} style={styles.heroButton}>
        <Ionicons name="lock-closed" size={16} color={colors.accent} />
        <Text style={styles.heroButtonText}>vainc sur {x.name}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16 },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, paddingBottom: 48, gap: 12 },
  sectionTitle: { ...type.footnote, fontWeight: '700', marginTop: 8, marginLeft: 4 },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  hero: { backgroundColor: colors.accent, borderRadius: 24, padding: 22, gap: 6 },
  heroDays: { color: colors.onAccent, fontSize: 44, fontWeight: '900', letterSpacing: -1 },
  heroName: { color: colors.onAccent, fontSize: 24, fontWeight: '800' },
  heroDate: { color: colors.onAccent, opacity: 0.85, fontSize: 15, fontWeight: '600' },
  heroTrack: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', marginTop: 10 },
  heroFill: { height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' },
  heroGoal: { color: colors.onAccent, fontSize: 17, fontWeight: '700' },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, marginTop: 4 },
  alertText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14, flex: 1 },
  heroButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 13, marginTop: 10 },
  heroButtonText: { color: colors.accent, fontWeight: '800', fontSize: 16 },
  week: { paddingHorizontal: 14 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  weekBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  weekDay: { width: 104, fontSize: 15, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  weekParts: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  part: { backgroundColor: colors.accentSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  partText: { fontSize: 12, fontWeight: '700', color: colors.accent },
  weekTotal: { fontSize: 15, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  exam: { padding: 14, gap: 8 },
  examTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  days: { fontSize: 15, fontWeight: '800', color: colors.accent },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  pace: { fontSize: 14, fontWeight: '600', color: colors.success },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  smallButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  smallButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 13 },
  ghostButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accentSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  ghostText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  sub: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator, paddingTop: 10 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { width: 18, fontWeight: '800', color: colors.secondary },
  input: { fontSize: 17, color: colors.text, paddingHorizontal: 16, paddingVertical: 15 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 16 },
  goalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
});
