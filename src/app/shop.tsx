import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PetView } from '../components/PetView';
import { RARITY_COLORS, SHOP_ITEMS, ShopItem, SLOT_NAMES, levelFor } from '../creatures/species';
import { useAuth } from '../lib/auth';
import { useSocial } from '../lib/social';
import { card, colors, type } from '../lib/theme';
import { formatDuration } from '../lib/time';

export default function Shop() {
  const { profile, reloadProfile } = useAuth();
  const { pets, inventory, buyItem, equipItem } = useSocial();
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

  const equippedPreview = pet
    ? { ...pet.equipped, ...(preview?.slot ? { [preview.slot]: preview.id } : {}) }
    : undefined;

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

      {pet && (
        <View style={styles.preview}>
          <PetView species={pet.species} level={levelFor(pet.xp_seconds)} equipped={equippedPreview} style={{ flex: 1 }} />
          <Text style={styles.previewHint}>
            {preview?.slot ? `Essai : ${preview.name}` : 'Touche un accessoire pour l’essayer'}
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.container}>
        <Text style={type.subhead}>Chaque heure de lock in = 1 h à dépenser ici.</Text>
        <View style={styles.grid}>
          {SHOP_ITEMS.map((item) => {
            const owned = item.kind === 'accessory' && inventory.includes(item.id);
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
                  {item.name}
                </Text>
                <Text style={type.footnote}>{item.slot ? SLOT_NAMES[item.slot] : 'Éclot en un animal au hasard'}</Text>
                {owned ? (
                  <View style={[styles.buy, { backgroundColor: colors.successSoft }]}>
                    <Text style={[styles.buyText, { color: colors.success }]}>Possédé ✓</Text>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
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
