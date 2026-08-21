import { createClient } from '@supabase/supabase-js';

export function createSupabaseDb(env) {
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const one = async (q) => { const { data, error } = await q; if (error) throw error; return data; };
  const maybe = async (q) => { const { data, error } = await q.maybeSingle(); if (error) throw error; return data ?? null; };

  return {
    findContactByEmail: (email) => maybe(sb.from('contacts').select('*').eq('email', email)),
    findContactsMissingGhlId: ({ limit }) => one(
      sb
        .from('contacts')
        .select('id,email,full_name,phone,tier,source,ghl_contact_id,created_at')
        .is('ghl_contact_id', null)
        .order('created_at', { ascending: true })
        .limit(limit)
    ),
    insertContact: (input) => one(sb.from('contacts').insert(input).select().single()),
    setContactGhlId: (id, ghlId) => one(sb.from('contacts').update({ ghl_contact_id: ghlId }).eq('id', id).select().single()),
    insertContactInquiry: (input) => one(sb.from('contact_inquiries').insert(input).select().single()),
    findOrderByIdempotencyKey: (key) => maybe(sb.from('orders').select('*').eq('idempotency_key', key)),
    insertOrder: (input) => one(sb.from('orders').insert(input).select().single()),
    findOrderByPaymentIntent: (pi) => maybe(sb.from('orders').select('*').eq('stripe_payment_intent_id', pi)),
    findOrderEventByStripeEventId: (evtId) => maybe(sb.from('order_events').select('*').eq('stripe_event_id', evtId)),
    insertOrderEvent: (input) => one(sb.from('order_events').insert(input).select().single()),
    findEventBySlug: (slug) => maybe(sb.from('events').select('*').eq('slug', slug)),
    findEventById: (id) => maybe(sb.from('events').select('*').eq('id', id)),
    // Events that still have at least one valid ticket — the sweep's candidates.
    listEventsWithValidTickets: async () => {
      const { data, error } = await sb.from('tickets').select('event_id,events(id,starts_at)').eq('status', 'valid');
      if (error) throw error;
      const byId = new Map();
      for (const row of data ?? []) {
        if (row.events && !byId.has(row.events.id)) byId.set(row.events.id, row.events);
      }
      return [...byId.values()];
    },
    expireTicketsForEvent: async (eventId) => {
      const { data, error } = await sb.from('tickets').update({ status: 'expired' })
        .eq('event_id', eventId).eq('status', 'valid').select('id');
      if (error) throw error;
      return (data ?? []).length;
    },
    findContactById: (id) => maybe(sb.from('contacts').select('*').eq('id', id)),
    countIssuedTickets: async (eventId) => {
      const { count, error } = await sb.from('tickets').select('*', { count: 'exact', head: true })
        .eq('event_id', eventId).eq('status', 'valid');
      if (error) throw error;
      return count ?? 0;
    },
    insertTickets: (rows) => one(sb.from('tickets').insert(rows).select()),
    findOrderByManageToken: (token) => maybe(sb.from('orders').select('*').eq('manage_token', token)),
    findOrderByStripeSession: (sessionId) => maybe(sb.from('orders').select('*').eq('stripe_session_id', sessionId)),
    listTicketsByOrder: (orderId) => one(sb.from('tickets').select('*').eq('order_id', orderId).order('ticket_no')),
    assignTicket: (ticketId, contactId) => one(
      sb.from('tickets').update({ contact_id: contactId, assigned_at: new Date().toISOString() }).eq('id', ticketId).select().single()
    ),
    // Draws from a real Postgres sequence via RPC — PostgREST cannot call
    // nextval() directly. A count-based approximation is racy under
    // concurrent webhooks and off-by-one against the row it just inserted.
    nextOrderSeq: async () => {
      const { data, error } = await sb.rpc('next_event_order_seq');
      if (error) throw error;
      return Number(data);
    },
    findTicketByQrToken: (token) => maybe(sb.from('tickets').select('*').eq('qr_token', token)),
    findTicketByNumber: (no) => maybe(sb.from('tickets').select('*').eq('ticket_no', no)),
    findAttendanceByTicket: (ticketId) => maybe(sb.from('event_attendance').select('*').eq('ticket_id', ticketId)),
    insertAttendance: (row) => one(sb.from('event_attendance').insert(row).select().single()),
    listAttendanceByEvent: (eventId) => one(
      sb.from('event_attendance').select('ticket_id,contact_id,attended_at').eq('event_id', eventId)
    ),
  };
}
