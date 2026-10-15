import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import type { TodoRow } from './supabase';
import { dueAt, formatDay, formatHours, isFinished, reminderAt } from './todos';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import type { VaincEvent } from './social';
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
      name: 'Vainc',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return;

  const id = projectId();
  if (!id) {
    console.warn('Vainc: pas de projectId EAS dans app.json, les notifications push sont désactivées.');
    return;
  }
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await supabase.rpc('register_push_token', { new_token: token });
  } catch (e) {
    console.warn('Vainc: impossible de récupérer le jeton de notification', e);
  }
}

/** Opens the right screen when a notification is tapped. */
export function openFromNotification(data: Record<string, unknown> | undefined) {
  switch (data?.type) {
    case 'friend_request':
    case 'friend_accepted':
    case 'friend_session':
    case 'reaction':
      router.navigate('/feed');
      break;
    case 'todo':
      router.navigate('/todos');
      break;
    case 'message':
      if (typeof data.from === 'string') router.navigate({ pathname: '/chat/[id]', params: { id: data.from } });
      break;
    case 'exam_invite':
      router.navigate('/exams');
      break;
    case 'plus':
      router.navigate('/premium');
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

/** Keeps one local reminder per upcoming group vainc the user is going to. */
export async function syncEventReminders(events: VaincEvent[]): Promise<void> {
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
        title: `C'est l'heure de vainc 🔒`,
        body: e.title,
        sound: 'default',
        data: { type: 'event_start', event_id: e.id, startsAt: e.startsAt },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(e.startsAt) },
    });
  }
}

const TODO_PREFIX = 'todo-';

/** One local reminder per unfinished to-do, at 20 % of its time before the date (2 days minimum). */
export async function syncTodoReminders(todos: TodoRow[]): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const now = Date.now();
  const wanted = new Map(
    todos
      .filter((t) => !isFinished(t) && reminderAt(t).getTime() > now + 60_000)
      .map((t) => [TODO_PREFIX + t.id, t]),
  );
  for (const n of scheduled) {
    if (n.identifier.startsWith(TODO_PREFIX) && !wanted.has(n.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
  for (const [identifier, t] of wanted) {
    const at = reminderAt(t);
    const left = Math.max(0, t.hours - t.worked_seconds / 3600);
    const same = scheduled.find((n) => n.identifier === identifier);
    if (same && same.content.data?.at === at.getTime() && same.content.data?.left === left) continue;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `📝 ${t.title}`,
        body: `Il te reste ${formatHours(left)} à faire avant le ${formatDay(dueAt(t))}. On vainc ?`,
        sound: 'default',
        data: { type: 'todo', todo_id: t.id, at: at.getTime(), left },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  }
}

const PAUSE_WARNING = 'pause-warning';
const PAUSE_END = 'pause-end';

/** "Pause ends in 1 min" and "pause is over" reminders. */
export async function schedulePauseNotifications(until: number): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelPauseNotifications();
  const warnAt = until - 60_000;
  if (warnAt > Date.now() + 5_000) {
    await Notifications.scheduleNotificationAsync({
      identifier: PAUSE_WARNING,
      content: { title: 'Ta pause se termine dans 1 min ⏰', body: 'Prépare-toi à vainc.', sound: 'default', data: { type: 'pause' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(warnAt) },
    });
  }
  await Notifications.scheduleNotificationAsync({
    identifier: PAUSE_END,
    content: {
      title: 'Fin de la pause 🔒',
      body: 'Reviens sur Vainc dans la minute, sinon c’est l’abandon.',
      sound: 'default',
      data: { type: 'pause' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(until) },
  });
}

export async function cancelPauseNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(PAUSE_WARNING).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(PAUSE_END).catch(() => {});
}

const DAILY_PREFIX = 'daily-';

/**
 * One reminder per day for the next week at the chosen time, skipping today if the user
 * already locked in (local notifications can't check the condition when they fire).
 */
export async function syncDailyReminders(
  setting: { enabled: boolean; hour: number; minute: number },
  lockedInToday: boolean,
  streak: number,
): Promise<void> {
  if (Platform.OS === 'web') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.identifier.startsWith(DAILY_PREFIX)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
  if (!setting.enabled) return;
  for (let day = 0; day < 7; day++) {
    const at = new Date();
    at.setDate(at.getDate() + day);
    at.setHours(setting.hour, setting.minute, 0, 0);
    if (at.getTime() <= Date.now() || (day === 0 && lockedInToday)) continue;
    // Tomorrow onwards the streak may have changed; only today's count is certain.
    const body =
      day === 0 && streak > 0
        ? `Ta série de ${streak} j est en danger 🔥`
        : day === 1 && streak > 0
          ? 'Garde ta série en vie 🔥'
          : 'Même 25 min, ça compte.';
    await Notifications.scheduleNotificationAsync({
      identifier: `${DAILY_PREFIX}${day}`,
      content: { title: "T'as pas encore vainc aujourd'hui 👀", body, sound: 'default', data: { type: 'daily' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  }
}
