import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, type } from '../lib/theme';

type Props = {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  mode: 'date' | 'time';
  minimumDate?: Date;
};

/** A labelled date or time row: native compact picker on iOS, dialog on Android. */
export function DateField({ label, value, onChange, mode, minimumDate }: Props) {
  const text =
    mode === 'date'
      ? value.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' })
      : `${value.getHours()} h ${String(value.getMinutes()).padStart(2, '0')}`;

  return (
    <View style={styles.row}>
      <Text style={type.body}>{label}</Text>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={value}
          mode={mode}
          display="compact"
          locale="fr-FR"
          minuteInterval={5}
          minimumDate={minimumDate}
          accentColor={colors.accent}
          onValueChange={(_, date) => onChange(date)}
        />
      ) : (
        <Pressable
          style={styles.androidButton}
          onPress={() =>
            DateTimePickerAndroid.open({
              value,
              mode,
              is24Hour: true,
              minimumDate,
              onValueChange: (_, date) => onChange(date),
            })
          }
        >
          <Text style={styles.androidText}>{text}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 52,
  },
  androidButton: { backgroundColor: colors.fill, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  androidText: { fontSize: 17, color: colors.text },
});
