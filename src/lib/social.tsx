import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './auth';
import * as stats from './stats';
import {
  errorMessage,
  EventMemberRow,
  EventRow,
  ExamRow,
  FriendshipRow,
  GroupMemberRow,
  GroupRow,
  NudgeRow,
  PetRow,
  ProfileRow,
  ReactionRow,
  SessionRow,
  SessionTask,
  supabase,
} from './supabase';

/** Sessions are refreshed by a heartbeat every minute; older than this means the app was killed. */
const LIVE_WINDOW_MS = 150_000;
/** History loaded for streaks, badges and rankings. */
const HISTORY_DAYS = 60;
/** Group lock-ins stay listed this long after they start. */
const EVENT_VISIBLE_AFTER_START_MS = 6 * 3_600_000;

type SessionInfo = { sessionId: string; label: string; tasks: SessionTask[] };

export type PersonStatus =
  | (SessionInfo & { kind: 'working'; startedAt: number; pausedSeconds: number })
  | (SessionInfo & { kind: 'paused'; startedAt: number; until: number })
  | (SessionInfo & { kind: 'abandoned'; durationSec: number; at: number })
  | (SessionInfo & { kind: 'done'; durationSec: number; at: number })
  | { kind: 'idle' };

/** A deal on the featured island's shop: percent off (100 = offered). */
export type Deal = { item_id: string; percent: number; label: string | null };

export type Person = {
  profile: ProfileRow;
  status: PersonStatus;
  weekSeconds: number;
  streak: number;
};

export type Group = GroupRow & { members: Person[] };

export type EventParticipant = {
  profile: ProfileRow;
  rsvp: EventMemberRow['status'];
  /** This person's session for the event, if they started one. */
  session: SessionRow | null;
};

export type LockinEvent = EventRow & {
  hostProfile: ProfileRow;
  startsAt: number;
  participants: EventParticipant[];
  myRsvp: EventMemberRow['status'];
};

export type Exam = ExamRow & { doneSeconds: number; daysLeft: number };

/** An abandoned session this week, for the wall of shame. */
export type Shame = { profile: ProfileRow; session: SessionRow };

type Social = {
  loading: boolean;
  friends: Person[];
  incomingRequests: ProfileRow[];
  outgoingRequests: ProfileRow[];
  groups: Group[];
  events: LockinEvent[];
  exams: Exam[];
  shameWall: Shame[];
  mySessions: SessionRow[];
  myWeekSeconds: number;
  myStreak: number;
  myStreakInfo: stats.StreakInfo;
  /** Id of this week's leader among me and my friends (if anyone studied). */
  weekLeaderId: string | null;
  /** Reactions by session id. */
  reactions: Record<string, ReactionRow[]>;
  react: (sessionId: string, emoji: string | null) => Promise<void>;
  /** My pets, active one first. */
  pets: PetRow[];
  /** Friends' active pets by user id. */
  friendPets: Record<string, PetRow>;
  inventory: string[];
  buyItem: (itemId: string) => Promise<void>;
  equipItem: (petId: string, slot: string, itemId: string | null) => Promise<void>;
  setActivePet: (petId: string) => Promise<void>;
  /** Place an owned garden item (null removes it). Reload the profile afterwards. */
  setGarden: (slot: string, itemId: string | null) => Promise<void>;
  /** Saves my island. Reload the profile afterwards. */
  saveWorld: (world: unknown) => Promise<void>;
  /** Featured accounts (not me): their pet walks on every island, their island has a shop with deals. */
  featured: ProfileRow[];
  /** Deals of the featured shop. */
  deals: Deal[];
  /** Offered items I already took. */
  claimedGifts: string[];
  /** Buys an item at its deal price. Reload the profile afterwards. */
  buyDeal: (itemId: string) => Promise<void>;
  /** Nudges received and not yet seen, with the sender's profile. */
  nudges: { id: string; from: ProfileRow }[];
  refresh: () => Promise<void>;
  sendFriendRequest: (username: string) => Promise<string>;
  acceptRequest: (profileId: string) => Promise<void>;
  removeFriend: (profileId: string) => Promise<void>;
  nudge: (profileId: string) => Promise<void>;
  markNudgesSeen: () => Promise<void>;
  createGroup: (name: string) => Promise<GroupRow>;
  joinGroup: (code: string) => Promise<void>;
  leaveGroup: (groupId: string) => Promise<void>;
  createEvent: (input: { title: string; startsAt: Date; friendIds: string[] }) => Promise<string>;
  answerEvent: (eventId: string, rsvp: 'going' | 'declined') => Promise<void>;
  cancelEvent: (eventId: string) => Promise<void>;
  addExam: (input: { name: string; date: Date; goalMinutes: number }) => Promise<void>;
  deleteExam: (examId: string) => Promise<void>;
};

const SocialContext = createContext<Social | null>(null);

/** Last sign of life of a running session: its heartbeat, or the end of its break. */
function lastAlive(s: SessionRow): number {
  return Math.max(Date.parse(s.last_seen_at), s.paused_until ? Date.parse(s.paused_until) : 0);
}

function statusOf(sessions: SessionRow[], now: number): PersonStatus {
  const latest = sessions[0];
  if (!latest) return { kind: 'idle' };
  const info: SessionInfo = { sessionId: latest.id, label: latest.subject, tasks: latest.tasks ?? [] };
  const startedAt = Date.parse(latest.started_at);
  if (latest.status === 'active') {
    const until = latest.paused_until ? Date.parse(latest.paused_until) : 0;
    if (until > now) return { ...info, kind: 'paused', startedAt, until };
    const alive = lastAlive(latest);
    if (now - alive < LIVE_WINDOW_MS) {
      return { ...info, kind: 'working', startedAt, pausedSeconds: latest.paused_seconds ?? 0 };
    }
    // The app was closed without ending the session.
    return { ...info, kind: 'abandoned', durationSec: Math.max(0, (alive - startedAt) / 1000 - (latest.paused_seconds ?? 0)), at: alive };
  }
  const at = latest.ended_at ? Date.parse(latest.ended_at) : startedAt;
  return { ...info, kind: latest.status, durationSec: latest.duration_sec ?? 0, at };
}

/** A session whose app was killed counts as abandoned once its heartbeat is stale. */
export function effectiveStatus(s: SessionRow, now: number): SessionRow['status'] {
  if (s.status === 'active' && now - lastAlive(s) >= LIVE_WINDOW_MS) return 'abandoned';
  return s.status;
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function SocialProvider({ children }: { children: ReactNode }) {
  const { userId, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [friendships, setFriendships] = useState<FriendshipRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [nudgeRows, setNudgeRows] = useState<NudgeRow[]>([]);
  const [groupRows, setGroupRows] = useState<GroupRow[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMemberRow[]>([]);
  const [eventRows, setEventRows] = useState<EventRow[]>([]);
  const [eventMembers, setEventMembers] = useState<EventMemberRow[]>([]);
  const [examRows, setExamRows] = useState<ExamRow[]>([]);
  const [reactionRows, setReactionRows] = useState<ReactionRow[]>([]);
  const [petRows, setPetRows] = useState<PetRow[]>([]);
  const [inventory, setInventory] = useState<string[]>([]);
  const [featuredRows, setFeaturedRows] = useState<ProfileRow[]>([]);
  const [dealRows, setDealRows] = useState<Deal[]>([]);
  const [claimedGifts, setClaimedGifts] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    if (!userId) return;
    const eventsSince = new Date(Date.now() - EVENT_VISIBLE_AFTER_START_MS).toISOString();
    const [fsRes, groupsRes, membersRes, eventsRes, examsRes, nudgesRes] = await Promise.all([
      supabase.from('friendships').select('*').or(`requester.eq.${userId},addressee.eq.${userId}`),
      supabase.from('study_groups').select('*').order('created_at'),
      supabase.from('group_members').select('*'),
      supabase.from('lockin_events').select('*').gte('starts_at', eventsSince).order('starts_at'),
      supabase.from('exams').select('*').order('exam_date'),
      supabase.from('nudges').select('*').eq('to_user', userId).is('seen_at', null).order('created_at', { ascending: false }),
    ]);
    const fs = (fsRes.data ?? []) as FriendshipRow[];
    const gm = (membersRes.data ?? []) as GroupMemberRow[];
    const evs = (eventsRes.data ?? []) as EventRow[];
    const { data: emData } = evs.length
      ? await supabase.from('event_members').select('*').in('event_id', evs.map((e) => e.id))
      : { data: [] };
    const em = (emData ?? []) as EventMemberRow[];

    const friendIds = fs
      .filter((f) => f.status === 'accepted')
      .map((f) => (f.requester === userId ? f.addressee : f.requester));
    const otherIds = new Set<string>([
      ...fs.map((f) => (f.requester === userId ? f.addressee : f.requester)),
      ...gm.map((m) => m.user_id),
      ...em.map((m) => m.user_id),
      ...evs.map((e) => e.host),
      ...((nudgesRes.data ?? []) as NudgeRow[]).map((n) => n.from_user),
    ]);
    otherIds.delete(userId);
    // Whose sessions we load: everyone we can see. Event participants' sessions are fetched by event below.
    const sessionUserIds = [...new Set([userId, ...friendIds, ...gm.map((m) => m.user_id)])];

    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
    const [profilesRes, sessionsRes, eventSessionsRes] = await Promise.all([
      otherIds.size ? supabase.from('profiles').select('*').in('id', [...otherIds]) : Promise.resolve({ data: [] }),
      supabase
        .from('study_sessions')
        .select('*')
        .in('user_id', sessionUserIds)
        .gte('started_at', since)
        .order('started_at', { ascending: false })
        .limit(5000),
      evs.length
        ? supabase.from('study_sessions').select('*').in('event_id', evs.map((e) => e.id))
        : Promise.resolve({ data: [] }),
    ]);

    // Merge both session lists without duplicates, newest first.
    const byId = new Map<string, SessionRow>();
    for (const s of [...((sessionsRes.data ?? []) as SessionRow[]), ...((eventSessionsRes.data ?? []) as SessionRow[])]) {
      byId.set(s.id, s);
    }
    const merged = [...byId.values()].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));

    // Reactions on the last week's sessions only (keeps the request small).
    const weekAgo = Date.now() - 7 * 86_400_000;
    const recentIds = merged.filter((s) => Date.parse(s.started_at) >= weekAgo).slice(0, 150).map((s) => s.id);
    const { data: reactionsData } = recentIds.length
      ? await supabase.from('session_reactions').select('*').in('session_id', recentIds)
      : { data: [] };

    setFriendships(fs);
    setGroupRows((groupsRes.data ?? []) as GroupRow[]);
    setGroupMembers(gm);
    setEventRows(evs);
    setEventMembers(em);
    setExamRows((examsRes.data ?? []) as ExamRow[]);
    setNudgeRows((nudgesRes.data ?? []) as NudgeRow[]);
    setProfiles(Object.fromEntries(((profilesRes.data ?? []) as ProfileRow[]).map((p) => [p.id, p])));
    setSessions(merged);
    setReactionRows((reactionsData ?? []) as ReactionRow[]);
    const [petsRes, invRes, featuredRes, dealsRes, giftsRes] = await Promise.all([
      supabase.from('pets').select('*').order('created_at'),
      supabase.from('inventory').select('item_id').eq('user_id', userId),
      // Featured accounts (the app's creator): their pet visits every island, their island has a shop.
      supabase.from('profiles').select('*').eq('featured', true),
      supabase.from('deals').select('*'),
      supabase.from('claimed_gifts').select('item_id').eq('user_id', userId),
    ]);
    setFeaturedRows(((featuredRes.data ?? []) as ProfileRow[]).filter((p) => p.id !== userId));
    setDealRows((dealsRes.data ?? []) as Deal[]);
    setClaimedGifts(((giftsRes.data ?? []) as { item_id: string }[]).map((r) => r.item_id));
    setPetRows((petsRes.data ?? []) as PetRow[]);
    setInventory(((invRes.data ?? []) as { item_id: string }[]).map((r) => r.item_id));
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
    const channel = supabase.channel(`lockin-${userId}`);
    for (const table of ['study_sessions', 'friendships', 'group_members', 'lockin_events', 'event_members', 'session_reactions', 'pets']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh);
    }
    channel
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
    const allProfiles: Record<string, ProfileRow> = { ...profiles };
    if (profile) allProfiles[profile.id] = profile;

    const byUser: Record<string, SessionRow[]> = {};
    for (const s of sessions) (byUser[s.user_id] ??= []).push(s);
    const mySessions = userId ? (byUser[userId] ?? []) : [];

    const person = (id: string): Person | null => {
      const p = allProfiles[id];
      if (!p) return null;
      const own = byUser[id] ?? [];
      return { profile: p, status: statusOf(own, now), weekSeconds: stats.weekSeconds(own), streak: stats.streak(own) };
    };

    const friends: Person[] = [];
    const incomingRequests: ProfileRow[] = [];
    const outgoingRequests: ProfileRow[] = [];
    for (const f of friendships) {
      const otherId = f.requester === userId ? f.addressee : f.requester;
      const other = allProfiles[otherId];
      if (!other) continue;
      if (f.status === 'accepted') {
        const p = person(otherId);
        if (p) friends.push(p);
      } else if (f.addressee === userId) incomingRequests.push(other);
      else outgoingRequests.push(other);
    }
    friends.sort((a, b) => a.profile.display_name.localeCompare(b.profile.display_name));

    const groups: Group[] = groupRows.map((g) => ({
      ...g,
      members: groupMembers
        .filter((m) => m.group_id === g.id)
        .map((m) => person(m.user_id))
        .filter((p): p is Person => p !== null),
    }));

    const events: LockinEvent[] = eventRows
      .map((e) => {
        const members = eventMembers.filter((m) => m.event_id === e.id);
        const participants: EventParticipant[] = members
          .filter((m) => allProfiles[m.user_id])
          .map((m) => ({
            profile: allProfiles[m.user_id],
            rsvp: m.status,
            session: sessions.find((s) => s.event_id === e.id && s.user_id === m.user_id) ?? null,
          }));
        const mine = members.find((m) => m.user_id === userId);
        return {
          ...e,
          hostProfile: allProfiles[e.host],
          startsAt: Date.parse(e.starts_at),
          participants,
          myRsvp: e.host === userId ? 'going' : (mine?.status ?? 'invited'),
        };
      })
      .filter((e) => e.hostProfile);

    const today = localDate(new Date(now));
    const exams: Exam[] = examRows
      .filter((x) => x.exam_date >= today)
      .map((x) => {
        const since = Date.parse(x.created_at);
        const doneSeconds = mySessions
          .filter(
            (s) =>
              s.status === 'done' &&
              s.subject.toLowerCase() === x.name.toLowerCase() &&
              Date.parse(s.started_at) >= since,
          )
          .reduce((sum, s) => sum + (s.duration_sec ?? 0), 0);
        const daysLeft = Math.round((Date.parse(`${x.exam_date}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86_400_000);
        return { ...x, doneSeconds, daysLeft };
      });

    // Abandons this week by me and my friends.
    const weekStart = stats.weekStart();
    const shameIds = new Set([userId, ...friends.map((f) => f.profile.id)]);
    const shameWall: Shame[] = sessions
      .filter(
        (s) =>
          shameIds.has(s.user_id) &&
          Date.parse(s.started_at) >= weekStart &&
          effectiveStatus(s, now) === 'abandoned' &&
          allProfiles[s.user_id],
      )
      .map((s) => ({ profile: allProfiles[s.user_id], session: s }));

    const nudges = nudgeRows
      .filter((n) => allProfiles[n.from_user])
      .map((n) => ({ id: n.id, from: allProfiles[n.from_user] }));

    const reactions: Record<string, ReactionRow[]> = {};
    for (const r of reactionRows) (reactions[r.session_id] ??= []).push(r);

    const myWeekSeconds = stats.weekSeconds(mySessions);
    const contenders = [{ id: userId, seconds: myWeekSeconds }, ...friends.map((f) => ({ id: f.profile.id, seconds: f.weekSeconds }))];
    const top = contenders.reduce((a, b) => (b.seconds > a.seconds ? b : a), { id: null as string | null, seconds: 0 });

    const myPets = petRows
      .filter((p) => p.user_id === userId)
      .sort((a, b) => (a.id === profile?.active_pet_id ? -1 : b.id === profile?.active_pet_id ? 1 : 0));
    const friendPets: Record<string, PetRow> = {};
    for (const p of [...Object.values(allProfiles), ...featuredRows]) {
      const pet = petRows.find((r) => r.id === p.active_pet_id);
      if (pet && p.id !== userId) friendPets[p.id] = pet;
    }

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
      groups,
      events,
      exams,
      shameWall,
      mySessions,
      myWeekSeconds,
      myStreak: stats.streak(mySessions),
      myStreakInfo: stats.streakInfo(mySessions),
      weekLeaderId: top.seconds > 0 ? top.id : null,
      reactions,
      pets: myPets,
      friendPets,
      inventory,
      buyItem: (itemId) => run(() => supabase.rpc('buy_item', { item: itemId })),
      equipItem: (petId, slot, itemId) => run(() => supabase.rpc('equip_item', { pet: petId, slot, item: itemId })),
      setActivePet: (petId) => run(() => supabase.rpc('set_active_pet', { pet: petId })),
      setGarden: (slot, itemId) => run(() => supabase.rpc('set_garden', { slot, item: itemId })),
      saveWorld: (world) => run(() => supabase.rpc('save_world', { world })),
      featured: featuredRows,
      deals: dealRows,
      claimedGifts,
      buyDeal: (itemId) => run(() => supabase.rpc('buy_deal', { item: itemId })),
      react: async (sessionId, emoji) => {
        if (!userId) return;
        // Optimistic: show the reaction right away.
        setReactionRows((rows) => [
          ...rows.filter((r) => !(r.session_id === sessionId && r.user_id === userId)),
          ...(emoji ? [{ session_id: sessionId, user_id: userId, emoji, created_at: new Date().toISOString() }] : []),
        ]);
        const mine = reactionRows.find((r) => r.session_id === sessionId && r.user_id === userId);
        const { error } = !emoji
          ? await supabase.from('session_reactions').delete().eq('session_id', sessionId).eq('user_id', userId)
          : mine
            ? await supabase.from('session_reactions').update({ emoji }).eq('session_id', sessionId).eq('user_id', userId)
            : await supabase.from('session_reactions').insert({ session_id: sessionId, emoji });
        if (error) {
          await refresh();
          throw new Error(errorMessage(error));
        }
      },
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
      createGroup: async (name) => {
        const { data, error } = await supabase.from('study_groups').insert({ name: name.trim() }).select().single();
        if (error) throw new Error(errorMessage(error));
        await refresh();
        return data as GroupRow;
      },
      joinGroup: (code) => run(() => supabase.rpc('join_group', { invite_code: code })),
      leaveGroup: (groupId) =>
        run(() => supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId!)),
      createEvent: async ({ title, startsAt, friendIds }) => {
        if (!userId) throw new Error('Non connecté.');
        const { data, error } = await supabase
          .from('lockin_events')
          .insert({ title: title.trim(), starts_at: startsAt.toISOString() })
          .select()
          .single();
        if (error) throw new Error(errorMessage(error));
        const rows = [
          { event_id: data.id, user_id: userId, status: 'going' },
          ...friendIds.map((id) => ({ event_id: data.id, user_id: id, status: 'invited' })),
        ];
        const { error: membersError } = await supabase.from('event_members').insert(rows);
        if (membersError) throw new Error(errorMessage(membersError));
        await refresh();
        return data.id as string;
      },
      answerEvent: (eventId, rsvp) =>
        run(() => supabase.from('event_members').update({ status: rsvp }).eq('event_id', eventId).eq('user_id', userId!)),
      cancelEvent: (eventId) => run(() => supabase.from('lockin_events').delete().eq('id', eventId)),
      addExam: ({ name, date, goalMinutes }) =>
        run(() =>
          supabase.from('exams').insert({ name: name.trim(), exam_date: localDate(date), goal_minutes: goalMinutes }),
        ),
      deleteExam: (examId) => run(() => supabase.from('exams').delete().eq('id', examId)),
    };
  }, [
    loading,
    friendships,
    profiles,
    profile,
    sessions,
    nudgeRows,
    groupRows,
    groupMembers,
    eventRows,
    eventMembers,
    examRows,
    reactionRows,
    petRows,
    inventory,
    featuredRows,
    dealRows,
    claimedGifts,
    now,
    userId,
    refresh,
  ]);

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial(): Social {
  const social = useContext(SocialContext);
  if (!social) throw new Error('useSocial must be used inside <SocialProvider>');
  return social;
}
