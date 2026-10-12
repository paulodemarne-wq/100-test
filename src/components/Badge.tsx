import { ReactNode } from 'react';
import { Text } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { BADGE_COLORS, badgeOf } from '../lib/premium';
import type { ProfileRow } from '../lib/supabase';

/** A Lockin+ badge: a small round pill with a solid glyph, like the ones next to names on Snap. */
export function Badge({ d, color = 'noir', size = 16 }: { d: string; color?: string; size?: number }) {
  const c = BADGE_COLORS[color] ?? BADGE_COLORS.noir;
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Circle cx={14} cy={14} r={13.4} fill={c.outer} />
      <Circle cx={14} cy={14} r={12.6} fill={c.ring} />
      <Circle cx={14} cy={14} r={10.9} fill={c.disc} />
      <G transform="translate(6.8 6.8) scale(0.6)">
        <Path d={d} fill={c.glyph} fillRule="evenodd" />
      </G>
    </Svg>
  );
}

type Person = Pick<ProfileRow, 'display_name' | 'featured' | 'premium_until' | 'badge' | 'badge_color' | 'decoration'>;

/** A name followed by its Lockin+ badge, to put inside a <Text>. */
export function Named({ person, name, suffix = '', size = 15 }: { person: Person | null | undefined; name?: ReactNode; suffix?: string; size?: number }) {
  const badge = badgeOf(person);
  return (
    <>
      {name ?? person?.display_name ?? '?'}
      {badge && (
        <Text>
          {' '}
          <Badge d={badge.d} color={badge.color} size={size} />
        </Text>
      )}
      {suffix}
    </>
  );
}
