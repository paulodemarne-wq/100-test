import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PetView } from '../components/PetView';
import { displayName, levelFor, PLAN_EMOJI, PLAN_NAMES, PLUS_SPECIES, SPECIES, Species } from '../creatures/species';

/** The 100 creatures, then the 10 Lockin+ ones. */
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
            <PetView species={selected.id} level={Math.max(2, discovered.get(selected.id) ?? 2)} style={{ flex: 1 }} />
            <Text style={styles.previewName}>
              {displayName(selected, Math.max(2, discovered.get(selected.id) ?? 2))} · {selected.element.name}
            </Text>
            <Text style={styles.previewLine}>
              {selected.names.map((n, i) => `${n} (${PLAN_NAMES[selected.line[i]]})`).join('  →  ')}
            </Text>
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
              <Text style={[styles.cellEmoji, !known && { opacity: 0.25 }]}>{known ? PLAN_EMOJI[s.line[0]] : '❔'}</Text>
              <Text style={[styles.cellName, !known && { color: colors.tertiary }]} numberOfLines={1}>
                {known ? s.names[0] : s.id >= 100 ? '✨ Lockin+' : `n° ${s.id + 1}`}
              </Text>
              <View style={[styles.cellDot, { backgroundColor: s.traits.body, opacity: known ? 1 : 0.3 }]} />
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  preview: { ...card, height: 230, marginHorizontal: 20, marginTop: 12, overflow: 'hidden' },
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
