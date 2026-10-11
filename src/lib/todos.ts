import type { TodoRow } from './supabase';

const DAY = 86_400_000;

/** The due date as a moment: 9 am on that day (local time). */
export function dueAt(todo: TodoRow): Date {
  const [y, m, d] = todo.due_date.split('-').map(Number);
  return new Date(y, m - 1, d, 9, 0, 0);
}

/** A to-do is finished when ticked off, or when all its hours are worked. */
export function isFinished(todo: TodoRow): boolean {
  return !!todo.done_at || todo.worked_seconds >= todo.hours * 3600;
}

export function progress(todo: TodoRow, extraSeconds = 0): number {
  return Math.min(1, (todo.worked_seconds + extraSeconds) / (todo.hours * 3600));
}

/**
 * When to remind about an unfinished to-do: 20 % of the time it was given, before the date,
 * and never less than 2 days before (10 days → 2 days before, 10 months → 2 months before).
 */
export function reminderAt(todo: TodoRow): Date {
  const due = dueAt(todo).getTime();
  const span = due - new Date(todo.created_at).getTime();
  const before = Math.max(2 * DAY, 0.2 * span);
  return new Date(due - before);
}

/** Whole calendar days from today to the due date (negative when late). */
export function daysLeft(todo: TodoRow, now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [y, m, d] = todo.due_date.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - today) / DAY);
}

export function dueLabel(todo: TodoRow, now = new Date()): string {
  const n = daysLeft(todo, now);
  if (n < 0) return n === -1 ? 'En retard d’1 jour' : `En retard de ${-n} jours`;
  if (n === 0) return 'Aujourd’hui';
  if (n === 1) return 'Demain';
  if (n < 60) return `Dans ${n} jours`;
  return `Dans ${Math.round(n / 30)} mois`;
}

export function formatDay(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

/** Unfinished first, by nearest date; finished ones after. */
export function sortTodos(todos: TodoRow[]): TodoRow[] {
  return [...todos].sort((a, b) => {
    const fa = isFinished(a);
    const fb = isFinished(b);
    if (fa !== fb) return fa ? 1 : -1;
    return a.due_date.localeCompare(b.due_date);
  });
}

/** Hours as people say them: 1,5 h. */
export function formatHours(h: number): string {
  return `${String(Math.round(h * 10) / 10).replace('.', ',')} h`;
}
