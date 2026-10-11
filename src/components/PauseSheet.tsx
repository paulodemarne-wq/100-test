import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, type } from '../lib/theme';
import { Button } from './ui';

const PRESETS = [5, 10, 15, 20, 30];

/** Bottom sheet to pick a break length in minutes. */
export function PauseSheet({
  visible,
  onClose,
  onStart,
}: {
  visible: boolean;
  onClose: () => void;
  onStart: (minutes: number) => void;
}) {
  const [minutes, setMinutes] = useState(5);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={[type.title, { textAlign: 'center' }]}>Faire une pause ☕</Text>
        <Text style={[type.subhead, { textAlign: 'center' }]}>
          Le chrono s'arrête et tu peux quitter l'app. On te prévient 1 min avant la fin.
        </Text>

        <View style={styles.presets}>
          {PRESETS.map((m) => (
            <Pressable key={m} onPress={() => setMinutes(m)} style={[styles.preset, minutes === m && styles.presetOn]}>
              <Text style={[styles.presetText, minutes === m && styles.presetTextOn]}>{m}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.stepper}>
          <Pressable onPress={() => setMinutes((m) => Math.max(1, m - 1))} hitSlop={8} style={styles.stepButton}>
            <Ionicons name="remove" size={22} color={colors.accent} />
          </Pressable>
          <Text style={styles.value}>{minutes} min</Text>
          <Pressable onPress={() => setMinutes((m) => Math.min(60, m + 1))} hitSlop={8} style={styles.stepButton}>
            <Ionicons name="add" size={22} color={colors.accent} />
          </Pressable>
        </View>

        <Button title={`Pause de ${minutes} min`} onPress={() => onStart(minutes)} />
        <Button title="Annuler" variant="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    gap: 14,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.tertiary },
  presets: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 4 },
  preset: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetOn: { backgroundColor: colors.accent },
  presetText: { fontSize: 17, fontWeight: '600', color: colors.text },
  presetTextOn: { color: colors.onAccent },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontSize: 28, fontWeight: '700', minWidth: 110, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
