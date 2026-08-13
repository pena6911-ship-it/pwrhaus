# PWRHaus Marketing Site — Content Pages (Plan B2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every public content page on the foundation Plan B1 delivered, with real copy in Michelle's voice, so the site is complete and reviewable apart from the events calendar.

**Architecture:** Each page is a Nunjucks template in `src/` using `layout: base.njk` from B1. Pages consume the existing `capture-form.njk` partial with a different `source` per page, and a new `media-slot.njk` partial that renders a token-coloured block wherever a photograph will later go. No new backend work: `/api/contacts` already accepts every `source` these pages emit.

**Tech Stack:** Eleventy 3 (ESM, Nunjucks) · plain CSS with custom properties · vanilla JS · `node --test`

**Spec:** `docs/superpowers/specs/2026-08-12-pwrhaus-marketing-site-design.md`
**Builds on:** `docs/superpowers/plans/2026-08-12-marketing-site-foundation.md` (Plan B1, merged at `4f84683`)

## Scope

**This plan (B2) delivers:** `/` (real content), `/about`, `/membership`, `/lessons`, `/sponsors`, `/corporate`, an interim `/events`, `/404.html`, a reusable media slot, and the page metadata `base.njk` currently lacks (canonical, Open Graph, favicon).

**Deliberately NOT in this plan (Plan B3):** the events subsystem — `src/_data/events.json`, Eleventy pagination for `/events/<slug>`, the client-side upcoming/past sort, and the real `/events` page. B3 is blocked on Michelle supplying post-August events, which is why it is separated.

## Decisions carried into this plan

| # | Decision | Why |
|---|---|---|
| D1 | Events subsystem split out as B3 | It is the only part blocked on client data; splitting lets every other page ship now |
| D2 | Image slots render a token-coloured CSS block when no photo is supplied | No photography exists yet. No stock imagery — putting strangers on a client site is a liability someone forgets to remove |
| D3 | The home page's event teaser is deferred to B3 | Spec §4 lists a 2-up teaser in `/`'s section shapes, but it needs `events.json` |
| D4 | `/events` ships as an interim stub capturing `web_event_interest` | Events is in the nav. Without this it is the single broken link in a menu the client will be clicking. B3 replaces the file wholesale |
| D5 | No `og:image` | We have no image. A tag pointing at nothing is worse than its absence; add it in B3 when photography lands |
| D6 | Copy drafted in Michelle's voice from her scope-session answers | Spec D4. Her sign-off still gates go-live |

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Node >= 24. ESM only.** No `require()`.
- **Shell is Windows PowerShell 5.1.** It does NOT support `&&`. Chain with `;` or separate lines.
- **NEVER run `git push`.** Commit locally and stop.
- **Stage with explicit paths. NEVER `git add -A`.**
- **No new dependencies.**
- **Design tokens in `src/css/tokens.css` are FINAL and that file must not be modified.** All colours come from tokens; no hex literals outside `tokens.css`.
- **No `box-shadow` anywhere in the stylesheet.** Borders do that work.
- **CSS is mobile-first: `min-width` media queries only.** Breakpoints are written as literals (`768px`, `1024px`) — CSS custom properties cannot be used in media query conditions.
- **`var(--brass)` is never a text colour** (2.9:1 on paper). Text uses `var(--brass-text)` (5.9:1). `--brass` is for rules, borders and decoration.
- **Minimum touch target 44x44 CSS px. Minimum form input font-size 16px.**
- **Exactly one `<h1>` per page.** `test/build-output.test.js` enforces this and will fail the build otherwise.
- **Every `source` value must be in `ALLOWED_SOURCES`** (`functions/lib/sanitize.js`): `web_free_profile`, `web_event_interest`, `web_lessons`, `web_sponsor`, `web_corporate`. A test enforces this.
- **Do not modify anything under `functions/` or `test/`** except where a task explicitly says so (Task 8 only).
- **Do not modify `src/_includes/partials/footer.njk`.** It carries the Framework & Co. credit, which is required on every page and test-enforced.
- Copy is drafted for Michelle to edit. Reproduce it **verbatim** — do not rewrite, shorten, or "improve" it.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `src/_includes/partials/media-slot.njk` | Renders a photo, or a token-coloured placeholder when none is supplied |
| `src/img/favicon.svg` | Browser tab icon |
| `src/about.njk` | Founding story and repositioning |
| `src/membership.njk` | The three tiers, with pricing on-site |
| `src/lessons.njk` | The growing revenue line |
| `src/sponsors.njk` | Tier names, generic deliverables, inquiry capture |
| `src/corporate.njk` | Golf-simulator experience |
| `src/events.njk` | Interim stub — replaced entirely by B3 |
| `src/404.njk` | Not found, served at `/404.html` |

**Modified:**

| Path | Change |
|---|---|
| `src/_includes/base.njk` | canonical, Open Graph, Twitter card, favicon link |
| `src/css/main.css` | media slot, lead paragraph, split, lists, cards, pricing, band |
| `src/index.njk` | replace the B1 placeholder with real content |
| `test/build-output.test.js` | assert metadata on every page, and that every nav link resolves to a built page (Task 8 only) |

---

## Task 1: Page infrastructure

**Files:**
- Create: `src/_includes/partials/media-slot.njk`, `src/img/favicon.svg`
- Modify: `src/_includes/base.njk`, `src/css/main.css`

**Interfaces:**
- Consumes: `base.njk`, `tokens.css`, `site.json` (`name`, `shortName`, `description`, `url`) — all from B1.
- Produces:
  - Partial usage: `{% set mediaAlt = "..." %}{% set mediaRatio = "4 / 3" %}{% include "partials/media-slot.njk" %}`. `mediaSrc` is optional; when unset a placeholder renders. `mediaRatio` defaults to `16 / 9`.
  - CSS classes every later task uses: `.lead`, `.split`, `.list-h`, `.list-stack`, `.cards-3`, `.card`, `.price`, `.band`, `.faq`, `.media`.
  - Every page automatically gains canonical + Open Graph tags.

- [ ] **Step 1: Create `src/_includes/partials/media-slot.njk`**

```njk
{#
  Photo slot. No photography exists yet, so when mediaSrc is unset this renders
  a token-coloured block instead — the layout is correct now and dropping real
  files in later needs no template change.

  Params:
    mediaSrc   optional. Path under /img/.
    mediaAlt   required when mediaSrc is set. Omit for the placeholder.
    mediaRatio optional, default "16 / 9".
#}
{% if mediaSrc %}
<img class="media" src="{{ mediaSrc }}" alt="{{ mediaAlt }}"
     loading="lazy" decoding="async"
     style="aspect-ratio: {{ mediaRatio | default('16 / 9') }};">
{% else %}
{# aria-hidden: there is no image to describe, and announcing an empty box
   as an image would be worse than silence. Surrounding copy carries meaning. #}
<div class="media media-placeholder" aria-hidden="true"
     style="aspect-ratio: {{ mediaRatio | default('16 / 9') }};"></div>
{% endif %}
```

- [ ] **Step 2: Create `src/img/favicon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="PWRHaus">
  <rect width="32" height="32" rx="6" fill="#1A4D36"/>
  <circle cx="16" cy="12" r="6" fill="#FAF8F3"/>
  <rect x="14.5" y="16" width="3" height="11" rx="1.5" fill="#B8912A"/>
</svg>
```

Hex values are `--forest`, `--paper` and `--brass` respectively. An SVG file cannot read CSS custom properties, so these are necessarily literal; keep them in sync with `tokens.css` if the palette ever changes.

- [ ] **Step 3: Add metadata to `src/_includes/base.njk`**

Immediately after the existing `<meta name="description" ...>` line, insert:

```njk
<link rel="canonical" href="{{ site.url }}{{ page.url }}">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{{ site.name }}">
<meta property="og:title" content="{{ title }}">
<meta property="og:description" content="{{ description or site.description }}">
<meta property="og:url" content="{{ site.url }}{{ page.url }}">
<meta name="twitter:card" content="summary">
```

Deliberately no `og:image` — there is no photography yet, and a tag pointing at a missing file is worse than none. It lands in B3.

Change nothing else in the file.

- [ ] **Step 4: Append page furniture to `src/css/main.css`**

```css
/* Media slots */
.media { width: 100%; border-radius: var(--radius-card); object-fit: cover; }
.media-placeholder {
  background: linear-gradient(135deg, var(--line) 0%, var(--paper-raised) 55%, var(--line) 100%);
  border: 1px solid var(--line);
}

/* Page furniture */
.lead {
  font-size: 1.125rem;
  line-height: 1.6;
  color: var(--ink-muted);
  margin-top: var(--space-4);
}
.stack > * + * { margin-top: var(--space-4); }
.section-head { margin-bottom: var(--space-6); }

.split { display: grid; gap: var(--space-6); }
.list-h, .list-stack, .cards-3 { list-style: none; padding: 0; display: grid; }
.list-h { gap: var(--space-6); }
.list-stack { gap: var(--space-5); }
.cards-3 { gap: var(--space-5); }

.card {
  background: var(--paper-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: var(--space-5);
}
.card-featured { border-color: var(--brass); }

.price {
  font-family: var(--font-display);
  font-size: 2rem;
  line-height: 1.15;
  margin-block: var(--space-3);
}
.price-note { font-size: 0.875rem; color: var(--ink-muted); }

.band { background: var(--paper-raised); border-block: 1px solid var(--line); }

.faq { display: grid; gap: var(--space-5); }
.faq h3 { margin-bottom: var(--space-2); }

.rule { border: 0; border-top: 1px solid var(--brass); width: 64px; margin-bottom: var(--space-4); }

/* Utilities — no inline style attributes anywhere in the templates. */
.prose { max-width: var(--prose-max); }
.center { text-align: center; }
.actions { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-6); }
.card-actions { margin-top: var(--space-4); }
.card h2 { font-size: 1.375rem; }

@media (min-width: 768px) {
  .split { grid-template-columns: 1fr 1fr; align-items: center; }
  .list-h { grid-template-columns: repeat(3, 1fr); }
  .cards-3 { grid-template-columns: repeat(3, 1fr); }
}
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: succeeds.

Run: `Select-String -Path public/index.html -Pattern 'rel="canonical"'`
Expected: one match.

Run: `Select-String -Path public/index.html -Pattern 'og:title'`
Expected: one match.

- [ ] **Step 6: Confirm the suite is unaffected**

Run: `npm test`
Expected: 53 passing, 0 failing.

- [ ] **Step 7: Commit**

```
git add src/_includes/partials/media-slot.njk src/img/favicon.svg src/_includes/base.njk src/css/main.css
git commit -m "feat(site): media slot, page metadata, and shared content styles"
```

---

## Task 2: Home page

**Files:**
- Modify: `src/index.njk`

**Interfaces:**
- Consumes: `base.njk`, `capture-form.njk`, `media-slot.njk`, the Task 1 CSS classes.
- Produces: the site's primary conversion page. The capture form keeps `formSource = "web_free_profile"`, so the nav CTAs' `/#join-web_free_profile` anchor continues to resolve. **Do not change that source value** — both header CTAs depend on it.

**Note:** the spec's section shapes for `/` include a 2-up event teaser. It is deferred to B3 (D3) because it needs `events.json`. Build the other four sections.

- [ ] **Step 1: Replace the entire contents of `src/index.njk`**

```njk
---
layout: base.njk
title: PWRHaus Golf Society — business networking through golf
description: A co-ed society of founders and business owners who use golf to find, build, and exit companies. Fort Lauderdale and Miami.
---

<section class="section">
  <div class="container">
    <p class="eyebrow">Co-ed &middot; Fort Lauderdale &amp; Miami</p>
    <h1>Never golfed?<br>Perfect.</h1>
    <p class="lead">Most of our members hadn't either. They came for the business.
       They stayed for the game.</p>
    <p class="actions">
      <a class="btn btn-primary" href="#join-web_free_profile">Create free profile</a>
      <a class="btn btn-secondary" href="/membership/">How membership works</a>
    </p>
  </div>
</section>

<section class="section band">
  <div class="container split">
    <div class="stack">
      <hr class="rule">
      <h2>A golf society for people building something</h2>
      <p>PWRHaus is founders and business owners who use golf to find, build, and exit
         companies. Eighteen holes is four hours of someone's undivided attention &mdash;
         which turns out to be where the real conversations happen.</p>
      <p>It started as a women's society, because that was the door that needed opening.
         It's co-ed now. Men are welcome here, and plenty are already members.</p>
    </div>
    {% set mediaRatio = "4 / 3" %}
    {% include "partials/media-slot.njk" %}
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head">
      <hr class="rule">
      <h2>What you're actually joining</h2>
    </div>
    <ul class="list-h">
      <li>
        <h3>Rooms worth being in</h3>
        <p>Every event is founders, owners, and people with signing authority.
           No lead-gen, no vendors working the room.</p>
      </li>
      <li>
        <h3>Golf, actually taught</h3>
        <p>Lessons built for people who have never picked up a club.
           That's how most of our members started.</p>
      </li>
      <li>
        <h3>Two cities, one network</h3>
        <p>Fort Lauderdale and Miami, with the same people showing up in both.
           One organisation, not chapters.</p>
      </li>
    </ul>
  </div>
</section>

<section class="section band">
  <div class="container">
    {% set formSource = "web_free_profile" %}
    {% set formHeading = "Start free. Decide later." %}
    {% set formSubmitLabel = "Create free profile" %}
    {% include "partials/capture-form.njk" %}
  </div>
</section>
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: succeeds.

Run: `Select-String -Path public/index.html -Pattern 'id="join-web_free_profile"'`
Expected: one match — the nav CTA anchor still resolves.

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: 53 passing, 0 failing. The single-`h1` and source-whitelist tests both cover this page.

- [ ] **Step 4: Commit**

```
git add src/index.njk
git commit -m "feat(site): home page content"
```

---

## Task 3: About page

**Files:**
- Create: `src/about.njk`

**Interfaces:**
- Consumes: `base.njk`, `media-slot.njk`, Task 1 CSS.
- Produces: `/about/`, which `nav.json` already links to.

- [ ] **Step 1: Create `src/about.njk`**

```njk
---
layout: base.njk
title: About PWRHaus Golf Society
description: How a women's golf society became a co-ed network of founders doing business on the course.
---

<section class="section">
  <div class="container prose">
    <p class="eyebrow">About</p>
    <h1>We started because the deals were happening somewhere we weren't.</h1>
    <p class="lead">PWRHaus began as a women's golf society and became something broader:
       a co-ed network of founders and owners who do business on a golf course.</p>
  </div>
</section>

<section class="section band">
  <div class="container split">
    <div class="stack">
      <hr class="rule">
      <h2>The founding story</h2>
      <p>Golf has always been where a certain kind of business gets done, and for a long
         time the invitation went to a fairly narrow list. PWRHaus started women-only to
         fix that &mdash; somewhere to learn the game without being the only woman on the tee.</p>
      <p>That worked. And then it showed us the limit: the people buying and selling
         companies are not all women, and a network that leaves out half the room isn't
         much of a network.</p>
      <p>So PWRHaus is co-ed. The founding story is still the founding story. But this is
         now for anyone serious about building a business, and men are explicitly invited.</p>
    </div>
    {% set mediaRatio = "4 / 3" %}
    {% include "partials/media-slot.njk" %}
  </div>
</section>

<section class="section">
  <div class="container">
    {% set mediaRatio = "21 / 9" %}
    {% include "partials/media-slot.njk" %}
  </div>
</section>

<section class="section">
  <div class="container prose">
    <div class="section-head">
      <hr class="rule">
      <h2>What membership actually gets you</h2>
    </div>
    <ul class="list-stack">
      <li>
        <h3>A room of operators</h3>
        <p>Founders, owners, and people who can make a decision without checking upstairs.</p>
      </li>
      <li>
        <h3>Events built for conversation</h3>
        <p>Scrambles and socials designed so you actually meet people, not so you
           collect business cards.</p>
      </li>
      <li>
        <h3>Lessons, if you need them</h3>
        <p>Most members did. Nobody here cares what you shoot.</p>
      </li>
      <li>
        <h3>The Inner Circle, if it fits</h3>
        <p>Invitation-only work on business valuation, coaching, and a documented
           exit strategy.</p>
      </li>
    </ul>
    <p class="actions">
      <a class="btn btn-primary" href="/membership/">See membership</a>
    </p>
  </div>
</section>
```

- [ ] **Step 2: Build, verify, commit**

Run: `npm run build`
Expected: succeeds, `public/about/index.html` exists.

Run: `npm test`
Expected: 53 passing, 0 failing.

```
git add src/about.njk
git commit -m "feat(site): about page"
```

---

## Task 4: Membership page

**Files:**
- Create: `src/membership.njk`

**Interfaces:**
- Consumes: `base.njk`, `capture-form.njk`, Task 1 CSS.
- Produces: `/membership/`. Pricing appears on-site, per spec §4.

**Important:** there is no checkout in this plan or in B1 — paid joining is Plan D. Every tier's call to action therefore resolves to free-profile capture. Do not invent a payment link.

- [ ] **Step 1: Create `src/membership.njk`**

```njk
---
layout: base.njk
title: Membership — PWRHaus Golf Society
description: Three ways into PWRHaus. Free to start, $650 a year for full membership, and an invitation-only Inner Circle.
---

<section class="section">
  <div class="container prose">
    <p class="eyebrow">Membership</p>
    <h1>Three ways in.</h1>
    <p class="lead">Start free and look around. Join when it's obviously worth it.</p>
  </div>
</section>

<section class="section band">
  <div class="container">
    <ul class="cards-3">
      <li class="card">
        <h2>Free</h2>
        <p class="price">$0</p>
        <p>Create a profile, browse events, and book lessons or scrambles at guest rates.
           No vetting, no commitment, no card.</p>
        <p class="card-actions">
          <a class="btn btn-secondary" href="#join-web_free_profile">Start here</a>
        </p>
      </li>
      <li class="card card-featured">
        <h2>Member</h2>
        <p class="price">$650<span class="price-note"> / year</span></p>
        <p>Everything in Free, plus member rates on every event, the member portal, and
           the member directory. This is where most people land.</p>
        <p class="card-actions">
          <a class="btn btn-primary" href="#join-web_free_profile">Create a profile</a>
        </p>
      </li>
      <li class="card">
        <h2>Inner Circle</h2>
        <p class="price">From $5,000</p>
        <p>A certified business valuation, coaching, and a documented exit strategy,
           led by Michelle. By invitation, and deliberately small.</p>
        <p class="price-note card-actions">
          Invitation only &mdash; start with a profile and we'll talk.</p>
      </li>
    </ul>
  </div>
</section>

<section class="section">
  <div class="container prose">
    <div class="section-head">
      <hr class="rule">
      <h2>Questions people actually ask</h2>
    </div>
    <div class="faq">
      <div>
        <h3>Do I need to know how to golf?</h3>
        <p>No. Most of our members had never played when they joined. We run lessons
           precisely because that's the normal starting point here.</p>
      </div>
      <div>
        <h3>Is this only for women?</h3>
        <p>No. PWRHaus started as a women's society and is now co-ed. Men are members,
           and men are welcome.</p>
      </div>
      <div>
        <h3>Where do events happen?</h3>
        <p>Fort Lauderdale and Miami today. We go where the people we're building this
           for actually are, rather than planting flags in cities we don't serve.</p>
      </div>
      <div>
        <h3>What happens after I create a free profile?</h3>
        <p>Nothing you don't choose. You can browse events and book lessons at guest
           rates. We'll tell you what's coming up; you decide whether to join.</p>
      </div>
      <div>
        <h3>Can I cancel?</h3>
        <p>Membership runs for a year. Individual event tickets are refundable up to
           48 hours before the event; after that we can't refund or credit them,
           because the course is already booked.</p>
      </div>
    </div>
  </div>
</section>

<section class="section band">
  <div class="container">
    {% set formSource = "web_free_profile" %}
    {% set formHeading = "Start with a free profile" %}
    {% set formSubmitLabel = "Create free profile" %}
    {% include "partials/capture-form.njk" %}
  </div>
</section>
```

- [ ] **Step 2: Build, verify, commit**

Run: `npm run build`; then `npm test`
Expected: build succeeds; 53 passing, 0 failing.

```
git add src/membership.njk
git commit -m "feat(site): membership page with on-site pricing"
```

---

## Task 5: Lessons page

**Files:**
- Create: `src/lessons.njk`

**Interfaces:**
- Consumes: `base.njk`, `capture-form.njk`, `media-slot.njk`, Task 1 CSS.
- Produces: `/lessons/`. Form source `web_lessons`.

- [ ] **Step 1: Create `src/lessons.njk`**

```njk
---
layout: base.njk
title: Lessons — PWRHaus Golf Society
description: Golf lessons built for people who have never picked up a club. Most PWRHaus members started exactly there.
---

<section class="section">
  <div class="container split">
    <div class="stack">
      <p class="eyebrow">Lessons</p>
      <h1>You don't need to know how to play.</h1>
      <p class="lead">Most PWRHaus members had never held a club before joining.
         Now they play. That is the entire point of this.</p>
    </div>
    {% set mediaRatio = "4 / 3" %}
    {% include "partials/media-slot.njk" %}
  </div>
</section>

<section class="section band">
  <div class="container">
    <div class="section-head">
      <hr class="rule">
      <h2>How it goes</h2>
    </div>
    <ul class="list-h">
      <li>
        <h3>1 &middot; Tell us your level</h3>
        <p>There is no wrong answer, including &ldquo;none&rdquo;. That's the most
           common one we get.</p>
      </li>
      <li>
        <h3>2 &middot; Learn properly</h3>
        <p>Small groups and real instruction, without an audience or a performance.</p>
      </li>
      <li>
        <h3>3 &middot; Play your first scramble</h3>
        <p>The format is forgiving by design. Nobody is watching your swing &mdash;
           they're talking to you.</p>
      </li>
    </ul>
  </div>
</section>

<section class="section">
  <div class="container">
    {% set formSource = "web_lessons" %}
    {% set formHeading = "Ask about lessons" %}
    {% set formSubmitLabel = "Ask about lessons" %}
    {% set showNotes = true %}
    {% include "partials/capture-form.njk" %}
  </div>
</section>
```

- [ ] **Step 2: Build, verify, commit**

Run: `npm run build`; then `npm test`
Expected: build succeeds; 53 passing, 0 failing.

```
git add src/lessons.njk
git commit -m "feat(site): lessons page"
```

---

## Task 6: Sponsors page

**Files:**
- Create: `src/sponsors.njk`

**Interfaces:**
- Consumes: `base.njk`, `capture-form.njk`, Task 1 CSS.
- Produces: `/sponsors/`. Form source `web_sponsor`, with the notes field enabled.

**Why the tiers are vague:** scope-session §4c is unanswered — nobody has documented what a sponsor receives at each tier. The page therefore names the tiers and captures a qualified inquiry rather than describing a package we cannot honour. Do not invent deliverables.

- [ ] **Step 1: Create `src/sponsors.njk`**

```njk
---
layout: base.njk
title: Sponsorship — PWRHaus Golf Society
description: Put your brand in front of founders, owners and operators at PWRHaus events in Fort Lauderdale and Miami.
---

<section class="section">
  <div class="container prose">
    <p class="eyebrow">Sponsorship</p>
    <h1>Put your brand in the room.</h1>
    <p class="lead">PWRHaus events are founders, owners and operators &mdash; the audience
       most sponsorship budgets are aiming at and usually miss.</p>
  </div>
</section>

<section class="section band">
  <div class="container">
    <ul class="cards-3">
      <li class="card">
        <h2>Social-Tee</h2>
        <p>Presence at a single event. A straightforward way to meet the room before
           committing to anything larger.</p>
      </li>
      <li class="card">
        <h2>Hole in One</h2>
        <p>Recurring presence across a season, so the same people see you more than once.</p>
      </li>
      <li class="card">
        <h2>Double Eagle</h2>
        <p>A named partnership with year-round visibility across the calendar.</p>
      </li>
    </ul>
  </div>
</section>

<section class="section">
  <div class="container prose">
    <div class="section-head">
      <hr class="rule">
      <h2>How it works</h2>
    </div>
    <p>Sponsorship here is a conversation, not a checkout. Every partnership is built
       around what you're actually trying to achieve &mdash; the room you want to reach,
       the season you want to be present for, and what you want people saying afterwards.</p>
    <p>Tell us what you have in mind and we'll come back with what that looks like
       across our calendar, including what's included and what it costs.</p>
  </div>
</section>

<section class="section band">
  <div class="container">
    {% set formSource = "web_sponsor" %}
    {% set formHeading = "Talk to us about sponsoring" %}
    {% set formSubmitLabel = "Send enquiry" %}
    {% set showNotes = true %}
    {% include "partials/capture-form.njk" %}
  </div>
</section>
```

- [ ] **Step 2: Build, verify, commit**

Run: `npm run build`; then `npm test`
Expected: build succeeds; 53 passing, 0 failing.

```
git add src/sponsors.njk
git commit -m "feat(site): sponsorship page with inquiry capture"
```

---

## Task 7: Corporate page

**Files:**
- Create: `src/corporate.njk`

**Interfaces:**
- Consumes: `base.njk`, `capture-form.njk`, `media-slot.njk`, Task 1 CSS.
- Produces: `/corporate/`. Form source `web_corporate`, notes enabled.

- [ ] **Step 1: Create `src/corporate.njk`**

```njk
---
layout: base.njk
title: Corporate golf experiences — PWRHaus Golf Society
description: Golf simulator experiences for sales conferences, offsites and client days, run by PWRHaus.
---

<section class="section">
  <div class="container split">
    <div class="stack">
      <p class="eyebrow">Corporate</p>
      <h1>Bring the simulator to your conference.</h1>
      <p class="lead">We run golf experiences at corporate events &mdash; sales conferences,
         offsites, client days. It works because it gives people something to do together
         that isn't a name badge and a canap&eacute;.</p>
    </div>
    {% set mediaRatio = "4 / 3" %}
    {% include "partials/media-slot.njk" %}
  </div>
</section>

<section class="section band">
  <div class="container prose">
    <div class="section-head">
      <hr class="rule">
      <h2>What it looks like</h2>
    </div>
    <p>A full simulator setup, run by our team, with instruction for the people in the
       room who have never played. It turns a hallway into the part of the event people
       actually remember &mdash; and it keeps them talking to each other rather than
       checking their phones.</p>
    <p>We build each one around the room: how many people, how much space, and what you
       want them saying about it afterwards.</p>
  </div>
</section>

<section class="section">
  <div class="container">
    {% set formSource = "web_corporate" %}
    {% set formHeading = "Tell us about your event" %}
    {% set formSubmitLabel = "Send enquiry" %}
    {% set showNotes = true %}
    {% include "partials/capture-form.njk" %}
  </div>
</section>
```

- [ ] **Step 2: Build, verify, commit**

Run: `npm run build`; then `npm test`
Expected: build succeeds; 53 passing, 0 failing.

```
git add src/corporate.njk
git commit -m "feat(site): corporate golf experience page"
```

---

## Task 8: Events stub, 404, and metadata tests

**Files:**
- Create: `src/events.njk`, `src/404.njk`
- Modify: `test/build-output.test.js`

**Interfaces:**
- Consumes: everything above.
- Produces: a complete built site with no broken navigation link, plus two regression tests.

**`src/events.njk` is temporary.** Plan B3 replaces it entirely with the real calendar. It exists so that Events — which is in the nav — is not the single broken link on the site.

- [ ] **Step 1: Create `src/events.njk`**

```njk
---
layout: base.njk
title: Events — PWRHaus Golf Society
description: Scrambles and socials for founders and business owners in Fort Lauderdale and Miami.
---

<section class="section">
  <div class="container prose">
    <p class="eyebrow">Events</p>
    <h1>The next season is being finalised.</h1>
    <p class="lead">Our scrambles and socials are planned well ahead. Tell us where you'd
       like to play and we'll make sure you hear about the calendar first.</p>
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

- [ ] **Step 2: Create `src/404.njk`**

The `permalink` matters: Netlify serves `404.html` from the site root. Eleventy's default would produce `/404/index.html`, which Netlify would not use.

```njk
---
layout: base.njk
title: Page not found — PWRHaus Golf Society
description: That page isn't here.
permalink: /404.html
---

<section class="section">
  <div class="container prose center">
    <p class="eyebrow">404</p>
    <h1>That page isn't here.</h1>
    <p class="lead">The link may be old, or we may have moved it.</p>
    <p class="actions">
      <a class="btn btn-primary" href="/">Back to home</a>
      <a class="btn btn-secondary" href="/membership/">See membership</a>
    </p>
  </div>
</section>
```

- [ ] **Step 3: Write the failing tests**

Add to the end of `test/build-output.test.js`:

```js
test('every built page declares canonical and Open Graph metadata', () => {
  const pages = htmlFiles(outDir);
  assert.ok(pages.length > 0, 'build produced no HTML');
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    assert.match(html, /<link rel="canonical" href="http/, `missing canonical: ${page}`);
    assert.match(html, /<meta property="og:title"/, `missing og:title: ${page}`);
    assert.match(html, /<meta property="og:description"/, `missing og:description: ${page}`);
  }
});

test('every navigation link resolves to a page that was actually built', () => {
  const nav = JSON.parse(readFileSync('src/_data/nav.json', 'utf8'));
  assert.ok(nav.length > 0, 'nav.json is empty');
  const built = htmlFiles(outDir).map((p) => p.replace(/\\/g, '/'));

  for (const item of nav) {
    const slug = item.url.replace(/^\/|\/$/g, '');
    assert.ok(
      built.some((p) => p.endsWith(`/${slug}/index.html`)),
      `nav links to ${item.url} but no page was built for it`,
    );
  }
});
```

The second test is the one that matters. B1's final review flagged that nothing verified the nav against reality; a menu entry pointing at a page nobody built is invisible until someone clicks it.

- [ ] **Step 4: Run the tests to verify they fail**

Temporarily rename `src/events.njk` to `src/events.njk.bak`, then run:

Run: `npm test`
Expected: FAIL — "nav links to /events/ but no page was built for it".

Rename it back before continuing. Confirm with `Test-Path src/events.njk` returning `True`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run build`; then `npm test`
Expected: 55 passing, 0 failing.

- [ ] **Step 6: Verify the built output**

Run: `Test-Path public/404.html`
Expected: `True` — not `public/404/index.html`.

Run: `Get-ChildItem public -Recurse -Filter *.html | Measure-Object`
Expected: 9 — home, about, membership, lessons, sponsors, corporate, events, thanks, 404.

- [ ] **Step 7: Commit**

```
git add src/events.njk src/404.njk test/build-output.test.js
git commit -m "feat(site): interim events page, 404, and navigation integrity tests"
```

---

## Manual verification before handoff

Not automatable — run these once Task 8 is green.

- [ ] `npm run dev`, then check every page at **320, 375, 390, 768, 820, 1024, 1280, 1440**. No horizontal scroll on the body at any width. This check is now meaningful: B1 removed the `overflow-x: hidden` that would have made it pass vacuously.
- [ ] At 375px, open the nav overlay on each page: `Tab` cycles inside it, `Esc` closes it, focus returns to the toggle.
- [ ] Keyboard-only pass on `/membership/`: the skip link appears on first `Tab`, and every interactive element shows the brass focus ring.
- [ ] On a real iPhone or Safari responsive mode, tap an input on `/sponsors/`. **The page must not zoom.**
- [ ] Submit the form on `/lessons/` with a real address. Confirm in Supabase: one `contacts` row, one `contact_inquiries` row with `source = 'web_lessons'`, and the note text present.
- [ ] Submit on `/corporate/` with the **same** email. Confirm no second `contacts` row and a **second** `contact_inquiries` row with `source = 'web_corporate'` — this is the repeat-enquiry path that B1 built the ledger for.
- [ ] Check every page renders its placeholder media blocks without layout shift as fonts load.

---

## Plan self-review

**Spec coverage.** §3 IA — `/`, `/about`, `/membership`, `/lessons`, `/sponsors`, `/corporate`, `/404` all built (Tasks 2–8); `/events` and `/events/<slug>` are B3, with an interim stub here. §4 section shapes — each page follows its named shape, except `/`'s event teaser (deferred, D3). §4 tokens and components — Task 1 adds only classes composed from existing tokens; `tokens.css` is untouched. §4 image rules — deferred with the photography itself; the media slot is the seam they land in. §6 sources — all five whitelisted values are now emitted, and the existing test enforces membership. §5 events data — B3. Pricing on-site (§4.1) — Task 4.

**Placeholder scan.** No TBD or TODO. Every page carries complete, final copy. The sponsor tier descriptions are deliberately general — that is a documented consequence of §4c being unanswered, recorded in Task 6, not an unfilled blank.

**Type consistency.** `media-slot.njk` reads `mediaSrc`, `mediaAlt`, `mediaRatio`; every caller sets `mediaRatio` and omits `mediaSrc`, which is the supported placeholder path. `capture-form.njk` is called with `formSource`, `formHeading`, `formSubmitLabel`, and optionally `showNotes` — matching the partial's parameters after B1's fix rounds. All six `formSource` values used across Tasks 2–8 are members of `ALLOWED_SOURCES`.

**Known gaps, stated deliberately.** No `og:image` until photography exists. No rate limiting on the capture endpoint (unchanged from B1). Sponsor deliverables remain generic pending §4c. The Nunjucks `{% set %}` variables persist within a template, so any future page including the form twice must set every parameter explicitly — worth remembering in B3, where `/events/<slug>` pages each carry a form.
