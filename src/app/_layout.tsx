import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { AuthProvider, useAuth } from '../lib/auth';
import { openFromNotification, registerForPushNotifications, syncDailyReminders, syncEventReminders, syncTodoReminders } from '../lib/notifications';
import { loadReminder } from '../lib/reminder';
import { dayKey } from '../lib/time';
import { SocialProvider, useSocial } from '../lib/social';
import { VaincProvider } from '../lib/store';
import { ChatProvider } from '../lib/chat';
import { colors } from '../lib/theme';
import { takePendingGift } from '../lib/gifts';
import { supabase } from '../lib/supabase';

/** Says "you've got Vainc+" once when it arrives, and opens a gift link kept from before sign-in. */
function PlusBridge() {
  const { profile } = useAuth();
  const userId = profile?.id;
  const premiumUntil = profile?.premium_until;
  useEffect(() => {
    if (!userId) return;
    takePendingGift().then((code) => code && router.push(`/gift/${code}`));
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    const check = async () => {
      const { data } = await supabase.rpc('unseen_plus');
      const rows = (data ?? []) as { source: string; days: number; giver_name: string | null }[];
      if (!rows.length) return;
      await supabase.rpc('mark_plus_seen');
      const last = rows[rows.length - 1];
      const days = rows.reduce((n, r) => n + r.days, 0);
      router.push({ pathname: '/plus-received', params: { source: last.source, days: String(days), from: last.giver_name ?? '' } });
    };
    check().catch(() => {});
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check().catch(() => {}));
    return () => sub.remove();
  }, [userId, premiumUntil]);
  return null;
}

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
        <VaincProvider>
          <ChatProvider>
          <StatusBar style="dark" />
          {Platform.OS !== 'web' && <NotificationsBridge />}
          <PlusBridge />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="add-friend" options={{ presentation: 'modal' }} />
            <Stack.Screen name="new-event" options={{ presentation: 'modal' }} />
            <Stack.Screen name="groups" options={{ presentation: 'modal' }} />
            <Stack.Screen name="recap" options={{ presentation: 'modal' }} />
            <Stack.Screen name="shop" options={{ presentation: 'modal' }} />
            <Stack.Screen name="bestiary" options={{ presentation: 'modal' }} />
            <Stack.Screen name="premium" options={{ presentation: 'modal' }} />
            <Stack.Screen name="exams" options={{ presentation: 'modal' }} />
            <Stack.Screen name="stats" options={{ presentation: 'modal' }} />
            <Stack.Screen name="plus-received" options={{ presentation: 'modal' }} />
            <Stack.Screen name="gift/[code]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="world" options={{ gestureEnabled: false }} />
          </Stack>
          </ChatProvider>
        </VaincProvider>
      </SocialProvider>
    </AuthProvider>
  );
}
