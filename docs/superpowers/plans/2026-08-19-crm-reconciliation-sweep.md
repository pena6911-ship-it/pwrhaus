# CRM Reconciliation Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tested Supabase-to-GoHighLevel reconciliation sweep that retries contacts whose `ghl_contact_id` is still null.

**Architecture:** Add a focused reconciliation library that consumes the existing database and GHL adapters. Extend the Supabase adapter with a capped oldest-first stranded-contact query. Expose the sweep through a protected manual Netlify endpoint and a daily scheduled run.

**Tech Stack:** Eleventy static site, Netlify Functions v2 using default export + `config`, Node ESM, `node:test`, Supabase JS, existing GHL LeadConnector client wrapper.

**Spec:** `docs/superpowers/specs/2026-08-19-crm-data-hardening-reconciliation-design.md`

## Global Constraints

- Supabase remains the fact store; GHL remains downstream CRM/portal automation.
- Do not change public website forms, portal UI, GHL workflows, or membership offer configuration.
- Default batch limit is `25`.
- Maximum accepted batch limit is `100`.
- Manual endpoint is `POST /api/admin/reconcile-contacts`.
- Manual endpoint requires `RECONCILE_ADMIN_TOKEN` and `Authorization: Bearer <token>`.
- Daily schedule is `@daily`.
- Partial per-contact failures return HTTP 200 with failure details; pre-batch database failures return HTTP 500.
- Keep `npm test` green.
- Use `git add -u`; add new files by explicit path.

---

## File Structure

- Create `functions/lib/contact-reconciliation.js`: pure reconciliation orchestration; no HTTP or environment parsing.
- Modify `functions/lib/supabase.js`: add `findContactsMissingGhlId({ limit })`.
- Modify `test/helpers/fake-db.js`: add stranded-contact query support for unit tests.
- Create `test/contact-reconciliation.test.js`: TDD coverage for linking, partial failures, capped batches, and already-linked exclusion through the fake DB query.
- Modify `functions/lib/handlers.js`: add `makeContactReconcileHandler()` for token/method handling and summary responses.
- Create `functions/contact-reconcile.js`: protected manual Netlify function wiring with path.
- Create `functions/contact-reconcile-scheduled.js`: daily Netlify scheduled function wiring with no public path.
- Modify `test/handlers.test.js`: handler tests for bearer-token rejection and success.
- Modify `.env.example`: document `RECONCILE_ADMIN_TOKEN=`.
- Modify `docs/operations/ghl-member-portal-checklist.md`: add the operational note for reconciliation after implementation.

---

### Task 1: Reconciliation Library

**Files:**
- Create: `functions/lib/contact-reconciliation.js`
- Modify: `test/helpers/fake-db.js`
- Create: `test/contact-reconciliation.test.js`

**Interfaces:**
- Consumes: `db.findContactsMissingGhlId({ limit })`, `db.setContactGhlId(contactId, ghlId)`, `ghl.upsertContact(contact)`
- Produces: `reconcileContacts({ db, ghl, log }, options)`
- Return shape:

```js
{
  processed: number,
  linked: number,
  failed: number,
  failures: Array<{ contact_id: string, email: string, error: string }>
}
```

- [ ] **Step 1: Write the failing reconciliation tests**

Create `test/contact-reconciliation.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileContacts } from '../functions/lib/contact-reconciliation.js';
import { createFakeDb } from './helpers/fake-db.js';

function fakeGhl({ failEmails = new Set() } = {}) {
  const calls = [];
  return {
    calls,
    async upsertContact(input) {
      calls.push(input);
      if (failEmails.has(input.email)) throw new Error('GHL upsert failed: 503');
      return `ghl_${input.email}`;
    },
  };
}

const silentLog = { info() {}, warn() {}, error() {} };

test('reconcileContacts links stranded contacts through GHL', async () => {
  const db = createFakeDb();
  await db.insertContact({
    email: 'a@x.com',
    full_name: 'A',
    phone: '1',
    tier: 'free',
    source: 'web_free_profile',
    notes: null,
  });
  const ghl = fakeGhl();

  const result = await reconcileContacts({ db, ghl, log: silentLog }, { limit: 25 });

  assert.deepEqual(result, { processed: 1, linked: 1, failed: 0, failures: [] });
  assert.equal(ghl.calls.length, 1);
  assert.deepEqual(ghl.calls[0], {
    email: 'a@x.com',
    full_name: 'A',
    phone: '1',
    tier: 'free',
    source: 'web_free_profile',
  });
  const healed = await db.findContactByEmail('a@x.com');
  assert.equal(healed.ghl_contact_id, 'ghl_a@x.com');
});

test('fake DB stranded query excludes contacts that already have a GHL id', async () => {
  const db = createFakeDb();
  const linked = await db.insertContact({
    email: 'linked@x.com',
    full_name: 'Linked',
    phone: null,
    tier: 'free',
    source: 'site',
    notes: null,
  });
  await db.setContactGhlId(linked.id, 'ghl_existing');
  await db.insertContact({
    email: 'stranded@x.com',
    full_name: 'Stranded',
    phone: null,
    tier: 'free',
    source: 'site',
    notes: null,
  });

  const rows = await db.findContactsMissingGhlId({ limit: 25 });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, 'stranded@x.com');
});

test('reconcileContacts continues when one GHL push fails', async () => {
  const db = createFakeDb();
  await db.insertContact({
    email: 'fail@x.com',
    full_name: 'Fail',
    phone: null,
    tier: 'free',
    source: 'site',
    notes: null,
  });
  await db.insertContact({
    email: 'ok@x.com',
    full_name: 'Ok',
    phone: null,
    tier: 'free',
    source: 'site',
    notes: null,
  });
  const logs = [];
  const log = { info() {}, warn() {}, error(...args) { logs.push(args); } };
  const ghl = fakeGhl({ failEmails: new Set(['fail@x.com']) });

  const result = await reconcileContacts({ db, ghl, log }, { limit: 25 });

  assert.equal(result.processed, 2);
  assert.equal(result.linked, 1);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.failures, [
    { contact_id: 'c_1', email: 'fail@x.com', error: 'GHL upsert failed: 503' },
  ]);
  assert.equal((await db.findContactByEmail('fail@x.com')).ghl_contact_id, null);
  assert.equal((await db.findContactByEmail('ok@x.com')).ghl_contact_id, 'ghl_ok@x.com');
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], 'contact.reconcile_failed');
});

test('reconcileContacts caps requested limit at 100', async () => {
  const db = createFakeDb();
  for (let i = 0; i < 105; i += 1) {
    await db.insertContact({
      email: `lead${i}@x.com`,
      full_name: `Lead ${i}`,
      phone: null,
      tier: 'free',
      source: 'site',
      notes: null,
    });
  }
  const ghl = fakeGhl();

  const result = await reconcileContacts({ db, ghl, log: silentLog }, { limit: 500 });

  assert.equal(result.processed, 100);
  assert.equal(result.linked, 100);
  assert.equal(ghl.calls.length, 100);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test test/contact-reconciliation.test.js
```

Expected: FAIL because `functions/lib/contact-reconciliation.js` does not exist.

- [ ] **Step 3: Add fake DB stranded-query support**

Modify `test/helpers/fake-db.js` inside the returned object:

```js
async findContactsMissingGhlId({ limit }) {
  return contacts
    .filter((c) => c.ghl_contact_id == null)
    .slice(0, limit);
},
```

- [ ] **Step 4: Implement the reconciliation library**

Create `functions/lib/contact-reconciliation.js`:

```js
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export function normalizeReconcileLimit(limit) {
  const parsed = Number.parseInt(String(limit ?? DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

export async function reconcileContacts({ db, ghl, log = console }, options = {}) {
  const limit = normalizeReconcileLimit(options.limit);
  const contacts = await db.findContactsMissingGhlId({ limit });
  const failures = [];
  let linked = 0;

  for (const contact of contacts) {
    try {
      const ghlId = await ghl.upsertContact({
        email: contact.email,
        full_name: contact.full_name,
        phone: contact.phone,
        tier: contact.tier,
        source: contact.source,
      });
      const updated = await db.setContactGhlId(contact.id, ghlId);
      if (updated) linked += 1;
      else throw new Error('contact row disappeared before GHL id could be stored');
    } catch (err) {
      const failure = {
        contact_id: contact.id,
        email: contact.email,
        error: err?.message ?? 'unknown reconciliation error',
      };
      failures.push(failure);
      log.error?.('contact.reconcile_failed', failure);
    }
  }

  return {
    processed: contacts.length,
    linked,
    failed: failures.length,
    failures,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:

```bash
node --test test/contact-reconciliation.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add functions/lib/contact-reconciliation.js test/contact-reconciliation.test.js
git add -u
git commit -m "feat: add contact reconciliation library"
```

---

### Task 2: Supabase Adapter Query

**Files:**
- Modify: `functions/lib/supabase.js`
- Test: `test/contact-reconciliation.test.js`

**Interfaces:**
- Consumes: existing `createSupabaseDb(env)` adapter pattern.
- Produces: `db.findContactsMissingGhlId({ limit })`.

- [ ] **Step 1: Add a focused adapter-shape test**

Append to `test/contact-reconciliation.test.js`:

```js
test('normalizeReconcileLimit defaults invalid limits and caps large limits', async () => {
  const { normalizeReconcileLimit } = await import('../functions/lib/contact-reconciliation.js');

  assert.equal(normalizeReconcileLimit(undefined), 25);
  assert.equal(normalizeReconcileLimit('bad'), 25);
  assert.equal(normalizeReconcileLimit(0), 25);
  assert.equal(normalizeReconcileLimit(7), 7);
  assert.equal(normalizeReconcileLimit(500), 100);
});
```

This test protects the limit value the Supabase adapter receives.

- [ ] **Step 2: Run the focused test**

Run:

```bash
node --test test/contact-reconciliation.test.js
```

Expected: PASS if Task 1 exported `normalizeReconcileLimit`; otherwise FAIL and export it.

- [ ] **Step 3: Implement the Supabase query**

Modify `functions/lib/supabase.js` returned object, after `findContactByEmail`:

```js
findContactsMissingGhlId: ({ limit }) => one(
  sb
    .from('contacts')
    .select('id,email,full_name,phone,tier,source,ghl_contact_id,created_at')
    .is('ghl_contact_id', null)
    .order('created_at', { ascending: true })
    .limit(limit)
),
```

- [ ] **Step 4: Run the full tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add -u
git commit -m "feat: query stranded contacts from Supabase"
```

---

### Task 3: Protected Manual Handler And Scheduled Entrypoint

**Files:**
- Modify: `functions/lib/handlers.js`
- Create: `functions/contact-reconcile.js`
- Create: `functions/contact-reconcile-scheduled.js`
- Modify: `test/handlers.test.js`

**Interfaces:**
- Consumes: `reconcileContacts(deps, { limit })`.
- Produces: `makeContactReconcileHandler({ reconcileContacts, deps, env, log })`.
- Netlify function path: `/api/admin/reconcile-contacts`.
- Netlify scheduled entrypoint: `functions/contact-reconcile-scheduled.js` with `schedule: '@daily'`.

- [ ] **Step 1: Write failing handler tests**

Append to `test/handlers.test.js`:

```js
import { makeContactReconcileHandler } from '../functions/lib/handlers.js';
```

If the file already has imports from `handlers.js`, merge the named import into the existing import statement.

Append these tests:

```js
test('contact-reconcile handler rejects missing and wrong bearer tokens', async () => {
  const handler = makeContactReconcileHandler({
    reconcileContacts: async () => ({ processed: 0, linked: 0, failed: 0, failures: [] }),
    deps: {},
    env: { RECONCILE_ADMIN_TOKEN: 'secret' },
    log: silentLog,
  });

  const missing = await handler(req('POST', {}));
  assert.equal(missing.status, 401);
  assert.deepEqual(await missing.json(), { error: 'unauthorized' });

  const wrong = await handler(req('POST', {}, { Authorization: 'Bearer wrong' }));
  assert.equal(wrong.status, 401);
  assert.deepEqual(await wrong.json(), { error: 'unauthorized' });
});

test('contact-reconcile handler runs with a valid bearer token and passes limit', async () => {
  let receivedLimit;
  const handler = makeContactReconcileHandler({
    reconcileContacts: async (_deps, options) => {
      receivedLimit = options.limit;
      return { processed: 1, linked: 1, failed: 0, failures: [] };
    },
    deps: {},
    env: { RECONCILE_ADMIN_TOKEN: 'secret' },
    log: silentLog,
  });

  const res = await handler(req('POST', { limit: 7 }, { Authorization: 'Bearer secret' }));

  assert.equal(res.status, 200);
  assert.equal(receivedLimit, 7);
  assert.deepEqual(await res.json(), { processed: 1, linked: 1, failed: 0, failures: [] });
});

test('contact-reconcile handler returns 500 when the pre-batch query fails', async () => {
  const handler = makeContactReconcileHandler({
    reconcileContacts: async () => { throw new Error('database unavailable'); },
    deps: {},
    env: { RECONCILE_ADMIN_TOKEN: 'secret' },
    log: silentLog,
  });

  const res = await handler(req('POST', {}, { Authorization: 'Bearer secret' }));

  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'reconcile_failed' });
});
```

- [ ] **Step 2: Run handler tests to verify failure**

Run:

```bash
node --test test/handlers.test.js
```

Expected: FAIL because `makeContactReconcileHandler` does not exist.

- [ ] **Step 3: Implement the handler**

Modify `functions/lib/handlers.js` import line:

```js
import { json } from './http.js';
```

already exists. Add this function after `makeContactCreateHandler()`:

```js
function bearerToken(req) {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? '';
}

export function makeContactReconcileHandler({ reconcileContacts, deps, env = process.env, log = console }) {
  return async (req) => {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    let body = {};
    try {
      const raw = await req.text();
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }

    const expected = env.RECONCILE_ADMIN_TOKEN;
    if (!expected || bearerToken(req) !== expected) return json({ error: 'unauthorized' }, 401);

    try {
      const result = await reconcileContacts(deps, { limit: body.limit });
      log.info?.('contact.reconcile_complete', result);
      return json(result, 200);
    } catch (err) {
      log.error?.('contact.reconcile_failed', { err: err?.message });
      return json({ error: 'reconcile_failed' }, 500);
    }
  };
}
```

- [ ] **Step 4: Create the manual Netlify function**

Create `functions/contact-reconcile.js`:

```js
import { makeContactReconcileHandler } from './lib/handlers.js';
import { reconcileContacts } from './lib/contact-reconciliation.js';
import { buildDeps } from './lib/deps.js';

export default async (req) => {
  const handler = makeContactReconcileHandler({
    reconcileContacts,
    deps: buildDeps(process.env),
    env: process.env,
  });
  return handler(req);
};

export const config = {
  path: '/api/admin/reconcile-contacts',
};
```

- [ ] **Step 5: Create the scheduled Netlify function**

Create `functions/contact-reconcile-scheduled.js`:

```js
import { reconcileContacts } from './lib/contact-reconciliation.js';
import { buildDeps } from './lib/deps.js';

export default async () => {
  const result = await reconcileContacts(buildDeps(process.env));
  console.info?.('contact.reconcile_scheduled_complete', result);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = {
  schedule: '@daily',
};
```

- [ ] **Step 6: Run handler tests**

Run:

```bash
node --test test/handlers.test.js
```

Expected: PASS.

- [ ] **Step 7: Run full tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

Run:

```bash
git add functions/contact-reconcile.js functions/contact-reconcile-scheduled.js
git add -u
git commit -m "feat: expose contact reconciliation endpoint"
```

---

### Task 4: Environment Contract And Operations Notes

**Files:**
- Modify: `.env.example`
- Modify: `docs/operations/ghl-member-portal-checklist.md`
- Test: `npm test`, `npm run build`

**Interfaces:**
- Produces documented `RECONCILE_ADMIN_TOKEN` env var.
- Produces operational smoke command.

- [ ] **Step 1: Document the env var**

Modify `.env.example` and add:

```env
RECONCILE_ADMIN_TOKEN=
```

Place it near the existing GHL/Supabase environment variables.

- [ ] **Step 2: Add operations note**

Append a `## CRM Reconciliation Sweep` section to
`docs/operations/ghl-member-portal-checklist.md` with this content:

- Purpose: retry Supabase contacts whose `ghl_contact_id` is null after a prior GHL outage.
- Manual function: `functions/contact-reconcile.js`.
- Scheduled function: `functions/contact-reconcile-scheduled.js`.
- Manual endpoint: `POST /api/admin/reconcile-contacts`.
- Scheduled cadence: `@daily`.
- Required manual-run env var: `RECONCILE_ADMIN_TOKEN`.
- Default batch limit: `25`.
- Maximum batch limit: `100`.
- Local smoke command:

```bash
curl -X POST http://localhost:8888/api/admin/reconcile-contacts \
  -H "Authorization: Bearer $RECONCILE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"limit\":25}"
```

- Expected response shape:

```json
{"processed":0,"linked":0,"failed":0,"failures":[]}
```

- [ ] **Step 3: Run verification**

Run:

```bash
npm test
npm run build
```

Expected: both PASS.

- [ ] **Step 4: Commit Task 4**

Run:

```bash
git add -u
git commit -m "docs: document contact reconciliation operations"
```

---

## Final Verification

- [ ] Run:

```bash
npm test
npm run build
git status --short --branch
```

- [ ] Confirm `npm test` passes.
- [ ] Confirm `npm run build` passes.
- [ ] Confirm only expected untracked local files remain: `.netlify/` and `deno.lock`.
- [ ] Do not run `git push`.
