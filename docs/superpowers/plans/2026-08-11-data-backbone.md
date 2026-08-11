# Data Backbone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tested serverless data layer that every other PWRHaus subsystem consumes — Supabase as the source of truth for facts, an idempotent Stripe webhook that writes an append-only order ledger, and a fact→GHL push that keeps GoHighLevel in sync.

**Architecture:** Hexagonal. Pure business logic (idempotency, ledger math, Stripe event mapping, contact/order orchestration) depends only on a small `db` port and a `ghl` port, so it is fully unit-testable with in-memory fakes and zero network. Thin adapters (`supabase.js`, `stripe.js`) implement the ports over the real SDKs and are verified by an integration smoke, not unit tests. Netlify Functions v2 handlers are thin glue that wire env → adapters → logic.

**Tech Stack:** Plain JavaScript (ESM), Node.js 24 (already installed), Netlify Functions v2, Supabase (Postgres), Stripe, GoHighLevel REST API. Test runner: Node built-in `node:test` (`node --test`). No client-side build step.

## Global Constraints

Every task's requirements implicitly include this section. Values copied verbatim from `docs/superpowers/specs/2026-08-11-pwrhaus-phase1-design.md`.

- **Money is integer cents** (`amount_cents INT`) with a `currency` column. Never floats.
- **All timestamps are `timestamptz` in UTC.**
- **Append-only ledgers** — `order_events` and `membership_events` are never updated or deleted; a status change is a new row.
- **Idempotency** — every order carries a unique `idempotency_key`; every Stripe-sourced ledger row carries a unique `stripe_event_id`. A retried webhook must never double-create.
- **Join key** — every contact carries `ghl_contact_id`.
- **Source of truth direction** — the site writes facts to Supabase first, then pushes to GHL. Never the reverse for facts. (A nightly read-only GHL→Supabase backup is a later task, not in this plan.)
- **Billing** — build entirely against **Stripe test/sandbox keys**. No live keys in this plan.
- **Env contexts (Netlify)** — test/sandbox creds scope to `deploy-preview` + `branch-deploy`; production creds scope to `production`. Secrets live in Netlify env vars, never in the repo. `.env` is gitignored.
- **New runtime dependencies** (official clients for already-approved services, installed for the Netlify Functions runtime — not a client-side build step): `@supabase/supabase-js`, `stripe`. GHL uses `fetch` directly, no SDK.
- **Git** — commit locally only, never push. Stage explicit file paths (never `git add -A` / `git add -u`).

---

### Task 1: Project scaffold + idempotency helper

Scaffolding (package.json, netlify.toml, .env.example, dir layout) rides along with the first real unit that needs it.

**Files:**
- Create: `package.json`
- Create: `netlify.toml`
- Create: `.env.example`
- Create: `functions/lib/idempotency.js`
- Test: `test/idempotency.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `orderIdempotencyKey(source: string, sourceId: string): string` — deterministic key, e.g. `orderIdempotencyKey('stripe', 'pi_123') === 'stripe:pi_123'`.
  - `assertPresent(value: unknown, name: string): void` — throws `Error` with message `` `${name} is required` `` when value is null/undefined/empty string.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "pwrhaus-backbone",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "test": "node --test"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "stripe": "^16.0.0"
  }
}
```

- [ ] **Step 2: Write `netlify.toml`**

```toml
[build]
  functions = "functions"
  publish   = "public"

# Env-var contexts: set the ACTUAL secret VALUES in the Netlify UI, scoped per
# context. Sandbox/test creds -> deploy-preview + branch-deploy. Production
# creds -> production. This file only documents the contract; no secrets here.
[context.production.environment]
  STRIPE_MODE = "live"
[context.deploy-preview.environment]
  STRIPE_MODE = "test"
[context.branch-deploy.environment]
  STRIPE_MODE = "test"
```

- [ ] **Step 3: Write `.env.example`**

```bash
# Copy to .env for local dev (.env is gitignored). Use TEST/sandbox values only.
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GHL_API_KEY=
GHL_LOCATION_ID=
STRIPE_SECRET_KEY=sk_test_
STRIPE_WEBHOOK_SECRET=whsec_
```

- [ ] **Step 4: Write the failing test** — `test/idempotency.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderIdempotencyKey, assertPresent } from '../functions/lib/idempotency.js';

test('orderIdempotencyKey is deterministic and namespaced', () => {
  assert.equal(orderIdempotencyKey('stripe', 'pi_123'), 'stripe:pi_123');
  assert.equal(orderIdempotencyKey('stripe', 'pi_123'), orderIdempotencyKey('stripe', 'pi_123'));
});

test('assertPresent throws a named error on empty values', () => {
  assert.throws(() => assertPresent('', 'email'), /email is required/);
  assert.throws(() => assertPresent(undefined, 'contact_id'), /contact_id is required/);
  assert.doesNotThrow(() => assertPresent('ok', 'email'));
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `node --test test/idempotency.test.js`
Expected: FAIL — `Cannot find module '../functions/lib/idempotency.js'`.

- [ ] **Step 6: Write minimal implementation** — `functions/lib/idempotency.js`

```js
export function orderIdempotencyKey(source, sourceId) {
  return `${source}:${sourceId}`;
}

export function assertPresent(value, name) {
  if (value === null || value === undefined || value === '') {
    throw new Error(`${name} is required`);
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `node --test test/idempotency.test.js`
Expected: PASS — 2 tests, 0 failures.

- [ ] **Step 8: Commit**

```bash
git add package.json netlify.toml .env.example functions/lib/idempotency.js test/idempotency.test.js
git commit -m "feat(backbone): scaffold project + idempotency helper"
```

---

### Task 2: Order ledger reducer (pure BI logic)

Implements the spec's "revenue = SUM(paid) − refunds" directly, so the Phase 2 dashboard is later just a query over the same rows.

**Files:**
- Create: `functions/lib/ledger.js`
- Test: `test/ledger.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `reduceOrderStatus(events: Array<{event_type: string}>): 'created'|'paid'|'refunded'|'failed'` — precedence: `refunded` > `paid` > `failed` > `created`.
  - `netRevenueCents(events: Array<{event_type: string, amount_cents: number}>): number` — sum of `paid` amounts minus sum of `refunded` amounts.

- [ ] **Step 1: Write the failing test** — `test/ledger.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduceOrderStatus, netRevenueCents } from '../functions/lib/ledger.js';

test('reduceOrderStatus applies precedence refunded > paid > failed > created', () => {
  assert.equal(reduceOrderStatus([]), 'created');
  assert.equal(reduceOrderStatus([{ event_type: 'created' }]), 'created');
  assert.equal(reduceOrderStatus([{ event_type: 'created' }, { event_type: 'failed' }]), 'failed');
  assert.equal(reduceOrderStatus([{ event_type: 'failed' }, { event_type: 'paid' }]), 'paid');
  assert.equal(reduceOrderStatus([{ event_type: 'paid' }, { event_type: 'refunded' }]), 'refunded');
});

test('netRevenueCents sums paid minus refunded', () => {
  assert.equal(netRevenueCents([]), 0);
  assert.equal(netRevenueCents([
    { event_type: 'paid', amount_cents: 65000 },
    { event_type: 'refunded', amount_cents: 5000 },
    { event_type: 'created', amount_cents: 0 },
  ]), 60000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ledger.test.js`
Expected: FAIL — `Cannot find module '../functions/lib/ledger.js'`.

- [ ] **Step 3: Write minimal implementation** — `functions/lib/ledger.js`

```js
export function reduceOrderStatus(events) {
  const types = new Set(events.map((e) => e.event_type));
  if (types.has('refunded')) return 'refunded';
  if (types.has('paid')) return 'paid';
  if (types.has('failed')) return 'failed';
  return 'created';
}

export function netRevenueCents(events) {
  return events.reduce((sum, e) => {
    if (e.event_type === 'paid') return sum + e.amount_cents;
    if (e.event_type === 'refunded') return sum - e.amount_cents;
    return sum;
  }, 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ledger.test.js`
Expected: PASS — 2 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add functions/lib/ledger.js test/ledger.test.js
git commit -m "feat(backbone): append-only order ledger reducer"
```

---

### Task 3: Stripe event mapping (pure)

Translates raw Stripe webhook events into ledger fields, with no SDK and no network.

**Files:**
- Create: `functions/lib/stripe-events.js`
- Test: `test/stripe-events.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `mapStripeEventType(type: string): 'paid'|'refunded'|'failed'|null` — `payment_intent.succeeded`→`paid`, `charge.refunded`→`refunded`, `payment_intent.payment_failed`→`failed`, anything else→`null`.
  - `extractPaymentIntent(event: object): string|null` — the payment_intent id the event concerns.
  - `amountCentsOf(event: object): number` — the relevant amount in cents.

- [ ] **Step 1: Write the failing test** — `test/stripe-events.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapStripeEventType, extractPaymentIntent, amountCentsOf } from '../functions/lib/stripe-events.js';

test('mapStripeEventType maps the three handled events and ignores others', () => {
  assert.equal(mapStripeEventType('payment_intent.succeeded'), 'paid');
  assert.equal(mapStripeEventType('charge.refunded'), 'refunded');
  assert.equal(mapStripeEventType('payment_intent.payment_failed'), 'failed');
  assert.equal(mapStripeEventType('customer.created'), null);
});

test('extractPaymentIntent reads the id from PI and charge events', () => {
  const pi = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', amount_received: 65000 } } };
  const charge = { type: 'charge.refunded', data: { object: { payment_intent: 'pi_1', amount_refunded: 5000 } } };
  assert.equal(extractPaymentIntent(pi), 'pi_1');
  assert.equal(extractPaymentIntent(charge), 'pi_1');
});

test('amountCentsOf reads the correct amount field per event', () => {
  assert.equal(amountCentsOf({ type: 'payment_intent.succeeded', data: { object: { amount_received: 65000 } } }), 65000);
  assert.equal(amountCentsOf({ type: 'charge.refunded', data: { object: { amount_refunded: 5000 } } }), 5000);
  assert.equal(amountCentsOf({ type: 'payment_intent.payment_failed', data: { object: { amount: 65000 } } }), 65000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/stripe-events.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `functions/lib/stripe-events.js`

```js
const TYPE_MAP = {
  'payment_intent.succeeded': 'paid',
  'charge.refunded': 'refunded',
  'payment_intent.payment_failed': 'failed',
};

export function mapStripeEventType(type) {
  return TYPE_MAP[type] ?? null;
}

export function extractPaymentIntent(event) {
  const obj = event?.data?.object ?? {};
  if (event.type === 'charge.refunded') return obj.payment_intent ?? null;
  return obj.id ?? null;
}

export function amountCentsOf(event) {
  const obj = event?.data?.object ?? {};
  if (event.type === 'payment_intent.succeeded') return obj.amount_received ?? 0;
  if (event.type === 'charge.refunded') return obj.amount_refunded ?? 0;
  if (event.type === 'payment_intent.payment_failed') return obj.amount ?? 0;
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/stripe-events.test.js`
Expected: PASS — 3 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add functions/lib/stripe-events.js test/stripe-events.test.js
git commit -m "feat(backbone): pure Stripe event mapping"
```

---

### Task 4: In-memory fake DB (the `db` port)

Defines the canonical `db` port and provides an in-memory implementation used by every later unit test. Testing the fake itself means downstream tests can trust it.

**Files:**
- Create: `test/helpers/fake-db.js`
- Test: `test/fake-db.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces `createFakeDb(): db` where `db` is the canonical port used by all orchestration (exact signatures — later tasks depend on these names):
  - `findContactByEmail(email: string): Promise<contact|null>`
  - `insertContact({email, full_name, phone, tier, source}): Promise<contact>` — returns `contact = {id, email, full_name, phone, tier, source, ghl_contact_id, created_at}` with `ghl_contact_id: null` initially.
  - `setContactGhlId(contactId: string, ghlContactId: string): Promise<contact>`
  - `findOrderByIdempotencyKey(key: string): Promise<order|null>`
  - `insertOrder({contact_id, type, amount_cents, currency, stripe_payment_intent_id, idempotency_key}): Promise<order>` — `order = {id, contact_id, type, amount_cents, currency, stripe_payment_intent_id, idempotency_key, created_at}`.
  - `findOrderByPaymentIntent(pi: string): Promise<order|null>`
  - `findOrderEventByStripeEventId(stripeEventId: string): Promise<orderEvent|null>`
  - `insertOrderEvent({order_id, event_type, amount_cents, stripe_event_id}): Promise<orderEvent>` — `orderEvent = {id, order_id, event_type, amount_cents, stripe_event_id, occurred_at}`.

- [ ] **Step 1: Write the failing test** — `test/fake-db.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb } from './helpers/fake-db.js';

test('fake db inserts and finds a contact by email', async () => {
  const db = createFakeDb();
  assert.equal(await db.findContactByEmail('a@x.com'), null);
  const c = await db.insertContact({ email: 'a@x.com', full_name: 'A', phone: '1', tier: 'free', source: 'site' });
  assert.ok(c.id);
  assert.equal(c.ghl_contact_id, null);
  assert.equal((await db.findContactByEmail('a@x.com')).id, c.id);
});

test('fake db sets ghl id on a contact', async () => {
  const db = createFakeDb();
  const c = await db.insertContact({ email: 'a@x.com', full_name: 'A', phone: '1', tier: 'free', source: 'site' });
  const updated = await db.setContactGhlId(c.id, 'ghl_9');
  assert.equal(updated.ghl_contact_id, 'ghl_9');
});

test('fake db enforces order idempotency lookup and payment-intent lookup', async () => {
  const db = createFakeDb();
  const o = await db.insertOrder({ contact_id: 'c1', type: 'membership', amount_cents: 65000, currency: 'usd', stripe_payment_intent_id: 'pi_1', idempotency_key: 'stripe:pi_1' });
  assert.equal((await db.findOrderByIdempotencyKey('stripe:pi_1')).id, o.id);
  assert.equal((await db.findOrderByPaymentIntent('pi_1')).id, o.id);
  assert.equal(await db.findOrderByIdempotencyKey('nope'), null);
});

test('fake db records order events and finds them by stripe event id', async () => {
  const db = createFakeDb();
  const oe = await db.insertOrderEvent({ order_id: 'o1', event_type: 'paid', amount_cents: 65000, stripe_event_id: 'evt_1' });
  assert.ok(oe.id);
  assert.equal((await db.findOrderEventByStripeEventId('evt_1')).id, oe.id);
  assert.equal(await db.findOrderEventByStripeEventId('evt_none'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/fake-db.test.js`
Expected: FAIL — `Cannot find module './helpers/fake-db.js'`.

- [ ] **Step 3: Write minimal implementation** — `test/helpers/fake-db.js`

```js
let counter = 0;
const id = (p) => `${p}_${++counter}`;
const nowIso = () => new Date(0).toISOString(); // deterministic for tests

export function createFakeDb() {
  const contacts = [];
  const orders = [];
  const orderEvents = [];

  return {
    async findContactByEmail(email) {
      return contacts.find((c) => c.email === email) ?? null;
    },
    async insertContact({ email, full_name, phone, tier, source }) {
      const c = { id: id('c'), email, full_name, phone, tier, source, ghl_contact_id: null, created_at: nowIso() };
      contacts.push(c);
      return c;
    },
    async setContactGhlId(contactId, ghlContactId) {
      const c = contacts.find((x) => x.id === contactId);
      c.ghl_contact_id = ghlContactId;
      return c;
    },
    async findOrderByIdempotencyKey(key) {
      return orders.find((o) => o.idempotency_key === key) ?? null;
    },
    async insertOrder(input) {
      const o = { id: id('o'), created_at: nowIso(), ...input };
      orders.push(o);
      return o;
    },
    async findOrderByPaymentIntent(pi) {
      return orders.find((o) => o.stripe_payment_intent_id === pi) ?? null;
    },
    async findOrderEventByStripeEventId(stripeEventId) {
      return orderEvents.find((e) => e.stripe_event_id === stripeEventId) ?? null;
    },
    async insertOrderEvent(input) {
      const e = { id: id('oe'), occurred_at: nowIso(), ...input };
      orderEvents.push(e);
      return e;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/fake-db.test.js`
Expected: PASS — 4 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add test/helpers/fake-db.js test/fake-db.test.js
git commit -m "test(backbone): in-memory fake db implementing the db port"
```

---

### Task 5: `createContact` orchestration (fact → GHL push)

**Files:**
- Create: `functions/lib/contacts.js`
- Test: `test/contacts.test.js`

**Interfaces:**
- Consumes: the `db` port (Task 4); a `ghl` port with `upsertContact({email, full_name, phone}): Promise<string>` returning the GHL contact id.
- Produces: `createContact({db, ghl}, input): Promise<contact>` — idempotent by email; writes the Supabase fact first, then pushes to GHL, then stores `ghl_contact_id`. Throws `email is required` when `input.email` is empty.

- [ ] **Step 1: Write the failing test** — `test/contacts.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContact } from '../functions/lib/contacts.js';
import { createFakeDb } from './helpers/fake-db.js';

function fakeGhl() {
  const calls = [];
  return {
    calls,
    async upsertContact(input) { calls.push(input); return 'ghl_new'; },
  };
}

test('createContact writes fact first, then pushes to GHL, then stores ghl id', async () => {
  const db = createFakeDb();
  const ghl = fakeGhl();
  const c = await createContact({ db, ghl }, { email: 'a@x.com', full_name: 'A', phone: '1', tier: 'free', source: 'site' });
  assert.equal(c.email, 'a@x.com');
  assert.equal(c.ghl_contact_id, 'ghl_new');
  assert.equal(ghl.calls.length, 1);
  assert.equal(ghl.calls[0].email, 'a@x.com');
});

test('createContact is idempotent by email and does not re-push to GHL', async () => {
  const db = createFakeDb();
  const ghl = fakeGhl();
  const first = await createContact({ db, ghl }, { email: 'a@x.com', full_name: 'A', phone: '1', tier: 'free', source: 'site' });
  const second = await createContact({ db, ghl }, { email: 'a@x.com', full_name: 'A', phone: '1', tier: 'free', source: 'site' });
  assert.equal(second.id, first.id);
  assert.equal(ghl.calls.length, 1); // not called again
});

test('createContact requires an email', async () => {
  const db = createFakeDb();
  const ghl = fakeGhl();
  await assert.rejects(() => createContact({ db, ghl }, { email: '' }), /email is required/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/contacts.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `functions/lib/contacts.js`

```js
import { assertPresent } from './idempotency.js';

export async function createContact({ db, ghl }, input) {
  assertPresent(input.email, 'email');

  const existing = await db.findContactByEmail(input.email);
  if (existing) return existing;

  const contact = await db.insertContact({
    email: input.email,
    full_name: input.full_name ?? null,
    phone: input.phone ?? null,
    tier: input.tier ?? 'free',
    source: input.source ?? 'site',
  });

  const ghlId = await ghl.upsertContact({
    email: contact.email,
    full_name: contact.full_name,
    phone: contact.phone,
  });

  return db.setContactGhlId(contact.id, ghlId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/contacts.test.js`
Expected: PASS — 3 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add functions/lib/contacts.js test/contacts.test.js
git commit -m "feat(backbone): createContact writes fact then pushes to GHL"
```

---

### Task 6: `recordStripeEvent` orchestration (idempotent ledger write)

**Files:**
- Create: `functions/lib/orders.js`
- Test: `test/orders.test.js`

**Interfaces:**
- Consumes: the `db` port (Task 4); the pure helpers from Task 3.
- Produces: `recordStripeEvent({db}, event): Promise<{status, orderEvent?}>` where `status` is one of `'recorded'|'duplicate'|'no_order'|'ignored'`. Idempotent on `event.id`. Writes to the append-only `order_events` ledger only.

- [ ] **Step 1: Write the failing test** — `test/orders.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordStripeEvent } from '../functions/lib/orders.js';
import { createFakeDb } from './helpers/fake-db.js';

function paidEvent(id, pi, amount) {
  return { id, type: 'payment_intent.succeeded', data: { object: { id: pi, amount_received: amount } } };
}

test('recordStripeEvent writes a paid ledger row for a known order', async () => {
  const db = createFakeDb();
  await db.insertOrder({ contact_id: 'c1', type: 'membership', amount_cents: 65000, currency: 'usd', stripe_payment_intent_id: 'pi_1', idempotency_key: 'stripe:pi_1' });
  const res = await recordStripeEvent({ db }, paidEvent('evt_1', 'pi_1', 65000));
  assert.equal(res.status, 'recorded');
  assert.equal(res.orderEvent.event_type, 'paid');
  assert.equal(res.orderEvent.amount_cents, 65000);
});

test('recordStripeEvent is idempotent on event id', async () => {
  const db = createFakeDb();
  await db.insertOrder({ contact_id: 'c1', type: 'membership', amount_cents: 65000, currency: 'usd', stripe_payment_intent_id: 'pi_1', idempotency_key: 'stripe:pi_1' });
  await recordStripeEvent({ db }, paidEvent('evt_1', 'pi_1', 65000));
  const again = await recordStripeEvent({ db }, paidEvent('evt_1', 'pi_1', 65000));
  assert.equal(again.status, 'duplicate');
});

test('recordStripeEvent returns no_order when the payment intent is unknown', async () => {
  const db = createFakeDb();
  const res = await recordStripeEvent({ db }, paidEvent('evt_1', 'pi_missing', 65000));
  assert.equal(res.status, 'no_order');
});

test('recordStripeEvent ignores unmapped event types', async () => {
  const db = createFakeDb();
  const res = await recordStripeEvent({ db }, { id: 'evt_9', type: 'customer.created', data: { object: {} } });
  assert.equal(res.status, 'ignored');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/orders.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `functions/lib/orders.js`

```js
import { mapStripeEventType, extractPaymentIntent, amountCentsOf } from './stripe-events.js';

export async function recordStripeEvent({ db }, event) {
  const duplicate = await db.findOrderEventByStripeEventId(event.id);
  if (duplicate) return { status: 'duplicate', orderEvent: duplicate };

  const eventType = mapStripeEventType(event.type);
  if (!eventType) return { status: 'ignored' };

  const pi = extractPaymentIntent(event);
  const order = pi ? await db.findOrderByPaymentIntent(pi) : null;
  if (!order) return { status: 'no_order' };

  const orderEvent = await db.insertOrderEvent({
    order_id: order.id,
    event_type: eventType,
    amount_cents: amountCentsOf(event),
    stripe_event_id: event.id,
  });
  return { status: 'recorded', orderEvent };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/orders.test.js`
Expected: PASS — 4 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add functions/lib/orders.js test/orders.test.js
git commit -m "feat(backbone): idempotent Stripe event -> order ledger"
```

---

### Task 7: GHL client (fetch-based, injectable)

**Files:**
- Create: `functions/lib/ghl.js`
- Test: `test/ghl.test.js`

**Interfaces:**
- Consumes: nothing (takes an injectable `fetchImpl`, defaulting to global `fetch`).
- Produces: `createGhlClient({apiKey, locationId, baseUrl?, fetchImpl?}): ghl` implementing `upsertContact({email, full_name, phone}): Promise<string>` (the `ghl` port from Task 5). Throws on non-2xx.

- [ ] **Step 1: Write the failing test** — `test/ghl.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGhlClient } from '../functions/lib/ghl.js';

function fakeFetch(response) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return response;
  };
  return { fetchImpl, calls };
}

test('upsertContact posts to GHL with auth + location and returns the contact id', async () => {
  const { fetchImpl, calls } = fakeFetch({
    ok: true,
    status: 200,
    json: async () => ({ contact: { id: 'ghl_123' } }),
  });
  const ghl = createGhlClient({ apiKey: 'k', locationId: 'loc_1', fetchImpl });
  const id = await ghl.upsertContact({ email: 'a@x.com', full_name: 'A', phone: '1' });
  assert.equal(id, 'ghl_123');
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.email, 'a@x.com');
  assert.equal(body.locationId, 'loc_1');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer k');
});

test('upsertContact throws on a non-2xx response', async () => {
  const { fetchImpl } = fakeFetch({ ok: false, status: 401, json: async () => ({}) });
  const ghl = createGhlClient({ apiKey: 'k', locationId: 'loc_1', fetchImpl });
  await assert.rejects(() => ghl.upsertContact({ email: 'a@x.com' }), /GHL upsert failed: 401/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ghl.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `functions/lib/ghl.js`

```js
export function createGhlClient({ apiKey, locationId, baseUrl = 'https://services.leadconnectorhq.com', fetchImpl = fetch }) {
  return {
    async upsertContact({ email, full_name, phone }) {
      const res = await fetchImpl(`${baseUrl}/contacts/upsert`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Version: '2021-07-28',
        },
        body: JSON.stringify({ locationId, email, name: full_name ?? undefined, phone: phone ?? undefined }),
      });
      if (!res.ok) throw new Error(`GHL upsert failed: ${res.status}`);
      const data = await res.json();
      return data.contact?.id ?? data.id;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ghl.test.js`
Expected: PASS — 2 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add functions/lib/ghl.js test/ghl.test.js
git commit -m "feat(backbone): fetch-based GHL client with injectable fetch"
```

---

### Task 8: Netlify Function handlers (contact-create + stripe-webhook)

Thin HTTP glue, made testable via handler factories that take injected dependencies. Uses Web-standard `Request`/`Response` (global in Node 24).

**Files:**
- Create: `functions/lib/http.js`
- Create: `functions/lib/handlers.js`
- Test: `test/handlers.test.js`

**Interfaces:**
- Consumes: `createContact` (Task 5), `recordStripeEvent` (Task 6), the `db`/`ghl` ports.
- Produces:
  - `json(data, status): Response` helper.
  - `makeContactCreateHandler({createContact, deps}): (req: Request) => Promise<Response>` — 405 for non-POST, 400 `email_required` for missing email, 201 with `{id, ghl_contact_id}` on success.
  - `makeStripeWebhookHandler({recordStripeEvent, deps, verify}): (req: Request) => Promise<Response>` — `verify(rawBody, signature)` returns the parsed Stripe event or throws; 400 on verify failure; 200 with `{status}` otherwise.

- [ ] **Step 1: Write the failing test** — `test/handlers.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeContactCreateHandler, makeStripeWebhookHandler } from '../functions/lib/handlers.js';

function req(method, body, headers = {}) {
  return new Request('http://local/fn', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('contact-create handler returns 201 and the created contact', async () => {
  const handler = makeContactCreateHandler({
    createContact: async (_deps, input) => ({ id: 'c_1', ghl_contact_id: 'ghl_1', email: input.email }),
    deps: {},
  });
  const res = await handler(req('POST', { email: 'a@x.com' }));
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { id: 'c_1', ghl_contact_id: 'ghl_1' });
});

test('contact-create handler rejects non-POST and missing email', async () => {
  const handler = makeContactCreateHandler({ createContact: async () => ({}), deps: {} });
  assert.equal((await handler(req('GET'))).status, 405);
  const bad = await handler(req('POST', {}));
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: 'email_required' });
});

test('stripe-webhook handler verifies signature then records the event', async () => {
  const recorded = [];
  const handler = makeStripeWebhookHandler({
    recordStripeEvent: async (_deps, event) => { recorded.push(event); return { status: 'recorded' }; },
    deps: {},
    verify: (_raw, sig) => {
      if (sig !== 'good') throw new Error('bad sig');
      return { id: 'evt_1', type: 'payment_intent.succeeded', data: { object: {} } };
    },
  });
  const ok = await handler(req('POST', { any: 'payload' }, { 'stripe-signature': 'good' }));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { status: 'recorded' });
  assert.equal(recorded.length, 1);

  const bad = await handler(req('POST', { any: 'payload' }, { 'stripe-signature': 'bad' }));
  assert.equal(bad.status, 400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/handlers.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `functions/lib/http.js`**

```js
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 4: Write `functions/lib/handlers.js`**

```js
import { json } from './http.js';

export function makeContactCreateHandler({ createContact, deps }) {
  return async (req) => {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    let body;
    try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    if (!body?.email) return json({ error: 'email_required' }, 400);
    const contact = await createContact(deps, body);
    return json({ id: contact.id, ghl_contact_id: contact.ghl_contact_id }, 201);
  };
}

export function makeStripeWebhookHandler({ recordStripeEvent, deps, verify }) {
  return async (req) => {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    const raw = await req.text();
    const sig = req.headers.get('stripe-signature');
    let event;
    try { event = verify(raw, sig); } catch { return json({ error: 'invalid_signature' }, 400); }
    const result = await recordStripeEvent(deps, event);
    return json({ status: result.status }, 200);
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/handlers.test.js`
Expected: PASS — 3 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add functions/lib/http.js functions/lib/handlers.js test/handlers.test.js
git commit -m "feat(backbone): testable Netlify handler factories"
```

---

### Task 9: Supabase schema migration + structural test

TDD for raw SQL uses a structural assertion: the test reads the migration file and asserts every spec-required table, ledger, and constraint is present. This catches drift from the spec without needing a live database.

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Test: `test/schema.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: the `0001_init.sql` migration implementing §8 of the spec.

- [ ] **Step 1: Write the failing test** — `test/schema.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/0001_init.sql', import.meta.url), 'utf8').toLowerCase();

test('schema declares every spec-required table', () => {
  for (const table of ['contacts', 'memberships', 'membership_events', 'events', 'orders', 'order_events', 'tickets', 'event_attendance', 'sponsors']) {
    assert.ok(sql.includes(`create table ${table}`) || sql.includes(`create table if not exists ${table}`), `missing table: ${table}`);
  }
});

test('money is integer cents and timestamps are timestamptz', () => {
  assert.ok(sql.includes('amount_cents'), 'orders/order_events must use amount_cents');
  assert.ok(!/amount\s+numeric|amount\s+decimal|amount\s+float/.test(sql), 'no float/decimal money columns allowed');
  assert.ok(sql.includes('timestamptz'), 'timestamps must be timestamptz');
});

test('idempotency + join key constraints exist', () => {
  assert.ok(sql.includes('ghl_contact_id'), 'contacts must carry ghl_contact_id');
  assert.ok(/idempotency_key[^;]*unique|unique[^;]*idempotency_key/.test(sql), 'orders.idempotency_key must be unique');
  assert.ok(/stripe_event_id[^;]*unique|unique[^;]*stripe_event_id/.test(sql), 'order_events.stripe_event_id must be unique');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/schema.test.js`
Expected: FAIL — `ENOENT` (file does not exist).

- [ ] **Step 3: Write minimal implementation** — `supabase/migrations/0001_init.sql`

```sql
-- PWRHaus Phase 1 data backbone. BI-ready: integer cents, timestamptz UTC,
-- append-only ledgers, idempotency + ghl_contact_id join key.

create table contacts (
  id              uuid primary key default gen_random_uuid(),
  ghl_contact_id  text unique,
  email           text not null unique,
  full_name       text,
  phone           text,
  tier            text not null default 'free' check (tier in ('free','member','inner_circle')),
  source          text,
  created_at      timestamptz not null default now()
);

create table memberships (
  id                     uuid primary key default gen_random_uuid(),
  contact_id             uuid not null references contacts(id),
  tier                   text not null,
  stripe_subscription_id text,
  current_status         text not null default 'active' check (current_status in ('active','lapsed','cancelled')),
  started_at             timestamptz not null default now(),
  current_period_end     timestamptz
);

create table membership_events (
  id             uuid primary key default gen_random_uuid(),
  membership_id  uuid not null references memberships(id),
  event_type     text not null check (event_type in ('created','activated','renewed','lapsed','cancelled')),
  occurred_at    timestamptz not null default now(),
  stripe_event_id text unique
);

create table events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text,
  capacity    int,
  price_cents int not null default 0,
  currency    text not null default 'usd',
  starts_at   timestamptz,
  published   boolean not null default false
);

create table orders (
  id                       uuid primary key default gen_random_uuid(),
  contact_id               uuid not null references contacts(id),
  type                     text not null check (type in ('membership','event','sponsorship','merch')),
  amount_cents             int not null,
  currency                 text not null default 'usd',
  stripe_payment_intent_id text,
  idempotency_key          text not null unique,
  current_status           text not null default 'created' check (current_status in ('created','paid','refunded','failed')),
  created_at               timestamptz not null default now()
);

create table order_events (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id),
  event_type      text not null check (event_type in ('created','paid','refunded','failed')),
  amount_cents    int not null default 0,
  occurred_at     timestamptz not null default now(),
  stripe_event_id text not null unique
);

create table tickets (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id),
  event_id   uuid not null references events(id),
  contact_id uuid not null references contacts(id),
  status     text not null default 'valid' check (status in ('valid','refunded')),
  created_at timestamptz not null default now()
);

create table event_attendance (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references tickets(id),
  event_id    uuid not null references events(id),
  contact_id  uuid not null references contacts(id),
  attended_at timestamptz not null default now()
);

create table sponsors (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id),
  tier       text check (tier in ('social_tee','hole_in_one','double_eagle')),
  status     text,
  created_at timestamptz not null default now()
);

create index on orders (contact_id);
create index on order_events (order_id);
create index on tickets (event_id);
create index on event_attendance (event_id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/schema.test.js`
Expected: PASS — 3 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_init.sql test/schema.test.js
git commit -m "feat(backbone): BI-ready Supabase schema migration"
```

---

### Task 10: Real adapters + env wiring + integration smoke

Wires the pure logic to the real services and verifies against live **test-mode** creds. Network adapters are not unit-tested; they are verified by a documented smoke. This task ends with the two Netlify entry points and a passing manual smoke.

**Files:**
- Create: `functions/lib/supabase.js`
- Create: `functions/lib/stripe.js`
- Create: `functions/lib/deps.js`
- Create: `functions/contact-create.js`
- Create: `functions/stripe-webhook.js`
- Create: `docs/superpowers/plans/backbone-integration-smoke.md`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `createSupabaseDb(env): db` — the `db` port over `@supabase/supabase-js`.
  - `createStripeVerifier(env): (rawBody, signature) => event` — wraps `stripe.webhooks.constructEvent`.
  - `buildDeps(env): {db, ghl}` and `buildStripeDeps(env): {db}`.
  - Netlify v2 default-export handlers at `functions/contact-create.js` and `functions/stripe-webhook.js`.

- [ ] **Step 1: Write `functions/lib/supabase.js`**

```js
import { createClient } from '@supabase/supabase-js';

export function createSupabaseDb(env) {
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const one = async (q) => { const { data, error } = await q; if (error) throw error; return data; };
  const maybe = async (q) => { const { data, error } = await q.maybeSingle(); if (error) throw error; return data ?? null; };

  return {
    findContactByEmail: (email) => maybe(sb.from('contacts').select('*').eq('email', email)),
    insertContact: (input) => one(sb.from('contacts').insert(input).select().single()),
    setContactGhlId: (id, ghlId) => one(sb.from('contacts').update({ ghl_contact_id: ghlId }).eq('id', id).select().single()),
    findOrderByIdempotencyKey: (key) => maybe(sb.from('orders').select('*').eq('idempotency_key', key)),
    insertOrder: (input) => one(sb.from('orders').insert(input).select().single()),
    findOrderByPaymentIntent: (pi) => maybe(sb.from('orders').select('*').eq('stripe_payment_intent_id', pi)),
    findOrderEventByStripeEventId: (evtId) => maybe(sb.from('order_events').select('*').eq('stripe_event_id', evtId)),
    insertOrderEvent: (input) => one(sb.from('order_events').insert(input).select().single()),
  };
}
```

- [ ] **Step 2: Write `functions/lib/stripe.js`**

```js
import Stripe from 'stripe';

export function createStripeVerifier(env) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  return (rawBody, signature) => stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}
```

- [ ] **Step 3: Write `functions/lib/deps.js`**

```js
import { createSupabaseDb } from './supabase.js';
import { createGhlClient } from './ghl.js';

export function buildDeps(env) {
  return {
    db: createSupabaseDb(env),
    ghl: createGhlClient({ apiKey: env.GHL_API_KEY, locationId: env.GHL_LOCATION_ID }),
  };
}

export function buildStripeDeps(env) {
  return { db: createSupabaseDb(env) };
}
```

- [ ] **Step 4: Write `functions/contact-create.js`**

```js
import { makeContactCreateHandler } from './lib/handlers.js';
import { createContact } from './lib/contacts.js';
import { buildDeps } from './lib/deps.js';

export default async (req) => {
  const handler = makeContactCreateHandler({ createContact, deps: buildDeps(process.env) });
  return handler(req);
};

export const config = { path: '/api/contacts' };
```

- [ ] **Step 5: Write `functions/stripe-webhook.js`**

```js
import { makeStripeWebhookHandler } from './lib/handlers.js';
import { recordStripeEvent } from './lib/orders.js';
import { buildStripeDeps } from './lib/deps.js';
import { createStripeVerifier } from './lib/stripe.js';

export default async (req) => {
  const handler = makeStripeWebhookHandler({
    recordStripeEvent,
    deps: buildStripeDeps(process.env),
    verify: createStripeVerifier(process.env),
  });
  return handler(req);
};

export const config = { path: '/api/stripe-webhook' };
```

- [ ] **Step 6: Write the smoke checklist** — `docs/superpowers/plans/backbone-integration-smoke.md`

```markdown
# Backbone integration smoke (test-mode only)

Prereqs: a Supabase test project, GHL sandbox location, Stripe TEST keys,
`stripe` CLI installed, `netlify-cli` installed (`npm i -g netlify-cli`).

1. Apply the migration to the Supabase test project:
   - Supabase SQL editor → paste `supabase/migrations/0001_init.sql` → Run.
2. Create `.env` from `.env.example` with TEST values.
3. `netlify dev` (serves functions at http://localhost:8888).
4. Contact create:
   - `curl -sX POST localhost:8888/api/contacts -H 'content-type: application/json' -d '{"email":"smoke@x.com","full_name":"Smoke"}'`
   - Expect `201 {"id":"...","ghl_contact_id":"..."}`. Verify the row in Supabase `contacts` and the contact in GHL.
   - Re-run the same curl → still 201, SAME id, no duplicate GHL contact (idempotency).
5. Stripe webhook:
   - Seed an order row in Supabase with `stripe_payment_intent_id='pi_smoke'`, `idempotency_key='stripe:pi_smoke'`.
   - `stripe listen --forward-to localhost:8888/api/stripe-webhook`
   - `stripe trigger payment_intent.succeeded` (or send a crafted event for `pi_smoke`).
   - Expect a new `order_events` row with `event_type='paid'`; replaying the same event id creates NO second row.
6. Record PASS/FAIL for each step here before marking Task 10 done.
```

- [ ] **Step 7: Run the full unit suite (regression gate)**

Run: `node --test`
Expected: PASS — all tests from Tasks 1–9, 0 failures.

- [ ] **Step 8: Run the integration smoke**

Follow `docs/superpowers/plans/backbone-integration-smoke.md` end to end against test-mode creds. All six steps must pass. This is the deliverable's real verification — network adapters have no unit tests.

- [ ] **Step 9: Commit**

```bash
git add functions/lib/supabase.js functions/lib/stripe.js functions/lib/deps.js functions/contact-create.js functions/stripe-webhook.js docs/superpowers/plans/backbone-integration-smoke.md
git commit -m "feat(backbone): real Supabase/Stripe adapters + Netlify entry points"
```

---

## Self-Review

**1. Spec coverage (§ from the design spec):**
- §2 source-of-truth "write fact then push to GHL" → Task 5 (`createContact`). ✅
- §2 idempotency + `ghl_contact_id` join key → Tasks 1, 4, 6, 9. ✅
- §2 Stripe standalone / test creds → Global Constraints + Task 10. ✅
- §3 Map A payment leg (Stripe-direct, refund as ledger event) → Tasks 3, 6 (`paid`/`refunded`/`failed`). ✅
- §8 schema (all 9 tables, append-only ledgers, cents, timestamptz, unique keys) → Task 9. ✅
- §8 "revenue = SUM(paid) − refunds" → Task 2 (`netRevenueCents`). ✅
- **Deferred, correctly out of scope:** nightly GHL→Supabase backup pull, sponsor automation (§4c), membership subscription lifecycle wiring (belongs to Plan D — schema is present here, orchestration is not). Noted, not a gap.

**2. Placeholder scan:** No TBD/TODO; every code step has complete, runnable code; every test has real assertions. ✅

**3. Type consistency:** The `db` port method names and shapes defined in Task 4 are used identically in Tasks 5, 6, 10. The `ghl.upsertContact` signature matches between Task 5 (consumer), Task 7 (producer), and Task 10 (wiring). Stripe helper names (`mapStripeEventType`, `extractPaymentIntent`, `amountCentsOf`) match between Task 3 and Task 6. `json()` matches between Task 8 producer and its consumers. ✅
