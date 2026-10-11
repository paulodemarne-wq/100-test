import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { PetView } from '../components/PetView';
import { displayName, levelFor, speciesById, tierFor } from '../creatures/species';
import { useSocial } from '../lib/social';
import { card, colors, type } from '../lib/theme';
import { formatDuration } from '../lib/time';

/** Visit friends: their pet in their garden, one at a time. */
export default function Gardens() {
  const { friends, friendPets } = useSocial();
  const visits = friends.filter((f) => friendPets[f.profile.id]);
  const [index, setIndex] = useState(0);
  const current = visits[Math.min(index, visits.length - 1)];
  const go = (delta: number) => setIndex((i) => (i + delta + visits.length) % visits.length);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={type.title}>Jardins des amis</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} style={[styles.close, { marginLeft: 'auto' }]}>
          <Ionicons name="close" size={20} color={colors.secondary} />
        </Pressable>
      </View>

      {!current ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 48 }}>🏡</Text>
          <Text style={[type.headline, { textAlign: 'center' }]}>Personne à visiter pour l'instant</Text>
          <Text style={[type.subhead, { textAlign: 'center' }]}>
            Ajoute des amis : tu pourras voir leur animal et leur jardin ici.
          </Text>
          <Pressable onPress={() => router.replace('/add-friend')} style={styles.cta}>
            <Text style={styles.ctaText}>Ajouter un ami</Text>
          </Pressable>
        </View>
      ) : (
        <Visit key={current.profile.id} person={current} pet={friendPets[current.profile.id]} onPrev={() => go(-1)} onNext={() => go(1)} />
      )}

      {visits.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.people}>
          {visits.map((f, i) => (
            <Pressable key={f.profile.id} onPress={() => setIndex(i)} style={styles.person}>
              <View style={[styles.ring, f.profile.id === current?.profile.id && { borderColor: colors.accent }]}>
                <Avatar name={f.profile.display_name} photoUri={f.profile.avatar_url} size={48} live={f.status.kind === 'working'} />
              </View>
              <Text style={styles.personName} numberOfLines={1}>
                {f.profile.display_name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Visit({
  person,
  pet,
  onPrev,
  onNext,
}: {
  person: ReturnType<typeof useSocial>['friends'][number];
  pet: ReturnType<typeof useSocial>['friendPets'][string];
  onPrev: () => void;
  onNext: () => void;
}) {
  const level = levelFor(pet.xp_seconds);
  const tier = tierFor(level);
  return (
    <View style={styles.visit}>
      <View style={styles.stage}>
        <PetView species={pet.species} level={level} equipped={pet.equipped} garden={person.profile.garden ?? {}} style={{ flex: 1 }} />
        <View style={[styles.badge, { backgroundColor: tier.color }]}>
          <Text style={styles.badgeText}>
            {tier.name} · Niv. {level}
          </Text>
        </View>
        <Pressable onPress={onPrev} style={[styles.arrow, { left: 10 }]} hitSlop={8} accessibilityLabel="Ami précédent">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Pressable onPress={onNext} style={[styles.arrow, { right: 10 }]} hitSlop={8} accessibilityLabel="Ami suivant">
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.info}>
        <Avatar name={person.profile.display_name} photoUri={person.profile.avatar_url} size={44} live={person.status.kind === 'working'} />
        <View style={{ flex: 1 }}>
          <Text style={type.headline}>Chez {person.profile.display_name}</Text>
          <Text style={type.subhead}>
            {displayName(speciesById(pet.species), level)} · {formatDuration(pet.xp_seconds)} de lock in ensemble
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  cta: { marginTop: 8, backgroundColor: colors.accent, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 },
  ctaText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
  visit: { flex: 1, paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  stage: { ...card, flex: 1, overflow: 'hidden' },
  badge: { position: 'absolute', top: 14, left: 14, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { ...card, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  people: { gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
  person: { alignItems: 'center', gap: 4, width: 60 },
  ring: { borderWidth: 2, borderColor: 'transparent', borderRadius: 30, padding: 2 },
  personName: { fontSize: 12, fontWeight: '600', color: colors.text },
});
