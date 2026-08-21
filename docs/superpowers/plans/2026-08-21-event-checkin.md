# Event Check-in & QR Tickets (Phase 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each ticket as a scannable QR and give Michelle a phone-first Check-in view in her dashboard that records attendance — naming unassigned tickets at the door, tolerating poor signal, and never double-counting.

**Architecture:** A vendored QR generator renders `qr_token` as inline SVG encoding a `/checkin/?t=…` URL. A new `/api/tickets/checkin` handler (injected-dependency factory + thin Netlify wrapper, mirroring `publish.js` for session verification) validates the ticket and writes `event_attendance`. A dashboard Check-in view scans via `BarcodeDetector` with manual entry as an equal path, queueing failed scans locally for retry.

**Tech Stack:** Netlify Functions v2, Supabase (service-role writes, session-verified auth), vanilla-JS dashboard, `node --test`.

## Global Constraints

- **Branch:** work on the feature branch the controller creates from `main`. Commit locally, **never push**. Stage explicit paths only (never `git add -A`).
- **Shell is Windows PowerShell 5.1** — no `&&`; use `;` or separate lines. Bash tool available.
- **`npm test` MUST stay green** at every task boundary (baseline: **189 tests**). No build step.
- **One new dev dependency is authorized: a QR generator**, vendored as a committed file (the `src/admin/vendor/supabase.js` precedent). **No runtime CDN**, and never a hosted QR *image* service — that would leak every ticket token to a third party. No other new dependencies.
- **The QR is never the credential.** The token identifies a ticket; only a verified Supabase session authorizes a check-in write. Session verification mirrors `functions/publish.js` (`sb.auth.getUser(token)` with the anon key).
- **QR payload is a URL:** `${origin}/checkin/?t=<qr_token>` — never a bare token.
- **`event_attendance.contact_id` stays `not null`** — unassigned tickets are named at the door.
- **A duplicate scan returns HTTP 200** with the original `attended_at`, not an error.
- **Attendance is additive** — check-in never mutates `tickets.status`, and attendance is not cleared by ticket expiry.
- **Manual ticket-number entry is a first-class path, not a fallback** — `BarcodeDetector` does not exist in iOS Safari, so the Check-in view must be fully usable with no camera.
- **Design system:** dashboard UI uses `src/admin/admin.css` tokens; public pages follow `src/css/tokens.css` (FINAL values) — mobile-first (min-width only), no `box-shadow` in `main.css`, 44px touch targets, non-empty `alt` on every `<img>`, one `<h1>` per public page, F&Co footer credit.
- **Out of scope:** shareable per-event scanner links, full offline-first with pre-loaded rosters, undo/manual attendance removal, badge printing.

---

## File Structure

**Create**
- `supabase/migrations/0009_event_checkin.sql` — unique constraint, index, authenticated read policy.
- `src/js/vendor/qrcode.js` — vendored QR generator (committed).
- `functions/lib/checkin.js` — pure validation: `checkinOutcome({ ticket, eventId, existingAttendance, attendee })`.
- `functions/lib/tickets-checkin.js` — `makeTicketsCheckinHandler({ verifySession, db, createContact, deps })`.
- `functions/tickets-checkin.js` — Netlify wrapper, path `/api/tickets/checkin`.
- `src/checkin.njk` — the public landing page a stray camera scan reaches.
- `src/js/ticket-qr.js` — renders the QR on the ticket view.
- `test/checkin-lib.test.js`, `test/tickets-checkin.test.js`, `test/checkin-schema.test.js`.

**Modify**
- `functions/lib/supabase.js` — check-in queries.
- `src/tickets/manage.njk`, `src/js/tickets-manage.js` — show each assigned ticket's QR.
- `src/admin/index.html`, `src/admin/app.js`, `src/admin/admin.css` — the Check-in view.
- `src/css/main.css` — ticket/QR styles.
- `test/build-output.test.js`, `AGENTS.md`, the dashboard handoff doc.

---

## Task 1: Migration `0009_event_checkin.sql`

**Files:** Create `supabase/migrations/0009_event_checkin.sql`; Test `test/checkin-schema.test.js`

**Interfaces:**
- Produces: a unique constraint on `event_attendance.ticket_id` (the DB guarantee behind duplicate-scan handling), an event index, and an authenticated-only `select` policy. Tasks 3–5 depend on these.

- [ ] **Step 1: Write the failing test** — `test/checkin-schema.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/0009_event_checkin.sql', import.meta.url), 'utf8').toLowerCase();

test('0009 makes double check-in impossible at the database level', () => {
  assert.match(sql, /alter table event_attendance add constraint [a-z_]+ unique \(ticket_id\)/);
  assert.match(sql, /drop constraint if exists/, 'must be safe to re-run');
});

test('0009 grants attendance reads to authenticated only', () => {
  assert.match(sql, /create policy[^;]*on event_attendance[^;]*for select[^;]*to authenticated/s);
  assert.doesNotMatch(sql, /to anon/, 'attendance must never be readable by anon');
});

test('0009 indexes attendance by event for the roster', () => {
  assert.match(sql, /create index if not exists [a-z_]+ on event_attendance \(event_id\)/);
});
```

- [ ] **Step 2: Run it, confirm it fails** — `cd C:\dev\pwrhaus; node --test test/checkin-schema.test.js` → FAIL (file missing).

- [ ] **Step 3: Write `supabase/migrations/0009_event_checkin.sql`**

```sql
-- Check-in (Phase 5). Attendance is additive: it never mutates ticket status,
-- and it is deliberately NOT cleared when tickets expire — the record of who
-- was in the room outlives the event.

-- One check-in per ticket, enforced by the database rather than by hope.
alter table event_attendance drop constraint if exists event_attendance_ticket_uniq;
alter table event_attendance add constraint event_attendance_ticket_uniq unique (ticket_id);

create index if not exists event_attendance_event_idx on event_attendance (event_id);

-- Dashboard reads attendance as the owner. Writes stay service-role only.
-- (RLS itself was enabled on this table by 0005_lock_down_pii.sql.)
drop policy if exists event_attendance_admin_read on event_attendance;
create policy event_attendance_admin_read on event_attendance
  for select to authenticated using (true);
```

- [ ] **Step 4: Run, confirm pass** — `node --test test/checkin-schema.test.js` → PASS; then `npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_event_checkin.sql test/checkin-schema.test.js
git commit -m "feat(db): 0009 one check-in per ticket, attendance read policy"
```

---

## Task 2: Pure check-in logic (`functions/lib/checkin.js`)

**Files:** Create `functions/lib/checkin.js`; Test `test/checkin-lib.test.js`

**Interfaces:**
- Produces:
  - `checkinUrl(origin, qrToken) → string` — `${origin}/checkin/?t=${encodeURIComponent(qrToken)}`.
  - `checkinOutcome({ ticket, eventId, existingAttendance, attendee }) → { ok, code, ... }` where `code` is one of `ok` | `unknown_ticket` | `wrong_event` | `ticket_refunded` | `ticket_expired` | `already_checked_in` | `needs_attendee`. For `already_checked_in` it returns `attended_at`; for `ok` it returns `assignNeeded` (true when the seat must be assigned to a door-captured attendee first).
- Task 3 imports both; Task 4 imports `checkinUrl` for the QR payload.

- [ ] **Step 1: Write the failing test** — `test/checkin-lib.test.js`

```js
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
```

- [ ] **Step 2: Run, confirm fail** — `node --test test/checkin-lib.test.js` → FAIL (module missing).

- [ ] **Step 3: Implement `functions/lib/checkin.js`**

```js
// Pure check-in decisions. No database, no network — every branch the scanner
// can hit is decided here so it can be tested exhaustively.

export function checkinUrl(origin, qrToken) {
  return `${origin}/checkin/?t=${encodeURIComponent(qrToken)}`;
}

export function checkinOutcome({ ticket, eventId, existingAttendance = null, attendee = null }) {
  if (!ticket) return { ok: false, code: 'unknown_ticket' };
  if (ticket.event_id !== eventId) return { ok: false, code: 'wrong_event' };

  if (ticket.status === 'refunded') return { ok: false, code: 'ticket_refunded' };
  if (ticket.status === 'expired') return { ok: false, code: 'ticket_expired' };
  if (ticket.status !== 'valid') return { ok: false, code: 'ticket_invalid' };

  // A second scan is normal (someone re-presents a ticket). Report when they
  // arrived rather than erroring — and write nothing further.
  if (existingAttendance) {
    return { ok: false, code: 'already_checked_in', attended_at: existingAttendance.attended_at };
  }

  const hasName = Boolean(attendee?.full_name?.trim() && attendee?.email?.trim());
  if (!ticket.contact_id && !hasName) return { ok: false, code: 'needs_attendee' };

  return { ok: true, code: 'ok', assignNeeded: !ticket.contact_id };
}
```

- [ ] **Step 4: Run, confirm pass** — `node --test test/checkin-lib.test.js` → PASS; `npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add functions/lib/checkin.js test/checkin-lib.test.js
git commit -m "feat(checkin): pure validation for every scan outcome"
```

---

## Task 3: Check-in API

**Files:** Create `functions/lib/tickets-checkin.js`, `functions/tickets-checkin.js`; Modify `functions/lib/supabase.js`; Test `test/tickets-checkin.test.js`

**Interfaces:**
- Consumes: Task 2's `checkinOutcome`; existing `createContact(deps, input)` from `functions/lib/contacts.js`; `json()` from `functions/lib/http.js`.
- Produces:
  - `functions/lib/supabase.js` gains: `findTicketByQrToken(token)`, `findAttendanceByTicket(ticketId)`, `insertAttendance(row)`, `listAttendanceByEvent(eventId)`.
  - `makeTicketsCheckinHandler({ verifySession, db, createContact, deps })` → `async (req) => Response`, route `/api/tickets/checkin`.
- Task 5's scanner posts to this.

- [ ] **Step 1: Write the failing test** — `test/tickets-checkin.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTicketsCheckinHandler } from '../functions/lib/tickets-checkin.js';

const TICKET = { id: 't1', event_id: 'evt-1', status: 'valid', contact_id: 'c1', ticket_no: '000-0088-00001', tier_sold: 'member' };

function harness({ ticket = TICKET, attendance = null, session = { id: 'u1' } } = {}) {
  const state = { inserted: [], contacts: [], assigned: [] };
  const db = {
    findTicketByQrToken: async (t) => (t === 'good-token' ? ticket : null),
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

test('a ticket for another event is refused', async () => {
  const { handler, state } = harness();
  const res = await handler(post({ qr_token: 'good-token', event_id: 'evt-other' }));
  assert.equal((await res.json()).code, 'wrong_event');
  assert.equal(state.inserted.length, 0);
});

test('an unknown token is refused', async () => {
  const { handler } = harness();
  const res = await handler(post({ qr_token: 'nope', event_id: 'evt-1' }));
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
```

- [ ] **Step 2: Run, confirm fail** — `node --test test/tickets-checkin.test.js` → FAIL.

- [ ] **Step 3: Add the queries to `functions/lib/supabase.js`** (inside the returned object, matching the existing `one`/`maybe` style):

```js
    findTicketByQrToken: (token) => maybe(sb.from('tickets').select('*').eq('qr_token', token)),
    findAttendanceByTicket: (ticketId) => maybe(sb.from('event_attendance').select('*').eq('ticket_id', ticketId)),
    insertAttendance: (row) => one(sb.from('event_attendance').insert(row).select().single()),
    listAttendanceByEvent: (eventId) => one(
      sb.from('event_attendance').select('ticket_id,contact_id,attended_at').eq('event_id', eventId)
    ),
```

- [ ] **Step 4: Implement `functions/lib/tickets-checkin.js`**

```js
import { json } from './http.js';
import { checkinOutcome } from './checkin.js';

// POST /api/tickets/checkin — body: { qr_token, event_id, full_name?, email? }
//
// The QR token identifies a ticket; it NEVER authorizes the write. Tickets can
// be photographed, so a verified dashboard session is required as well.
export function makeTicketsCheckinHandler({ verifySession, db, createContact, deps }) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const user = token ? await verifySession(token).catch(() => null) : null;
    if (!user) return json({ error: 'unauthorized' }, 401);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

    const ticket = await db.findTicketByQrToken(String(body.qr_token || ''));
    const existingAttendance = ticket ? await db.findAttendanceByTicket(ticket.id) : null;
    const attendee = { full_name: String(body.full_name || ''), email: String(body.email || '').trim().toLowerCase() };

    const outcome = checkinOutcome({ ticket, eventId: String(body.event_id || ''), existingAttendance, attendee });

    if (!outcome.ok) {
      // Not all refusals are failures: a re-presented ticket is a normal event,
      // so the scanner gets 200 and shows its amber state.
      const soft = outcome.code === 'already_checked_in' || outcome.code === 'needs_attendee';
      return json(
        outcome.code === 'already_checked_in'
          ? { ok: false, code: outcome.code, attended_at: outcome.attended_at }
          : { ok: false, code: outcome.code },
        soft ? 200 : 200,
      );
    }

    // Door capture: an unnamed seat becomes a real contact, synced to GHL like
    // every other lead, then the seat is assigned before attendance is recorded.
    let contactId = ticket.contact_id;
    if (outcome.assignNeeded) {
      const contact = await createContact(deps, {
        email: attendee.email, full_name: attendee.full_name.trim(), source: 'event_attendee',
      });
      contactId = contact.id;
      await db.assignTicket(ticket.id, contactId);
    }

    await db.insertAttendance({ ticket_id: ticket.id, event_id: ticket.event_id, contact_id: contactId });

    const person = await db.findContactById(contactId);
    return json({
      ok: true,
      code: 'ok',
      attendee_name: person?.full_name || attendee.full_name.trim() || person?.email || '',
      ticket_no: ticket.ticket_no,
      tier_sold: ticket.tier_sold,
    });
  };
}
```

- [ ] **Step 5: Implement the wrapper `functions/tickets-checkin.js`** (session verification mirrors `functions/publish.js`)

```js
import { createClient } from '@supabase/supabase-js';
import { makeTicketsCheckinHandler } from './lib/tickets-checkin.js';
import { createSupabaseDb } from './lib/supabase.js';
import { createContact } from './lib/contacts.js';
import { buildDeps } from './lib/deps.js';

export default async (req) => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

  const verifySession = async (token) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.getUser(token);
    if (error) return null;
    return data?.user ?? null;
  };

  return makeTicketsCheckinHandler({
    verifySession,
    db: createSupabaseDb(process.env),
    createContact,
    deps: buildDeps(process.env),
  })(req);
};

export const config = { path: '/api/tickets/checkin' };
```

- [ ] **Step 6: Run, confirm pass** — `node --test test/tickets-checkin.test.js` → PASS; `npm test` → green.

- [ ] **Step 7: Commit**

```bash
git add functions/lib/tickets-checkin.js functions/tickets-checkin.js functions/lib/supabase.js test/tickets-checkin.test.js
git commit -m "feat(checkin): session-verified check-in API with door capture"
```

---

## Task 4: QR on the ticket + the landing page

**Files:** Create `src/js/vendor/qrcode.js`, `src/checkin.njk`, `src/js/ticket-qr.js`; Modify `src/js/tickets-manage.js`, `src/css/main.css`, `eleventy.config.js`, `test/build-output.test.js`

**Interfaces:**
- Consumes: Task 2's `checkinUrl` shape (the same `${origin}/checkin/?t=…` payload, built client-side here).
- Produces: a scannable inline-SVG QR beside each assigned ticket on the manage page, and the public `/checkin/` landing page.

- [ ] **Step 1: Vendor the QR generator.** Install a QR library as a **dev dependency**, then copy its browser build into `src/js/vendor/qrcode.js` and commit that file. Requirements: it must produce an **SVG string** (or matrix we render as SVG) from a text payload, work as a plain browser script with no bundler, and carry a permissive licence — keep the licence header in the vendored file. Add a comment at the top recording the package name and version so it can be refreshed later, mirroring `src/admin/vendor/supabase.js`. Verify it loads with `node --check src/js/vendor/qrcode.js`.

- [ ] **Step 2: Add the failing build assertions** — in `test/build-output.test.js`:

```js
test('the check-in landing page ships and does nothing but instruct', () => {
  const html = readFileSync(join(outDir, 'checkin', 'index.html'), 'utf8');
  assert.match(html, /Present this ticket/i, 'a stray camera scan must land somewhere harmless');
  assert.doesNotMatch(html, /api\/tickets\/checkin/, 'the landing page must never call the check-in API');
});

test('the manage page ships the QR renderer', () => {
  const html = readFileSync(join(outDir, 'tickets', 'manage', 'index.html'), 'utf8');
  assert.match(html, /src="\/js\/vendor\/qrcode\.js"/);
  assert.match(html, /src="\/js\/ticket-qr\.js"/);
});
```

- [ ] **Step 3: Run, confirm fail** — `node --test test/build-output.test.js` → the two new tests FAIL.

- [ ] **Step 4: Create `src/checkin.njk`** — the page a stray phone-camera scan reaches. It is deliberately inert.

```njk
---
layout: base.njk
title: Your ticket — PWRHaus Golf Society
description: Present this ticket at the door.
permalink: /checkin/index.html
---
<section class="section">
  <div class="container stack">
    <div class="section-heading">
      <p class="eyebrow">Check-in</p>
      <h1>Present this ticket at the door</h1>
      <p>Show this screen to the PWRHaus host when you arrive and they will check you in.</p>
      <p>Scanning this code yourself does not check you in.</p>
    </div>
  </div>
</section>
```

- [ ] **Step 5: Create `src/js/ticket-qr.js`** — renders a QR into any element carrying a token.

```js
// Renders each ticket's QR as inline SVG. The payload is the /checkin/ URL so
// any phone camera resolves it; scanning it alone does nothing — only a host
// with a dashboard session can actually record attendance.
(function () {
  var nodes = document.querySelectorAll('[data-qr-token]');
  if (!nodes.length || typeof window.qrcodeSvg !== 'function') return;

  Array.prototype.forEach.call(nodes, function (el) {
    var token = el.getAttribute('data-qr-token');
    if (!token) return;
    var payload = location.origin + '/checkin/?t=' + encodeURIComponent(token);
    try {
      el.innerHTML = window.qrcodeSvg(payload);
    } catch (e) {
      el.textContent = 'Ticket code unavailable — show your ticket number to the host.';
    }
  });
})();
```

> The vendored file must expose a `window.qrcodeSvg(text) → svgString` function. If the library
> you vendor exposes a different entry point, add a two-line adapter at the end of the vendored
> file that assigns `window.qrcodeSvg`, and note it in the file's header comment.

- [ ] **Step 6: Show the QR on the manage page.** In `src/js/tickets-manage.js`, inside `render()`, extend the assigned-ticket branch so it emits a QR mount and the ticket number:

```js
      if (t.attendee) {
        html += '<p><strong>' + esc(t.attendee.full_name) + '</strong><br>' + esc(t.attendee.email) + '</p>' +
          '<div class="ticket-qr" data-qr-token="' + esc(t.qr_token || '') + '"></div>' +
          '<p class="ticket-note">Ticket ' + esc(t.ticket_no) + ' — show this at the door.</p>';
      }
```

After `root.innerHTML = …`, re-render the codes for the newly inserted nodes:

```js
    if (window.renderTicketQrs) window.renderTicketQrs();
```

Wrap the body of `src/js/ticket-qr.js` in a named function assigned to `window.renderTicketQrs`, and call it once on load, so it can run again after each re-render.

- [ ] **Step 7: Expose `qr_token` to the manage page.** In `functions/lib/tickets-assign.js`, the GET branch builds each row; add the token so the page can render a code:

```js
        rows.push({
          id: t.id, ticket_no: t.ticket_no, tier_sold: t.tier_sold, qr_token: t.qr_token,
          attendee: attendee ? { full_name: attendee.full_name, email: attendee.email } : null,
        });
```

This is safe: the manage link is already token-gated to this order, and the QR alone cannot check anyone in.

- [ ] **Step 8: Load the scripts on the manage page.** In `src/tickets/manage.njk`, before the existing `tickets-manage.js` tag:

```html
<script src="/js/vendor/qrcode.js" defer></script>
<script src="/js/ticket-qr.js" defer></script>
```

- [ ] **Step 9: Style it in `src/css/main.css`**

```css
.ticket-qr { width: 180px; height: 180px; margin: var(--space-3) 0; }
.ticket-qr svg { width: 100%; height: 100%; display: block; }
```

- [ ] **Step 10: Passthrough the vendor folder.** In `eleventy.config.js`, next to the other `addPassthroughCopy` calls:

```js
  eleventyConfig.addPassthroughCopy('src/js/vendor');
```

- [ ] **Step 11: Verify** — `npm run build`; confirm `public/checkin/index.html` and `public/js/vendor/qrcode.js` exist; `node --test test/build-output.test.js` → the new assertions PASS; `npm test` → green.

- [ ] **Step 12: Commit**

```bash
git add src/js/vendor/qrcode.js src/checkin.njk src/js/ticket-qr.js src/js/tickets-manage.js src/tickets/manage.njk src/css/main.css eleventy.config.js functions/lib/tickets-assign.js test/build-output.test.js package.json package-lock.json
git commit -m "feat(tickets): render scannable QR tickets and a check-in landing page"
```

---

## Task 5: The dashboard Check-in view

**Files:** Modify `src/admin/index.html`, `src/admin/app.js`, `src/admin/admin.css`, `test/build-output.test.js`

**Interfaces:**
- Consumes: Task 3's `/api/tickets/checkin`; existing `sb`, `$`, `$$`, `state`, `toast`, `show`, `eventDateLabel`.
- Produces: the working Check-in view. Nothing downstream consumes it.

> **Testing note:** this is DOM + camera code with no browser harness in this repo. Automated coverage is the build-output structural assertion below plus `node --check`; behavior is proven by the manual checklist in Step 8 — the same convention used for the Events, Site Content and CRM views.

- [ ] **Step 1: Add the failing build assertion** — in `test/build-output.test.js`:

```js
test('admin ships the check-in view with a camera-free path', () => {
  const html = readFileSync(join(outDir, 'admin', 'index.html'), 'utf8');
  assert.match(html, /data-view="checkin"/, 'check-in must be reachable from the nav');
  assert.match(html, /id="view-checkin"/);
  assert.match(html, /id="checkin-manual"/, 'manual entry is a first-class path, not a fallback');
});
```

- [ ] **Step 2: Run, confirm fail** — `node --test test/build-output.test.js` → FAIL.

- [ ] **Step 3: Add the nav entry and view to `src/admin/index.html`.** Replace the disabled Settings placeholder line's *neighbour* — i.e. add a new sidebar button after the CRM one:

```html
          <button class="nav-item" data-view="checkin">Check-in</button>
```

Add the view after `#view-crm`:

```html
        <section id="view-checkin" class="view" hidden>
          <div class="view-head"><h2>Check-in</h2></div>
          <div class="checkin-controls">
            <select id="checkin-event" aria-label="Event to check in"></select>
            <button class="btn btn-primary" id="checkin-scan-btn" type="button">Start scanning</button>
          </div>
          <video id="checkin-video" class="checkin-video" playsinline muted hidden></video>
          <div id="checkin-result" class="checkin-result" role="status" aria-live="assertive"></div>
          <form id="checkin-manual" class="checkin-manual">
            <label for="checkin-ticket-no">Ticket number</label>
            <input id="checkin-ticket-no" name="ticket_no" type="text" inputmode="numeric" placeholder="000-0001-00001" autocomplete="off">
            <button class="btn btn-secondary" type="submit">Check in by number</button>
          </form>
          <p class="checkin-count" id="checkin-count"></p>
          <p class="checkin-queue" id="checkin-queue" hidden></p>
          <div class="checkin-roster" id="checkin-roster"></div>
        </section>
```

- [ ] **Step 4: Add the Check-in section to `src/admin/app.js`.** Extend `wireNav()`'s `go()` with `show($('#view-checkin'), view === 'checkin');` and `if (view === 'checkin') loadCheckin();`, add `wireCheckin();` to `boot()`, add `checkinQueue: []` to `state`, then add:

```js
/* ============================ check-in ============================ */

let checkinWired = false;
let checkinStream = null;

function wireCheckin() {
  if (checkinWired) return;
  checkinWired = true;
  $('#checkin-scan-btn').addEventListener('click', startScanning);
  $('#checkin-manual').addEventListener('submit', async (e) => {
    e.preventDefault();
    const no = $('#checkin-ticket-no').value.trim();
    if (!no) return;
    await submitCheckin({ ticket_no: no });
    $('#checkin-ticket-no').value = '';
  });
  $('#checkin-event').addEventListener('change', loadRoster);
}

async function loadCheckin() {
  const sel = $('#checkin-event');
  sel.innerHTML = '';
  // Today's event first — that is the one she is standing at.
  const sorted = [...state.events].sort((a, b) =>
    Math.abs(new Date(a.starts_at) - Date.now()) - Math.abs(new Date(b.starts_at) - Date.now()));
  for (const ev of sorted) {
    const o = document.createElement('option');
    o.value = ev.id;
    o.textContent = `${ev.name} — ${eventDateLabel(ev.starts_at)}`;
    sel.appendChild(o);
  }
  await loadRoster();
  flushQueue();
}

async function loadRoster() {
  const eventId = $('#checkin-event').value;
  if (!eventId) return;
  const { data } = await sb.from('event_attendance')
    .select('ticket_id,attended_at,contacts(full_name,email)').eq('event_id', eventId);
  const rows = data || [];
  const ev = state.events.find((e) => e.id === eventId);
  $('#checkin-count').textContent = `${rows.length} of ${ev?.capacity ?? '?'} checked in`;
  const box = $('#checkin-roster');
  box.innerHTML = '';
  for (const r of rows) {
    const p = document.createElement('p');
    p.className = 'meta';
    p.textContent = `${r.contacts?.full_name || r.contacts?.email || 'Guest'} · ${eventDateLabel(r.attended_at)}`;
    box.appendChild(p);
  }
}

function showCheckinResult(kind, text) {
  const box = $('#checkin-result');
  box.className = `checkin-result ${kind}`;
  box.textContent = text;
}

// The scanner posts { qr_token } from a camera scan, or { ticket_no } typed by
// hand. Both go through the same server validation.
async function submitCheckin(payload, attendee) {
  const eventId = $('#checkin-event').value;
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) { showCheckinResult('err', 'Session expired — sign in again.'); return; }

  const body = { ...payload, event_id: eventId, ...(attendee || {}) };
  try {
    const res = await fetch('/api/tickets/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
    const out = await res.json();

    if (out.ok) {
      showCheckinResult('ok', `${out.attendee_name} · ${out.tier_sold === 'member' ? 'Member' : 'Non-member'} · checked in`);
      await loadRoster();
      return;
    }
    if (out.code === 'already_checked_in') {
      showCheckinResult('warn', `Already checked in at ${eventDateLabel(out.attended_at)}`);
      return;
    }
    if (out.code === 'needs_attendee') {
      promptForAttendee(payload);
      return;
    }
    const messages = {
      wrong_event: 'That ticket is for a different event.',
      ticket_refunded: 'That ticket was refunded.',
      ticket_expired: 'That ticket has expired.',
      unknown_ticket: 'Ticket not recognised.',
    };
    showCheckinResult('err', messages[out.code] || 'That ticket could not be checked in.');
  } catch {
    // A dead spot must not stop the line: hold it and retry when signal returns.
    state.checkinQueue.push(body);
    renderQueue();
    showCheckinResult('warn', 'No signal — saved, will sync automatically.');
  }
}

function promptForAttendee(payload) {
  const box = $('#checkin-result');
  box.className = 'checkin-result info';
  box.innerHTML = '';
  const form = document.createElement('form');
  form.innerHTML =
    '<p>This ticket has no name yet. Who is arriving?</p>' +
    '<label>Name<input name="full_name" type="text" required></label>' +
    '<label>Email<input name="email" type="email" required></label>' +
    '<button class="btn btn-primary" type="submit">Check in</button>';
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitCheckin(payload, { full_name: form.full_name.value, email: form.email.value });
  });
  box.appendChild(form);
}

function renderQueue() {
  const el = $('#checkin-queue');
  const n = state.checkinQueue.length;
  el.hidden = n === 0;
  el.textContent = n ? `${n} waiting to sync` : '';
}

async function flushQueue() {
  if (!state.checkinQueue.length) return;
  const pending = state.checkinQueue.splice(0, state.checkinQueue.length);
  for (const body of pending) {
    try {
      const { data } = await sb.auth.getSession();
      await fetch('/api/tickets/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data?.session?.access_token },
        body: JSON.stringify(body),
      });
    } catch { state.checkinQueue.push(body); }
  }
  renderQueue();
  await loadRoster();
}

async function startScanning() {
  const video = $('#checkin-video');
  if (!('BarcodeDetector' in window)) {
    // iOS Safari has no BarcodeDetector — manual entry is the path there.
    showCheckinResult('warn', 'Camera scanning is not supported on this device. Use the ticket number below.');
    $('#checkin-ticket-no').focus();
    return;
  }
  try {
    checkinStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch {
    showCheckinResult('err', 'Camera unavailable. Use the ticket number below.');
    return;
  }
  video.srcObject = checkinStream;
  video.hidden = false;
  await video.play();

  const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  let last = '';
  const tick = async () => {
    if (video.hidden) return;
    try {
      const codes = await detector.detect(video);
      if (codes.length) {
        const raw = codes[0].rawValue || '';
        const t = (raw.split('?t=')[1] || '').split('&')[0];
        // Ignore the same code repeating across frames while it sits in view.
        if (t && t !== last) { last = t; await submitCheckin({ qr_token: decodeURIComponent(t) }); }
      }
    } catch { /* keep scanning */ }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
```

> `submitCheckin` accepts `{ ticket_no }` for manual entry. Task 3's handler resolves by
> `qr_token`; add a `findTicketByNumber(no)` query to `functions/lib/supabase.js`
> (`maybe(sb.from('tickets').select('*').eq('ticket_no', no))`) and, in
> `functions/lib/tickets-checkin.js`, resolve the ticket by `qr_token` when present and by
> `ticket_no` otherwise. Extend `test/tickets-checkin.test.js` with a case proving a manual
> ticket-number check-in works and is validated identically.

- [ ] **Step 5: Style it in `src/admin/admin.css`**

```css
/* ---------- Check-in ---------- */
.checkin-controls { display: grid; gap: var(--space-3); margin-bottom: var(--space-4); }
@media (min-width: 768px) { .checkin-controls { grid-template-columns: 1fr auto; } }
.checkin-video { width: 100%; max-width: 480px; border-radius: var(--radius); background: #000; margin-bottom: var(--space-4); }
.checkin-result { padding: var(--space-4); border-radius: var(--radius); font-size: 18px; font-weight: 700; min-height: var(--touch); margin-bottom: var(--space-4); }
.checkin-result.ok { background: rgba(26, 77, 54, .12); color: var(--forest); }
.checkin-result.warn { background: rgba(184, 145, 42, .16); color: var(--brass-text); }
.checkin-result.err { background: rgba(140, 47, 30, .12); color: var(--error); }
.checkin-result.info { background: var(--paper-raised); border: 1px solid var(--line); color: var(--ink); }
.checkin-result form { display: grid; gap: var(--space-3); margin-top: var(--space-3); }
.checkin-manual { display: grid; gap: var(--space-3); max-width: 420px; margin-bottom: var(--space-4); }
.checkin-count { font-weight: 700; }
.checkin-queue { color: var(--brass-text); font-weight: 600; }
.checkin-roster { display: grid; gap: var(--space-1); margin-top: var(--space-4); }
```

- [ ] **Step 6: Add the CRM-style bottom-nav entry.** The mobile bottom nav currently has four tabs; adding a fifth requires updating its grid. In `src/admin/admin.css` change `.bottom-nav { … grid-template-columns: repeat(4, 1fr); … }` to `repeat(5, 1fr)`, and add to `src/admin/index.html`'s bottom nav, before `new-event-tab`:

```html
        <button class="tab" data-view="checkin">Scan</button>
```

- [ ] **Step 7: Verify** — `node --check src/admin/app.js`; `npm run build`; `node --test test/build-output.test.js` → the check-in assertion PASSES; `npm test` → green.

- [ ] **Step 8: Manual verification** (`netlify dev` against dev Supabase, `0009` applied, signed in, on a phone): open **Check-in** → pick the event → scan a valid assigned ticket (green with the name) → scan it again (amber with the original time, and the roster count does not increase) → scan an unassigned ticket (blue prompt → enter name + email → green, and the contact appears in the CRM view) → with the camera closed, type a ticket number and check in → put the device in airplane mode, scan, confirm "No signal — saved" and a queue count, then restore signal and confirm it syncs.

- [ ] **Step 9: Commit**

```bash
git add src/admin/index.html src/admin/app.js src/admin/admin.css functions/lib/supabase.js functions/lib/tickets-checkin.js test/tickets-checkin.test.js test/build-output.test.js
git commit -m "feat(admin): phone-first check-in view with manual entry and offline queue"
```

---

## Task 6: Docs

**Files:** Modify `AGENTS.md`, `docs/superpowers/specs/2026-08-19-michelle-dashboard-handoff.md`

- [ ] **Step 1:** In `AGENTS.md`'s dashboard thread, note Phase 5 shipped: QR tickets rendered from `qr_token`, a session-verified `/api/tickets/checkin`, and a phone-first Check-in view with door capture, manual entry and an offline queue; attendance lands in `event_attendance` and is additive.
- [ ] **Step 2:** In the handoff doc's Supabase section, add applying `supabase/migrations/0009_event_checkin.sql`. In the reset step, note `event_attendance` is already listed for clearing. Add a line that check-in needs **no new secrets**.
- [ ] **Step 3:** Full sweep — `npm test` green; `npm run build` succeeds. Record the final test count.
- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/superpowers/specs/2026-08-19-michelle-dashboard-handoff.md
git commit -m "docs: Phase 5 check-in shipped; 0009 in the go-live list"
```

---

## Self-Review

**Spec coverage:** §3 data model → Task 1. §4 QR ticket (vendored generator, URL payload, inline SVG, where it appears) → Task 4. §5 scanner (event picker, camera, manual entry as first-class, four result states, count, offline queue, roster) → Task 5. §6 API (session auth, ordered validation, duplicate-as-200, door capture → contact → GHL, minimal response) → Task 3. §7 out-of-scope respected (no volunteer link, no offline-first roster, no undo). §8 testing → Tasks 1–5. §9 go-live notes → Task 6.

**Placeholder scan:** the QR library is specified by *sourcing method and required interface* (`window.qrcodeSvg(text) → svgString`) rather than a guessed package name, with an explicit adapter instruction if the chosen library differs — a deliberate, actionable choice at implementation time, not a TODO. The email-inlined QR is deferred with the rest of email until `RESEND_API_KEY` exists, per the ticketing spec.

**Type consistency:** `checkinOutcome` returns `{ ok, code, attended_at?, assignNeeded }` — consumed identically in Task 3. `checkinUrl(origin, qrToken)` matches the client-side payload built in Task 4. `db` methods (`findTicketByQrToken`, `findTicketByNumber`, `findAttendanceByTicket`, `insertAttendance`, `listAttendanceByEvent`, `assignTicket`, `findContactById`) are defined in Tasks 3/5 and used consistently. The API response keys (`ok`, `code`, `attendee_name`, `ticket_no`, `tier_sold`, `attended_at`) match between the handler, its tests, and the scanner's rendering.
