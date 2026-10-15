import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { card, colors, type } from '../lib/theme';
import { Avatar } from './Avatar';

/** "You've got Vainc+": shown once after receiving it (gift, referral, or by hand). */
export function PlusCelebration({ title, text }: { title: string; text: string }) {
  const { profile } = useAuth();
  return (
    <View style={[card, styles.card]}>
      <Avatar name={profile?.display_name ?? '?'} photoUri={profile?.avatar_url} size={96} decoration="crown" />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.text}>{text}</Text>
      <Pressable onPress={() => router.replace('/premium')} style={styles.button}>
        <Text style={styles.buttonText}>Choisir mon badge et ma déco ✨</Text>
      </Pressable>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10}>
        <Text style={type.subhead}>Plus tard</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 12, paddingTop: 70, paddingBottom: 22, paddingHorizontal: 22 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 26 },
  text: { ...type.subhead, textAlign: 'center' },
  button: { alignSelf: 'stretch', backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 6 },
  buttonText: { color: colors.onAccent, fontWeight: '800', fontSize: 17 },
});
