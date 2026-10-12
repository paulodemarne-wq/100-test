import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { AuthProvider, useAuth } from '../lib/auth';
import { openFromNotification, registerForPushNotifications, syncDailyReminders, syncEventReminders, syncTodoReminders } from '../lib/notifications';
import { loadReminder } from '../lib/reminder';
import { dayKey } from '../lib/time';
import { SocialProvider, useSocial } from '../lib/social';
import { LockinProvider } from '../lib/store';
import { colors } from '../lib/theme';

/** Registers for push, opens tapped notifications and schedules group lock-in reminders. */
function NotificationsBridge() {
  const { profile } = useAuth();
  const { events, loading, mySessions, myStreak, todos } = useSocial();
  const registeredFor = useRef<string | null>(null);
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (profile && registeredFor.current !== profile.id) {
      registeredFor.current = profile.id;
      registerForPushNotifications();
    }
  }, [profile]);

  // Open each tapped notification once, after sign-in.
  const handled = useRef<string | null>(null);
  const signedIn = !!profile;
  useEffect(() => {
    if (!signedIn || !lastResponse) return;
    const id = lastResponse.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    openFromNotification(lastResponse.notification.request.content.data);
  }, [signedIn, lastResponse]);

  useEffect(() => {
    if (profile && !loading) syncEventReminders(events).catch(() => {});
  }, [profile, loading, events]);

  useEffect(() => {
    if (profile && !loading) syncTodoReminders(todos).catch(() => {});
  }, [profile, loading, todos]);

  // Daily "you haven't locked in yet" reminder, skipped today once a session is done.
  const today = dayKey(new Date());
  const lockedInToday = mySessions.some((s) => s.status === 'done' && dayKey(new Date(s.started_at)) === today);
  useEffect(() => {
    if (!profile || loading) return;
    loadReminder()
      .then((setting) => syncDailyReminders(setting, lockedInToday, myStreak))
      .catch(() => {});
  }, [profile, loading, lockedInToday, myStreak]);

  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <SocialProvider>
        <LockinProvider>
          <StatusBar style="dark" />
          {Platform.OS !== 'web' && <NotificationsBridge />}
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="add-friend" options={{ presentation: 'modal' }} />
            <Stack.Screen name="new-event" options={{ presentation: 'modal' }} />
            <Stack.Screen name="groups" options={{ presentation: 'modal' }} />
            <Stack.Screen name="recap" options={{ presentation: 'modal' }} />
            <Stack.Screen name="shop" options={{ presentation: 'modal' }} />
            <Stack.Screen name="bestiary" options={{ presentation: 'modal' }} />
            <Stack.Screen name="world" options={{ gestureEnabled: false }} />
          </Stack>
        </LockinProvider>
      </SocialProvider>
    </AuthProvider>
  );
}
