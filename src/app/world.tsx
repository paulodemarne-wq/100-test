import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { WorldView } from '../components/WorldView';
import { displayName, GARDEN_SLOT_NAMES, GardenSlot, levelFor, ownsItem, SHOP_ITEMS, ShopItem, speciesById, tierFor } from '../creatures/species';
import { useAuth } from '../lib/auth';
import { useSocial } from '../lib/social';
import { colors, type } from '../lib/theme';
import { formatDuration } from '../lib/time';
import { PetSpec } from '../world/scene';
import {
  canPlace,
  isBoat,
  isTile,
  MAX_OBJECTS,
  objectAt,
  ownedSize,
  ownsSea,
  placeObject,
  readWorld,
  removeAt,
  resizeWorld,
  rotateAt,
  setTile,
  SIZES,
  ISLAND_GROUND,
  TILE_CHARS,
  World,
} from '../world/world';
import { walletSeconds } from '../lib/wallet';
import { decorationOf, isPremium } from '../lib/premium';
import { Named } from '../components/Badge';

/** What a tap does: nothing special (select objects), paint a ground, or put an object down. */
type Tool = { kind: 'none' } | { kind: 'tile'; id: string } | { kind: 'object'; id: string };
type Cell = [number, number];
type Tab = 'tiles' | 'objects' | 'tools';

const TILES = SHOP_ITEMS.filter((i) => i.kind === 'garden' && i.slot === 'ground');
const OBJECTS = SHOP_ITEMS.filter((i) => i.kind === 'garden' && i.slot !== 'ground');

/** An island: mine (editable, all my friends' pets live on it) or a friend's (visit). */
export default function WorldScreen() {
  const params = useLocalSearchParams<{ user?: string; edit?: string; item?: string; grow?: string; sea?: string }>();
  const { profile, reloadProfile } = useAuth();
  const { pets, friends, friendPets, inventory, stock, saveWorld, featured, buyItem } = useSocial();
  const host = params.user
    ? (friends.find((f) => f.profile.id === params.user)?.profile ?? featured.find((p) => p.id === params.user))
    : profile;
  const hostFeatured = !!host?.featured && host.id !== profile?.id;
  // A featured island (also my own if I'm featured) has the daily shop building.
  const shopIsland = !!host?.featured;
  const mine = !params.user || params.user === profile?.id;

  const rawWorld = host?.world;
  const saved = useMemo(() => readWorld(rawWorld, ISLAND_GROUND), [rawWorld]);
  // My island is always editable (Clash of Clans style) and saves itself.
  // draft = my changes not saved yet. Coming from the shop after buying a bigger island or the sea: apply it right away.
  const [draft, setDraft] = useState<World | null>(() => {
    if (!mine || (!params.grow && !params.sea)) return null;
    let w = saved;
    if (params.grow) w = resizeWorld(w, ownedSize(inventory));
    if (params.sea && ownsSea(inventory)) w = { ...w, sea: true };
    return w;
  });
  const [shopOpen, setShopOpen] = useState(!!params.edit || !!params.item);
  const [selected, setSelected] = useState<Cell | null>(null);
  /** An object being dragged with the finger: where it was and where it is now. */
  const [drag, setDrag] = useState<{ from: Cell; to: Cell } | null>(null);
  const [tab, setTab] = useState<Tab>(params.item && isTile(params.item) ? 'tiles' : 'objects');
  const [tool, setTool] = useState<Tool>(
    params.item ? (isTile(params.item) ? { kind: 'tile', id: params.item } : { kind: 'object', id: params.item }) : { kind: 'none' },
  );
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<GardenSlot>(
    (params.item && SHOP_ITEMS.find((i) => i.id === params.item)?.slot as GardenSlot) || 'house',
  );
  const [picked, setPicked] = useState<string | null>(null);
  // Visiting someone else closes the bubble and the selection.
  useEffect(() => {
    setPicked(null);
    setSelected(null);
    setDrag(null);
  }, [params.user]);
  /** My island as it is now (with my latest changes). */
  const current = mine ? (draft ?? saved) : saved;
  // While dragging, show the object where the finger is.
  const world = useMemo(
    () =>
      drag
        ? { ...current, objects: current.objects.map((o) => (o[1] === drag.from[0] && o[2] === drag.from[1] ? ([o[0], drag.to[0], drag.to[1], o[3]] as typeof o) : o)) }
        : current,
    [current, drag],
  );

  // Save a moment after the last change (and when leaving the island).
  const unsaved = useRef<World | null>(null);
  const saver = useRef({ saveWorld, reloadProfile });
  saver.current = { saveWorld, reloadProfile };
  useEffect(() => {
    if (!draft) return;
    unsaved.current = draft;
    const timer = setTimeout(async () => {
      unsaved.current = null;
      setSaving(true);
      try {
        await saver.current.saveWorld(draft);
        await saver.current.reloadProfile();
        setDraft((d) => (d === draft ? null : d));
      } catch (e) {
        Alert.alert('Oups', `${(e as Error).message}\nTon île revient comme avant.`);
        setDraft(null);
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(
    () => () => {
      if (unsaved.current) saver.current.saveWorld(unsaved.current).then(saver.current.reloadProfile).catch(() => {});
    },
    [],
  );

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
    else if (host && !host.featured) add(host.id, host.display_name, friendPets[host.id]);
    // Featured accounts visit every island.
    for (const f of featured) if (!owners[friendPets[f.id]?.id ?? '']) add(f.id, `⭐ ${f.display_name}`, friendPets[f.id]);
    return { specs, labels, owners };
  }, [profile, pets, friends, friendPets, mine, host, featured]);

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

  const itemOf = (id: string) => SHOP_ITEMS.find((i) => i.id === id);
  const nameOf = (id: string) => itemOf(id)?.name.toLowerCase() ?? 'cet objet';
  /** How many of an object can still be placed without paying (Infinity if free). */
  const available = (id: string, w: World = current) => {
    const item = itemOf(id);
    if (!item || item.costHours === 0) return Infinity;
    const placed = w.objects.filter((o) => o[0] === id).length;
    return (stock[id] ?? 0) - placed;
  };
  const balance = walletSeconds(profile);

  /** Puts the object down (asking first if it replaces another one), then goes back to neutral. */
  const putDown = (base: World, id: string, x: number, z: number) => {
    const occupant = objectAt(base, x, z);
    const apply = () => {
      setDraft((d) => placeObject(d ?? saved, x, z, id));
      setTool({ kind: 'none' });
      setShopOpen(false);
      setSelected([x, z]);
      Haptics.selectionAsync();
    };
    if (occupant && occupant[0] !== id) {
      Alert.alert(`Remplacer ${nameOf(occupant[0])} ?`, `${itemOf(occupant[0])?.name ?? 'L’objet'} retourne dans ton stock.`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Remplacer', style: 'destructive', onPress: apply },
      ]);
    } else apply();
  };

  /** On my island: tap an object to select it, or use the tool picked in the Magasin. Returns whether it worked (the cell lights green or red). */
  const tapCell = (x: number, z: number, object: Cell | null): boolean | void => {
    const draft = current;
    if (tool.kind === 'none') {
      setPicked(null);
      if (!object) return setSelected(null);
      Haptics.selectionAsync();
      setSelected((sel) => (sel && sel[0] === object[0] && sel[1] === object[1] ? null : object));
      return;
    }
    if (tool.kind === 'tile') {
      const next = setTile(draft, x, z, tool.id);
      if (next === draft) return false;
      Haptics.selectionAsync();
      setDraft(next);
      return true;
    }

    // Placing an object.
    const id = tool.id;
    if (!objectAt(draft, x, z) && draft.objects.length >= MAX_OBJECTS) {
      Alert.alert('Île pleine', `${MAX_OBJECTS} objets maximum. Touche un objet puis « Supprimer » pour en enlever.`);
      return false;
    }
    if (!canPlace(draft, id, x, z)) {
      if (isBoat(id))
        Alert.alert(
          'Un bateau va sur l’eau',
          draft.sea ? 'Pose-le sur la mer autour de l’île, ou sur de l’eau peinte sur l’île.' : 'Pose-le sur de l’eau peinte sur l’île, ou achète la mer dans la boutique.',
        );
      return false;
    }
    // Replacing an object of the same kind frees one: no need to pay then.
    const occupant = objectAt(draft, x, z);
    if (occupant?.[0] === id) return false;
    if (available(id) > 0) {
      putDown(draft, id, x, z);
      return;
    }
    // None left in stock: buy one (each object is paid once, for one placement).
    const item = itemOf(id)!;
    if (balance < item.costHours * 3600) {
      Alert.alert("Pas assez d'heures", `${item.name} coûte ${item.costHours} h. Il te manque ${formatDuration(item.costHours * 3600 - balance)} de vainc 💪`);
      return false;
    }
    Alert.alert(`Acheter ${item.name.toLowerCase()} ?`, `1 ${item.name.toLowerCase()} pour ${item.costHours} h de vainc.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: `Payer ${item.costHours} h`,
        onPress: async () => {
          try {
            await buyItem(id);
            await reloadProfile();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            putDown(draft, id, x, z);
          } catch (e) {
            Alert.alert('Oups', (e as Error).message);
          }
        },
      },
    ]);
  };

  const openShop = (title: string, message: string) =>
    Alert.alert(title, message, [
      { text: 'Plus tard', style: 'cancel' },
      { text: 'Boutique', onPress: () => router.push({ pathname: '/shop', params: { tab: 'garden' } }) },
    ]);

  const premium = isPremium(profile);
  const choose = (item: ShopItem) => {
    // Vainc+ decorations: free, but only with Vainc+.
    if (item.premium && !premium) {
      Alert.alert(`${item.name} · Vainc+`, 'Cette déco est offerte avec Vainc+.', [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Voir Vainc+', onPress: () => router.push('/premium') },
      ]);
      return;
    }
    // Grounds are unlocked once in the shop; objects are paid one by one when placed.
    const freeGround = TILE_CHARS[item.id] === ISLAND_GROUND;
    if (item.slot === 'ground' && !ownsItem(item, inventory) && !freeGround) {
      Alert.alert(item.name, `À débloquer dans la boutique pour ${item.costHours} h. Ensuite tu peux en peindre autant que tu veux.`, [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Boutique', onPress: () => router.push({ pathname: '/shop', params: { tab: 'garden' } }) },
      ]);
      return;
    }
    setTool(item.slot === 'ground' ? { kind: 'tile', id: item.id } : { kind: 'object', id: item.id });
  };

  const selectedObject = selected ? objectAt(world, selected[0], selected[1]) : undefined;

  /** Supprimer (with "are you sure?"): the object goes back to the stock. */
  const removeSelected = () => {
    if (!selectedObject) return;
    const [id, x, z] = selectedObject;
    Alert.alert(`Supprimer ${nameOf(id)} ?`, itemOf(id)?.costHours ? 'Êtes-vous sûr ? Il retournera dans ton stock : tu pourras le reposer sans repayer.' : 'Êtes-vous sûr ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          setDraft(removeAt(current, x, z));
          setSelected(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  const rotateSelected = () => {
    if (!selected) return;
    Haptics.selectionAsync();
    setDraft(rotateAt(current, selected[0], selected[1]));
  };

  // Hold an object to pick it up, slide to move it, let go to put it down.
  const dragStart = (x: number, z: number) => {
    if (!mine || tool.kind !== 'none' || !objectAt(current, x, z)) return false;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPicked(null);
    setSelected([x, z]);
    setDrag({ from: [x, z], to: [x, z] });
    return true;
  };
  const dragMove = (x: number, z: number) => {
    if (!drag) return;
    const moving = objectAt(current, drag.from[0], drag.from[1]);
    const other = objectAt(current, x, z);
    // Only on a free cell where this object is allowed (boats on water).
    if (!moving || (other && other !== moving) || !canPlace(current, moving[0], x, z)) return;
    Haptics.selectionAsync();
    setSelected([x, z]);
    setDrag({ ...drag, to: [x, z] });
  };
  const dragEnd = () => {
    if (!drag) return;
    const { from, to } = drag;
    setDrag(null);
    setSelected(to);
    if (from[0] === to[0] && from[1] === to[1]) return;
    setDraft({ ...current, objects: current.objects.map((o) => (o[1] === from[0] && o[2] === from[1] ? [o[0], to[0], to[1], o[3]] : o)) });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  /** Outside the editor: tapping the shop building opens today's shop. */
  const tapIsland = (x: number, z: number, object: [number, number] | null) => {
    setPicked(null);
    if (!shopIsland) return;
    const isShop = (cx: number, cz: number) => world.objects.some((o) => o[0] === 'boutique' && Math.abs(o[1] - cx) <= 1 && Math.abs(o[2] - cz) <= 1);
    const nearShop = isShop(x, z) || (!!object && isShop(object[0], object[1]));
    if (nearShop) {
      Haptics.selectionAsync();
      router.push({ pathname: '/shop', params: { tab: 'deals' } });
    }
  };

  const renderFocus = (petId: string) => {
    const pet = [...pets, ...Object.values(friendPets)].find((p) => p.id === petId);
    if (!pet) return null;
    const ownerId = owners[petId];
    const friend = friends.find((f) => f.profile.id === ownerId)?.profile ?? featured.find((p) => p.id === ownerId);
    const level = levelFor(pet.xp_seconds);
    const tier = tierFor(level);
    const onTheirIsland = params.user === ownerId;
    return (
      <>
        <Text style={styles.focusName} numberOfLines={1}>
          {friend ? <Named person={friend} name={`${friend.featured ? '⭐ ' : ''}${friend.display_name}`} size={17} /> : 'Toi'}
        </Text>
        <Text style={[styles.focusPet, { color: tier.color }]} numberOfLines={1}>
          {displayName(speciesById(pet.species), level)} · Niv. {level}
        </Text>
        {friend && !onTheirIsland ? (
          <Pressable
            onPress={() => {
              setPicked(null);
              router.setParams({ user: friend.id });
            }}
            style={styles.focusButton}
          >
            <Text style={styles.focusButtonText}>{friend.featured ? '🛍️ Voir son île et sa boutique' : '🏝️ Voir son île'}</Text>
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
  const items = tab === 'tiles' ? TILES : OBJECTS.filter((i) => i.slot === category);
  const selectedId = tool.kind === 'tile' || tool.kind === 'object' ? tool.id : null;

  return (
    <View style={styles.root}>
      <WorldView
        world={world}
        pets={specs}
        labels={labels}
        onTapCell={mine ? tapCell : tapIsland}
        markers={
          shopIsland && !selected
            ? world.objects
                .filter((o) => o[0] === 'boutique')
                .map((o) => ({ id: `${o[1]},${o[2]}`, x: o[1] + 0.5, y: 2.3, z: o[2] + 0.5, text: '🛍️ Boutique du jour' }))
            : undefined
        }
        onTapPet={
          tool.kind !== 'none'
            ? undefined
            : (id) => {
                setSelected(null);
                setPicked(id);
              }
        }
        focusId={tool.kind !== 'none' ? null : picked}
        renderFocus={renderFocus}
        selected={mine ? selected : null}
        selectedTop={
          <>
            {selectedObject?.[0] === 'boutique' && (
              <Pressable onPress={() => router.push({ pathname: '/shop', params: { tab: 'deals' } })} style={[styles.objButton, { backgroundColor: colors.accent }]}>
                <Text style={styles.objButtonText}>🛍️ Ouvrir</Text>
              </Pressable>
            )}
            <Pressable onPress={removeSelected} style={[styles.objButton, { backgroundColor: colors.danger }]}>
              <Ionicons name="trash" size={15} color="#FFFFFF" />
              <Text style={styles.objButtonText}>Supprimer</Text>
            </Pressable>
          </>
        }
        selectedBottom={
          <Pressable onPress={rotateSelected} style={[styles.objButton, { backgroundColor: colors.text }]}>
            <Ionicons name="refresh" size={15} color="#FFFFFF" />
            <Text style={styles.objButtonText}>Tourner</Text>
          </Pressable>
        }
        onDragStart={mine ? dragStart : undefined}
        onDragMove={dragMove}
        onDragEnd={dragEnd}
        style={styles.fill}
      />

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.topRow}>
          {
            <>
              <Pressable onPress={() => router.back()} style={styles.round} accessibilityLabel="Retour">
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </Pressable>
              <View style={styles.titleBox}>
                <Text style={styles.title} numberOfLines={1}>
                  {mine ? 'Mon île' : `Île de ${host.display_name}`}
                </Text>
                <Text style={styles.subtitle}>
                  {!mine
                    ? 'Tu es en visite'
                    : saving || draft
                      ? 'Enregistrement…'
                      : `${world.objects.length}/${MAX_OBJECTS} objets · ${specs.length - 1} animal${specs.length - 1 > 1 ? 'aux' : ''} en visite`}
                </Text>
              </View>
              {hostFeatured && (
                <Pressable onPress={() => router.push({ pathname: '/shop', params: { tab: 'deals' } })} style={[styles.pill, styles.pillAccent]}>
                  <Text style={[styles.pillText, { color: colors.onAccent }]}>🛍️ Boutique</Text>
                </Pressable>
              )}
              {mine && (
                <Pressable
                  onPress={() => {
                    setShopOpen((o) => !o);
                    setTool({ kind: 'none' });
                    setSelected(null);
                  }}
                  style={[styles.pill, shopOpen ? styles.pill : styles.pillAccent]}
                >
                  <Ionicons name={shopOpen ? 'close' : 'storefront'} size={15} color={shopOpen ? colors.text : colors.onAccent} />
                  <Text style={[styles.pillText, { color: shopOpen ? colors.text : colors.onAccent }]}>{shopOpen ? 'Fermer' : 'Magasin'}</Text>
                </Pressable>
              )}
            </>
          }
        </View>

        {!shopOpen && (friends.length > 0 || featured.length > 0) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.visits}>
            <Pressable onPress={() => router.setParams({ user: '' })} style={[styles.visit, mine && styles.visitActive]}>
              <Text style={{ fontSize: 18 }}>🏝️</Text>
              <Text style={styles.visitText}>Chez moi</Text>
            </Pressable>
            {featured.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => router.setParams({ user: f.id })}
                style={[styles.visit, styles.visitFeatured, params.user === f.id && styles.visitActive]}
              >
                <Text style={{ fontSize: 16 }}>⭐</Text>
                <Text style={styles.visitText} numberOfLines={1}>
                  {f.display_name}
                </Text>
              </Pressable>
            ))}
            {friends.map((f) => (
              <Pressable
                key={f.profile.id}
                onPress={() => router.setParams({ user: f.profile.id })}
                style={[styles.visit, params.user === f.profile.id && styles.visitActive]}
              >
                <Avatar name={f.profile.display_name} photoUri={f.profile.avatar_url} decoration={decorationOf(f.profile)} size={22} />
                <Text style={styles.visitText} numberOfLines={1}>
                  {f.profile.display_name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>

      {mine && !shopOpen && !selected && !picked && (
        <SafeAreaView edges={['bottom']} style={styles.bottom} pointerEvents="none">
          <Text style={styles.tip}>Touche un objet pour le choisir · maintiens-le pour le déplacer</Text>
        </SafeAreaView>
      )}

      {mine && shopOpen && (
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
              <View style={{ gap: 8 }}>
                <View style={styles.tools}>
                  <Pressable
                    onPress={() => {
                      if (!ownsSea(inventory)) return openShop('La mer', 'Achète la mer pour entourer ton île d’eau et y mettre des bateaux.');
                      setDraft({ ...current, sea: !current.sea });
                    }}
                    style={[styles.item, styles.toolItem, world.sea && styles.itemActive]}
                  >
                    <Text style={[styles.itemEmoji, !ownsSea(inventory) && { opacity: 0.35 }]}>🌊</Text>
                    <Text style={styles.itemName}>{world.sea ? 'Mer ✓' : 'Mer'}</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.items}>
                  {SIZES.map((size) => {
                    const unlocked = size <= ownedSize(inventory);
                    return (
                      <Pressable
                        key={size}
                        onPress={() => {
                          if (!unlocked) return openShop(`Île ${size}×${size}`, 'Agrandis ton île dans la boutique.');
                          if (size < world.size) return Alert.alert('Ton île est déjà plus grande', 'On ne peut pas la rétrécir.');
                          setDraft(resizeWorld(current, size));
                        }}
                        style={[styles.sizeChip, world.size === size && styles.itemActive]}
                      >
                        <Text style={[styles.itemName, !unlocked && { color: colors.tertiary }]}>
                          {unlocked ? '' : '🔒 '}
                          {size}×{size}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <>
              <View style={styles.categories}>
                  <Pressable onPress={() => setTool({ kind: 'none' })} style={[styles.category, tool.kind === 'none' && { backgroundColor: colors.text }]}>
                    <Text style={[styles.categoryText, tool.kind === 'none' && { color: colors.onAccent }]}>✋ Rien</Text>
                  </Pressable>
                  {tab === 'objects' && <View style={styles.chipSeparator} />}
                  {tab === 'objects' && (['house', 'tree', 'deco', 'boat'] as const).map((c) => (
                    <Pressable key={c} onPress={() => setCategory(c)} style={[styles.category, category === c && styles.categoryActive]}>
                      <Text style={[styles.categoryText, category === c && { color: colors.onAccent }]}>{GARDEN_SLOT_NAMES[c]}</Text>
                    </Pressable>
                  ))}
                </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.items}>
                {items.map((item) => {
                  const tile = item.slot === 'ground';
                  const left = tile ? 0 : available(item.id);
                  const ready = tile ? ownsItem(item, inventory) || TILE_CHARS[item.id] === ISLAND_GROUND : left > 0;
                  const label = item.premium ? (premium ? 'Vainc+ ✓' : '🔒 Vainc+') : item.costHours === 0 ? 'Gratuit' : tile ? (ready ? '✓' : `🔒 ${item.costHours} h`) : ready ? `×${left}` : `${item.costHours} h`;
                  return (
                    <Pressable key={item.id} onPress={() => choose(item)} style={[styles.item, selectedId === item.id && styles.itemActive]}>
                      <Text style={[styles.itemEmoji, tile && !ready && { opacity: 0.35 }]}>{item.emoji}</Text>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={[styles.itemPrice, { color: ready ? colors.success : colors.secondary }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              </>
            )}
            <Text style={styles.hint}>
              {tool.kind === 'none'
                ? 'Choisis un objet ou un sol, puis touche une case de ton île.'
                : tool.kind === 'tile'
                  ? 'Touche des cases pour peindre le sol. « ✋ Rien » pour arrêter.'
                  : available(tool.id) > 0
                    ? `Touche une case pour poser ${nameOf(tool.id)}.`
                    : `Touche une case : tu pourras acheter ${nameOf(tool.id)} pour ${itemOf(tool.id)?.costHours} h.`}
              {tool.kind === 'object' && isBoat(tool.id) ? ' Les bateaux vont sur la mer ou sur l’eau.' : ''}
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
  visitFeatured: { backgroundColor: '#FFF4D6' },
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
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12 },
  category: { borderRadius: 999, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 5 },
  categoryActive: { backgroundColor: colors.accent },
  chipSeparator: { width: 1, alignSelf: 'stretch', backgroundColor: colors.separator, marginHorizontal: 2 },
  categoryText: { fontSize: 13, fontWeight: '700', color: colors.text },
  sizeChip: { borderRadius: 999, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 2, borderColor: 'transparent' },
  hint: { ...type.footnote, marginHorizontal: 14 },
  objButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  objButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  tip: { ...glass, alignSelf: 'center', marginBottom: 14, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, fontWeight: '600', color: colors.text, overflow: 'hidden' },
  focusName: { fontSize: 17, fontWeight: '800', color: colors.text },
  focusPet: { fontSize: 13, fontWeight: '700' },
  focusButton: { marginTop: 2, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  focusButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 14 },
});
