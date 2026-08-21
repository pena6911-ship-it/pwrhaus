import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTicketExpirySweep } from '../functions/lib/ticket-expiry.js';

const PAST = { id: 'evt-past', starts_at: '2026-08-21T15:30:00-04:00' };   // deadline 18:30
const FUTURE = { id: 'evt-future', starts_at: '2027-06-01T10:00:00-04:00' };

function harness({ events, now }) {
  const state = { expired: [] };
  const db = {
    listEventsWithValidTickets: async () => events,
    expireTicketsForEvent: async (id) => { state.expired.push(id); return 2; },
  };
  return { sweep: makeTicketExpirySweep({ db, now }), state };
}

test('expires tickets for events past the three-hour deadline', async () => {
  const now = () => Date.parse('2026-08-21T18:31:00-04:00');
  const { sweep, state } = harness({ events: [PAST], now });
  const out = await sweep();
  assert.deepEqual(state.expired, ['evt-past']);
  assert.equal(out.tickets_expired, 2);
});

test('leaves events that have not reached the deadline alone', async () => {
  const now = () => Date.parse('2026-08-21T17:00:00-04:00'); // during play, before +3h
  const { sweep, state } = harness({ events: [PAST, FUTURE], now });
  const out = await sweep();
  assert.deepEqual(state.expired, [], 'no event is past its deadline yet');
  assert.equal(out.events_swept, 0);
});

test('sweeps only the due events when both kinds are present', async () => {
  const now = () => Date.parse('2026-12-01T00:00:00Z');
  const { sweep, state } = harness({ events: [PAST, FUTURE], now });
  await sweep();
  assert.deepEqual(state.expired, ['evt-past'], 'the future event keeps its valid tickets');
});

test('an event with no start time is never swept', async () => {
  const now = () => Date.parse('2030-01-01T00:00:00Z');
  const { sweep, state } = harness({ events: [{ id: 'evt-nodate' }], now });
  const out = await sweep();
  assert.deepEqual(state.expired, []);
  assert.equal(out.events_swept, 0);
});
