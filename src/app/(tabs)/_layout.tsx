import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, ColorValue, View } from 'react-native';
import { useLockin } from '../../lib/store';
import { colors } from '../../lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(active: IconName, inactive: IconName) {
  return ({ focused, color }: { focused: boolean; color: ColorValue }) => (
    <Ionicons name={focused ? active : inactive} size={26} color={color} />
  );
}

export default function TabsLayout() {
  const { loaded, profile } = useLockin();

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!profile) return <Redirect href="/onboarding" />;

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
      <Tabs.Screen name="feed" options={{ title: 'Amis', tabBarIcon: tabIcon('people', 'people-outline') }} />
      <Tabs.Screen
        name="ranking"
        options={{ title: 'Classement', tabBarIcon: tabIcon('trophy', 'trophy-outline') }}
      />
    </Tabs>
  );
}
