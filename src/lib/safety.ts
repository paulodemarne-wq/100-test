import { errorMessage, supabase } from './supabase';

async function call(fn: string, args: Record<string, unknown> = {}) {
  const { error } = await supabase.rpc(fn, args);
  if (error) throw new Error(errorMessage(error));
}

/** App Store rules: block and report other people, and delete my own account. */
export const blockUser = (u: string) => call('block_user', { u });
export const unblockUser = (u: string) => call('unblock_user', { u });
export const reportUser = (u: string, reason: string, context?: string) => call('report_user', { u, reason, context: context ?? null });
export const deleteMyAccount = () => call('delete_my_account');

export type BlockedPerson = { id: string; display_name: string; username: string };

/** The people I blocked. */
export async function fetchBlocked(): Promise<BlockedPerson[]> {
  const { data: rows, error } = await supabase.from('blocks').select('blocked').order('created_at', { ascending: false });
  if (error) throw new Error(errorMessage(error));
  const ids = (rows ?? []).map((r) => r.blocked as string);
  if (ids.length === 0) return [];
  const { data: people } = await supabase.from('profiles').select('id, display_name, username').in('id', ids);
  return (people ?? []) as BlockedPerson[];
}

export const REPORT_REASONS = ['Harcèlement ou insultes', 'Contenu choquant', 'Spam', 'Fausse identité', 'Autre'] as const;
