import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLockin } from '../lib/store';
import { colors } from '../lib/theme';

const EMOJIS = ['🦊', '🐸', '🐼', '🦁', '🐙', '🐯', '🐨', '🦄', '🐺', '🐧'];

export default function Onboarding() {
  const { setProfile } = useLockin();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const trimmed = name.trim();

  const submit = () => {
    if (!trimmed) return;
    setProfile({ name: trimmed, emoji });
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <View>
          <Text style={styles.logo}>Lockin 🔒</Text>
          <Text style={styles.tagline}>Révise avec tes potes.{'\n'}Ceux qui lâchent sont démasqués.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Ton prénom ou pseudo</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ex : Paulo"
            placeholderTextColor={colors.muted}
            style={styles.input}
            maxLength={20}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
          />

          <Text style={styles.label}>Ton avatar</Text>
          <View style={styles.emojis}>
            {EMOJIS.map((e) => (
              <Pressable key={e} onPress={() => setEmoji(e)} style={[styles.emoji, e === emoji && styles.emojiSelected]}>
                <Text style={{ fontSize: 26 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable onPress={submit} disabled={!trimmed} style={[styles.button, !trimmed && { opacity: 0.4 }]}>
          <Text style={styles.buttonText}>C'est parti</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 24, justifyContent: 'space-between' },
  logo: { color: colors.accent, fontSize: 44, fontWeight: '900', marginTop: 32 },
  tagline: { color: colors.text, fontSize: 20, marginTop: 12, lineHeight: 28 },
  form: { gap: 12 },
  label: { color: colors.muted, fontSize: 14, fontWeight: '600', marginTop: 8 },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    color: colors.text,
    fontSize: 18,
  },
  emojis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emoji: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emojiSelected: { borderColor: colors.accent },
  button: { backgroundColor: colors.accent, borderRadius: 16, padding: 18, alignItems: 'center' },
  buttonText: { color: colors.accentText, fontSize: 18, fontWeight: '800' },
});
