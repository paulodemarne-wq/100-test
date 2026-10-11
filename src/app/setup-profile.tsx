import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Button, ErrorText, Field } from '../components/ui';
import { suggestUsername, useAuth } from '../lib/auth';
import { askProfilePhoto } from '../lib/photo';
import { colors, type } from '../lib/theme';

export default function SetupProfile() {
  const { ready, session, profile, profileReady, saveProfile, signOut } = useAuth();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (ready && !session) return <Redirect href="/login" />;
  if (profile) return <Redirect href="/" />;
  if (!ready || !profileReady) {
    return (
      <View style={[styles.safe, { justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const onNameChange = (value: string) => {
    setName(value);
    if (!usernameEdited) setUsername(suggestUsername(value));
  };

  const submit = async () => {
    setError('');
    const displayName = name.trim();
    if (!displayName) return setError('Entre ton prénom.');
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
      return setError('Ton pseudo doit faire 3 à 20 caractères : lettres minuscules, chiffres, _ ou .');
    }
    setLoading(true);
    try {
      await saveProfile({ username, displayName, localPhotoUri: photoUri });
      router.replace('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginTop: 32 }}>
            <Text style={[type.largeTitle, { textAlign: 'center' }]}>Ton profil</Text>
            <Text style={styles.subtitle}>C'est ce que tes amis verront.</Text>
          </View>

          <Pressable
            onPress={() => askProfilePhoto(setPhotoUri, photoUri ? () => setPhotoUri(null) : undefined)}
            style={styles.photoButton}
          >
            {photoUri ? (
              <Avatar name={name || '?'} photoUri={photoUri} size={104} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera" size={34} color={colors.accent} />
              </View>
            )}
            <Text style={styles.photoLabel}>{photoUri ? 'Modifier la photo' : 'Ajouter une photo'}</Text>
          </Pressable>

          <View style={{ gap: 16 }}>
            <Field label="Prénom" value={name} onChangeText={onNameChange} placeholder="Ton prénom" maxLength={30} autoCapitalize="words" />
            <Field
              label="Pseudo (pour que tes amis te trouvent)"
              value={username}
              onChangeText={(v) => {
                setUsernameEdited(true);
                setUsername(v.toLowerCase().replace(/[^a-z0-9_.]/g, ''));
              }}
              placeholder="pseudo"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
            <ErrorText>{error}</ErrorText>
          </View>

          <View style={{ gap: 16 }}>
            <Button title="Continuer" onPress={submit} loading={loading} disabled={!name.trim() || !username} />
            <Pressable onPress={signOut} hitSlop={8}>
              <Text style={[type.subhead, { textAlign: 'center' }]}>Changer de compte</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.card },
  container: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 12, justifyContent: 'space-between', gap: 28 },
  subtitle: { ...type.body, color: colors.secondary, textAlign: 'center', marginTop: 8 },
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
});
