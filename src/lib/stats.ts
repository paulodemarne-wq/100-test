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
  /** Day keys rescued by a joker (one per calendar month). */
  jokerDays: string[];
  /** Whether this month's joker is still available. */
  jokerAvailable: boolean;
};

/**
 * Consecutive days with a completed session, ending today (or yesterday if nothing yet today).
 * One missed day per calendar month is forgiven automatically (the "joker").
 */
export function streakInfo(sessions: SessionRow[], now = new Date()): StreakInfo {
  const days = new Set(done(sessions).map((s) => dayKey(new Date(s.started_at))));
  const monthOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
  const usedMonths = new Set<string>();
  const jokerDays: string[] = [];
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  for (;;) {
    if (days.has(dayKey(cursor))) {
      count++;
    } else {
      // A joker only bridges a gap: the day before must have a session, and the month's joker must be free.
      const before = new Date(cursor);
      before.setDate(before.getDate() - 1);
      if (usedMonths.has(monthOf(cursor)) || !days.has(dayKey(before))) break;
      usedMonths.add(monthOf(cursor));
      jokerDays.push(dayKey(cursor));
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return { days: count, jokerDays, jokerAvailable: !usedMonths.has(monthOf(now)) };
}

export function streak(sessions: SessionRow[], now = new Date()): number {
  return streakInfo(sessions, now).days;
}

export type Rank = { name: string; emoji: string; color: string; minHours: number; nextHours: number | null };

const RANKS: Omit<Rank, 'nextHours'>[] = [
  { name: 'Bronze', emoji: '🥉', color: '#C77B30', minHours: 0 },
  { name: 'Argent', emoji: '🥈', color: '#8E8E93', minHours: 10 },
  { name: 'Or', emoji: '🥇', color: '#F5B400', minHours: 50 },
  { name: 'Platine', emoji: '💠', color: '#30B0C7', minHours: 150 },
  { name: 'Diamant', emoji: '💎', color: '#5856D6', minHours: 300 },
];

export function rankOf(totalSeconds: number): Rank {
  const hours = totalSeconds / 3600;
  let i = 0;
  while (i + 1 < RANKS.length && hours >= RANKS[i + 1].minHours) i++;
  return { ...RANKS[i], nextHours: RANKS[i + 1]?.minHours ?? null };
}

export type Companion = { emoji: string; stage: string; mood: string; moodEmoji: string; nextStageHours: number | null };

const STAGES = [
  { hours: 0, emoji: '🥚', stage: 'Œuf' },
  { hours: 2, emoji: '🐣', stage: 'Poussin' },
  { hours: 10, emoji: '🐥', stage: 'Petit Locky' },
  { hours: 30, emoji: '🐤', stage: 'Locky' },
  { hours: 75, emoji: '🦉', stage: 'Sage Locky' },
  { hours: 150, emoji: '🦅', stage: 'Locky légendaire' },
];

/** Locky, the companion: grows with lifetime hours, mood follows recent sessions. */
export function companion(totalSeconds: number, sessions: SessionRow[], now = Date.now()): Companion {
  const hours = totalSeconds / 3600;
  let i = 0;
  while (i + 1 < STAGES.length && hours >= STAGES[i + 1].hours) i++;
  const finished = sessions.filter((s) => s.status !== 'active');
  const last = finished[0];
  const lastAt = last ? Date.parse(last.ended_at ?? last.started_at) : 0;
  let mood = 'Content de te voir';
  let moodEmoji = '😊';
  if (sessions[0]?.status === 'active') {
    mood = 'Concentré avec toi';
    moodEmoji = '🤓';
  } else if (last?.status === 'abandoned' && now - lastAt < 24 * 3_600_000) {
    mood = 'Triste, tu as craqué…';
    moodEmoji = '😢';
  } else if (!last || now - lastAt > 2 * 86_400_000) {
    mood = 'Il s’ennuie de toi';
    moodEmoji = '😴';
  } else if (last.status === 'done' && (last.duration_sec ?? 0) >= 2 * 3600) {
    mood = 'Fier de toi';
    moodEmoji = '🤩';
  }
  return { emoji: STAGES[i].emoji, stage: STAGES[i].stage, mood, moodEmoji, nextStageHours: STAGES[i + 1]?.hours ?? null };
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
      name: 'Premier lock in',
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
      description: 'Finir un lock in de groupe',
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
      description: '50 h de lock in',
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
