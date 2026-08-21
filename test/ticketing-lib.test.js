import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMemberTier, priceForTier, salesOpen, remainingCapacity, computeOrder, ticketNumber, randomToken, assignmentDeadline, assignmentOpen } from '../functions/lib/ticketing.js';

const EVENT = {
  price_cents: 7500, member_price_cents: 6500, nonmember_price_cents: 7500,
  capacity: 24, tickets_enabled: true,
  sales_end_at: '2026-12-30T23:59:00-05:00', starts_at: '2027-01-05T15:30:00-05:00',
};
const NOW = Date.parse('2026-08-20T12:00:00Z');

test('isMemberTier recognises the paying tiers only', () => {
  assert.equal(isMemberTier('member'), true);
  assert.equal(isMemberTier('inner_circle'), true);
  assert.equal(isMemberTier('free'), false);
  assert.equal(isMemberTier(undefined), false);
});

test('priceForTier uses the member rate only for members', () => {
  assert.equal(priceForTier(EVENT, 'member'), 6500);
  assert.equal(priceForTier(EVENT, 'inner_circle'), 6500);
  assert.equal(priceForTier(EVENT, 'free'), 7500);
  // Falls back to price_cents when no explicit non-member price is set.
  assert.equal(priceForTier({ price_cents: 5000 }, 'free'), 5000);
  // A member price that is not set must not silently discount.
  assert.equal(priceForTier({ price_cents: 5000 }, 'member'), 5000);
});

test('salesOpen enforces the enable flag, the deadline and the event date', () => {
  assert.deepEqual(salesOpen(EVENT, NOW), { open: true, reason: null });
  assert.deepEqual(salesOpen({ ...EVENT, tickets_enabled: false }, NOW), { open: false, reason: 'tickets_disabled' });
  const past = Date.parse('2027-01-01T00:00:00Z');
  assert.equal(salesOpen(EVENT, past).reason, 'sales_closed');
  const afterEvent = Date.parse('2027-02-01T00:00:00Z');
  assert.equal(salesOpen({ ...EVENT, sales_end_at: null }, afterEvent).reason, 'event_passed');
});

test('remainingCapacity never goes negative', () => {
  assert.equal(remainingCapacity(EVENT, 0), 24);
  assert.equal(remainingCapacity(EVENT, 20), 4);
  assert.equal(remainingCapacity(EVENT, 30), 0);
});

test('computeOrder prices, validates and totals', () => {
  const ok = computeOrder({ event: EVENT, tier: 'member', quantity: 2, issuedCount: 0, nowMs: NOW });
  assert.equal(ok.ok, true);
  assert.equal(ok.tierSold, 'member');
  assert.equal(ok.unitCents, 6500);
  assert.equal(ok.totalCents, 13000);

  assert.equal(computeOrder({ event: EVENT, tier: 'free', quantity: 0, issuedCount: 0, nowMs: NOW }).error, 'bad_quantity');
  assert.equal(computeOrder({ event: EVENT, tier: 'free', quantity: 11, issuedCount: 0, nowMs: NOW }).error, 'bad_quantity');
  assert.equal(computeOrder({ event: EVENT, tier: 'free', quantity: 3, issuedCount: 23, nowMs: NOW }).error, 'insufficient_capacity');
  assert.equal(computeOrder({ event: { ...EVENT, tickets_enabled: false }, tier: 'free', quantity: 1, issuedCount: 0, nowMs: NOW }).error, 'tickets_disabled');
  // Non-members are charged the non-member rate even if they claim otherwise.
  assert.equal(computeOrder({ event: EVENT, tier: 'free', quantity: 1, issuedCount: 0, nowMs: NOW }).unitCents, 7500);
});

test('ticketNumber is stable and zero padded; randomToken is unguessable', () => {
  assert.equal(ticketNumber(88, 1), '000-0088-00001');
  assert.equal(ticketNumber(1, 12), '000-0001-00012');
  const a = randomToken(), b = randomToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 32, 'token must be long enough to resist guessing');
  assert.match(a, /^[A-Za-z0-9_-]+$/, 'token must be URL-safe');
});

test('assignmentDeadline is three hours after the event starts', () => {
  const ev = { starts_at: '2026-08-21T15:30:00-04:00' };
  assert.equal(assignmentDeadline(ev), Date.parse('2026-08-21T18:30:00-04:00'));
  assert.equal(assignmentDeadline({}), null, 'no start time means no deadline to enforce');
});

test('assignmentOpen closes at the deadline and stays closed', () => {
  const ev = { starts_at: '2026-08-21T15:30:00-04:00' };
  const before = Date.parse('2026-08-21T15:00:00-04:00');
  const during = Date.parse('2026-08-21T17:00:00-04:00');
  const after  = Date.parse('2026-08-21T18:31:00-04:00');

  assert.deepEqual(assignmentOpen(ev, before), { open: true, reason: null });
  // The roster stays editable during play — the cutoff is 3h after the start.
  assert.deepEqual(assignmentOpen(ev, during), { open: true, reason: null });
  assert.deepEqual(assignmentOpen(ev, after), { open: false, reason: 'assignment_closed' });
  // Exactly at the deadline is closed: the window is up to, not including.
  assert.equal(assignmentOpen(ev, assignmentDeadline(ev)).open, false);
});
