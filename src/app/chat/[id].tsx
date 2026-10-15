import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { Named } from '../../components/Badge';
import { useAuth } from '../../lib/auth';
import { useChat } from '../../lib/chat';
import { decorationOf, titleOf } from '../../lib/premium';
import { useSocial } from '../../lib/social';
import { colors, type } from '../../lib/theme';

const hour = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** A conversation with one friend. */
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const { friends } = useSocial();
  const { thread, send, markRead } = useChat();
  const friend = friends.find((f) => f.profile.id === id);
  const messages = thread(id ?? '');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  // Everything shown here is read (also what arrives while the screen is open).
  const unread = messages.filter((m) => m.sender === id && !m.read_at).length;
  useEffect(() => {
    if (id && unread) markRead(id);
  }, [id, unread, markRead]);

  if (!friend) {
    return (
      <SafeAreaView style={[styles.safe, { alignItems: 'center', justifyContent: 'center', gap: 12 }]}>
        <Text style={type.subhead}>Vous n'êtes pas (ou plus) amis.</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>Retour</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const submit = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await send(friend.profile.id, text);
      setText('');
      Haptics.selectionAsync();
    } catch (e) {
      Alert.alert('Oups', (e as Error).message);
    } finally {
      setSending(false);
    }
  };
  const lastMine = [...messages].reverse().find((m) => m.sender === userId);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Retour">
          <Ionicons name="chevron-back" size={26} color={colors.accent} />
        </Pressable>
        <Avatar name={friend.profile.display_name} photoUri={friend.profile.avatar_url} decoration={decorationOf(friend.profile)} size={36} live={friend.status.kind === 'working'} />
        <View style={{ flex: 1 }}>
          <Text style={type.headline} numberOfLines={1}>
            <Named person={friend.profile} />
          </Text>
          <Text style={type.footnote}>{friend.status.kind === 'working' ? 'En lock in 🔒' : (titleOf(friend.profile) ?? `@${friend.profile.username}`)}</Text>
        </View>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <FlatList
          data={[...messages].reverse()}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={[type.footnote, styles.empty]}>Dis-lui de lock in avec toi 🔒</Text>}
          renderItem={({ item: m }) => {
            const mine = m.sender === userId;
            return (
              <View style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  <Text style={[styles.body, mine && { color: colors.onAccent }]}>{m.body}</Text>
                  <Text style={[styles.time, mine && { color: 'rgba(255,255,255,0.75)' }]}>
                    {hour(m.created_at)}
                    {mine && m.id === lastMine?.id ? (m.read_at ? ' · Vu' : ' · Envoyé') : ''}
                  </Text>
                </View>
              </View>
            );
          }}
        />
        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={colors.tertiary}
            multiline
            maxLength={1000}
            style={styles.input}
          />
          <Pressable onPress={submit} disabled={!text.trim() || sending} style={[styles.send, (!text.trim() || sending) && { opacity: 0.4 }]} accessibilityLabel="Envoyer">
            <Ionicons name="arrow-up" size={20} color={colors.onAccent} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  list: { padding: 12, gap: 6, flexGrow: 1 },
  empty: { textAlign: 'center', marginTop: 40, transform: [{ scaleY: -1 }] },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8, gap: 2 },
  mine: { backgroundColor: colors.accent, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.card, borderBottomLeftRadius: 6 },
  body: { fontSize: 16, color: colors.text, lineHeight: 21 },
  time: { fontSize: 11, color: colors.secondary, alignSelf: 'flex-end' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator, backgroundColor: colors.bg },
  input: { flex: 1, maxHeight: 120, fontSize: 16, color: colors.text, backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
