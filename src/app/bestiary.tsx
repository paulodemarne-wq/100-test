import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PetView } from '../components/PetView';
import { elementOf, emojiFor, PLUS_SPECIES, SKIN_HOURS, SPECIES, Species, TIERS } from '../creatures/species';

/** The 30 animals, then the 10 Vainc+ ones. */
const ALL = [...SPECIES, ...PLUS_SPECIES];
import { useAuth } from '../lib/auth';
import { isPremium } from '../lib/premium';
import { useSocial } from '../lib/social';
import { errorMessage, supabase } from '../lib/supabase';
import { card, colors, type } from '../lib/theme';

export default function Bestiary() {
  const { pets, refresh } = useSocial();
  const { profile, userId } = useAuth();
  const premium = isPremium(profile);
  const pet = pets[0];
  const wearing = pet?.species ?? null;
  // The skins I own (the animal I hatched and the ones I bought). Vainc+ ones are free to wear while Vainc+ is on.
  const [owned, setOwned] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const loadSkins = useCallback(async () => {
    const { data } = await supabase.from('pet_skins').select('species');
    setOwned(new Set((data ?? []).map((r) => r.species as number)));
  }, []);
  useEffect(() => {
    loadSkins();
  }, [loadSkins, userId]);
  const [selected, setSelected] = useState<Species | null>(ALL.find((s) => s.id === wearing) ?? ALL[0]);
  // Which stage to show (every stage can be previewed, to see what's coming).
  const [tier, setTier] = useState(1);

  const usable = (s: Species) => owned.has(s.id) || (s.plus && premium);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Promise.all([loadSkins(), refresh()]);
    } catch (e) {
      Alert.alert('Oups', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const rpc = async (fn: string, sp: number) => {
    const { error } = await supabase.rpc(fn, { sp });
    if (error) throw new Error(errorMessage(error));
  };
  const wear = (s: Species) => act(() => rpc('set_skin', s.id));
  const buy = (s: Species) =>
    Alert.alert(`Acheter le skin ${s.name} ?`, `${SKIN_HOURS} h de lock in. Tu gardes aussi ton skin actuel, et ton niveau ne change pas.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: `Acheter · ${SKIN_HOURS} h`, onPress: () => act(async () => { await rpc('buy_skin', s.id); await rpc('set_skin', s.id); }) },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={type.title}>Bestiaire</Text>
        <Text style={[type.subhead, { marginLeft: 'auto' }]}>{owned.size + (premium ? PLUS_SPECIES.filter((s) => !owned.has(s.id)).length : 0)}/{ALL.length} skins</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close}>
          <Ionicons name="close" size={20} color={colors.secondary} />
        </Pressable>
      </View>

      <View style={styles.preview}>
        {selected ? (
          <>
            <PetView species={selected.id} level={TIERS[tier].fromLevel} style={{ flex: 1 }} />
            <Text style={styles.previewName}>
              {selected.name} · {elementOf(selected).emoji} {elementOf(selected).name}
            </Text>
            <Text style={styles.previewLine}>{selected.about}</Text>
            <View style={styles.tiers}>
              {TIERS.slice(1).map((t) => (
                <Pressable key={t.index} onPress={() => setTier(t.index)} style={[styles.tier, tier === t.index && { backgroundColor: t.color }]}>
                  <Text style={[styles.tierText, tier === t.index && { color: '#fff' }]}>{t.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.empty}>
            <Text style={{ fontSize: 44 }}>🥚</Text>
            <Text style={[type.subhead, { textAlign: 'center' }]}>Choisis un animal pour voir à quoi il ressemble.</Text>
          </View>
        )}
      </View>

      {selected && (
        <View style={styles.actionRow}>
          {!pet || pet.species === null ? (
            <Text style={[type.footnote, { textAlign: 'center' }]}>Fais d'abord éclore ton œuf pour pouvoir changer de skin.</Text>
          ) : selected.id === wearing ? (
            <Text style={[type.headline, { color: colors.accent }]}>✓ Ton skin actuel</Text>
          ) : usable(selected) ? (
            <Pressable disabled={busy} onPress={() => wear(selected)} style={styles.action}>
              <Text style={styles.actionText}>Utiliser ce skin</Text>
            </Pressable>
          ) : selected.plus ? (
            <Pressable onPress={() => router.push('/premium')} style={[styles.action, { backgroundColor: '#B7791F' }]}>
              <Text style={styles.actionText}>🔒 Gratuit avec Vainc+</Text>
            </Pressable>
          ) : (
            <Pressable disabled={busy} onPress={() => buy(selected)} style={styles.action}>
              <Text style={styles.actionText}>Acheter ce skin · {SKIN_HOURS} h</Text>
            </Pressable>
          )}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.grid}>
        {ALL.map((s) => {
          const mine = usable(s);
          return (
            <Pressable
              key={s.id}
              onPress={() => setSelected(s)}
              style={[styles.cell, selected?.id === s.id && { borderColor: colors.accent }]}
            >
              <Text style={[styles.cellEmoji, !mine && { opacity: 0.45 }]}>{emojiFor(s, 2)}</Text>
              <Text style={styles.cellName} numberOfLines={1}>
                {s.name}
              </Text>
              <Text style={[styles.cellTag, { color: s.id === wearing ? colors.accent : colors.tertiary }]}>
                {s.id === wearing ? 'actif' : mine ? '✓' : s.plus ? '✨ Vainc+' : `${SKIN_HOURS} h`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tiers: { position: 'absolute', top: 8, left: 0, right: 0, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
  tier: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.fill },
  tierText: { fontSize: 12, fontWeight: '700', color: colors.text },
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  preview: { ...card, height: 290, marginHorizontal: 20, marginTop: 12, overflow: 'hidden' },
  previewName: { position: 'absolute', bottom: 28, alignSelf: 'center', ...type.headline },
  previewLine: { position: 'absolute', bottom: 10, alignSelf: 'center', ...type.footnote },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 20, paddingBottom: 40 },
  cell: {
    ...card,
    width: '18.4%',
    aspectRatio: 0.8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cellEmoji: { fontSize: 24 },
  cellName: { fontSize: 9, fontWeight: '700', color: colors.text },
  cellTag: { fontSize: 9, fontWeight: '700' },
  actionRow: { marginHorizontal: 20, marginTop: 10, alignItems: 'center' },
  action: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12 },
  actionText: { color: colors.onAccent, fontWeight: '700', fontSize: 15 },
});
