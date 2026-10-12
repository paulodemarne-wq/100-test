// The 100 Lockin creatures. Each species has an evolution line of 3 forms with
// different body plans (a tadpole becomes a frog, a slime becomes a golem…) and
// its own traits (ears, tail, horns, eyes, pattern, proportions, colors).
// Pure data (no React, no three.js): shared by the app and the design bestiary.

export type Element = {
  id: string;
  name: string;
  /** body, belly/accent, detail (horns, claws…), glow */
  colors: [string, string, string, string];
  syllables: string[];
};

export const ELEMENTS: Element[] = [
  { id: 'fire', name: 'Feu', colors: ['#FF6B3D', '#FFD27A', '#B83A1B', '#FFB020'], syllables: ['pyr', 'bra', 'flam', 'ign', 'sol'] },
  { id: 'water', name: 'Eau', colors: ['#3BA7F5', '#C8ECFF', '#1C5FA8', '#7FE0FF'], syllables: ['aqu', 'mar', 'ond', 'nau', 'plou'] },
  { id: 'plant', name: 'Plante', colors: ['#5CC46A', '#E4F7C9', '#2F7A3A', '#B6F26B'], syllables: ['flo', 'sylv', 'bour', 'mou', 'herb'] },
  { id: 'spark', name: 'Électrik', colors: ['#FFD43B', '#FFF6C7', '#3A3A3A', '#FFF06A'], syllables: ['vol', 'zap', 'ion', 'ful', 'tes'] },
  { id: 'ice', name: 'Glace', colors: ['#A9E4F5', '#FFFFFF', '#4F8FB8', '#D9F7FF'], syllables: ['giv', 'cri', 'nei', 'pol', 'fro'] },
  { id: 'rock', name: 'Roche', colors: ['#B08B67', '#E6D3BC', '#5E4632', '#D9A066'], syllables: ['rok', 'gra', 'ter', 'pie', 'bas'] },
  { id: 'psy', name: 'Psy', colors: ['#C77DFF', '#F1DDFF', '#6B2FA3', '#FF8BF2'], syllables: ['psy', 'mys', 'ora', 'lun', 'ast'] },
  { id: 'shadow', name: 'Ombre', colors: ['#4B4A6B', '#9C9BC2', '#1E1D33', '#8A7BFF'], syllables: ['nox', 'umb', 'nyx', 'cre', 'spe'] },
  { id: 'fairy', name: 'Fée', colors: ['#FF9CC8', '#FFE3EF', '#C24D86', '#FFC6F1'], syllables: ['fée', 'pix', 'rêv', 'éli', 'coq'] },
  { id: 'wind', name: 'Vent', colors: ['#8EDDC4', '#EFFFF9', '#3A8C78', '#C7FFF0'], syllables: ['zéf', 'bri', 'cyc', 'aér', 'vol'] },
];

export type Plan =
  | 'slime'
  | 'biped'
  | 'quadruped'
  | 'dragon'
  | 'bird'
  | 'fish'
  | 'serpent'
  | 'frog'
  | 'insect'
  | 'octopus'
  | 'jelly'
  | 'crab'
  | 'snail'
  | 'ghost'
  | 'plant'
  | 'golem';

export const PLAN_NAMES: Record<Plan, string> = {
  slime: 'Gelée',
  biped: 'Petit être',
  quadruped: 'Bête',
  dragon: 'Dragon',
  bird: 'Oiseau',
  fish: 'Poisson',
  serpent: 'Serpent',
  frog: 'Grenouille',
  insect: 'Insecte',
  octopus: 'Pieuvre',
  jelly: 'Méduse',
  crab: 'Crabe',
  snail: 'Escargot',
  ghost: 'Spectre',
  plant: 'Plante',
  golem: 'Golem',
};

export const PLAN_EMOJI: Record<Plan, string> = {
  slime: '🫧',
  biped: '🐣',
  quadruped: '🐾',
  dragon: '🐲',
  bird: '🐦',
  fish: '🐟',
  serpent: '🐍',
  frog: '🐸',
  insect: '🐞',
  octopus: '🐙',
  jelly: '🪼',
  crab: '🦀',
  snail: '🐌',
  ghost: '👻',
  plant: '🌱',
  golem: '🗿',
};

/** Evolution lines: [form 1, form 2, form 3]. */
const LINES: [Plan, Plan, Plan][] = [
  ['slime', 'biped', 'golem'],
  ['biped', 'quadruped', 'dragon'],
  ['quadruped', 'quadruped', 'quadruped'],
  ['bird', 'bird', 'bird'],
  ['fish', 'fish', 'serpent'],
  ['fish', 'frog', 'frog'],
  ['insect', 'insect', 'insect'],
  ['snail', 'snail', 'crab'],
  ['octopus', 'octopus', 'octopus'],
  ['jelly', 'jelly', 'octopus'],
  ['slime', 'ghost', 'ghost'],
  ['plant', 'plant', 'plant'],
  ['serpent', 'serpent', 'dragon'],
  ['biped', 'biped', 'biped'],
  ['golem', 'golem', 'golem'],
  ['bird', 'quadruped', 'dragon'],
  ['crab', 'crab', 'crab'],
  ['frog', 'frog', 'frog'],
  ['ghost', 'ghost', 'dragon'],
  ['slime', 'jelly', 'jelly'],
  ['plant', 'biped', 'golem'],
  ['quadruped', 'dragon', 'dragon'],
  ['insect', 'bird', 'bird'],
  ['fish', 'octopus', 'octopus'],
  ['biped', 'golem', 'golem'],
];

export type EarType = 'none' | 'pointy' | 'round' | 'long' | 'fin' | 'droopy' | 'antenna';
export type TailType = 'none' | 'thin' | 'bushy' | 'flame' | 'fin' | 'club' | 'leaf' | 'spiral';
export type HornType = 'none' | 'single' | 'double' | 'antlers' | 'ram';
export type EyeStyle = 'round' | 'big' | 'sleepy' | 'cyclops' | 'four' | 'visor';
export type Pattern = 'none' | 'spots' | 'stripes' | 'belly' | 'mask' | 'socks';

export type Traits = {
  ears: EarType;
  tail: TailType;
  horns: HornType;
  eyes: EyeStyle;
  pattern: Pattern;
  /** body width factor */
  chunky: number;
  /** leg length factor */
  legs: number;
  /** neck / snout length factor */
  snout: number;
  /** colors after the species' own hue shift */
  body: string;
  accent: string;
  detail: string;
  glow: string;
};

export type Species = {
  /** 0..99 */
  id: number;
  element: Element;
  line: [Plan, Plan, Plan];
  /** One name per form. */
  names: [string, string, string];
  traits: Traits;
};

// ─── Deterministic randomness ──────────────────────────────────────────────────
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)];

function shiftHue(hex: string, degrees: number, sat = 1, light = 1): string {
  const n = parseInt(hex.slice(1), 16);
  let r = ((n >> 16) & 255) / 255;
  let g = ((n >> 8) & 255) / 255;
  let b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  h = (h + degrees / 360 + 1) % 1;
  s = Math.min(1, s * sat);
  const L = Math.min(0.95, Math.max(0.08, l * light));
  const q = L < 0.5 ? L * (1 + s) : L + s - L * s;
  const p = 2 * L - q;
  const hue = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  [r, g, b] = s === 0 ? [L, L, L] : [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
  return '#' + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

const NAME_ENDS = [
  ['ou', 'i', 'iko', 'ino', 'olo', 'pi'],
  ['ard', 'eon', 'ion', 'ax', 'ik', 'or'],
  ['oros', 'agon', 'idon', 'arch', 'ylon', 'ithe'],
];

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const SPECIES: Species[] = Array.from({ length: 100 }, (_, id) => {
  const r = rng(id * 7919 + 104729);
  const element = ELEMENTS[id % 10];
  const line = LINES[(id * 7 + Math.floor(id / 10) * 3) % LINES.length];
  const [c0, c1, c2, c3] = element.colors;
  const hue = (r() - 0.5) * 50;
  const sat = 0.85 + r() * 0.35;
  const syl = pick(r, element.syllables);
  const mid = pick(r, ['a', 'o', 'i', 'u', 'é', 'y']);
  const names = [0, 1, 2].map((f) => capitalize(syl + (f === 0 ? '' : mid) + pick(r, NAME_ENDS[f]))) as [string, string, string];
  const traits: Traits = {
    ears: pick(r, ['none', 'pointy', 'round', 'long', 'fin', 'droopy', 'antenna'] as const),
    tail: pick(r, ['none', 'thin', 'bushy', 'flame', 'fin', 'club', 'leaf', 'spiral'] as const),
    horns: pick(r, ['none', 'none', 'single', 'double', 'antlers', 'ram'] as const),
    eyes: pick(r, ['round', 'round', 'big', 'sleepy', 'cyclops', 'four', 'visor'] as const),
    pattern: pick(r, ['none', 'spots', 'stripes', 'belly', 'mask', 'socks'] as const),
    chunky: 0.85 + r() * 0.4,
    legs: 0.7 + r() * 0.7,
    snout: 0.6 + r() * 0.8,
    body: shiftHue(c0, hue, sat),
    accent: shiftHue(c1, hue * 0.5),
    detail: shiftHue(c2, hue, sat),
    glow: shiftHue(c3, hue * 0.7),
  };
  return { id, element, line, names, traits };
});

/** The 10 Lockin+ creatures (ids 100..109), only from the Lockin+ egg. Made by hand, not drawn at random. */
export const PLUS_ELEMENT: Element = { id: 'plus', name: 'Lockin+', colors: ['#FFD86B', '#FFF4D6', '#5856D6', '#FFE58A'], syllables: [] };

const plus = (
  names: [string, string, string],
  line: [Plan, Plan, Plan],
  t: Omit<Traits, 'chunky' | 'legs' | 'snout'> & Partial<Pick<Traits, 'chunky' | 'legs' | 'snout'>>,
): Omit<Species, 'id'> => ({ element: PLUS_ELEMENT, line, names, traits: { chunky: 1, legs: 1, snout: 1, ...t } });

export const PLUS_SPECIES: Species[] = [
  plus(['Solari', 'Solarion', 'Solarius'], ['bird', 'bird', 'dragon'], { ears: 'pointy', tail: 'flame', horns: 'double', eyes: 'big', pattern: 'belly', body: '#FFB020', accent: '#FFF1B8', detail: '#C2410C', glow: '#FFE58A' }),
  plus(['Nébulo', 'Nébulard', 'Nébulagon'], ['jelly', 'ghost', 'ghost'], { ears: 'antenna', tail: 'spiral', horns: 'none', eyes: 'four', pattern: 'spots', body: '#4C3BCF', accent: '#C9B8FF', detail: '#1E1B4B', glow: '#FF8BF2' }),
  plus(['Auro', 'Aurorix', 'Aurorathe'], ['quadruped', 'quadruped', 'dragon'], { ears: 'long', tail: 'bushy', horns: 'antlers', eyes: 'round', pattern: 'stripes', body: '#2DD4BF', accent: '#FBCFE8', detail: '#0F766E', glow: '#F0ABFC', legs: 1.2 }),
  plus(['Prismi', 'Prismard', 'Prismaros'], ['slime', 'golem', 'golem'], { ears: 'none', tail: 'club', horns: 'single', eyes: 'visor', pattern: 'socks', body: '#A5F3FC', accent: '#FFFFFF', detail: '#8B5CF6', glow: '#F472B6', chunky: 1.2 }),
  plus(['Luno', 'Lunova', 'Lunaria'], ['bird', 'bird', 'bird'], { ears: 'round', tail: 'leaf', horns: 'none', eyes: 'sleepy', pattern: 'mask', body: '#CBD5E1', accent: '#F8FAFC', detail: '#1E3A8A', glow: '#BFDBFE' }),
  plus(['Kitsu', 'Kitsura', 'Kitsunéa'], ['quadruped', 'quadruped', 'quadruped'], { ears: 'pointy', tail: 'bushy', horns: 'none', eyes: 'big', pattern: 'socks', body: '#FFF7ED', accent: '#FDA4AF', detail: '#E11D48', glow: '#FFE4E6', snout: 1.4 }),
  plus(['Abysso', 'Abyssard', 'Abyssoros'], ['fish', 'serpent', 'dragon'], { ears: 'fin', tail: 'fin', horns: 'ram', eyes: 'cyclops', pattern: 'spots', body: '#1E3A8A', accent: '#67E8F9', detail: '#0B1026', glow: '#22D3EE' }),
  plus(['Sylphi', 'Sylphéon', 'Sylphéa'], ['insect', 'insect', 'insect'], { ears: 'antenna', tail: 'none', horns: 'none', eyes: 'big', pattern: 'spots', body: '#A3E635', accent: '#FEF9C3', detail: '#CA8A04', glow: '#FDE047' }),
  plus(['Magmi', 'Magmax', 'Magmarch'], ['biped', 'biped', 'golem'], { ears: 'none', tail: 'flame', horns: 'double', eyes: 'visor', pattern: 'stripes', body: '#292524', accent: '#FB923C', detail: '#7C2D12', glow: '#F97316', chunky: 1.25 }),
  plus(['Chrono', 'Chronik', 'Chronagon'], ['serpent', 'serpent', 'dragon'], { ears: 'fin', tail: 'thin', horns: 'antlers', eyes: 'round', pattern: 'belly', body: '#111827', accent: '#FCD34D', detail: '#B45309', glow: '#FDE68A', snout: 1.3 }),
].map((sp, i) => ({ ...sp, id: 100 + i }));

/** Whether a creature is one of the Lockin+ ones. */
export const isPlusSpecies = (id: number | null | undefined) => id !== null && id !== undefined && id >= 100;

export function speciesById(id: number | null | undefined): Species | null {
  if (isPlusSpecies(id)) return PLUS_SPECIES[id! - 100] ?? null;
  return id === null || id === undefined ? null : (SPECIES[id] ?? null);
}

// ─── Levels and tiers ─────────────────────────────────────────────────────────
// 40 levels; the last one takes 2 190 h (2 years at 3 h a day). Something changes at every level.

export const MAX_LEVEL = 40;

/** Hours needed for each level (index = level). */
export const LEVEL_HOURS: number[] = Array.from({ length: MAX_LEVEL + 1 }, (_, L) => {
  const h = 2190 * (L / MAX_LEVEL) ** 2;
  return h < 20 ? Math.round(h * 2) / 2 : h < 100 ? Math.round(h) : Math.round(h / 5) * 5;
});

/** Seconds of lock in at which the egg hatches (level 2). Must match supabase/schema.sql. */
export const HATCH_SECONDS = LEVEL_HOURS[2] * 3600;

export type Tier = { index: number; name: string; color: string; fromLevel: number };

export const TIERS: Tier[] = [
  { index: 0, name: 'Œuf', color: '#A1A1AA', fromLevel: 0 },
  { index: 1, name: 'Bébé', color: '#8E8E93', fromLevel: 2 },
  { index: 2, name: 'Rare', color: '#30B0C7', fromLevel: 9 },
  { index: 3, name: 'Super rare', color: '#007AFF', fromLevel: 16 },
  { index: 4, name: 'Épique', color: '#AF52DE', fromLevel: 23 },
  { index: 5, name: 'Mythique', color: '#FF2D55', fromLevel: 30 },
  { index: 6, name: 'Légendaire', color: '#F5B400', fromLevel: 36 },
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

/** Which of the 3 forms a level shows (0 = egg). */
export function formFor(level: number): 0 | 1 | 2 | 3 {
  if (level < 2) return 0;
  if (level < 9) return 1;
  if (level < 23) return 2;
  return 3;
}

/** The name shown for a pet at this level. */
export function displayName(species: Species | null, level: number): string {
  const form = formFor(level);
  if (!species || form === 0) return 'Œuf mystère';
  return species.names[form - 1];
}

/** What changes when reaching each level, shown in the app. */
export const LEVEL_UNLOCKS: Record<number, string> = {
  1: "L'œuf se fissure",
  2: 'Éclosion !',
  3: 'Motif sur le pelage',
  4: 'Joues roses',
  5: 'Oreilles qui poussent',
  6: 'Queue qui pousse',
  7: 'Couleurs plus vives',
  8: "Marque d'élément sur le front",
  9: 'Évolution : 2ᵉ forme',
  10: 'Motif plus marqué',
  11: 'Premières épines',
  12: 'Cornes qui poussent',
  13: 'Épines sur le dos',
  14: 'Deuxième queue',
  15: "Gemme d'élément",
  16: 'Couleurs chromatiques ✨',
  17: 'Armure sur les épaules',
  18: 'Cornes plus grandes',
  19: 'Épines lumineuses',
  20: 'Troisième queue',
  21: 'Ailes qui naissent',
  22: 'Grandes ailes',
  23: 'Évolution : forme finale',
  24: 'Crête de champion',
  25: 'Armure complète',
  26: "Pouvoir d'élément",
  27: "Pouvoir d'élément renforcé",
  28: 'Griffes dorées',
  29: 'Regard brillant',
  30: 'Transformation mythique',
  31: "2 orbes d'élément",
  32: "4 orbes d'élément",
  33: "Ailes d'élément",
  34: 'Cercle de runes',
  35: 'Aura mythique',
  36: 'Ascension légendaire',
  37: 'Auréole dorée',
  38: 'Aura dorée',
  39: 'Couronne flottante',
  40: 'Forme ultime 👑',
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
