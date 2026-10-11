import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { askProfilePhoto } from '../lib/photo';
import { useLockin } from '../lib/store';
import { colors, type } from '../lib/theme';

export default function Onboarding() {
  const { setProfile } = useLockin();
  const [name, setName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const trimmed = name.trim();

  const submit = () => {
    if (!trimmed) return;
    setProfile({ name: trimmed, photoUri });
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <View style={styles.top}>
          <View style={styles.logo}>
            <Ionicons name="lock-closed" size={30} color={colors.onAccent} />
          </View>
          <Text style={styles.title}>Bienvenue sur Lockin</Text>
          <Text style={styles.subtitle}>Révise avec tes amis.{'\n'}Restez concentrés, ensemble.</Text>
        </View>

        <View style={styles.form}>
          <Pressable
            onPress={() => askProfilePhoto(setPhotoUri, photoUri ? () => setPhotoUri(null) : undefined)}
            style={styles.photoButton}
          >
            {photoUri ? (
              <Avatar name={trimmed || '?'} photoUri={photoUri} size={104} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera" size={34} color={colors.accent} />
              </View>
            )}
            <Text style={styles.photoLabel}>{photoUri ? 'Modifier la photo' : 'Ajouter une photo'}</Text>
          </Pressable>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ton prénom"
            placeholderTextColor={colors.tertiary}
            style={styles.input}
            maxLength={20}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </View>

        <Pressable
          onPress={submit}
          disabled={!trimmed}
          style={({ pressed }) => [styles.button, !trimmed && styles.buttonDisabled, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.buttonText}>Continuer</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.card },
  container: { flex: 1, paddingHorizontal: 24, paddingBottom: 12, justifyContent: 'space-between' },
  top: { alignItems: 'center', marginTop: 48 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { ...type.largeTitle, textAlign: 'center' },
  subtitle: { ...type.body, color: colors.secondary, textAlign: 'center', marginTop: 8, lineHeight: 24 },
  form: { alignItems: 'center', gap: 28 },
  photoButton: { alignItems: 'center', gap: 10 },
  photoPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLabel: { fontSize: 15, fontWeight: '600', color: colors.accent },
  input: {
    alignSelf: 'stretch',
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 17,
    color: colors.text,
    textAlign: 'center',
  },
  button: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  buttonDisabled: { backgroundColor: colors.tertiary },
  buttonText: { color: colors.onAccent, fontSize: 17, fontWeight: '600' },
});
