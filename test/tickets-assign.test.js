import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTicketsAssignHandler } from '../functions/lib/tickets-assign.js';

function harness({ now } = {}) {
  const state = { assigned: [], contacts: [], emails: [] };
  const db = {
    findOrderByManageToken: async (t) => (t === 'good' ? { id: 'ord-1', event_id: 'evt-1' } : null),
    findEventById: async () => ({ id: 'evt-1', name: 'August Scramble', starts_at: '2027-01-05T15:30:00-05:00', venue: 'Plantation Preserve', city: 'Plantation' }),
    listTicketsByOrder: async () => ([
      { id: 't1', ticket_no: '000-0088-00001', tier_sold: 'member', contact_id: 'c1' },
      { id: 't2', ticket_no: '000-0088-00002', tier_sold: 'member', contact_id: null },
    ]),
    findContactById: async () => ({ id: 'c1', full_name: 'Jane Buyer', email: 'buyer@x.com' }),
    assignTicket: async (id, contactId) => { state.assigned.push({ id, contactId }); return { id, contact_id: contactId }; },
  };
  const createContact = async (_deps, input) => { state.contacts.push(input); return { id: 'c-new', ...input }; };
  const email = { enabled: true, sendAttendeeTicket: async (t) => { state.emails.push(t); return { id: 'e' }; } };
  return { handler: makeTicketsAssignHandler({ db, createContact, deps: {}, email, now: now || (() => Date.parse('2026-01-01T00:00:00Z')) }), state };
}

test('a bad token reveals nothing', async () => {
  const { handler } = harness();
  const res = await handler(new Request('https://x/api/tickets/assign?token=bad'));
  assert.equal(res.status, 404);
});

test('a good token lists the order tickets', async () => {
  const { handler } = harness();
  const res = await handler(new Request('https://x/api/tickets/assign?token=good'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.tickets.length, 2);
  assert.equal(body.tickets[1].attendee, null, 'unassigned seat has no attendee');
});

test('assigning creates the contact, assigns the seat and emails the attendee', async () => {
  const { handler, state } = harness();
  const res = await handler(new Request('https://x/api/tickets/assign', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'good', ticket_id: 't2', full_name: 'Guest One', email: 'guest@x.com' }),
  }));
  assert.equal(res.status, 200);
  assert.equal(state.contacts[0].email, 'guest@x.com');
  assert.equal(state.contacts[0].source, 'event_attendee', 'attendees are CRM contacts');
  assert.deepEqual(state.assigned[0], { id: 't2', contactId: 'c-new' });
  assert.equal(state.emails[0].to, 'guest@x.com');
});

test('assignment refuses a ticket outside the token order', async () => {
  const { handler } = harness();
  const res = await handler(new Request('https://x/api/tickets/assign', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'good', ticket_id: 'not-in-order', full_name: 'X', email: 'x@x.com' }),
  }));
  assert.equal(res.status, 400);
});

// The event in the harness starts 2027-01-05T15:30-05:00, so the deadline is 18:30-05:00.
const AFTER_DEADLINE = () => Date.parse('2027-01-05T18:31:00-05:00');

test('assignment is refused once the deadline has passed', async () => {
  const { handler, state } = harness({ now: AFTER_DEADLINE });
  const res = await handler(new Request('https://x/api/tickets/assign', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'good', ticket_id: 't2', full_name: 'Late Guest', email: 'late@x.com' }),
  }));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'assignment_closed');
  assert.equal(state.assigned.length, 0, 'no seat may be assigned after the deadline');
  assert.equal(state.contacts.length, 0, 'and no contact should be created');
});

test('reassignment of an already-named seat is refused after the deadline too', async () => {
  // t1 is already assigned to c1 — a leaked link must not rewrite the roster.
  const { handler, state } = harness({ now: AFTER_DEADLINE });
  const res = await handler(new Request('https://x/api/tickets/assign', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'good', ticket_id: 't1', full_name: 'Swapped In', email: 'swap@x.com' }),
  }));
  assert.equal(res.status, 409);
  assert.equal(state.assigned.length, 0);
});

test('the listing reports the deadline and whether the roster is still open', async () => {
  const open = await (harness().handler)(new Request('https://x/api/tickets/assign?token=good'));
  const openBody = await open.json();
  assert.equal(openBody.assignment_open, true);
  assert.equal(openBody.assignment_deadline, Date.parse('2027-01-05T18:30:00-05:00'));

  const closed = await (harness({ now: AFTER_DEADLINE }).handler)(new Request('https://x/api/tickets/assign?token=good'));
  assert.equal((await closed.json()).assignment_open, false);
});
