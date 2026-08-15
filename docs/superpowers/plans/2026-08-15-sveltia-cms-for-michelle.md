# Sveltia CMS For Michelle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a review-first Sveltia CMS setup so Michelle can edit structured event and page content without a custom admin platform.

**Architecture:** Sveltia lives at `/admin/` as static Eleventy output. The CMS edits JSON files in `src/_data/` and media under `src/img/cms/`; Eleventy renders those files into the public Events page and event detail pages. GitHub remains the storage/review layer, with Sveltia configured for the `pena6911-ship-it/pwrhaus` repo. `events.json` is an object with an `events` array so Sveltia can edit the file cleanly.

**Tech Stack:** Eleventy v3, Nunjucks, vanilla JS/CSS, Sveltia CMS loaded on the admin page, GitHub backend, Node `node:test`.

## Global Constraints

- Do not add npm dependencies or a new frontend framework.
- Shell is Windows PowerShell 5.1; do not use `&&`.
- Use `git add -u` for tracked files and explicit paths for new files; never use `git add -A`.
- Do not run `git push`.
- Preserve Clubhouse Light tokens; do not substitute colors, type, spacing, or radii.
- CSS remains mobile-first with `min-width` media queries only.
- No `box-shadow`.
- Never use `color: var(--brass)` for text; use `--brass-text`.
- Every `<img>` rendered by the public site has non-empty alt text.
- Every built public page has exactly one `<h1>`.
- F&Co footer credit remains on every public page.
- `/admin/` is an admin utility page and should not be treated as a public marketing page.

---

## File Structure

- Create `src/admin/index.html`: static Sveltia CMS boot page, no public-site layout.
- Create `src/admin/config.yml`: concrete Sveltia config for GitHub backend, editorial workflow, events collection, and page-content singleton.
- Create `src/_data/events.json`: CMS-editable event list.
- Create `src/_data/publishedEvents.js`: filters `events.json` to public events for templates and generated pages.
- Create `src/_data/siteContent.json`: CMS-editable page-content singleton with Events hero fields.
- Modify `src/events.njk`: render Events hero and event lists from data.
- Create `src/events/detail.njk`: generated detail pages for each published event.
- Modify `eleventy.config.js`: add date/event helper filters and passthrough-copy `src/admin/config.yml`.
- Modify `test/build-output.test.js`: add assertions for admin output and event generation.
- Create `test/cms-content.test.js`: validate CMS data shape before Eleventy builds.
- Create `src/img/cms/.gitkeep`: keep the CMS upload folder in Git.

---

### Task 1: CMS Data Shape Tests

**Files:**
- Create: `test/cms-content.test.js`
- Create: `src/_data/events.json`
- Create: `src/_data/siteContent.json`

**Interfaces:**
- Produces: `events.json` as an object with an `events` array of event objects.
- Produces: `siteContent.json.eventsHero` with `eyebrow`, `heading`, `lead`, `video`, and `poster`.

- [ ] **Step 1: Write the failing data-shape tests**

Create `test/cms-content.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const eventsData = JSON.parse(readFileSync('src/_data/events.json', 'utf8'));
const events = eventsData.events;
const siteContent = JSON.parse(readFileSync('src/_data/siteContent.json', 'utf8'));

const requiredEventFields = [
  'slug',
  'name',
  'city',
  'venue',
  'starts_at',
  'price_cents',
  'capacity',
  'summary',
  'body',
  'image',
  'image_alt',
  'published',
  'registration_url',
];

test('events.json exposes a CMS-editable events array', () => {
  assert.ok(eventsData && typeof eventsData === 'object', 'events.json must be an object');
  assert.ok(Array.isArray(events), 'events.json must be an array');
  assert.ok(events.length >= 2, 'seed at least one upcoming and one past event');

  const slugs = new Set();
  for (const event of events) {
    for (const field of requiredEventFields) {
      assert.ok(Object.hasOwn(event, field), `${event.name ?? 'event'} missing ${field}`);
    }
    assert.match(event.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${event.slug} must be URL-safe`);
    assert.equal(slugs.has(event.slug), false, `duplicate event slug ${event.slug}`);
    slugs.add(event.slug);
    assert.equal(typeof event.published, 'boolean', `${event.slug}.published must be boolean`);
    assert.equal(Number.isInteger(event.price_cents), true, `${event.slug}.price_cents must be integer cents`);
    assert.equal(Number.isInteger(event.capacity), true, `${event.slug}.capacity must be an integer`);
    assert.ok(Date.parse(event.starts_at), `${event.slug}.starts_at must be parseable`);
    assert.ok(event.image.startsWith('/img/'), `${event.slug}.image must be a site image path`);
    assert.ok(event.image_alt.trim().length > 0, `${event.slug}.image_alt is required`);
  }
});

test('siteContent.json exposes the events page hero singleton', () => {
  assert.ok(siteContent.eventsHero, 'siteContent.json must define eventsHero');
  assert.equal(typeof siteContent.eventsHero.eyebrow, 'string');
  assert.equal(typeof siteContent.eventsHero.heading, 'string');
  assert.equal(typeof siteContent.eventsHero.lead, 'string');
  assert.ok(siteContent.eventsHero.heading.trim().length > 0, 'events hero heading is required');
  assert.ok(siteContent.eventsHero.lead.trim().length > 0, 'events hero lead is required');
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run: `node --test test/cms-content.test.js`

Expected: FAIL because `src/_data/events.json` and `src/_data/siteContent.json` do not exist yet.

- [ ] **Step 3: Add seed CMS data**

Create `src/_data/events.json`:

```json
{
  "events": [
    {
      "slug": "fall-founder-scramble",
      "name": "Fall Founder Scramble",
      "city": "Fort Lauderdale",
      "venue": "TPC Eagle Trace",
      "starts_at": "2026-09-18T13:00:00-04:00",
      "price_cents": 15000,
      "capacity": 40,
      "summary": "A business-first scramble for founders, operators, and investors.",
      "body": "A relaxed competitive round built for warm introductions, smart pairings, and useful follow-up after the final putt.",
      "image": "/img/groupgolf1.jpg",
      "image_alt": "Golfers walking together across a green course",
      "published": true,
      "registration_url": null
    },
    {
      "slug": "spring-networking-nine",
      "name": "Spring Networking Nine",
      "city": "Miami",
      "venue": "The Tips Golf Miami",
      "starts_at": "2026-04-22T17:30:00-04:00",
      "price_cents": 8500,
      "capacity": 24,
      "summary": "Nine holes, one focused room of business owners, and enough time to actually talk.",
      "body": "This evening-format event pairs golf with intentional introductions for members and prospective members.",
      "image": "/img/corporate-hero.webp",
      "image_alt": "PWRHaus members gathered at an indoor golf venue",
      "published": true,
      "registration_url": null
    },
    {
      "slug": "draft-member-preview",
      "name": "Draft Member Preview",
      "city": "Miami",
      "venue": "Private venue",
      "starts_at": "2026-10-10T10:00:00-04:00",
      "price_cents": 0,
      "capacity": 12,
      "summary": "Hidden seed event used to verify unpublished CMS records stay private.",
      "body": "This event should not appear on the public site until Michelle marks it published.",
      "image": "/img/corporate-hero.webp",
      "image_alt": "Indoor golf venue lounge",
      "published": false,
      "registration_url": null
    }
  ]
}
```

Create `src/_data/siteContent.json`:

```json
{
  "eventsHero": {
    "eyebrow": "Events",
    "heading": "Rooms where the right people already have something in common.",
    "lead": "PWRHaus events pair golf with intentional introductions for founders, operators, and business owners across Fort Lauderdale and Miami.",
    "video": "/img/Dronegolfcourse.mp4",
    "poster": "/img/groupgolf1.jpg"
  }
}
```

- [ ] **Step 4: Run the data-shape test and verify it passes**

Run: `node --test test/cms-content.test.js`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add -- test/cms-content.test.js src/_data/events.json src/_data/siteContent.json
git commit -m "Add CMS-editable content data"
```

---

### Task 2: Event Rendering Filters And Published Data

**Files:**
- Create: `src/_data/publishedEvents.js`
- Modify: `eleventy.config.js`
- Test: `test/cms-content.test.js`

**Interfaces:**
- Produces: Eleventy global data `publishedEvents`, filtered from `events.json`.
- Produces filters: `eventDate`, `upcomingEvents`, `pastEvents`.

- [ ] **Step 1: Extend tests for published filtering and event helpers**

Append to `test/cms-content.test.js`:

```js
test('publishedEvents contains only published event records', async () => {
  const { default: publishedEvents } = await import('../src/_data/publishedEvents.js');
  assert.ok(publishedEvents.length > 0, 'expected at least one published event');
  assert.equal(
    publishedEvents.some((event) => event.slug === 'draft-member-preview'),
    false,
    'unpublished events must not be exposed as publishedEvents',
  );
  assert.equal(
    publishedEvents.every((event) => event.published === true),
    true,
    'publishedEvents may only include published records',
  );
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/cms-content.test.js`

Expected: FAIL because `src/_data/publishedEvents.js` does not exist.

- [ ] **Step 3: Add `publishedEvents.js`**

Create `src/_data/publishedEvents.js`:

```js
import { readFileSync } from 'node:fs';

const eventsData = JSON.parse(readFileSync(new URL('./events.json', import.meta.url), 'utf8'));

export default eventsData.events.filter((event) => event.published === true);
```

- [ ] **Step 4: Add event filters to Eleventy config**

In `eleventy.config.js`, after the existing `usd` filter, add:

```js
  const sortByStart = (events = []) =>
    [...events].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));

  eleventyConfig.addFilter('eventDate', (value) =>
    new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(value)),
  );

  eleventyConfig.addFilter('upcomingEvents', (events = []) => {
    const now = new Date();
    return sortByStart(events).filter((event) => new Date(event.starts_at) >= now);
  });

  eleventyConfig.addFilter('pastEvents', (events = []) => {
    const now = new Date();
    return sortByStart(events)
      .filter((event) => new Date(event.starts_at) < now)
      .reverse();
  });
```

- [ ] **Step 5: Run the focused test**

Run: `node --test test/cms-content.test.js`

Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

Run:

```powershell
git add -u
git add -- src/_data/publishedEvents.js
git commit -m "Add event publishing helpers"
```

---

### Task 3: Data-Driven Events Page And Detail Pages

**Files:**
- Modify: `src/events.njk`
- Create: `src/events/detail.njk`
- Modify: `test/build-output.test.js`

**Interfaces:**
- Consumes: `siteContent.eventsHero`
- Consumes: `publishedEvents`
- Consumes filters: `eventDate`, `upcomingEvents`, `pastEvents`, `usd`
- Produces public URLs `/events/`, `/events/fall-founder-scramble/`, `/events/spring-networking-nine/`

- [ ] **Step 1: Add build-output tests for event rendering**

Append to `test/build-output.test.js`:

```js
test('events page renders published CMS events and hides drafts', () => {
  const html = readFileSync(join(outDir, 'events', 'index.html'), 'utf8');
  assert.match(html, /Fall Founder Scramble/, 'published upcoming event should render');
  assert.match(html, /Spring Networking Nine/, 'published past event should render');
  assert.doesNotMatch(html, /Draft Member Preview/, 'unpublished event should not render');
  assert.match(html, /Upcoming/, 'events page should label upcoming events');
  assert.match(html, /Past/, 'events page should label past events');
});

test('published CMS events generate detail pages and drafts do not', () => {
  const fall = readFileSync(join(outDir, 'events', 'fall-founder-scramble', 'index.html'), 'utf8');
  assert.match(fall, /Fall Founder Scramble/);
  assert.match(fall, /A business-first scramble/);

  assert.throws(
    () => readFileSync(join(outDir, 'events', 'draft-member-preview', 'index.html'), 'utf8'),
    /ENOENT/,
    'unpublished events must not generate public detail pages',
  );
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test`

Expected: FAIL because the current Events page is a static placeholder and no event detail pages exist.

- [ ] **Step 3: Replace `src/events.njk` with data-driven markup**

Use this content:

```njk
---
layout: base.njk
title: Events — PWRHaus Golf Society
description: Scrambles and socials for founders and business owners in Fort Lauderdale and Miami.
stickyLabel: Keep me posted
stickyHref: "#join-web_event_interest"
---

{% from "partials/page-hero.njk" import pageHero %}

{{ pageHero({
  eyebrow: siteContent.eventsHero.eyebrow,
  heading: siteContent.eventsHero.heading,
  lead: siteContent.eventsHero.lead,
  video: siteContent.eventsHero.video,
  poster: siteContent.eventsHero.poster
}) }}

{% set upcoming = publishedEvents | upcomingEvents %}
{% set past = publishedEvents | pastEvents %}

<section class="section">
  <div class="container stack">
    <div class="section-heading">
      <p class="eyebrow">Upcoming</p>
      <h2>Next on the calendar</h2>
    </div>
    <div class="card-grid">
      {% for event in upcoming %}
      <article class="card event-card">
        <img class="media" src="{{ event.image }}" alt="{{ event.image_alt }}" loading="lazy" decoding="async">
        <div class="stack">
          <p class="eyebrow">{{ event.city }} · {{ event.starts_at | eventDate }}</p>
          <h3><a href="/events/{{ event.slug }}/">{{ event.name }}</a></h3>
          <p>{{ event.summary }}</p>
          <p>{{ event.venue }} · {{ event.price_cents | usd }} · {{ event.capacity }} spots</p>
        </div>
      </article>
      {% else %}
      <p>The next season is being finalised. Join the list and we will send the calendar first.</p>
      {% endfor %}
    </div>
  </div>
</section>

<section class="section band">
  <div class="container stack">
    <div class="section-heading">
      <p class="eyebrow">Past</p>
      <h2>Recent rounds</h2>
    </div>
    <div class="card-grid">
      {% for event in past %}
      <article class="card event-card">
        <img class="media" src="{{ event.image }}" alt="{{ event.image_alt }}" loading="lazy" decoding="async">
        <div class="stack">
          <p class="eyebrow">{{ event.city }} · {{ event.starts_at | eventDate }}</p>
          <h3><a href="/events/{{ event.slug }}/">{{ event.name }}</a></h3>
          <p>{{ event.summary }}</p>
        </div>
      </article>
      {% else %}
      <p>Past events will appear here as the calendar grows.</p>
      {% endfor %}
    </div>
  </div>
</section>

<section class="section band">
  <div class="container">
    {% set formSource = "web_event_interest" %}
    {% set formHeading = "Get the calendar first" %}
    {% set formSubmitLabel = "Keep me posted" %}
    {% set showNotes = true %}
    {% include "partials/capture-form.njk" %}
  </div>
</section>
```

- [ ] **Step 4: Add generated detail page template**

Create `src/events/detail.njk`:

```njk
---
layout: base.njk
pagination:
  data: publishedEvents
  size: 1
  alias: event
permalink: "/events/{{ event.slug }}/"
title: "{{ event.name }} — PWRHaus Golf Society"
description: "{{ event.summary }}"
stickyLabel: Keep me posted
stickyHref: "#join-web_event_interest"
---

{% from "partials/page-hero.njk" import pageHero %}

{{ pageHero({
  eyebrow: event.city,
  heading: event.name,
  lead: event.summary,
  image: event.image,
  position: "50% 45%"
}) }}

<section class="section">
  <div class="container split">
    <div class="stack">
      <p class="eyebrow">{{ event.starts_at | eventDate }}</p>
      <h2>{{ event.venue }}</h2>
      <p>{{ event.body }}</p>
      <p>{{ event.price_cents | usd }} · {{ event.capacity }} spots</p>
      {% if event.registration_url %}
      <p><a class="btn btn-primary" href="{{ event.registration_url }}">Register</a></p>
      {% endif %}
    </div>
    <img class="media" src="{{ event.image }}" alt="{{ event.image_alt }}" loading="lazy" decoding="async">
  </div>
</section>

<section class="section band">
  <div class="container">
    {% set formSource = "web_event_interest" %}
    {% set formHeading = "Ask about this event" %}
    {% set formSubmitLabel = "Keep me posted" %}
    {% set showNotes = true %}
    {% include "partials/capture-form.njk" %}
  </div>
</section>
```

- [ ] **Step 5: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Run build**

Run: `npm run build`

Expected: PASS and output includes `/events/fall-founder-scramble/` and `/events/spring-networking-nine/`.

- [ ] **Step 7: Commit Task 3**

Run:

```powershell
git add -u
git add -- src/events/detail.njk
git commit -m "Render CMS-driven events"
```

---

### Task 4: Sveltia Admin Shell And CMS Config

**Files:**
- Create: `src/admin/index.html`
- Create: `src/admin/config.yml`
- Create: `src/img/cms/.gitkeep`
- Modify: `eleventy.config.js`
- Modify: `test/accessibility.test.js`
- Modify: `test/build-output.test.js`

**Interfaces:**
- Produces `/admin/index.html` in the Eleventy output.
- Produces Sveltia collections named `events` and `site_content`.

- [ ] **Step 1: Exclude admin utility pages from public-page assertions**

In `test/build-output.test.js`, add this helper after `htmlFiles`:

```js
function publicHtmlFiles(dir) {
  return htmlFiles(dir).filter((page) => !page.replace(/\\/g, '/').includes('/admin/'));
}
```

Then replace these public-page loops to use `publicHtmlFiles(outDir)` instead of `htmlFiles(outDir)`:
- `every built page carries the Framework & Co. credit`
- `every built page has exactly one h1`
- `every built page declares a viewport and a lang attribute`
- `every rendered form posts a source the backend whitelists`
- `every built page declares canonical and Open Graph metadata`
- `no shipped image has an empty alt attribute`

In `test/accessibility.test.js`, add the same `publicHtmlFiles` helper after `htmlFiles`, then update these tests to loop over `publicHtmlFiles(outDir)`:
- `no page skips a heading level`
- `the skip link is the first focusable element on every page`
- `every form input has a label bound to it`

- [ ] **Step 2: Add admin build-output tests**

Append to `test/build-output.test.js`:

```js
test('admin route ships the Sveltia CMS boot page and config', () => {
  const html = readFileSync(join(outDir, 'admin', 'index.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex">/, 'admin must not be indexed');
  assert.match(html, /@sveltia\/cms/, 'admin page should load Sveltia CMS');

  const config = readFileSync(join(outDir, 'admin', 'config.yml'), 'utf8');
  assert.match(config, /repo: pena6911-ship-it\/pwrhaus/);
  assert.match(config, /name: events/);
  assert.match(config, /file: src\/_data\/siteContent.json/);
});
```

- [ ] **Step 3: Run tests and verify failure**

Run: `npm test`

Expected: FAIL because `/admin/` files do not exist yet.

- [ ] **Step 4: Add Sveltia boot page**

Create `src/admin/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>PWRHaus CMS</title>
  </head>
  <body>
    <script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>
  </body>
</html>
```

- [ ] **Step 5: Add Sveltia config**

Create `src/admin/config.yml`:

```yaml
# yaml-language-server: $schema=https://unpkg.com/@sveltia/cms/schema/sveltia-cms.json

backend:
  name: github
  repo: pena6911-ship-it/pwrhaus
  branch: main
  auth_methods: [oauth]
  commit_messages:
    create: 'cms: create {{collection}} "{{slug}}"'
    update: 'cms: update {{collection}} "{{slug}}"'
    delete: 'cms: delete {{collection}} "{{slug}}"'
    uploadMedia: 'cms: upload "{{path}}"'
    deleteMedia: 'cms: delete media "{{path}}"'

publish_mode: editorial_workflow

media_folder: src/img/cms
public_folder: /img/cms

collections:
  - name: events
    label: Events
    label_singular: Event
    files:
      - name: event_list
        label: Event List
        file: src/_data/events.json
        fields:
          - label: Events
            name: events
            widget: list
            summary: '{{fields.name}} — {{fields.city}}'
            fields:
              - { label: Slug, name: slug, widget: string, pattern: ['^[a-z0-9]+(?:-[a-z0-9]+)*$', 'Use lowercase letters, numbers, and hyphens only.'] }
              - { label: Name, name: name, widget: string }
              - { label: City, name: city, widget: string }
              - { label: Venue, name: venue, widget: string }
              - { label: Starts At, name: starts_at, widget: datetime }
              - { label: Price Cents, name: price_cents, widget: number, value_type: int, min: 0 }
              - { label: Capacity, name: capacity, widget: number, value_type: int, min: 0 }
              - { label: Summary, name: summary, widget: text }
              - { label: Body, name: body, widget: text }
              - { label: Image, name: image, widget: image }
              - { label: Image Alt Text, name: image_alt, widget: string }
              - { label: Published, name: published, widget: boolean, default: false }
              - { label: Registration URL, name: registration_url, widget: string, required: false }

  - name: site_content
    label: Site Content
    files:
      - name: events_page
        label: Events Page
        file: src/_data/siteContent.json
        fields:
          - label: Events Hero
            name: eventsHero
            widget: object
            fields:
              - { label: Eyebrow, name: eyebrow, widget: string }
              - { label: Heading, name: heading, widget: string }
              - { label: Lead, name: lead, widget: text }
              - { label: Hero Video, name: video, widget: string, required: false }
              - { label: Hero Poster, name: poster, widget: image, required: false }
```

- [ ] **Step 6: Passthrough-copy the CMS config**

In `eleventy.config.js`, add this near the other passthrough copy calls:

```js
  eleventyConfig.addPassthroughCopy('src/admin/config.yml');
```

- [ ] **Step 7: Keep CMS media folder in Git**

Create `src/img/cms/.gitkeep` as an empty file.

- [ ] **Step 8: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 9: Run build**

Run: `npm run build`

Expected: PASS and `public/admin/index.html` plus `public/admin/config.yml` exist.

- [ ] **Step 10: Commit Task 4**

Run:

```powershell
git add -u
git add -- src/admin/index.html src/admin/config.yml src/img/cms/.gitkeep
git commit -m "Add Sveltia CMS admin"
```

---

### Task 5: Roadmap And Spec Status Update

**Files:**
- Modify: `docs/superpowers/specs/2026-08-14-phase-2-roadmap.md`
- Modify: `docs/superpowers/specs/2026-08-15-sveltia-cms-for-michelle-design.md`

**Interfaces:**
- Produces: roadmap status that reflects Phase 2A implementation state.

- [ ] **Step 1: Update roadmap workstream D**

In `docs/superpowers/specs/2026-08-14-phase-2-roadmap.md`, change the D row status from decided/not built to in progress or built depending on actual completion:

```markdown
| D. Site CMS for Michelle | Phase 2 | 🟢 **built initial CMS**: events + events-page content editable via Sveltia | `2026-08-15-sveltia-cms-for-michelle-design.md` |
```

Keep workstream C as GHL-native member portal, not built.

- [ ] **Step 2: Add implementation note to the CMS spec**

Append this section to `docs/superpowers/specs/2026-08-15-sveltia-cms-for-michelle-design.md`:

```markdown
## 7. Implementation Status

Initial CMS implementation shipped with:
- `/admin/` Sveltia boot page
- GitHub backend configuration for `pena6911-ship-it/pwrhaus`
- Editorial workflow
- `src/_data/events.json`
- `src/_data/siteContent.json`
- CMS media folder at `src/img/cms/`
- Data-driven `/events/` page and generated published event detail pages
```

- [ ] **Step 3: Run final verification**

Run:

```powershell
npm run build
npm test
```

Expected: both PASS.

- [ ] **Step 4: Commit Task 5**

Run:

```powershell
git add -u
git commit -m "Document initial CMS implementation"
```

---

## Self-Review

Spec coverage:
- Sveltia admin shell: Task 4.
- GitHub backend and review-first editorial workflow: Task 4.
- Events data model and rendering: Tasks 1, 2, 3.
- Page content singleton: Tasks 1 and 4.
- Repo media folder: Task 4.
- Tests/build acceptance: Tasks 1 through 5.
- Out-of-scope workstreams stay out of this plan.

No placeholders remain. The plan intentionally does not configure a live GitHub OAuth app, connect Netlify, or push to GitHub because those are outside this repo-local implementation and conflict with current project sequencing.
