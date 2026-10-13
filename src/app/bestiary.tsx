import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PetView } from '../components/PetView';
import { elementOf, emojiFor, levelFor, PLUS_SPECIES, SPECIES, Species, TIERS } from '../creatures/species';

/** The 30 animals, then the 10 Lockin+ ones. */
const ALL = [...SPECIES, ...PLUS_SPECIES];
import { useSocial } from '../lib/social';
import { card, colors, type } from '../lib/theme';

export default function Bestiary() {
  const { pets, friendPets } = useSocial();
  // Species you own, plus the ones your friends own.
  const discovered = useMemo(() => {
    const seen = new Map<number, number>();
    for (const p of [...pets, ...Object.values(friendPets)]) {
      if (p.species === null) continue;
      seen.set(p.species, Math.max(seen.get(p.species) ?? 0, levelFor(p.xp_seconds)));
    }
    return seen;
  }, [pets, friendPets]);
  const first = ALL.find((s) => discovered.has(s.id)) ?? null;
  const [selected, setSelected] = useState<Species | null>(first);
  // Which stage to show (every stage can be previewed, to see what's coming).
  const [tier, setTier] = useState(1);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={type.title}>Bestiaire</Text>
        <Text style={[type.subhead, { marginLeft: 'auto' }]}>{discovered.size}/{ALL.length} découverts</Text>
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
            <Text style={[type.subhead, { textAlign: 'center' }]}>
              Fais éclore ton œuf (5 h 30 de lock in) pour découvrir ton premier animal.
            </Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {ALL.map((s) => {
          const known = discovered.has(s.id);
          return (
            <Pressable
              key={s.id}
              disabled={!known}
              onPress={() => setSelected(s)}
              style={[styles.cell, selected?.id === s.id && { borderColor: colors.accent }]}
            >
              <Text style={[styles.cellEmoji, !known && { opacity: 0.25 }]}>{known ? emojiFor(s, 2) : '❔'}</Text>
              <Text style={[styles.cellName, !known && { color: colors.tertiary }]} numberOfLines={1}>
                {known ? s.name : s.plus ? '✨ Lockin+' : `n° ${s.id + 1}`}
              </Text>
              <View style={[styles.cellDot, { backgroundColor: elementOf(s).color, opacity: known ? 1 : 0.3 }]} />
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
  cellDot: { width: 6, height: 6, borderRadius: 3 },
});
