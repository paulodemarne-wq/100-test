import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateField } from '../../components/DateField';
import { TodoItem } from '../../components/TodoItem';
import { Button, ErrorText } from '../../components/ui';
import { useSocial } from '../../lib/social';
import { todoSplitAt, useVainc, useNow } from '../../lib/store';
import { card, colors, DEFAULT_LABEL, type } from '../../lib/theme';
import { formatDay, formatHours, isFinished, reminderAt, sortTodos } from '../../lib/todos';

const inAWeek = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
};
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** My to-dos: hours of work to do before a date. A vainc fills the one you tap. */
export default function Todos() {
  const params = useLocalSearchParams<{ new?: string }>();
  const { todos, createTodo, setTodoDone, deleteTodo } = useSocial();
  const { active, switchTodo } = useVainc();
  const now = useNow();
  const split = active ? todoSplitAt(active, now) : {};
  const [adding, setAdding] = useState(!!params.new || todos.length === 0);
  // "Nouvelle to-do" from Focus opens the form.
  useEffect(() => {
    if (params.new) {
      setAdding(true);
      router.setParams({ new: undefined });
    }
  }, [params.new]);
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState(5);
  const [due, setDue] = useState(inAWeek);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const sorted = useMemo(() => sortTodos(todos), [todos]);
  const open = sorted.filter((t) => !isFinished(t));
  const finished = sorted.filter(isFinished);

  // Preview of the reminder for the to-do being written.
  const preview = reminderAt({
    id: '',
    user_id: '',
    title,
    hours,
    due_date: ymd(due),
    worked_seconds: 0,
    done_at: null,
    created_at: new Date().toISOString(),
  });

  const save = async () => {
    setError('');
    if (!title.trim()) return setError('Donne un nom à ta to-do (ex : Chapitre 3).');
    setSaving(true);
    try {
      await createTodo({ title, hours, dueDate: ymd(due) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTitle('');
      setHours(5);
      setDue(inAWeek());
      setAdding(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // During a vainc, tapping a to-do sends the running time to it.
  const pick = (id: string, name: string) => {
    if (!active) return undefined;
    return () => {
      Haptics.selectionAsync();
      const current = todos.find((t) => t.id === active.todoId);
      const keepLabel = active.subject !== DEFAULT_LABEL && active.subject !== current?.title.slice(0, 30);
      const next = active.todoId === id ? null : id;
      switchTodo(next, keepLabel ? undefined : next ? name.slice(0, 30) : DEFAULT_LABEL);
    };
  };

  const actions = (id: string, name: string, done: boolean) =>
    Alert.alert(name, undefined, [
      { text: done ? 'Remettre à faire' : 'Marquer comme faite ✓', onPress: () => setTodoDone(id, !done).catch(() => {}) },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          Alert.alert(`Supprimer « ${name} » ?`, undefined, [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Supprimer', style: 'destructive', onPress: () => deleteTodo(id).catch(() => {}) },
          ]),
      },
      { text: 'Annuler', style: 'cancel' },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={type.largeTitle}>To-do</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {adding ? (
            <View style={[card, styles.form]}>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Quoi ? (ex : Réviser le chapitre 3)"
                placeholderTextColor={colors.tertiary}
                maxLength={60}
                style={styles.titleInput}
                autoFocus={todos.length > 0}
              />
              <View style={styles.separator} />
              <View style={styles.hoursRow}>
                <Text style={type.body}>Temps de travail</Text>
                <View style={styles.stepper}>
                  <Pressable onPress={() => setHours((h) => Math.max(0.5, h - (h > 10 ? 5 : 0.5)))} style={styles.stepButton} accessibilityLabel="Moins d'heures">
                    <Ionicons name="remove" size={18} color={colors.accent} />
                  </Pressable>
                  <Text style={styles.hoursValue}>{formatHours(hours)}</Text>
                  <Pressable onPress={() => setHours((h) => Math.min(1000, h + (h >= 10 ? 5 : 0.5)))} style={styles.stepButton} accessibilityLabel="Plus d'heures">
                    <Ionicons name="add" size={18} color={colors.accent} />
                  </Pressable>
                </View>
              </View>
              <View style={styles.separator} />
              <DateField label="Pour le" mode="date" value={due} onChange={setDue} minimumDate={new Date()} />
              <Text style={styles.reminder}>
                {preview.getTime() > Date.now()
                  ? `🔔 Rappel le ${formatDay(preview)} si elle n'est pas finie.`
                  : '🔔 C’est très bientôt : pas de rappel, lance-toi !'}
              </Text>
              <ErrorText>{error}</ErrorText>
              <View style={styles.formButtons}>
                {todos.length > 0 && <Button title="Annuler" variant="secondary" onPress={() => setAdding(false)} style={{ flex: 1 }} />}
                <Button title="Créer la to-do" onPress={save} loading={saving} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <Button title="Nouvelle to-do" icon={<Ionicons name="add" size={20} color={colors.onAccent} />} onPress={() => setAdding(true)} />
          )}

          {active && open.length > 0 && (
            <Text style={styles.live}>⏱ Chrono en cours : touche une to-do pour que ton temps aille dessus.</Text>
          )}
          {open.length > 0 && <Text style={styles.sectionTitle}>À FAIRE · LA PLUS PROCHE EN PREMIER</Text>}
          {open.length > 0 && (
            <View style={[card, styles.list]}>
              {open.map((t) => (
                <TodoItem
                  key={t.id}
                  todo={t}
                  liveSeconds={split[t.id] ?? 0}
                  selected={!!active && active.todoId === t.id}
                  onPress={pick(t.id, t.title)}
                  right={
                    <Pressable onPress={() => actions(t.id, t.title, false)} hitSlop={10} accessibilityLabel="Options">
                      <Ionicons name="ellipsis-horizontal" size={20} color={colors.secondary} />
                    </Pressable>
                  }
                />
              ))}
            </View>
          )}
          {open.length > 0 && (
            <Text style={type.footnote}>
              Pendant un vainc, touche la to-do sur laquelle tu bosses : le chrono remplit sa barre. Tu peux changer quand tu
              veux (ex : maths puis français). Rappel automatique si elle n'est pas finie (20 % du temps avant la date, 2 jours
              minimum).
            </Text>
          )}

          {finished.length > 0 && <Text style={styles.sectionTitle}>FAITES</Text>}
          {finished.length > 0 && (
            <View style={[card, styles.list]}>
              {finished.map((t) => (
                <TodoItem
                  key={t.id}
                  todo={t}
                  liveSeconds={split[t.id] ?? 0}
                  right={
                    <Pressable onPress={() => actions(t.id, t.title, true)} hitSlop={10} accessibilityLabel="Options">
                      <Ionicons name="ellipsis-horizontal" size={20} color={colors.secondary} />
                    </Pressable>
                  }
                />
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, marginTop: 8 },
  live: { ...type.footnote, color: colors.accent, fontWeight: '600', marginLeft: 4 },
  container: { padding: 20, paddingBottom: 40, gap: 12 },
  form: { paddingBottom: 14, gap: 4 },
  titleInput: { fontSize: 17, color: colors.text, paddingHorizontal: 16, paddingVertical: 14 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 16 },
  hoursRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  hoursValue: { minWidth: 64, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  reminder: { ...type.footnote, paddingHorizontal: 16, paddingTop: 6 },
  formButtons: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 6 },
  sectionTitle: { ...type.footnote, fontWeight: '700', marginTop: 8, marginLeft: 4 },
  list: { padding: 4 },
});
