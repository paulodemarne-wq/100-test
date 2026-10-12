import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';

type Props = { value: number; onChange: (v: number) => void; min: number; max: number; unit: string };

/** − value + buttons, one step at a time. */
export function Stepper({ value, onChange, min, max, unit }: Props) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} hitSlop={6} style={styles.stepButton} accessibilityLabel="Moins">
        <Ionicons name="remove" size={18} color={colors.accent} />
      </Pressable>
      <Text style={styles.stepValue}>
        {value} {unit}
      </Text>
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} hitSlop={6} style={styles.stepButton} accessibilityLabel="Plus">
        <Ionicons name="add" size={18} color={colors.accent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { fontSize: 17, fontWeight: '600', minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'], color: colors.text },
});
