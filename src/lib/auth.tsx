import type { Session } from '@supabase/supabase-js';
import { File } from 'expo-file-system';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { errorMessage, ProfileRow, supabase } from './supabase';

type Auth = {
  /** False until the saved session (and the profile, if signed in) has been loaded. */
  ready: boolean;
  session: Session | null;
  userId: string | null;
  /** Null when signed in but the profile has not been created yet. */
  profile: ProfileRow | null;
  /** True once the signed-in user's profile has been fetched (it may still be null). */
  profileReady: boolean;
  signUp: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Creates or updates the profile. `localPhotoUri` is uploaded when set. */
  saveProfile: (input: { username: string; displayName: string; localPhotoUri?: string | null }) => Promise<void>;
  setPhoto: (localPhotoUri: string | null) => Promise<void>;
  /** Reloads the profile (after a purchase, for the wallet). */
  reloadProfile: () => Promise<void>;
  updateSettings: (settings: Partial<Pick<ProfileRow, 'weekly_goal_minutes' | 'notify_friend_sessions'>>) => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  const bytes = await new File(localUri).bytes();
  const { error } = await supabase.storage.from('avatars').upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [ready, setReady] = useState(false);
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const userId = session?.user.id ?? null;

  const loadProfile = useCallback(async (id: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    // On a network error keep what we had rather than sending the user to profile setup.
    if (!error) setProfile((data as ProfileRow | null) ?? null);
    setProfileFor(id);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  // Reload the profile when a different user signs in.
  useEffect(() => {
    if (ready && userId) loadProfile(userId);
  }, [ready, userId, loadProfile]);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) throw new Error(errorMessage(error));
    return { needsEmailConfirmation: !data.session };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(errorMessage(error));
      await loadProfile(data.user.id);
    },
    [loadProfile],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const saveProfile = useCallback<Auth['saveProfile']>(
    async ({ username, displayName, localPhotoUri }) => {
      if (!userId) throw new Error('Non connecté.');
      try {
        const avatar_url = localPhotoUri ? await uploadAvatar(userId, localPhotoUri) : (profile?.avatar_url ?? null);
        // Separate insert/update: profiles may only write a few columns (see schema.sql).
        const fields = { username, display_name: displayName, avatar_url };
        const { data, error } = profile
          ? await supabase.from('profiles').update(fields).eq('id', userId).select().single()
          : await supabase.from('profiles').insert({ id: userId, ...fields }).select().single();
        if (error) throw error;
        setProfile(data as ProfileRow);
      } catch (e) {
        throw new Error(errorMessage(e));
      }
    },
    [userId, profile],
  );

  const setPhoto = useCallback(
    async (localPhotoUri: string | null) => {
      if (!userId) return;
      try {
        const avatar_url = localPhotoUri ? await uploadAvatar(userId, localPhotoUri) : null;
        const { data, error } = await supabase.from('profiles').update({ avatar_url }).eq('id', userId).select().single();
        if (error) throw error;
        setProfile(data as ProfileRow);
      } catch (e) {
        throw new Error(errorMessage(e));
      }
    },
    [userId],
  );

  const updateSettings = useCallback<Auth['updateSettings']>(
    async (settings) => {
      if (!userId) return;
      setProfile((p) => (p ? { ...p, ...settings } : p));
      const { data, error } = await supabase.from('profiles').update(settings).eq('id', userId).select().single();
      if (error) {
        await loadProfile(userId);
        throw new Error(errorMessage(error));
      }
      setProfile(data as ProfileRow);
    },
    [userId, loadProfile],
  );

  return (
    <AuthContext.Provider
      value={{
        ready,
        session,
        userId,
        profile,
        profileReady: !userId || profileFor === userId,
        signUp,
        signIn,
        signOut,
        saveProfile,
        setPhoto,
        updateSettings,
        reloadProfile: async () => {
          if (userId) await loadProfile(userId);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}

/** "Paulo Dem" -> "paulodem" ; used to suggest a username. */
export function suggestUsername(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 20);
}
