import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTicketsWebhookHandler } from '../functions/lib/tickets-webhook.js';

const SESSION = {
  id: 'cs_1', amount_total: 13000, payment_intent: 'pi_1', customer_email: 'buyer@x.com',
  metadata: { event_id: 'evt-1', contact_id: 'c1', quantity: '2', tier_sold: 'member', unit_cents: '6500', idempotency_key: 'event:evt-1:c1:zz' },
};
const EVT = { id: 'evt_stripe_1', type: 'checkout.session.completed', data: { object: SESSION } };

function harness({ issued = 0, seenEvent = null, capacity = 24 } = {}) {
  const state = { orders: [], tickets: [], events: [], emails: [] };
  const db = {
    findOrderEventByStripeEventId: async () => seenEvent,
    insertOrderEvent: async (r) => { state.events.push(r); return r; },
    findEventById: async () => ({ id: 'evt-1', name: 'August Scramble', capacity, starts_at: '2027-01-05T15:30:00-05:00', venue: 'Plantation Preserve', city: 'Plantation', slug: 'august-scramble' }),
    countIssuedTickets: async () => issued,
    nextOrderSeq: async () => 88,
    insertOrder: async (o) => { const row = { id: 'ord-1', ...o }; state.orders.push(row); return row; },
    insertTickets: async (rows) => { state.tickets.push(...rows); return rows; },
    findContactById: async () => ({ id: 'c1', email: 'buyer@x.com', full_name: 'Jane Buyer' }),
  };
  const email = { enabled: true, sendOrderConfirmation: async (o) => { state.emails.push(o); return { id: 'e1' }; } };
  const handler = makeTicketsWebhookHandler({ env: {}, verify: async () => EVT, db, email });
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
