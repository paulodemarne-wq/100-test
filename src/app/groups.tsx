import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pill, Row, Section } from '../components/List';
import { Button, ErrorText, Field } from '../components/ui';
import { Group, useSocial } from '../lib/social';
import { card, colors, type } from '../lib/theme';

export default function Groups() {
  const { groups, createGroup, joinGroup, leaveGroup } = useSocial();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState('');

  const share = (g: Pick<Group, 'name' | 'code'>) =>
    Share.share({ message: `Rejoins « ${g.name} » sur Lockin 🔒 Code : ${g.code}` });

  const create = async () => {
    setError('');
    if (!name.trim()) return setError('Donne un nom au groupe.');
    setBusy('create');
    try {
      const g = await createGroup(name);
      setName('');
      Alert.alert('Groupe créé 🎉', `Code d'invitation : ${g.code}`, [
        { text: 'OK' },
        { text: 'Partager le code', onPress: () => share(g) },
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const join = async () => {
    setError('');
    if (code.trim().length < 4) return setError('Entre le code du groupe.');
    setBusy('join');
    try {
      await joinGroup(code);
      setCode('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const confirmLeave = (g: Group) =>
    Alert.alert(`Quitter « ${g.name} » ?`, undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Quitter',
        style: 'destructive',
        onPress: () => leaveGroup(g.id).catch((e) => Alert.alert('Oups', (e as Error).message)),
      },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={type.title}>Groupes</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close}>
          <Ionicons name="close" size={20} color={colors.secondary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={type.subhead}>
            Ta promo, ta classe, ton groupe de TD : un classement à part, même avec des gens qui ne sont pas tes amis.
          </Text>

          <Section title="Mes groupes" footer="Appuie sur un groupe pour partager son code. Appui long pour le quitter.">
            {groups.map((g) => (
              <Row
                key={g.id}
                onPress={() => share(g)}
                onLongPress={() => confirmLeave(g)}
                left={
                  <View style={styles.groupIcon}>
                    <Text style={styles.groupInitial}>{g.name.charAt(0).toUpperCase()}</Text>
                  </View>
                }
                title={g.name}
                subtitle={`${g.members.length} membre${g.members.length > 1 ? 's' : ''} · code ${g.code}`}
                right={<Pill title="Partager" onPress={() => share(g)} />}
              />
            ))}
          </Section>

          <View style={[card, styles.block]}>
            <Text style={type.headline}>Rejoindre un groupe</Text>
            <Field
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="CODE"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              style={{ textAlign: 'center', letterSpacing: 4, fontWeight: '700' }}
            />
            <Button title="Rejoindre" onPress={join} loading={busy === 'join'} disabled={!code} />
          </View>

          <View style={[card, styles.block]}>
            <Text style={type.headline}>Créer un groupe</Text>
            <Field value={name} onChangeText={setName} placeholder="Ex : L3 Éco, TD 4…" maxLength={40} />
            <Button title="Créer" variant="secondary" onPress={create} loading={busy === 'create'} style={{ backgroundColor: colors.accentSoft }} />
          </View>

          <ErrorText>{error}</ErrorText>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: { padding: 20, paddingBottom: 40, gap: 4 },
  block: { padding: 16, gap: 12, marginTop: 20 },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupInitial: { color: colors.onAccent, fontSize: 20, fontWeight: '700' },
});
