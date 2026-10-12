import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Button, ErrorText, Field } from '../components/ui';
import { suggestUsername, useAuth } from '../lib/auth';
import { colors, type } from '../lib/theme';

export default function SetupProfile() {
  const { ready, session, profile, profileReady, saveProfile, signOut } = useAuth();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameEdited, setUsernameEdited] = useState(false);
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
      await saveProfile({ username, displayName });
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

          {/* The photo is a Lockin+ perk: it can be added later from the profile. */}
          <View style={styles.photoButton}>
            <Avatar name={name || '?'} size={104} />
            <Text style={type.footnote}>Photo de profil avec Lockin+</Text>
          </View>

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
});
