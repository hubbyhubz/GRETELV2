import { supabase } from './supabaseClient';

export type AssistantInboxMessageRow = {
  id: string;
  user_id: string;
  sender: string;
  title: string | null;
  content: string;
  preview: string | null;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  metadata: any;
};

export async function fetchAssistantInboxMessages(userId: string) {
  const { data, error } = await supabase
    .from('assistant_inbox_messages')
    .select('*')
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .order('sent_at', { ascending: true })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as AssistantInboxMessageRow[];
}

export async function markAssistantInboxDelivered(messageId: string) {
  const { error } = await supabase
    .from('assistant_inbox_messages')
    .update({ delivered_at: new Date().toISOString() })
    .eq('id', messageId)
    .is('delivered_at', null);
  if (error) throw error;
}

export async function markAssistantInboxRead(messageId: string) {
  const { error } = await supabase
    .from('assistant_inbox_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', messageId)
    .is('read_at', null);
  if (error) throw error;
}

export async function dismissAssistantInboxMessage(messageId: string) {
  const { error } = await supabase
    .from('assistant_inbox_messages')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', messageId)
    .is('dismissed_at', null);
  if (error) throw error;
}

export async function createAssistantInboxMessage(input: {
  userId: string;
  title?: string;
  content: string;
  preview?: string;
  metadata?: any;
}) {
  const { data, error } = await supabase
    .from('assistant_inbox_messages')
    .insert({
      user_id: input.userId,
      sender: 'assistant',
      title: input.title ?? null,
      content: input.content,
      preview: input.preview ?? null,
      metadata: input.metadata ?? {},
      sent_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as AssistantInboxMessageRow;
}

export function subscribeAssistantInbox(
  userId: string,
  handlers: {
    onInsert: (row: AssistantInboxMessageRow) => void;
    onUpdate?: (row: AssistantInboxMessageRow) => void;
  }
) {
  const channel = supabase
    .channel(`assistant-inbox:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'assistant_inbox_messages', filter: `user_id=eq.${userId}` },
      (payload) => handlers.onInsert(payload.new as AssistantInboxMessageRow)
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'assistant_inbox_messages', filter: `user_id=eq.${userId}` },
      (payload) => handlers.onUpdate?.(payload.new as AssistantInboxMessageRow)
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

