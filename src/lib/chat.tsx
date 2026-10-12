import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './auth';
import { errorMessage, supabase } from './supabase';

export type MessageRow = {
  id: string;
  sender: string;
  recipient: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type Conversation = { friendId: string; last: MessageRow; unread: number };

type Chat = {
  /** One per friend I talked with, the most recent first. */
  conversations: Conversation[];
  unreadTotal: number;
  /** Messages with this friend, oldest first. */
  thread: (friendId: string) => MessageRow[];
  send: (friendId: string, body: string) => Promise<void>;
  markRead: (friendId: string) => void;
};

const ChatContext = createContext<Chat | null>(null);
/** How many recent messages to keep in memory. */
const LIMIT = 500;

/** Private messages between friends, kept live with Supabase realtime. */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const merge = useCallback((rows: MessageRow[]) => {
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const r of rows) byId.set(r.id, r);
      return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-LIMIT);
    });
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(LIMIT);
    if (data) merge(data as MessageRow[]);
  }, [userId, merge]);

  useEffect(() => {
    if (!userId) {
      setMessages([]);
      return;
    }
    load();
    const onRow = (p: { new: unknown }) => merge([p.new as MessageRow]);
    const channel = supabase
      .channel(`chat-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient=eq.${userId}` }, onRow)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender=eq.${userId}` }, onRow)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender=eq.${userId}` }, onRow)
      .subscribe();
    // Realtime can drop in the background: catch up when coming back.
    const appState = AppState.addEventListener('change', (s) => s === 'active' && load());
    return () => {
      supabase.removeChannel(channel);
      appState.remove();
    };
  }, [userId, load, merge]);

  const value = useMemo<Chat>(() => {
    const other = (m: MessageRow) => (m.sender === userId ? m.recipient : m.sender);
    const convs = new Map<string, Conversation>();
    for (const m of messages) {
      const id = other(m);
      const c = convs.get(id) ?? { friendId: id, last: m, unread: 0 };
      c.last = m;
      if (m.recipient === userId && !m.read_at) c.unread++;
      convs.set(id, c);
    }
    const conversations = [...convs.values()].sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
    return {
      conversations,
      unreadTotal: conversations.reduce((n, c) => n + c.unread, 0),
      thread: (friendId) => messages.filter((m) => other(m) === friendId),
      send: async (friendId, body) => {
        const text = body.trim();
        if (!text) return;
        const { data, error } = await supabase.from('messages').insert({ recipient: friendId, body: text.slice(0, 1000) }).select().single();
        if (error) throw new Error(errorMessage(error));
        merge([data as MessageRow]);
      },
      markRead: (friendId) => {
        const unread = messages.filter((m) => m.sender === friendId && m.recipient === userId && !m.read_at);
        if (!unread.length) return;
        const at = new Date().toISOString();
        merge(unread.map((m) => ({ ...m, read_at: at })));
        supabase.from('messages').update({ read_at: at }).eq('sender', friendId).eq('recipient', userId!).is('read_at', null).then(() => {});
      },
    };
  }, [messages, userId, merge]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): Chat {
  const chat = useContext(ChatContext);
  if (!chat) throw new Error('useChat must be used inside <ChatProvider>');
  return chat;
}
