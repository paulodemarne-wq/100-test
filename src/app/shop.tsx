import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PetView } from '../components/PetView';
import { GARDEN_SLOT_NAMES, GardenSlot, levelFor, monthlyAccessory, ownsItem, SHOP_ITEMS, ShopItem, Slot, SLOT_NAMES } from '../creatures/species';
import { useAuth } from '../lib/auth';
import { useSocial } from '../lib/social';
import { card, colors, type } from '../lib/theme';
import { formatDuration } from '../lib/time';
import { formatWallet, walletSeconds } from '../lib/wallet';
import { isPremium } from '../lib/premium';
import { errorMessage, supabase } from '../lib/supabase';

/** Time left before the daily shop changes (midnight, Paris time). */
function msUntilNextShop(now: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return (86400 - (get('hour') * 3600 + get('minute') * 60 + get('second'))) * 1000;
  } catch {
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }
}

export default function Shop() {
  const { profile, reloadProfile } = useAuth();
  const { pets, inventory, stock, buyItem, equipItem, deals, buyDeal, featured, refresh } = useSocial();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<'pet' | 'garden' | 'deals'>(
    params.tab === 'garden' ? 'garden' : params.tab === 'deals' ? 'deals' : 'pet',
  );
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const dealFor = (item: ShopItem) => (tab === 'deals' ? deals.find((d) => d.item_id === item.id) ?? null : null);
  /** Price in hours, with the deal applied on the featured shop. */
  const priceOf = (item: ShopItem) => {
    const d = dealFor(item);
    return d ? Math.round(item.costHours * (100 - d.percent)) / 100 : item.costHours;
  };
  const [preview, setPreview] = useState<ShopItem | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const pet = pets[0] ?? null;
  const balance = walletSeconds(profile);

  const premium = isPremium(profile);
  const buy = (item: ShopItem) => {
    if (item.premium && !premium) {
      router.push('/premium');
      return;
    }
    if (item.monthly) {
      // Free for subscribers during its month, kept for good.
      setBuying(item.id);
      supabase
        .rpc('claim_monthly_accessory')
        .then(async ({ error }) => {
          if (error) return Alert.alert('Oups', errorMessage(error));
          await refresh();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(`${item.name} récupéré 🎁`, 'Il est à toi pour de bon. Équipe-le sur ton animal.');
        })
        .then(() => setBuying(null));
      return;
    }
    const deal = dealFor(item);
    const price = priceOf(item);
    if (balance < price * 3600) {
      Alert.alert("Pas assez d'heures", `Il te manque ${formatDuration(price * 3600 - balance)} de vainc 💪`);
      return;
    }
    Alert.alert(
      price === 0 ? `Prendre ${item.name} ?` : `Acheter ${item.name} ?`,
      price === 0 ? 'C’est offert 🎁' : deal ? `Pour ${price} h au lieu de ${item.costHours} h.` : `Pour ${item.costHours} h de vainc.`,
      [
      { text: 'Annuler', style: 'cancel' },
      {
        text: price === 0 ? 'Le prendre' : 'Acheter',
        onPress: async () => {
          setBuying(item.id);
          try {
            if (deal) await buyDeal(item.id);
            else await buyItem(item.id);
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
              const tile = item.slot === 'ground';
              Alert.alert(
                tile ? `${item.name} débloqué 🎉` : `1 ${item.name.toLowerCase()} ajouté à ton stock 🎉`,
                tile ? 'Tu peux en peindre autant que tu veux sur ton île.' : 'Pose-le sur ton île quand tu veux.',
                [
                { text: 'Plus tard', style: 'cancel' },
                {
                  text: 'Le poser',
                  onPress: () => router.replace({ pathname: '/world', params: { edit: '1', item: item.id } }),
                },
                ],
              );
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
      ],
    );
  };

  const trying = preview?.kind === 'accessory' ? preview : null;
  const equippedPreview = pet ? { ...pet.equipped, ...(trying?.slot ? { [trying.slot]: trying.id } : {}) } : undefined;
  // Sections of the shop, in order.
  const sections: { title: string; items: ShopItem[] }[] =
    tab === 'deals'
      ? [
          {
            title: `Boutique du jour${featured[0] ? ` de ${featured[0].display_name}` : ''}`,
            items: deals
              .slice()
              .sort((a, b) => b.percent - a.percent)
              .map((d) => SHOP_ITEMS.find((i) => i.id === d.item_id))
              .filter((i): i is ShopItem => !!i),
          },
        ]
      : tab === 'garden'
      ? [
          { title: 'Agrandir l’île', items: SHOP_ITEMS.filter((i) => i.kind === 'upgrade') },
          ...(['house', 'tree', 'deco', 'boat', 'ground'] as const).map((slot) => ({
            title: { house: 'Maisons', tree: 'Arbres et plantes', deco: 'Déco', boat: 'Bateaux', ground: 'Sols' }[slot],
            items: SHOP_ITEMS.filter((i) => i.kind === 'garden' && i.slot === slot),
          })),
        ]
      : [
          {
            title: 'Accessoire du mois · Vainc+',
            items: SHOP_ITEMS.filter((i) => i.monthly && (i.id === monthlyAccessory() || inventory.includes(i.id))),
          },
          { title: 'Œuf', items: SHOP_ITEMS.filter((i) => i.kind === 'egg') },
          ...(['head', 'eyes', 'neck', 'back'] as const).map((slot) => ({
            title: { head: 'Chapeaux', eyes: 'Lunettes', neck: 'Cou', back: 'Dos' }[slot],
            items: SHOP_ITEMS.filter((i) => i.kind === 'accessory' && i.slot === slot && !i.monthly),
          })),
        ];
  /** Bigger islands are bought in order: 20×20 before 24×24, etc. */
  const lockedBy = (item: ShopItem): string | null => {
    if (item.premium && !premium) return 'Vainc+';
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
          <Text style={styles.walletText}>{formatWallet(balance)}</Text>
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
          {(deals.length > 0 ? (['pet', 'garden', 'deals'] as const) : (['pet', 'garden'] as const)).map((t) => (
            <Pressable
              key={t}
              onPress={() => {
                setTab(t);
                setPreview(null);
              }}
              style={[styles.tab, tab === t && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === 'pet' ? 'Animal' : t === 'garden' ? 'Île' : '🛍️ Du jour'}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={type.subhead}>
          {tab === 'deals'
            ? `Chaque jour, une nouvelle boutique : 6 promos et un cadeau offert. Nouvelle boutique dans ${formatDuration(Math.max(60, Math.floor(msUntilNextShop(now) / 1000)))}.`
            : tab === 'garden'
            ? 'Agrandis ton île, ajoute la mer et des bateaux. Chaque objet acheté = 1 objet à poser ; les sols se débloquent une fois.'
            : 'Chaque heure de vainc = 1 h à dépenser ici.'}
        </Text>
        {sections.map((section) => (
        <View key={section.title} style={{ gap: 8 }}>
        <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
        <View style={styles.grid}>
          {section.items.map((item) => {
            const deal = dealFor(item);
            const price = priceOf(item);
            // Island objects are bought one by one (never "owned" for good), the rest once.
            const perPiece = item.kind === 'garden' && item.slot !== 'ground' && item.costHours > 0;
            const owned = !perPiece && item.kind !== 'egg' && ownsItem(item, inventory, premium);
            const locked = owned ? null : lockedBy(item);
            const affordable = balance >= price * 3600;
            const color = item.premium ? '#B7791F' : item.kind === 'egg' ? colors.accent : colors.secondary;
            return (
              <Pressable
                key={item.id}
                onPress={() => setPreview(item)}
                style={[styles.item, preview?.id === item.id && { borderColor: color }]}
              >
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <View style={[styles.rarity, { backgroundColor: color }]}>
                    <Text style={styles.rarityText}>{item.premium ? 'Vainc+' : item.kind === 'egg' ? 'Nouvel animal' : item.kind === 'accessory' ? 'Accessoire' : item.kind === 'upgrade' ? 'Île' : 'Déco'}</Text>
                  </View>
                  {deal && (
                    <View style={[styles.rarity, { backgroundColor: deal.percent === 100 ? colors.success : colors.danger }]}>
                      <Text style={styles.rarityText}>{deal.percent === 100 ? '🎁 Offert' : `-${deal.percent} %`}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.emoji ? `${item.emoji} ` : ''}
                  {item.name}
                </Text>
                <Text style={type.footnote}>
                  {perPiece && stock[item.id] ? `${stock[item.id]} acheté${stock[item.id] > 1 ? 's' : ''} · ` : ''}
                  {describe(item)}
                </Text>
                {owned ? (
                  <View style={[styles.buy, { backgroundColor: colors.successSoft }]}>
                    <Text style={[styles.buyText, { color: colors.success }]}>{item.costHours === 0 ? 'Gratuit ✓' : 'Possédé ✓'}</Text>
                  </View>
                ) : locked ? (
                  <Pressable onPress={() => item.premium && router.push('/premium')} style={[styles.buy, { backgroundColor: colors.fill }]}>
                    <Text style={[styles.buyText, { color: colors.secondary, fontSize: 13 }]}>🔒 {locked}</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => buy(item)}
                    disabled={buying !== null}
                    style={[styles.buy, { backgroundColor: affordable ? colors.accent : colors.fill }]}
                  >
                    <Ionicons name="hourglass" size={13} color={affordable ? colors.onAccent : colors.secondary} />
                    {deal && price < item.costHours && (
                      <Text style={[styles.buyText, styles.oldPrice, { color: affordable ? colors.onAccent : colors.secondary }]}>
                        {item.costHours} h
                      </Text>
                    )}
                    <Text style={[styles.buyText, { color: affordable ? colors.onAccent : colors.secondary }]}>
                      {buying === item.id ? '…' : item.monthly ? 'Récupérer 🎁' : price === 0 ? 'Gratuit' : `${price} h`}
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
  oldPrice: { textDecorationLine: 'line-through', opacity: 0.7, fontSize: 13 },
  buyText: { fontWeight: '700', fontSize: 15 },
});
