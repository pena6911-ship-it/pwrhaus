import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTicketsAssignHandler } from '../functions/lib/tickets-assign.js';

function harness() {
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
  return { handler: makeTicketsAssignHandler({ db, createContact, deps: {}, email }), state };
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
