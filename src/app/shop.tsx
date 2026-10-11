import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PetView } from '../components/PetView';
import { GARDEN_SLOT_NAMES, GardenSlot, levelFor, ownsItem, RARITY_COLORS, SHOP_ITEMS, ShopItem, Slot, SLOT_NAMES } from '../creatures/species';
import { useAuth } from '../lib/auth';
import { useSocial } from '../lib/social';
import { card, colors, type } from '../lib/theme';
import { formatDuration } from '../lib/time';

export default function Shop() {
  const { profile, reloadProfile } = useAuth();
  const { pets, inventory, buyItem, equipItem } = useSocial();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<'pet' | 'garden'>(params.tab === 'garden' ? 'garden' : 'pet');
  const [preview, setPreview] = useState<ShopItem | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const pet = pets[0] ?? null;
  const balance = Math.max(0, (profile?.total_seconds ?? 0) - (profile?.spent_seconds ?? 0));

  const buy = (item: ShopItem) => {
    if (balance < item.costHours * 3600) {
      Alert.alert("Pas assez d'heures", `Il te manque ${formatDuration(item.costHours * 3600 - balance)} de lock in 💪`);
      return;
    }
    Alert.alert(`Acheter ${item.name} ?`, `Pour ${item.costHours} h de lock in.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Acheter',
        onPress: async () => {
          setBuying(item.id);
          try {
            await buyItem(item.id);
            await reloadProfile();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (item.kind === 'egg') {
              Alert.alert('Nouvel œuf 🥚', "Il est dans ta collection. Choisis-le comme animal actif pour le faire éclore.");
            } else if (item.kind === 'upgrade') {
              const sea = item.id === 'sea';
              Alert.alert(
                sea ? 'La mer arrive 🌊' : 'Ton île s’agrandit 🏝️',
                sea ? 'Tu peux maintenant mettre des bateaux autour de ton île.' : 'Tout ce que tu as construit reste au milieu.',
                [
                  { text: 'Plus tard', style: 'cancel' },
                  { text: 'Voir mon île', onPress: () => router.replace({ pathname: '/world', params: sea ? { edit: '1', sea: '1' } : { edit: '1', grow: '1' } }) },
                ],
              );
            } else if (item.kind === 'garden' && item.slot) {
              Alert.alert(`${item.name} débloqué 🎉`, 'Tu peux en poser autant que tu veux sur ton île.', [
                { text: 'Plus tard', style: 'cancel' },
                {
                  text: 'Le poser',
                  onPress: () => router.replace({ pathname: '/world', params: { edit: '1', item: item.id } }),
                },
              ]);
            } else if (pet && item.slot) {
              Alert.alert(`${item.name} acheté 🎉`, 'Tu veux le mettre tout de suite ?', [
                { text: 'Plus tard', style: 'cancel' },
                { text: 'Équiper', onPress: () => equipItem(pet.id, item.slot!, item.id).catch(() => {}) },
              ]);
            }
          } catch (e) {
            Alert.alert('Oups', (e as Error).message);
          } finally {
            setBuying(null);
          }
        },
      },
    ]);
  };

  const trying = preview?.kind === 'accessory' ? preview : null;
  const equippedPreview = pet ? { ...pet.equipped, ...(trying?.slot ? { [trying.slot]: trying.id } : {}) } : undefined;
  // Sections of the shop, in order.
  const sections: { title: string; items: ShopItem[] }[] =
    tab === 'garden'
      ? [
          { title: 'Agrandir l’île', items: SHOP_ITEMS.filter((i) => i.kind === 'upgrade') },
          ...(['house', 'tree', 'deco', 'boat', 'ground'] as const).map((slot) => ({
            title: { house: 'Maisons', tree: 'Arbres et plantes', deco: 'Déco', boat: 'Bateaux', ground: 'Sols' }[slot],
            items: SHOP_ITEMS.filter((i) => i.kind === 'garden' && i.slot === slot),
          })),
        ]
      : [
          { title: 'Œuf', items: SHOP_ITEMS.filter((i) => i.kind === 'egg') },
          ...(['head', 'eyes', 'neck', 'back'] as const).map((slot) => ({
            title: { head: 'Chapeaux', eyes: 'Lunettes', neck: 'Cou', back: 'Dos' }[slot],
            items: SHOP_ITEMS.filter((i) => i.kind === 'accessory' && i.slot === slot),
          })),
        ];
  /** Bigger islands are bought in order: 20×20 before 24×24, etc. */
  const lockedBy = (item: ShopItem): string | null => {
    const m = /^size(\d+)$/.exec(item.id);
    if (!m || m[1] === '20') return null;
    const before = `size${Number(m[1]) - 4}`;
    return inventory.includes(before) ? null : `Après ${Number(m[1]) - 4}×${Number(m[1]) - 4}`;
  };
  const slotName = (item: ShopItem) =>
    item.kind === 'garden' ? GARDEN_SLOT_NAMES[item.slot as GardenSlot] : SLOT_NAMES[item.slot as Slot];
  const describe = (item: ShopItem) =>
    item.kind === 'upgrade'
      ? item.id === 'sea'
        ? 'Pour mettre des bateaux'
        : 'Plus de place pour construire'
      : item.slot
        ? slotName(item)
        : 'Éclot en un animal au hasard';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={type.title}>Boutique</Text>
        <View style={styles.wallet}>
          <Ionicons name="hourglass" size={16} color={colors.accent} />
          <Text style={styles.walletText}>{formatDuration(balance)}</Text>
        </View>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close}>
          <Ionicons name="close" size={20} color={colors.secondary} />
        </Pressable>
      </View>

      {pet && tab === 'pet' && (
        <View style={styles.preview}>
          <PetView species={pet.species} level={levelFor(pet.xp_seconds)} equipped={equippedPreview} style={{ flex: 1 }} />
          <Text style={styles.previewHint}>{trying ? `Essai : ${trying.name}` : 'Touche un accessoire pour l’essayer'}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.tabs}>
          {(['pet', 'garden'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => {
                setTab(t);
                setPreview(null);
              }}
              style={[styles.tab, tab === t && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === 'pet' ? 'Animal' : 'Île'}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={type.subhead}>
          {tab === 'garden'
            ? 'Agrandis ton île, ajoute la mer et des bateaux. Un objet débloqué se pose autant de fois que tu veux.'
            : 'Chaque heure de lock in = 1 h à dépenser ici.'}
        </Text>
        {sections.map((section) => (
        <View key={section.title} style={{ gap: 8 }}>
        <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
        <View style={styles.grid}>
          {section.items.map((item) => {
            const owned = item.kind !== 'egg' && ownsItem(item, inventory);
            const locked = owned ? null : lockedBy(item);
            const affordable = balance >= item.costHours * 3600;
            const color = item.kind === 'egg' ? colors.accent : RARITY_COLORS[item.rarity];
            return (
              <Pressable
                key={item.id}
                onPress={() => setPreview(item)}
                style={[styles.item, preview?.id === item.id && { borderColor: color }]}
              >
                <View style={[styles.rarity, { backgroundColor: color }]}>
                  <Text style={styles.rarityText}>{item.kind === 'egg' ? 'Nouvel animal' : item.rarity}</Text>
                </View>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.emoji ? `${item.emoji} ` : ''}
                  {item.name}
                </Text>
                <Text style={type.footnote}>{describe(item)}</Text>
                {owned ? (
                  <View style={[styles.buy, { backgroundColor: colors.successSoft }]}>
                    <Text style={[styles.buyText, { color: colors.success }]}>{item.costHours === 0 ? 'Gratuit ✓' : 'Possédé ✓'}</Text>
                  </View>
                ) : locked ? (
                  <View style={[styles.buy, { backgroundColor: colors.fill }]}>
                    <Text style={[styles.buyText, { color: colors.secondary, fontSize: 13 }]}>🔒 {locked}</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => buy(item)}
                    disabled={buying !== null}
                    style={[styles.buy, { backgroundColor: affordable ? colors.accent : colors.fill }]}
                  >
                    <Ionicons name="hourglass" size={13} color={affordable ? colors.onAccent : colors.secondary} />
                    <Text style={[styles.buyText, { color: affordable ? colors.onAccent : colors.secondary }]}>
                      {buying === item.id ? '…' : `${item.costHours} h`}
                    </Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })}
        </View>
        </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  wallet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 'auto',
  },
  walletText: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  preview: { ...card, height: 220, marginHorizontal: 20, marginTop: 12, overflow: 'hidden' },
  previewHint: { position: 'absolute', bottom: 8, alignSelf: 'center', ...type.footnote },
  container: { padding: 20, paddingBottom: 40, gap: 12 },
  tabs: { flexDirection: 'row', backgroundColor: colors.fill, borderRadius: 10, padding: 2 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: colors.card },
  tabText: { fontSize: 15, fontWeight: '600', color: colors.secondary },
  tabTextActive: { color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sectionTitle: { ...type.footnote, fontWeight: '700', marginTop: 8, marginLeft: 4 },
  item: { ...card, width: '48%', flexGrow: 1, padding: 12, gap: 6, borderWidth: 2, borderColor: 'transparent' },
  rarity: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  rarityText: { color: '#FFF', fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  itemName: { fontSize: 16, fontWeight: '700', color: colors.text },
  buy: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 9,
  },
  buyText: { fontWeight: '700', fontSize: 15 },
});
