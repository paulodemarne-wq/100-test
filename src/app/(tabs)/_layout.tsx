import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, ColorValue, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { useSocial } from '../../lib/social';
import { useLockin } from '../../lib/store';
import { useChat } from '../../lib/chat';
import { colors } from '../../lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(active: IconName, inactive: IconName) {
  return ({ focused, color }: { focused: boolean; color: ColorValue }) => (
    <Ionicons name={focused ? active : inactive} size={26} color={color} />
  );
}

export default function TabsLayout() {
  const { ready, session, profile, profileReady } = useAuth();
  const { loaded } = useLockin();
  const { incomingRequests } = useSocial();
  const { unreadTotal } = useChat();
  const amisBadge = incomingRequests.length + unreadTotal;

  if (ready && !session) return <Redirect href="/login" />;
  if (ready && profileReady && !profile) return <Redirect href="/setup-profile" />;
  if (!ready || !profileReady || !loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: { backgroundColor: 'rgba(249,249,249,0.97)', borderTopColor: colors.separator },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.secondary,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Focus', tabBarIcon: tabIcon('timer', 'timer-outline') }} />
      <Tabs.Screen name="todos" options={{ title: 'To-do', tabBarIcon: tabIcon('checkbox', 'checkbox-outline') }} />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Amis',
          tabBarIcon: tabIcon('people', 'people-outline'),
          tabBarBadge: amisBadge > 0 ? amisBadge : undefined,
        }}
      />
      <Tabs.Screen name="pet" options={{ title: 'Mon animal', tabBarIcon: tabIcon('paw', 'paw-outline') }} />
      <Tabs.Screen
        name="ranking"
        options={{ title: 'Classement', tabBarIcon: tabIcon('trophy', 'trophy-outline') }}
      />
    </Tabs>
  );
}
