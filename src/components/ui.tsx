import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors } from '../lib/theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'destructive';
  icon?: ReactNode;
  style?: ViewStyle;
};

export function Button({ title, onPress, disabled, loading, variant = 'primary', icon, style }: ButtonProps) {
  const inactive = disabled || loading;
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: inactive ? colors.tertiary : colors.accent } : { backgroundColor: colors.card },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.onAccent : colors.accent} />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.buttonText,
              { color: primary ? colors.onAccent : variant === 'destructive' ? colors.danger : colors.accent },
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 6, alignSelf: 'stretch' }}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput placeholderTextColor={colors.tertiary} {...props} style={[styles.input, props.style]} />
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  buttonText: { fontSize: 17, fontWeight: '600' },
  label: { fontSize: 13, color: colors.secondary, marginLeft: 4 },
  input: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 17,
    color: colors.text,
  },
  error: { color: colors.danger, fontSize: 15, textAlign: 'center' },
});
