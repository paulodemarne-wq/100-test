// Vainc+ gifts by link (like Snapchat+): a subscriber shares a link, the first friend who opens it gets 7 days.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

/** A gift opened before signing in, kept until the account is ready. */
const PENDING_KEY = 'vainc/gift';

/** The link that opens the gift in the app (vainc://gift/CODE). */
export function giftUrl(code: string): string {
  return Linking.createURL(`gift/${code}`);
}

export function giftMessage(code: string): string {
  return `🎁 Je t'offre 7 jours de Vainc+ ! Ouvre ce lien : ${giftUrl(code)}\n\nOu dans Vainc → Vainc+ → « J'ai un code cadeau » : ${code}`;
}

export async function savePendingGift(code: string) {
  await AsyncStorage.setItem(PENDING_KEY, code).catch(() => {});
}

/** The gift waiting for the account, once (it is forgotten after this). */
export async function takePendingGift(): Promise<string | null> {
  try {
    const code = await AsyncStorage.getItem(PENDING_KEY);
    if (code) await AsyncStorage.removeItem(PENDING_KEY);
    return code;
  } catch {
    return null;
  }
}
