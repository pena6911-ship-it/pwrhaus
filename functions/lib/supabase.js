import { createClient } from '@supabase/supabase-js';

export function createSupabaseDb(env) {
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const one = async (q) => { const { data, error } = await q; if (error) throw error; return data; };
  const maybe = async (q) => { const { data, error } = await q.maybeSingle(); if (error) throw error; return data ?? null; };

  return {
    findContactByEmail: (email) => maybe(sb.from('contacts').select('*').eq('email', email)),
    insertContact: (input) => one(sb.from('contacts').insert(input).select().single()),
    setContactGhlId: (id, ghlId) => one(sb.from('contacts').update({ ghl_contact_id: ghlId }).eq('id', id).select().single()),
    findOrderByIdempotencyKey: (key) => maybe(sb.from('orders').select('*').eq('idempotency_key', key)),
    insertOrder: (input) => one(sb.from('orders').insert(input).select().single()),
    findOrderByPaymentIntent: (pi) => maybe(sb.from('orders').select('*').eq('stripe_payment_intent_id', pi)),
    findOrderEventByStripeEventId: (evtId) => maybe(sb.from('order_events').select('*').eq('stripe_event_id', evtId)),
    insertOrderEvent: (input) => one(sb.from('order_events').insert(input).select().single()),
  };
}
