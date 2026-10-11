import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { WorldView } from '../components/WorldView';
import { displayName, levelFor, ownsItem, RARITY_COLORS, SHOP_ITEMS, ShopItem, speciesById, tierFor } from '../creatures/species';
import { useAuth } from '../lib/auth';
import { useSocial } from '../lib/social';
import { colors, type } from '../lib/theme';
import { PetSpec } from '../world/scene';
import { isTile, MAX_OBJECTS, objectAt, placeObject, readWorld, removeAt, rotateAt, setTile, World } from '../world/world';

type Tool = { kind: 'tile'; id: string } | { kind: 'object'; id: string } | { kind: 'erase' } | { kind: 'rotate' };
type Tab = 'tiles' | 'objects' | 'tools';

const TILES = SHOP_ITEMS.filter((i) => i.kind === 'garden' && i.slot === 'ground');
const OBJECTS = SHOP_ITEMS.filter((i) => i.kind === 'garden' && i.slot !== 'ground');

/** An island: mine (editable, all my friends' pets live on it) or a friend's (visit). */
export default function WorldScreen() {
  const params = useLocalSearchParams<{ user?: string; edit?: string; item?: string }>();
  const { profile, reloadProfile } = useAuth();
  const { pets, friends, friendPets, inventory, saveWorld } = useSocial();
  const host = params.user ? friends.find((f) => f.profile.id === params.user)?.profile : profile;
  const mine = !params.user || params.user === profile?.id;

  const saved = useMemo(() => readWorld(host?.world), [host?.world]);
  const [draft, setDraft] = useState<World | null>(params.edit && mine ? saved : null);
  const [tab, setTab] = useState<Tab>(params.item && isTile(params.item) ? 'tiles' : 'objects');
  const [tool, setTool] = useState<Tool>(
    params.item ? (isTile(params.item) ? { kind: 'tile', id: params.item } : { kind: 'object', id: params.item }) : { kind: 'object', id: 'pine' },
  );
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const editing = draft !== null;

  // Switching island closes the bubble.
  useEffect(() => setPicked(null), [params.user]);
  const world = draft ?? saved;

  // Who lives here: on my island, me and all my friends; on a friend's, them and me (visiting).
  const { specs, labels, owners } = useMemo(() => {
    const specs: PetSpec[] = [];
    const labels: Record<string, string> = {};
    const owners: Record<string, string> = {};
    const add = (ownerId: string, name: string, pet: (typeof pets)[number] | undefined) => {
      if (!pet) return;
      specs.push({ id: pet.id, species: pet.species, level: levelFor(pet.xp_seconds), equipped: pet.equipped });
      labels[pet.id] = name;
      owners[pet.id] = ownerId;
    };
    if (profile) add(profile.id, 'Toi', pets[0]);
    if (mine) for (const f of friends) add(f.profile.id, f.profile.display_name, friendPets[f.profile.id]);
    else if (host) add(host.id, host.display_name, friendPets[host.id]);
    return { specs, labels, owners };
  }, [profile, pets, friends, friendPets, mine, host]);

  if (!host) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={type.subhead}>Cette île n'est pas accessible.</Text>
        <Pressable onPress={() => router.back()} style={styles.pill}>
          <Text style={styles.pillText}>Retour</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const tapCell = (x: number, z: number) => {
    if (!draft) return;
    let next = draft;
    if (tool.kind === 'tile') next = setTile(draft, x, z, tool.id);
    else if (tool.kind === 'object') {
      if (!objectAt(draft, x, z) && draft.objects.length >= MAX_OBJECTS) {
        Alert.alert('Île pleine', `${MAX_OBJECTS} objets maximum. Enlève-en avec la gomme.`);
        return;
      }
      next = placeObject(draft, x, z, tool.id);
    } else if (tool.kind === 'erase') next = removeAt(draft, x, z);
    else next = rotateAt(draft, x, z);
    if (next !== draft) {
      Haptics.selectionAsync();
      setDraft(next);
    }
  };

  const choose = (item: ShopItem) => {
    if (!ownsItem(item, inventory)) {
      Alert.alert(item.name, `À débloquer dans la boutique pour ${item.costHours} h. Ensuite tu peux en poser autant que tu veux.`, [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Boutique', onPress: () => router.push({ pathname: '/shop', params: { tab: 'garden' } }) },
      ]);
      return;
    }
    setTool(item.slot === 'ground' ? { kind: 'tile', id: item.id } : { kind: 'object', id: item.id });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await saveWorld(draft);
      await reloadProfile();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDraft(null);
    } catch (e) {
      Alert.alert('Oups', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (draft === saved) return setDraft(null);
    Alert.alert('Annuler les changements ?', undefined, [
      { text: 'Continuer', style: 'cancel' },
      { text: 'Annuler', style: 'destructive', onPress: () => setDraft(null) },
    ]);
  };

  const renderFocus = (petId: string) => {
    const pet = [...pets, ...Object.values(friendPets)].find((p) => p.id === petId);
    if (!pet) return null;
    const ownerId = owners[petId];
    const friend = friends.find((f) => f.profile.id === ownerId);
    const level = levelFor(pet.xp_seconds);
    const tier = tierFor(level);
    const onTheirIsland = params.user === ownerId;
    return (
      <>
        <Text style={styles.focusName} numberOfLines={1}>
          {friend ? friend.profile.display_name : 'Toi'}
        </Text>
        <Text style={[styles.focusPet, { color: tier.color }]} numberOfLines={1}>
          {displayName(speciesById(pet.species), level)} · Niv. {level}
        </Text>
        {friend && !onTheirIsland ? (
          <Pressable
            onPress={() => {
              setPicked(null);
              router.setParams({ user: friend.profile.id });
            }}
            style={styles.focusButton}
          >
            <Text style={styles.focusButtonText}>🏝️ Voir son île</Text>
          </Pressable>
        ) : !friend && !mine ? (
          <Pressable
            onPress={() => {
              setPicked(null);
              router.setParams({ user: '' });
            }}
            style={styles.focusButton}
          >
            <Text style={styles.focusButtonText}>🏠 Rentrer sur mon île</Text>
          </Pressable>
        ) : null}
      </>
    );
  };
  const items = tab === 'tiles' ? TILES : OBJECTS;
  const selectedId = tool.kind === 'tile' || tool.kind === 'object' ? tool.id : null;

  return (
    <View style={styles.root}>
      <WorldView
        world={world}
        pets={specs}
        labels={labels}
        onTapCell={editing ? tapCell : () => setPicked(null)}
        onTapPet={editing ? undefined : (id) => setPicked(id)}
        focusId={editing ? null : picked}
        renderFocus={renderFocus}
        style={styles.fill}
      />

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.topRow}>
          {editing ? (
            <>
              <Pressable onPress={cancel} style={styles.pill}>
                <Text style={styles.pillText}>Annuler</Text>
              </Pressable>
              <Text style={styles.count}>
                {world.objects.length}/{MAX_OBJECTS} objets
              </Text>
              <Pressable onPress={save} disabled={saving} style={[styles.pill, styles.pillAccent]}>
                {saving ? <ActivityIndicator color={colors.onAccent} /> : <Text style={[styles.pillText, { color: colors.onAccent }]}>Enregistrer</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={() => router.back()} style={styles.round} accessibilityLabel="Retour">
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </Pressable>
              <View style={styles.titleBox}>
                <Text style={styles.title} numberOfLines={1}>
                  {mine ? 'Mon île' : `Île de ${host.display_name}`}
                </Text>
                <Text style={styles.subtitle}>
                  {mine ? `${specs.length - 1} ami${specs.length - 1 > 1 ? 's' : ''} sur ton île` : 'Tu es en visite'}
                </Text>
              </View>
              {mine && (
                <Pressable onPress={() => setDraft(saved)} style={[styles.pill, styles.pillAccent]}>
                  <Ionicons name="hammer" size={15} color={colors.onAccent} />
                  <Text style={[styles.pillText, { color: colors.onAccent }]}>Modifier</Text>
                </Pressable>
              )}
            </>
          )}
        </View>

        {!editing && friends.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.visits}>
            <Pressable onPress={() => router.setParams({ user: '' })} style={[styles.visit, mine && styles.visitActive]}>
              <Text style={{ fontSize: 18 }}>🏝️</Text>
              <Text style={styles.visitText}>Chez moi</Text>
            </Pressable>
            {friends.map((f) => (
              <Pressable
                key={f.profile.id}
                onPress={() => router.setParams({ user: f.profile.id })}
                style={[styles.visit, params.user === f.profile.id && styles.visitActive]}
              >
                <Avatar name={f.profile.display_name} photoUri={f.profile.avatar_url} size={22} />
                <Text style={styles.visitText} numberOfLines={1}>
                  {f.profile.display_name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>

      {editing && (
        <SafeAreaView edges={['bottom']} style={styles.bottom} pointerEvents="box-none">
          <View style={styles.palette}>
            <View style={styles.tabs}>
              {(
                [
                  ['objects', 'Objets'],
                  ['tiles', 'Sols'],
                  ['tools', 'Outils'],
                ] as const
              ).map(([t, label]) => (
                <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
                  <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            {tab === 'tools' ? (
              <View style={styles.tools}>
                {(
                  [
                    ['erase', 'Gomme', 'trash-outline'],
                    ['rotate', 'Tourner', 'refresh'],
                  ] as const
                ).map(([k, label, icon]) => (
                  <Pressable key={k} onPress={() => setTool({ kind: k })} style={[styles.item, styles.toolItem, tool.kind === k && styles.itemActive]}>
                    <Ionicons name={icon} size={24} color={colors.text} />
                    <Text style={styles.itemName}>{label}</Text>
                  </Pressable>
                ))}
                <Text style={[type.footnote, { flex: 1 }]}>Touche un objet sur l'île pour l'enlever ou le tourner.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.items}>
                {items.map((item) => {
                  const owned = ownsItem(item, inventory);
                  return (
                    <Pressable key={item.id} onPress={() => choose(item)} style={[styles.item, selectedId === item.id && styles.itemActive]}>
                      <Text style={[styles.itemEmoji, !owned && { opacity: 0.35 }]}>{item.emoji}</Text>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={[styles.itemPrice, { color: owned ? colors.success : RARITY_COLORS[item.rarity] }]}>
                        {owned ? '✓' : `🔒 ${item.costHours} h`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            <Text style={styles.hint}>
              {tool.kind === 'tile'
                ? 'Touche des cases pour peindre le sol.'
                : tool.kind === 'object'
                  ? 'Touche une case pour poser l’objet. Glisse pour te déplacer, pince pour zoomer.'
                  : tool.kind === 'erase'
                    ? 'Touche un objet pour l’enlever.'
                    : 'Touche un objet pour le tourner.'}
            </Text>
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

const glass = { backgroundColor: 'rgba(255,255,255,0.92)' };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#CFEBFF' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8 },
  round: { ...glass, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  titleBox: { ...glass, flex: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 12, color: colors.secondary, fontWeight: '600' },
  pill: { ...glass, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, height: 40, justifyContent: 'center' },
  pillAccent: { backgroundColor: colors.accent },
  pillText: { fontSize: 15, fontWeight: '700', color: colors.text },
  count: { ...glass, flex: 1, textAlign: 'center', borderRadius: 999, paddingVertical: 10, fontWeight: '700', color: colors.secondary, overflow: 'hidden' },
  visits: { gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  visit: { ...glass, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 150 },
  visitActive: { borderWidth: 2, borderColor: colors.accent },
  visitText: { fontSize: 13, fontWeight: '600', color: colors.text },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  palette: { ...glass, margin: 10, borderRadius: 20, paddingVertical: 10, gap: 8 },
  tabs: { flexDirection: 'row', backgroundColor: colors.fill, borderRadius: 10, padding: 2, marginHorizontal: 12 },
  tab: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: colors.card },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.secondary },
  tabTextActive: { color: colors.text },
  items: { gap: 8, paddingHorizontal: 12 },
  item: { width: 78, borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', paddingVertical: 8, gap: 2, borderWidth: 2, borderColor: 'transparent' },
  itemActive: { borderColor: colors.accent },
  itemEmoji: { fontSize: 26 },
  itemName: { fontSize: 11, fontWeight: '600', color: colors.text, paddingHorizontal: 4 },
  itemPrice: { fontSize: 11, fontWeight: '700' },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  toolItem: { height: 78, justifyContent: 'center' },
  hint: { ...type.footnote, marginHorizontal: 14 },
  focusName: { fontSize: 17, fontWeight: '800', color: colors.text },
  focusPet: { fontSize: 13, fontWeight: '700' },
  focusButton: { marginTop: 2, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  focusButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 14 },
});
