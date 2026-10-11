import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import type { LockinEvent } from './social';
import { supabase } from './supabase';

// Show notifications even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** The EAS project id, required by Expo to issue push tokens. Set in app.json (extra.eas.projectId). */
function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Asks for permission and saves this phone's push token for the signed-in user.
 * Silently does nothing on a simulator, without permission, or without a project id.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (!Device.isDevice) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Lockin',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return;

  const id = projectId();
  if (!id) {
    console.warn('Lockin: pas de projectId EAS dans app.json, les notifications push sont désactivées.');
    return;
  }
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await supabase.rpc('register_push_token', { new_token: token });
  } catch (e) {
    console.warn('Lockin: impossible de récupérer le jeton de notification', e);
  }
}

/** Opens the right screen when a notification is tapped. */
export function openFromNotification(data: Record<string, unknown> | undefined) {
  switch (data?.type) {
    case 'friend_request':
    case 'friend_accepted':
    case 'friend_session':
      router.navigate('/feed');
      break;
    case 'event_invite':
    case 'event_start':
      if (typeof data.event_id === 'string') router.navigate({ pathname: '/event/[id]', params: { id: data.event_id } });
      break;
    default:
      router.navigate('/');
  }
}

const EVENT_PREFIX = 'event-';

/** Keeps one local reminder per upcoming group lock-in the user is going to. */
export async function syncEventReminders(events: LockinEvent[]): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const wanted = new Map(
    events.filter((e) => e.myRsvp === 'going' && e.startsAt > Date.now() + 5_000).map((e) => [EVENT_PREFIX + e.id, e]),
  );

  for (const n of scheduled) {
    if (n.identifier.startsWith(EVENT_PREFIX) && !wanted.has(n.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
  const existing = new Set(scheduled.map((n) => n.identifier));
  for (const [identifier, e] of wanted) {
    // Rescheduling an identifier replaces it, so moved events stay correct.
    if (existing.has(identifier) && scheduled.find((n) => n.identifier === identifier)?.content.data?.startsAt === e.startsAt) {
      continue;
    }
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `C'est l'heure de lock in 🔒`,
        body: e.title,
        sound: 'default',
        data: { type: 'event_start', event_id: e.id, startsAt: e.startsAt },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(e.startsAt) },
    });
  }
}
