// Mode partiels: how many hours are left before each exam, spread over the days left.
// A session counts for an exam when its subject is the exam's name (see social.tsx).
import type { Exam } from './social';
import type { SessionRow } from './supabase';

export type Pace = 'done' | 'ok' | 'hard' | 'late';

export type ExamPlan = {
  exam: Exam;
  /** Seconds already done today for this exam. */
  doneToday: number;
  /** Seconds to do each day (today included) to reach the goal. */
  perDay: number;
  /** What is still to do today. */
  leftToday: number;
  /** What is still to do in total. */
  leftTotal: number;
  /** Days left to study: today until the day before the exam (just today if the exam is today). */
  studyDays: number;
  pace: Pace;
};

const HOUR = 3600;

export function planExam(exam: Exam, sessions: SessionRow[], now = new Date()): ExamPlan {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const since = Math.max(todayStart.getTime(), Date.parse(exam.created_at));
  const doneToday = sessions
    .filter((s) => s.status === 'done' && s.subject.toLowerCase() === exam.name.toLowerCase() && Date.parse(s.started_at) >= since)
    .reduce((sum, s) => sum + (s.duration_sec ?? 0), 0);
  const goal = exam.goal_minutes * 60;
  const studyDays = Math.max(1, exam.daysLeft);
  // Today's share is fixed at the start of the day, so working today doesn't lower it.
  const perDay = Math.max(0, goal - (exam.doneSeconds - doneToday)) / studyDays;
  const leftTotal = Math.max(0, goal - exam.doneSeconds);
  const leftToday = Math.min(leftTotal, Math.max(0, perDay - doneToday));
  const pace: Pace = leftTotal === 0 ? 'done' : perDay > 6 * HOUR ? 'late' : perDay > 3 * HOUR ? 'hard' : 'ok';
  return { exam, doneToday, perDay, leftToday, leftTotal, studyDays, pace };
}

export const PACE_TEXT: Record<Pace, string> = {
  done: 'Objectif atteint 🎉 Tu peux réviser encore pour assurer.',
  ok: 'Tranquille si tu suis le plan 👌',
  hard: 'Ça va demander du sérieux 😤',
  late: 'Gros retard : baisse l’objectif ou lock in à fond 🚨',
};

export type PlanDay = { date: Date; total: number; parts: { name: string; seconds: number }[] };

/** The next 7 days: how long to study each day, and for which exam. */
export function weekPlan(plans: ExamPlan[], now = new Date()): PlanDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + i);
    const parts = plans
      .filter((p) => i < p.studyDays && p.leftTotal > 0)
      .map((p) => ({ name: p.exam.name, seconds: i === 0 ? p.leftToday : p.perDay }))
      .filter((p) => p.seconds >= 60);
    return { date, total: parts.reduce((sum, p) => sum + p.seconds, 0), parts };
  });
}

/** "J-5", "demain", "aujourd'hui". */
export function countdown(daysLeft: number): string {
  return daysLeft === 0 ? "aujourd'hui" : daysLeft === 1 ? 'demain' : `J-${daysLeft}`;
}
