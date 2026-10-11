import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { dayKey, startOfWeek } from './time';

/** Leaving the app for longer than this ends the session as abandoned. */
export const MAX_AWAY_MS = 10_000;
/** Completed sessions shorter than this are not saved. */
export const MIN_SESSION_SEC = 60;

export type Session = {
  id: string;
  subject: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  status: 'done' | 'abandoned';
  /** Short trips outside the app that were tolerated. */
  leaves: number;
};

export type ActiveSession = {
  subject: string;
  startedAt: number;
  leaves: number;
  /** Set while the app is in the background. */
  leftAt: number | null;
};

type Profile = { name: string; emoji: string };

type PersistedState = {
  profile: Profile | null;
  sessions: Session[];
  active: ActiveSession | null;
};

export type Notice = { kind: 'abandoned' | 'warning' | 'done' | 'tooShort'; message: string };

type Store = PersistedState & {
  loaded: boolean;
  notice: Notice | null;
  clearNotice: () => void;
  setProfile: (profile: Profile) => void;
  startSession: (subject: string) => void;
  stopSession: () => void;
  weekSeconds: number;
  streak: number;
};

const STORAGE_KEY = 'lockin/state/v1';
const StoreContext = createContext<Store | null>(null);

function endSession(active: ActiveSession, endedAt: number, status: Session['status']): Session {
  return {
    id: String(active.startedAt),
    subject: active.subject,
    startedAt: active.startedAt,
    endedAt,
    durationSec: Math.max(0, Math.floor((endedAt - active.startedAt) / 1000)),
    status,
    leaves: active.leaves,
  };
}

function computeStreak(sessions: Session[], now = new Date()): number {
  const days = new Set(sessions.filter((s) => s.status === 'done').map((s) => dayKey(new Date(s.startedAt))));
  const cursor = new Date(now);
  // Today does not break the streak until it is over.
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function LockinProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>({ profile: null, sessions: [], active: null });
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load saved state. A session still running when the app was killed counts as abandoned.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as PersistedState;
          if (saved.active) {
            const endedAt = saved.active.leftAt ?? Date.now();
            saved.sessions = [endSession(saved.active, endedAt, 'abandoned'), ...saved.sessions];
            saved.active = null;
            setNotice({ kind: 'abandoned', message: "Ta dernière session a été abandonnée : tu as fermé l'app." });
          }
          setState(saved);
        }
      } catch {
        // Corrupted storage: start fresh.
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, loaded]);

  // Anti-cheat: watch the app going to the background during a session.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const { active } = stateRef.current;
      if (!active) return;
      if (next === 'background' && active.leftAt === null) {
        setState((s) => (s.active ? { ...s, active: { ...s.active, leftAt: Date.now() } } : s));
      } else if (next === 'active' && active.leftAt !== null) {
        const awayMs = Date.now() - active.leftAt;
        if (awayMs > MAX_AWAY_MS) {
          const leftAt = active.leftAt;
          setState((s) =>
            s.active ? { ...s, sessions: [endSession(s.active, leftAt, 'abandoned'), ...s.sessions], active: null } : s,
          );
          setNotice({
            kind: 'abandoned',
            message: `Session abandonnée 😬 Tu as quitté Lockin pendant ${Math.round(awayMs / 1000)} s. Tes amis le verront.`,
          });
        } else {
          setState((s) => (s.active ? { ...s, active: { ...s.active, leaves: s.active.leaves + 1, leftAt: null } } : s));
          setNotice({
            kind: 'warning',
            message: `Attention 👀 Au-delà de ${MAX_AWAY_MS / 1000} s hors de l'app, ta session est perdue.`,
          });
        }
      }
    });
    return () => sub.remove();
  }, []);

  const setProfile = useCallback((profile: Profile) => setState((s) => ({ ...s, profile })), []);

  const startSession = useCallback((subject: string) => {
    setNotice(null);
    setState((s) => (s.active ? s : { ...s, active: { subject, startedAt: Date.now(), leaves: 0, leftAt: null } }));
  }, []);

  const stopSession = useCallback(() => {
    const { active } = stateRef.current;
    if (!active) return;
    const session = endSession(active, Date.now(), 'done');
    if (session.durationSec < MIN_SESSION_SEC) {
      setState((s) => ({ ...s, active: null }));
      setNotice({ kind: 'tooShort', message: 'Session trop courte (moins d’une minute), elle n’est pas comptée.' });
      return;
    }
    setState((s) => ({ ...s, sessions: [session, ...s.sessions], active: null }));
    setNotice({ kind: 'done', message: 'Bien joué 💪 Session enregistrée.' });
  }, []);

  const weekSeconds = useMemo(() => {
    const from = startOfWeek();
    return state.sessions
      .filter((s) => s.status === 'done' && s.startedAt >= from)
      .reduce((sum, s) => sum + s.durationSec, 0);
  }, [state.sessions]);

  const streak = useMemo(() => computeStreak(state.sessions), [state.sessions]);

  const value: Store = {
    ...state,
    loaded,
    notice,
    clearNotice: () => setNotice(null),
    setProfile,
    startSession,
    stopSession,
    weekSeconds,
    streak,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
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
