// Lockin+ : the subscription. The server decides who has it (profiles.premium_until,
// or a featured account) and refuses Lockin+ things to others; this file only mirrors it.
import type { ProfileRow } from './supabase';

type Someone = Pick<ProfileRow, 'display_name' | 'featured' | 'premium_until' | 'badge' | 'frame'> | null | undefined;

export const PLUS_NAME = 'Lockin+';
/** Shown on the Lockin+ screen (the real price comes from the App Store once payments are on). */
export const PLUS_PRICE = '2,99 € / mois';

export function isPremium(p: Someone, now = Date.now()): boolean {
  if (!p) return false;
  return p.featured || (!!p.premium_until && new Date(p.premium_until).getTime() > now);
}

/** The name with its Lockin+ badge, if any. */
export function badged(p: Someone, name = p?.display_name ?? '?'): string {
  return isPremium(p) && p?.badge ? `${name} ${p.badge}` : name;
}

/** The frame to draw around this person's photo (only while they have Lockin+). */
export function frameOf(p: Someone): string | null {
  return isPremium(p) ? (p?.frame ?? null) : null;
}

/** Badges next to the name. Must match profiles_badge_check in supabase/schema.sql. */
export const BADGES = ['🔥', '⚡', '👑', '💎', '🎓', '🦄', '🚀', '🌙', '🍀', '🐉', '🎧', '🧠'] as const;

/** Frames around the photo: a gradient ring. Must match profiles_frame_check in supabase/schema.sql. */
export const FRAMES: Record<string, { name: string; colors: [string, string, ...string[]] }> = {
  gold: { name: 'Or', colors: ['#FFE58A', '#F5B400', '#B7791F', '#FFE58A'] },
  rainbow: { name: 'Arc-en-ciel', colors: ['#FF4D4D', '#FF9F43', '#FFE14D', '#4CD964', '#4DA6FF', '#9B6BFF'] },
  fire: { name: 'Feu', colors: ['#FFD27A', '#FF6B3D', '#B83A1B'] },
  ocean: { name: 'Océan', colors: ['#7FE0FF', '#3BA7F5', '#1C5FA8'] },
  galaxy: { name: 'Galaxie', colors: ['#1E1B4B', '#7B3FE4', '#FF8BF2', '#1E1B4B'] },
  sakura: { name: 'Sakura', colors: ['#FFE3EF', '#FF9CC8', '#C24D86'] },
  neon: { name: 'Néon', colors: ['#22D3EE', '#A3E635', '#F0ABFC'] },
};

/** Everything Lockin+ gives, for the Lockin+ screen. */
export const PLUS_PERKS: { emoji: string; title: string; text: string }[] = [
  { emoji: '📸', title: 'Photo de profil', text: 'Mets ta vraie tête (ou ton meme préféré).' },
  { emoji: '🖼️', title: 'Cadre autour de ta photo', text: '7 cadres : or, arc-en-ciel, feu, galaxie…' },
  { emoji: '🔥', title: 'Badge à côté de ton prénom', text: 'Visible par tous tes potes, partout dans l’app.' },
  { emoji: '🥚', title: '10 animaux exclusifs', text: 'L’œuf Lockin+ : Solari, Kitsura, Chronagon… introuvables ailleurs.' },
  { emoji: '🏝️', title: '6 décos gratuites pour ton île', text: 'Portail magique, montgolfière, trône doré, kiosque…' },
];
