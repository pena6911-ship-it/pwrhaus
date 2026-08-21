# Event Ticketing via Stripe (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sell event tickets through Stripe: buyer-only checkout with verified member pricing, one QR-bearing ticket per seat, attendees assigned afterward via a token link (each becoming a CRM contact), and a dashboard roster.

**Architecture:** Mirrors the proven merch Stripe pattern — a pure-logic library + injected-dependency handlers in `functions/lib/`, thin Netlify function wrappers in `functions/`. Price is always recomputed server-side from Supabase (never trusted from the client). Capacity is checked at checkout *and* re-checked in the webhook before issuing tickets. Email is written against Resend but no-ops until `RESEND_API_KEY` exists.

**Tech Stack:** Netlify Functions v2, Stripe (test mode), Supabase (service-role writes), Eleventy/Nunjucks + vanilla JS front end, `node --test`.

## Global Constraints

- **Branch:** work on the feature branch the controller creates from `main`. Commit locally, **never push**. Stage explicit paths only (never `git add -A`).
- **Shell is Windows PowerShell 5.1** — no `&&`; use `;` or separate lines. Bash tool available.
- **`npm test` MUST stay green** at every task boundary (baseline: **128 tests**). **No new npm dependencies** — `stripe` and `@supabase/supabase-js` are already installed. No build step.
- **Stripe TEST mode only.** Never add live keys. Reuse the existing `STRIPE_SECRET_KEY` (sk_test). New env: `STRIPE_TICKETS_WEBHOOK_SECRET`, and `RESEND_API_KEY` (optional; absent = email skipped).
- **Price authority is the server.** Every amount is recomputed from the `events` row + the buyer's `contacts.tier`. A client-supplied price must never be honored.
- **Member tier check:** `contacts.tier` in (`member`, `inner_circle`) → member price. Verification is **buyer-level** for v1.
- **No buyer-facing service fee.** Do not add a percentage surcharge to the buyer's total.
- **Read the spec's defect table** (`docs/superpowers/specs/2026-08-20-event-ticketing-design.md` §1) — do not reproduce WIX's mislabelled fee, "Amount Paid $0.00", lessons-copy policies, or stale venue.
- **Design system:** public UI follows `src/css/tokens.css` (FINAL values) and the enforced rules — mobile-first (min-width only), no `box-shadow`, never `color: var(--brass)` for text, 44px touch targets, non-empty `alt` on every `<img>`, one `<h1>` per page, F&Co footer credit.
- **Out of scope:** check-in/QR scanning + `event_attendance` writes, dashboard refunds, waitlists, live Stripe keys.

---

## File Structure

**Create**
- `supabase/migrations/0006_event_ticketing.sql` — ticketing columns, RLS read policies.
- `functions/lib/ticketing.js` — pure logic: pricing, capacity, ticket-number/token generation, validation.
- `functions/lib/tickets-checkout.js` — `makeTicketsCheckoutHandler({ env, db, stripe })`.
- `functions/lib/tickets-webhook.js` — `makeTicketsWebhookHandler({ env, verify, db, email })`.
- `functions/lib/tickets-assign.js` — `makeTicketsAssignHandler({ db, createContact, deps, email })`.
- `functions/lib/ticket-email.js` — `createEmailer(env)`; no-ops without `RESEND_API_KEY`.
- `functions/tickets-checkout.js`, `functions/tickets-webhook.js`, `functions/tickets-assign.js` — Netlify wrappers.
- `src/tickets/manage.njk` — the "Add your guests" page.
- `src/js/tickets.js` — event-page ticket selector; `src/js/tickets-manage.js` — assignment page.
- `test/ticketing-lib.test.js`, `test/tickets-checkout.test.js`, `test/tickets-webhook.test.js`, `test/tickets-assign.test.js`, `test/ticket-email.test.js`, `test/ticketing-schema.test.js`.

**Modify**
- `functions/lib/supabase.js` — ticketing queries.
- `src/events/detail.njk` — ticket selector UI; `src/css/main.css` — its styles.
- `src/admin/app.js`, `src/admin/index.html`, `src/admin/admin.css` — roster + real Registrations count.
- `.env.example`, `AGENTS.md`, the dashboard handoff doc.

---

## Task 1: Migration `0006_event_ticketing.sql`

**Files:** Create `supabase/migrations/0006_event_ticketing.sql`; Test `test/ticketing-schema.test.js`

**Interfaces:**
- Produces: `events.member_price_cents|nonmember_price_cents|sales_end_at|tickets_enabled`; `orders.manage_token` (unique); `tickets.contact_id` nullable + `ticket_no`|`tier_sold`|`qr_token`|`assigned_at`; authenticated `select` policies on `orders` + `tickets`. Every later task depends on these names.

- [ ] **Step 1: Write the failing test** — `test/ticketing-schema.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/0006_event_ticketing.sql', import.meta.url), 'utf8').toLowerCase();

test('0006 adds the event ticketing columns', () => {
  for (const c of ['member_price_cents', 'nonmember_price_cents', 'sales_end_at', 'tickets_enabled']) {
    assert.match(sql, new RegExp(`alter table events add column (if not exists )?${c}\\b`), `missing events.${c}`);
  }
  assert.match(sql, /tickets_enabled\s+boolean not null default false/, 'sales must be off until deliberately enabled');
});

test('0006 extends orders and tickets', () => {
  assert.match(sql, /alter table orders add column (if not exists )?manage_token\s+text unique/);
  assert.match(sql, /alter table tickets alter column contact_id drop not null/, 'tickets are unassigned until claimed');
  for (const c of ['ticket_no', 'tier_sold', 'qr_token', 'assigned_at']) {
    assert.match(sql, new RegExp(`alter table tickets add column (if not exists )?${c}\\b`), `missing tickets.${c}`);
  }
  assert.match(sql, /tier_sold[^;]*check \(tier_sold in \('member','non_member'\)\)/s);
  assert.match(sql, /qr_token\s+text unique/);
});

test('0006 grants dashboard read on orders + tickets to authenticated only', () => {
  assert.match(sql, /create policy[^;]*on orders[^;]*for select[^;]*to authenticated/s);
  assert.match(sql, /create policy[^;]*on tickets[^;]*for select[^;]*to authenticated/s);
  assert.doesNotMatch(sql, /to anon/, 'ticket + order data must never be readable by anon');
});
```

- [ ] **Step 2: Run it, confirm it fails** — `cd C:\dev\pwrhaus; node --test test/ticketing-schema.test.js` → FAIL (file missing).

- [ ] **Step 3: Write `supabase/migrations/0006_event_ticketing.sql`**

```sql
-- Event ticketing (Phase 4). Sales stay OFF per event until deliberately enabled.
-- Ticket/order writes are service-role only; the dashboard reads as authenticated.

alter table events add column if not exists member_price_cents    int;
alter table events add column if not exists nonmember_price_cents int;
alter table events add column if not exists sales_end_at          timestamptz;
alter table events add column if not exists tickets_enabled       boolean not null default false;

-- The unguessable link the buyer uses to assign guests.
alter table orders add column if not exists manage_token text unique;

-- A seat is issued unassigned and claimed later.
alter table tickets alter column contact_id drop not null;
alter table tickets add column if not exists ticket_no   text unique;
alter table tickets add column if not exists tier_sold   text check (tier_sold in ('member','non_member'));
alter table tickets add column if not exists qr_token    text unique;
alter table tickets add column if not exists assigned_at timestamptz;

create index if not exists tickets_event_idx on tickets (event_id);
create index if not exists orders_manage_token_idx on orders (manage_token);

-- Dashboard roster reads (authenticated = owner). No anon, no writes.
drop policy if exists orders_admin_read  on orders;
drop policy if exists tickets_admin_read on tickets;

create policy orders_admin_read on orders
  for select to authenticated using (true);
create policy tickets_admin_read on tickets
  for select to authenticated using (true);
```

- [ ] **Step 4: Run, confirm pass** — `node --test test/ticketing-schema.test.js` → PASS. Then `npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_event_ticketing.sql test/ticketing-schema.test.js
git commit -m "feat(db): 0006 event ticketing columns, tokens, dashboard read policies"
```

---

## Task 2: Pure ticketing logic (`functions/lib/ticketing.js`)

**Files:** Create `functions/lib/ticketing.js`; Test `test/ticketing-lib.test.js`

**Interfaces:**
- Produces:
  - `isMemberTier(tier) → boolean` — true for `member`/`inner_circle`.
  - `priceForTier(event, tier) → number` (cents) — member price when `isMemberTier` and `member_price_cents` set; else `nonmember_price_cents ?? price_cents`.
  - `salesOpen(event, nowMs) → { open: boolean, reason: string|null }` — reasons `'tickets_disabled'`, `'sales_closed'`, `'event_passed'`.
  - `remainingCapacity(event, issuedCount) → number` — never negative.
  - `computeOrder({ event, tier, quantity, issuedCount, nowMs }) → { ok, error?, tierSold, unitCents, quantity, totalCents }` — validates quantity 1..10, sales window, capacity.
  - `ticketNumber(orderSeq, seatIndex) → string` — zero-padded `000-0000-00001` style.
  - `randomToken(bytes?) → string` — URL-safe, from `node:crypto`.
- Later tasks import all of these.

- [ ] **Step 1: Write the failing test** — `test/ticketing-lib.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMemberTier, priceForTier, salesOpen, remainingCapacity, computeOrder, ticketNumber, randomToken } from '../functions/lib/ticketing.js';

const EVENT = {
  price_cents: 7500, member_price_cents: 6500, nonmember_price_cents: 7500,
  capacity: 24, tickets_enabled: true,
  sales_end_at: '2026-12-31T23:59:00-05:00', starts_at: '2027-01-05T15:30:00-05:00',
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
```

- [ ] **Step 2: Run, confirm it fails** — `node --test test/ticketing-lib.test.js` → FAIL (module missing).

- [ ] **Step 3: Implement `functions/lib/ticketing.js`**

```js
import { randomBytes } from 'node:crypto';

const MEMBER_TIERS = new Set(['member', 'inner_circle']);
const MAX_QTY = 10;

export function isMemberTier(tier) {
  return MEMBER_TIERS.has(tier);
}

// Price authority lives here: always derived from the event row + the buyer's
// real tier. A member price that is not configured must not discount.
export function priceForTier(event, tier) {
  if (isMemberTier(tier) && Number.isInteger(event.member_price_cents)) return event.member_price_cents;
  if (Number.isInteger(event.nonmember_price_cents)) return event.nonmember_price_cents;
  return event.price_cents;
}

export function salesOpen(event, nowMs = Date.now()) {
  if (!event.tickets_enabled) return { open: false, reason: 'tickets_disabled' };
  if (event.sales_end_at && nowMs > Date.parse(event.sales_end_at)) return { open: false, reason: 'sales_closed' };
  if (event.starts_at && nowMs > Date.parse(event.starts_at)) return { open: false, reason: 'event_passed' };
  return { open: true, reason: null };
}

export function remainingCapacity(event, issuedCount = 0) {
  return Math.max(0, (event.capacity ?? 0) - issuedCount);
}

export function computeOrder({ event, tier, quantity, issuedCount = 0, nowMs = Date.now() }) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { ok: false, error: 'bad_quantity' };

  const open = salesOpen(event, nowMs);
  if (!open.open) return { ok: false, error: open.reason };

  if (qty > remainingCapacity(event, issuedCount)) return { ok: false, error: 'insufficient_capacity' };

  const unitCents = priceForTier(event, tier);
  return {
    ok: true,
    tierSold: isMemberTier(tier) ? 'member' : 'non_member',
    unitCents,
    quantity: qty,
    totalCents: unitCents * qty,
  };
}

export function ticketNumber(orderSeq, seatIndex) {
  return `000-${String(orderSeq).padStart(4, '0')}-${String(seatIndex).padStart(5, '0')}`;
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}
```

- [ ] **Step 4: Run, confirm pass** — `node --test test/ticketing-lib.test.js` → PASS; `npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add functions/lib/ticketing.js test/ticketing-lib.test.js
git commit -m "feat(tickets): pure pricing, capacity, sales-window and token logic"
```

---

## Task 3: Dormant email module (`functions/lib/ticket-email.js`)

**Files:** Create `functions/lib/ticket-email.js`; Test `test/ticket-email.test.js`

**Interfaces:**
- Produces: `createEmailer(env) → { enabled: boolean, sendOrderConfirmation(o), sendAttendeeTicket(t), sendUnassignedReminder(r) }`. Without `RESEND_API_KEY`, `enabled === false` and each method resolves `{ skipped: true }` without network access. With the key, each POSTs to `https://api.resend.com/emails` via `fetch`. Tasks 4–6 call these; nothing may throw when email is off.

- [ ] **Step 1: Write the failing test** — `test/ticket-email.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmailer } from '../functions/lib/ticket-email.js';

const ORDER = {
  to: 'buyer@example.com', buyerName: 'Jane Buyer', eventName: 'August FTL 9 Hole Scramble (Co-Ed)',
  startsAt: '2026-08-21T15:30:00-04:00', venue: 'Plantation Preserve', city: 'Plantation',
  orderNo: '000-0088', totalCents: 13000, manageUrl: 'https://x/tickets/manage/?token=abc',
  tickets: [{ ticketNo: '000-0088-00001', tierSold: 'member', qrToken: 'q1' }],
};

test('the emailer is disabled and silent without RESEND_API_KEY', async () => {
  const mailer = createEmailer({});
  assert.equal(mailer.enabled, false);
  assert.deepEqual(await mailer.sendOrderConfirmation(ORDER), { skipped: true });
  assert.deepEqual(await mailer.sendAttendeeTicket({ to: 'a@b.c' }), { skipped: true });
  assert.deepEqual(await mailer.sendUnassignedReminder({ to: 'a@b.c' }), { skipped: true });
});

test('with a key it posts to Resend and includes the manage link', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ id: 'email_1' }) };
  };
  const mailer = createEmailer({ RESEND_API_KEY: 'test_key', TICKETS_FROM_EMAIL: 'hello@pwrhausgolfsociety.com' }, fakeFetch);
  assert.equal(mailer.enabled, true);

  await mailer.sendOrderConfirmation(ORDER);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /api\.resend\.com\/emails/);
  assert.match(calls[0].init.headers.Authorization, /Bearer test_key/);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.to, 'buyer@example.com');
  assert.ok(body.html.includes('tickets/manage/?token=abc'), 'confirmation must lead with the assign link');
  assert.ok(body.html.includes('August FTL 9 Hole Scramble'), 'must name the event');
  assert.ok(!/service fee/i.test(body.html), 'we do not surcharge the buyer');
});
```

- [ ] **Step 2: Run, confirm fail** — `node --test test/ticket-email.test.js` → FAIL.

- [ ] **Step 3: Implement `functions/lib/ticket-email.js`**

```js
// Ticket email. Written against Resend but DORMANT until RESEND_API_KEY exists
// (the sending domain is blocked on the DNS migration). Every method resolves
// { skipped: true } when disabled so no caller needs to branch.
const ENDPOINT = 'https://api.resend.com/emails';

const usd = (cents) => '$' + (Number(cents) / 100).toFixed(2);
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const when = (iso) => new Intl.DateTimeFormat('en-US', {
  month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(iso));

export function createEmailer(env = {}, fetchImpl = fetch) {
  const key = env.RESEND_API_KEY;
  const from = env.TICKETS_FROM_EMAIL || 'hello@pwrhausgolfsociety.com';
  const enabled = Boolean(key);

  const send = async ({ to, subject, html }) => {
    if (!enabled) return { skipped: true };
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `PWRHaus Golf Society <${from}>`, to, subject, html }),
    });
    if (!res.ok) throw new Error(`resend_failed_${res.status}`);
    return res.json();
  };

  const ticketBlock = (t, o) => `
    <table style="border-collapse:collapse;border:1px solid #E6E1D6;margin:12px 0;width:100%">
      <tr><td style="padding:12px">
        <strong>${esc(o.eventName)}</strong><br>
        ${esc(when(o.startsAt))}<br>${esc(o.venue)}${o.city ? ', ' + esc(o.city) : ''}<br><br>
        Ticket: <strong>${esc(t.tierSold === 'member' ? 'PWRHAUS Member' : 'Non-Member')}</strong><br>
        Ticket no. <strong>${esc(t.ticketNo)}</strong><br>
        Order no. ${esc(o.orderNo)} &middot; Payment status: <strong>Paid</strong>
      </td></tr>
    </table>`;

  return {
    enabled,
    sendOrderConfirmation: (o) => send({
      to: o.to,
      subject: `Your tickets — ${o.eventName}`,
      html: `<p>Thanks ${esc(o.buyerName)} — your spot is confirmed.</p>
        ${(o.tickets || []).map((t) => ticketBlock(t, o)).join('')}
        <p>Total paid: <strong>${usd(o.totalCents)}</strong></p>
        <p><a href="${esc(o.manageUrl)}"><strong>Add your guests</strong></a> — tell us who is joining you
        and we will send each of them their own ticket.</p>`,
    }),

    sendAttendeeTicket: (t) => send({
      to: t.to,
      subject: `Your ticket — ${t.eventName}`,
      html: `<p>Hi ${esc(t.attendeeName)}, you're booked in.</p>
        ${ticketBlock(t, t)}
        <p>Please have this ticket ready on arrival. Questions? Just reply to this email.</p>`,
    }),

    sendUnassignedReminder: (r) => send({
      to: r.to,
      subject: `You still have ${r.unassignedCount} ticket(s) to assign`,
      html: `<p>Your event is coming up and ${r.unassignedCount} of your tickets still need names.</p>
        <p><a href="${esc(r.manageUrl)}"><strong>Add your guests</strong></a></p>`,
    }),
  };
}
```

- [ ] **Step 4: Run, confirm pass** — `node --test test/ticket-email.test.js` → PASS; `npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add functions/lib/ticket-email.js test/ticket-email.test.js
git commit -m "feat(tickets): dormant Resend emailer for confirmations, tickets, reminders"
```

---

## Task 4: Checkout handler + Supabase queries

**Files:** Create `functions/lib/tickets-checkout.js`, `functions/tickets-checkout.js`; Modify `functions/lib/supabase.js`; Test `test/tickets-checkout.test.js`

**Interfaces:**
- Consumes: Task 2's `computeOrder`, `randomToken`.
- Produces:
  - `functions/lib/supabase.js` gains: `findEventBySlug(slug)`, `countIssuedTickets(eventId)`, `findContactByEmail(email)` *(exists)*, `insertOrder(input)` *(exists)*, `insertTickets(rows)`, `findOrderByManageToken(token)`, `listTicketsByOrder(orderId)`, `assignTicket(ticketId, contactId)`, `nextOrderSeq()`.
  - `makeTicketsCheckoutHandler({ env, db, stripe, now })` → `async (req) => Response`. POST `{ slug, email, full_name, quantity }`; returns `{ url }` (200) or `{ error }` (400/405). Route: `/api/tickets/checkout`.
  - Session metadata carries: `event_id`, `contact_id`, `quantity`, `tier_sold`, `unit_cents`, `idempotency_key`.

- [ ] **Step 1: Write the failing test** — `test/tickets-checkout.test.js`

```js
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
```

- [ ] **Step 2: Run, confirm fail** — `node --test test/tickets-checkout.test.js` → FAIL.

- [ ] **Step 3: Add the queries to `functions/lib/supabase.js`** (inside the returned object, following the existing `one`/`maybe` helper style):

```js
    findEventBySlug: (slug) => maybe(sb.from('events').select('*').eq('slug', slug)),
    countIssuedTickets: async (eventId) => {
      const { count, error } = await sb.from('tickets').select('*', { count: 'exact', head: true })
        .eq('event_id', eventId).eq('status', 'valid');
      if (error) throw error;
      return count ?? 0;
    },
    insertTickets: (rows) => one(sb.from('tickets').insert(rows).select()),
    findOrderByManageToken: (token) => maybe(sb.from('orders').select('*').eq('manage_token', token)),
    listTicketsByOrder: (orderId) => one(sb.from('tickets').select('*').eq('order_id', orderId).order('ticket_no')),
    assignTicket: (ticketId, contactId) => one(
      sb.from('tickets').update({ contact_id: contactId, assigned_at: new Date().toISOString() }).eq('id', ticketId).select().single()
    ),
    nextOrderSeq: async () => {
      const { count, error } = await sb.from('orders').select('*', { count: 'exact', head: true }).eq('type', 'event');
      if (error) throw error;
      return (count ?? 0) + 1;
    },
```

- [ ] **Step 4: Implement `functions/lib/tickets-checkout.js`**

```js
import { json } from './http.js';
import { computeOrder, randomToken } from './ticketing.js';

// POST /api/tickets/checkout — body: { slug, email, full_name, quantity }
// Price is ALWAYS recomputed from the event row + the buyer's real tier. Any
// price or tier in the request body is ignored.
export function makeTicketsCheckoutHandler({ env, db, stripe, now = Date.now }) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim();
    if (!email || !email.includes('@')) return json({ error: 'email_required' }, 400);

    const event = await db.findEventBySlug(String(body.slug || ''));
    if (!event) return json({ error: 'unknown_event' }, 400);

    // The buyer's tier decides the price — look them up, create if new.
    let contact = await db.findContactByEmail(email);
    if (!contact) {
      contact = await db.insertContact({ email, full_name: fullName || null, tier: 'free', source: 'event_ticket' });
    }

    const issued = await db.countIssuedTickets(event.id);
    const quote = computeOrder({ event, tier: contact.tier, quantity: body.quantity, issuedCount: issued, nowMs: now() });
    if (!quote.ok) return json({ error: quote.error }, 400);

    const origin = new URL(req.url).origin;
    const idempotencyKey = `event:${event.id}:${contact.id}:${randomToken(8)}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      allow_promotion_codes: true,
      line_items: [{
        quantity: quote.quantity,
        price_data: {
          currency: 'usd',
          unit_amount: quote.unitCents, // authority: the events table
          product_data: {
            name: `${event.name} — ${quote.tierSold === 'member' ? 'PWRHAUS Member' : 'Non-Member'}`,
          },
        },
      }],
      success_url: `${origin}/events/${event.slug}/?ticket=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/events/${event.slug}/`,
      metadata: {
        event_id: event.id,
        contact_id: contact.id,
        quantity: String(quote.quantity),
        tier_sold: quote.tierSold,
        unit_cents: String(quote.unitCents),
        idempotency_key: idempotencyKey,
      },
    });

    return json({ url: session.url });
  };
}
```

- [ ] **Step 5: Implement the wrapper `functions/tickets-checkout.js`**

```js
import Stripe from 'stripe';
import { makeTicketsCheckoutHandler } from './lib/tickets-checkout.js';
import { createSupabaseDb } from './lib/supabase.js';

export default async (req) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const db = createSupabaseDb(process.env);
  return makeTicketsCheckoutHandler({ env: process.env, db, stripe })(req);
};

export const config = { path: '/api/tickets/checkout' };
```

- [ ] **Step 6: Run, confirm pass** — `node --test test/tickets-checkout.test.js` → PASS; `npm test` → green.

- [ ] **Step 7: Commit**

```bash
git add functions/lib/tickets-checkout.js functions/tickets-checkout.js functions/lib/supabase.js test/tickets-checkout.test.js
git commit -m "feat(tickets): checkout handler with server-side pricing and capacity checks"
```

---

## Task 5: Webhook — issue tickets

**Files:** Create `functions/lib/tickets-webhook.js`, `functions/tickets-webhook.js`; Test `test/tickets-webhook.test.js`

**Interfaces:**
- Consumes: Task 2's `ticketNumber`/`randomToken`; Task 3's `createEmailer`; Task 4's `db` methods.
- Produces: `makeTicketsWebhookHandler({ env, verify, db, email, now })` → `async (req) => Response`. On `checkout.session.completed`: verify signature → idempotency on the Stripe event id → insert order → **re-check capacity** → insert N tickets (buyer's seat auto-assigned) → send confirmation. Route `/api/tickets/webhook`, secret `STRIPE_TICKETS_WEBHOOK_SECRET`.

- [ ] **Step 1: Write the failing test** — `test/tickets-webhook.test.js`

```js
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
});
```

- [ ] **Step 2: Run, confirm fail** — `node --test test/tickets-webhook.test.js` → FAIL.

- [ ] **Step 3: Implement `functions/lib/tickets-webhook.js`**

```js
import { json } from './http.js';
import { ticketNumber, randomToken, remainingCapacity } from './ticketing.js';

// POST /api/tickets/webhook — Stripe fires checkout.session.completed.
// Verify → idempotency → order → RE-CHECK capacity → issue seats → confirm.
export function makeTicketsWebhookHandler({ env, verify, db, email, now = Date.now }) {
  return async (req) => {
    const signature = req.headers.get('stripe-signature');
    const raw = await req.text();

    let event;
    try { event = await verify(raw, signature); } catch { return json({ error: 'bad_signature' }, 400); }

    if (event.type !== 'checkout.session.completed') {
      return json({ received: true, ignored: event.type });
    }

    // A Stripe retry must never issue a second set of tickets.
    const seen = await db.findOrderEventByStripeEventId(event.id);
    if (seen) return json({ received: true, duplicate: true });

    const s = event.data.object;
    const m = s.metadata || {};
    const quantity = Number(m.quantity) || 0;
    const unitCents = Number(m.unit_cents) || 0;

    const ev = await db.findEventById(m.event_id);
    const issued = await db.countIssuedTickets(m.event_id);

    // Two buyers can pass the checkout-time check at once; this is the real gate.
    const oversold = quantity > remainingCapacity(ev, issued);

    const order = await db.insertOrder({
      contact_id: m.contact_id,
      type: 'event',
      amount_cents: s.amount_total ?? unitCents * quantity,
      currency: 'usd',
      stripe_payment_intent_id: s.payment_intent ?? null,
      idempotency_key: m.idempotency_key,
      current_status: oversold ? 'needs_attention' : 'paid',
      manage_token: randomToken(),
    });
    await db.insertOrderEvent({ stripe_event_id: event.id, order_id: order.id, type: event.type });

    if (oversold) {
      // Paid but unfulfillable: flag for refund. The one case Michelle must see.
      return json({ received: true, needs_attention: 'insufficient_capacity' });
    }

    const seq = await db.nextOrderSeq();
    const rows = [];
    for (let i = 1; i <= quantity; i++) {
      rows.push({
        order_id: order.id,
        event_id: m.event_id,
        contact_id: i === 1 ? m.contact_id : null, // the buyer keeps seat 1
        assigned_at: i === 1 ? new Date(now()).toISOString() : null,
        status: 'valid',
        tier_sold: m.tier_sold,
        ticket_no: ticketNumber(seq, i),
        qr_token: randomToken(),
      });
    }
    await db.insertTickets(rows);

    const buyer = await db.findContactById(m.contact_id);
    const origin = new URL(req.url).origin;
    await email.sendOrderConfirmation({
      to: buyer?.email || s.customer_email,
      buyerName: buyer?.full_name || 'there',
      eventName: ev.name, startsAt: ev.starts_at, venue: ev.venue, city: ev.city,
      orderNo: `000-${String(seq).padStart(4, '0')}`,
      totalCents: s.amount_total ?? unitCents * quantity,
      manageUrl: `${origin}/tickets/manage/?token=${order.manage_token}`,
      tickets: rows.map((r) => ({ ticketNo: r.ticket_no, tierSold: r.tier_sold, qrToken: r.qr_token })),
    });

    return json({ received: true, tickets: rows.length });
  };
}
```

- [ ] **Step 4: Add `findEventById` + `findContactById` to `functions/lib/supabase.js`**

```js
    findEventById: (id) => maybe(sb.from('events').select('*').eq('id', id)),
    findContactById: (id) => maybe(sb.from('contacts').select('*').eq('id', id)),
```

- [ ] **Step 5: Implement the wrapper `functions/tickets-webhook.js`**

```js
import Stripe from 'stripe';
import { makeTicketsWebhookHandler } from './lib/tickets-webhook.js';
import { createSupabaseDb } from './lib/supabase.js';
import { createEmailer } from './lib/ticket-email.js';

export default async (req) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const verify = (raw, signature) =>
    stripe.webhooks.constructEventAsync(raw, signature, process.env.STRIPE_TICKETS_WEBHOOK_SECRET);
  return makeTicketsWebhookHandler({
    env: process.env,
    verify,
    db: createSupabaseDb(process.env),
    email: createEmailer(process.env),
  })(req);
};

export const config = { path: '/api/tickets/webhook' };
```

- [ ] **Step 6: Run, confirm pass** — `node --test test/tickets-webhook.test.js` → PASS; `npm test` → green.

- [ ] **Step 7: Commit**

```bash
git add functions/lib/tickets-webhook.js functions/tickets-webhook.js functions/lib/supabase.js test/tickets-webhook.test.js
git commit -m "feat(tickets): webhook issues seats idempotently and never oversells"
```

---

## Task 6: Attendee assignment (handler + page)

**Files:** Create `functions/lib/tickets-assign.js`, `functions/tickets-assign.js`, `src/tickets/manage.njk`, `src/js/tickets-manage.js`; Modify `src/css/main.css`; Test `test/tickets-assign.test.js`

**Interfaces:**
- Consumes: Task 4's `db` methods; Task 3's emailer; the existing `createContact({ db, ghl }, input)` from `functions/lib/contacts.js` (creates/dedupes a contact **and** pushes it to GHL).
- Produces:
  - `makeTicketsAssignHandler({ db, createContact, deps, email })` → `async (req) => Response`. `GET ?token=…` → `{ event, tickets: [{ id, ticket_no, tier_sold, attendee }] }`; `POST { token, ticket_id, full_name, email }` → assigns and returns `{ ok: true }`. Bad token → 404 `{ error: 'not_found' }`.
  - Public page `/tickets/manage/` reading `?token=` client-side.

- [ ] **Step 1: Write the failing test** — `test/tickets-assign.test.js`

```js
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
```

- [ ] **Step 2: Run, confirm fail** — `node --test test/tickets-assign.test.js` → FAIL.

- [ ] **Step 3: Implement `functions/lib/tickets-assign.js`**

```js
import { json } from './http.js';

// /api/tickets/assign — the token grants access to ONE order, never the database.
export function makeTicketsAssignHandler({ db, createContact, deps, email }) {
  const load = async (token) => (token ? db.findOrderByManageToken(token) : null);

  return async (req) => {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const order = await load(url.searchParams.get('token'));
      if (!order) return json({ error: 'not_found' }, 404);
      const [event, tickets] = await Promise.all([db.findEventById(order.event_id), db.listTicketsByOrder(order.id)]);
      const rows = [];
      for (const t of tickets) {
        const attendee = t.contact_id ? await db.findContactById(t.contact_id) : null;
        rows.push({
          id: t.id, ticket_no: t.ticket_no, tier_sold: t.tier_sold,
          attendee: attendee ? { full_name: attendee.full_name, email: attendee.email } : null,
        });
      }
      return json({ event: { name: event.name, starts_at: event.starts_at, venue: event.venue, city: event.city }, tickets: rows });
    }

    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

    const order = await load(body.token);
    if (!order) return json({ error: 'not_found' }, 404);

    const tickets = await db.listTicketsByOrder(order.id);
    const ticket = tickets.find((t) => t.id === body.ticket_id);
    if (!ticket) return json({ error: 'unknown_ticket' }, 400);

    const attendeeEmail = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim();
    if (!attendeeEmail.includes('@') || !fullName) return json({ error: 'name_and_email_required' }, 400);

    // Attendees are first-class contacts: deduped, and pushed to GHL like any lead.
    const contact = await createContact(deps, {
      email: attendeeEmail, full_name: fullName, source: 'event_attendee',
    });

    await db.assignTicket(ticket.id, contact.id);

    const event = await db.findEventById(order.event_id);
    await email.sendAttendeeTicket({
      to: attendeeEmail, attendeeName: fullName,
      eventName: event.name, startsAt: event.starts_at, venue: event.venue, city: event.city,
      orderNo: ticket.ticket_no.slice(0, 8), ticketNo: ticket.ticket_no,
      tierSold: ticket.tier_sold, qrToken: ticket.qr_token,
    });

    return json({ ok: true });
  };
}
```

- [ ] **Step 4: Implement the wrapper `functions/tickets-assign.js`**

```js
import { makeTicketsAssignHandler } from './lib/tickets-assign.js';
import { createSupabaseDb } from './lib/supabase.js';
import { createEmailer } from './lib/ticket-email.js';
import { createContact } from './lib/contacts.js';
import { buildDeps } from './lib/deps.js';

export default async (req) => {
  return makeTicketsAssignHandler({
    db: createSupabaseDb(process.env),
    createContact,
    deps: buildDeps(process.env),
    email: createEmailer(process.env),
  })(req);
};

export const config = { path: '/api/tickets/assign' };
```

- [ ] **Step 5: Create the page `src/tickets/manage.njk`**

```njk
---
layout: base.njk
title: Your tickets — PWRHaus Golf Society
description: Add your guests and send each of them their own ticket.
permalink: /tickets/manage/index.html
---
<section class="section">
  <div class="container stack">
    <div class="section-heading">
      <p class="eyebrow">Your tickets</p>
      <h1>Add your guests</h1>
      <p>Tell us who is joining you and we will email each of them their own ticket.</p>
    </div>
    <div id="manage-root" aria-live="polite">
      <p>Loading your tickets…</p>
    </div>
  </div>
</section>
<script src="/js/tickets-manage.js" defer></script>
```

- [ ] **Step 6: Create `src/js/tickets-manage.js`**

```js
// Reads ?token= and renders the order's tickets. The token is the only
// credential; it grants access to this order alone.
(function () {
  var root = document.getElementById('manage-root');
  if (!root) return;
  var token = new URLSearchParams(location.search).get('token') || '';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function render(data) {
    if (!data.tickets.length) { root.textContent = 'No tickets found for this link.'; return; }
    var html = '<ul class="list-stack ticket-list">';
    data.tickets.forEach(function (t) {
      html += '<li class="card ticket-row"><p class="eyebrow">Ticket ' + esc(t.ticket_no) + ' &middot; ' +
        (t.tier_sold === 'member' ? 'PWRHAUS Member' : 'Non-Member') + '</p>';
      if (t.attendee) {
        html += '<p><strong>' + esc(t.attendee.full_name) + '</strong><br>' + esc(t.attendee.email) + '</p>';
      } else {
        html += '<form data-ticket="' + esc(t.id) + '" class="stack">' +
          '<label>Guest name<input name="full_name" type="text" required></label>' +
          '<label>Guest email<input name="email" type="email" required></label>' +
          '<button class="btn btn-primary" type="submit">Send their ticket</button>' +
          '<p class="form-msg" role="status"></p></form>';
      }
      html += '</li>';
    });
    root.innerHTML = html + '</ul>';

    root.querySelectorAll('form[data-ticket]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var msg = form.querySelector('.form-msg');
        msg.textContent = 'Sending…';
        fetch('/api/tickets/assign', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: token, ticket_id: form.getAttribute('data-ticket'),
            full_name: form.full_name.value, email: form.email.value,
          }),
        }).then(function (r) { return r.json(); }).then(function (out) {
          if (out.ok) { load(); } else { msg.textContent = 'Could not save that — please check the details.'; }
        }).catch(function () { msg.textContent = 'Something went wrong. Please try again.'; });
      });
    });
  }

  function load() {
    if (!token) { root.textContent = 'This link is missing its code. Please use the link from your confirmation email.'; return; }
    fetch('/api/tickets/assign?token=' + encodeURIComponent(token))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(render)
      .catch(function () { root.textContent = 'We could not find those tickets. Please use the link from your confirmation email.'; });
  }

  load();
})();
```

- [ ] **Step 7: Add styles to `src/css/main.css`** (append near the other card rules; mobile-first, no box-shadow):

```css
.ticket-list { display: grid; gap: var(--space-4); }
.ticket-row { padding: var(--space-4); }
.ticket-row form { margin-top: var(--space-3); }
.form-msg { font-size: 0.875rem; color: var(--ink-muted); }
```

- [ ] **Step 8: Run tests + build** — `node --test test/tickets-assign.test.js` → PASS; `npm run build` → succeeds and `public/tickets/manage/index.html` exists; `npm test` → green.

- [ ] **Step 9: Commit**

```bash
git add functions/lib/tickets-assign.js functions/tickets-assign.js src/tickets/manage.njk src/js/tickets-manage.js src/css/main.css test/tickets-assign.test.js
git commit -m "feat(tickets): attendee assignment page, handler and CRM contact creation"
```

---

## Task 7: Event-page selector, dashboard roster, docs

**Files:** Modify `src/events/detail.njk`, `src/js/tickets.js` (create), `src/css/main.css`, `src/admin/app.js`, `src/admin/index.html`, `src/admin/admin.css`, `.env.example`, `AGENTS.md`, `docs/superpowers/specs/2026-08-19-michelle-dashboard-handoff.md`; Test: `test/build-output.test.js`

**Interfaces:**
- Consumes: `/api/tickets/checkout` (Task 4); the dashboard's existing `sb`, `$`, `$$`, `state`, `toast`, `eventDateLabel`.
- Produces: the public ticket selector; the dashboard roster; documented env.

- [ ] **Step 1: Add the failing build assertion** — in `test/build-output.test.js`:

```js
test('the manage-tickets page ships', () => {
  const html = readFileSync(join(outDir, 'tickets', 'manage', 'index.html'), 'utf8');
  assert.match(html, /id="manage-root"/, 'assignment page must render its mount point');
  assert.match(html, /src="\/js\/tickets-manage\.js"/, 'assignment page must load its script');
});
```

- [ ] **Step 2: Run, confirm it passes** (Task 6 created the page) — `node --test test/build-output.test.js`. This is a regression guard.

- [ ] **Step 3: Add the ticket selector to `src/events/detail.njk`** — insert after the event body, before the capture form:

```njk
{% if event.tickets_enabled %}
<section class="section" id="tickets">
  <div class="container stack">
    <div class="section-heading">
      <p class="eyebrow">Tickets</p>
      <h2>Claim your spot</h2>
    </div>
    <form id="ticket-form" class="stack" data-slug="{{ event.slug }}">
      <p class="ticket-prices">
        PWRHAUS Member <strong>{{ event.member_price_cents | usd }}</strong>
        &middot; Non-Member <strong>{{ event.nonmember_price_cents or event.price_cents | usd }}</strong>
      </p>
      <label>Your name<input name="full_name" type="text" required></label>
      <label>Your email<input name="email" type="email" required></label>
      <label>Tickets
        <select name="quantity">
          <option>1</option><option>2</option><option>3</option><option>4</option>
        </select>
      </label>
      <p class="ticket-note">Member pricing is applied automatically if your email is on our member list.</p>
      <button class="btn btn-primary" type="submit">Continue to payment</button>
      <p class="form-msg" role="status"></p>
    </form>
  </div>
</section>
<script src="/js/tickets.js" defer></script>
{% endif %}
```

- [ ] **Step 4: Create `src/js/tickets.js`**

```js
// Posts the buyer's details to /api/tickets/checkout and redirects to Stripe.
// Price is never sent from here — the server decides it.
(function () {
  var form = document.getElementById('ticket-form');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = form.querySelector('.form-msg');
    msg.textContent = 'Taking you to secure checkout…';
    fetch('/api/tickets/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: form.getAttribute('data-slug'),
        full_name: form.full_name.value,
        email: form.email.value,
        quantity: Number(form.quantity.value),
      }),
    }).then(function (r) { return r.json(); }).then(function (out) {
      if (out.url) { location.href = out.url; return; }
      var errors = {
        tickets_disabled: 'Ticket sales are not open for this event yet.',
        sales_closed: 'Ticket sales have closed for this event.',
        event_passed: 'This event has already taken place.',
        insufficient_capacity: 'Sorry — there are not enough spots left.',
        email_required: 'Please enter a valid email address.',
      };
      msg.textContent = errors[out.error] || 'We could not start checkout. Please try again.';
    }).catch(function () { msg.textContent = 'We could not start checkout. Please try again.'; });
  });
})();
```

- [ ] **Step 5: Style it in `src/css/main.css`**

```css
.ticket-prices { font-size: 1.125rem; }
.ticket-note { font-size: 0.875rem; color: var(--ink-muted); }
#ticket-form label { display: grid; gap: var(--space-2); max-width: 420px; }
```

- [ ] **Step 6: Dashboard roster.** In `src/admin/index.html`, inside `#view-events`, add after the event list:

```html
          <div id="event-roster" class="event-roster" hidden></div>
```

In `src/admin/app.js`, add to the CRM/events section and call it from `refresh()`:

```js
// Real registration counts + per-event roster, replacing the "—" tile.
async function loadRosters() {
  const { data, error } = await sb
    .from('tickets')
    .select('id,event_id,ticket_no,tier_sold,contact_id,status,contacts(full_name,email)')
    .eq('status', 'valid');
  if (error) { state.tickets = []; return; }
  state.tickets = data || [];
}

function ticketsForEvent(eventId) {
  return state.tickets.filter((t) => t.event_id === eventId);
}

function renderRoster(ev) {
  const box = $('#event-roster');
  const rows = ticketsForEvent(ev.id);
  const unassigned = rows.filter((t) => !t.contact_id).length;
  box.innerHTML = '';
  const h = document.createElement('h3');
  h.textContent = `${ev.name} — ${rows.length} registered${unassigned ? `, ${unassigned} unassigned` : ''}`;
  box.appendChild(h);
  for (const t of rows) {
    const p = document.createElement('p');
    p.className = 'meta';
    p.textContent = `${t.ticket_no} · ${t.tier_sold === 'member' ? 'Member' : 'Non-member'} · ` +
      (t.contacts ? `${t.contacts.full_name || ''} <${t.contacts.email}>` : 'Unassigned');
    box.appendChild(p);
  }
  box.hidden = false;
}
```

Replace the Registrations tile value in `renderStats()` with the real count:

```js
    { k: 'Registrations', n: state.tickets ? state.tickets.length : '—' },
```

Add `tickets: []` to the `state` object, call `await loadRosters();` inside `refresh()` before `renderStats()`, and add a `roster` action button to each event card (mirroring the existing `actionBtn(...)` pattern) that calls `renderRoster(ev)`.

- [ ] **Step 7: Style the roster in `src/admin/admin.css`**

```css
.event-roster { background: var(--paper-raised); border: 1px solid var(--line); border-radius: var(--radius); padding: var(--space-4); margin-top: var(--space-5); }
.event-roster h3 { font-size: 16px; margin-bottom: var(--space-2); }
```

- [ ] **Step 8: Document the env.** Append to `.env.example`:

```
# Stripe webhook secret for the TICKETS endpoint (/api/tickets/webhook) — distinct from merch.
STRIPE_TICKETS_WEBHOOK_SECRET=whsec_
# Resend API key. ABSENT = ticket emails are skipped (Stripe's receipt still sends).
RESEND_API_KEY=
# Sender for ticket email; must be on a Resend-verified domain.
TICKETS_FROM_EMAIL=hello@pwrhausgolfsociety.com
```

- [ ] **Step 9: Update `AGENTS.md` and the handoff doc.** In `AGENTS.md`'s dashboard thread, note Phase 4 (event ticketing, Stripe **test mode**) shipped: buyer-only checkout with server-verified member pricing, one QR-bearing ticket per seat, token-link attendee assignment feeding the CRM, dashboard roster; email dormant until `RESEND_API_KEY`. In the handoff doc, add a go-live section: apply `0006`, create the tickets webhook endpoint + `STRIPE_TICKETS_WEBHOOK_SECRET`, set per-event prices/`sales_end_at`/`tickets_enabled`, swap to live Stripe keys, verify Resend, rewrite the refund + weather policies **for events**, and never sell the same event on WIX and here simultaneously.

- [ ] **Step 10: Verify** — `node --check src/admin/app.js`; `npm run build`; `npm test` → green. Record the final count.

- [ ] **Step 11: Commit**

```bash
git add src/events/detail.njk src/js/tickets.js src/css/main.css src/admin/app.js src/admin/index.html src/admin/admin.css .env.example AGENTS.md docs/superpowers/specs/2026-08-19-michelle-dashboard-handoff.md test/build-output.test.js
git commit -m "feat(tickets): event-page selector, dashboard roster, env + handoff docs"
```

---

## Self-Review

**Spec coverage:** §3 data model → Task 1. §4 purchase flow (server pricing, double capacity check, sales window) → Tasks 2, 4, 7. §5 fulfillment (signature, idempotency, N seats, auto-assign, flag-not-oversell) → Task 5. §6 assignment + CRM/GHL → Task 6. §7 dashboard roster + real Registrations → Task 7. §8 dormant email → Task 3 (used in 5 + 6). §9 out-of-scope respected (no check-in, no dashboard refunds, no live keys). §10 testing → every task. §11 go-live → Task 7 Step 9.

**Placeholder scan:** none. The only deliberately deferred artifact is the QR *image* rendering — `qr_token` is generated and carried in email payloads; drawing the QR bitmap belongs to the check-in follow-on, which is where scanning is specified. No task references an undefined helper.

**Type consistency:** `computeOrder` returns `{ ok, error?, tierSold, unitCents, quantity, totalCents }` — consumed identically in Task 4. `ticketNumber(orderSeq, seatIndex)` and `randomToken(bytes?)` match their Task 2 definitions in Tasks 5–6. `db` method names (`findEventBySlug`, `findEventById`, `findContactById`, `countIssuedTickets`, `insertTickets`, `findOrderByManageToken`, `listTicketsByOrder`, `assignTicket`, `nextOrderSeq`) are defined in Tasks 4–5 and used consistently. `createEmailer(env, fetchImpl?)` and its three methods match Tasks 3, 5, 6. `tier_sold` values are `'member'`/`'non_member'` everywhere, matching the `0006` CHECK constraint.
