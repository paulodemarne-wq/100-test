// The 40 realistic animals: 30 for everyone (ids 0..29) and 10 Vainc+ (ids 30..39).
// Each one stays the same animal from baby to legend; its element gives it its powers.
import type { BirdLook } from './bird';
import type { Element } from './powers';
import type { QuadLook } from './quadruped';
import type { SnakeLook } from './snake';

export type Kind = 'snake' | 'quad' | 'bird';
export type RealSpecies = {
  id: number;
  name: string;
  /** Short description for the bestiary. */
  about: string;
  kind: Kind;
  element: Element;
  plus: boolean;
  look: SnakeLook | QuadLook | BirdLook;
};

const snake = (name: string, about: string, element: Element, look: Omit<SnakeLook, 'element'>) => ({ name, about, kind: 'snake' as const, element, look: { ...look, element } });
const quad = (name: string, about: string, element: Element, look: Omit<QuadLook, 'element'>) => ({ name, about, kind: 'quad' as const, element, look: { ...look, element } });
const bird = (name: string, about: string, element: Element, look: Omit<BirdLook, 'element'>) => ({ name, about, kind: 'bird' as const, element, look: { ...look, element } });

const BASE = [
  // ── Snakes
  snake('Python royal', 'Calme et puissant, il s’enroule pour réviser.', 'fire', { pattern: 'python', base: '#9A7A4A', dark: '#3B2A1A', light: '#D8C28E', belly: '#EDE3C8', iris: '#B8862E', majestic: { base: '#C99A3A', dark: '#2A1A0E', light: '#F2D58A', iris: '#E8B23A' } }),
  snake('Cobra royal', 'Il se dresse quand tu lock in.', 'shadow', { pattern: 'cobra', base: '#5C5A3A', dark: '#2A2A1C', light: '#D9CF9A', belly: '#E8DDB0', iris: '#C9A23A', hood: true, girth: 0.8, majestic: { base: '#3A3348', dark: '#16121E', light: '#C9B2FF', iris: '#C49BFF' } }),
  snake('Boa émeraude', 'Vert vif, il dort en boule dans les arbres.', 'nature', { pattern: 'emerald', base: '#1E9E4A', dark: '#0E5A2A', light: '#F4F8E8', belly: '#F2E38A', iris: '#C9C060', girth: 0.85, majestic: { base: '#2BCB5E', dark: '#0B4A22', light: '#FFFFFF', iris: '#E8F070' } }),
  snake('Serpent-roi', 'Rouge, noir, jaune : il ne passe pas inaperçu.', 'lightning', { pattern: 'bands', base: '#C8322A', dark: '#151212', light: '#F2D24A', belly: '#F3E6C8', iris: '#3A2A20', girth: 0.7, majestic: { base: '#E8402F', light: '#FFE45A' } }),
  snake('Crotale', 'Sa queue fait du bruit quand on le dérange.', 'fire', { pattern: 'diamond', base: '#A8906A', dark: '#4A3826', light: '#EDE0C0', belly: '#EDE3CC', iris: '#C9A23A', girth: 0.9, majestic: { base: '#C49A5A', dark: '#3A2410' } }),
  snake('Vipère', 'Petite mais très concentrée.', 'ice', { pattern: 'viper', base: '#8E8A80', dark: '#2A2624', light: '#D8D4CA', belly: '#C9C6C0', iris: '#C9432A', girth: 0.75, majestic: { base: '#B8C6D2', dark: '#1E2A36', iris: '#7FE2FF' } }),
  // ── Mammals
  quad('Loup gris', 'Il chasse en meute, il bosse en meute.', 'ice', { coat: 'wolf', base: '#8C8478', back: '#4A433C', belly: '#E8E1D4', accent: '#2E2925', iris: '#C9902E', mane: 'majestic', majestic: { base: '#B9B7B4', back: '#5E6070', belly: '#F6F5F2', iris: '#8FD8FF' } }),
  quad('Renard roux', 'Malin, il trouve toujours un moyen de finir.', 'fire', { coat: 'fox', base: '#C8642A', back: '#9C4A1E', belly: '#F2ECE2', accent: '#2A1E18', iris: '#D89A2A', length: 0.85, height: 0.75, snout: 1.15, ears: 'big', fur: 1.1, majestic: { base: '#E8742A', back: '#B04A12' } }),
  quad('Renard polaire', 'Blanc comme la neige, il ne lâche rien.', 'ice', { coat: 'fox', base: '#F2F0EC', back: '#DAD6CE', belly: '#FFFFFF', accent: '#B8B2A8', iris: '#5A4A30', length: 0.8, height: 0.7, snout: 0.9, ears: 'round', fur: 1.5 }),
  quad('Tigre', 'Rayé, silencieux, redoutable avant les partiels.', 'fire', { coat: 'tiger', base: '#D9822B', back: '#C46A1E', belly: '#F4EEE4', accent: '#1A1410', iris: '#D8B23A', length: 1.15, height: 0.9, girth: 1.15, snout: 0.75, ears: 'round', tail: 'thin', fur: 0.3, majestic: { base: '#F09A30', back: '#D07018' } }),
  quad('Lion', 'Le roi de la BU.', 'fire', { coat: 'lion', base: '#C9A06A', back: '#B88A52', belly: '#E8D6B4', accent: '#5A3A1E', iris: '#C9902E', length: 1.1, height: 0.92, girth: 1.15, snout: 0.8, ears: 'round', tail: 'tuft', fur: 0.35, mane: 'adult', majestic: { base: '#DDB070', accent: '#3A2010' } }),
  quad('Léopard', 'Agile, il saute de chapitre en chapitre.', 'shadow', { coat: 'leopard', base: '#D2A45A', back: '#C08E44', belly: '#F2E8D6', accent: '#1E1612', iris: '#B8C23A', length: 1.05, height: 0.85, snout: 0.72, ears: 'round', tail: 'thin', fur: 0.3 }),
  quad('Panthère des neiges', 'Discrète, elle vit sur les sommets.', 'ice', { coat: 'leopard', base: '#D8D4CC', back: '#C2BCB2', belly: '#F4F2EE', accent: '#4A4644', iris: '#8FB8A8', length: 1.0, height: 0.8, snout: 0.7, ears: 'round', tail: 'bushy', fur: 1.0 }),
  quad('Guépard', 'Le plus rapide pour finir ses fiches.', 'lightning', { coat: 'leopard', base: '#DDB26A', back: '#CDA055', belly: '#F4ECDC', accent: '#1A1410', iris: '#C9A23A', length: 1.05, height: 1.05, girth: 0.82, snout: 0.7, head: 0.85, ears: 'round', tail: 'thin', fur: 0.2 }),
  quad('Ours brun', 'Il hiberne… mais pas pendant les révisions.', 'nature', { coat: 'plain', base: '#6A4A30', back: '#4E3420', belly: '#7A5A3E', accent: '#2A1C12', iris: '#3A2A1C', length: 0.95, height: 0.82, girth: 1.4, snout: 0.75, head: 1.15, ears: 'round', tail: 'short', fur: 1.4 }),
  quad('Ours polaire', 'Énorme, doux, imbattable dans le froid.', 'ice', { coat: 'plain', base: '#F2EEE4', back: '#E6E0D2', belly: '#FAF8F2', accent: '#BEB6A4', iris: '#2A2420', length: 1.05, height: 0.85, girth: 1.45, snout: 0.95, head: 1.05, ears: 'round', tail: 'short', fur: 1.3 }),
  quad('Panda', 'Il mange du bambou en relisant ses cours.', 'nature', { coat: 'panda', base: '#F2F0EA', back: '#EAE6DE', belly: '#F6F4EE', accent: '#1A1818', iris: '#2A2420', length: 0.85, height: 0.72, girth: 1.4, snout: 0.6, head: 1.25, ears: 'round', tail: 'short', fur: 1.3 }),
  quad('Cerf', 'Ses bois grandissent avec ton temps de travail.', 'nature', { coat: 'deer', base: '#9C6A3E', back: '#7E5230', belly: '#E8DCC8', accent: '#3A2818', iris: '#2A1C14', length: 1.0, height: 1.25, girth: 0.85, snout: 1.05, head: 0.95, ears: 'big', tail: 'short', fur: 0.25, antlers: true }),
  quad('Zèbre', 'Noir sur blanc, comme tes fiches.', 'lightning', { coat: 'zebra', base: '#F4F2EE', back: '#EEEAE4', belly: '#F8F6F2', accent: '#161414', iris: '#2A2420', length: 1.05, height: 1.15, girth: 1.0, snout: 1.25, head: 1.05, ears: 'big', tail: 'tuft', fur: 0.15 }),
  quad('Lynx', 'Ses oreilles entendent tout, même les notifs.', 'shadow', { coat: 'leopard', base: '#B8A07E', back: '#9E8664', belly: '#EDE4D4', accent: '#4A3A2A', iris: '#C9B23A', length: 0.85, height: 0.85, snout: 0.65, ears: 'big', tail: 'short', fur: 1.1 }),
  quad('Chat sauvage', 'Il fait semblant de dormir, mais il révise.', 'nature', { coat: 'tiger', base: '#8E7E68', back: '#6E604E', belly: '#D8CCB8', accent: '#2E2620', iris: '#9CC23A', length: 0.75, height: 0.65, snout: 0.65, head: 1.1, ears: 'round', tail: 'bushy', fur: 0.9 }),
  quad('Coyote', 'Il hurle quand il finit un chapitre.', 'lightning', { coat: 'wolf', base: '#A8885E', back: '#7A6044', belly: '#E8DCC6', accent: '#3A2E22', iris: '#D8A23A', length: 0.9, height: 0.9, girth: 0.9, snout: 1.1, ears: 'big', fur: 0.9 }),
  // ── Birds
  bird('Pygargue', 'La tête blanche des champions.', 'lightning', { head: '#F4F1EA', body: '#3D2A1C', wing: '#35251A', tail: '#F2EEE6', chest: '#4A3322', chick: '#B9B2A8', beak: '#F2B21B', legs: '#E8B526', iris: '#F0D24A', majestic: { body: '#2A1A10', wing: '#24170E', chest: '#3A2416', iris: '#FFD84A', beak: '#FFC21A', head: '#FFFFFF' } }),
  bird('Aigle royal', 'Il plane très haut au-dessus des notes.', 'fire', { head: '#B8822E', body: '#4A321E', wing: '#3E2A18', tail: '#5A4026', chest: '#5A3E24', chick: '#E8E2D8', beak: '#3A3230', legs: '#E8B526', iris: '#B8742A' }),
  bird('Chouette effraie', 'Elle révise la nuit, sans un bruit.', 'shadow', { head: '#F2E6D2', body: '#D2A86A', wing: '#C49A5E', tail: '#D8B47A', chest: '#FAF4EA', chick: '#F4F0EA', beak: '#E8D8C0', legs: '#D8C8B0', iris: '#151212', owl: true, beakShape: 'straight' }),
  bird('Grand-duc', 'Ses yeux orange voient tout.', 'nature', { head: '#8A6A44', body: '#6E5234', wing: '#5E462C', tail: '#6E5234', chest: '#B8946A', chick: '#D8D0C4', beak: '#2A2420', legs: '#C8B494', iris: '#FF8A1E', owl: true, tufts: true }),
  bird('Faucon pèlerin', 'Le plus rapide du ciel.', 'lightning', { head: '#2E343C', body: '#5A6470', wing: '#4A525E', tail: '#5A6470', chest: '#E8E2D6', chick: '#F2EEE8', beak: '#E8C23A', legs: '#F2C23A', iris: '#2A1C14' }),
  bird('Ara rouge', 'Rouge, bleu, jaune : il met de la couleur dans tes journées.', 'fire', { head: '#D8242A', body: '#D22A2A', wing: '#2A5AC8', tail: '#2A6AD8', chest: '#D82A2A', chick: '#C8C0B8', beak: '#E8E2D8', legs: '#6A6460', iris: '#F2E8C8', beakShape: 'parrot', longTail: true }),
  bird('Harfang des neiges', 'Blanc, mystérieux, il vient du grand nord.', 'ice', { head: '#FAFAF6', body: '#F2F0EA', wing: '#ECEAE2', tail: '#F2F0EA', chest: '#FFFFFF', chick: '#B8B4AE', beak: '#2A2420', legs: '#F2F0EA', iris: '#F2C21A', owl: true }),
  bird('Grand corbeau', 'Très intelligent, il retient tout.', 'shadow', { head: '#16161C', body: '#14141A', wing: '#121218', tail: '#14141A', chest: '#1A1A22', chick: '#4A4A50', beak: '#121214', legs: '#1A1A1E', iris: '#2A2420', beakShape: 'straight' }),
];

const PLUS = [
  quad('Panthère noire', 'Vainc+ · Invisible dans la nuit, imbattable au lock in.', 'shadow', { coat: 'plain', base: '#1A1820', back: '#121016', belly: '#24222A', accent: '#0A0A0E', iris: '#F2C21A', length: 1.05, height: 0.85, snout: 0.72, ears: 'round', tail: 'thin', fur: 0.3, majestic: { base: '#221E2E', iris: '#C49BFF' } }),
  quad('Tigre blanc', 'Vainc+ · Le plus rare des tigres.', 'ice', { coat: 'tiger', base: '#F4F2EE', back: '#E8E4DC', belly: '#FFFFFF', accent: '#2A2830', iris: '#6FA8D8', length: 1.15, height: 0.9, girth: 1.15, snout: 0.75, ears: 'round', tail: 'thin', fur: 0.35 }),
  quad('Lion à crinière noire', 'Vainc+ · Une crinière qui impose le respect.', 'fire', { coat: 'lion', base: '#C9A06A', back: '#B88A52', belly: '#E8D6B4', accent: '#1E140C', iris: '#E8902E', length: 1.12, height: 0.94, girth: 1.2, snout: 0.8, ears: 'round', tail: 'tuft', fur: 0.35, mane: 'adult' }),
  quad('Loup noir', 'Vainc+ · Le chef de meute.', 'lightning', { coat: 'wolf', base: '#2A2A30', back: '#16161A', belly: '#4A4A52', accent: '#0A0A0E', iris: '#F2D24A', mane: 'majestic' }),
  snake('Cobra doré', 'Vainc+ · Des écailles comme de l’or.', 'fire', { pattern: 'cobra', base: '#D8A83A', dark: '#7A5A1E', light: '#FFF2B8', belly: '#FFF4D0', iris: '#E84A1A', hood: true, girth: 0.82 }),
  snake('Anaconda', 'Vainc+ · Le plus grand serpent du monde.', 'nature', { pattern: 'python', base: '#5A6A3A', dark: '#1E2214', light: '#C8B86A', belly: '#D8D0A0', iris: '#C9A23A', girth: 1.25 }),
  bird('Ara hyacinthe', 'Vainc+ · Le perroquet bleu le plus rare.', 'lightning', { head: '#2A3EA8', body: '#2A40B0', wing: '#2238A0', tail: '#2A40B0', chest: '#2E46B8', chick: '#8A8AA0', beak: '#1A1A1E', legs: '#3A3A40', iris: '#F2D24A', beakShape: 'parrot', longTail: true }),
  bird('Harpie féroce', 'Vainc+ · L’aigle à la couronne de plumes.', 'shadow', { head: '#B8B8BC', body: '#2E2E34', wing: '#26262C', tail: '#3A3A40', chest: '#F2F0EA', chick: '#F2F0EA', beak: '#1A1A1E', legs: '#E8C23A', iris: '#C98A2A' }),
  quad('Renard argenté', 'Vainc+ · Noir et argent, il brille dans la neige.', 'ice', { coat: 'fox', base: '#3A3A40', back: '#1E1E24', belly: '#C8C8CC', accent: '#F2F2F6', iris: '#D8A23A', length: 0.85, height: 0.75, snout: 1.15, ears: 'big', fur: 1.3 }),
  quad('Jaguar', 'Vainc+ · Le roi de la jungle, le vrai.', 'nature', { coat: 'leopard', base: '#D29A42', back: '#BE8430', belly: '#F2E6D2', accent: '#1A120E', iris: '#C9C23A', length: 1.05, height: 0.82, girth: 1.2, snout: 0.75, head: 1.1, ears: 'round', tail: 'thin', fur: 0.3 }),
];

export const REAL_SPECIES: RealSpecies[] = [
  ...BASE.map((s, id) => ({ ...s, id, plus: false })),
  ...PLUS.map((s, i) => ({ ...s, id: 30 + i, plus: true })),
];

export const PLUS_FIRST_ID = 30;
export const SPECIES_COUNT = REAL_SPECIES.length;
