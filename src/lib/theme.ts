import { Platform, TextStyle, ViewStyle } from 'react-native';

// Light, Apple-like palette (iOS system colors).
export const colors = {
  bg: '#F2F2F7',
  card: '#FFFFFF',
  text: '#000000',
  secondary: '#8E8E93',
  tertiary: '#C7C7CC',
  separator: '#E5E5EA',
  fill: '#EFEFF4',
  accent: '#5856D6',
  accentSoft: '#EEEEFC',
  onAccent: '#FFFFFF',
  success: '#34C759',
  successSoft: '#E8F8EC',
  danger: '#FF3B30',
  dangerSoft: '#FFECEB',
  warning: '#FF9500',
  warningSoft: '#FFF4E5',
};

export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700', letterSpacing: 0.37, color: colors.text } as TextStyle,
  title: { fontSize: 22, fontWeight: '700', letterSpacing: 0.35, color: colors.text } as TextStyle,
  headline: { fontSize: 17, fontWeight: '600', letterSpacing: -0.41, color: colors.text } as TextStyle,
  body: { fontSize: 17, letterSpacing: -0.41, color: colors.text } as TextStyle,
  subhead: { fontSize: 15, letterSpacing: -0.24, color: colors.secondary } as TextStyle,
  footnote: { fontSize: 13, letterSpacing: -0.08, color: colors.secondary } as TextStyle,
  caption: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2, color: colors.secondary } as TextStyle,
};

export const card: ViewStyle = {
  backgroundColor: colors.card,
  borderRadius: 16,
  ...Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 2 } },
    default: { elevation: 1 },
  }),
};

/** Label saved when the user doesn't say what they're working on. */
export const DEFAULT_LABEL = 'Focus';
