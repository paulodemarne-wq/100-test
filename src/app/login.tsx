import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorText, Field } from '../components/ui';
import { useAuth } from '../lib/auth';
import { colors, type } from '../lib/theme';

export default function Login() {
  const { session, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  if (session) return <Redirect href="/" />;

  const submit = async () => {
    setError('');
    setInfo('');
    if (!email.includes('@')) return setError('Entre ton adresse e-mail.');
    if (password.length < 6) return setError('Le mot de passe doit faire au moins 6 caractères.');
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { needsEmailConfirmation } = await signUp(email, password);
        if (needsEmailConfirmation) {
          setMode('signin');
          setInfo('Compte créé ! Clique sur le lien reçu par e-mail, puis connecte-toi ici.');
        }
      } else {
        await signIn(email, password);
      }
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
          <View style={styles.top}>
            <View style={styles.logo}>
              <Ionicons name="lock-closed" size={30} color={colors.onAccent} />
            </View>
            <Text style={styles.title}>Lockin</Text>
            <Text style={styles.subtitle}>Révise avec tes amis.{'\n'}Restez concentrés, ensemble.</Text>
          </View>

          <View style={styles.form}>
            <Field
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              placeholder="toi@exemple.fr"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <Field
              label="Mot de passe"
              value={password}
              onChangeText={setPassword}
              placeholder="6 caractères minimum"
              secureTextEntry
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              textContentType={mode === 'signup' ? 'newPassword' : 'password'}
              onSubmitEditing={submit}
            />
            <ErrorText>{error}</ErrorText>
            {info ? <Text style={styles.info}>{info}</Text> : null}
          </View>

          <View style={{ gap: 16 }}>
            <Button title={mode === 'signup' ? 'Créer mon compte' : 'Se connecter'} onPress={submit} loading={loading} />
            <Pressable
              onPress={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup');
                setError('');
                setInfo('');
              }}
              hitSlop={8}
            >
              <Text style={styles.switch}>
                {mode === 'signup' ? 'Déjà un compte ? ' : 'Pas encore de compte ? '}
                <Text style={{ color: colors.accent, fontWeight: '600' }}>
                  {mode === 'signup' ? 'Se connecter' : 'Créer un compte'}
                </Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.card },
  container: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 12, justifyContent: 'space-between', gap: 32 },
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
  form: { gap: 16 },
  info: { color: colors.success, fontSize: 15, textAlign: 'center', lineHeight: 20 },
  switch: { ...type.subhead, textAlign: 'center' },
});
