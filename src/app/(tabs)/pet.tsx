import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PetView } from '../../components/PetView';
import {
  displayName,
  formFor,
  LEVEL_HOURS,
  LEVEL_UNLOCKS,
  levelFor,
  MAX_LEVEL,
  PLAN_EMOJI,
  PLAN_NAMES,
  RARITY_COLORS,
  SHOP_ITEMS,
  Slot,
  SLOT_NAMES,
  speciesById,
  TIERS,
  tierFor,
} from '../../creatures/species';
import { useAuth } from '../../lib/auth';
import { useSocial } from '../../lib/social';
import { card, colors, type } from '../../lib/theme';
import { formatDuration } from '../../lib/time';

const SLOTS: Slot[] = ['head', 'eyes', 'neck', 'back'];

export default function PetScreen() {
  const { profile, reloadProfile } = useAuth();
  const { pets, friends, friendPets, inventory, equipItem, setActivePet } = useSocial();
  const [busy, setBusy] = useState(false);
  const pet = pets[0] ?? null;
  const balance = Math.max(0, (profile?.total_seconds ?? 0) - (profile?.spent_seconds ?? 0));
  const fail = (e: unknown) => Alert.alert('Oups', (e as Error).message);

  if (!pet) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={[type.largeTitle, { margin: 20 }]}>Mon animal</Text>
        <Text style={[type.subhead, { marginHorizontal: 20 }]}>
          Ton œuf arrive… Si rien ne s'affiche, mets à jour la base (schema.sql).
        </Text>
      </SafeAreaView>
    );
  }

  const species = speciesById(pet.species);
  const level = levelFor(pet.xp_seconds);
  const tier = tierFor(level);
  const form = formFor(level);
  const maxed = level >= MAX_LEVEL;
  const progress = maxed
    ? 1
    : (pet.xp_seconds / 3600 - LEVEL_HOURS[level]) / (LEVEL_HOURS[level + 1] - LEVEL_HOURS[level]);
  const nextTier = TIERS[tier.index + 1];

  const chooseItem = (slot: Slot) => {
    const owned = SHOP_ITEMS.filter((i) => i.slot === slot && inventory.includes(i.id));
    if (owned.length === 0) {
      Alert.alert(`Rien pour ${SLOT_NAMES[slot].toLowerCase()}`, 'Achète des accessoires dans la boutique avec tes heures.', [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Boutique', onPress: () => router.push('/shop') },
      ]);
      return;
    }
    Alert.alert(SLOT_NAMES[slot], undefined, [
      ...owned.map((i) => ({
        text: pet.equipped[slot] === i.id ? `${i.name} ✓` : i.name,
        onPress: () => equipItem(pet.id, slot, i.id).catch(fail),
      })),
      ...(pet.equipped[slot]
        ? [{ text: 'Retirer', style: 'destructive' as const, onPress: () => equipItem(pet.id, slot, null).catch(fail) }]
        : []),
      { text: 'Annuler', style: 'cancel' as const },
    ]);
  };

  const visitors = friends.filter((f) => friendPets[f.profile.id]).length;

  const switchPet = async (id: string) => {
    setBusy(true);
    try {
      await setActivePet(id);
      await reloadProfile();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={type.footnote}>{species && form > 0 ? `${species.element.name} · ${PLAN_NAMES[species.line[form - 1]]}` : 'Il éclot après 5 h 30 de lock in'}</Text>
            <Text style={type.largeTitle} numberOfLines={1}>
              {displayName(species, level)}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/shop')} style={styles.wallet} hitSlop={8}>
            <Ionicons name="hourglass" size={16} color={colors.accent} />
            <Text style={styles.walletText}>{formatDuration(balance)}</Text>
          </Pressable>
        </View>

        <View style={styles.stage}>
          <PetView
            species={pet.species}
            level={level}
            equipped={pet.equipped}
            onPress={() => router.push('/world')}
            style={styles.viewer}
          />
          <View style={[styles.badge, { backgroundColor: tier.color }]}>
            <Text style={styles.badgeText}>
              {tier.name} · Niv. {level}
            </Text>
          </View>
          <View style={styles.hint} pointerEvents="none">
            <Text style={styles.hintText}>Glisse pour le tourner · touche pour aller sur ton île</Text>
          </View>
        </View>

        <View style={styles.xpCard}>
          <View style={styles.xpTop}>
            <Text style={type.headline}>{formatDuration(pet.xp_seconds)} de lock in ensemble</Text>
            {!maxed && <Text style={[styles.nextStage, { color: tier.color }]}>Niv. {level + 1}</Text>}
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.min(1, progress) * 100}%`, backgroundColor: tier.color }]} />
          </View>
          <Text style={type.footnote}>
            {maxed
              ? 'Niveau maximum atteint 👑'
              : `Encore ${formatDuration(Math.max(60, LEVEL_HOURS[level + 1] * 3600 - pet.xp_seconds))} → ${LEVEL_UNLOCKS[level + 1]}`}
          </Text>
          {nextTier && (
            <Text style={type.footnote}>
              {nextTier.name} au niveau {nextTier.fromLevel} (
              {formatDuration(Math.max(60, LEVEL_HOURS[nextTier.fromLevel] * 3600 - pet.xp_seconds))})
            </Text>
          )}
          <View style={styles.stages}>
            {TIERS.map((t) => (
              <View key={t.index} style={[styles.stageDot, { backgroundColor: t.index <= tier.index ? t.color : colors.fill }]} />
            ))}
          </View>
        </View>

        <Pressable onPress={() => router.push('/world')} style={styles.island}>
          <Text style={{ fontSize: 40 }}>🏝️</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.headline}>Mon île</Text>
            <Text style={type.footnote}>
              {visitors > 0
                ? `${visitors} ami${visitors > 1 ? 's' : ''} s'y promène${visitors > 1 ? 'nt' : ''} avec ${visitors > 1 ? 'leurs' : 'son'} animal`
                : 'Décore-la et invite tes amis : leurs animaux viendront s’y promener'}
            </Text>
          </View>
          <Pressable onPress={() => router.push({ pathname: '/world', params: { edit: '1' } })} style={styles.islandEdit} hitSlop={6}>
            <Ionicons name="hammer" size={16} color={colors.accent} />
          </Pressable>
          <Ionicons name="chevron-forward" size={18} color={colors.tertiary} />
        </Pressable>

        <Text style={styles.sectionTitle}>ACCESSOIRES</Text>
        <View style={styles.slots}>
          {SLOTS.map((slot) => {
            const item = SHOP_ITEMS.find((i) => i.id === pet.equipped[slot]);
            return (
              <Pressable key={slot} onPress={() => chooseItem(slot)} style={styles.slot}>
                <Text style={type.footnote}>{SLOT_NAMES[slot]}</Text>
                <Text style={[styles.slotItem, item && { color: RARITY_COLORS[item.rarity] }]} numberOfLines={2}>
                  {item ? item.name : 'Vide'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={() => router.push('/shop')} style={styles.shopButton}>
          <Ionicons name="bag-handle" size={20} color={colors.onAccent} />
          <Text style={styles.shopText}>Boutique</Text>
          <Text style={styles.shopSub}>{formatDuration(balance)} à dépenser</Text>
        </Pressable>

        {pets.length > 1 && (
          <>
            <Text style={styles.sectionTitle}>MA COLLECTION</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {pets.map((p, i) => {
                const sp = speciesById(p.species);
                const lv = levelFor(p.xp_seconds);
                const f = formFor(lv);
                return (
                  <Pressable
                    key={p.id}
                    disabled={i === 0 || busy}
                    onPress={() => switchPet(p.id)}
                    style={[styles.collectionItem, i === 0 && { borderColor: colors.accent }]}
                  >
                    <Text style={{ fontSize: 34 }}>{sp && f > 0 ? PLAN_EMOJI[sp.line[f - 1]] : '🥚'}</Text>
                    <Text style={styles.collectionName} numberOfLines={1}>
                      {displayName(sp, lv)}
                    </Text>
                    <Text style={[styles.collectionStage, { color: tierFor(lv).color }]}>{i === 0 ? 'Actif' : `Niv. ${lv}`}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={[type.footnote, { marginTop: 8 }]}>
              Seul l'animal actif gagne l'expérience de tes sessions. Touche un animal pour le choisir.
            </Text>
          </>
        )}

        <Pressable onPress={() => router.push('/bestiary')} style={styles.linkRow}>
          <Ionicons name="book" size={20} color={colors.accent} />
          <Text style={[type.headline, { flex: 1 }]}>Bestiaire · 100 animaux</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.tertiary} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: 20, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 8 },
  wallet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  walletText: { color: colors.accent, fontWeight: '700', fontSize: 15, fontVariant: ['tabular-nums'] },
  stage: { ...card, marginTop: 16, height: 360, overflow: 'hidden' },
  viewer: { flex: 1 },
  badge: { position: 'absolute', top: 14, left: 14, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  hint: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  hintText: { ...type.footnote, color: colors.secondary },
  xpCard: { ...card, marginTop: 12, padding: 16, gap: 8 },
  xpTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nextStage: { fontWeight: '700', fontSize: 15 },
  barTrack: { height: 8, backgroundColor: colors.fill, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  stages: { flexDirection: 'row', gap: 6, marginTop: 4 },
  stageDot: { flex: 1, height: 4, borderRadius: 2 },
  sectionTitle: { ...type.footnote, marginLeft: 4, marginTop: 20, marginBottom: 8 },
  slots: { flexDirection: 'row', gap: 8 },
  slot: { ...card, flex: 1, padding: 10, minHeight: 72, gap: 4 },
  slotItem: { fontSize: 14, fontWeight: '600', color: colors.tertiary },
  shopButton: {
    marginTop: 16,
    backgroundColor: colors.accent,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shopText: { color: colors.onAccent, fontSize: 17, fontWeight: '700', flex: 1 },
  shopSub: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },
  collectionItem: {
    ...card,
    width: 100,
    padding: 10,
    alignItems: 'center',
    gap: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  collectionName: { fontSize: 13, fontWeight: '600', color: colors.text },
  collectionStage: { fontSize: 12, fontWeight: '700' },
  island: { ...card, marginTop: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  islandEdit: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  linkRow: { ...card, marginTop: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
