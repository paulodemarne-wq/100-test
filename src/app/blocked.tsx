import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Row, Section } from '../components/List';
import { BlockedPerson, fetchBlocked, unblockUser } from '../lib/safety';
import { colors, type } from '../lib/theme';

/** The people I blocked, with a button to unblock them. */
export default function Blocked() {
  const [people, setPeople] = useState<BlockedPerson[] | null>(null);
  const load = useCallback(() => {
    fetchBlocked()
      .then(setPeople)
      .catch((e) => {
        setPeople([]);
        Alert.alert('Oups', (e as Error).message);
      });
  }, []);
  useEffect(load, [load]);

  const unblock = (p: BlockedPerson) =>
    Alert.alert(`Débloquer ${p.display_name} ?`, 'Il ou elle pourra de nouveau te demander en ami.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Débloquer',
        onPress: () =>
          unblockUser(p.id)
            .then(load)
            .catch((e) => Alert.alert('Oups', (e as Error).message)),
      },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={[type.title, { flex: 1 }]}>Personnes bloquées</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close} accessibilityLabel="Fermer">
          <Ionicons name="close" size={20} color={colors.secondary} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {people === null ? null : people.length === 0 ? (
          <Text style={[type.subhead, { textAlign: 'center', marginTop: 40 }]}>Tu n'as bloqué personne.</Text>
        ) : (
          <Section footer="Bloquer met fin à l'amitié. Débloquer ne la rétablit pas : il faut se redemander en ami.">
            {people.map((p) => (
              <Row
                key={p.id}
                left={<Avatar name={p.display_name} size={36} />}
                title={p.display_name}
                subtitle={`@${p.username}`}
                right={
                  <Pressable onPress={() => unblock(p)} hitSlop={8}>
                    <Text style={{ color: colors.accent, fontWeight: '700' }}>Débloquer</Text>
                  </Pressable>
                }
              />
            ))}
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingBottom: 40 },
});
