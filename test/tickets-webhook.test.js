import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTicketsWebhookHandler } from '../functions/lib/tickets-webhook.js';

const SESSION = {
  id: 'cs_1', amount_total: 13000, payment_intent: 'pi_1', customer_email: 'buyer@x.com',
  metadata: { event_id: 'evt-1', contact_id: 'c1', quantity: '2', tier_sold: 'member', unit_cents: '6500', idempotency_key: 'event:evt-1:c1:zz' },
};
function harness({ issued = 0, seenEvent = null, capacity = 24, session = {}, insertTicketsImpl = null } = {}) {
  const state = { orders: [], tickets: [], events: [], emails: [] };
  const mergedSession = { ...SESSION, ...session, metadata: { ...SESSION.metadata, ...(session.metadata || {}) } };
  const evt = { id: 'evt_stripe_1', type: 'checkout.session.completed', data: { object: mergedSession } };
  const db = {
    findOrderEventByStripeEventId: async () => seenEvent,
    insertOrderEvent: async (r) => { state.events.push(r); return r; },
    findEventById: async () => ({ id: 'evt-1', name: 'August Scramble', capacity, starts_at: '2027-01-05T15:30:00-05:00', venue: 'Plantation Preserve', city: 'Plantation', slug: 'august-scramble' }),
    countIssuedTickets: async () => issued,
    nextOrderSeq: async () => 88,
    insertOrder: async (o) => { const row = { id: 'ord-1', ...o }; state.orders.push(row); return row; },
    insertTickets: insertTicketsImpl || (async (rows) => { state.tickets.push(...rows); return rows; }),
    findContactById: async () => ({ id: 'c1', email: 'buyer@x.com', full_name: 'Jane Buyer' }),
  };
  const email = { enabled: true, sendOrderConfirmation: async (o) => { state.emails.push(o); return { id: 'e1' }; } };
  const handler = makeTicketsWebhookHandler({ env: {}, verify: async () => evt, db, email });
  return { handler, state };
}

const post = () => new Request('https://x/api/tickets/webhook', { method: 'POST', headers: { 'stripe-signature': 'sig' }, body: '{}' });

test('rejects an invalid signature and issues nothing', async () => {
  let issuedAny = false;
  const handler = makeTicketsWebhookHandler({
    env: {}, verify: async () => { throw new Error('bad'); },
    db: { insertTickets: async () => { issuedAny = true; } }, email: { enabled: false },
  });
  const res = await handler(post());
  assert.equal(res.status, 400);
  assert.equal(issuedAny, false);
});

test('issues one ticket per seat and auto-assigns the buyer their own', async () => {
  const { handler, state } = harness();
  const res = await handler(post());
  assert.equal(res.status, 200);
  assert.equal(state.orders.length, 1);
  assert.equal(state.orders[0].type, 'event');
  assert.equal(state.orders[0].current_status, 'paid');
  assert.ok(state.orders[0].manage_token, 'the assign link needs a token');
  assert.equal(state.orders[0].event_id, 'evt-1', 'orders.event_id must be written — tickets-assign reads it back');
  assert.equal(state.orders[0].stripe_session_id, 'cs_1', 'the Checkout Session id lets the thanks page resolve the order');

  assert.equal(state.tickets.length, 2, 'one ticket per seat');
  assert.equal(state.tickets[0].contact_id, 'c1', "buyer's own seat is assigned");
  assert.equal(state.tickets[1].contact_id, null, 'guest seats stay unassigned');
  assert.equal(state.tickets[0].tier_sold, 'member');
  assert.match(state.tickets[0].ticket_no, /^000-0088-00001$/);
  assert.notEqual(state.tickets[0].qr_token, state.tickets[1].qr_token);
  assert.equal(state.emails.length, 1);

  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].event_type, 'paid', 'must be a legal order_events.event_type value');
  assert.equal(state.events[0].type, undefined, 'order_events has no "type" column');
});

test('a replayed Stripe event issues nothing further', async () => {
  const { handler, state } = harness({ seenEvent: { stripe_event_id: 'evt_stripe_1' } });
  const res = await handler(post());
  assert.equal(res.status, 200);
  assert.equal(state.tickets.length, 0, 'idempotent: no double issuance');
  assert.equal(state.orders.length, 0);
});

test('over-capacity flags for attention rather than overselling', async () => {
  const { handler, state } = harness({ issued: 23 }); // 23 issued + 2 wanted > 24
  const res = await handler(post());
  assert.equal(res.status, 200);
  assert.equal(state.tickets.length, 0, 'must not oversell');
  assert.equal(state.orders[0].current_status, 'needs_attention');

  assert.equal(state.events.length, 1, 'the flagged order is still recorded as an order_event');
  assert.equal(state.events[0].event_type, 'paid', 'must be a legal order_events.event_type value');
  assert.equal(state.events[0].type, undefined, 'order_events has no "type" column');
});

test('a session that has not actually settled issues no tickets and creates no order', async () => {
  const { handler, state } = harness({ session: { payment_status: 'unpaid' } });
  const res = await handler(post());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.pending, 'unpaid');
  assert.equal(state.tickets.length, 0, 'an unsettled session must not issue tickets');
  assert.equal(state.orders.length, 0, 'an unsettled session must not even create an order');
  assert.equal(state.events.length, 0, 'no idempotency marker for a session that never paid');
});

test('a session missing payment_status still issues tickets (legacy/fixture fallback)', async () => {
  const { handler, state } = harness();
  const res = await handler(post());
  assert.equal(res.status, 200);
  assert.equal(state.tickets.length, 2, 'payment_status absent must not block the paid path');
});

test('paying less than the quoted total is flagged rather than trusted', async () => {
  // quantity 2 * unit_cents 6500 = 13000 expected; buyer only actually paid 5000.
  const { handler, state } = harness({ session: { amount_total: 5000 } });
  const res = await handler(post());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.needs_attention, 'underpaid');
  assert.equal(state.tickets.length, 0, 'an underpaid order must not issue tickets');
  assert.equal(state.orders[0].current_status, 'needs_attention');
  assert.equal(state.orders[0].amount_cents, 5000, 'the order records what was actually paid, not what was quoted');

  assert.equal(state.events.length, 1, 'the flagged order is still recorded as an order_event so a retry does not re-create it');
});

test('paying at least the quoted total is not flagged as underpaid', async () => {
  const { handler, state } = harness({ session: { amount_total: 13000 } });
  const res = await handler(post());
  assert.equal(res.status, 200);
  assert.equal(state.orders[0].current_status, 'paid');
  assert.equal(state.tickets.length, 2);
});

test('the idempotency marker is written only after tickets are safely issued', async () => {
  const { handler, state } = harness({
    insertTicketsImpl: async () => { throw new Error('db unavailable'); },
  });
  await assert.rejects(() => handler(post()));
  assert.equal(state.events.length, 0, 'no marker must exist if ticket issuance failed — a retry has to be able to recover');
});
