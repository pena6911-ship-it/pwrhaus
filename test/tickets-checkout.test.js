import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTicketsCheckoutHandler } from '../functions/lib/tickets-checkout.js';

const EVENT = {
  id: 'evt-1', slug: 'august-scramble', name: 'August Scramble',
  price_cents: 7500, member_price_cents: 6500, nonmember_price_cents: 7500,
  capacity: 24, tickets_enabled: true,
  sales_end_at: '2026-12-31T23:59:00-05:00', starts_at: '2027-01-05T15:30:00-05:00',
};
const NOW = () => Date.parse('2026-08-20T12:00:00Z');

function harness({ event = EVENT, issued = 0, contact = null } = {}) {
  const created = [];
  const db = {
    findEventBySlug: async () => event,
    countIssuedTickets: async () => issued,
    findContactByEmail: async () => contact,
    insertContact: async (c) => ({ id: 'contact-new', tier: 'free', ...c }),
  };
  const stripe = { checkout: { sessions: { create: async (args) => { created.push(args); return { url: 'https://stripe.test/session' }; } } } };
  const handler = makeTicketsCheckoutHandler({ env: { STRIPE_SECRET_KEY: 'sk_test' }, db, stripe, now: NOW });
  return { handler, created };
}

const post = (body) => new Request('https://x/api/tickets/checkout', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('charges the member rate only for a verified member', async () => {
  const { handler, created } = harness({ contact: { id: 'c1', email: 'm@x.com', tier: 'member' } });
  const res = await handler(post({ slug: 'august-scramble', email: 'm@x.com', full_name: 'M', quantity: 2 }));
  assert.equal(res.status, 200);
  assert.equal(created[0].line_items[0].price_data.unit_amount, 6500);
  assert.equal(created[0].line_items[0].quantity, 2);
  assert.equal(created[0].metadata.tier_sold, 'member');
});

test('a non-member pays the non-member rate even when claiming otherwise', async () => {
  const { handler, created } = harness({ contact: { id: 'c2', email: 'n@x.com', tier: 'free' } });
  const res = await handler(post({ slug: 'august-scramble', email: 'n@x.com', full_name: 'N', quantity: 1, unit_amount: 1, tier: 'member' }));
  assert.equal(res.status, 200);
  assert.equal(created[0].line_items[0].price_data.unit_amount, 7500, 'client-supplied price/tier must be ignored');
});

test('rejects disabled sales, closed sales and insufficient capacity', async () => {
  const off = harness({ event: { ...EVENT, tickets_enabled: false } });
  assert.equal((await off.handler(post({ slug: 's', email: 'a@b.c', full_name: 'A', quantity: 1 }))).status, 400);

  const full = harness({ issued: 24 });
  const res = await full.handler(post({ slug: 's', email: 'a@b.c', full_name: 'A', quantity: 1 }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'insufficient_capacity');
});

test('rejects a non-POST and a missing email', async () => {
  const { handler } = harness();
  assert.equal((await handler(new Request('https://x/api/tickets/checkout'))).status, 405);
  assert.equal((await handler(post({ slug: 's', full_name: 'A', quantity: 1 }))).status, 400);
});
