import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Badge } from '../components/Badge';
import { useAuth } from '../lib/auth';
import { BADGE_COLORS, BADGES, DECORATIONS, isPremium, PLUS_NAME, PLUS_PERKS, PLUS_PRICE, PLUS_PRICE_YEAR } from '../lib/premium';
import { card, colors, type } from '../lib/theme';

/** Lockin+: what it gives, how to get it, and (once you have it) your badge and photo decoration. */
export default function Premium() {
  const { profile, updateSettings } = useAuth();
  if (!profile) return null;
  const premium = isPremium(profile);
  const until = profile.premium_until ? new Date(profile.premium_until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  const subscribe = () =>
    Alert.alert(
      'Bientôt 🔜',
      "Le paiement arrive avec la sortie de Lockin sur l'App Store. D'ici là, un ami Lockin+ peut t'offrir un essai de 7 jours.",
    );
  const locked = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(`Réservé à ${PLUS_NAME}`, 'Prends Lockin+ pour choisir ton badge et ta décoration.');
  };
  const save = (fields: Parameters<typeof updateSettings>[0]) => {
    if (!premium) return locked();
    Haptics.selectionAsync();
    updateSettings(fields).catch((e) => Alert.alert('Oups', (e as Error).message));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={type.title}>{PLUS_NAME}</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close} accessibilityLabel="Fermer">
          <Ionicons name="close" size={20} color={colors.secondary} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Avatar name={profile.display_name} photoUri={profile.avatar_url} size={96} decoration={premium ? profile.decoration : 'crown'} />
          <Text style={styles.heroTitle}>
            {premium ? `Tu as ${PLUS_NAME} ✓` : `Passe à ${PLUS_NAME}`}
          </Text>
          <Text style={styles.heroText}>
            {premium
              ? profile.featured
                ? 'Compte créateur : Lockin+ à vie.'
                : `Jusqu'au ${until}.`
              : 'Le look en plus, sans jamais t’aider à gagner : le classement reste juste.'}
          </Text>
        </View>

        <View style={[card, styles.perks]}>
          {PLUS_PERKS.map((p) => (
            <View key={p.title} style={styles.perk}>
              <View style={styles.perkIcon}>
                <Ionicons name={p.icon as keyof typeof Ionicons.glyphMap} size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.headline}>{p.title}</Text>
                <Text style={type.footnote}>{p.text}</Text>
              </View>
            </View>
          ))}
        </View>

        {!premium && (
          <View style={{ gap: 10 }}>
            <Pressable onPress={subscribe} style={[styles.buy, styles.buyMain]}>
              <Text style={styles.buyMainText}>Essai gratuit 7 jours</Text>
              <Text style={styles.buyMainSub}>puis {PLUS_PRICE}</Text>
            </Pressable>
            <Pressable onPress={subscribe} style={styles.buy}>
              <Text style={styles.buyText}>{PLUS_PRICE_YEAR} · 44 % moins cher</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.sectionTitle}>MON BADGE</Text>
        <View style={[card, styles.pickerCard]}>
          <View style={styles.colors}>
            {Object.entries(BADGE_COLORS).map(([id, c]) => {
              const on = profile.badge_color === id;
              return (
                <Pressable key={id} onPress={() => save({ badge_color: id })} style={[styles.chip, on && styles.chipOn]}>
                  <View style={[styles.swatch, { backgroundColor: c.disc }]} />
                  <Text style={[styles.chipText, on && { color: colors.onAccent }]}>{c.name}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.grid}>
            <Pressable onPress={() => save({ badge: null })} style={[styles.cell, premium && !profile.badge && styles.cellOn]}>
              <Ionicons name="close-circle-outline" size={30} color={colors.tertiary} />
              <Text style={styles.cellText}>Aucun</Text>
            </Pressable>
            {BADGES.map((b) => (
              <Pressable key={b.id} onPress={() => save({ badge: b.id })} style={[styles.cell, premium && profile.badge === b.id && styles.cellOn]}>
                <Badge d={b.d} color={profile.badge_color} size={34} />
                <Text style={styles.cellText}>{b.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.sectionTitle}>MA DÉCORATION DE PHOTO</Text>
        <View style={[card, styles.pickerCard]}>
          <View style={styles.grid}>
            <Pressable onPress={() => save({ decoration: null })} style={[styles.decoCell, premium && !profile.decoration && styles.cellOn]}>
              <Avatar name={profile.display_name} photoUri={profile.avatar_url} size={52} />
              <Text style={styles.cellText}>Aucune</Text>
            </Pressable>
            {DECORATIONS.map((d) => (
              <Pressable key={d.id} onPress={() => save({ decoration: d.id })} style={[styles.decoCell, premium && profile.decoration === d.id && styles.cellOn]}>
                <Avatar name={profile.display_name} photoUri={profile.avatar_url} size={52} decoration={d.id} />
                <Text style={styles.cellText} numberOfLines={1}>
                  {d.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Text style={type.footnote}>
          Ta photo de profil reste gratuite. Si Lockin+ s'arrête, ton badge et ta décoration sont gardés de côté et reviennent quand tu reprends.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16 },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, paddingBottom: 40, gap: 14 },
  hero: { alignItems: 'center', gap: 8, paddingTop: 44, paddingBottom: 8 },
  heroTitle: { fontSize: 26, fontWeight: '800', color: colors.text, marginTop: 26 },
  heroText: { ...type.subhead, textAlign: 'center', paddingHorizontal: 20 },
  perks: { padding: 14, gap: 14 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  perkIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  buy: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.card },
  buyMain: { backgroundColor: colors.accent },
  buyMainText: { color: colors.onAccent, fontSize: 18, fontWeight: '800' },
  buyMainSub: { color: colors.onAccent, opacity: 0.85, fontSize: 13, fontWeight: '600' },
  buyText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  sectionTitle: { ...type.footnote, fontWeight: '700', marginTop: 8, marginLeft: 4 },
  pickerCard: { padding: 12, gap: 12 },
  colors: { flexDirection: 'row', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.fill },
  chipOn: { backgroundColor: colors.text },
  chipText: { fontSize: 14, fontWeight: '700', color: colors.text },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: '#FFFFFF' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '23%', alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  cellOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  cellText: { fontSize: 11, fontWeight: '600', color: colors.text },
  decoCell: { width: '31%', alignItems: 'center', gap: 22, paddingTop: 28, paddingBottom: 10, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
});
