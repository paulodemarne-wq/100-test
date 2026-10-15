import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlusCelebration } from '../components/PlusCelebration';
import { colors } from '../lib/theme';

/** Shown once when Vainc+ arrives: a friend's gift, a referral month, or given by hand. */
export default function PlusReceived() {
  const { source, days, from } = useLocalSearchParams<{ source?: string; days?: string; from?: string }>();
  const n = Number(days) || 7;
  const length = n >= 28 ? `${Math.round(n / 30) || 1} mois` : `${n} jours`;
  const text =
    source === 'referral'
      ? `Parrainage réussi${from ? ` avec ${from}` : ''} : ${length} de Vainc+ offerts.`
      : from
        ? `${from} t'a offert ${length} de Vainc+.`
        : `Tu as reçu ${length} de Vainc+.`;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <PlusCelebration title="Tu as Vainc+ 🎉" text={text} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, justifyContent: 'center', padding: 20 },
});
