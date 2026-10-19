import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LEGAL } from '../lib/legalText';
import { colors, type } from '../lib/theme';

/** Privacy policy and terms of use (also published on the web, see docs/). */
export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const page = LEGAL[doc === 'terms' ? 'terms' : 'privacy'];
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={[type.title, { flex: 1 }]}>{page.title}</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close} accessibilityLabel="Fermer">
          <Ionicons name="close" size={20} color={colors.secondary} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={type.footnote}>Mise à jour : {page.updated}</Text>
        {page.sections.map((s) => (
          <View key={s.h} style={{ marginTop: 18 }}>
            <Text style={type.headline}>{s.h}</Text>
            {s.p.map((t, i) => (
              <Text key={i} style={[type.body, { marginTop: 6 }]}>
                {t}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
});
