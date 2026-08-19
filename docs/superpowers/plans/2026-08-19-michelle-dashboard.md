# Michelle's Dashboard (Phase 1: Events) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Michelle a premium, on-brand, mobile-first admin dashboard at `/admin/` where she logs in with email+password and fully manages PWRHaus events (create/edit/publish/reorder/image-upload) and the events-page hero copy, with changes live on the public static site in ~30–60s and full SEO preserved.

**Architecture:** Bespoke plain-HTML/CSS/vanilla-JS SPA in `src/admin/` (no build step) talking directly to Supabase (`supabase-js` from a pinned CDN, anon key + her authenticated session, RLS-guarded). Supabase becomes the source of truth for events + editable page content. The public Eleventy site fetches **published** rows from Supabase **at build time** (falling back to a committed seed fixture when Supabase env is absent, so CI/offline builds stay deterministic). On save, the dashboard calls a Netlify Function (`/api/publish`) that verifies her session and pings a server-side Netlify build hook to rebuild the static site.

**Tech Stack:** Eleventy v3 (Nunjucks), Netlify Functions v2, Supabase (Postgres + Auth + Storage), `@supabase/supabase-js` (already a dependency; browser copy via pinned CDN ESM), vanilla JS, `node --test`.

## Global Constraints

- **Node** `>=24`. **No new npm dependencies and no build step** (`@supabase/supabase-js` is already installed; the browser loads it from a pinned CDN ESM URL, matching the existing Sveltia-via-CDN precedent).
- **Shell is Windows PowerShell 5.1** — no `&&` chaining; use `;` or separate lines.
- **Git:** commit locally only, **never push**. Use `git add <explicit paths>` (never `git add -A`/`-u` blanket) — the working dir mixes tracked code with local-only files. Work only on branch `feat/michelle-dashboard`.
- **`npm test` MUST stay green** at every task boundary (baseline: **99 tests** pass on `main`).
- **Marketing-site design system ("Clubhouse Light") is unchanged.** `src/css/tokens.css` values are FINAL. `src/css/main.css` rules still enforced by tests: mobile-first (min-width only), no `box-shadow`, never `color: var(--brass)` for text, 44px touch targets, non-empty `alt` on every `<img>`, one `<h1>` per public page, F&Co footer credit on every public page. **These tests exclude `/admin/`** (see `publicHtmlFiles()` in `test/build-output.test.js`), so the dashboard is a distinct design surface with its own token block and may use a soft shadow ("glow").
- **Dashboard brand tokens** (its own `:root`, per spec D6): `--forest #1A4D36`, `--forest-deep #123527`, `--brass #B8912A` (decorative only), `--brass-text #7D6218` (text), `--paper #FAF8F3`, `--paper-raised #FFFFFF`, `--ink #14201A`, `--ink-muted #55645B`, `--line #E6E1D6`, `--error #8C2F1E`. Fonts: Fraunces (`--font-display`) + Work Sans (`--font-body`), self-hosted from `/fonts/fraunces-variable.woff2` and `/fonts/work-sans-variable.woff2`. Touch targets ≥ 44px.
- **Env vars** (names only; values live in Netlify UI / local `.env`, never committed): existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; **new** `SUPABASE_ANON_KEY` (browser + build reads, public by design), `NETLIFY_BUILD_HOOK` (server-side only, used exclusively inside `functions/publish.js`).
- **Supabase source-of-truth vs. seed (RESOLVED spec conflict — §6 vs §9):** the spec §6 says `events.js` falls back to `[]` when env is absent, but §9 requires the existing content-specific build tests (which assert *Fall Founder Scramble* etc. render) to stay green — impossible in envless CI with `[]`. **Resolution:** `events.js`/`siteContent.js` read Supabase when `SUPABASE_URL` + `SUPABASE_ANON_KEY` are both present, otherwise fall back to committed seed fixtures at `data/events.seed.json` / `data/siteContent.seed.json`. Supabase is authoritative in real builds; the fixtures keep CI deterministic and are no longer the "source of truth."
- **Owner-only actions (out of this build — see Task 13 handoff):** creating Michelle's Supabase Auth account, creating the Netlify build hook, setting env-var values in Netlify, applying migrations against the live Supabase project, and deploy-preview verification. Agents cannot create accounts. This plan delivers all code with `npm test` green; going live is an owner checklist.

---

## File Structure

**Created**
- `data/events.seed.json` — fallback events fixture (moved from `src/_data/events.json`; used by build + tests when Supabase env absent).
- `data/siteContent.seed.json` — fallback events-hero fixture (moved from `src/_data/siteContent.json`).
- `supabase/migrations/0003_events_cms.sql` — event CMS columns, `site_content` table, RLS, Storage bucket, seed.
- `src/_data/events.js` — build-time published-events data (Supabase-or-seed). Replaces `publishedEvents.js`.
- `src/_data/siteContent.js` — build-time events-page content (Supabase-or-seed). Replaces `siteContent.json` as data source.
- `src/_data/admin.js` — exposes `supabaseUrl` + `supabaseAnonKey` (public) to the admin template.
- `functions/lib/publish.js` — testable publish handler (injected deps).
- `functions/publish.js` — Netlify Function wiring `/api/publish`.
- `src/admin/admin.css` — dashboard styles + its own `:root` PWRHaus token block.
- `src/admin/app.js` — dashboard SPA entry (auth, routing, events CRUD, page settings, publish).
- `src/admin/lib.js` — pure, node-testable helpers (slugify, validateEvent, formatting, stats, sort).
- `src/admin/manifest.webmanifest` — PWA manifest.
- `src/admin/sw.js` — minimal service worker (installability).
- `src/img/pwa-icon-192.png`, `src/img/pwa-icon-512.png` — PWA icons (see Task 5 note).
- `test/events-cms-schema.test.js` — asserts 0003 migration shape (columns, `site_content`, RLS, bucket).
- `test/events-data.test.js` — asserts `events.js`/`siteContent.js` seed-fallback behavior.
- `test/admin-data.test.js` — asserts `admin.js` env behavior.
- `test/publish.test.js` — asserts publish handler auth + single build trigger + no secret leak.
- `test/admin-lib.test.js` — asserts pure admin helpers.

**Modified**
- `src/admin/index.html` — replace Sveltia boot page with bespoke dashboard shell.
- `src/events.njk` — read `events` global instead of `publishedEvents`.
- `src/events/detail.njk` — paginate `events` instead of `publishedEvents`.
- `eleventy.config.js` — passthrough admin static assets; drop `config.yml` passthrough.
- `test/cms-content.test.js` — read seed fixtures + `events.js`/`siteContent.js` (was `events.json`/`publishedEvents.js`).
- `test/build-output.test.js` — replace the Sveltia admin assertion with bespoke-dashboard assertions.
- `AGENTS.md` — handoff/open-threads update; note Sveltia retired.

**Deleted**
- `src/_data/events.json`, `src/_data/siteContent.json`, `src/_data/publishedEvents.js` (git history kept).
- `src/admin/config.yml` (Sveltia).

---

## Task 1: Events CMS migration, `site_content`, RLS, Storage, seed

**Files:**
- Create: `supabase/migrations/0003_events_cms.sql`
- Test: `test/events-cms-schema.test.js`

**Interfaces:**
- Produces: an `events` table with columns `slug, venue, summary, body, image, image_alt, registration_url, sort_order, updated_at` (plus existing `id, name, city, capacity, price_cents, currency, starts_at, published`); a `site_content(key text pk, value jsonb, updated_at)` table; RLS enabling anon `select` on published events + all-ops for authenticated; a public-read `event-media` Storage bucket writable by authenticated. Later tasks (2, 8–11) rely on these names/columns.

- [ ] **Step 1: Write the failing test** — `test/events-cms-schema.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/0003_events_cms.sql', import.meta.url), 'utf8').toLowerCase();

test('0003 adds the CMS columns events lacked', () => {
  for (const col of ['slug', 'venue', 'summary', 'body', 'image', 'image_alt', 'registration_url', 'sort_order', 'updated_at']) {
    assert.match(sql, new RegExp(`alter table events add column (if not exists )?${col}\\b`), `missing add column ${col}`);
  }
  assert.match(sql, /slug text unique/, 'slug must be unique for /events/<slug>/');
  assert.match(sql, /sort_order int not null default 0/, 'sort_order drives drag-reorder');
});

test('0003 creates the site_content singleton table', () => {
  assert.match(sql, /create table (if not exists )?site_content/);
  assert.match(sql, /key\s+text\s+primary key/);
  assert.match(sql, /value\s+jsonb\s+not null/);
});

test('0003 enables RLS with public-published / authenticated-all policies', () => {
  assert.match(sql, /alter table events enable row level security/);
  assert.match(sql, /alter table site_content enable row level security/);
  // anon may read only published events
  assert.match(sql, /create policy[^;]*on events[^;]*for select[^;]*using \(published = true\)/s);
  // authenticated may do everything
  assert.match(sql, /create policy[^;]*on events[^;]*to authenticated[^;]*using \(true\)/s);
  assert.match(sql, /create policy[^;]*on site_content[^;]*for select/s);
  assert.match(sql, /create policy[^;]*on site_content[^;]*to authenticated/s);
});

test('0003 provisions the public event-media storage bucket', () => {
  assert.match(sql, /storage\.buckets/);
  assert.match(sql, /'event-media'/);
  assert.match(sql, /storage\.objects/, 'must define storage RLS policies');
});
```

- [ ] **Step 2: Run it and confirm it fails** — `cd C:\dev\pwrhaus; node --test test/events-cms-schema.test.js` → FAIL (file `0003_events_cms.sql` does not exist).

- [ ] **Step 3: Write the migration** — `supabase/migrations/0003_events_cms.sql`

```sql
-- PWRHaus Phase 1 dashboard: event CMS fields, editable page content,
-- RLS (authenticated = admin; anon reads published only), media storage, seed.

-- 1) Extend events with the CMS fields the table lacked.
alter table events add column if not exists slug             text unique;
alter table events add column if not exists venue            text;
alter table events add column if not exists summary          text;
alter table events add column if not exists body             text;
alter table events add column if not exists image            text;   -- Storage public URL
alter table events add column if not exists image_alt        text;
alter table events add column if not exists registration_url text;
alter table events add column if not exists sort_order       int not null default 0;
alter table events add column if not exists updated_at        timestamptz not null default now();

-- 2) Editable page content (Phase 1: the events-page hero).
create table if not exists site_content (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- 3) RLS. Only Michelle has an account, so authenticated = admin.
alter table events        enable row level security;
alter table site_content  enable row level security;

drop policy if exists events_public_read    on events;
drop policy if exists events_admin_all       on events;
drop policy if exists site_content_public_read on site_content;
drop policy if exists site_content_admin_all   on site_content;

create policy events_public_read on events
  for select to anon using (published = true);
create policy events_admin_all on events
  for all to authenticated using (true) with check (true);

create policy site_content_public_read on site_content
  for select to anon using (true);
create policy site_content_admin_all on site_content
  for all to authenticated using (true) with check (true);

-- 4) Public-read media bucket; authenticated writes.
insert into storage.buckets (id, name, public)
values ('event-media', 'event-media', true)
on conflict (id) do nothing;

drop policy if exists event_media_public_read on storage.objects;
drop policy if exists event_media_admin_write on storage.objects;

create policy event_media_public_read on storage.objects
  for select to anon using (bucket_id = 'event-media');
create policy event_media_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'event-media') with check (bucket_id = 'event-media');

-- 5) Seed current events (idempotent on slug) so nothing is lost at cutover.
insert into events (name, city, venue, starts_at, price_cents, capacity, summary, body, image, image_alt, published, registration_url, slug, sort_order)
values
  ('Fall Founder Scramble','Fort Lauderdale','TPC Eagle Trace','2026-09-18T13:00:00-04:00',15000,40,
   'A business-first scramble for founders, operators, and investors.',
   'A relaxed competitive round built for warm introductions, smart pairings, and useful follow-up after the final putt.',
   '/img/groupgolf1.jpg','Golfers walking together across a green course',true,null,'fall-founder-scramble',0),
  ('Spring Networking Nine','Miami','The Tips Golf Miami','2026-04-22T17:30:00-04:00',8500,24,
   'Nine holes, one focused room of business owners, and enough time to actually talk.',
   'This evening-format event pairs golf with intentional introductions for members and prospective members.',
   '/img/corporate-hero.webp','PWRHaus members gathered at an indoor golf venue',true,null,'spring-networking-nine',1)
on conflict (slug) do nothing;

-- 6) Seed the events-page hero.
insert into site_content (key, value)
values ('events_page', jsonb_build_object('eventsHero', jsonb_build_object(
  'eyebrow','Events',
  'heading','Rooms where the right people already have something in common.',
  'lead','PWRHaus events pair golf with intentional introductions for founders, operators, and business owners across Fort Lauderdale and Miami.',
  'video','/img/Dronegolfcourse.mp4',
  'poster','/img/groupgolf1.jpg')))
on conflict (key) do nothing;
```

> Note: the seed omits the `draft-member-preview` row on purpose — the "hidden draft" case is exercised by the seed fixture (Task 2), not against the live DB.

- [ ] **Step 4: Run the test to verify it passes** — `node --test test/events-cms-schema.test.js` → PASS. Also `node --test test/schema.test.js` (0001 tests) → still PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_events_cms.sql test/events-cms-schema.test.js
git commit -m "feat(db): events CMS columns, site_content, RLS, media bucket, seed"
```

---

## Task 2: Build-time data layer — `events.js` / `siteContent.js` (Supabase-or-seed), retire `publishedEvents.js`

**Files:**
- Create: `data/events.seed.json` (move from `src/_data/events.json`), `data/siteContent.seed.json` (move from `src/_data/siteContent.json`)
- Create: `src/_data/events.js`, `src/_data/siteContent.js`
- Delete: `src/_data/events.json`, `src/_data/siteContent.json`, `src/_data/publishedEvents.js`
- Modify: `src/events.njk`, `src/events/detail.njk`
- Test: `test/events-data.test.js`; Modify: `test/cms-content.test.js`

**Interfaces:**
- Consumes: seed fixtures at `data/events.seed.json` (`{ events: [...] }`) and `data/siteContent.seed.json` (`{ eventsHero: {...} }`); Supabase (Task 1 columns) via `SUPABASE_URL` + `SUPABASE_ANON_KEY`.
- Produces: Eleventy globals `events` (array of **published** event objects, sorted by `sort_order` then `starts_at`) and `siteContent` (`{ eventsHero: {...} }`). Templates and later tasks read these.

- [ ] **Step 1: Move the seed fixtures.** Create `data/events.seed.json` with the exact current contents of `src/_data/events.json` (all three rows incl. `draft-member-preview`, `published:false`). Create `data/siteContent.seed.json` with the exact current contents of `src/_data/siteContent.json`. Then `git rm src/_data/events.json src/_data/siteContent.json src/_data/publishedEvents.js`.

- [ ] **Step 2: Write the failing test** — `test/events-data.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

async function load(mod, key) {
  const m = await import(`../src/_data/${mod}.js?${key}`);
  const val = m.default;
  return typeof val === 'function' ? await val() : val;
}

test('events.js falls back to the published seed rows when Supabase env is absent', async () => {
  const prevUrl = process.env.SUPABASE_URL, prevKey = process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY;
  try {
    const events = await load('events', 'seed');
    assert.ok(Array.isArray(events) && events.length >= 2, 'expected seeded published events');
    assert.equal(events.every((e) => e.published === true), true, 'only published rows are exposed');
    assert.equal(events.some((e) => e.slug === 'draft-member-preview'), false, 'drafts must not leak to the build');
    // Sorted by sort_order then starts_at (fall=0 before spring=1 in the seed file order-independent check)
    const idx = (s) => events.findIndex((e) => e.slug === s);
    assert.ok(idx('fall-founder-scramble') > -1 && idx('spring-networking-nine') > -1);
  } finally {
    if (prevUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = prevKey;
  }
});

test('siteContent.js falls back to the seed hero when Supabase env is absent', async () => {
  const prevUrl = process.env.SUPABASE_URL, prevKey = process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY;
  try {
    const content = await load('siteContent', 'seed');
    assert.ok(content.eventsHero, 'must expose eventsHero');
    assert.equal(typeof content.eventsHero.heading, 'string');
    assert.ok(content.eventsHero.heading.trim().length > 0);
  } finally {
    if (prevUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = prevKey;
  }
});
```

- [ ] **Step 3: Run it, confirm it fails** — `node --test test/events-data.test.js` → FAIL (`src/_data/events.js` missing).

- [ ] **Step 4: Implement `src/_data/events.js`**

```js
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const seed = () => JSON.parse(readFileSync(new URL('../../data/events.seed.json', import.meta.url), 'utf8')).events;

const byOrder = (rows) =>
  [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || new Date(a.starts_at) - new Date(b.starts_at));

export default async function events() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return byOrder(seed().filter((e) => e.published === true));
  }
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.from('events').select('*').eq('published', true);
    if (error) throw error;
    return byOrder(data ?? []);
  } catch (err) {
    console.warn('[events.js] Supabase read failed, using seed:', err.message);
    return byOrder(seed().filter((e) => e.published === true));
  }
}
```

- [ ] **Step 5: Implement `src/_data/siteContent.js`**

```js
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const seed = () => JSON.parse(readFileSync(new URL('../../data/siteContent.seed.json', import.meta.url), 'utf8'));

export default async function siteContent() {
  const fallback = seed();
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return fallback;
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.from('site_content').select('value').eq('key', 'events_page').maybeSingle();
    if (error) throw error;
    // Merge over defaults so a partial row never blanks the hero.
    return { ...fallback, ...(data?.value ?? {}), eventsHero: { ...fallback.eventsHero, ...(data?.value?.eventsHero ?? {}) } };
  } catch (err) {
    console.warn('[siteContent.js] Supabase read failed, using seed:', err.message);
    return fallback;
  }
}
```

- [ ] **Step 6: Update the templates.** In `src/events.njk` replace `publishedEvents` with `events` in the two `{% set %}` lines (`{% set upcoming = events | upcomingEvents %}`, `{% set past = events | pastEvents %}`). In `src/events/detail.njk` change `pagination.data: publishedEvents` to `pagination.data: events`. Nothing else changes (field names identical).

- [ ] **Step 7: Rewrite `test/cms-content.test.js`** to validate the seed fixtures + the data layer instead of the deleted files:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const eventsData = JSON.parse(readFileSync('data/events.seed.json', 'utf8'));
const events = eventsData.events;
const siteContent = JSON.parse(readFileSync('data/siteContent.seed.json', 'utf8'));

const requiredEventFields = ['slug','name','city','venue','starts_at','price_cents','capacity','summary','body','image','image_alt','published','registration_url'];

test('seed events fixture is CMS-shaped and URL-safe', () => {
  assert.ok(Array.isArray(events) && events.length >= 2, 'seed at least one upcoming and one past event');
  const slugs = new Set();
  for (const event of events) {
    for (const field of requiredEventFields) assert.ok(Object.hasOwn(event, field), `${event.name ?? 'event'} missing ${field}`);
    assert.match(event.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${event.slug} must be URL-safe`);
    assert.equal(slugs.has(event.slug), false, `duplicate slug ${event.slug}`); slugs.add(event.slug);
    assert.equal(typeof event.published, 'boolean');
    assert.equal(Number.isInteger(event.price_cents), true);
    assert.equal(Number.isInteger(event.capacity), true);
    assert.ok(Date.parse(event.starts_at));
    assert.ok(event.image.startsWith('/img/'));
    assert.ok(event.image_alt.trim().length > 0);
  }
});

test('seed siteContent fixture exposes the events hero singleton', () => {
  assert.ok(siteContent.eventsHero);
  assert.ok(siteContent.eventsHero.heading.trim().length > 0);
  assert.ok(siteContent.eventsHero.lead.trim().length > 0);
});

test('events.js exposes only published records (seed fallback)', async () => {
  const prev = { u: process.env.SUPABASE_URL, k: process.env.SUPABASE_ANON_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY;
  try {
    const list = await (await import('../src/_data/events.js?cms')).default();
    assert.ok(list.length > 0);
    assert.equal(list.some((e) => e.slug === 'draft-member-preview'), false);
    assert.equal(list.every((e) => e.published === true), true);
  } finally {
    if (prev.u === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prev.u;
    if (prev.k === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = prev.k;
  }
});
```

- [ ] **Step 8: Verify build + data tests.** `node --test test/events-data.test.js test/cms-content.test.js` → PASS. Then a full build (envless) still renders the seeded events: `npm run build` → `public/events/index.html` contains "Fall Founder Scramble"; `public/events/fall-founder-scramble/index.html` exists; `public/events/draft-member-preview/` does **not**. Then `node --test test/build-output.test.js` → the two content-specific events tests still PASS (seed fallback drives them).

- [ ] **Step 9: Full sweep + commit** — `npm test` → all green (publishedEvents test removed with the file; new/updated tests pass).

```bash
git add data/events.seed.json data/siteContent.seed.json src/_data/events.js src/_data/siteContent.js src/events.njk src/events/detail.njk test/events-data.test.js test/cms-content.test.js
git rm src/_data/events.json src/_data/siteContent.json src/_data/publishedEvents.js
git commit -m "feat(build): Supabase-or-seed events + siteContent data; retire publishedEvents"
```

---

## Task 3: Admin env data file (`src/_data/admin.js`)

**Files:**
- Create: `src/_data/admin.js`
- Test: `test/admin-data.test.js`

**Interfaces:**
- Produces: Eleventy global `admin` = `{ supabaseUrl: string, supabaseAnonKey: string }` (empty strings when env absent). The admin template (Task 5) injects these into `window.__PWRHAUS`.

- [ ] **Step 1: Failing test** — `test/admin-data.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

async function load(key) { return (await import(`../src/_data/admin.js?${key}`)).default; }

test('admin config is empty strings when env absent', async () => {
  const prev = { u: process.env.SUPABASE_URL, k: process.env.SUPABASE_ANON_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY;
  try {
    const admin = await load('empty');
    assert.equal(admin.supabaseUrl, '');
    assert.equal(admin.supabaseAnonKey, '');
  } finally {
    if (prev.u === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prev.u;
    if (prev.k === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = prev.k;
  }
});

test('admin config reads the public Supabase url + anon key', async () => {
  process.env.SUPABASE_URL = 'https://proj.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-abc';
  const admin = await load('set');
  assert.equal(admin.supabaseUrl, 'https://proj.supabase.co');
  assert.equal(admin.supabaseAnonKey, 'anon-abc');
});
```

- [ ] **Step 2: Run, confirm fail** — `node --test test/admin-data.test.js` → FAIL.

- [ ] **Step 3: Implement `src/_data/admin.js`**

```js
export default function admin() {
  return {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  };
}
```

- [ ] **Step 4: Run, confirm pass** — `node --test test/admin-data.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/_data/admin.js test/admin-data.test.js
git commit -m "feat(admin): expose public Supabase url + anon key to the dashboard template"
```

---

## Task 4: Publish Netlify Function (`/api/publish`)

**Files:**
- Create: `functions/lib/publish.js`, `functions/publish.js`
- Test: `test/publish.test.js`

**Interfaces:**
- Consumes: `functions/lib/http.js` `json(data, status)`.
- Produces: `makePublishHandler({ verifySession, triggerBuild })` → `async (req) => Response`. `verifySession(token: string) → Promise<user|null>`; `triggerBuild() → Promise<void>`. Handler returns `401 {error:'unauthorized'}` when the bearer token is missing/invalid (and does **not** call `triggerBuild`); otherwise calls `triggerBuild()` exactly once and returns `202 {status:'building'}`. The build-hook URL never appears in any response body.

- [ ] **Step 1: Failing test** — `test/publish.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePublishHandler } from '../functions/lib/publish.js';

const reqWith = (auth) => new Request('https://x/api/publish', {
  method: 'POST', headers: auth ? { Authorization: auth } : {},
});

test('rejects a request with no bearer token and does not build', async () => {
  let built = 0;
  const handler = makePublishHandler({ verifySession: async () => null, triggerBuild: async () => { built++; } });
  const res = await handler(reqWith(null));
  assert.equal(res.status, 401);
  assert.equal(built, 0);
});

test('rejects an invalid session and does not build', async () => {
  let built = 0;
  const handler = makePublishHandler({ verifySession: async () => null, triggerBuild: async () => { built++; } });
  const res = await handler(reqWith('Bearer bad'));
  assert.equal(res.status, 401);
  assert.equal(built, 0);
});

test('triggers the build exactly once for a valid session', async () => {
  let built = 0; let sawToken = null;
  const handler = makePublishHandler({
    verifySession: async (t) => { sawToken = t; return { id: 'michelle' }; },
    triggerBuild: async () => { built++; },
  });
  const res = await handler(reqWith('Bearer good-jwt'));
  assert.equal(res.status, 202);
  assert.equal(built, 1);
  assert.equal(sawToken, 'good-jwt');
  const body = await res.text();
  assert.doesNotMatch(body, /http/, 'response must not leak the build-hook URL');
});
```

- [ ] **Step 2: Run, confirm fail** — `node --test test/publish.test.js` → FAIL (`functions/lib/publish.js` missing).

- [ ] **Step 3: Implement `functions/lib/publish.js`**

```js
import { json } from './http.js';

export function makePublishHandler({ verifySession, triggerBuild }) {
  return async (req) => {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) return json({ error: 'unauthorized' }, 401);

    const user = await verifySession(token).catch(() => null);
    if (!user) return json({ error: 'unauthorized' }, 401);

    await triggerBuild();
    return json({ status: 'building' }, 202);
  };
}
```

- [ ] **Step 4: Implement `functions/publish.js`** (real deps)

```js
import { createClient } from '@supabase/supabase-js';
import { makePublishHandler } from './lib/publish.js';

export default async (req) => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, NETLIFY_BUILD_HOOK } = process.env;

  const verifySession = async (token) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.getUser(token);
    if (error) return null;
    return data?.user ?? null;
  };

  const triggerBuild = async () => {
    if (!NETLIFY_BUILD_HOOK) throw new Error('NETLIFY_BUILD_HOOK not configured');
    const res = await fetch(NETLIFY_BUILD_HOOK, { method: 'POST' });
    if (!res.ok) throw new Error(`build hook failed: ${res.status}`);
  };

  return makePublishHandler({ verifySession, triggerBuild })(req);
};

export const config = { path: '/api/publish' };
```

- [ ] **Step 5: Run, confirm pass** — `node --test test/publish.test.js` → PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/lib/publish.js functions/publish.js test/publish.test.js
git commit -m "feat(functions): /api/publish verifies session and triggers the build hook"
```

---

## Task 5: Retire Sveltia; scaffold the dashboard shell (HTML, tokens/CSS, PWA, passthrough)

**Files:**
- Modify: `src/admin/index.html`, `eleventy.config.js`, `test/build-output.test.js`
- Create: `src/admin/admin.css`, `src/admin/manifest.webmanifest`, `src/admin/sw.js`, `src/img/pwa-icon-192.png`, `src/img/pwa-icon-512.png`
- Delete: `src/admin/config.yml`

**Interfaces:**
- Consumes: `admin` global (Task 3) for `window.__PWRHAUS`.
- Produces: a built `/admin/index.html` that is `noindex`, injects `window.__PWRHAUS = { supabaseUrl, supabaseAnonKey }`, loads `/admin/admin.css`, links the manifest, and loads `/admin/app.js` as a module. Provides the DOM skeleton (login view `#login-view`, app shell `#app-view` with sidebar `#sidebar`, mobile bottom nav `#bottom-nav`, views `#view-events` / `#view-settings`, drawer `#event-drawer`, toast host `#toasts`) that Task 7–12 script against.

- [ ] **Step 1: Write the new admin build-output assertions** (replace the Sveltia test). In `test/build-output.test.js`, replace the `admin route ships the Sveltia CMS boot page and config` test with:

```js
test('admin route ships the bespoke dashboard shell, not Sveltia', () => {
  const html = readFileSync(join(outDir, 'admin', 'index.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex">/, 'admin must not be indexed');
  assert.doesNotMatch(html, /@sveltia\/cms/, 'Sveltia must be retired');
  assert.match(html, /window\.__PWRHAUS\s*=/, 'admin must inject public Supabase config');
  assert.match(html, /src="\/admin\/app\.js"/, 'admin must load the dashboard app');
  assert.match(html, /rel="manifest"/, 'admin must be installable');
  assert.match(html, /id="login-view"/, 'admin must render the login view');
});
```

- [ ] **Step 2: Run, confirm it fails** — `node --test test/build-output.test.js` → the new assertion FAILs (still Sveltia). (Old assertion gone.)

- [ ] **Step 3: Replace `src/admin/index.html`** with the bespoke shell. Full skeleton (structure the JS drives; empty containers are fine — Task 7+ populate them):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="robots" content="noindex">
    <meta name="theme-color" content="#123527">
    <title>PWRHaus Dashboard</title>
    <link rel="manifest" href="/admin/manifest.webmanifest">
    <link rel="icon" href="/img/favicon-mark.png" type="image/png">
    <link rel="apple-touch-icon" href="/img/pwa-icon-192.png">
    <link rel="preload" href="/fonts/fraunces-variable.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/fonts/work-sans-variable.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/admin/admin.css">
    <script>
      window.__PWRHAUS = { supabaseUrl: "{{ admin.supabaseUrl }}", supabaseAnonKey: "{{ admin.supabaseAnonKey }}" };
    </script>
  </head>
  <body>
    <!-- LOGIN -->
    <section id="login-view" class="login" hidden>
      <div class="login-card">
        <div class="ph-monogram" aria-hidden="true">PH</div>
        <h1>PWRHaus</h1>
        <p class="login-sub">Sign in to manage your events.</p>
        <form id="login-form" novalidate>
          <label>Email<input type="email" id="login-email" autocomplete="username" required></label>
          <label>Password<input type="password" id="login-password" autocomplete="current-password" required></label>
          <p class="form-error" id="login-error" role="alert" hidden></p>
          <button class="btn btn-primary" type="submit">Sign in</button>
          <button class="btn btn-link" type="button" id="forgot-btn">Forgot password?</button>
        </form>
        <form id="recover-form" hidden novalidate>
          <p class="login-sub">Enter your email and we'll send a reset link.</p>
          <label>Email<input type="email" id="recover-email" autocomplete="username" required></label>
          <p class="form-error" id="recover-error" role="alert" hidden></p>
          <button class="btn btn-primary" type="submit">Send reset link</button>
          <button class="btn btn-link" type="button" id="recover-cancel">Back to sign in</button>
        </form>
        <form id="reset-form" hidden novalidate>
          <p class="login-sub">Set a new password.</p>
          <label>New password<input type="password" id="reset-password" autocomplete="new-password" required minlength="8"></label>
          <p class="form-error" id="reset-error" role="alert" hidden></p>
          <button class="btn btn-primary" type="submit">Save password</button>
        </form>
      </div>
    </section>

    <!-- APP -->
    <div id="app-view" class="app" hidden>
      <aside id="sidebar" class="sidebar">
        <div class="brand"><span class="ph-monogram sm" aria-hidden="true">PH</span> PWRHaus</div>
        <nav class="side-nav" aria-label="Sections">
          <button class="nav-item" data-view="events" aria-current="page">Dashboard</button>
          <button class="nav-item" data-view="events">Events</button>
          <button class="nav-item" data-view="settings">Site Content</button>
          <button class="nav-item" disabled title="Coming soon">CRM</button>
          <button class="nav-item" disabled title="Coming soon">Settings</button>
        </nav>
        <button class="btn btn-link logout" id="logout-btn">Sign out</button>
      </aside>

      <header class="topbar">
        <span class="brand-sm"><span class="ph-monogram sm" aria-hidden="true">PH</span></span>
        <div class="account"><button class="btn btn-link" id="logout-btn-top">Sign out</button></div>
      </header>

      <main class="workspace">
        <section id="view-events" class="view">
          <div class="view-head">
            <h2>Events</h2>
            <button class="btn btn-primary" id="new-event-btn">New event</button>
          </div>
          <div class="stat-row" id="stat-row"><!-- stats injected --></div>
          <div class="event-list" id="event-list" aria-live="polite"><!-- cards / skeleton injected --></div>
        </section>

        <section id="view-settings" class="view" hidden>
          <div class="view-head"><h2>Events page</h2></div>
          <form id="settings-form" class="settings-form"><!-- hero fields injected --></form>
        </section>
      </main>

      <nav id="bottom-nav" class="bottom-nav" aria-label="Sections">
        <button class="tab" data-view="events" aria-current="page">Events</button>
        <button class="tab" data-view="settings">Page</button>
        <button class="tab" id="new-event-tab">New</button>
      </nav>
    </div>

    <!-- DRAWER (create/edit) -->
    <div id="event-drawer" class="drawer" hidden aria-hidden="true" role="dialog" aria-modal="true" aria-label="Event editor">
      <div class="drawer-scrim" data-close></div>
      <form id="event-form" class="drawer-panel"><!-- fields injected --></form>
    </div>

    <div id="toasts" class="toasts" aria-live="assertive"></div>

    <script type="module" src="/admin/app.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `src/admin/admin.css`** with the dashboard `:root` token block (Global Constraints values) and layout. It is a distinct surface (excluded from the marketing-site CSS tests) and may use a soft shadow for the login "glow" and elevated cards. Include: mobile-first base (bottom-nav visible < 768px, sidebar hidden < 768px; ≥ 768px sidebar shown, bottom-nav hidden, topbar hidden), `.login` full-screen `--forest`→`--forest-deep` gradient + centered cream `.login-card`, `.ph-monogram` brass ring, `.btn`/`.btn-primary`/`.btn-link` (44px min height), `.stat-row` grid of `.stat` tiles, `.event-card` (thumb, title, meta, `.badge.published`/`.badge.draft`, action buttons), `.drawer` slide-over (translateX transition honoring `prefers-reduced-motion`), `.toast` styles, `.skeleton` shimmer, form controls with `--line` borders and `--error` validation text. (Concrete declarations authored during execution; the structure above is fixed.)

- [ ] **Step 5: Create the PWA files.**
  - `src/admin/manifest.webmanifest`:
    ```json
    {
      "name": "PWRHaus Dashboard",
      "short_name": "PWRHaus",
      "start_url": "/admin/",
      "scope": "/admin/",
      "display": "standalone",
      "background_color": "#123527",
      "theme_color": "#123527",
      "icons": [
        { "src": "/img/pwa-icon-192.png", "sizes": "192x192", "type": "image/png" },
        { "src": "/img/pwa-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
      ]
    }
    ```
  - `src/admin/sw.js` (minimal offline-tolerant SW so the install prompt is offered; network-first, no aggressive caching to avoid serving stale admin code):
    ```js
    self.addEventListener('install', () => self.skipWaiting());
    self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
    self.addEventListener('fetch', (e) => { e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); });
    ```
  - **Icons:** copy the existing brand mark to the two icon names as a working placeholder (exact-size art is a handoff item in Task 13): PowerShell `Copy-Item src/img/favicon-mark.png src/img/pwa-icon-192.png; Copy-Item src/img/favicon-mark.png src/img/pwa-icon-512.png`. If `favicon-mark.png` is absent, use any existing `src/img/*.png` brand asset.

- [ ] **Step 6: Update `eleventy.config.js` passthrough.** Remove `eleventyConfig.addPassthroughCopy('src/admin/config.yml');`. Add:
  ```js
  eleventyConfig.addPassthroughCopy('src/admin/admin.css');
  eleventyConfig.addPassthroughCopy('src/admin/app.js');
  eleventyConfig.addPassthroughCopy('src/admin/lib.js');
  eleventyConfig.addPassthroughCopy('src/admin/sw.js');
  eleventyConfig.addPassthroughCopy('src/admin/manifest.webmanifest');
  ```
  (`src/admin/index.html` stays a templated `.html` so `{{ admin.* }}` renders.)

- [ ] **Step 7: Delete Sveltia config** — `git rm src/admin/config.yml`.

- [ ] **Step 8: Build + verify.** `npm run build`; confirm `public/admin/index.html` has `window.__PWRHAUS`, `noindex`, loads `app.js`, links manifest, has `#login-view`; confirm `public/admin/admin.css`, `public/admin/manifest.webmanifest`, `public/admin/sw.js`, `public/img/pwa-icon-192.png` all exist. (Task 6 creates `app.js`/`lib.js`; if building before Task 6, add empty placeholder `src/admin/app.js` and `src/admin/lib.js` so passthrough succeeds, then flesh out.) Run `node --test test/build-output.test.js` → new admin assertion PASSES; all others green.

- [ ] **Step 9: Commit**

```bash
git add src/admin/index.html src/admin/admin.css src/admin/manifest.webmanifest src/admin/sw.js src/img/pwa-icon-192.png src/img/pwa-icon-512.png eleventy.config.js test/build-output.test.js
git rm src/admin/config.yml
git commit -m "feat(admin): bespoke dashboard shell + PWA; retire Sveltia CMS"
```

---

## Task 6: Pure dashboard helpers (`src/admin/lib.js`) + unit tests

**Files:**
- Create: `src/admin/lib.js`
- Test: `test/admin-lib.test.js`

**Interfaces:**
- Produces (all pure, no DOM, importable by node): `slugify(name) → string`; `validateEvent(input) → { ok: boolean, errors: {field: msg} }`; `usd(cents) → string`; `eventDateLabel(iso) → string`; `computeStats(events) → { upcoming, published, draft }`; `sortByOrder(events) → events[]`; `nextSortOrder(events) → number`. Tasks 8–11 import these.

- [ ] **Step 1: Failing test** — `test/admin-lib.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, validateEvent, usd, computeStats, sortByOrder, nextSortOrder } from '../src/admin/lib.js';

test('slugify makes URL-safe slugs', () => {
  assert.equal(slugify('Fall Founder Scramble!'), 'fall-founder-scramble');
  assert.equal(slugify('  Miami  Nine  '), 'miami-nine');
  assert.equal(slugify('Q1 & Q2'), 'q1-q2');
});

test('validateEvent enforces required fields and integer cents', () => {
  const bad = validateEvent({ name: '', slug: 'x', price_cents: 1.5, capacity: 'n', image_alt: '', starts_at: 'nope' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.name && bad.errors.price_cents && bad.errors.capacity && bad.errors.image_alt && bad.errors.starts_at);
  const good = validateEvent({ name: 'X', slug: 'x-y', city: 'Miami', venue: 'V', starts_at: '2026-09-01T12:00:00-04:00', price_cents: 15000, capacity: 40, summary: 's', body: 'b', image: '/x.jpg', image_alt: 'alt' });
  assert.equal(good.ok, true);
  assert.deepEqual(good.errors, {});
});

test('usd renders integer cents without trailing zeros', () => {
  assert.equal(usd(15000), '$150');
  assert.equal(usd(8550), '$85.50');
});

test('computeStats counts upcoming/published/draft', () => {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 864e5).toISOString();
  const stats = computeStats([
    { published: true, starts_at: future },
    { published: true, starts_at: '2000-01-01T00:00:00Z' },
    { published: false, starts_at: future },
  ]);
  assert.equal(stats.published, 2);
  assert.equal(stats.draft, 1);
  assert.equal(stats.upcoming, 2); // both future rows regardless of published
});

test('sortByOrder + nextSortOrder', () => {
  const list = [{ sort_order: 2 }, { sort_order: 0 }, { sort_order: 1 }];
  assert.deepEqual(sortByOrder(list).map((e) => e.sort_order), [0, 1, 2]);
  assert.equal(nextSortOrder(list), 3);
  assert.equal(nextSortOrder([]), 0);
});
```

- [ ] **Step 2: Run, confirm fail** — `node --test test/admin-lib.test.js` → FAIL.

- [ ] **Step 3: Implement `src/admin/lib.js`** (browser + node compatible ESM; no DOM APIs)

```js
export function slugify(name = '') {
  return String(name).toLowerCase().trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function usd(cents) {
  const n = Number(cents) / 100;
  return '$' + (Number.isInteger(n) ? String(n) : n.toFixed(2));
}

export function eventDateLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
}

export function validateEvent(input = {}) {
  const errors = {};
  const need = (k, msg) => { if (!input[k] || String(input[k]).trim() === '') errors[k] = msg; };
  need('name', 'Name is required');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug || '')) errors.slug = 'Use lowercase letters, numbers, and hyphens';
  need('city', 'City is required');
  need('venue', 'Venue is required');
  if (!Date.parse(input.starts_at)) errors.starts_at = 'A valid date/time is required';
  if (!Number.isInteger(input.price_cents) || input.price_cents < 0) errors.price_cents = 'Price must be whole cents ≥ 0';
  if (!Number.isInteger(input.capacity) || input.capacity < 0) errors.capacity = 'Capacity must be a whole number ≥ 0';
  need('summary', 'Summary is required');
  need('image', 'An image is required');
  need('image_alt', 'Alt text is required for accessibility');
  return { ok: Object.keys(errors).length === 0, errors };
}

export function sortByOrder(events = []) {
  return [...events].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || new Date(a.starts_at) - new Date(b.starts_at));
}

export function nextSortOrder(events = []) {
  return events.length ? Math.max(...events.map((e) => e.sort_order ?? 0)) + 1 : 0;
}

export function computeStats(events = []) {
  const now = Date.now();
  return {
    upcoming: events.filter((e) => new Date(e.starts_at).getTime() >= now).length,
    published: events.filter((e) => e.published === true).length,
    draft: events.filter((e) => e.published !== true).length,
  };
}
```

- [ ] **Step 4: Run, confirm pass** — `node --test test/admin-lib.test.js` → PASS. `npm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add src/admin/lib.js test/admin-lib.test.js
git commit -m "feat(admin): pure dashboard helpers (slugify, validate, stats, sort)"
```

---

## Tasks 7–12: Dashboard SPA (`src/admin/app.js`)

> **Testing note (applies to Tasks 7–12):** the SPA is browser/DOM code and the repo has **no browser test harness** (and Global Constraints forbid adding one). Automated coverage for these tasks is: (a) the pure logic already unit-tested in `src/admin/lib.js` (Task 6), and (b) the build-output structural assertion (Task 5) that the shell ships. Behavior is verified by the **manual verification checklist** in each task, run with `netlify dev --offline` against a Supabase project that has migration 0003 applied and a test auth user. Each task ends with `npm test` still green and a commit. Build the single `src/admin/app.js` module additively — each task appends its section; imports at top: `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'; import { slugify, usd, eventDateLabel, validateEvent, sortByOrder, nextSortOrder, computeStats } from '/admin/lib.js';`.

### Task 7: Auth — session, login, logout, password recovery

**Files:** Modify `src/admin/app.js`

**Interfaces:**
- Produces: a module-scope `sb` (Supabase client from `window.__PWRHAUS`), `requireSession()` that shows `#app-view` when a session exists and `#login-view` otherwise, and wires `#login-form` (`signInWithPassword`), `#logout-btn`/`#logout-btn-top` (`signOut`), `#forgot-btn`/`#recover-form` (`resetPasswordForEmail` with `redirectTo` = `${location.origin}/admin/`), and `#reset-form` (`updateUser({ password })`, shown when the URL is a recovery redirect / `onAuthStateChange` fires `PASSWORD_RECOVERY`). Task 8 calls the exposed `boot()` after a session is confirmed.

- [ ] **Step 1:** Initialize the client and gate views:
```js
const { supabaseUrl, supabaseAnonKey } = window.__PWRHAUS || {};
const sb = createClient(supabaseUrl, supabaseAnonKey);
const $ = (sel) => document.querySelector(sel);
const show = (el, on) => { el.hidden = !on; };

async function requireSession() {
  const { data } = await sb.auth.getSession();
  if (data.session) { show($('#login-view'), false); show($('#app-view'), true); boot(); }
  else { show($('#app-view'), false); show($('#login-view'), true); }
}
```
- [ ] **Step 2:** Wire login submit → `sb.auth.signInWithPassword({ email, password })`; on error show `#login-error`; on success `requireSession()`.
- [ ] **Step 3:** Wire logout (both buttons) → `sb.auth.signOut()` then `requireSession()`.
- [ ] **Step 4:** Wire recovery: `#forgot-btn` reveals `#recover-form`; submit → `sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/admin/' })`; toast "Check your email". `sb.auth.onAuthStateChange((evt) => { if (evt === 'PASSWORD_RECOVERY') { show login-view, reveal #reset-form } })`; `#reset-form` submit → `sb.auth.updateUser({ password })` then `requireSession()`.
- [ ] **Step 5:** `document.addEventListener('DOMContentLoaded', requireSession)`. Guard: if `!supabaseUrl`, render a friendly "Dashboard not configured" message in `#login-view` (covers envless preview).
- [ ] **Manual verification:** unconfigured build shows the friendly message; with env + a test user: wrong password shows inline error; correct login reveals the app; reload keeps the session; sign out returns to login; "Forgot password?" sends a reset email; the emailed link opens the set-new-password form and the new password works.
- [ ] **Commit:** `git add src/admin/app.js; git commit -m "feat(admin): Supabase auth, login, logout, password recovery"`

### Task 8: Events list — data load, stat row, cards, skeleton, empty state

**Files:** Modify `src/admin/app.js`

**Interfaces:**
- Consumes: `sb`, `computeStats`, `sortByOrder`, `usd`, `eventDateLabel`.
- Produces: module state `state.events`; `boot()` → loads events + renders; `loadEvents()` → `sb.from('events').select('*')` (authed → all rows incl. drafts), stores `sortByOrder(data)`; `renderStats()` → fills `#stat-row` (Upcoming, Published, Draft, and a Registrations tile rendering `—`); `renderList()` → fills `#event-list` with `.event-card`s (thumb `event.image` + `event.image_alt`, name, `city · eventDateLabel(starts_at)`, `.badge` published/draft, action buttons with `data-action` = `edit|publish|duplicate|delete` and `data-id`), a `.skeleton` placeholder while loading, and a friendly empty state when `state.events` is empty. Tasks 9–10 attach handlers to those buttons; Task 8 provides `refresh()` they call.

- [ ] **Step 1:** `boot()` shows skeleton, `await loadEvents()`, `renderStats()`, `renderList()`, wires nav (`.nav-item[data-view]`, `.tab[data-view]`, `#new-event-btn`, `#new-event-tab`) to toggle `#view-events`/`#view-settings` and `aria-current`.
- [ ] **Step 2:** `renderStats()` builds four `.stat` tiles from `computeStats(state.events)`; Registrations tile shows `—` with title "Available when ticketing lands".
- [ ] **Step 3:** `renderList()` maps `state.events` to cards; escape text (`textContent`, not innerHTML, for user strings) to avoid injection; empty state copy: "No events yet — create your first one." Provide `refresh()` = `loadEvents().then(() => { renderStats(); renderList(); })`.
- [ ] **Manual verification:** logging in shows the seeded events including the draft (with a Draft badge) and the stat counts; slow network shows skeletons first; deleting all rows (via Task 10) shows the empty state.
- [ ] **Commit:** `git add src/admin/app.js; git commit -m "feat(admin): events list with stats, cards, skeleton, empty state"`

### Task 9: Create/edit drawer — form, slug automation, validation, image upload

**Files:** Modify `src/admin/app.js`

**Interfaces:**
- Consumes: `sb`, `slugify`, `validateEvent`, `nextSortOrder`, `refresh`, `triggerPublish` (Task 11 exposes it; define a local `triggerPublish()` here and Task 11 reuses it — see note).
- Produces: `openDrawer(event|null)` populates `#event-form` (fields: name, slug [auto from name until manually edited], city, venue, starts_at [datetime-local], price [dollars ⇄ integer cents], capacity, summary, body, registration_url, published toggle, image file input with live preview + image_alt); `closeDrawer()`; submit → build payload, `validateEvent`, on errors render inline messages, else upload image (if a new file) to Storage bucket `event-media` (`sb.storage.from('event-media').upload(path, file, { upsert:true })`, path = `${slug}-${Date.now()}.${ext}`, then `getPublicUrl` → `payload.image`), then `insert` (new) or `update…eq('id', id)` (edit) with `updated_at = new Date().toISOString()` and `sort_order = nextSortOrder(state.events)` for new rows; on success `closeDrawer()`, toast, `await refresh()`, `await triggerPublish()`.

- [ ] **Step 1:** Build the form markup injector + `openDrawer`/`closeDrawer` (drawer `hidden`/`aria-hidden` toggling, focus first field, Escape + scrim close, focus-trap).
- [ ] **Step 2:** Slug automation: on `name` input, if the user hasn't hand-edited slug, set `slug = slugify(name)`; mark slug "touched" on manual edit.
- [ ] **Step 3:** Price mapping: display dollars, store integer cents (`Math.round(parseFloat(dollars) * 100)`).
- [ ] **Step 4:** Image upload with preview: on file change, show `URL.createObjectURL` preview; require alt text; upload on save as above.
- [ ] **Step 5:** Validation: run `validateEvent(payload)`; render `errors[field]` inline (`--error`); block save until clean; server errors → toast.
- [ ] **Manual verification:** "New event" opens an empty drawer; typing a name auto-fills the slug; editing slug stops auto-fill; missing alt/name blocks save with inline messages; choosing an image shows a preview; saving uploads the image, writes the row, closes the drawer, toasts, and (with a build hook set) kicks a publish; editing an existing event pre-fills every field and updates it.
- [ ] **Commit:** `git add src/admin/app.js; git commit -m "feat(admin): create/edit drawer with slug, validation, image upload"`

### Task 10: Card actions — publish toggle, duplicate, delete, drag-to-reorder

**Files:** Modify `src/admin/app.js`

**Interfaces:**
- Consumes: `sb`, `refresh`, `triggerPublish`, `sortByOrder`.
- Produces: a delegated `#event-list` click handler routing `data-action`: `publish` → `update({ published: !cur, updated_at })…eq('id')`; `duplicate` → `insert` a copy with `name+' (copy)'`, fresh `slug` (`slugify(name)+'-copy'`), `published:false`, `sort_order = nextSortOrder`; `delete` → confirm dialog then `delete()…eq('id')`; `edit` → `openDrawer(event)`. Drag-to-reorder: cards `draggable="true"`; on drop, recompute `sort_order` sequentially for all cards and persist via per-row `update` (or a single upsert array), then `refresh()`. Every mutating action ends with `await triggerPublish()`.

- [ ] **Step 1:** Delegated action handler (publish/duplicate/delete/edit) with confirm on delete; toast per action.
- [ ] **Step 2:** Drag reorder: HTML5 DnD on `.event-card`; compute new order from DOM sequence; write `sort_order` 0..n; `refresh()`; then publish.
- [ ] **Manual verification:** toggling publish flips the badge and (after rebuild) the public site; duplicate creates an unpublished copy with a unique slug; delete asks for confirmation then removes the card; dragging cards reorders them and the order survives a reload (persisted `sort_order`) and matches public-site ordering.
- [ ] **Commit:** `git add src/admin/app.js; git commit -m "feat(admin): publish/duplicate/delete/reorder event actions"`

### Task 11: Page settings — events-page hero editor + shared publish

**Files:** Modify `src/admin/app.js`

**Interfaces:**
- Consumes: `sb`, `toast`.
- Produces: `triggerPublish()` (the shared publish call used by Tasks 9–10) → gets the current session's `access_token` and `fetch('/api/publish', { method:'POST', headers:{ Authorization: 'Bearer '+token } })`; shows a "Publishing… live in ~30s" indicator, toasts done/failed; no-ops gracefully if `/api/publish` returns 404 in local `eleventy --serve`. `loadSettings()` → `sb.from('site_content').select('value').eq('key','events_page').maybeSingle()`; `renderSettingsForm()` → fields eyebrow/heading/lead/video/poster; submit → `upsert({ key:'events_page', value:{ eventsHero:{...} }, updated_at })` then `triggerPublish()`.

- [ ] **Step 1:** Implement `triggerPublish()` + the publishing indicator (reused by 9/10 — define here, and in 9/10 call it; since app.js is one module, ordering is fine as all are hoisted function declarations).
- [ ] **Step 2:** Implement `loadSettings`/`renderSettingsForm`/save (upsert `site_content`).
- [ ] **Manual verification:** the Site Content view pre-fills the current hero; editing the heading + saving upserts `site_content.events_page`, shows the publishing indicator, and (after rebuild) the public `/events/` hero reflects the change.
- [ ] **Commit:** `git add src/admin/app.js; git commit -m "feat(admin): events-page hero editor + shared publish trigger"`

### Task 12: Polish — toasts, reduced-motion, bottom-nav wiring, PWA install, a11y sweep

**Files:** Modify `src/admin/app.js`, `src/admin/admin.css`

**Interfaces:**
- Produces: `toast(msg, kind)` host in `#toasts` (auto-dismiss, `role=status`); service-worker registration (`navigator.serviceWorker.register('/admin/sw.js', { scope:'/admin/' })`); `beforeinstallprompt` capture + an "Install app" affordance; 44px touch targets verified; keyboard focus order + visible focus rings; `prefers-reduced-motion` disables drawer/transition motion.

- [ ] **Step 1:** `toast()` + skeleton polish + reduced-motion CSS guard.
- [ ] **Step 2:** Register the service worker; wire `beforeinstallprompt` to an install button (sidebar + bottom-nav overflow).
- [ ] **Step 3:** A11y sweep: labels tied to inputs, drawer focus-trap + `aria-modal`, `aria-current` on active nav, contrast (use `--brass-text` for text, never `--brass`).
- [ ] **Manual verification:** saves show a toast; on Chrome the install prompt appears and installs to the home screen; keyboard-only can log in, open the drawer, fill and save; reduced-motion disables slide animation; Lighthouse PWA "installable" passes (icons present).
- [ ] **Commit:** `git add src/admin/app.js src/admin/admin.css; git commit -m "feat(admin): toasts, PWA install, reduced-motion, a11y polish"`

---

## Task 13: Docs, env contract, and handoff

**Files:**
- Modify: `AGENTS.md`, `netlify.toml` (env-context comment), create `docs/superpowers/specs/2026-08-19-michelle-dashboard-handoff.md`
- Create/append: `.env.example` (if present; else document in handoff)

**Interfaces:** none (documentation only).

- [ ] **Step 1:** Add `SUPABASE_ANON_KEY` and `NETLIFY_BUILD_HOOK` to `.env.example` (or the handoff doc if no `.env.example`), names only, with one-line purpose each.
- [ ] **Step 2:** Update `AGENTS.md`: mark Sveltia retired (replaced by `src/admin/` bespoke dashboard); update the "Current state" and "Open threads" with the dashboard; correct the stale test count.
- [ ] **Step 3:** Write `docs/superpowers/specs/2026-08-19-michelle-dashboard-handoff.md` — the **owner go-live checklist** (Task 1 open items): apply `0003_events_cms.sql` to the chosen Supabase project (dev then prod); create the `event-media` bucket if the SQL bucket insert is disallowed in that project; invite Michelle as an Auth user (email+password); create the Netlify **build hook** and set `NETLIFY_BUILD_HOOK`; set `SUPABASE_ANON_KEY` (+ existing keys) per Netlify context; verify on a deploy preview: login → CRUD an event → upload image → publish → rebuild → live; confirm RLS (anon cannot read drafts or write). Add exact-size PWA icon art as a follow-up (currently placeholder copies of the brand mark).
- [ ] **Step 4:** Final full sweep — `npm test` → all green; `npm run build` → succeeds. Record the final test count.
- [ ] **Step 5:** Commit

```bash
git add AGENTS.md netlify.toml docs/superpowers/specs/2026-08-19-michelle-dashboard-handoff.md .env.example
git commit -m "docs(admin): env contract, AGENTS handoff, owner go-live checklist"
```

---

## Self-Review

**Spec coverage:** §3 architecture → Tasks 1–5, 7–12. §4 data model (events cols, site_content, storage) → Task 1. §5 auth & RLS → Task 1 (RLS) + Task 7 (auth, recovery). §6 SEO-preserving public integration (events.js, siteContent.js, publish fn) → Tasks 2, 4. §7 UX/design (login, shell, sidebar+bottom-nav, stat row, cards, drawer, page settings, PWA, polish) → Tasks 5, 8–12. §8 env → Global Constraints + Tasks 3, 4, 13. §9 testing → Tasks 1–6 (automated) + 7–12 (manual checklists). §10 migration/cutover → Tasks 1–2, 5 + Task 13 handoff. §11 out-of-scope respected (later nav items disabled; no CRM/merch). §12 open items → Task 13 owner checklist; branch `feat/michelle-dashboard` used.

**Resolved conflict:** §6 (`[]` fallback) vs §9 (existing tests green) → seed-fixture fallback (Global Constraints + Task 2).

**Placeholder scan:** the only intentionally deferred concrete artifacts are (a) full `admin.css` declarations (structure/classes fixed in Task 5; visual values authored at execution against the fixed token block) and (b) exact-size PWA icon art (placeholder copies now, follow-up in Task 13) — both explicitly flagged, not vague TODOs. All testable logic has full code.

**Type consistency:** `events.js`/`siteContent.js` return the field names the templates and `lib.js` use (`slug, name, city, venue, starts_at, price_cents, capacity, summary, body, image, image_alt, published, registration_url, sort_order, updated_at`). `makePublishHandler({ verifySession, triggerBuild })` signature matches test + wiring. `lib.js` exports (`slugify, usd, eventDateLabel, validateEvent, sortByOrder, nextSortOrder, computeStats`) match their imports in Tasks 8–11 and the test.
