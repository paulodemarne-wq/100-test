import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorText, Field } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useSocial } from '../lib/social';
import { card, colors, type } from '../lib/theme';

export default function AddFriend() {
  const { profile } = useAuth();
  const { sendFriendRequest } = useSocial();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submit = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      setSuccess(await sendFriendRequest(username));
      setUsername('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const invite = () => {
    if (!profile) return;
    Share.share({
      message: `On révise ensemble sur Vainc ? 🔒 Ajoute-moi : @${profile.username}`,
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={type.title}>Ajouter un ami</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close}>
          <Ionicons name="close" size={20} color={colors.secondary} />
        </Pressable>
      </View>

      <View style={styles.container}>
        <View style={[card, styles.block]}>
          <Field
            label="Pseudo de ton ami"
            value={username}
            onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_.@]/g, ''))}
            placeholder="@pseudo"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={submit}
          />
          <ErrorText>{error}</ErrorText>
          {success ? <Text style={styles.success}>{success}</Text> : null}
          <Button title="Envoyer la demande" onPress={submit} loading={loading} disabled={!username.replace('@', '')} />
        </View>

        <View style={[card, styles.block]}>
          <Text style={type.headline}>Ton pseudo</Text>
          <Text style={styles.myUsername}>@{profile?.username}</Text>
          <Text style={type.subhead}>Envoie-le à tes amis pour qu'ils t'ajoutent.</Text>
          <Button
            title="Inviter des amis"
            variant="secondary"
            onPress={invite}
            icon={<Ionicons name="share-outline" size={18} color={colors.accent} />}
            style={{ backgroundColor: colors.accentSoft }}
          />
        </View>
      </View>
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
  container: { padding: 20, gap: 16 },
  block: { padding: 16, gap: 12 },
  success: { color: colors.success, fontSize: 15, textAlign: 'center' },
  myUsername: { fontSize: 28, fontWeight: '700', color: colors.accent },
});
