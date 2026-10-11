import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../lib/auth';
import { SocialProvider } from '../lib/social';
import { LockinProvider } from '../lib/store';
import { colors } from '../lib/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      <SocialProvider>
        <LockinProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="add-friend" options={{ presentation: 'modal' }} />
          </Stack>
        </LockinProvider>
      </SocialProvider>
    </AuthProvider>
  );
}
