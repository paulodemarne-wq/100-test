import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { DateField } from '../components/DateField';
import { Row, Section } from '../components/List';
import { Button, ErrorText } from '../components/ui';
import { useSocial } from '../lib/social';
import { card, colors, type } from '../lib/theme';

/** Next round half hour, at least 15 minutes from now. */
function defaultStart(): Date {
  const d = new Date(Date.now() + 15 * 60_000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d;
}

export default function NewEvent() {
  const { friends, createEvent } = useSocial();
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Keep the time when the day changes, and the day when the time changes.
  const setDay = (d: Date) => {
    const next = new Date(startsAt);
    next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    setStartsAt(next);
  };
  const setTime = (d: Date) => {
    const next = new Date(startsAt);
    next.setHours(d.getHours(), d.getMinutes(), 0, 0);
    setStartsAt(next);
  };

  const submit = async () => {
    setError('');
    if (selected.size === 0) return setError('Invite au moins un pote.');
    if (startsAt.getTime() < Date.now() - 60_000) return setError('Choisis une heure dans le futur.');
    setLoading(true);
    try {
      const id = await createEvent({ title: title.trim() || 'Lock in', startsAt, friendIds: [...selected] });
      router.replace({ pathname: '/event/[id]', params: { id } });
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={type.title}>Lock in de groupe</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close}>
          <Ionicons name="close" size={20} color={colors.secondary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={type.subhead}>
            Tout le monde lance sa session à la même heure. Le premier qui craque est affiché 💀
          </Text>

          <View style={[card, { marginTop: 16 }]}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Nom (ex : Révisions BU)"
              placeholderTextColor={colors.tertiary}
              maxLength={40}
              style={styles.titleInput}
            />
            <View style={styles.separator} />
            <DateField label="Jour" mode="date" value={startsAt} onChange={setDay} minimumDate={new Date()} />
            <View style={styles.separator} />
            <DateField label="Heure" mode="time" value={startsAt} onChange={setTime} />
          </View>

          <Section title={`Inviter (${selected.size})`}>
            {friends.map((f) => {
              const on = selected.has(f.profile.id);
              return (
                <Row
                  key={f.profile.id}
                  onPress={() => toggle(f.profile.id)}
                  left={<Avatar name={f.profile.display_name} photoUri={f.profile.avatar_url} />}
                  title={f.profile.display_name}
                  subtitle={`@${f.profile.username}`}
                  right={
                    <Ionicons
                      name={on ? 'checkmark-circle' : 'ellipse-outline'}
                      size={26}
                      color={on ? colors.accent : colors.tertiary}
                    />
                  }
                />
              );
            })}
          </Section>

          <View style={{ marginTop: 20, gap: 12 }}>
            <ErrorText>{error}</ErrorText>
            <Button title="Envoyer les invitations" onPress={submit} loading={loading} />
          </View>
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
  container: { padding: 20, paddingBottom: 40 },
  titleInput: { fontSize: 17, color: colors.text, paddingHorizontal: 16, paddingVertical: 15 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 16 },
});
