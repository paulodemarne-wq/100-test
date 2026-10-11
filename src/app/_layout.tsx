import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LockinProvider } from '../lib/store';
import { colors } from '../lib/theme';

export default function RootLayout() {
  return (
    <LockinProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </LockinProvider>
  );
}
