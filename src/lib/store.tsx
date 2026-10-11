import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './auth';
import { useSocial } from './social';
import { supabase } from './supabase';

/** Leaving the app for longer than this ends the session as abandoned. */
export const MAX_AWAY_MS = 10_000;
/** Completed sessions shorter than this are not counted. */
export const MIN_SESSION_SEC = 60;
/** How often a running session tells friends it is still alive. */
const HEARTBEAT_MS = 60_000;

export type ActiveSession = {
  /** Row id in study_sessions, once created. */
  remoteId: string | null;
  subject: string;
  startedAt: number;
  /** Short trips outside the app that were tolerated. */
  leaves: number;
  /** Set while the app is in the background. */
  leftAt: number | null;
};

export type Notice = { kind: 'abandoned' | 'warning' | 'done' | 'tooShort' | 'error'; message: string };

type Store = {
  loaded: boolean;
  active: ActiveSession | null;
  notice: Notice | null;
  clearNotice: () => void;
  startSession: (subject: string) => void;
  stopSession: () => void;
};

const StoreContext = createContext<Store | null>(null);

type Ending = { status: 'done' | 'abandoned'; endedAt: number } | { status: 'discard' };

/** Saves the end of a session on the server. */
async function finishRemote(active: ActiveSession, ending: Ending) {
  if (!active.remoteId) return;
  if (ending.status === 'discard') {
    await supabase.from('study_sessions').delete().eq('id', active.remoteId);
    return;
  }
  const durationSec = Math.min(43_200, Math.max(0, Math.round((ending.endedAt - active.startedAt) / 1000)));
  await supabase
    .from('study_sessions')
    .update({
      status: ending.status,
      ended_at: new Date(ending.endedAt).toISOString(),
      last_seen_at: new Date(ending.endedAt).toISOString(),
      duration_sec: durationSec,
      leaves: active.leaves,
    })
    .eq('id', active.remoteId);
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
  const pendingEnds = useRef(new Map<number, Ending>());

  const end = useCallback(
    (session: ActiveSession, ending: Ending) => {
      setActive(null);
      if (!session.remoteId) {
        pendingEnds.current.set(session.startedAt, ending);
        return;
      }
      finishRemote(session, ending)
        .then(refresh)
        .catch(() => setNotice({ kind: 'error', message: "La session n'a pas pu être enregistrée (pas de connexion ?)." }));
    },
    [refresh],
  );

  // Restore a session that was running when the app was killed: it counts as abandoned.
  useEffect(() => {
    if (!storageKey) return;
    setLoaded(false);
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) {
          const saved = JSON.parse(raw) as ActiveSession;
          await AsyncStorage.removeItem(storageKey);
          await finishRemote(saved, { status: 'abandoned', endedAt: saved.leftAt ?? Date.now() }).catch(() => {});
          setNotice({ kind: 'abandoned', message: "Ta dernière session a été abandonnée : tu as fermé l'app." });
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
      supabase.from('study_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', id).then(() => {});
    };
    const interval = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [active?.remoteId]);

  // Anti-cheat: watch the app going to the background during a session.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const current = activeRef.current;
      if (!current) return;
      if (next === 'background' && current.leftAt === null) {
        setActive({ ...current, leftAt: Date.now() });
      } else if (next === 'active' && current.leftAt !== null) {
        const awayMs = Date.now() - current.leftAt;
        if (awayMs > MAX_AWAY_MS) {
          end(current, { status: 'abandoned', endedAt: current.leftAt });
          setNotice({
            kind: 'abandoned',
            message: `Session abandonnée 😬 Tu as quitté Lockin pendant ${Math.round(awayMs / 1000)} s. Tes amis le verront.`,
          });
        } else {
          setActive({ ...current, leaves: current.leaves + 1, leftAt: null });
          setNotice({
            kind: 'warning',
            message: `Attention 👀 Au-delà de ${MAX_AWAY_MS / 1000} s hors de l'app, ta session est perdue.`,
          });
        }
      }
    });
    return () => sub.remove();
  }, [end]);

  const startSession = useCallback(
    (subject: string) => {
      if (activeRef.current) return;
      const startedAt = Date.now();
      setNotice(null);
      setActive({ remoteId: null, subject, startedAt, leaves: 0, leftAt: null });
      supabase
        .from('study_sessions')
        .insert({ subject, started_at: new Date(startedAt).toISOString(), last_seen_at: new Date(startedAt).toISOString() })
        .select('id')
        .single()
        .then(({ data, error }) => {
          if (error || !data) {
            setNotice({ kind: 'error', message: 'Pas de connexion : tes amis ne verront pas cette session.' });
            return;
          }
          const ending = pendingEnds.current.get(startedAt);
          if (ending) {
            // Already ended locally while the insert was in flight.
            pendingEnds.current.delete(startedAt);
            const ended = { remoteId: data.id, subject, startedAt, leaves: 0, leftAt: null };
            finishRemote(ended, ending).then(refresh);
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
    if ((endedAt - current.startedAt) / 1000 < MIN_SESSION_SEC) {
      end(current, { status: 'discard' });
      setNotice({ kind: 'tooShort', message: 'Session trop courte (moins d’une minute), elle n’est pas comptée.' });
      return;
    }
    end(current, { status: 'done', endedAt });
    setNotice({ kind: 'done', message: 'Bien joué 💪 Session enregistrée.' });
  }, [end]);

  return (
    <StoreContext.Provider
      value={{ loaded, active, notice, clearNotice: () => setNotice(null), startSession, stopSession }}
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
