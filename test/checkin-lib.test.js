import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkinUrl, checkinOutcome } from '../functions/lib/checkin.js';

const EVENT_ID = 'evt-1';
const ASSIGNED = { id: 't1', event_id: EVENT_ID, status: 'valid', contact_id: 'c1' };
const UNASSIGNED = { id: 't2', event_id: EVENT_ID, status: 'valid', contact_id: null };

test('checkinUrl encodes the token into a scannable URL', () => {
  assert.equal(checkinUrl('https://x', 'abc123'), 'https://x/checkin/?t=abc123');
  assert.equal(checkinUrl('https://x', 'a b/c'), 'https://x/checkin/?t=a%20b%2Fc');
});

test('a valid assigned ticket checks in', () => {
  const out = checkinOutcome({ ticket: ASSIGNED, eventId: EVENT_ID });
  assert.equal(out.ok, true);
  assert.equal(out.code, 'ok');
  assert.equal(out.assignNeeded, false);
});

test('an unknown ticket is refused', () => {
  const out = checkinOutcome({ ticket: null, eventId: EVENT_ID });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'unknown_ticket');
});

test('a ticket for another event is refused', () => {
  const out = checkinOutcome({ ticket: { ...ASSIGNED, event_id: 'evt-other' }, eventId: EVENT_ID });
  assert.equal(out.code, 'wrong_event');
});

test('refunded and expired tickets are refused', () => {
  assert.equal(checkinOutcome({ ticket: { ...ASSIGNED, status: 'refunded' }, eventId: EVENT_ID }).code, 'ticket_refunded');
  assert.equal(checkinOutcome({ ticket: { ...ASSIGNED, status: 'expired' }, eventId: EVENT_ID }).code, 'ticket_expired');
});

test('a second scan reports the original check-in time, not an error', () => {
  const out = checkinOutcome({
    ticket: ASSIGNED, eventId: EVENT_ID,
    existingAttendance: { attended_at: '2026-08-21T19:42:00Z' },
  });
  assert.equal(out.ok, false, 'nothing further is written');
  assert.equal(out.code, 'already_checked_in');
  assert.equal(out.attended_at, '2026-08-21T19:42:00Z');
});

test('an unassigned ticket asks for a name before it can check in', () => {
  const out = checkinOutcome({ ticket: UNASSIGNED, eventId: EVENT_ID });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'needs_attendee');
});

test('an unassigned ticket with a door-captured name proceeds and flags the assignment', () => {
  const out = checkinOutcome({
    ticket: UNASSIGNED, eventId: EVENT_ID,
    attendee: { full_name: 'Door Guest', email: 'door@x.com' },
  });
  assert.equal(out.ok, true);
  assert.equal(out.assignNeeded, true);
});

test('a duplicate is reported even when a name is supplied', () => {
  const out = checkinOutcome({
    ticket: UNASSIGNED, eventId: EVENT_ID,
    attendee: { full_name: 'Door Guest', email: 'door@x.com' },
    existingAttendance: { attended_at: '2026-08-21T19:00:00Z' },
  });
  assert.equal(out.code, 'already_checked_in');
});
