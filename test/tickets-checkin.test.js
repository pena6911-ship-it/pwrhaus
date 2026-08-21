import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTicketsCheckinHandler } from '../functions/lib/tickets-checkin.js';

const TICKET = { id: 't1', event_id: 'evt-1', status: 'valid', contact_id: 'c1', ticket_no: '000-0088-00001', tier_sold: 'member' };

function harness({ ticket = TICKET, attendance = null, session = { id: 'u1' } } = {}) {
  const state = { inserted: [], contacts: [], assigned: [] };
  const db = {
    findTicketByQrToken: async (t) => (t === 'good-token' ? ticket : null),
    findTicketByNumber: async (n) => (n === ticket.ticket_no ? ticket : null),
    findAttendanceByTicket: async () => attendance,
    insertAttendance: async (row) => { state.inserted.push(row); return { ...row, attended_at: '2026-08-21T20:00:00Z' }; },
    findContactById: async () => ({ id: 'c1', full_name: 'Jane Smith', email: 'jane@x.com' }),
    assignTicket: async (id, contactId) => { state.assigned.push({ id, contactId }); return { id }; },
  };
  const createContact = async (_deps, input) => { state.contacts.push(input); return { id: 'c-door', ...input }; };
  const handler = makeTicketsCheckinHandler({
    verifySession: async () => session, db, createContact, deps: {},
  });
  return { handler, state };
}

const post = (body, auth = 'Bearer good') => new Request('https://x/api/tickets/checkin', {
  method: 'POST',
  headers: auth ? { 'Content-Type': 'application/json', Authorization: auth } : { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

test('an unauthenticated caller cannot check anyone in', async () => {
  const { handler, state } = harness({ session: null });
  const res = await handler(post({ qr_token: 'good-token', event_id: 'evt-1' }));
  assert.equal(res.status, 401);
  assert.equal(state.inserted.length, 0, 'a photographed QR alone must never write attendance');
});

test('a valid assigned ticket checks in and returns the attendee', async () => {
  const { handler, state } = harness();
  const res = await handler(post({ qr_token: 'good-token', event_id: 'evt-1' }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.attendee_name, 'Jane Smith');
  assert.equal(body.tier_sold, 'member');
  assert.equal(state.inserted.length, 1);
  assert.equal(state.inserted[0].ticket_id, 't1');
});

test('a duplicate scan returns 200 with the original time and writes nothing', async () => {
  const { handler, state } = harness({ attendance: { attended_at: '2026-08-21T19:42:00Z' } });
  const res = await handler(post({ qr_token: 'good-token', event_id: 'evt-1' }));
  assert.equal(res.status, 200, 'a re-presented ticket is not an error');
  const body = await res.json();
  assert.equal(body.code, 'already_checked_in');
  assert.equal(body.attended_at, '2026-08-21T19:42:00Z');
  assert.equal(state.inserted.length, 0);
});

test('an unassigned ticket asks for a name, then checks in with one', async () => {
  const un = { ...TICKET, contact_id: null };
  const ask = harness({ ticket: un });
  const res1 = await ask.handler(post({ qr_token: 'good-token', event_id: 'evt-1' }));
  assert.equal(res1.status, 200, 'needs_attendee is a prompt, not a failure');
  assert.equal((await res1.json()).code, 'needs_attendee');
  assert.equal(ask.state.inserted.length, 0);

  const done = harness({ ticket: un });
  const res2 = await done.handler(post({
    qr_token: 'good-token', event_id: 'evt-1', full_name: 'Door Guest', email: 'door@x.com',
  }));
  assert.equal(res2.status, 200);
  assert.equal(done.state.contacts[0].source, 'event_attendee', 'door captures feed the CRM');
  assert.deepEqual(done.state.assigned[0], { id: 't1', contactId: 'c-door' });
  assert.equal(done.state.inserted[0].contact_id, 'c-door');
});

test('a manually typed ticket number checks in identically to a scan', async () => {
  const { handler, state } = harness();
  const res = await handler(post({ ticket_no: TICKET.ticket_no, event_id: 'evt-1' }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.attendee_name, 'Jane Smith');
  assert.equal(body.tier_sold, 'member');
  assert.equal(state.inserted.length, 1);
  assert.equal(state.inserted[0].ticket_id, 't1');
});

test('a hyphen-free ticket number resolves the same ticket as the hyphenated form', async () => {
  const { handler, state } = harness();
  const stripped = TICKET.ticket_no.replace(/-/g, ''); // '000008800001'
  const res = await handler(post({ ticket_no: stripped, event_id: 'evt-1' }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.ticket_no, TICKET.ticket_no);
  assert.equal(state.inserted.length, 1);
  assert.equal(state.inserted[0].ticket_id, 't1');
});

test('a duplicate-scan race against insertAttendance still returns the 200 already_checked_in shape', async () => {
  const state = { inserted: [] };
  const uniqueViolation = Object.assign(new Error('duplicate key value violates unique constraint "event_attendance_ticket_uniq"'), { code: '23505' });
  const db = {
    findTicketByQrToken: async (t) => (t === 'good-token' ? TICKET : null),
    findTicketByNumber: async () => null,
    // The app-level check races the DB and loses: no attendance row is
    // visible yet when the app checks, so it proceeds to insert.
    findAttendanceByTicket: async () => (state.inserted.length ? { attended_at: '2026-08-21T19:42:00Z' } : null),
    insertAttendance: async (row) => {
      state.inserted.push(row);
      throw uniqueViolation;
    },
    findContactById: async () => ({ id: 'c1', full_name: 'Jane Smith', email: 'jane@x.com' }),
    assignTicket: async () => { throw new Error('should not assign'); },
  };
  const createContact = async () => { throw new Error('should not create a contact'); };
  const handler = makeTicketsCheckinHandler({
    verifySession: async () => ({ id: 'u1' }), db, createContact, deps: {},
  });
  const res = await handler(post({ qr_token: 'good-token', event_id: 'evt-1' }));
  assert.equal(res.status, 200, 'the DB constraint firing is not a user-visible error');
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, 'already_checked_in');
  assert.equal(body.attended_at, '2026-08-21T19:42:00Z');
});

test('a ticket for another event is refused', async () => {
  const { handler, state } = harness();
  const res = await handler(post({ qr_token: 'good-token', event_id: 'evt-other' }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'wrong_event');
  assert.equal(state.inserted.length, 0);
});

test('an unknown token is refused', async () => {
  const { handler } = harness();
  const res = await handler(post({ qr_token: 'nope', event_id: 'evt-1' }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'unknown_ticket');
});

test('the response carries no order or payment data', async () => {
  const { handler } = harness();
  const body = await (await handler(post({ qr_token: 'good-token', event_id: 'evt-1' }))).json();
  assert.deepEqual(Object.keys(body).sort(), ['attendee_name', 'code', 'ok', 'ticket_no', 'tier_sold']);
});

test('rejects a non-POST', async () => {
  const { handler } = harness();
  assert.equal((await handler(new Request('https://x/api/tickets/checkin', { method: 'GET' }))).status, 405);
});
