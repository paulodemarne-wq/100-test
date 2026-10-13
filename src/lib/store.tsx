import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './auth';
import { cancelPauseNotifications, schedulePauseNotifications } from './notifications';
import { useSocial } from './social';
import { SessionTask, supabase } from './supabase';
import { formatDuration } from './time';

/** Leaving the app for longer than this ends the session as abandoned. */
export const MAX_AWAY_MS = 10_000;
/** After a break ends, time allowed to come back to the app. */
export const PAUSE_GRACE_MS = 60_000;
/** Completed sessions shorter than this are not counted. */
export const MIN_SESSION_SEC = 60;
/** How often a running session tells friends it is still alive. */
const HEARTBEAT_MS = 60_000;

export type ActiveSession = {
  /** Row id in study_sessions, once created. */
  remoteId: string | null;
  subject: string;
  /** Group lock-in this session belongs to. */
  eventId?: string | null;
  startedAt: number;
  /** Short trips outside the app that were tolerated. */
  leaves: number;
  /** Set while the app is in the background. */
  leftAt: number | null;
  /** Total length of finished breaks, in seconds. */
  pausedSeconds: number;
  /** The break in progress, if any. */
  pause: { startedAt: number; until: number } | null;
  tasks: SessionTask[];
  /** The to-do being worked on right now (can change during the lock-in). */
  todoId?: string | null;
  /** Focus seconds at which the current to-do was picked. */
  todoSince?: number;
  /** Focus seconds already spent on earlier to-dos of this lock-in. */
  todoSplit?: Record<string, number>;
};

/** Seconds actually spent locked in (breaks excluded). */
export function focusSeconds(a: ActiveSession, at = Date.now()): number {
  const currentPause = a.pause ? Math.max(0, at - a.pause.startedAt) / 1000 : 0;
  return Math.max(0, (at - a.startedAt) / 1000 - a.pausedSeconds - currentPause);
}

/** Focus seconds per to-do, the current one included. */
export function todoSplitAt(a: ActiveSession, at = Date.now()): Record<string, number> {
  const split = { ...a.todoSplit };
  if (a.todoId) split[a.todoId] = (split[a.todoId] ?? 0) + Math.max(0, focusSeconds(a, at) - (a.todoSince ?? 0));
  return split;
}

function roundSplit(split: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(split).map(([id, sec]) => [id, Math.round(sec)]).filter(([, sec]) => (sec as number) > 0));
}

export type Notice = { kind: 'abandoned' | 'warning' | 'done' | 'tooShort' | 'error' | 'pause'; message: string };

type Store = {
  loaded: boolean;
  active: ActiveSession | null;
  notice: Notice | null;
  clearNotice: () => void;
  startSession: (subject: string, eventId?: string | null, tasks?: SessionTask[], todoId?: string | null) => void;
  stopSession: () => void;
  startPause: (minutes: number) => void;
  endPause: () => void;
  setTasks: (tasks: SessionTask[]) => void;
  /** Work on another to-do (or none) from now on; time so far stays with the previous one. */
  switchTodo: (todoId: string | null, subject?: string) => void;
};

const StoreContext = createContext<Store | null>(null);

type Ending = { status: 'done' | 'abandoned'; endedAt: number } | { status: 'discard' };

/** Closes a break that is still open at `at`. */
function withPauseClosed(a: ActiveSession, at: number): ActiveSession {
  if (!a.pause) return a;
  return { ...a, pausedSeconds: a.pausedSeconds + Math.max(0, at - a.pause.startedAt) / 1000, pause: null };
}

/** Saves the end of a session on the server. */
async function finishRemote(active: ActiveSession, ending: Ending) {
  if (!active.remoteId) return;
  if (ending.status === 'discard') {
    await supabase.from('study_sessions').delete().eq('id', active.remoteId);
    return;
  }
  const closed = withPauseClosed(active, ending.endedAt);
  const fields = {
    status: ending.status,
    ended_at: new Date(ending.endedAt).toISOString(),
    last_seen_at: new Date(ending.endedAt).toISOString(),
    duration_sec: Math.min(43_200, Math.round(focusSeconds(closed, ending.endedAt))),
    paused_seconds: Math.min(43_200, Math.round(closed.pausedSeconds)),
    paused_until: null,
    leaves: active.leaves,
    tasks: active.tasks,
  };
  const { error } = await supabase
    .from('study_sessions')
    .update({ ...fields, todo_split: roundSplit(todoSplitAt(closed, ending.endedAt)) })
    .eq('id', active.remoteId);
  if (!error) return;
  // The to-do part must never cost the session itself (e.g. a database not updated yet).
  const retry = await supabase.from('study_sessions').update(fields).eq('id', active.remoteId);
  if (retry.error) throw retry.error;
}

function updateRemote(id: string | null, fields: Record<string, unknown>) {
  if (!id) return;
  supabase.from('study_sessions').update(fields).eq('id', id).then(() => {});
}

export function LockinProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const { refresh } = useSocial();
  const storageKey = userId ? `lockin/active/${userId}` : null;
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  // Sessions ended before the server returned their id, keyed by startedAt.
  const pendingEnds = useRef(new Map<number, { session: ActiveSession; ending: Ending }>());

  const end = useCallback(
    (session: ActiveSession, ending: Ending) => {
      setActive(null);
      cancelPauseNotifications();
      if (!session.remoteId) {
        pendingEnds.current.set(session.startedAt, { session, ending });
        return;
      }
      finishRemote(session, ending)
        .then(refresh)
        .catch(() => setNotice({ kind: 'error', message: "Pas de réseau : ta session n'a pas été enregistrée." }));
    },
    [refresh],
  );

  // A session still running when the app was killed counts as abandoned
  // (at the end of the break if it was killed during one).
  useEffect(() => {
    if (!storageKey) return;
    setLoaded(false);
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) {
          const saved = { pausedSeconds: 0, pause: null, tasks: [], ...JSON.parse(raw) } as ActiveSession;
          await AsyncStorage.removeItem(storageKey);
          const endedAt = saved.pause ? Math.min(saved.pause.until, Date.now()) : (saved.leftAt ?? Date.now());
          await finishRemote(saved, { status: 'abandoned', endedAt }).catch(() => {});
          setNotice({ kind: 'abandoned', message: "Tu as fermé l'app en pleine session 💀 Elle compte comme un abandon." });
          refresh();
        }
      } catch {
        // Corrupted storage: ignore.
      }
      setActive(null);
      setLoaded(true);
    })();
  }, [storageKey, refresh]);

  useEffect(() => {
    if (!loaded || !storageKey) return;
    if (active) AsyncStorage.setItem(storageKey, JSON.stringify(active)).catch(() => {});
    else AsyncStorage.removeItem(storageKey).catch(() => {});
  }, [active, loaded, storageKey]);

  // Heartbeat so friends see the session as live.
  useEffect(() => {
    if (!active?.remoteId) return;
    const id = active.remoteId;
    const beat = () => {
      if (AppState.currentState !== 'active') return;
      updateRemote(id, { last_seen_at: new Date().toISOString() });
    };
    const interval = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [active?.remoteId]);

  const endPause = useCallback(() => {
    const current = activeRef.current;
    if (!current?.pause) return;
    const at = Math.min(Date.now(), current.pause.until + PAUSE_GRACE_MS);
    const next = withPauseClosed(current, at);
    setActive(next);
    cancelPauseNotifications();
    updateRemote(next.remoteId, {
      paused_until: null,
      paused_seconds: Math.round(next.pausedSeconds),
      last_seen_at: new Date().toISOString(),
    });
    setNotice({ kind: 'pause', message: 'Fin de la pause. On lock in 🔒' });
  }, []);

  // A break ends by itself when its time is up and the app is open.
  useEffect(() => {
    if (!active?.pause) return;
    const remaining = active.pause.until - Date.now();
    const timer = setTimeout(() => {
      if (AppState.currentState === 'active') endPause();
    }, Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [active?.pause, endPause]);

  // Anti-cheat: watch the app going to the background during a session.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const current = activeRef.current;
      if (!current) return;
      if (next === 'background' && current.leftAt === null) {
        setActive({ ...current, leftAt: Date.now() });
        return;
      }
      if (next !== 'active' || current.leftAt === null) return;
      const now = Date.now();
      const back = { ...current, leftAt: null };

      if (current.pause) {
        // Leaving during a break is fine; only the time after it ended counts.
        if (now < current.pause.until) return setActive(back);
        if (now <= current.pause.until + PAUSE_GRACE_MS) {
          setActive(back);
          activeRef.current = back;
          return endPause();
        }
        end(back, { status: 'abandoned', endedAt: current.pause.until });
        return setNotice({
          kind: 'abandoned',
          message: 'Ta pause est finie depuis trop longtemps 💀 La session compte comme un abandon.',
        });
      }

      const awayMs = now - current.leftAt;
      if (awayMs > MAX_AWAY_MS) {
        end(current, { status: 'abandoned', endedAt: current.leftAt });
        setNotice({
          kind: 'abandoned',
          message: `Tu as craqué après ${formatDuration(focusSeconds(current, current.leftAt))} 💀 Tes potes sont au courant.`,
        });
      } else {
        setActive({ ...back, leaves: current.leaves + 1 });
        setNotice({
          kind: 'warning',
          message: `Ouf, t'es revenu 👀 Plus de ${MAX_AWAY_MS / 1000} s dehors et c'est l'abandon. Besoin de souffler ? Mets une pause.`,
        });
      }
    });
    return () => sub.remove();
  }, [end, endPause]);

  const startSession = useCallback(
    (subject: string, eventId: string | null = null, tasks: SessionTask[] = [], todoId: string | null = null) => {
      if (activeRef.current) return;
      const startedAt = Date.now();
      setNotice(null);
      setActive({
        remoteId: null,
        subject,
        eventId,
        startedAt,
        leaves: 0,
        leftAt: null,
        pausedSeconds: 0,
        pause: null,
        tasks,
        todoId,
        todoSince: 0,
        todoSplit: {},
      });
      supabase
        .from('study_sessions')
        .insert({
          subject,
          event_id: eventId,
          tasks,
          todo_id: todoId,
          started_at: new Date(startedAt).toISOString(),
          last_seen_at: new Date(startedAt).toISOString(),
        })
        .select('id')
        .single()
        .then(({ data, error }) => {
          if (error || !data) {
            setNotice({ kind: 'error', message: 'Pas de réseau : tes potes ne verront pas cette session.' });
            return;
          }
          const pending = pendingEnds.current.get(startedAt);
          if (pending) {
            // Already ended locally while the insert was in flight.
            pendingEnds.current.delete(startedAt);
            finishRemote({ ...pending.session, remoteId: data.id }, pending.ending)
              .then(refresh)
              .catch(() => {});
            return;
          }
          setActive((a) => (a && a.startedAt === startedAt ? { ...a, remoteId: data.id } : a));
          refresh();
        });
    },
    [refresh],
  );

  const stopSession = useCallback(() => {
    const current = activeRef.current;
    if (!current) return;
    const endedAt = Date.now();
    const seconds = focusSeconds(current, endedAt);
    if (seconds < MIN_SESSION_SEC) {
      end(current, { status: 'discard' });
      setNotice({ kind: 'tooShort', message: 'Moins d’une minute ? Ça compte pas 😅' });
      return;
    }
    end(current, { status: 'done', endedAt });
    const doneTasks = current.tasks.filter((t) => t.done).length;
    setNotice({
      kind: 'done',
      message:
        `${formatDuration(seconds)} de lock in. Respect 🫡` +
        (current.tasks.length ? ` ${doneTasks}/${current.tasks.length} tâches faites.` : ''),
    });
  }, [end]);

  const startPause = useCallback((minutes: number) => {
    const current = activeRef.current;
    if (!current || current.pause) return;
    const startedAt = Date.now();
    const until = startedAt + minutes * 60_000;
    setActive({ ...current, pause: { startedAt, until } });
    setNotice({ kind: 'pause', message: `Pause de ${minutes} min ☕ Profite !` });
    schedulePauseNotifications(until).catch(() => {});
    updateRemote(current.remoteId, { paused_until: new Date(until).toISOString(), last_seen_at: new Date().toISOString() });
  }, []);

  const setTasks = useCallback((tasks: SessionTask[]) => {
    const current = activeRef.current;
    if (!current) return;
    setActive({ ...current, tasks });
    updateRemote(current.remoteId, { tasks });
  }, []);

  const switchTodo = useCallback((todoId: string | null, subject?: string) => {
    const current = activeRef.current;
    if (!current || current.todoId === todoId) return;
    const now = Date.now();
    const next = {
      ...current,
      subject: subject ?? current.subject,
      todoId,
      todoSince: focusSeconds(current, now),
      todoSplit: todoSplitAt(current, now),
    };
    setActive(next);
    updateRemote(current.remoteId, { subject: next.subject, todo_id: todoId, todo_split: roundSplit(next.todoSplit) });
  }, []);

  return (
    <StoreContext.Provider
      value={{
        loaded,
        active,
        notice,
        clearNotice: () => setNotice(null),
        startSession,
        stopSession,
        startPause,
        endPause,
        setTasks,
        switchTodo,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useLockin(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useLockin must be used inside <LockinProvider>');
  return store;
}

/** Re-renders every second, for live timers. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
