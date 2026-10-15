// Vainc+ : the subscription. The server decides who has it (profiles.premium_until,
// or a featured account) and refuses Vainc+ things to others; this file only mirrors it.
import type { ImageSourcePropType } from 'react-native';
import type { ProfileRow } from './supabase';

type Someone = Pick<ProfileRow, 'featured' | 'premium_until' | 'badge' | 'badge_color' | 'decoration'> & Partial<Pick<ProfileRow, 'title'>> | null | undefined;

export const PLUS_NAME = 'Vainc+';
/** Shown on the Vainc+ screen (the real price comes from the App Store once payments are on). */
export const PLUS_PRICE = '2,99 € / mois';
export const PLUS_PRICE_YEAR = '19,99 € / an';

export function isPremium(p: Someone, now = Date.now()): boolean {
  if (!p) return false;
  return p.featured || (!!p.premium_until && new Date(p.premium_until).getTime() > now);
}

/** Badges next to the name: a small round pill with a solid glyph (viewBox 24). Must match profiles_badge_check. */
export const BADGES: { id: string; name: string; d: string }[] = [
  { id: 'star', name: 'Étoile', d: 'M12 2.6l2.85 6 6.55.85-4.8 4.55 1.25 6.5L12 17.3l-5.85 3.2 1.25-6.5L2.6 9.45l6.55-.85z' },
  { id: 'crown', name: 'Couronne', d: 'M3.2 8.2l4.6 3.9L12 5l4.2 7.1 4.6-3.9-1.9 9.6H5.1zM5.4 18.9h13.2v1.9H5.4z' },
  { id: 'flame', name: 'Flamme', d: 'M12.6 2c.6 3.4 5.4 5.6 5.4 11a6 6 0 0 1-12 0c0-2.6 1.3-4.5 2.6-5.6-.1 2.4.9 3.7 2.2 4.2-.7-3.6.2-6.9 1.8-9.6z' },
  { id: 'bolt', name: 'Éclair', d: 'M13.6 2L4.8 13.6h6.1L9.9 22l9.3-12.1h-6.3z' },
  { id: 'gem', name: 'Diamant', d: 'M7.2 4h9.6l4.4 5.2L12 20.6 2.8 9.2z' },
  { id: 'heart', name: 'Cœur', d: 'M12 20.6S2.8 15 2.8 8.9A4.6 4.6 0 0 1 12 7.2a4.6 4.6 0 0 1 9.2 1.7c0 6.1-9.2 11.7-9.2 11.7z' },
  { id: 'moon', name: 'Lune', d: 'M15.2 2.8A9.2 9.2 0 1 0 21.2 18 7.6 7.6 0 0 1 15.2 2.8z' },
  { id: 'cap', name: 'Diplômé', d: 'M12 4.2L1.4 9.4 12 14.6l8.4-4.1v5.2H22V9.4zM5.6 13.2v3.6c3.6 2.9 9.2 2.9 12.8 0v-3.6L12 16.3z' },
  {
    id: 'trophy',
    name: 'Trophée',
    d: 'M7 3h10v2.6h3.2v2.2a4.3 4.3 0 0 1-4.2 4.3 5 5 0 0 1-3 2.8v2.4h3.4V21H7.6v-3.7H11v-2.4a5 5 0 0 1-3-2.8A4.3 4.3 0 0 1 3.8 7.8V5.6H7zm0 4.6v-.5H5.6v.7a2.4 2.4 0 0 0 1.6 2.2A6 6 0 0 1 7 7.6zm10 0a6 6 0 0 1-.2 2.4 2.4 2.4 0 0 0 1.6-2.2v-.7H17z',
  },
  { id: 'note', name: 'Musique', d: 'M9.4 17.6a3.2 3.2 0 1 1-1.9-2.9V5.2L19.5 3v12.2a3.2 3.2 0 1 1-1.9-2.9V7.1L9.4 8.6z' },
  { id: 'sparkle', name: 'Éclat', d: 'M12 1.8l2.4 7.8 7.8 2.4-7.8 2.4L12 22.2l-2.4-7.8L1.8 12l7.8-2.4z' },
  {
    id: 'paw',
    name: 'Patte',
    d:
      'M4.9 9.3a2.1 2.1 0 1 0 4.2 0a2.1 2.1 0 1 0-4.2 0M9.8 6.8a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0M14.9 9.3a2.1 2.1 0 1 0 4.2 0a2.1 2.1 0 1 0-4.2 0' +
      'M2.7 14a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0M17.5 14a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0' +
      'M12 11.6c3.2 0 5.6 3.4 5.6 5.8 0 1.9-1.6 2.9-3.2 2.4-1-.3-1.6-.6-2.4-.6s-1.4.3-2.4.6c-1.6.5-3.2-.5-3.2-2.4 0-2.4 2.4-5.8 5.6-5.8z',
  },
];

/** Badge colors. Must match profiles_badge_color_check. */
export const BADGE_COLORS: Record<string, { name: string; disc: string; glyph: string; ring: string; outer: string }> = {
  noir: { name: 'Noir', disc: '#17161F', glyph: '#FFFFFF', ring: '#FFFFFF', outer: 'rgba(0,0,0,0.18)' },
  or: { name: 'Or', disc: '#F5B400', glyph: '#3A2A00', ring: '#FFF3C4', outer: 'rgba(183,121,31,0.45)' },
  violet: { name: 'Violet', disc: '#5856D6', glyph: '#FFFFFF', ring: '#FFFFFF', outer: 'rgba(88,86,214,0.35)' },
};

/** Decorations around the photo, rendered in 3D (scripts/decorations/render.ts). Must match profiles_decoration_check. */
export const DECORATIONS: {
  id: string;
  name: string;
  hint: string;
  image: ImageSourcePropType;
  /** Second frame shown in turn (flames flicker). */
  flicker?: ImageSourcePropType;
  /** Drawn behind the photo. */
  back?: ImageSourcePropType;
}[] = [
  { id: 'flames', name: 'Anneau de feu', hint: 'Il vacille en vrai', image: require('../../assets/decorations/flames.png'), flicker: require('../../assets/decorations/flames_b.png') },
  { id: 'crown', name: 'Couronne', hint: 'Or et pierres précieuses', image: require('../../assets/decorations/crown.png') },
  { id: 'laurel', name: 'Laurier d’or', hint: 'Partiels validés', image: require('../../assets/decorations/laurel.png') },
  { id: 'angel', name: 'Ange', hint: 'Auréole et ailes', image: require('../../assets/decorations/angel.png'), back: require('../../assets/decorations/angel_back.png') },
  { id: 'grad', name: 'Toque de diplômé', hint: 'Spécial partiels', image: require('../../assets/decorations/grad.png') },
  { id: 'headset', name: 'Casque gamer', hint: 'Mode concentration', image: require('../../assets/decorations/headset.png') },
  { id: 'cat', name: 'Oreilles de chat', hint: 'Trop mignon', image: require('../../assets/decorations/cat.png') },
  { id: 'devil', name: 'Petit diable', hint: 'Cornes laquées', image: require('../../assets/decorations/devil.png') },
  { id: 'orbit', name: 'Étoiles en orbite', hint: 'Ça gravite autour de toi', image: require('../../assets/decorations/orbit.png') },
  { id: 'sakura', name: 'Sakura', hint: 'Branche en fleurs', image: require('../../assets/decorations/sakura.png') },
];

/** Titles shown under the name. Must match profiles_title_check. */
export const TITLES = [
  'Machine de guerre',
  'Roi des partiels',
  'Reine des partiels',
  'Lève-tôt',
  'Oiseau de nuit',
  'Inarrêtable',
  'Cerveau en feu',
  'Rat de bibliothèque',
  'Zéro distraction',
  'Futur major',
  'Mode moine',
  'Légende de la BU',
] as const;

/** This person's title (only while they have Vainc+). */
export function titleOf(p: Someone): string | null {
  return isPremium(p) ? (p?.title ?? null) : null;
}

/** This person's badge (only while they have Vainc+). */
export function badgeOf(p: Someone): { d: string; color: string } | null {
  if (!isPremium(p) || !p?.badge) return null;
  const b = BADGES.find((x) => x.id === p.badge);
  return b ? { d: b.d, color: p.badge_color ?? 'noir' } : null;
}

/** This person's decoration (only while they have Vainc+). */
export function decorationOf(p: Someone): string | null {
  return isPremium(p) ? (p?.decoration ?? null) : null;
}

/** Everything Vainc+ gives, for the Vainc+ screen. */
export const PLUS_PERKS: { icon: string; title: string; text: string }[] = [
  { icon: 'ribbon', title: 'Badge, titre et décoration de photo', text: '12 badges, 12 titres, 10 décorations en 3D (anneau de feu, couronne…).' },
  { icon: 'egg', title: '10 animaux exclusifs', text: 'L’œuf Vainc+ : panthère noire, tigre blanc, loup noir, cobra doré, jaguar…' },
  { icon: 'gift', title: 'Un accessoire offert chaque mois', text: 'Diadème, oreilles de lapin, écharpe galaxie, ailes de papillon…' },
  { icon: 'snow', title: '2 îles en plus + 6 décos gratuites', text: 'Une île de neige, une île volante, et des décos exclusives.' },
  { icon: 'timer', title: 'Effets du chrono', text: 'Thèmes de couleurs, fond animé, ton animal qui fait la fête à côté.' },
  { icon: 'stats-chart', title: 'Stats détaillées', text: 'Par matière, ton meilleur moment, le mois jour par jour.' },
  { icon: 'shield-checkmark', title: '2 jokers de série par mois', text: 'Et tu peux renommer ton animal.' },
  { icon: 'people', title: 'vainc de groupe à 30', text: 'Au lieu de 8. Et 5 essais de 7 jours à offrir à tes potes.' },
];
