import { ProfileRow } from './supabase';
import { formatDuration } from './time';

/** Hours left to spend (seconds). Featured accounts (the app's creator) have unlimited hours. */
export function walletSeconds(profile: ProfileRow | null | undefined): number {
  if (profile?.featured) return Infinity;
  return Math.max(0, (profile?.total_seconds ?? 0) - (profile?.spent_seconds ?? 0));
}

export function formatWallet(seconds: number): string {
  return Number.isFinite(seconds) ? formatDuration(seconds) : '∞';
}
