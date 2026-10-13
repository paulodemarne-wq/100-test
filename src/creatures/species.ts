// The 40 realistic Lockin animals (30 + 10 Lockin+). Each stays the same animal from baby to legend:
// it grows, gets extra body parts and elemental powers at each stage (see src/creatures/real/).
// Pure data (no React, no three.js): shared by the app and the design previews.
import { PLUS_FIRST_ID, REAL_SPECIES, type RealSpecies } from './real/catalog';

export type Species = RealSpecies;

export type ElementInfo = { name: string; emoji: string; color: string };
export const ELEMENTS: Record<string, ElementInfo> = {
  fire: { name: 'Feu', emoji: '🔥', color: '#FF7A1A' },
  ice: { name: 'Glace', emoji: '❄️', color: '#3E9BE0' },
  lightning: { name: 'Foudre', emoji: '⚡', color: '#7B4DFF' },
  nature: { name: 'Nature', emoji: '🌿', color: '#3E9B4A' },
  shadow: { name: 'Ombre', emoji: '🌑', color: '#6B3FD6' },
};
export const elementOf = (s: Species) => ELEMENTS[s.element];

/** One emoji per animal (for small places: tab icons, lists). */
const EMOJI = ['🐍', '🐍', '🐍', '🐍', '🐍', '🐍', '🐺', '🦊', '🦊', '🐯', '🦁', '🐆', '🐆', '🐆', '🐻', '🐻‍❄️', '🐼', '🦌', '🦓', '🐈', '🐈', '🐺', '🦅', '🦅', '🦉', '🦉', '🦅', '🦜', '🦉', '🐦‍⬛', '🐆', '🐅', '🦁', '🐺', '🐍', '🐍', '🦜', '🦅', '🦊', '🐆'];
/** The pet's emoji at this level (an egg before hatching). */
export function emojiFor(species: Species | null, level: number): string {
  return species && level >= 2 ? (EMOJI[species.id] ?? '🐾') : '🥚';
}

/** The 30 animals for everyone, then the 10 Lockin+ ones. */
export const SPECIES: Species[] = REAL_SPECIES.filter((s) => !s.plus);
export const PLUS_SPECIES: Species[] = REAL_SPECIES.filter((s) => s.plus);

/** Whether an animal is one of the Lockin+ ones. Must match supabase/schema.sql (30..39). */
export const isPlusSpecies = (id: number | null | undefined) => id !== null && id !== undefined && id >= PLUS_FIRST_ID;

export function speciesById(id: number | null | undefined): Species | null {
  return id === null || id === undefined ? null : (REAL_SPECIES[id] ?? null);
}

// ─── Levels and stages ────────────────────────────────────────────────────────
// 40 levels; the last one takes 2 190 h (2 years at 3 h a day). 5 stages after the egg.

export const MAX_LEVEL = 40;

/** Hours needed for each level (index = level). */
export const LEVEL_HOURS: number[] = Array.from({ length: MAX_LEVEL + 1 }, (_, L) => {
  const h = 2190 * (L / MAX_LEVEL) ** 2;
  return h < 20 ? Math.round(h * 2) / 2 : h < 100 ? Math.round(h) : Math.round(h / 5) * 5;
});

/** Seconds of lock in at which the egg hatches (level 2). Must match supabase/schema.sql. */
export const HATCH_SECONDS = LEVEL_HOURS[2] * 3600;

export type Tier = { index: number; name: string; color: string; fromLevel: number };

/** The stages (must match STAGE_FROM_LEVEL in src/creatures/real/index.ts). */
export const TIERS: Tier[] = [
  { index: 0, name: 'Œuf', color: '#A1A1AA', fromLevel: 0 },
  { index: 1, name: 'Bébé', color: '#8E8E93', fromLevel: 2 },
  { index: 2, name: 'Jeune', color: '#34A853', fromLevel: 8 },
  { index: 3, name: 'Adulte', color: '#007AFF', fromLevel: 16 },
  { index: 4, name: 'Alpha', color: '#AF52DE', fromLevel: 25 },
  { index: 5, name: 'Légende', color: '#F5B400', fromLevel: 34 },
];

export function levelFor(xpSeconds: number): number {
  const hours = xpSeconds / 3600;
  let L = 0;
  while (L < MAX_LEVEL && hours >= LEVEL_HOURS[L + 1]) L++;
  return L;
}

export function tierFor(level: number): Tier {
  let t = TIERS[0];
  for (const tier of TIERS) if (level >= tier.fromLevel) t = tier;
  return t;
}

/** 0 = still an egg, 1 = hatched. */
export function formFor(level: number): 0 | 1 {
  return level < 2 ? 0 : 1;
}

/** The name shown for a pet at this level. */
export function displayName(species: Species | null, level: number): string {
  if (!species || level < 2) return 'Œuf mystère';
  return species.name;
}

/** What changes when reaching each level, shown in the app (it also grows a little at every level). */
export const LEVEL_UNLOCKS: Record<number, string> = {
  1: "L'œuf se fissure",
  2: 'Éclosion ! Bébé',
  3: 'Il grandit',
  4: 'Il grandit',
  5: 'Il grandit',
  6: 'Il grandit',
  7: 'Il grandit',
  8: 'Jeune : proportions d’adulte, petites piques, yeux de son élément',
  9: 'Il grandit',
  10: 'Il grandit',
  11: 'Il grandit',
  12: 'Il grandit',
  13: 'Il grandit',
  14: 'Il grandit',
  15: 'Il grandit',
  16: 'Adulte : cornes, grandes piques, queue de son élément',
  17: 'Il grandit',
  18: 'Il grandit',
  19: 'Il grandit',
  20: 'Il grandit',
  21: 'Il grandit',
  22: 'Il grandit',
  23: 'Il grandit',
  24: 'Il grandit',
  25: 'Alpha : grandes cornes, crinière de son élément, couleurs riches, yeux qui brillent',
  26: 'Il grandit',
  27: 'Il grandit',
  28: 'Il grandit',
  29: 'Il grandit',
  30: 'Il grandit',
  31: 'Il grandit',
  32: 'Il grandit',
  33: 'Il grandit',
  34: 'Légende : ailes, marques lumineuses, aura au sol 👑',
  35: 'Il grandit',
  36: 'Il grandit',
  37: 'Il grandit',
  38: 'Il grandit',
  39: 'Il grandit',
  40: 'Taille maximale 👑',
};

// ─── Shop ─────────────────────────────────────────────────────────────────────

export type Rarity = 'commune' | 'rare' | 'épique' | 'mythique' | 'légendaire';

export const RARITY_COLORS: Record<Rarity, string> = {
  commune: '#8E8E93',
  rare: '#30B0C7',
  épique: '#AF52DE',
  mythique: '#FF2D55',
  légendaire: '#F5B400',
};

export type Slot = 'head' | 'eyes' | 'neck' | 'back';

export const SLOT_NAMES: Record<Slot, string> = { head: 'Tête', eyes: 'Yeux', neck: 'Cou', back: 'Dos' };

export type GardenSlot = 'house' | 'tree' | 'deco' | 'ground' | 'boat';

export const GARDEN_SLOT_NAMES: Record<GardenSlot, string> = {
  house: 'Maison',
  tree: 'Arbre',
  deco: 'Déco',
  ground: 'Sol',
  boat: 'Bateau',
};

/** Accessory of the month, in turn. Must match monthly_accessory() in supabase/schema.sql. */
export const MONTHLY_ACCESSORIES = ['tiara', 'bunny', 'galaxy', 'butterfly'];
export function monthlyAccessory(now = new Date()): string {
  return MONTHLY_ACCESSORIES[(now.getFullYear() * 12 + now.getMonth()) % MONTHLY_ACCESSORIES.length];
}

/** Whether the player can use this item (bought, or free; Lockin+ items need the subscription). */
export function ownsItem(item: ShopItem, inventory: string[], premium = false): boolean {
  // A claimed accessory of the month stays yours.
  if (item.monthly) return inventory.includes(item.id);
  if (item.premium && !premium) return false;
  return item.costHours === 0 || inventory.includes(item.id);
}

export type ShopItem = {
  id: string;
  name: string;
  kind: 'accessory' | 'egg' | 'garden' | 'upgrade';
  slot: Slot | GardenSlot | null;
  rarity: Rarity;
  /** Price in hours of lock in (0 = free for everyone). Must match supabase/schema.sql (shop_items). */
  costHours: number;
  emoji?: string;
  /** Only for Lockin+ subscribers. */
  premium?: boolean;
  /** Lockin+ accessory of the month: claimed for free during its month (see monthlyAccessory). */
  monthly?: boolean;
};

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'egg', name: 'Œuf mystère', kind: 'egg', slot: null, rarity: 'rare', costHours: 100 },
  { id: 'cap', name: 'Casquette', kind: 'accessory', slot: 'head', rarity: 'commune', costHours: 10 },
  { id: 'beanie', name: 'Bonnet', kind: 'accessory', slot: 'head', rarity: 'commune', costHours: 10 },
  { id: 'flowers', name: 'Couronne de fleurs', kind: 'accessory', slot: 'head', rarity: 'rare', costHours: 30 },
  { id: 'wizard', name: 'Chapeau de sorcier', kind: 'accessory', slot: 'head', rarity: 'épique', costHours: 80 },
  { id: 'halo', name: 'Auréole', kind: 'accessory', slot: 'head', rarity: 'mythique', costHours: 200 },
  { id: 'crown', name: 'Couronne royale', kind: 'accessory', slot: 'head', rarity: 'légendaire', costHours: 400 },
  { id: 'glasses', name: 'Lunettes rondes', kind: 'accessory', slot: 'eyes', rarity: 'commune', costHours: 10 },
  { id: 'shades', name: 'Lunettes de soleil', kind: 'accessory', slot: 'eyes', rarity: 'rare', costHours: 30 },
  { id: 'monocle', name: 'Monocle', kind: 'accessory', slot: 'eyes', rarity: 'épique', costHours: 80 },
  { id: 'bowtie', name: 'Nœud papillon', kind: 'accessory', slot: 'neck', rarity: 'commune', costHours: 10 },
  { id: 'scarf', name: 'Écharpe', kind: 'accessory', slot: 'neck', rarity: 'rare', costHours: 30 },
  { id: 'medal', name: "Médaille d'or", kind: 'accessory', slot: 'neck', rarity: 'épique', costHours: 80 },
  { id: 'diamonds', name: 'Collier de diamants', kind: 'accessory', slot: 'neck', rarity: 'mythique', costHours: 200 },
  { id: 'backpack', name: 'Sac à dos', kind: 'accessory', slot: 'back', rarity: 'rare', costHours: 30 },
  { id: 'cape', name: 'Cape de héros', kind: 'accessory', slot: 'back', rarity: 'épique', costHours: 80 },
  { id: 'angel', name: "Ailes d'ange", kind: 'accessory', slot: 'back', rarity: 'mythique', costHours: 200 },
  { id: 'jetpack', name: 'Jetpack', kind: 'accessory', slot: 'back', rarity: 'légendaire', costHours: 400 },
  { id: 'party', name: 'Chapeau de fête', kind: 'accessory', slot: 'head', rarity: 'commune', costHours: 10 },
  { id: 'headphones', name: 'Casque audio', kind: 'accessory', slot: 'head', rarity: 'rare', costHours: 30 },
  { id: 'pirate', name: 'Chapeau de pirate', kind: 'accessory', slot: 'head', rarity: 'épique', costHours: 80 },
  { id: 'viking', name: 'Casque viking', kind: 'accessory', slot: 'head', rarity: 'mythique', costHours: 200 },
  { id: 'hearts', name: 'Lunettes cœur', kind: 'accessory', slot: 'eyes', rarity: 'rare', costHours: 30 },
  { id: 'patch', name: 'Cache-œil de pirate', kind: 'accessory', slot: 'eyes', rarity: 'épique', costHours: 80 },
  { id: 'tie', name: 'Cravate', kind: 'accessory', slot: 'neck', rarity: 'commune', costHours: 10 },
  { id: 'bandana', name: 'Bandana', kind: 'accessory', slot: 'neck', rarity: 'rare', costHours: 30 },
  { id: 'surfboard', name: 'Planche de surf', kind: 'accessory', slot: 'back', rarity: 'rare', costHours: 30 },
  { id: 'balloons', name: 'Ballons', kind: 'accessory', slot: 'back', rarity: 'épique', costHours: 80 },
  // Island: ground tiles to paint and objects to place. Free ones (0 h) are owned by everyone.
  { id: 'grass', name: 'Herbe', kind: 'garden', slot: 'ground', rarity: 'commune', costHours: 0, emoji: '🟩' },
  { id: 'path', name: 'Chemin de terre', kind: 'garden', slot: 'ground', rarity: 'commune', costHours: 0, emoji: '🟫' },
  { id: 'cobble', name: 'Pavés', kind: 'garden', slot: 'ground', rarity: 'commune', costHours: 10, emoji: '⬜' },
  { id: 'water', name: 'Eau', kind: 'garden', slot: 'ground', rarity: 'commune', costHours: 10, emoji: '🟦' },
  { id: 'meadow', name: 'Prairie fleurie', kind: 'garden', slot: 'ground', rarity: 'rare', costHours: 30, emoji: '🌼' },
  { id: 'beach', name: 'Sable', kind: 'garden', slot: 'ground', rarity: 'rare', costHours: 30, emoji: '🏖️' },
  { id: 'wood', name: 'Plancher', kind: 'garden', slot: 'ground', rarity: 'rare', costHours: 30, emoji: '🪵' },
  { id: 'snow', name: 'Neige', kind: 'garden', slot: 'ground', rarity: 'épique', costHours: 80, emoji: '❄️' },
  { id: 'clouds', name: 'Nuages', kind: 'garden', slot: 'ground', rarity: 'légendaire', costHours: 400, emoji: '☁️' },
  { id: 'fence', name: 'Clôture', kind: 'garden', slot: 'deco', rarity: 'commune', costHours: 0, emoji: '🚧' },
  { id: 'rock', name: 'Rocher', kind: 'garden', slot: 'deco', rarity: 'commune', costHours: 0, emoji: '🪨' },
  { id: 'pine', name: 'Sapin', kind: 'garden', slot: 'tree', rarity: 'commune', costHours: 0, emoji: '🌲' },
  { id: 'tent', name: 'Tente', kind: 'garden', slot: 'house', rarity: 'commune', costHours: 10, emoji: '⛺' },
  { id: 'doghouse', name: 'Niche', kind: 'garden', slot: 'house', rarity: 'commune', costHours: 10, emoji: '🐶' },
  { id: 'cabin', name: 'Cabane en bois', kind: 'garden', slot: 'house', rarity: 'rare', costHours: 30, emoji: '🛖' },
  { id: 'cottage', name: 'Petite maison', kind: 'garden', slot: 'house', rarity: 'épique', costHours: 80, emoji: '🏡' },
  { id: 'mushroom', name: 'Maison champignon', kind: 'garden', slot: 'house', rarity: 'mythique', costHours: 200, emoji: '🍄' },
  { id: 'castle', name: 'Château', kind: 'garden', slot: 'house', rarity: 'légendaire', costHours: 400, emoji: '🏰' },
  { id: 'bush', name: 'Buissons', kind: 'garden', slot: 'tree', rarity: 'commune', costHours: 10, emoji: '🌳' },
  { id: 'apple', name: 'Pommier', kind: 'garden', slot: 'tree', rarity: 'rare', costHours: 30, emoji: '🍎' },
  { id: 'palm', name: 'Palmier', kind: 'garden', slot: 'tree', rarity: 'rare', costHours: 30, emoji: '🌴' },
  { id: 'sakura', name: 'Cerisier en fleurs', kind: 'garden', slot: 'tree', rarity: 'épique', costHours: 80, emoji: '🌸' },
  { id: 'crystal', name: 'Arbre de cristal', kind: 'garden', slot: 'tree', rarity: 'mythique', costHours: 200, emoji: '💎' },
  { id: 'flowerbed', name: 'Parterre de fleurs', kind: 'garden', slot: 'deco', rarity: 'commune', costHours: 10, emoji: '🌷' },
  { id: 'hedge', name: 'Haie', kind: 'garden', slot: 'deco', rarity: 'commune', costHours: 10, emoji: '🟢' },
  { id: 'bench', name: 'Banc', kind: 'garden', slot: 'deco', rarity: 'commune', costHours: 10, emoji: '🪑' },
  { id: 'lamp', name: 'Lampadaire', kind: 'garden', slot: 'deco', rarity: 'commune', costHours: 10, emoji: '💡' },
  { id: 'campfire', name: 'Feu de camp', kind: 'garden', slot: 'deco', rarity: 'commune', costHours: 10, emoji: '🔥' },
  { id: 'pumpkin', name: 'Citrouilles', kind: 'garden', slot: 'deco', rarity: 'commune', costHours: 10, emoji: '🎃' },
  { id: 'table', name: 'Table de pique-nique', kind: 'garden', slot: 'deco', rarity: 'rare', costHours: 30, emoji: '🧺' },
  { id: 'pond', name: 'Petite mare', kind: 'garden', slot: 'deco', rarity: 'rare', costHours: 30, emoji: '🪷' },
  { id: 'well', name: 'Puits', kind: 'garden', slot: 'deco', rarity: 'rare', costHours: 30, emoji: '🪣' },
  { id: 'fountain', name: 'Fontaine', kind: 'garden', slot: 'deco', rarity: 'épique', costHours: 80, emoji: '⛲' },
  { id: 'statue', name: 'Statue en or', kind: 'garden', slot: 'deco', rarity: 'mythique', costHours: 200, emoji: '🏆' },
  { id: 'rainbow', name: 'Arc-en-ciel', kind: 'garden', slot: 'deco', rarity: 'légendaire', costHours: 400, emoji: '🌈' },
  { id: 'igloo', name: 'Igloo', kind: 'garden', slot: 'house', rarity: 'épique', costHours: 80, emoji: '🧊' },
  { id: 'treehouse', name: 'Cabane dans l\'arbre', kind: 'garden', slot: 'house', rarity: 'mythique', costHours: 200, emoji: '🌳' },
  { id: 'windmill', name: 'Moulin', kind: 'garden', slot: 'house', rarity: 'mythique', costHours: 200, emoji: '🌬️' },
  { id: 'cactus', name: 'Cactus', kind: 'garden', slot: 'tree', rarity: 'commune', costHours: 10, emoji: '🌵' },
  { id: 'sunflower', name: 'Tournesols', kind: 'garden', slot: 'tree', rarity: 'commune', costHours: 10, emoji: '🌻' },
  { id: 'autumn', name: 'Arbre d\'automne', kind: 'garden', slot: 'tree', rarity: 'rare', costHours: 30, emoji: '🍁' },
  { id: 'bamboo', name: 'Bambous', kind: 'garden', slot: 'tree', rarity: 'rare', costHours: 30, emoji: '🎋' },
  { id: 'mailbox', name: 'Boîte aux lettres', kind: 'garden', slot: 'deco', rarity: 'commune', costHours: 10, emoji: '📫' },
  { id: 'signpost', name: 'Panneau', kind: 'garden', slot: 'deco', rarity: 'commune', costHours: 10, emoji: '🪧' },
  { id: 'snowman', name: 'Bonhomme de neige', kind: 'garden', slot: 'deco', rarity: 'commune', costHours: 10, emoji: '⛄' },
  { id: 'umbrella', name: 'Parasol', kind: 'garden', slot: 'deco', rarity: 'commune', costHours: 10, emoji: '⛱️' },
  { id: 'deckchair', name: 'Transat', kind: 'garden', slot: 'deco', rarity: 'rare', costHours: 30, emoji: '🏖️' },
  { id: 'swing', name: 'Balançoire', kind: 'garden', slot: 'deco', rarity: 'rare', costHours: 30, emoji: '🛝' },
  { id: 'slide', name: 'Toboggan', kind: 'garden', slot: 'deco', rarity: 'rare', costHours: 30, emoji: '🎢' },
  { id: 'hammock', name: 'Hamac', kind: 'garden', slot: 'deco', rarity: 'rare', costHours: 30, emoji: '🌴' },
  { id: 'trampoline', name: 'Trampoline', kind: 'garden', slot: 'deco', rarity: 'rare', costHours: 30, emoji: '🤸' },
  { id: 'pier', name: 'Ponton', kind: 'garden', slot: 'deco', rarity: 'rare', costHours: 30, emoji: '🪵' },
  { id: 'treasure', name: 'Coffre au trésor', kind: 'garden', slot: 'deco', rarity: 'épique', costHours: 80, emoji: '💰' },
  { id: 'telescope', name: 'Télescope', kind: 'garden', slot: 'deco', rarity: 'épique', costHours: 80, emoji: '🔭' },
  { id: 'lighthouse', name: 'Phare', kind: 'garden', slot: 'deco', rarity: 'mythique', costHours: 200, emoji: '🗼' },
  { id: 'rowboat', name: 'Barque', kind: 'garden', slot: 'boat', rarity: 'commune', costHours: 10, emoji: '🛶' },
  { id: 'duckboat', name: 'Pédalo canard', kind: 'garden', slot: 'boat', rarity: 'rare', costHours: 30, emoji: '🦆' },
  { id: 'sailboat', name: 'Voilier', kind: 'garden', slot: 'boat', rarity: 'épique', costHours: 80, emoji: '⛵' },
  { id: 'yacht', name: 'Yacht', kind: 'garden', slot: 'boat', rarity: 'mythique', costHours: 200, emoji: '🛥️' },
  { id: 'pirateship', name: 'Bateau pirate', kind: 'garden', slot: 'boat', rarity: 'légendaire', costHours: 400, emoji: '🏴‍☠️' },
  // Island upgrades: bigger island (bought in order) and the sea around it (needed for boats).
  { id: 'sea', name: 'La mer autour de l\'île', kind: 'upgrade', slot: null, rarity: 'commune', costHours: 20, emoji: '🌊' },
  { id: 'size20', name: 'Île 20×20', kind: 'upgrade', slot: null, rarity: 'rare', costHours: 50, emoji: '🏝️' },
  { id: 'size24', name: 'Île 24×24', kind: 'upgrade', slot: null, rarity: 'épique', costHours: 120, emoji: '🏝️' },
  { id: 'size28', name: 'Île 28×28', kind: 'upgrade', slot: null, rarity: 'mythique', costHours: 250, emoji: '🏝️' },
  { id: 'size32', name: 'Île 32×32', kind: 'upgrade', slot: null, rarity: 'légendaire', costHours: 500, emoji: '🏝️' },
  // Lockin+ (subscription): an egg with the 10 exclusive creatures, and decorations free for subscribers.
  // Accessory of the month (Lockin+): free to claim during its month, kept for good.
  { id: 'tiara', name: 'Diadème étoilé', kind: 'accessory', slot: 'head', rarity: 'légendaire', costHours: 0, premium: true, monthly: true },
  { id: 'bunny', name: 'Oreilles de lapin', kind: 'accessory', slot: 'head', rarity: 'légendaire', costHours: 0, premium: true, monthly: true },
  { id: 'galaxy', name: 'Écharpe galaxie', kind: 'accessory', slot: 'neck', rarity: 'légendaire', costHours: 0, premium: true, monthly: true },
  { id: 'butterfly', name: 'Ailes de papillon', kind: 'accessory', slot: 'back', rarity: 'légendaire', costHours: 0, premium: true, monthly: true },
  { id: 'egg_plus', name: 'Œuf Lockin+', kind: 'egg', slot: null, rarity: 'légendaire', costHours: 50, emoji: '🥚', premium: true },
  { id: 'portal', name: 'Portail magique', kind: 'garden', slot: 'deco', rarity: 'légendaire', costHours: 0, emoji: '🌀', premium: true },
  { id: 'crystals', name: 'Cristaux lumineux', kind: 'garden', slot: 'deco', rarity: 'légendaire', costHours: 0, emoji: '💠', premium: true },
  { id: 'lanterns', name: 'Lanternes', kind: 'garden', slot: 'deco', rarity: 'légendaire', costHours: 0, emoji: '🏮', premium: true },
  { id: 'throne', name: 'Trône doré', kind: 'garden', slot: 'deco', rarity: 'légendaire', costHours: 0, emoji: '👑', premium: true },
  { id: 'balloon', name: 'Montgolfière', kind: 'garden', slot: 'deco', rarity: 'légendaire', costHours: 0, emoji: '🎈', premium: true },
  { id: 'gazebo', name: 'Kiosque', kind: 'garden', slot: 'house', rarity: 'légendaire', costHours: 0, emoji: '⛩️', premium: true },
];

export function itemById(id: string | null | undefined): ShopItem | null {
  return SHOP_ITEMS.find((i) => i.id === id) ?? null;
}

export type Equipped = Partial<Record<Slot, string>>;

/** Garden items placed around the pet. */
export type Garden = Partial<Record<GardenSlot, string>>;
