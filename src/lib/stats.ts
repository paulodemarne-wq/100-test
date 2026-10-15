import type { SessionRow } from './supabase';
import { dayKey, startOfWeek } from './time';

export const weekStart = startOfWeek;

const done = (sessions: SessionRow[]) => sessions.filter((s) => s.status === 'done');

export function weekSeconds(sessions: SessionRow[], now = new Date()): number {
  const from = startOfWeek(now);
  return done(sessions)
    .filter((s) => Date.parse(s.started_at) >= from)
    .reduce((sum, s) => sum + (s.duration_sec ?? 0), 0);
}

export type StreakInfo = {
  days: number;
  /** Day keys rescued by a joker (1 per calendar month, 2 with Vainc+). */
  jokerDays: string[];
  /** Whether a joker is still available this month. */
  jokerAvailable: boolean;
  jokersLeft: number;
};

/**
 * Consecutive days with a completed session, ending today (or yesterday if nothing yet today).
 * One missed day per calendar month is forgiven automatically (the "joker").
 */
/** `jokers`: days forgiven per month (1, or 2 with Vainc+). */
export function streakInfo(sessions: SessionRow[], now = new Date(), jokers = 1): StreakInfo {
  const days = new Set(done(sessions).map((s) => dayKey(new Date(s.started_at))));
  const monthOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
  const used = new Map<string, number>();
  const left = (d: Date) => jokers - (used.get(monthOf(d)) ?? 0);
  const jokerDays: string[] = [];
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  for (;;) {
    if (days.has(dayKey(cursor))) {
      count++;
    } else {
      // A joker only bridges a one-day gap: the day before must have a session, and a joker must be left this month.
      const before = new Date(cursor);
      before.setDate(before.getDate() - 1);
      if (left(cursor) <= 0 || !days.has(dayKey(before))) break;
      used.set(monthOf(cursor), (used.get(monthOf(cursor)) ?? 0) + 1);
      jokerDays.push(dayKey(cursor));
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return { days: count, jokerDays, jokerAvailable: left(now) > 0, jokersLeft: Math.max(0, left(now)) };
}

export function streak(sessions: SessionRow[], now = new Date(), jokers = 1): number {
  return streakInfo(sessions, now, jokers).days;
}

export type Badge = { id: string; emoji: string; name: string; description: string; unlocked: boolean };

export function badges(sessions: SessionRow[], weeklyGoalMinutes: number, now = new Date()): Badge[] {
  const completed = done(sessions);
  const total = completed.reduce((sum, s) => sum + (s.duration_sec ?? 0), 0);
  const startHour = (s: SessionRow) => new Date(s.started_at).getHours();
  const crossesMidnight = (s: SessionRow) =>
    !!s.ended_at && dayKey(new Date(s.ended_at)) !== dayKey(new Date(s.started_at));
  // The last 10 finished sessions, ignoring the one running now.
  const lastTen = sessions.filter((s) => s.status !== 'active').slice(0, 10);

  return [
    {
      id: 'first',
      emoji: '🔒',
      name: 'Premier vainc',
      description: 'Terminer une première session',
      unlocked: completed.length > 0,
    },
    {
      id: 'night',
      emoji: '🌙',
      name: 'Nuit blanche',
      description: 'Bosser après minuit',
      unlocked: completed.some((s) => startHour(s) < 5 || crossesMidnight(s)),
    },
    {
      id: 'early',
      emoji: '🌅',
      name: 'Lève-tôt',
      description: 'Commencer avant 7 h',
      unlocked: completed.some((s) => startHour(s) >= 5 && startHour(s) < 7),
    },
    {
      id: 'marathon',
      emoji: '🏃',
      name: 'Marathon',
      description: '3 h d’affilée sans lâcher',
      unlocked: completed.some((s) => (s.duration_sec ?? 0) >= 3 * 3600),
    },
    {
      id: 'streak7',
      emoji: '🔥',
      name: 'Semaine parfaite',
      description: '7 jours de série',
      unlocked: streak(sessions, now) >= 7,
    },
    {
      id: 'goal',
      emoji: '🎯',
      name: 'Objectif atteint',
      description: 'Atteindre ton objectif de la semaine',
      unlocked: weeklyGoalMinutes > 0 && weekSeconds(sessions, now) >= weeklyGoalMinutes * 60,
    },
    {
      id: 'team',
      emoji: '🤝',
      name: 'Esprit d’équipe',
      description: 'Finir un vainc de groupe',
      unlocked: completed.some((s) => s.event_id !== null),
    },
    {
      id: 'ice',
      emoji: '🧊',
      name: 'Sang-froid',
      description: '10 sessions de suite sans craquer',
      unlocked: lastTen.length === 10 && lastTen.every((s) => s.status === 'done'),
    },
    {
      id: 'fifty',
      emoji: '💯',
      name: 'Machine',
      description: '50 h de vainc',
      unlocked: total >= 50 * 3600,
    },
  ];
}

export type WeekRecap = {
  totalSeconds: number;
  sessions: number;
  abandons: number;
  longestSeconds: number;
  bestDay: { label: string; seconds: number } | null;
};

const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export function weekRecap(sessions: SessionRow[], now = new Date()): WeekRecap {
  const from = startOfWeek(now);
  const week = sessions.filter((s) => Date.parse(s.started_at) >= from && s.status !== 'active');
  const completed = done(week);
  const perDay = new Map<number, number>();
  for (const s of completed) {
    const day = new Date(s.started_at).getDay();
    perDay.set(day, (perDay.get(day) ?? 0) + (s.duration_sec ?? 0));
  }
  let bestDay: WeekRecap['bestDay'] = null;
  for (const [day, seconds] of perDay) {
    if (!bestDay || seconds > bestDay.seconds) bestDay = { label: DAY_NAMES[day], seconds };
  }
  return {
    totalSeconds: completed.reduce((sum, s) => sum + (s.duration_sec ?? 0), 0),
    sessions: completed.length,
    abandons: week.filter((s) => s.status === 'abandoned').length,
    longestSeconds: Math.max(0, ...completed.map((s) => s.duration_sec ?? 0)),
    bestDay,
  };
}
