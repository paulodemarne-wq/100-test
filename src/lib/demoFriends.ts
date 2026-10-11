// Fake friends so the app feels alive before the online backend exists.
// They will be replaced by real accounts (Supabase) in the next version.

export type FriendStatus =
  | { kind: 'working'; subject: string; startedAt: number }
  | { kind: 'abandoned'; subject: string; afterMin: number; at: number }
  | { kind: 'done'; subject: string; durationMin: number; at: number }
  | { kind: 'idle'; lastSeenAt: number };

export type Friend = {
  id: string;
  name: string;
  emoji: string;
  weekMinutes: number;
  streak: number;
  status: FriendStatus;
};

const MIN = 60_000;

export function getDemoFriends(now = Date.now()): Friend[] {
  return [
    {
      id: 'lea',
      name: 'Léa',
      emoji: '🦊',
      weekMinutes: 742,
      streak: 12,
      status: { kind: 'working', subject: 'Maths', startedAt: now - 72 * MIN },
    },
    {
      id: 'tom',
      name: 'Tom',
      emoji: '🐸',
      weekMinutes: 95,
      streak: 0,
      status: { kind: 'abandoned', subject: 'Histoire', afterMin: 4, at: now - 18 * MIN },
    },
    {
      id: 'ines',
      name: 'Inès',
      emoji: '🐼',
      weekMinutes: 510,
      streak: 6,
      status: { kind: 'working', subject: 'Anglais', startedAt: now - 23 * MIN },
    },
    {
      id: 'yanis',
      name: 'Yanis',
      emoji: '🦁',
      weekMinutes: 388,
      streak: 3,
      status: { kind: 'done', subject: 'Code', durationMin: 95, at: now - 40 * MIN },
    },
    {
      id: 'sarah',
      name: 'Sarah',
      emoji: '🐙',
      weekMinutes: 220,
      streak: 1,
      status: { kind: 'idle', lastSeenAt: now - 5 * 60 * MIN },
    },
  ];
}
