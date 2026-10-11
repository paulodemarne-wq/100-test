import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TodoRow } from '../lib/supabase';
import { colors } from '../lib/theme';
import { daysLeft, dueLabel, formatHours, isFinished, progress } from '../lib/todos';

type Props = {
  todo: TodoRow;
  /** Focus time of the session running on it right now (not saved yet). */
  liveSeconds?: number;
  selected?: boolean;
  onPress?: () => void;
  right?: React.ReactNode;
};

/** A to-do: title, how far along (worked / planned hours) and how soon it's due. */
export function TodoItem({ todo, liveSeconds = 0, selected, onPress, right }: Props) {
  const finished = isFinished(todo);
  const p = progress(todo, liveSeconds);
  const days = daysLeft(todo);
  const urgent = !finished && days <= 2;
  const barColor = finished ? colors.success : urgent ? colors.danger : colors.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, selected && styles.selected, pressed && { opacity: 0.7 }]}
      accessibilityState={{ selected }}
    >
      {onPress && (
        <Ionicons
          name={selected ? 'radio-button-on' : 'radio-button-off'}
          size={22}
          color={selected ? colors.accent : colors.tertiary}
        />
      )}
      <View style={styles.main}>
        <View style={styles.top}>
          <Text style={[styles.title, finished && styles.done]} numberOfLines={1}>
            {todo.title}
          </Text>
          <Text style={[styles.due, { color: finished ? colors.success : urgent ? colors.danger : colors.secondary }]}>
            {finished ? 'Fait ✓' : dueLabel(todo)}
          </Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(p * 100)}%`, backgroundColor: barColor }]} />
        </View>
        <Text style={styles.hours}>
          {formatHours((todo.worked_seconds + liveSeconds) / 3600)} / {formatHours(todo.hours)}
        </Text>
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  main: { flex: 1, gap: 6, minWidth: 0 },
  top: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  done: { color: colors.secondary, textDecorationLine: 'line-through' },
  due: { fontSize: 13, fontWeight: '700' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  hours: { fontSize: 12, fontWeight: '600', color: colors.secondary, fontVariant: ['tabular-nums'] },
});
