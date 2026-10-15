import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useSocial } from '../lib/social';
import * as stats from '../lib/stats';
import { colors, type } from '../lib/theme';
import { formatDuration } from '../lib/time';
import { decorationOf } from '../lib/premium';
import { Named } from '../components/Badge';

export default function Recap() {
  const { profile } = useAuth();
  const { mySessions, friends, myStreak } = useSocial();
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const recap = useMemo(() => stats.weekRecap(mySessions), [mySessions]);
  const earned = useMemo(
    () => stats.badges(mySessions, profile?.weekly_goal_minutes ?? 0).filter((b) => b.unlocked),
    [mySessions, profile],
  );
  const rank = 1 + friends.filter((f) => f.weekSeconds > recap.totalSeconds).length;

  const share = async () => {
    setSharing(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      if (!(await Sharing.isAvailableAsync())) throw new Error("Le partage n'est pas disponible sur cet appareil.");
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Ma semaine sur Vainc' });
    } catch (e) {
      Alert.alert('Oups', (e as Error).message);
    } finally {
      setSharing(false);
    }
  };

  const lines: [string, string][] = [
    ['Sessions', String(recap.sessions)],
    ['Plus longue', formatDuration(recap.longestSeconds)],
    ['Meilleur jour', recap.bestDay ? `${recap.bestDay.label} (${formatDuration(recap.bestDay.seconds)})` : '—'],
    ['Série', `${myStreak} j 🔥`],
    ...(friends.length > 0 ? ([['Classement', `${rank}${rank === 1 ? 'er' : 'e'} sur ${friends.length + 1}`]] as [string, string][]) : []),
    ['Craquages', recap.abandons === 0 ? '0 😇' : `${recap.abandons} 💀`],
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={type.title}>Ma semaine</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close}>
          <Ionicons name="close" size={20} color={colors.secondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View ref={cardRef} collapsable={false} style={styles.cardWrap}>
          <LinearGradient colors={['#5856D6', '#AF52DE', '#FF2D55']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
            <View style={styles.cardTop}>
              <Avatar name={profile?.display_name ?? '?'} photoUri={profile?.avatar_url} decoration={decorationOf(profile)} size={44} />
              <View>
                <Text style={styles.cardName}><Named person={profile} size={18} /></Text>
                <Text style={styles.cardSmall}>ma semaine sur Vainc 🔒</Text>
              </View>
            </View>

            <Text style={styles.total}>{formatDuration(recap.totalSeconds)}</Text>
            <Text style={styles.totalLabel}>de lock in cette semaine</Text>

            <View style={styles.lines}>
              {lines.map(([label, value]) => (
                <View key={label} style={styles.line}>
                  <Text style={styles.lineLabel}>{label}</Text>
                  <Text style={styles.lineValue}>{value}</Text>
                </View>
              ))}
            </View>

            {earned.length > 0 && <Text style={styles.badges}>{earned.map((b) => b.emoji).join('  ')}</Text>}
            <Text style={styles.footer}>vainc · révise avec tes potes</Text>
          </LinearGradient>
        </View>

        <Button
          title="Partager en story"
          onPress={share}
          loading={sharing}
          icon={<Ionicons name="share-outline" size={18} color={colors.onAccent} />}
          style={{ marginTop: 20 }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: { padding: 20, paddingBottom: 40 },
  cardWrap: { borderRadius: 28, overflow: 'hidden' },
  card: { padding: 24, gap: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  cardName: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  cardSmall: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  total: { color: '#FFF', fontSize: 64, fontWeight: '800', letterSpacing: -2 },
  totalLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 17, fontWeight: '500', marginTop: -4 },
  lines: { marginTop: 24, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 18, padding: 6 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  lineLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 15 },
  lineValue: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  badges: { fontSize: 26, textAlign: 'center', marginTop: 20 },
  footer: { color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center', marginTop: 20, fontWeight: '600' },
});
