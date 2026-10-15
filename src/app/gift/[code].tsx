import * as Haptics from 'expo-haptics';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { PlusCelebration } from '../../components/PlusCelebration';
import { useAuth } from '../../lib/auth';
import { savePendingGift } from '../../lib/gifts';
import { errorMessage, supabase } from '../../lib/supabase';
import { card, colors, type } from '../../lib/theme';

type Info = { giver_name: string; giver_avatar: string | null; days: number; claimed: boolean; mine: boolean };

/** A Vainc+ gift link (vainc://gift/CODE): see who offers it, and take it. */
export default function Gift() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = String(raw ?? '').toUpperCase();
  const { ready, session, profile, profileReady, reloadProfile } = useAuth();
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase.rpc('gift_info', { code }).then(({ data }) => setInfo(((data as Info[]) ?? [])[0] ?? null));
  }, [profile, code]);

  // Not signed in yet: keep the gift for after.
  if (ready && (!session || (profileReady && !profile))) {
    savePendingGift(code);
    return <Redirect href={session ? '/setup-profile' : '/login'} />;
  }

  const take = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('claim_gift', { code });
    setBusy(false);
    if (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return setError(errorMessage(e));
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await reloadProfile().catch(() => {});
    setDone(true);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        {done && info ? (
          <PlusCelebration title="Tu as Vainc+ 🎉" text={`${info.giver_name} t'a offert ${info.days} jours. Profite !`} />
        ) : info === undefined ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <View style={[card, styles.card]}>
            {info ? (
              <>
                <Avatar name={info.giver_name} photoUri={info.giver_avatar} size={80} />
                <Text style={styles.title}>{info.giver_name} t'offre {info.days} jours de Vainc+ 🎁</Text>
                <Text style={styles.text}>Badge, décoration de photo, animaux exclusifs, stats détaillées…</Text>
                {info.mine ? (
                  <Text style={styles.text}>C'est ton lien : envoie-le à un pote 😉</Text>
                ) : info.claimed ? (
                  <Text style={styles.error}>Ce cadeau a déjà été récupéré.</Text>
                ) : (
                  <Pressable onPress={take} disabled={busy} style={[styles.button, busy && { opacity: 0.5 }]}>
                    <Text style={styles.buttonText}>{busy ? '…' : 'Récupérer mon cadeau'}</Text>
                  </Pressable>
                )}
                {error && <Text style={styles.error}>{error}</Text>}
              </>
            ) : (
              <Text style={styles.title}>Ce lien cadeau n'existe pas 🤔</Text>
            )}
            <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10}>
              <Text style={type.subhead}>Fermer</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { alignItems: 'center', gap: 12, padding: 22 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  text: { ...type.subhead, textAlign: 'center' },
  error: { fontSize: 15, fontWeight: '600', color: colors.danger, textAlign: 'center' },
  button: { alignSelf: 'stretch', backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 6 },
  buttonText: { color: colors.onAccent, fontWeight: '800', fontSize: 17 },
});
