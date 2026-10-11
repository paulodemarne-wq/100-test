import { Fragment, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { card, colors, type } from '../lib/theme';

/** iOS-style grouped list section. Renders nothing when it has no rows. */
export function Section({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const rows = (Array.isArray(children) ? children.flat(Infinity) : [children]).filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <View style={{ marginTop: 20 }}>
      {title && <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>}
      <View style={styles.group}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <View style={styles.separator} />}
            {row as ReactNode}
          </Fragment>
        ))}
      </View>
      {footer && <Text style={styles.footer}>{footer}</Text>}
    </View>
  );
}

type RowProps = {
  left?: ReactNode;
  title: string;
  subtitle?: string;
  subtitleColor?: string;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
};

export function Row({ left, title, subtitle, subtitleColor, right, onPress, onLongPress }: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}
    >
      {left}
      <View style={{ flex: 1 }}>
        <Text style={type.headline} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.subhead, subtitleColor ? { color: subtitleColor } : null]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Pill({
  title,
  onPress,
  tone = 'soft',
  disabled,
}: {
  title: string;
  onPress: () => void;
  tone?: 'soft' | 'solid' | 'muted';
  disabled?: boolean;
}) {
  const bg = tone === 'solid' ? colors.accent : tone === 'muted' ? colors.fill : colors.accentSoft;
  const fg = tone === 'solid' ? colors.onAccent : tone === 'muted' ? colors.secondary : colors.accent;
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...type.footnote, marginLeft: 16, marginBottom: 8 },
  group: { ...card, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 72 },
  footer: { ...type.footnote, marginHorizontal: 16, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 11, minHeight: 56 },
  pill: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontWeight: '600', fontSize: 14 },
});
