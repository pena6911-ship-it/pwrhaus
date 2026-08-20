# Site Content Management (Page Heroes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Michelle edit the hero (eyebrow, heading, lead, and on photo pages the background image + focal position) of every public page from the dashboard's Site Content view, live in ~30–60s via the existing publish path.

**Architecture:** One `site_content` row per page (`home_page`, `membership_page`, …), each holding `{ hero: {...} }`. A generalized `src/_data/siteContent.js` reads all rows, merges each over the committed seed defaults (offline/CI fallback), and exposes `siteContent.pages.<slug>.hero`. Every page template reads its hero from there. The dashboard Site Content view becomes a schema-driven page picker → hero editor, reusing the existing Supabase auth, `event-media` Storage upload, and `/api/publish` rebuild.

**Tech Stack:** Eleventy v3 (Nunjucks), Supabase (Postgres + Storage), vanilla JS dashboard, `node --test`.

## Global Constraints

- **Branch:** implement on `main`. Commit locally, **never push**. Use `git add <explicit paths>`.
- **Shell is Windows PowerShell 5.1** — no `&&`; use `;` or separate lines.
- **`npm test` MUST stay green** at every task boundary (baseline: **116 tests**).
- **No new dependencies, no build step.**
- **Copy hero strings VERBATIM** from the current templates — including HTML entities (`&middot;`, `&amp;`, `&mdash;`, `&eacute;`) and inline `<br>`. No paraphrasing. All hero fields pass through Nunjucks `| safe`.
- **Scope: page heroes only.** Hero CTAs/buttons stay hardcoded. Video pages (Home, Events) edit video/poster as path text (no upload). Pages: Home, Events, Membership, Lessons, Corporate, Sponsors, About.
- **Page registry (single source of truth), key ↔ slug ↔ media:**
  `home_page`↔`home`↔video, `events_page`↔`events`↔video, `membership_page`↔`membership`↔image, `lessons_page`↔`lessons`↔image, `corporate_page`↔`corporate`↔image, `sponsors_page`↔`sponsors`↔image, `about_page`↔`about`↔image.

---

## File Structure

**Modify**
- `data/siteContent.seed.json` — expand from a single `eventsHero` to `{ pages: { <slug>: { hero } } }` for all 7 pages (defaults = current copy).
- `src/_data/siteContent.js` — return `{ pages: { <slug>: { hero } } }`; read all rows; normalize legacy `eventsHero`; seed fallback.
- `src/index.njk`, `src/events.njk`, `src/membership.njk`, `src/lessons.njk`, `src/corporate.njk`, `src/sponsors.njk`, `src/about.njk` — read hero from `siteContent.pages.<slug>.hero`.
- `test/events-data.test.js`, `test/cms-content.test.js` — new `pages` shape.
- `test/build-output.test.js` — assert every page renders its hero heading from data.
- `src/admin/index.html` — restructure `#view-settings` into page-list + form.
- `src/admin/app.js` — replace the single events-hero settings form with the page-picker + schema-driven hero editor.
- `src/admin/admin.css` — styles for the page list.

**Create**
- `supabase/migrations/0004_site_content_pages.sql` — pre-seed a row per new page.
- `test/site-content-pages.test.js` — data-layer + migration assertions.

---

## Task 1: Generalize the site-content data layer (seed + `siteContent.js`)

**Files:**
- Modify: `data/siteContent.seed.json`, `src/_data/siteContent.js`, `test/events-data.test.js`, `test/cms-content.test.js`
- Test: `test/site-content-pages.test.js`

**Interfaces:**
- Produces: `siteContent()` (default export, async) → `{ pages: { home:{hero}, events:{hero}, membership:{hero}, lessons:{hero}, corporate:{hero}, sponsors:{hero}, about:{hero} } }`. Each `hero` has `eyebrow, heading, lead`; video pages add `video, poster`; image pages add `image, position`. Reads Supabase when `SUPABASE_URL`+`SUPABASE_ANON_KEY` present (normalizing a legacy `{eventsHero}` row into `hero`), else the seed. Templates (Task 2) and the dashboard consume `pages.<slug>.hero`.

- [ ] **Step 1: Replace `data/siteContent.seed.json`** with the full page set (copy verbatim):

```json
{
  "pages": {
    "home": { "hero": {
      "eyebrow": "Co-ed &middot; Fort Lauderdale &amp; Miami",
      "heading": "Never golfed?<br>Perfect.",
      "lead": "Most of our members hadn't either. They came for the business. They stayed for the game.",
      "video": "/img/Golfmiami_aerial.mp4",
      "poster": "/img/groupgolf1.jpg"
    } },
    "events": { "hero": {
      "eyebrow": "Events",
      "heading": "Rooms where the right people already have something in common.",
      "lead": "PWRHaus events pair golf with intentional introductions for founders, operators, and business owners across Fort Lauderdale and Miami.",
      "video": "/img/Dronegolfcourse.mp4",
      "poster": "/img/groupgolf1.jpg"
    } },
    "membership": { "hero": {
      "eyebrow": "Membership",
      "heading": "Three ways in.",
      "lead": "Start free and look around. Join when it's obviously worth it.",
      "image": "/img/membership-hero.jpg",
      "position": "50% 65%"
    } },
    "lessons": { "hero": {
      "eyebrow": "Lessons",
      "heading": "You don't need to know how to play.",
      "lead": "Most PWRHaus members had never held a club before joining. Now they play. That is the entire point of this.",
      "image": "/img/lessons-hero.jpg",
      "position": "50% 55%"
    } },
    "corporate": { "hero": {
      "eyebrow": "Corporate",
      "heading": "Bring the simulator to your conference.",
      "lead": "We run golf experiences at corporate events &mdash; sales conferences, offsites, client days. It works because it gives people something to do together that isn't a name badge and a canap&eacute;.",
      "image": "/img/corporate-hero.webp",
      "position": "50% 40%"
    } },
    "sponsors": { "hero": {
      "eyebrow": "Sponsorship",
      "heading": "Put your brand in the room.",
      "lead": "PWRHaus events are founders, owners and operators &mdash; the audience most sponsorship budgets are aiming at and usually miss.",
      "image": "/img/sponsors-hero.jpg",
      "position": "50% 55%"
    } },
    "about": { "hero": {
      "eyebrow": "About",
      "heading": "We started because the deals were happening somewhere we weren't.",
      "lead": "PWRHaus began as a women's golf society and became something broader: a co-ed network of founders and owners who do business on a golf course.",
      "image": "/img/groupgolf1.jpg",
      "position": "50% 60%"
    } }
  }
}
```

- [ ] **Step 2: Write the failing test** — `test/site-content-pages.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SLUGS = ['home', 'events', 'membership', 'lessons', 'corporate', 'sponsors', 'about'];

async function load(key) {
  const prev = { u: process.env.SUPABASE_URL, k: process.env.SUPABASE_ANON_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY;
  try { return await (await import(`../src/_data/siteContent.js?${key}`)).default(); }
  finally {
    if (prev.u === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prev.u;
    if (prev.k === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = prev.k;
  }
}

test('siteContent seed fixture has a hero for every page', () => {
  const seed = JSON.parse(readFileSync('data/siteContent.seed.json', 'utf8'));
  for (const slug of SLUGS) {
    const hero = seed.pages?.[slug]?.hero;
    assert.ok(hero, `missing pages.${slug}.hero`);
    assert.ok(hero.eyebrow?.trim(), `${slug} eyebrow`);
    assert.ok(hero.heading?.trim(), `${slug} heading`);
    assert.ok(hero.lead?.trim(), `${slug} lead`);
  }
  assert.ok(seed.pages.home.hero.video, 'home is a video hero');
  assert.ok(seed.pages.membership.hero.image, 'membership is an image hero');
  assert.ok(seed.pages.membership.hero.position, 'image heroes carry a focal position');
});

test('siteContent.js returns pages.<slug>.hero for every page (seed fallback)', async () => {
  const content = await load('pages');
  for (const slug of SLUGS) {
    assert.ok(content.pages[slug].hero.heading.trim(), `${slug} heading rendered from data`);
  }
  assert.equal(content.pages.events.hero.heading, 'Rooms where the right people already have something in common.');
});
```

- [ ] **Step 3: Run it, confirm it fails** — `cd C:\dev\pwrhaus; node --test test/site-content-pages.test.js` → FAIL (siteContent.js still returns `{ eventsHero }`).

- [ ] **Step 4: Rewrite `src/_data/siteContent.js`**

```js
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// key ↔ slug for every editable page. Single source of truth for the build.
const PAGE_KEYS = {
  home_page: 'home',
  events_page: 'events',
  membership_page: 'membership',
  lessons_page: 'lessons',
  corporate_page: 'corporate',
  sponsors_page: 'sponsors',
  about_page: 'about',
};

const seed = () => JSON.parse(readFileSync(new URL('../../data/siteContent.seed.json', import.meta.url), 'utf8'));

export default async function siteContent() {
  const fallback = seed();
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return fallback;
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.from('site_content').select('key,value');
    if (error) throw error;
    const rows = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
    const pages = {};
    for (const [key, slug] of Object.entries(PAGE_KEYS)) {
      const defaults = fallback.pages[slug]?.hero ?? {};
      const value = rows[key] ?? {};
      // Normalize the legacy events shape ({ eventsHero }) into { hero }.
      const hero = value.hero ?? value.eventsHero ?? {};
      pages[slug] = { hero: { ...defaults, ...hero } };
    }
    return { pages };
  } catch (err) {
    console.warn('[siteContent.js] Supabase read failed, using seed:', err.message);
    return fallback;
  }
}
```

- [ ] **Step 5: Update `test/events-data.test.js`** — replace the `siteContent` assertion block:

```js
test('siteContent.js falls back to the seed heroes when Supabase env is absent', async () => {
  const prevUrl = process.env.SUPABASE_URL, prevKey = process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY;
  try {
    const content = await load('siteContent', 'seed');
    assert.ok(content.pages, 'must expose pages');
    assert.ok(content.pages.events.hero.heading.trim());
    assert.ok(content.pages.home.hero.heading.trim());
  } finally {
    if (prevUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = prevKey;
  }
});
```

- [ ] **Step 6: Update `test/cms-content.test.js`** — replace the `siteContent` fixture test with the new shape:

```js
test('seed siteContent fixture exposes a hero per page', () => {
  assert.ok(siteContent.pages, 'seed must expose pages');
  assert.ok(siteContent.pages.events.hero.heading.trim(), 'events hero heading is required');
  assert.ok(siteContent.pages.home.hero.lead.trim(), 'home hero lead is required');
});
```
(Keep the top-of-file `const siteContent = JSON.parse(readFileSync('data/siteContent.seed.json', 'utf8'));` line as-is.)

- [ ] **Step 7: Run all data tests** — `node --test test/site-content-pages.test.js test/events-data.test.js test/cms-content.test.js` → PASS.

- [ ] **Step 8: Commit**

```bash
git add data/siteContent.seed.json src/_data/siteContent.js test/site-content-pages.test.js test/events-data.test.js test/cms-content.test.js
git commit -m "feat(content): generalize siteContent to per-page heroes (seed + data layer)"
```

---

## Task 2: Point every page template at the data layer

**Files:**
- Modify: `src/index.njk`, `src/events.njk`, `src/membership.njk`, `src/lessons.njk`, `src/corporate.njk`, `src/sponsors.njk`, `src/about.njk`, `test/build-output.test.js`

**Interfaces:**
- Consumes: `siteContent.pages.<slug>.hero` from Task 1.
- Produces: identical rendered output to today (defaults = current copy), now sourced from data so dashboard edits flow through.

- [ ] **Step 1: Add the failing build assertion** — in `test/build-output.test.js`, add:

```js
test('every page renders its hero heading from site content', () => {
  const cases = [
    ['index.html', 'Never golfed?'],
    ['events/index.html', 'Rooms where the right people already have something in common.'],
    ['membership/index.html', 'Three ways in.'],
    ['lessons/index.html', 'You don&#39;t need to know how to play.'],
    ['corporate/index.html', 'Bring the simulator to your conference.'],
    ['sponsors/index.html', 'Put your brand in the room.'],
    ['about/index.html', 'We started because the deals were happening somewhere we weren&#39;t.'],
  ];
  for (const [rel, needle] of cases) {
    const html = readFileSync(join(outDir, rel), 'utf8');
    assert.ok(html.includes(needle), `${rel} should render its hero heading (${needle})`);
  }
});
```
> Note: Nunjucks HTML-escapes the apostrophe in `<h1>` text to `&#39;`. The lessons/about needles above use the escaped form. Verify against the actual build output in Step 4 and adjust the needle to match exactly if the escaping differs.

- [ ] **Step 2: Run it — it PASSES already** (the current hardcoded copy matches). This test is a *regression guard*: it must keep passing after the refactor. Run `node --test test/build-output.test.js` and confirm green now.

- [ ] **Step 3: Refactor `src/index.njk`** — replace the `pageHero({...})` field values (keep `actions` exactly as-is):

```njk
{{ pageHero({
  eyebrow: siteContent.pages.home.hero.eyebrow,
  heading: siteContent.pages.home.hero.heading,
  lead: siteContent.pages.home.hero.lead,
  video: siteContent.pages.home.hero.video,
  poster: siteContent.pages.home.hero.poster,
  actions: [
    { label: "Create free profile", href: "#join-web_free_profile", class: "btn-primary" },
    { label: "How membership works", href: "/membership/", class: "btn-secondary" }
  ]
}) }}
```

- [ ] **Step 4: Refactor `src/events.njk`** — change the hero call from `siteContent.eventsHero.*` to:

```njk
{{ pageHero({
  eyebrow: siteContent.pages.events.hero.eyebrow,
  heading: siteContent.pages.events.hero.heading,
  lead: siteContent.pages.events.hero.lead,
  video: siteContent.pages.events.hero.video,
  poster: siteContent.pages.events.hero.poster
}) }}
```

- [ ] **Step 5: Refactor the four image pages.** For each, replace the hero field values with `siteContent.pages.<slug>.hero.*`, keeping `eyebrow/heading/lead/image/position`:
  - `src/membership.njk` → `siteContent.pages.membership.hero.{eyebrow,heading,lead,image,position}`
  - `src/lessons.njk` → `siteContent.pages.lessons.hero.*`
  - `src/corporate.njk` → `siteContent.pages.corporate.hero.*`
  - `src/sponsors.njk` → `siteContent.pages.sponsors.hero.*`
  - `src/about.njk` → `siteContent.pages.about.hero.*`

  Example (`membership.njk`):
  ```njk
  {{ pageHero({
    eyebrow: siteContent.pages.membership.hero.eyebrow,
    heading: siteContent.pages.membership.hero.heading,
    lead: siteContent.pages.membership.hero.lead,
    image: siteContent.pages.membership.hero.image,
    position: siteContent.pages.membership.hero.position
  }) }}
  ```

- [ ] **Step 6: Build + verify unchanged output** — `npm run build`; then `node --test test/build-output.test.js` → all green (the regression guard from Step 1 still passes; headings unchanged). If a needle mismatches on escaping, correct the needle in Step 1 to the exact built string.

- [ ] **Step 7: Full sweep + commit**

```bash
git add src/index.njk src/events.njk src/membership.njk src/lessons.njk src/corporate.njk src/sponsors.njk src/about.njk test/build-output.test.js
git commit -m "feat(content): render every page hero from siteContent (defaults unchanged)"
```

---

## Task 3: Pre-seed migration `0004_site_content_pages.sql`

**Files:**
- Create: `supabase/migrations/0004_site_content_pages.sql`
- Modify: `test/site-content-pages.test.js` (add migration assertions)

**Interfaces:**
- Produces: idempotent `insert ... on conflict (key) do nothing` rows for the six new page keys, each `{ hero }` matching the seed. `events_page` is left untouched (seeded by `0003`).

- [ ] **Step 1: Add the failing migration test** — append to `test/site-content-pages.test.js`:

```js
import { readFileSync as read } from 'node:fs';

test('0004 pre-seeds a site_content row for each new page', () => {
  const sql = read(new URL('../supabase/migrations/0004_site_content_pages.sql', import.meta.url), 'utf8').toLowerCase();
  for (const key of ['home_page', 'membership_page', 'lessons_page', 'corporate_page', 'sponsors_page', 'about_page']) {
    assert.ok(sql.includes(`'${key}'`), `missing seed for ${key}`);
  }
  assert.match(sql, /insert into site_content/);
  assert.match(sql, /on conflict \(key\) do nothing/);
  assert.match(sql, /jsonb_build_object\('hero'/);
});
```

- [ ] **Step 2: Run, confirm fail** — `node --test test/site-content-pages.test.js` → FAIL (migration missing).

- [ ] **Step 3: Write `supabase/migrations/0004_site_content_pages.sql`** (copy = seed defaults, verbatim):

```sql
-- Pre-seed one site_content row per public page so the dashboard shows the
-- current hero copy on first load. Idempotent. events_page is seeded by 0003.
insert into site_content (key, value) values
('home_page', jsonb_build_object('hero', jsonb_build_object(
  'eyebrow','Co-ed &middot; Fort Lauderdale &amp; Miami',
  'heading','Never golfed?<br>Perfect.',
  'lead','Most of our members hadn''t either. They came for the business. They stayed for the game.',
  'video','/img/Golfmiami_aerial.mp4',
  'poster','/img/groupgolf1.jpg'))),
('membership_page', jsonb_build_object('hero', jsonb_build_object(
  'eyebrow','Membership',
  'heading','Three ways in.',
  'lead','Start free and look around. Join when it''s obviously worth it.',
  'image','/img/membership-hero.jpg',
  'position','50% 65%'))),
('lessons_page', jsonb_build_object('hero', jsonb_build_object(
  'eyebrow','Lessons',
  'heading','You don''t need to know how to play.',
  'lead','Most PWRHaus members had never held a club before joining. Now they play. That is the entire point of this.',
  'image','/img/lessons-hero.jpg',
  'position','50% 55%'))),
('corporate_page', jsonb_build_object('hero', jsonb_build_object(
  'eyebrow','Corporate',
  'heading','Bring the simulator to your conference.',
  'lead','We run golf experiences at corporate events &mdash; sales conferences, offsites, client days. It works because it gives people something to do together that isn''t a name badge and a canap&eacute;.',
  'image','/img/corporate-hero.webp',
  'position','50% 40%'))),
('sponsors_page', jsonb_build_object('hero', jsonb_build_object(
  'eyebrow','Sponsorship',
  'heading','Put your brand in the room.',
  'lead','PWRHaus events are founders, owners and operators &mdash; the audience most sponsorship budgets are aiming at and usually miss.',
  'image','/img/sponsors-hero.jpg',
  'position','50% 55%'))),
('about_page', jsonb_build_object('hero', jsonb_build_object(
  'eyebrow','About',
  'heading','We started because the deals were happening somewhere we weren''t.',
  'lead','PWRHaus began as a women''s golf society and became something broader: a co-ed network of founders and owners who do business on a golf course.',
  'image','/img/groupgolf1.jpg',
  'position','50% 60%')))
on conflict (key) do nothing;
```
> Note the SQL-escaped single quotes (`''`) in `hadn''t`, `it''s`, `don''t`, `isn''t`, `weren''t`, `women''s`.

- [ ] **Step 4: Run, confirm pass** — `node --test test/site-content-pages.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_site_content_pages.sql test/site-content-pages.test.js
git commit -m "feat(db): 0004 pre-seed site_content rows for every page hero"
```

---

## Task 4: Dashboard Site Content — page picker + schema-driven hero editor

**Files:**
- Modify: `src/admin/index.html`, `src/admin/app.js`, `src/admin/admin.css`, `test/build-output.test.js`

**Interfaces:**
- Consumes: `sb`, `toast`, `triggerPublish`, `uploadImage(file, slug)` (all existing in `app.js`).
- Produces: a Site Content view listing all pages; selecting one loads its `site_content` row and renders a hero form; saving upserts `{ hero }` and publishes.

> **Testing note:** this is browser/DOM code (no browser test harness). Automated coverage is the build-output structural assertion below; behavior is verified by the manual checklist. `npm test` stays green.

- [ ] **Step 1: Add the failing structural assertion** — in `test/build-output.test.js`, extend the admin test (or add one):

```js
test('admin Site Content view lists the editable pages', () => {
  const html = readFileSync(join(outDir, 'admin', 'index.html'), 'utf8');
  assert.match(html, /id="page-list"/, 'Site Content must render a page list');
});
```

- [ ] **Step 2: Run, confirm fail** — `node --test test/build-output.test.js` → FAIL.

- [ ] **Step 3: Restructure `#view-settings` in `src/admin/index.html`**:

```html
<section id="view-settings" class="view" hidden>
  <div class="view-head"><h2>Site content</h2></div>
  <div class="content-layout">
    <nav class="page-list" id="page-list" aria-label="Pages"><!-- page buttons injected --></nav>
    <form id="settings-form" class="settings-form"><!-- hero fields injected --></form>
  </div>
</section>
```

- [ ] **Step 4: Replace the settings section in `src/admin/app.js`.** Remove the old `settingsFields()`, `wireSettings()`, `loadSettings()`, `onSettingsSubmit()` and the `settingsWired` flag; replace with:

```js
/* ============================ site content (page heroes) ============================ */

const PAGES = [
  { key: 'home_page',       slug: 'home',       label: 'Home',       media: 'video' },
  { key: 'events_page',     slug: 'events',     label: 'Events',     media: 'video' },
  { key: 'membership_page', slug: 'membership', label: 'Membership', media: 'image' },
  { key: 'lessons_page',    slug: 'lessons',    label: 'Lessons',    media: 'image' },
  { key: 'corporate_page',  slug: 'corporate',  label: 'Corporate',  media: 'image' },
  { key: 'sponsors_page',   slug: 'sponsors',   label: 'Sponsors',   media: 'image' },
  { key: 'about_page',      slug: 'about',      label: 'About',      media: 'image' },
];

let settingsWired = false;
function wireSettings() {
  const list = $('#page-list');
  list.innerHTML = '';
  for (const p of PAGES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'page-item'; b.dataset.key = p.key;
    b.textContent = p.label;
    b.addEventListener('click', () => selectPage(p.key));
    list.appendChild(b);
  }
  if (!settingsWired) {
    settingsWired = true;
    $('#settings-form').addEventListener('submit', onSettingsSubmit);
  }
  selectPage(PAGES[0].key); // default to Home
}

function heroFields(page, hero) {
  const t = (id, label, val, area) => area
    ? `<label>${label}<textarea id="${id}">${escapeHtml(val || '')}</textarea></label>`
    : `<label>${label}<input id="${id}" type="text" value="${escapeAttr(val || '')}"></label>`;
  let media = '';
  if (page.media === 'image') {
    media =
      `<label>Hero image<input id="s-image-file" type="file" accept="image/*"></label>` +
      `<img id="s-image-preview" class="img-preview" alt=""${hero.image ? '' : ' hidden'}${hero.image ? ` src="${escapeAttr(hero.image)}"` : ''}>` +
      t('s-position', 'Focal position (e.g. 50% 55%)', hero.position);
  } else {
    media = t('s-video', 'Hero video path', hero.video) + t('s-poster', 'Poster image path', hero.poster);
  }
  return t('s-eyebrow', 'Eyebrow', hero.eyebrow) +
         t('s-heading', 'Heading', hero.heading, true) +
         t('s-lead', 'Lead', hero.lead, true) +
         media +
         `<p class="form-error" id="settings-error" role="alert" hidden></p>` +
         `<div class="drawer-actions"><button class="btn btn-primary" type="submit">Save page</button></div>`;
}

function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

async function selectPage(key) {
  state.currentPageKey = key;
  state.pendingHeroFile = null;
  $$('.page-item').forEach((b) => b.classList.toggle('active', b.dataset.key === key));
  const page = PAGES.find((p) => p.key === key);
  const { data } = await sb.from('site_content').select('value').eq('key', key).maybeSingle();
  const hero = data?.value?.hero ?? data?.value?.eventsHero ?? {};
  $('#settings-form').innerHTML = heroFields(page, hero);
  if (page.media === 'image') {
    $('#s-image-file').addEventListener('change', () => {
      const file = $('#s-image-file').files[0];
      state.pendingHeroFile = file || null;
      const prev = $('#s-image-preview');
      if (file) { prev.src = URL.createObjectURL(file); prev.hidden = false; }
    });
  }
}

async function onSettingsSubmit(e) {
  e.preventDefault();
  const err = $('#settings-error');
  err.hidden = true;
  const page = PAGES.find((p) => p.key === state.currentPageKey);
  const hero = {
    eyebrow: $('#s-eyebrow').value.trim(),
    heading: $('#s-heading').value.trim(),
    lead: $('#s-lead').value.trim(),
  };
  if (!hero.heading || !hero.lead) { err.textContent = 'Heading and lead are required.'; err.hidden = false; return; }
  if (page.media === 'image') {
    hero.position = $('#s-position').value.trim() || '50% 50%';
    hero.image = $('#s-image-preview').getAttribute('src') || '';
    if (state.pendingHeroFile) {
      try { hero.image = await uploadImage(state.pendingHeroFile, page.slug); }
      catch (uErr) { err.textContent = 'Image upload failed: ' + uErr.message; err.hidden = false; return; }
    }
    if (!hero.image) { err.textContent = 'A hero image is required.'; err.hidden = false; return; }
  } else {
    hero.video = $('#s-video').value.trim();
    hero.poster = $('#s-poster').value.trim();
  }
  const { error } = await sb.from('site_content').upsert({ key: page.key, value: { hero }, updated_at: new Date().toISOString() });
  if (error) { err.textContent = error.message; err.hidden = false; return; }
  toast(`${page.label} page saved.`, 'info');
  triggerPublish();
}
```
> `boot()` already calls `wireSettings()`; keep that call. It previously also called `loadSettings()` — **remove that call** (page content now loads on selection).

- [ ] **Step 5: Add page-list styles to `src/admin/admin.css`** (near the settings-form rule):

```css
.content-layout { display: grid; gap: var(--space-5); }
.page-list { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.page-item { min-height: var(--touch); padding: 0 var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-pill); background: var(--paper-raised); color: var(--ink); font-weight: 600; cursor: pointer; }
.page-item.active { background: var(--forest); color: #fff; border-color: var(--forest); }
@media (min-width: 768px) { .content-layout { grid-template-columns: 200px 1fr; align-items: start; } .page-list { flex-direction: column; } }
```

- [ ] **Step 6: Build + verify** — `npm run build`; `node --test test/build-output.test.js` → the `#page-list` assertion passes; all others green. `node --check src/admin/app.js` → syntax OK.

- [ ] **Step 7: Manual verification** (`netlify dev --offline` against dev Supabase, apply `0004` first): open `/admin/` → Site Content → the seven pages list; select **Membership** → fields pre-fill from Supabase; edit the heading, upload a new hero image, set position → Save → toast + publish; select **Home** → edit text, video/poster shown as paths; rebuild → the public heroes reflect the edits.

- [ ] **Step 8: Full sweep + commit**

```bash
git add src/admin/index.html src/admin/app.js src/admin/admin.css test/build-output.test.js
git commit -m "feat(admin): Site Content page picker + hero editor for every page"
```

---

## Task 5: Docs update

**Files:**
- Modify: `AGENTS.md`, `docs/superpowers/specs/2026-08-19-michelle-dashboard-handoff.md`

- [ ] **Step 1:** In `AGENTS.md`, note Phase 2a shipped: the dashboard Site Content view now edits every page's hero (not just events); migration `0004` pre-seeds page rows; hero image uploads reuse the `event-media` bucket.
- [ ] **Step 2:** In the handoff doc, add applying `0004_site_content_pages.sql` to the owner go-live migration list.
- [ ] **Step 3:** Final full sweep — `npm test` all green; `npm run build` succeeds. Record the final test count.
- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/superpowers/specs/2026-08-19-michelle-dashboard-handoff.md
git commit -m "docs: Phase 2a site content management shipped; 0004 in go-live list"
```

---

## Self-Review

**Spec coverage:** §2 data model → Task 1 (seed shape) + Task 3 (migration). §3 build integration (siteContent.js + templates) → Tasks 1–2. §4 dashboard UX (page picker, schema form, image upload on photo pages, path fields on video pages, upsert + publish) → Task 4. §5 testing → Tasks 1–4 (data/migration/build automated; dashboard manual + structural). §6 verbatim copy → embedded literally in Task 1 seed + Task 3 migration. §7 out-of-scope respected (heroes only, CTAs hardcoded, no video upload). §8 branch `main` → Global Constraints.

**Placeholder scan:** the only deferred concrete is the exact HTML-escaping of the apostrophe in two build-output needles (Task 2 Step 1) — explicitly flagged to verify against real build output and correct, not a vague TODO. All code is complete.

**Type consistency:** `siteContent.pages.<slug>.hero` used identically in Task 1 (produced), Task 2 (templates), and the seed. `PAGES` registry keys/slugs/media match `PAGE_KEYS` in `siteContent.js` and the `0004` keys. `uploadImage(file, slug)`, `triggerPublish()`, `toast()`, `sb`, `$`, `$$`, `state` all exist in the current `app.js`. The settings form ids (`s-eyebrow`, `s-heading`, `s-lead`, `s-image-file`, `s-image-preview`, `s-position`, `s-video`, `s-poster`, `settings-error`) are defined in `heroFields()` and read in `onSettingsSubmit()` consistently.
