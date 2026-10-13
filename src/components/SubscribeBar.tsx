import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { isPremium, PLUS_NAME, PLUS_PRICE } from '../lib/premium';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

/** One tap to Lockin+ under the week total, for everyone who doesn't pay yet (a trial included). */
export function SubscribeBar() {
  const { profile } = useAuth();
  const [paid, setPaid] = useState<boolean | null>(null);
  const id = profile?.id;
  const until = profile?.premium_until;
  useEffect(() => {
    if (!id) return;
    supabase
      .from('plus_grants')
      .select('id')
      .eq('user_id', id)
      .eq('source', 'paid')
      .limit(1)
      .then(({ data }) => setPaid((data ?? []).length > 0));
  }, [id, until]);
  if (!profile || profile.featured || paid !== false) return null;
  const trial = isPremium(profile);
  const end = trial && until ? new Date(until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : null;
  return (
    <Pressable onPress={() => router.push('/premium')} style={({ pressed }) => [styles.bar, pressed && { opacity: 0.85 }]}>
      <View style={styles.icon}>
        <Ionicons name="sparkles" size={18} color={colors.onAccent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>S'abonner à {PLUS_NAME}</Text>
        <Text style={styles.sub}>{end ? `Essai gratuit jusqu'au ${end}` : `${PLUS_PRICE} · 7 jours offerts`}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.onAccent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14 },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
  sub: { color: colors.onAccent, opacity: 0.85, fontSize: 13, fontWeight: '600' },
});
