import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

// Public values: the publishable key is meant to ship inside the app.
// Data is protected by the row level security policies in supabase/schema.sql.
const SUPABASE_URL = 'https://ljomnjzqnnkzkteqnrsy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_73bX9VlfmUOVxvDF7wL0ow_mKBFBAxg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Only refresh the auth token while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  weekly_goal_minutes: number;
  notify_friend_sessions: boolean;
};

export type SessionRow = {
  id: string;
  user_id: string;
  subject: string;
  started_at: string;
  ended_at: string | null;
  last_seen_at: string;
  status: 'active' | 'done' | 'abandoned';
  duration_sec: number | null;
  leaves: number;
  event_id: string | null;
};

export type FriendshipRow = {
  requester: string;
  addressee: string;
  status: 'pending' | 'accepted';
  created_at: string;
};

export type NudgeRow = {
  id: string;
  from_user: string;
  to_user: string;
  created_at: string;
  seen_at: string | null;
};

export type ExamRow = {
  id: string;
  user_id: string;
  name: string;
  exam_date: string;
  goal_minutes: number;
  created_at: string;
};

export type GroupRow = { id: string; name: string; code: string; created_by: string; created_at: string };
export type GroupMemberRow = { group_id: string; user_id: string; joined_at: string };

export type EventRow = { id: string; host: string; title: string; starts_at: string; created_at: string };
export type EventMemberRow = { event_id: string; user_id: string; status: 'invited' | 'going' | 'declined' };

/** Turns Supabase/network errors into a short French message. */
export function errorMessage(error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? String(error);
  if (/invalid login credentials/i.test(message)) return 'E-mail ou mot de passe incorrect.';
  if (/user already registered/i.test(message)) return 'Un compte existe déjà avec cet e-mail.';
  if (/password should be at least/i.test(message)) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (/email not confirmed/i.test(message)) return 'Confirme ton e-mail (regarde ta boîte mail), puis reconnecte-toi.';
  if (/unable to validate email|invalid format|email address .* is invalid/i.test(message)) return 'Adresse e-mail invalide.';
  if (/profiles_username_key/i.test(message)) return 'Ce pseudo est déjà pris.';
  if (/code invalide/i.test(message)) return 'Code invalide. Vérifie-le avec la personne qui a créé le groupe.';
  if (/network request failed|fetch failed/i.test(message)) return 'Pas de connexion internet.';
  return message;
}
