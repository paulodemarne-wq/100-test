import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { isPremium } from '../lib/premium';
import { supabase } from '../lib/supabase';
import { card, colors, DEFAULT_LABEL, type } from '../lib/theme';
import { formatDuration } from '../lib/time';

type Done = { subject: string; started_at: string; duration_sec: number };
const DAY = 86_400_000;
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Vainc+: hours per subject, best time of day, the month day by day. */
export default function Stats() {
  const { profile, userId } = useAuth();
  const premium = isPremium(profile);
  const [rows, setRows] = useState<Done[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('study_sessions')
      .select('subject, started_at, duration_sec')
      .eq('user_id', userId)
      .eq('status', 'done')
      .gte('started_at', new Date(Date.now() - 365 * DAY).toISOString())
      .order('started_at', { ascending: false })
      .limit(5000)
      .then(({ data }) => setRows((data ?? []) as Done[]));
  }, [userId]);

  const s = useMemo(() => {
    const list = rows ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // The last 30 days, one bar per day.
    const days = Array.from({ length: 30 }, (_, i) => ({ date: new Date(today.getTime() - (29 - i) * DAY), sec: 0 }));
    const bySubject = new Map<string, number>();
    const byHour = Array<number>(24).fill(0);
    const byWeekday = Array<number>(7).fill(0);
    let month = 0;
    for (const r of list) {
      const d = new Date(r.started_at);
      const sec = r.duration_sec ?? 0;
      const idx = 29 - Math.floor((today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / DAY);
      if (idx >= 0 && idx < 30) {
        days[idx].sec += sec;
        month += sec;
      }
      const name = r.subject === DEFAULT_LABEL ? 'Sans sujet' : r.subject;
      bySubject.set(name, (bySubject.get(name) ?? 0) + sec);
      byHour[d.getHours()] += sec;
      byWeekday[(d.getDay() + 6) % 7] += sec;
    }
    const subjects = [...bySubject.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    // Best 2-hour window of the day.
    let best = 0;
    for (let h = 1; h < 24; h++) if (byHour[h] + byHour[(h + 1) % 24] > byHour[best] + byHour[(best + 1) % 24]) best = h;
    const total = list.reduce((n, r) => n + (r.duration_sec ?? 0), 0);
    const bestDay = days.reduce((a, b) => (b.sec > a.sec ? b : a), days[0]);
    return { days, subjects, byHour, byWeekday, best, month, total, bestDay };
  }, [rows]);

  const maxDay = Math.max(1, ...s.days.map((d) => d.sec));
  const maxHour = Math.max(1, ...s.byHour);
  const maxWeekday = Math.max(1, ...s.byWeekday);
  const maxSubject = Math.max(1, ...s.subjects.map((x) => x[1]));
  const subjectTotal = s.subjects.reduce((n, x) => n + x[1], 0) || 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={type.title}>Mes stats</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close} accessibilityLabel="Fermer">
          <Ionicons name="close" size={20} color={colors.secondary} />
        </Pressable>
      </View>
      {!rows ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.container} scrollEnabled={premium}>
            <View style={styles.tiles}>
              <Tile label="Ces 30 jours" value={formatDuration(s.month)} />
              <Tile label="Par jour" value={formatDuration(s.month / 30)} />
              <Tile label="Sur un an" value={formatDuration(s.total)} />
            </View>

            <Text style={styles.sectionTitle}>LE MOIS, JOUR PAR JOUR</Text>
            <View style={[card, styles.chartCard]}>
              <View style={styles.bars}>
                {s.days.map((d, i) => (
                  <View key={i} style={styles.barSlot}>
                    <View style={[styles.bar, { height: `${(d.sec / maxDay) * 100}%` }, d === s.bestDay && d.sec > 0 && { backgroundColor: colors.success }]} />
                  </View>
                ))}
              </View>
              <View style={styles.axis}>
                <Text style={styles.axisText}>il y a 30 j</Text>
                <Text style={styles.axisText}>aujourd'hui</Text>
              </View>
              {s.bestDay.sec > 0 && (
                <Text style={type.footnote}>
                  Record : {formatDuration(s.bestDay.sec)} le {s.bestDay.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} 🔥
                </Text>
              )}
            </View>

            <Text style={styles.sectionTitle}>PAR MATIÈRE</Text>
            <View style={[card, styles.chartCard, { gap: 10 }]}>
              {s.subjects.length === 0 && <Text style={type.footnote}>Donne un sujet à tes lock in pour voir le détail.</Text>}
              {s.subjects.map(([name, sec]) => (
                <View key={name} style={{ gap: 4 }}>
                  <View style={styles.subjectTop}>
                    <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.subjectValue}>
                      {formatDuration(sec)} · {Math.round((sec / subjectTotal) * 100)} %
                    </Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${(sec / maxSubject) * 100}%` }]} />
                  </View>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>TON MEILLEUR MOMENT</Text>
            <View style={[card, styles.chartCard]}>
              <Text style={type.headline}>
                {s.byHour.some((x) => x > 0) ? `Tu bosses le plus entre ${s.best} h et ${(s.best + 2) % 24} h` : 'Pas encore assez de lock in'}
              </Text>
              <View style={[styles.bars, { height: 90 }]}>
                {s.byHour.map((sec, h) => (
                  <View key={h} style={styles.barSlot}>
                    <View style={[styles.bar, { height: `${(sec / maxHour) * 100}%` }, (h === s.best || h === (s.best + 1) % 24) && sec > 0 && { backgroundColor: colors.warning }]} />
                  </View>
                ))}
              </View>
              <View style={styles.axis}>
                {['0 h', '6 h', '12 h', '18 h', '23 h'].map((t) => (
                  <Text key={t} style={styles.axisText}>
                    {t}
                  </Text>
                ))}
              </View>
            </View>

            <Text style={styles.sectionTitle}>JOURS DE LA SEMAINE</Text>
            <View style={[card, styles.chartCard]}>
              <View style={[styles.bars, { height: 90, gap: 10 }]}>
                {s.byWeekday.map((sec, i) => (
                  <View key={i} style={styles.barSlot}>
                    <View style={[styles.bar, { height: `${(sec / maxWeekday) * 100}%`, borderRadius: 6 }]} />
                  </View>
                ))}
              </View>
              <View style={[styles.axis, { gap: 10 }]}>
                {WEEKDAYS.map((d) => (
                  <Text key={d} style={[styles.axisText, { flex: 1, textAlign: 'center' }]}>
                    {d}
                  </Text>
                ))}
              </View>
            </View>
          </ScrollView>
          {!premium && (
            <View style={styles.lock}>
              <View style={[card, styles.lockCard]}>
                <Ionicons name="stats-chart" size={30} color={colors.accent} />
                <Text style={[type.title, { textAlign: 'center' }]}>Stats détaillées</Text>
                <Text style={[type.subhead, { textAlign: 'center' }]}>
                  Heures par matière, ton meilleur moment de la journée, le mois jour par jour. Avec Vainc+.
                </Text>
                <Pressable onPress={() => router.replace('/premium')} style={styles.lockButton}>
                  <Text style={styles.lockButtonText}>Voir Vainc+</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={[card, styles.tile]}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={type.footnote}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16 },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, paddingBottom: 48, gap: 12 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, padding: 12, gap: 2 },
  tileValue: { fontSize: 20, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  sectionTitle: { ...type.footnote, fontWeight: '700', marginTop: 8, marginLeft: 4 },
  chartCard: { padding: 14, gap: 8 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 3 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', minHeight: 2, borderRadius: 3, backgroundColor: colors.accent },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { fontSize: 11, color: colors.secondary, fontWeight: '600' },
  subjectTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  subjectValue: { fontSize: 13, fontWeight: '700', color: colors.secondary, fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  lock: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(242,242,247,0.86)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  lockCard: { padding: 22, gap: 10, alignItems: 'center' },
  lockButton: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 28, marginTop: 6 },
  lockButtonText: { color: colors.onAccent, fontWeight: '800', fontSize: 16 },
});
