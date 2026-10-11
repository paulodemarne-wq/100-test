import type { SessionRow } from './supabase';
import { dayKey, startOfWeek } from './time';

export function weekSeconds(sessions: SessionRow[], now = new Date()): number {
  const from = startOfWeek(now);
  return sessions
    .filter((s) => s.status === 'done' && Date.parse(s.started_at) >= from)
    .reduce((sum, s) => sum + (s.duration_sec ?? 0), 0);
}

/** Consecutive days (ending today, or yesterday if nothing yet today) with a completed session. */
export function streak(sessions: SessionRow[], now = new Date()): number {
  const days = new Set(sessions.filter((s) => s.status === 'done').map((s) => dayKey(new Date(s.started_at))));
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}
