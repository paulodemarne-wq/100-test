import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SessionTask } from '../lib/supabase';
import { card, colors } from '../lib/theme';

const MAX_TASKS = 20;

/** The session's to-do: add tasks before or during the session, tick them off as you go. */
export function TaskList({ tasks, onChange }: { tasks: SessionTask[]; onChange: (tasks: SessionTask[]) => void }) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const text = draft.trim();
    if (!text || tasks.length >= MAX_TASKS) return;
    onChange([...tasks, { text: text.slice(0, 80), done: false }]);
    setDraft('');
  };

  const toggle = (i: number) => {
    Haptics.selectionAsync();
    onChange(tasks.map((t, j) => (j === i ? { ...t, done: !t.done } : t)));
  };

  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <View style={styles.box}>
      <View style={styles.header}>
        <Text style={styles.title}>📝 To-do de la session</Text>
        {tasks.length > 0 && (
          <Text style={styles.count}>
            {doneCount}/{tasks.length}
          </Text>
        )}
      </View>
      {tasks.map((t, i) => (
        <View key={i} style={styles.row}>
          <Pressable onPress={() => toggle(i)} hitSlop={8} style={styles.left}>
            <Ionicons
              name={t.done ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color={t.done ? colors.success : colors.tertiary}
            />
            <Text style={[styles.text, t.done && styles.done]} numberOfLines={2}>
              {t.text}
            </Text>
          </Pressable>
          <Pressable onPress={() => onChange(tasks.filter((_, j) => j !== i))} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.tertiary} />
          </Pressable>
        </View>
      ))}
      {tasks.length < MAX_TASKS && (
        <View style={styles.row}>
          <Ionicons name="add" size={24} color={colors.accent} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={tasks.length ? 'Autre tâche…' : 'Ajouter une tâche (ex : chapitre 3)'}
            placeholderTextColor={colors.tertiary}
            style={styles.input}
            returnKeyType="done"
            blurOnSubmit={false}
            onSubmitEditing={add}
            maxLength={80}
          />
          {draft.trim().length > 0 && (
            <Pressable onPress={add} hitSlop={8} style={styles.addButton} accessibilityLabel="Ajouter la tâche">
              <Text style={styles.addText}>Ajouter</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { ...card, alignSelf: 'stretch', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  count: { fontSize: 14, fontWeight: '700', color: colors.success, fontVariant: ['tabular-nums'] },
  addButton: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  addText: { color: colors.onAccent, fontWeight: '700', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { flex: 1, fontSize: 16, color: colors.text },
  done: { color: colors.secondary, textDecorationLine: 'line-through' },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 10 },
});
