# PWRHaus Marketing Site — Mobile Conversion (Plan B4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the site the two mobile-conversion features the spec requires and no plan has owned, and make the accessibility and responsive rules enforceable instead of aspirational.

**Architecture:** A phones-only sticky CTA bar, revealed by an IntersectionObserver once the hero scrolls out of view, with a per-page label and target. A full-bleed hero on the home page that reaches 60vh at desktop with the media slot reserved for photography. A new static test file asserting the accessibility rules that can be checked without a browser, plus a manual checklist for the ones that cannot.

**Tech Stack:** Eleventy 3 (ESM, Nunjucks) · plain CSS with custom properties · vanilla JS · `node --test`

**Spec:** `docs/superpowers/specs/2026-08-12-pwrhaus-marketing-site-design.md`
**Builds on:** B1 foundation (`4f84683`) and B2 content pages (`7afdedd`), both merged.

---

## Spec requirements this plan implements

Per the rule added to spec §12 after B2's review, every plan states its coverage explicitly.

| Spec requirement | Where |
|---|---|
| §4 sticky bottom CTA bar, phones only, 64px + `env(safe-area-inset-bottom)` | Task 1 |
| §4 full-bleed hero, `min-height: 60vh` desktop, `auto` below 768px | Task 2 |
| §9 responsive + accessibility verification | Task 3, partially — see below |

## Spec requirements this plan does NOT implement, and who owns them

| Requirement | Owner | Why not here |
|---|---|---|
| §5 events data, generated event pages, upcoming/past sort | **B3** | Blocked on client event data |
| §4 home-page event teaser | **B3** | Needs `events.json` |
| §4 image rules — `srcset`, AVIF/WebP, `width`/`height` — and `og:image` | **B3** | Blocked on photography. **B3 must extend the `mediaSlot` macro's `<img>` branch, which currently emits none of them.** This plan reserves the hero slot but does not change that contract. |
| §4 real-device verification: actual iOS zoom-on-focus, real overflow at 8 widths, live focus order | **Manual checklist, Task 3** | Requires a real browser and real hardware. Node has no layout engine, and adding a headless browser was considered and declined — see Decisions |
| §6 rate limiting | Deferred | Stated limitation in spec §6 |
| §6 reconciliation sweep for null `ghl_contact_id` | Phase 2 | With the nightly GHL pull |

---

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | The sticky bar's label and target are **per-page**, not "Create free profile" everywhere | A sponsor is a company, not a prospective member. A bar pushing free-profile signup underneath a sponsorship enquiry form competes with the page's own conversion. **This deviates from spec §4's literal wording; the spec is amended in Task 1.** |
| D2 | The hero's media slot is **reserved now**, rendering the placeholder | Consistent with how every other image slot was handled in B2. B3 supplies a file and nothing else changes. |
| D3 | The hero media is **hidden below 1024px** | A 60vh grey placeholder above the fold on a phone is worse than no image. The spec's own collapse table gives the phone hero `auto` height with section padding, which this satisfies. |
| D4 | Accessibility checks are **static assertions over built HTML and CSS** — no headless browser | Real layout assertions need a browser; Node has no layout engine and jsdom computes none. Playwright was considered and declined: a few hundred MB of browser download and a second toolchain, on a site whose entire build is one static-site generator. Static checks catch the *rules* that produce layout bugs; the render itself stays a manual pass. |
| D5 | The sticky bar is revealed by **IntersectionObserver on the first `<section>` in `<main>`** | Every page's hero is its first section by construction, so no page needs a marker attribute and no page can forget one. |

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Node >= 24. ESM only.** No `require()`.
- **Shell is Windows PowerShell 5.1.** It does NOT support `&&`. Chain with `;` or separate lines.
- **NEVER run `git push`.** Commit locally and stop.
- **Stage with explicit paths. NEVER `git add -A`.**
- **No new dependencies.** This is a hard constraint of this plan specifically — see D4.
- **`src/css/tokens.css` must not be modified.** All colours from tokens; no hex literals outside it.
- **No `box-shadow` anywhere in the stylesheet.**
- **CSS is mobile-first: `min-width` media queries only**, breakpoints as literals. **This matters more than usual here:** the sticky bar is a phones-only feature, so it is styled by default and *hidden* at `min-width: 768px` — never the reverse.
- **`var(--brass)` is never a text colour.** Use `var(--brass-text)`.
- **Minimum touch target 44x44 CSS px. Minimum form input font-size 16px.**
- **Exactly one `<h1>` per page.** Enforced by an existing test.
- **No inline `style` attributes** in page templates. The `mediaSlot` macro's `aspect-ratio` is the one sanctioned exception.
- **Do not modify `src/_includes/partials/footer.njk`** — it carries a test-enforced credit.
- Page body copy is final and client-facing. Do not reword it.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `src/_includes/partials/sticky-cta.njk` | The phones-only bar, parameterised by label and target |
| `src/js/sticky-cta.js` | Reveals the bar once the hero leaves the viewport |
| `test/accessibility.test.js` | Static assertions over built HTML and `main.css` |
| `docs/superpowers/plans/b4-manual-verification.md` | The checklist for what static tests cannot cover |

**Modified:**

| Path | Change |
|---|---|
| `src/_includes/base.njk` | Include the sticky bar; load its script |
| `src/css/main.css` | Sticky bar styles; hero styles |
| `src/index.njk` | Hero restructured to full-bleed with a media slot |
| `src/lessons.njk`, `src/sponsors.njk`, `src/corporate.njk`, `src/events.njk` | Per-page sticky label and target in front matter |
| `docs/superpowers/specs/2026-08-12-pwrhaus-marketing-site-design.md` | Record the per-page CTA deviation; mark B4 rows delivered |

---

## Task 1: Phones-only sticky CTA bar

**Files:**
- Create: `src/_includes/partials/sticky-cta.njk`, `src/js/sticky-cta.js`
- Modify: `src/_includes/base.njk`, `src/css/main.css`, `src/lessons.njk`, `src/sponsors.njk`, `src/corporate.njk`, `src/events.njk`, `docs/superpowers/specs/2026-08-12-pwrhaus-marketing-site-design.md`

**Interfaces:**
- Consumes: `base.njk`, the design tokens, and the existing `.btn`/`.btn-primary` classes.
- Produces: every page renders a sticky bar. Pages override it with two optional front-matter keys:
  - `stickyLabel` — button text. Default `Create free profile`.
  - `stickyHref` — target. Default `/#join-web_free_profile`.

- [ ] **Step 1: Create `src/_includes/partials/sticky-cta.njk`**

```njk
{#
  Phones-only sticky CTA. Ships hidden and is revealed by sticky-cta.js once the
  hero scrolls out of view, so it never covers the hero's own buttons.

  Label and target are per-page. A sponsor is a company, not a prospective
  member, so a bar reading "Create free profile" underneath a sponsorship
  enquiry form would compete with that page's own conversion.
#}
<div class="sticky-cta" data-sticky-cta hidden>
  <a class="btn btn-primary" href="{{ stickyHref | default('/#join-web_free_profile') }}">
    {{ stickyLabel | default('Create free profile') }}
  </a>
</div>
```

- [ ] **Step 2: Create `src/js/sticky-cta.js`**

```js
(function () {
  var bar = document.querySelector('[data-sticky-cta]');
  if (!bar) return;

  function reveal() {
    bar.hidden = false;
    document.body.classList.add('has-sticky-cta');
  }
  function conceal() {
    bar.hidden = true;
    document.body.classList.remove('has-sticky-cta');
  }

  // Every page's hero is the first section in <main> by construction, so no
  // page needs a marker attribute and no page can forget one.
  var hero = document.querySelector('main > section');

  // No hero (or no IntersectionObserver): show the bar rather than lose the CTA.
  if (!hero || !('IntersectionObserver' in window)) {
    reveal();
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) conceal(); else reveal();
    });
  });

  observer.observe(hero);
})();
```

- [ ] **Step 3: Add the bar and its script to `src/_includes/base.njk`**

Immediately before the existing `{% include "partials/footer.njk" %}` line, add:

```njk
{% include "partials/sticky-cta.njk" %}
```

Then add this script tag alongside the existing ones, after `form.js`:

```njk
<script src="/js/sticky-cta.js" defer></script>
```

Change nothing else in the file.

- [ ] **Step 4: Append the sticky bar styles to `src/css/main.css`**

```css
/* Phones-only sticky CTA. Styled by default and hidden from 768px up — the
   desktop header already carries a persistent CTA, so a second one would be
   redundant. Never write this as a max-width query. */
.sticky-cta {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 40;
  min-height: 64px;
  display: flex;
  align-items: center;
  padding: var(--space-2) var(--page-pad);
  /* Clears the home indicator on notched phones. */
  padding-bottom: calc(var(--space-2) + env(safe-area-inset-bottom));
  background: var(--paper-raised);
  border-top: 1px solid var(--ink-muted);
}
.sticky-cta[hidden] { display: none; }
.sticky-cta .btn { width: 100%; }

/* Reserve room so the bar cannot cover the last thing on the page, which is
   the footer credit. Only applied while the bar is actually visible. */
body.has-sticky-cta { padding-bottom: calc(64px + env(safe-area-inset-bottom)); }

@media (min-width: 768px) {
  .sticky-cta { display: none; }
  body.has-sticky-cta { padding-bottom: 0; }
}
```

- [ ] **Step 5: Set the per-page label and target**

Add these two keys to the front matter of each page, leaving every other key and all body copy untouched.

`src/lessons.njk`:
```yaml
stickyLabel: Ask about lessons
stickyHref: "#join-web_lessons"
```

`src/sponsors.njk`:
```yaml
stickyLabel: Talk to us about sponsoring
stickyHref: "#join-web_sponsor"
```

`src/corporate.njk`:
```yaml
stickyLabel: Tell us about your event
stickyHref: "#join-web_corporate"
```

`src/events.njk`:
```yaml
stickyLabel: Keep me posted
stickyHref: "#join-web_event_interest"
```

`src/index.njk`, `src/about.njk`, `src/membership.njk`, `src/thanks.njk` and `src/404.njk` take the defaults — do not add the keys there.

- [ ] **Step 6: Record the spec deviation**

In `docs/superpowers/specs/2026-08-12-pwrhaus-marketing-site-design.md`, replace these three lines **exactly** (they are lines 232–234, in the "Touch and input" section):

```
- On phones only, a **sticky bottom CTA bar** ("Create free profile") appears after the user
  scrolls past the hero. Height 64px plus `env(safe-area-inset-bottom)` so it clears the home
  indicator on notched devices. It is the site's stated job on the surface most people use.
```

with these six:

```
- On phones only, a **sticky bottom CTA bar** appears after the user scrolls past the hero.
  Its label and target are **per-page**: "Create free profile" on the home, about and
  membership pages, and the page's own enquiry elsewhere — a sponsor is a company, not a
  prospective member, so a free-profile bar under a sponsorship form would compete with that
  page's conversion. Height 64px plus `env(safe-area-inset-bottom)` so it clears the home
  indicator on notched devices. It is the site's stated job on the surface most people use.
```

This is a whole-bullet replacement, not an insertion — there must be exactly one such bullet afterwards.

- [ ] **Step 7: Build and verify**

Run: `npm run build`
Expected: succeeds, 9 pages.

Run: `Select-String -Path public/sponsors/index.html -Pattern "Talk to us about sponsoring"`
Expected: two matches — the form heading and the sticky bar.

Run: `Select-String -Path public/index.html -Pattern 'data-sticky-cta'`
Expected: one match.

Run: `Select-String -Path public/about/index.html -Pattern 'href="/#join-web_free_profile"'`
Expected: at least one match — about takes the default target.

- [ ] **Step 8: Run the suite**

Run: `npm test`
Expected: 57 passing, 0 failing.

- [ ] **Step 9: Commit**

```
git add src/_includes/partials/sticky-cta.njk src/js/sticky-cta.js src/_includes/base.njk src/css/main.css src/lessons.njk src/sponsors.njk src/corporate.njk src/events.njk docs/superpowers/specs/2026-08-12-pwrhaus-marketing-site-design.md
git commit -m "feat(site): phones-only sticky CTA bar with a per-page target"
```

---

## Task 2: Full-bleed hero

**Files:**
- Modify: `src/index.njk`, `src/css/main.css`

**Interfaces:**
- Consumes: the `mediaSlot` macro and the tokens.
- Produces: `.hero`, `.hero-inner`, `.hero-text`, `.hero-media` classes. Only the home page uses them.

The hero reaches `min-height: 60vh` from 1024px up, with the media column bleeding to the right viewport edge while the text column stays aligned with every other section's container. Below 1024px the media is hidden and the hero is a normal padded section — a 60vh grey placeholder above the fold on a phone would be worse than no image at all.

- [ ] **Step 1: Restructure the hero in `src/index.njk`**

Replace **only** the first `<section>` — from `<section class="section">` through its closing `</section>`, the one containing the `Never golfed?` heading — with:

```njk
<section class="hero">
  <div class="hero-inner">
    <div class="hero-text">
      <p class="eyebrow">Co-ed &middot; Fort Lauderdale &amp; Miami</p>
      <h1>Never golfed?<br>Perfect.</h1>
      <p class="lead">Most of our members hadn't either. They came for the business.
         They stayed for the game.</p>
      <p class="actions">
        <a class="btn btn-primary" href="#join-web_free_profile">Create free profile</a>
        <a class="btn btn-secondary" href="/membership/">How membership works</a>
      </p>
    </div>
    <div class="hero-media">
      {{ mediaSlot(false, "", "4 / 3") }}
    </div>
  </div>
</section>
```

Every other section on the page is unchanged. The copy above is identical to what is already there — reproduce it exactly, do not reword.

- [ ] **Step 2: Append the hero styles to `src/css/main.css`**

```css
/* Hero. Below 1024px this is an ordinary padded section: the media is hidden
   because a 60vh placeholder above the fold on a phone is worse than no image. */
.hero { padding-block: var(--space-section-sm); }
.hero-text { padding-inline: var(--page-pad); max-width: var(--content-max); margin-inline: auto; }
.hero-media { display: none; }

@media (min-width: 768px) {
  .hero { padding-block: var(--space-section-md); }
}

@media (min-width: 1024px) {
  /* Full-bleed: the media column runs to the viewport's right edge while the
     text column stays aligned with every other section's container. */
  .hero { padding-block: 0; min-height: 60vh; }
  .hero-inner {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    min-height: 60vh;
  }
  .hero-text {
    margin-inline: 0;
    max-width: none;
    padding-inline: max(var(--page-pad), calc((100vw - var(--content-max)) / 2)) var(--space-7);
    padding-block: var(--space-7);
  }
  .hero-media { display: block; align-self: stretch; }
  .hero-media .media {
    height: 100%;
    border-radius: 0;
    object-fit: cover;
  }
}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: succeeds.

Run: `Select-String -Path public/index.html -Pattern 'class="hero"'`
Expected: one match.

Run: `Select-String -Path public/index.html -Pattern 'Never golfed'`
Expected: one match — the copy survived the restructure.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: 57 passing, 0 failing. The single-`h1` test covers this page and would catch a duplicated heading.

- [ ] **Step 5: Commit**

```
git add src/index.njk src/css/main.css
git commit -m "feat(site): full-bleed hero reaching 60vh at desktop"
```

---

## Task 3: Static accessibility assertions and the manual checklist

**Files:**
- Create: `test/accessibility.test.js`, `docs/superpowers/plans/b4-manual-verification.md`

**Interfaces:**
- Consumes: the built output and `src/css/main.css`.
- Produces: five new tests. Total becomes **62 passing**.

These assert the *rules* that produce correct layout. They cannot prove a render — Node has no layout engine — so the render itself stays a manual pass, documented alongside.

- [ ] **Step 1: Write the failing tests**

Create `test/accessibility.test.js`:

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let outDir;

before(() => {
  outDir = mkdtempSync(join(tmpdir(), 'pwrhaus-a11y-'));
  execFileSync('npx', ['@11ty/eleventy', '--output=' + outDir], { stdio: 'pipe', shell: true });
});

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

function htmlFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...htmlFiles(full));
    else if (entry.endsWith('.html')) found.push(full);
  }
  return found;
}

test('no page skips a heading level', () => {
  const pages = htmlFiles(outDir);
  assert.ok(pages.length > 0, 'build produced no HTML');
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    for (let i = 1; i < levels.length; i++) {
      assert.ok(
        levels[i] <= levels[i - 1] + 1,
        `${page} jumps from h${levels[i - 1]} to h${levels[i]} — screen reader users navigate by heading level`,
      );
    }
  }
});

test('the skip link is the first focusable element on every page', () => {
  for (const page of htmlFiles(outDir)) {
    const html = readFileSync(page, 'utf8');
    const body = html.slice(html.indexOf('<body'));
    const first = body.match(/<(?:a|button|input|select|textarea)\b[^>]*>/);
    assert.ok(first, `${page} has no focusable element at all`);
    assert.match(
      first[0],
      /class="skip-link"/,
      `${page}: first focusable element must be the skip link, found ${first[0].slice(0, 60)}`,
    );
  }
});

test('every form input has a label bound to it', () => {
  for (const page of htmlFiles(outDir)) {
    const html = readFileSync(page, 'utf8');
    const forId = new Set([...html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]));
    for (const m of html.matchAll(/<(?:input|textarea)\b[^>]*>/g)) {
      const tag = m[0];
      if (/type="hidden"/.test(tag)) continue;
      const id = tag.match(/\sid="([^"]+)"/);
      assert.ok(id, `${page}: form control without an id, so no label can bind to it: ${tag.slice(0, 60)}`);
      assert.ok(forId.has(id[1]), `${page}: no <label for="${id[1]}">`);
    }
  }
});

test('form inputs declare at least 16px so iOS Safari does not zoom on focus', () => {
  const css = readFileSync('src/css/main.css', 'utf8');
  const rule = css.match(/\.field input,\s*\.field textarea\s*\{[^}]*\}/);
  assert.ok(rule, 'expected a .field input/.field textarea rule in main.css');
  const size = rule[0].match(/font-size:\s*(\d+)px/);
  assert.ok(size, 'form inputs must declare an explicit px font-size');
  assert.ok(
    Number(size[1]) >= 16,
    `form inputs declare ${size[1]}px; below 16px iOS Safari zooms the viewport on focus`,
  );
});

test('no fixed width in the stylesheet exceeds the narrowest supported viewport', () => {
  const css = readFileSync('src/css/main.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // Exclude every hyphenated -width property: min-width, max-width, border-width.
  for (const m of css.matchAll(/(?<![a-z-])width:\s*(\d+)px/g)) {
    assert.ok(
      Number(m[1]) <= 320,
      `fixed width ${m[1]}px will overflow a 320px viewport — use a relative unit or a max-width`,
    );
  }
});
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npm test`
Expected: **62 passing, 0 failing**.

If any fail, that is a real finding in the existing site, not a broken test. Report it rather than weakening the assertion.

- [ ] **Step 3: Prove the heading-level test can actually fail**

Temporarily add `<h4>probe</h4>` immediately after the `<h1>` in `src/404.njk`, then run:

Run: `npm test`
Expected: FAIL — "jumps from h1 to h4".

Remove the probe line and confirm with `Select-String -Path src/404.njk -Pattern "probe"` returning nothing, then re-run `npm test` and expect 62 passing.

- [ ] **Step 4: Write the manual checklist**

Create `docs/superpowers/plans/b4-manual-verification.md`:

```markdown
# B4 — Manual verification checklist

The static tests in `test/accessibility.test.js` assert the rules that produce correct
layout. They cannot prove a render: Node has no layout engine, and a headless browser was
deliberately declined (see plan D4). These are the checks that need a real browser and,
for the last group, real hardware.

Run with `npm run dev`, or against a Netlify deploy preview.

## Every page, at every width

Pages: `/`, `/about/`, `/membership/`, `/lessons/`, `/sponsors/`, `/corporate/`,
`/events/`, `/thanks/`, `/404.html`

Widths: **320, 375, 390, 768, 820, 1024, 1280, 1440**

- [ ] No horizontal scroll on the body at any width
- [ ] No text clipped, overlapping, or escaping its container
- [ ] Every interactive element is at least 44x44 CSS px, with at least 8px between adjacent targets
- [ ] Nothing depends on hover to be usable

## Sticky CTA

- [ ] Hidden while the hero is on screen; appears once it scrolls away
- [ ] Gone entirely from 768px up
- [ ] Never covers the footer credit — scroll to the very bottom and confirm
- [ ] Carries the right label per page: free profile on home/about/membership, the page's own
      enquiry on lessons/sponsors/corporate/events
- [ ] On a notched iPhone, sits above the home indicator rather than under it

## Hero

- [ ] Reaches 60vh from 1024px up, and never 100vh
- [ ] Media column bleeds to the right viewport edge; text stays aligned with the container
- [ ] Below 1024px the media is absent and the hero is a normal padded section

## Keyboard

- [ ] First Tab reveals the skip link; activating it moves focus to the main content
- [ ] Every interactive element shows the brass focus ring
- [ ] Nav overlay at 375px: Tab cycles inside it, Esc closes it, focus returns to the toggle
- [ ] Crossing 1024px with the overlay open clears the scroll lock

## Real device — cannot be simulated

- [ ] On a real iPhone, tapping any form input does **not** zoom the viewport
- [ ] Rotate an iPad while the nav overlay is open: page scroll is not left locked
- [ ] `prefers-reduced-motion` enabled: no transition runs

## Forms, against `netlify dev`

- [ ] Submitting from `/lessons/` writes one `contacts` row and one `contact_inquiries` row
      with `source = 'web_lessons'`
- [ ] Submitting from `/corporate/` with the same email adds no second contact row and a
      second inquiry row with `source = 'web_corporate'`
- [ ] A malformed email shows the inline error and the button re-enables
```

- [ ] **Step 5: Commit**

```
git add test/accessibility.test.js docs/superpowers/plans/b4-manual-verification.md
git commit -m "test(site): static accessibility assertions, plus the manual checklist"
```

---

## Plan self-review

**Spec coverage.** §4 sticky CTA — Task 1, with the per-page deviation recorded in the spec itself rather than left implicit. §4 full-bleed hero — Task 2. §9 verification — split honestly between Task 3's static assertions and a manual checklist, with the boundary stated. Everything this plan does not cover is enumerated above with an owner, per the rule spec §12 now carries.

**Placeholder scan.** No TBD or TODO. Every step has complete code and an expected command output.

**Type consistency.** `stickyLabel` and `stickyHref` are read in exactly one place (`sticky-cta.njk`) and set in exactly four (`lessons`, `sponsors`, `corporate`, `events`). Each `stickyHref` matches the `join-{{ formSource }}` id that page actually renders: `web_lessons`, `web_sponsor`, `web_corporate`, `web_event_interest` — all members of `ALLOWED_SOURCES`, so the existing whitelist test still covers them. The hero classes are used only by `src/index.njk`.

**Known gaps, stated deliberately.** The static tests cannot prove a render; that is D4, and the manual checklist is its counterpart rather than an afterthought. The `mediaSlot` `<img>` branch still lacks `width`/`height`/`srcset`/`sizes` — this plan reserves the hero slot but does not fix that contract, which belongs to B3 with the photography that makes it testable.
