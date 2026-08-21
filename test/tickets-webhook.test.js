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
    findOrderByIdempotencyKey: async () => null,
    insertOrder: async (o) => { const row = { id: 'ord-1', ...o }; state.orders.push(row); return row; },
    listTicketsByOrder: async () => [],
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

// orders.idempotency_key is unique, and m.idempotency_key is identical on
// every Stripe retry of the same checkout session. A mock db that mirrors
// that constraint (rather than the shared harness's plain-array insertOrder,
// which enforces nothing) is required to actually exercise the bug: without
// it, insertOrder would happily accept a second row with the same key and
// the defect would never surface.
function strictHarness() {
  const state = { orders: [], tickets: [], events: [], emails: [] };
  const evt = { id: 'evt_stripe_retry', type: 'checkout.session.completed', data: { object: SESSION } };
  const db = {
    findOrderEventByStripeEventId: async (id) => state.events.find((e) => e.stripe_event_id === id) || null,
    insertOrderEvent: async (r) => { state.events.push(r); return r; },
    findEventById: async () => ({ id: 'evt-1', name: 'August Scramble', capacity: 24, starts_at: '2027-01-05T15:30:00-05:00', venue: 'Plantation Preserve', city: 'Plantation', slug: 'august-scramble' }),
    countIssuedTickets: async () => state.tickets.length,
    nextOrderSeq: async () => 88,
    findOrderByIdempotencyKey: async (key) => state.orders.find((o) => o.idempotency_key === key) || null,
    insertOrder: async (o) => {
      if (state.orders.some((existing) => existing.idempotency_key === o.idempotency_key)) {
        const err = new Error('duplicate key value violates unique constraint "orders_idempotency_key_key"');
        err.code = '23505';
        throw err;
      }
      const row = { id: 'ord-1', ...o };
      state.orders.push(row);
      return row;
    },
    listTicketsByOrder: async (orderId) => state.tickets.filter((t) => t.order_id === orderId),
    findContactById: async () => ({ id: 'c1', email: 'buyer@x.com', full_name: 'Jane Buyer' }),
  };
  const email = { enabled: true, sendOrderConfirmation: async (o) => { state.emails.push(o); return { id: 'e1' }; } };
  return { state, db, evt, email };
}

test('a Stripe retry after a mid-failure recovers the paid order instead of dying on a duplicate key', async () => {
  const { state, db, evt, email } = strictHarness();
  let insertTicketsCalls = 0;
  db.insertTickets = async (rows) => {
    insertTicketsCalls += 1;
    if (insertTicketsCalls === 1) throw new Error('db unavailable mid-insert');
    state.tickets.push(...rows);
    return rows;
  };
  const handler = makeTicketsWebhookHandler({ env: {}, verify: async () => evt, db, email });

  // Attempt 1: the order is inserted, then insertTickets throws before the
  // marker is written. Stripe will redeliver the same event.
  await assert.rejects(() => handler(post()));
  assert.equal(state.orders.length, 1, 'the order row exists after attempt 1');
  assert.equal(state.tickets.length, 0, 'no tickets were issued on the failed attempt');
  assert.equal(state.events.length, 0, 'no marker — a retry has to be able to recover');

  // Attempt 2: same Stripe event, same idempotency_key. Against the old
  // bare-insert code this throws the mock's 23505 and the handler rejects,
  // permanently — the customer stays paid with zero tickets forever.
  const res = await handler(post());
  assert.equal(res.status, 200, 'the retry must recover, not throw a duplicate-key error');
  assert.equal(state.orders.length, 1, 'no duplicate order row was inserted');
  assert.equal(state.tickets.length, 2, 'the retry issues the tickets exactly once');
  assert.equal(state.events.length, 1, 'the marker is recorded once recovery succeeds');
  assert.equal(state.emails.length, 1, 'the confirmation email still goes out on recovery');
});

test('a retry after tickets were issued but the marker write failed does not double-issue seats', async () => {
  const { state, db, evt, email } = strictHarness();
  db.insertTickets = async (rows) => { state.tickets.push(...rows); return rows; };
  let markerCalls = 0;
  db.insertOrderEvent = async (r) => {
    markerCalls += 1;
    if (markerCalls === 1) throw new Error('db unavailable mid-marker-write');
    state.events.push(r);
    return r;
  };
  const handler = makeTicketsWebhookHandler({ env: {}, verify: async () => evt, db, email });

  // Attempt 1: tickets are issued, but the marker write itself blips. The
  // "seen" event guard at the top of the handler can't catch a retry of
  // this, because no marker was ever recorded.
  await assert.rejects(() => handler(post()));
  assert.equal(state.tickets.length, 2, 'tickets were issued on attempt 1');
  assert.equal(state.events.length, 0, 'the marker never landed');

  // Attempt 2 resolves the same order and must reuse the already-issued
  // tickets rather than issuing a second set for it.
  const res = await handler(post());
  assert.equal(res.status, 200);
  assert.equal(state.tickets.length, 2, 'the retry must not issue a second set of tickets for the same order');
  assert.equal(state.events.length, 1, 'the marker is written once recovery completes');
});
