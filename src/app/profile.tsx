import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { DateField } from '../components/DateField';
import { Row, Section } from '../components/List';
import { Stepper } from '../components/Stepper';
import { Button } from '../components/ui';
import { useAuth } from '../lib/auth';
import { syncDailyReminders } from '../lib/notifications';
import { pickProfilePhoto } from '../lib/photo';
import { DEFAULT_REMINDER, loadReminder, ReminderSetting, saveReminder } from '../lib/reminder';
import { useSocial } from '../lib/social';
import * as stats from '../lib/stats';
import { useVainc } from '../lib/store';
import { card, colors, type } from '../lib/theme';
import { dayKey, formatDuration } from '../lib/time';
import { decorationOf, isPremium, titleOf } from '../lib/premium';
import { PetView } from '../components/PetView';
import { displayName, levelFor, speciesById } from '../creatures/species';
import { Named } from '../components/Badge';
import { SubscribeBar } from '../components/SubscribeBar';

export default function Profile() {
  const { profile, setPhoto, signOut, updateSettings } = useAuth();
  const { mySessions, myWeekSeconds, myStreak, myStreakInfo, exams, pets } = useSocial();
  const pet = pets[0] ?? null;
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
  const { active, stopSession } = useVainc();

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
          <Pressable onPress={changePhoto} style={decorationOf(profile) ? { marginTop: 36 } : undefined}>
            <Avatar name={profile.display_name} photoUri={profile.avatar_url} decoration={decorationOf(profile)} size={96} />
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color={colors.onAccent} />
            </View>
          </Pressable>
          <Text style={[type.title, { marginTop: decorationOf(profile) ? 36 : 12 }]}>
            <Named person={profile} size={22} />
          </Text>
          {titleOf(profile) && <Text style={styles.title}>{titleOf(profile)}</Text>}
          <Text style={type.subhead}>@{profile.username}</Text>
        </View>

        {pet && (
          <Pressable onPress={() => router.navigate('/pet')} style={styles.petCard}>
            <PetView species={pet.species} level={levelFor(pet.xp_seconds)} equipped={pet.equipped} interactive={false} style={{ width: 150, height: 170 }} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={type.footnote}>MON ANIMAL</Text>
              <Text style={styles.petName} numberOfLines={1}>
                {pet.nickname ?? displayName(speciesById(pet.species), levelFor(pet.xp_seconds))}
              </Text>
              <Text style={type.subhead}>
                {pet.nickname ? `${displayName(speciesById(pet.species), levelFor(pet.xp_seconds))} · ` : ''}Niv. {levelFor(pet.xp_seconds)}
              </Text>
            </View>
          </Pressable>
        )}

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

        <SubscribeBar />

        <Section title="Vainc+">
          <Row
            left={<Ionicons name="stats-chart" size={24} color={colors.accent} />}
            title="Stats détaillées"
            subtitle="Par matière, meilleur moment de la journée, le mois jour par jour"
            onPress={() => router.push('/stats')}
            right={<Ionicons name="chevron-forward" size={18} color={colors.tertiary} />}
          />
          <Row
            left={<Ionicons name="sparkles" size={24} color={colors.accent} />}
            title={isPremium(profile) ? 'Mon badge et ma décoration' : 'Passer à Vainc+'}
            subtitle={isPremium(profile) ? 'Badge à côté du prénom, décoration de photo en 3D' : 'Badge, décoration de photo, 10 animaux exclusifs…'}
            onPress={() => router.push('/premium')}
            right={<Ionicons name="chevron-forward" size={18} color={colors.tertiary} />}
          />
        </Section>

        <Section
          title="Série"
          footer="Un jour raté par mois est pardonné automatiquement (2 avec Vainc+), pour ne pas perdre ta série sur une journée de flemme."
        >
          <Row
            left={<Text style={{ fontSize: 28 }}>🛡️</Text>}
            title={myStreakInfo.jokersLeft > 0 ? `${myStreakInfo.jokersLeft} joker${myStreakInfo.jokersLeft > 1 ? 's' : ''} dispo ce mois-ci` : 'Jokers du mois utilisés'}
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
            title="Heures de vainc"
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

        <Section title="Partiels">
          <Row
            left={<Ionicons name="school" size={24} color={colors.accent} />}
            title="Mode partiels"
            subtitle={exams.length ? `${exams.length} partiel${exams.length > 1 ? 's' : ''} · prochain : ${exams[0].name} (J-${exams[0].daysLeft})` : 'Compte à rebours, heures par jour, révisions avec tes potes'}
            onPress={() => router.push('/exams')}
            right={<Ionicons name="chevron-forward" size={18} color={colors.tertiary} />}
          />
        </Section>

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
            subtitle="Si tu n'as pas encore vainc ce jour-là"
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
            title="Quand un pote vainc"
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
  title: { fontSize: 15, fontWeight: '700', color: colors.accent, marginTop: 2 },
  petCard: { ...card, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 16, marginTop: 16, overflow: 'hidden' },
  petName: { fontSize: 24, fontWeight: '800', color: colors.text },
  duoCard: { ...card, flex: 1, padding: 14, gap: 2 },
  stat: { ...card, flex: 1, padding: 12, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.text },
  badges: { flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  badge: { width: '33.33%', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, gap: 2 },
  badgeEmoji: { fontSize: 34 },
  badgeName: { fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' },
  badgeDesc: { fontSize: 11, color: colors.secondary, textAlign: 'center' },
});
