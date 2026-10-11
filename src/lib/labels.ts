import { DEFAULT_LABEL } from './theme';
import { formatDuration, timeAgo } from './time';
import type { PersonStatus } from './social';

export function labelOr(label: string, fallback: string): string {
  return label === DEFAULT_LABEL ? fallback : label;
}

export function labelSuffix(label: string): string {
  return label === DEFAULT_LABEL ? '' : ` · ${label}`;
}

export function describeStatus(s: PersonStatus, now: number): string {
  switch (s.kind) {
    case 'working':
      return labelOr(s.label, 'En lock in');
    case 'abandoned':
      return `A craqué après ${formatDuration(s.durationSec)}${labelSuffix(s.label)} 💀`;
    case 'done':
      return `${formatDuration(s.durationSec)} de lock in${labelSuffix(s.label)} · ${timeAgo(s.at, now)}`;
    case 'idle':
      return 'Pas encore lock in';
  }
}

/** "ce soir 20 h 00", "demain 9 h 30", "lun. 14 h 00" */
export function formatEventTime(timestamp: number, now = Date.now()): string {
  const d = new Date(timestamp);
  const time = `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day(d) - day(new Date(now))) / 86_400_000);
  if (diffDays === 0) return d.getHours() >= 18 ? `ce soir ${time}` : `aujourd'hui ${time}`;
  if (diffDays === 1) return `demain ${time}`;
  return `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}

/** "dans 2 h 05", "dans 3 min", "en cours" */
export function countdown(target: number, now: number): string {
  const sec = Math.round((target - now) / 1000);
  if (sec <= 0) return 'en cours';
  if (sec < 3600) return `dans ${Math.max(1, Math.ceil(sec / 60))} min`;
  return `dans ${formatDuration(sec)}`;
}
