import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './auth';
import * as stats from './stats';
import { errorMessage, FriendshipRow, NudgeRow, ProfileRow, SessionRow, supabase } from './supabase';

/** Sessions are refreshed by a heartbeat every minute; older than this means the app was killed. */
const LIVE_WINDOW_MS = 150_000;
/** History loaded for streaks and the weekly ranking. */
const HISTORY_DAYS = 60;

export type FriendStatus =
  | { kind: 'working'; subject: string; startedAt: number }
  | { kind: 'abandoned'; subject: string; durationSec: number; at: number }
  | { kind: 'done'; subject: string; durationSec: number; at: number }
  | { kind: 'idle' };

export type Friend = {
  profile: ProfileRow;
  status: FriendStatus;
  weekSeconds: number;
  streak: number;
};

type Social = {
  loading: boolean;
  friends: Friend[];
  incomingRequests: ProfileRow[];
  outgoingRequests: ProfileRow[];
  mySessions: SessionRow[];
  myWeekSeconds: number;
  myStreak: number;
  /** Nudges received and not yet seen, with the sender's profile. */
  nudges: { id: string; from: ProfileRow }[];
  refresh: () => Promise<void>;
  sendFriendRequest: (username: string) => Promise<string>;
  acceptRequest: (profileId: string) => Promise<void>;
  removeFriend: (profileId: string) => Promise<void>;
  nudge: (profileId: string) => Promise<void>;
  markNudgesSeen: () => Promise<void>;
};

const SocialContext = createContext<Social | null>(null);

function statusOf(sessions: SessionRow[], now: number): FriendStatus {
  const latest = sessions[0];
  if (!latest) return { kind: 'idle' };
  const startedAt = Date.parse(latest.started_at);
  if (latest.status === 'active') {
    const lastSeen = Date.parse(latest.last_seen_at);
    if (now - lastSeen < LIVE_WINDOW_MS) return { kind: 'working', subject: latest.subject, startedAt };
    // The app was closed without ending the session.
    return { kind: 'abandoned', subject: latest.subject, durationSec: (lastSeen - startedAt) / 1000, at: lastSeen };
  }
  const at = latest.ended_at ? Date.parse(latest.ended_at) : startedAt;
  return { kind: latest.status, subject: latest.subject, durationSec: latest.duration_sec ?? 0, at };
}

export function SocialProvider({ children }: { children: ReactNode }) {
  const { userId, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [friendships, setFriendships] = useState<FriendshipRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [nudgeRows, setNudgeRows] = useState<NudgeRow[]>([]);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data: fs } = await supabase
      .from('friendships')
      .select('*')
      .or(`requester.eq.${userId},addressee.eq.${userId}`);
    const rows = (fs ?? []) as FriendshipRow[];
    const otherIds = rows.map((f) => (f.requester === userId ? f.addressee : f.requester));
    const friendIds = rows
      .filter((f) => f.status === 'accepted')
      .map((f) => (f.requester === userId ? f.addressee : f.requester));

    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
    const [profilesRes, sessionsRes, nudgesRes] = await Promise.all([
      otherIds.length ? supabase.from('profiles').select('*').in('id', otherIds) : Promise.resolve({ data: [] }),
      supabase
        .from('study_sessions')
        .select('*')
        .in('user_id', [userId, ...friendIds])
        .gte('started_at', since)
        .order('started_at', { ascending: false })
        .limit(2000),
      supabase.from('nudges').select('*').eq('to_user', userId).is('seen_at', null).order('created_at', { ascending: false }),
    ]);

    setFriendships(rows);
    setProfiles(Object.fromEntries(((profilesRes.data ?? []) as ProfileRow[]).map((p) => [p.id, p])));
    setSessions((sessionsRes.data ?? []) as SessionRow[]);
    setNudgeRows((nudgesRes.data ?? []) as NudgeRow[]);
    setNow(Date.now());
    setLoading(false);
  }, [userId]);

  // Coalesce bursts of realtime events into one refresh.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refresh, 400);
  }, [refresh]);

  useEffect(() => {
    if (!userId || !profile) return;
    refresh();
    const channel = supabase
      .channel(`lockin-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_sessions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, scheduleRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nudges', filter: `to_user=eq.${userId}` }, scheduleRefresh)
      .subscribe();
    // Also poll: live statuses expire over time, and realtime can drop while in the background.
    const poll = setInterval(refresh, 60_000);
    const appState = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      appState.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [userId, profile, refresh, scheduleRefresh]);

  const value = useMemo<Social>(() => {
    const byUser: Record<string, SessionRow[]> = {};
    for (const s of sessions) (byUser[s.user_id] ??= []).push(s);
    const mySessions = userId ? (byUser[userId] ?? []) : [];

    const friends: Friend[] = [];
    const incomingRequests: ProfileRow[] = [];
    const outgoingRequests: ProfileRow[] = [];
    for (const f of friendships) {
      const otherId = f.requester === userId ? f.addressee : f.requester;
      const other = profiles[otherId];
      if (!other) continue;
      if (f.status === 'accepted') {
        const own = byUser[otherId] ?? [];
        friends.push({
          profile: other,
          status: statusOf(own, now),
          weekSeconds: stats.weekSeconds(own),
          streak: stats.streak(own),
        });
      } else if (f.addressee === userId) incomingRequests.push(other);
      else outgoingRequests.push(other);
    }
    friends.sort((a, b) => a.profile.display_name.localeCompare(b.profile.display_name));

    const nudges = nudgeRows
      .filter((n) => profiles[n.from_user])
      .map((n) => ({ id: n.id, from: profiles[n.from_user] }));

    const run = async (fn: () => PromiseLike<{ error: unknown }>) => {
      const { error } = await fn();
      if (error) throw new Error(errorMessage(error));
      await refresh();
    };

    return {
      loading,
      friends,
      incomingRequests,
      outgoingRequests,
      mySessions,
      myWeekSeconds: stats.weekSeconds(mySessions),
      myStreak: stats.streak(mySessions),
      nudges,
      refresh,
      sendFriendRequest: async (rawUsername) => {
        const username = rawUsername.trim().replace(/^@/, '').toLowerCase();
        if (!userId || !username) throw new Error('Entre un pseudo.');
        const { data: target } = await supabase.from('profiles').select('*').eq('username', username).maybeSingle();
        if (!target) throw new Error(`Personne ne s'appelle @${username} sur Lockin.`);
        if (target.id === userId) throw new Error("C'est toi ! 😄");
        const existing = friendships.find((f) => f.requester === target.id || f.addressee === target.id);
        if (existing?.status === 'accepted') throw new Error(`Tu es déjà ami avec ${target.display_name}.`);
        if (existing && existing.requester === target.id) {
          // They already asked us: accepting is what the user wants.
          await run(() =>
            supabase.from('friendships').update({ status: 'accepted' }).eq('requester', target.id).eq('addressee', userId),
          );
          return `Toi et ${target.display_name} êtes maintenant amis 🎉`;
        }
        if (existing) return `Demande déjà envoyée à ${target.display_name}.`;
        await run(() => supabase.from('friendships').insert({ requester: userId, addressee: target.id }));
        return `Demande envoyée à ${target.display_name} ✓`;
      },
      acceptRequest: (profileId) =>
        run(() =>
          supabase.from('friendships').update({ status: 'accepted' }).eq('requester', profileId).eq('addressee', userId!),
        ),
      removeFriend: (profileId) =>
        run(() =>
          supabase
            .from('friendships')
            .delete()
            .or(
              `and(requester.eq.${userId},addressee.eq.${profileId}),and(requester.eq.${profileId},addressee.eq.${userId})`,
            ),
        ),
      nudge: (profileId) => run(() => supabase.from('nudges').insert({ to_user: profileId })),
      markNudgesSeen: async () => {
        if (!userId || nudgeRows.length === 0) return;
        setNudgeRows([]);
        await supabase.from('nudges').update({ seen_at: new Date().toISOString() }).eq('to_user', userId).is('seen_at', null);
      },
    };
  }, [loading, friendships, profiles, sessions, nudgeRows, now, userId, refresh]);

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial(): Social {
  const social = useContext(SocialContext);
  if (!social) throw new Error('useSocial must be used inside <SocialProvider>');
  return social;
}
