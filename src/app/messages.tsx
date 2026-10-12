import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Named } from '../components/Badge';
import { useChat } from '../lib/chat';
import { decorationOf } from '../lib/premium';
import { useSocial } from '../lib/social';
import { useAuth } from '../lib/auth';
import { card, colors, type } from '../lib/theme';
import { timeAgo } from '../lib/time';

/** My conversations, then friends I haven't talked to yet. */
export default function Messages() {
  const { userId } = useAuth();
  const { friends } = useSocial();
  const { conversations } = useChat();
  const byId = new Map(friends.map((f) => [f.profile.id, f]));
  const talked = new Set(conversations.map((c) => c.friendId));
  const others = friends.filter((f) => !talked.has(f.profile.id));
  const open = (id: string) => router.push({ pathname: '/chat/[id]', params: { id } });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} accessibilityLabel="Retour">
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
        </Pressable>
        <Text style={type.largeTitle}>Messages</Text>
      </View>
      <ScrollView contentContainerStyle={styles.container}>
        {friends.length === 0 && <Text style={type.subhead}>Ajoute des amis pour leur écrire.</Text>}
        {conversations.length > 0 && (
          <View style={card}>
            {conversations.map((c, i) => {
              const f = byId.get(c.friendId);
              if (!f) return null;
              const mine = c.last.sender === userId;
              return (
                <Pressable key={c.friendId} onPress={() => open(c.friendId)} style={({ pressed }) => [styles.row, i > 0 && styles.border, pressed && { opacity: 0.7 }]}>
                  <Avatar name={f.profile.display_name} photoUri={f.profile.avatar_url} decoration={decorationOf(f.profile)} size={52} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.headline, c.unread > 0 && { fontWeight: '800' }]} numberOfLines={1}>
                      <Named person={f.profile} />
                    </Text>
                    <Text style={[styles.preview, c.unread > 0 && styles.previewUnread]} numberOfLines={1}>
                      {mine ? (c.last.read_at ? 'Vu · ' : 'Envoyé · ') : ''}
                      {c.last.body}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={type.footnote}>{timeAgo(Date.parse(c.last.created_at)).replace('il y a ', '')}</Text>
                    {c.unread > 0 && (
                      <View style={styles.unread}>
                        <Text style={styles.unreadText}>{c.unread}</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
        {others.length > 0 && <Text style={styles.sectionTitle}>ÉCRIRE À UN POTE</Text>}
        {others.length > 0 && (
          <View style={card}>
            {others.map((f, i) => (
              <Pressable key={f.profile.id} onPress={() => open(f.profile.id)} style={({ pressed }) => [styles.row, i > 0 && styles.border, pressed && { opacity: 0.7 }]}>
                <Avatar name={f.profile.display_name} photoUri={f.profile.avatar_url} decoration={decorationOf(f.profile)} size={44} />
                <Text style={[type.headline, { flex: 1 }]} numberOfLines={1}>
                  <Named person={f.profile} />
                </Text>
                <Ionicons name="chatbubble-outline" size={20} color={colors.accent} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingTop: 8 },
  back: { padding: 4 },
  container: { padding: 20, gap: 12 },
  sectionTitle: { ...type.footnote, fontWeight: '700', marginTop: 8, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 14 },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  preview: { fontSize: 15, color: colors.secondary },
  previewUnread: { color: colors.text, fontWeight: '700' },
  unread: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  unreadText: { color: colors.onAccent, fontSize: 13, fontWeight: '800' },
});
