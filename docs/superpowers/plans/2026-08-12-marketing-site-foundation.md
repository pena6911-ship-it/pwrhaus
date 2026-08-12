# PWRHaus Marketing Site — Foundation & Capture (Plan B1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Eleventy site shell — design system, shared layout, navigation, footer — and a hardened, working lead-capture path that writes to Supabase and pushes to GHL.

**Architecture:** Eleventy 3 (ESM) renders Nunjucks templates from `src/` into `public/`, which Netlify already publishes. Nav and footer live in one layout. Forms POST JSON to the existing `/api/contacts` Netlify Function; that endpoint gains input sanitization, a honeypot, and an append-only `contact_inquiries` write so repeat submissions are never lost.

**Tech Stack:** Node 24 · Eleventy 3 (Nunjucks) · plain CSS with custom properties · vanilla JS · Netlify Functions v2 · Supabase (`@supabase/supabase-js`) · `node --test`

**Spec:** `docs/superpowers/specs/2026-08-12-pwrhaus-marketing-site-design.md`

## Scope

**This plan (B1) delivers:** build pipeline, design tokens, self-hosted fonts, base layout, responsive nav, footer with the Framework & Co. credit, the reusable form partial, `/thanks`, the full endpoint hardening, and the `contact_inquiries` ledger. At the end, the site builds and deploys, and lead capture works end to end.

**Deliberately NOT in this plan (Plan B2, written after B1 lands):** `/`, `/about`, `/events` + generated event pages, `/membership`, `/lessons`, `/sponsors`, `/corporate`, `/404`, `events.json`, and all site copy. B1 ships a placeholder home page only.

The split exists because B1 is infrastructure plus the money path — independently testable and independently valuable — while B2 is content that consumes it.

## Global Constraints

Every task's requirements implicitly include this section.

- **Node >= 24.** Confirmed v24.15.0. `package.json` already declares `"engines": { "node": ">=24" }`.
- **ESM only.** `package.json` has `"type": "module"`. No `require()`.
- **Shell is Windows PowerShell 5.1.** It does NOT support `&&`. Chain with `;` or use separate lines.
- **NEVER run `git push`.** Commit locally and stop.
- **Stage with `git add -u` or explicit paths. NEVER `git add -A`.**
- **Design tokens in `src/css/tokens.css` are FINAL.** Copy hex values, sizes, and durations verbatim from this plan. Do not substitute, round, or "improve" them.
- **No `box-shadow` anywhere in the stylesheet.** Borders do that work.
- **CSS is mobile-first: `min-width` media queries only.** Never mix in `max-width` queries.
- **Minimum touch target 44x44 CSS px. Minimum form input font-size 16px** (below 16px, iOS Safari zooms the viewport on focus).
- **New dependencies approved for this plan and no others:** `@11ty/eleventy` (dev), `@fontsource-variable/fraunces` (dev), `@fontsource-variable/work-sans` (dev). Do not add anything else without asking.
- **`tier` is never accepted from a request body.** Already fixed on `main` in commit `f86ac71`. Do not undo it.
- Migration `0002_contact_notes.sql` is **already applied** to `pwrhaus-dev`. `contacts.notes` and the `contact_inquiries` table exist.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `eleventy.config.js` | Eleventy input/output dirs, passthrough copy, template engine |
| `src/_data/site.json` | Site-wide constants (name, url, description) |
| `src/_data/nav.json` | Navigation items — single source for header and footer |
| `src/_includes/base.njk` | The one HTML shell: head, skip link, header, main, footer, scripts |
| `src/_includes/partials/header.njk` | Logo, desktop nav, mobile toggle + overlay panel |
| `src/_includes/partials/footer.njk` | Footer nav, F&Co credit |
| `src/_includes/partials/capture-form.njk` | Reusable capture form, parameterised by source |
| `src/css/tokens.css` | Design tokens only. No rules. |
| `src/css/main.css` | Reset, base type, layout, components, responsive |
| `src/js/nav.js` | Mobile nav overlay: toggle, focus trap, Esc, scroll lock |
| `src/js/form.js` | Progressive form enhancement: async submit, errors, redirect |
| `src/index.njk` | Placeholder home (replaced in B2) |
| `src/thanks.njk` | Post-submit confirmation |
| `src/fonts/*.woff2` | Self-hosted variable fonts (copied from Fontsource) |
| `functions/lib/sanitize.js` | Input sanitization: email validity, source whitelist, truncation |
| `test/sanitize.test.js` | Unit tests for the above |
| `test/build-output.test.js` | Asserts guarantees about built HTML |

**Modified:**

| Path | Change |
|---|---|
| `package.json` | `build` script, dev dependencies |
| `netlify.toml` | `command = "npm run build"` |
| `.gitignore` | ignore `public/` |
| `functions/lib/handlers.js` | honeypot, email validation, sanitized payload |
| `functions/lib/contacts.js` | append a `contact_inquiries` row on every submission |
| `functions/lib/supabase.js` | `insertContactInquiry` port method |
| `test/helpers/fake-db.js` | `insertContactInquiry` + `notes` on `insertContact` |
| `test/handlers.test.js` | honeypot + invalid email tests |
| `test/contacts.test.js` | inquiry-ledger tests |

---

## Task 1: Eleventy build pipeline

**Files:**
- Create: `eleventy.config.js`, `src/index.njk`, `src/_data/site.json`
- Modify: `package.json`, `netlify.toml`, `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run build` renders `src/` → `public/`. Every later task relies on this.

- [ ] **Step 1: Install Eleventy**

```
npm install --save-dev @11ty/eleventy@^3
```

- [ ] **Step 2: Create `eleventy.config.js`**

```js
export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy('src/css');
  eleventyConfig.addPassthroughCopy('src/js');
  eleventyConfig.addPassthroughCopy('src/fonts');
  eleventyConfig.addPassthroughCopy('src/img');

  return {
    dir: {
      input: 'src',
      output: 'public',
      includes: '_includes',
      data: '_data',
    },
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
    templateFormats: ['njk', 'md', 'html'],
  };
}
```

- [ ] **Step 3: Create `src/_data/site.json`**

```json
{
  "name": "PWRHaus Golf Society",
  "shortName": "PWRHaus",
  "description": "A co-ed society of founders who use golf to find, build, and exit businesses.",
  "url": "https://pwrhaus.netlify.app"
}
```

- [ ] **Step 4: Create a minimal `src/index.njk` so the build has something to render**

```njk
---
title: PWRHaus Golf Society
---
<h1>PWRHaus</h1>
```

- [ ] **Step 5: Add the build script to `package.json`**

Change the `scripts` block to exactly:

```json
  "scripts": {
    "build": "eleventy",
    "dev": "eleventy --serve",
    "test": "node --test"
  },
```

- [ ] **Step 6: Add the build command to `netlify.toml`**

Change the `[build]` block to exactly:

```toml
[build]
  command   = "npm run build"
  functions = "functions"
  publish   = "public"
```

- [ ] **Step 7: Ignore the build output**

Append to `.gitignore`:

```
# Eleventy build output
public/
```

- [ ] **Step 8: Run the build and verify output**

Run: `npm run build`
Expected: Eleventy reports at least 1 file written. `public/index.html` exists.

Verify with: `Test-Path public/index.html`
Expected: `True`

- [ ] **Step 9: Confirm the unit suite is untouched**

Run: `npm test`
Expected: 30 passing, 0 failing.

- [ ] **Step 10: Commit**

```
git add eleventy.config.js src/ package.json package-lock.json netlify.toml .gitignore
git commit -m "build(site): add Eleventy pipeline rendering src/ to public/"
```

---

## Task 2: Design tokens and self-hosted fonts

**Files:**
- Create: `src/css/tokens.css`, `src/fonts/*.woff2`, `src/fonts/OFL.txt`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1's passthrough copy of `src/css` and `src/fonts`.
- Produces: CSS custom properties consumed by every stylesheet rule in Task 3 onward. Font families `"Fraunces"` and `"Work Sans"`.

- [ ] **Step 1: Install the font packages**

```
npm install --save-dev @fontsource-variable/fraunces @fontsource-variable/work-sans
```

- [ ] **Step 2: Locate the Latin variable font files**

```
Get-ChildItem node_modules/@fontsource-variable/fraunces/files/ -Filter *latin*.woff2 | Select-Object Name
Get-ChildItem node_modules/@fontsource-variable/work-sans/files/ -Filter *latin*.woff2 | Select-Object Name
```

Pick the **standard (non-italic) Latin weight-axis** file from each — its name contains `latin-wght-normal`.

- [ ] **Step 3: Copy them into the repo with stable names**

```
New-Item -ItemType Directory -Force src/fonts
Copy-Item node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2 src/fonts/fraunces-variable.woff2
Copy-Item node_modules/@fontsource-variable/work-sans/files/work-sans-latin-wght-normal.woff2 src/fonts/work-sans-variable.woff2
Copy-Item node_modules/@fontsource-variable/fraunces/LICENSE src/fonts/OFL.txt
```

If a source filename differs from the above, use the actual name found in Step 2 — the destination names must stay exactly `fraunces-variable.woff2` and `work-sans-variable.woff2`, because the CSS references them.

- [ ] **Step 4: Create `src/css/tokens.css` — FINAL VALUES, copy verbatim**

```css
/* PWRHaus design tokens — "Clubhouse Light".
   FINAL. Do not substitute values. */

@font-face {
  font-family: "Fraunces";
  src: url("/fonts/fraunces-variable.woff2") format("woff2");
  font-weight: 100 900;
  font-display: swap;
  font-style: normal;
}

@font-face {
  font-family: "Work Sans";
  src: url("/fonts/work-sans-variable.woff2") format("woff2");
  font-weight: 100 900;
  font-display: swap;
  font-style: normal;
}

:root {
  /* Ground */
  --paper:        #FAF8F3;
  --paper-raised: #FFFFFF;

  /* Text */
  --ink:          #14201A;
  --ink-muted:    #55645B;

  /* Brand */
  --forest:       #1A4D36;
  --forest-deep:  #123527;
  --brass:        #B8912A;   /* decorative ONLY — 2.9:1 on paper */
  --brass-text:   #7D6218;   /* brass-coloured TEXT — 5.9:1, passes AA */
  --line:         #E6E1D6;
  --error:        #8C2F1E;   /* form validation messages */

  /* Type families */
  --font-display: "Fraunces", Georgia, serif;
  --font-body:    "Work Sans", system-ui, sans-serif;

  /* Spacing (8px scale) */
  --space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
  --space-5: 24px;  --space-6: 32px;  --space-7: 48px;  --space-8: 64px;
  --space-9: 96px;  --space-10: 128px;

  /* Section rhythm, mobile-first */
  --space-section-sm: 56px;
  --space-section-md: 80px;
  --space-section-lg: 96px;

  /* Layout */
  --content-max: 1120px;
  --prose-max:   680px;
  --gutter:      16px;
  --page-pad:    20px;
  --radius-card: 4px;
  --radius-pill: 999px;
  --touch-min:   44px;

  /* Motion */
  --t-hover:  160ms;
  --t-reveal: 240ms;
}

@media (min-width: 768px) {
  :root { --gutter: 20px; --page-pad: 32px; }
}

@media (min-width: 1024px) {
  :root { --gutter: 24px; --page-pad: 40px; }
}
```

- [ ] **Step 5: Verify the font files are real and non-empty**

```
Get-ChildItem src/fonts/*.woff2 | Select-Object Name, Length
```
Expected: two files, each greater than 10000 bytes.

- [ ] **Step 6: Commit**

```
git add src/css/tokens.css src/fonts/ package.json package-lock.json
git commit -m "feat(site): add Clubhouse Light design tokens and self-hosted fonts"
```

---

## Task 3: Base layout, header, footer

**Files:**
- Create: `src/_includes/base.njk`, `src/_includes/partials/header.njk`, `src/_includes/partials/footer.njk`, `src/_data/nav.json`, `src/css/main.css`, `src/js/nav.js`
- Modify: `src/index.njk`

**Interfaces:**
- Consumes: `tokens.css` custom properties (Task 2); `site.json` (Task 1).
- Produces: layout `base.njk`, usable by any page via `layout: base.njk` front matter. Pages supply `title` and optional `description`. Every page automatically gets the header, footer, and the Framework & Co. credit.

- [ ] **Step 1: Create `src/_data/nav.json`**

```json
[
  { "label": "Events",     "url": "/events/" },
  { "label": "Membership", "url": "/membership/" },
  { "label": "Lessons",    "url": "/lessons/" },
  { "label": "Sponsors",   "url": "/sponsors/" },
  { "label": "Corporate",  "url": "/corporate/" },
  { "label": "About",      "url": "/about/" }
]
```

These URLs 404 until Plan B2 adds the pages. That is expected.

- [ ] **Step 2: Create `src/_includes/partials/header.njk`**

```njk
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container header-inner">
    <a class="wordmark" href="/">{{ site.shortName }}</a>

    <nav class="nav-desktop" aria-label="Primary">
      <ul>
        {% for item in nav %}
        <li><a href="{{ item.url }}">{{ item.label }}</a></li>
        {% endfor %}
      </ul>
    </nav>

    <a class="btn btn-primary nav-cta" href="/#join">Create free profile</a>

    <button class="nav-toggle" type="button"
            aria-expanded="false" aria-controls="nav-overlay" aria-label="Open menu">
      <span class="nav-toggle-bar"></span>
      <span class="nav-toggle-bar"></span>
    </button>
  </div>

  <div class="nav-overlay" id="nav-overlay" hidden>
    <nav aria-label="Mobile">
      <ul>
        {% for item in nav %}
        <li><a href="{{ item.url }}">{{ item.label }}</a></li>
        {% endfor %}
      </ul>
    </nav>
    <a class="btn btn-primary" href="/#join">Create free profile</a>
  </div>
</header>
```

- [ ] **Step 3: Create `src/_includes/partials/footer.njk`**

The Framework & Co. credit is REQUIRED on every page. Do not remove it.

```njk
<footer class="site-footer">
  <div class="container footer-inner">
    <div class="footer-brand">
      <span class="wordmark">{{ site.shortName }}</span>
      <p class="footer-blurb">{{ site.description }}</p>
    </div>

    <nav class="footer-nav" aria-label="Footer">
      <ul>
        {% for item in nav %}
        <li><a href="{{ item.url }}">{{ item.label }}</a></li>
        {% endfor %}
      </ul>
    </nav>
  </div>

  <div class="container footer-credit">
    <p>&copy; {{ site.name }}</p>
    <p><a href="https://www.frameworkandco.com" rel="noopener">Developed by Framework &amp; Co.</a></p>
  </div>
</footer>
```

- [ ] **Step 4: Create `src/_includes/base.njk`**

```njk
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ title }}</title>
<meta name="description" content="{{ description or site.description }}">
<link rel="preload" href="/fonts/fraunces-variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/work-sans-variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/main.css">
</head>
<body>
{% include "partials/header.njk" %}
<main id="main">
{{ content | safe }}
</main>
{% include "partials/footer.njk" %}
<script src="/js/nav.js" defer></script>
<script src="/js/form.js" defer></script>
</body>
</html>
```

- [ ] **Step 5: Create `src/css/main.css`**

```css
/* Reset */
*, *::before, *::after { box-sizing: border-box; }
* { margin: 0; }
html { -webkit-text-size-adjust: 100%; }
body {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.65;
  overflow-x: hidden;
}
img, picture, svg { display: block; max-width: 100%; }
a { color: var(--forest); }

/* Focus */
:focus-visible {
  outline: 2px solid var(--brass);
  outline-offset: 2px;
}

.skip-link {
  position: absolute; left: -9999px;
  background: var(--forest); color: var(--paper);
  padding: var(--space-3) var(--space-4); z-index: 100;
}
.skip-link:focus { left: var(--space-4); top: var(--space-4); }

/* Type */
h1, h2, h3 {
  font-family: var(--font-display);
  font-variation-settings: "SOFT" 0, "WONK" 0;
  font-weight: 600;
}
h1 { font-size: clamp(2.25rem, 5vw, 3.5rem); line-height: 1.05; letter-spacing: -0.02em; }
h2 { font-size: 2rem; line-height: 1.15; letter-spacing: -0.015em; }
h3 { font-size: 1.375rem; line-height: 1.25; letter-spacing: -0.01em; }
p  { max-width: var(--prose-max); }

.eyebrow {
  font-size: 0.75rem; line-height: 1.4; letter-spacing: 0.16em;
  text-transform: uppercase; font-weight: 700; color: var(--brass-text);
}

/* Layout */
.container {
  width: 100%;
  max-width: var(--content-max);
  margin-inline: auto;
  padding-inline: var(--page-pad);
}
.section { padding-block: var(--space-section-sm); }
@media (min-width: 768px)  { .section { padding-block: var(--space-section-md); } }
@media (min-width: 1024px) { .section { padding-block: var(--space-section-lg); } }

/* Buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: var(--touch-min);
  padding: 14px 28px;
  font-family: var(--font-body); font-size: 1rem; font-weight: 600;
  text-decoration: none; cursor: pointer; border: 0;
}
.btn-primary {
  background: var(--forest); color: var(--paper);
  border-radius: var(--radius-pill);
}
.btn-secondary {
  background: transparent; color: var(--forest);
  border-bottom: 2px solid var(--brass); padding: 14px 4px;
}
@media (prefers-reduced-motion: no-preference) {
  .btn { transition: background-color var(--t-hover) ease-out; }
}
.btn-primary:hover { background: var(--forest-deep); }

/* Header */
.site-header { border-bottom: 1px solid var(--line); background: var(--paper); }
.header-inner {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-4); min-height: 64px;
}
.wordmark {
  font-family: var(--font-body); font-weight: 800;
  letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--forest); text-decoration: none; font-size: 0.875rem;
  display: inline-flex; align-items: center; min-height: var(--touch-min);
}
.nav-desktop { display: none; }
.nav-cta { display: none; }

.nav-toggle {
  width: var(--touch-min); height: var(--touch-min);
  background: transparent; border: 0; cursor: pointer;
  display: flex; flex-direction: column; justify-content: center; gap: 5px;
}
.nav-toggle-bar { display: block; height: 2px; width: 22px; background: var(--ink); }

.nav-overlay {
  position: fixed; inset: 0; z-index: 50;
  background: var(--paper);
  padding: var(--space-8) var(--page-pad);
  display: flex; flex-direction: column; gap: var(--space-6);
  overflow-y: auto;
}
.nav-overlay[hidden] { display: none; }
.nav-overlay ul { list-style: none; padding: 0; }
.nav-overlay a {
  display: block; font-size: 1.125rem; padding-block: var(--space-4);
  text-decoration: none; border-bottom: 1px solid var(--line);
}
body.nav-open { overflow: hidden; }

@media (min-width: 1024px) {
  .nav-toggle { display: none; }
  .nav-overlay { display: none !important; }
  .nav-desktop { display: block; }
  .nav-desktop ul { display: flex; gap: var(--space-5); list-style: none; padding: 0; }
  .nav-desktop a {
    text-decoration: none; color: var(--ink); font-size: 0.9375rem;
    display: inline-flex; align-items: center; min-height: var(--touch-min);
  }
  .nav-desktop a:hover { color: var(--forest); }
  .nav-cta { display: inline-flex; }
}

/* Footer */
.site-footer {
  border-top: 1px solid var(--line);
  margin-top: var(--space-section-md);
  padding-block: var(--space-7) var(--space-5);
}
.footer-inner { display: grid; gap: var(--space-6); }
.footer-blurb { color: var(--ink-muted); font-size: 0.875rem; margin-top: var(--space-2); }
.footer-nav ul { list-style: none; padding: 0; display: grid; gap: var(--space-2); }
.footer-nav a {
  color: var(--ink-muted); text-decoration: none; font-size: 0.875rem;
  display: inline-flex; align-items: center; min-height: var(--touch-min);
}
.footer-credit {
  margin-top: var(--space-6); padding-top: var(--space-4);
  border-top: 1px solid var(--line);
  display: flex; flex-wrap: wrap; gap: var(--space-3);
  justify-content: space-between;
}
.footer-credit p, .footer-credit a {
  color: var(--ink-muted); font-size: 0.875rem; text-decoration: none;
}
/* Hit area only — the credit's quiet styling must not change. */
.footer-credit a {
  display: inline-flex; align-items: center; min-height: var(--touch-min);
}
/* No accent colour on the credit, per the design system — underline only. */
.footer-credit a:hover { text-decoration: underline; }

@media (min-width: 768px) {
  .footer-inner { grid-template-columns: 2fr 1fr; }
  .footer-nav ul { grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 6: Create `src/js/nav.js`**

```js
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var overlay = document.getElementById('nav-overlay');
  if (!toggle || !overlay) return;

  function focusable() {
    return overlay.querySelectorAll('a[href], button:not([disabled])');
  }

  function open() {
    overlay.hidden = false;
    document.body.classList.add('nav-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    var items = focusable();
    if (items.length) items[0].focus();
  }

  function close() {
    overlay.hidden = true;
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.focus();
  }

  toggle.addEventListener('click', function () {
    if (overlay.hidden) open(); else close();
  });

  document.addEventListener('keydown', function (e) {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;

    var items = focusable();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });

  // Crossing to desktop width while the overlay is open hides both the overlay
  // and the toggle via CSS, but nothing would clear the scroll lock — leaving
  // the page unscrollable with no visible control. An iPad rotating to
  // landscape is exactly 1024px, so this is a rotation away, not a corner case.
  // Deliberately NOT close(): that focuses the toggle, which is display:none here.
  window.addEventListener('resize', function () {
    if (overlay.hidden) return;
    if (window.innerWidth < 1024) return;
    overlay.hidden = true;
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
  });
})();
```

- [ ] **Step 7: Point `src/index.njk` at the layout**

```njk
---
layout: base.njk
title: PWRHaus Golf Society
---
<section class="section">
  <div class="container">
    <p class="eyebrow">Co-ed &middot; Fort Lauderdale &amp; Miami</p>
    <h1>Never golfed? Perfect.</h1>
    <p>Placeholder home page. Real content lands in Plan B2.</p>
  </div>
</section>
```

- [ ] **Step 8: Build and inspect**

Run: `npm run build`
Expected: build succeeds.

Run: `Select-String -Path public/index.html -Pattern "Developed by Framework"`
Expected: one match — the credit is present.

- [ ] **Step 9: Commit**

```
git add src/
git commit -m "feat(site): base layout, responsive nav, footer with F&Co credit"
```

---

## Task 4: Input sanitization module

**Files:**
- Create: `functions/lib/sanitize.js`, `test/sanitize.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ALLOWED_SOURCES: Set<string>`
  - `isValidEmail(email: unknown) => boolean`
  - `truncate(value: unknown, max: number) => string | null`
  - `sanitizeContactInput(body: object) => { email, full_name, phone, notes, source, tier }`

  Task 5 imports `isValidEmail` and `sanitizeContactInput`.

- [ ] **Step 1: Write the failing tests**

Create `test/sanitize.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidEmail,
  truncate,
  sanitizeContactInput,
  ALLOWED_SOURCES,
} from '../functions/lib/sanitize.js';

test('isValidEmail accepts a normal address and rejects malformed ones', () => {
  assert.equal(isValidEmail('a@x.com'), true);
  assert.equal(isValidEmail('first.last@sub.example.co'), true);
  assert.equal(isValidEmail('no-at-sign'), false);
  assert.equal(isValidEmail('spaces in@x.com'), false);
  assert.equal(isValidEmail('a@nodot'), false);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail(null), false);
  assert.equal(isValidEmail(12345), false);
});

test('isValidEmail rejects addresses longer than 254 characters', () => {
  const long = 'a'.repeat(250) + '@x.com';
  assert.equal(long.length > 254, true);
  assert.equal(isValidEmail(long), false);
});

test('truncate trims, nulls empties, and caps length', () => {
  assert.equal(truncate('  hello  ', 10), 'hello');
  assert.equal(truncate('', 10), null);
  assert.equal(truncate('   ', 10), null);
  assert.equal(truncate(null, 10), null);
  assert.equal(truncate(undefined, 10), null);
  assert.equal(truncate('abcdefghijk', 5), 'abcde');
});

test('sanitizeContactInput forces tier free and lowercases the email', () => {
  const out = sanitizeContactInput({ email: '  A@X.COM ', tier: 'inner_circle' });
  assert.equal(out.tier, 'free');
  assert.equal(out.email, 'a@x.com');
});

test('sanitizeContactInput passes through whitelisted sources', () => {
  for (const s of ALLOWED_SOURCES) {
    assert.equal(sanitizeContactInput({ email: 'a@x.com', source: s }).source, s);
  }
});

test('sanitizeContactInput falls back to site for unknown sources', () => {
  assert.equal(sanitizeContactInput({ email: 'a@x.com', source: 'evil' }).source, 'site');
  assert.equal(sanitizeContactInput({ email: 'a@x.com' }).source, 'site');
});

test('sanitizeContactInput caps field lengths', () => {
  const out = sanitizeContactInput({
    email: 'a@x.com',
    full_name: 'n'.repeat(200),
    phone: 'p'.repeat(100),
    notes: 'x'.repeat(3000),
  });
  assert.equal(out.full_name.length, 120);
  assert.equal(out.phone.length, 40);
  assert.equal(out.notes.length, 2000);
});

test('sanitizeContactInput never returns a company_website key', () => {
  const out = sanitizeContactInput({ email: 'a@x.com', company_website: 'spam' });
  assert.equal('company_website' in out, false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module ... sanitize.js`.

- [ ] **Step 3: Write the minimal implementation**

Create `functions/lib/sanitize.js`:

```js
export const ALLOWED_SOURCES = new Set([
  'web_free_profile',
  'web_event_interest',
  'web_lessons',
  'web_sponsor',
  'web_corporate',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  return EMAIL_RE.test(trimmed);
}

export function truncate(value, max) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '') return null;
  return s.length > max ? s.slice(0, max) : s;
}

export function sanitizeContactInput(body) {
  return {
    email: String(body.email).trim().toLowerCase(),
    full_name: truncate(body.full_name, 120),
    phone: truncate(body.phone, 40),
    notes: truncate(body.notes, 2000),
    source: ALLOWED_SOURCES.has(body.source) ? body.source : 'site',
    tier: 'free',
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all sanitize tests pass; total 37 passing, 0 failing.

- [ ] **Step 5: Commit**

```
git add functions/lib/sanitize.js test/sanitize.test.js
git commit -m "feat(contacts): add input sanitization for the public capture endpoint"
```

---

## Task 5: Honeypot and email validation in the handler

**Files:**
- Modify: `functions/lib/handlers.js`, `test/handlers.test.js`

**Interfaces:**
- Consumes: `isValidEmail`, `sanitizeContactInput` from Task 4.
- Produces: `/api/contacts` responses — `201` on success or honeypot, `400 invalid_email`, `400 email_required`, `405` non-POST.

- [ ] **Step 1: Write the failing tests**

Add to `test/handlers.test.js`, immediately after the existing tier test:

```js
test('contact-create handler silently accepts and discards honeypot submissions', async () => {
  let called = false;
  const handler = makeContactCreateHandler({
    createContact: async () => { called = true; return { id: 'c_1', ghl_contact_id: 'g_1' }; },
    deps: {},
    log: silentLog,
  });

  const res = await handler(req('POST', {
    email: 'bot@x.com',
    company_website: 'http://spam.example',
  }));

  assert.equal(res.status, 201);
  assert.equal(called, false, 'createContact must not run for honeypot hits');
  const body = await res.json();
  assert.equal(typeof body.id, 'string');
  assert.equal(body.ghl_contact_id, null);
});

test('contact-create handler rejects a malformed email', async () => {
  const handler = makeContactCreateHandler({
    createContact: async () => ({ id: 'c_1', ghl_contact_id: 'g_1' }),
    deps: {},
    log: silentLog,
  });

  const res = await handler(req('POST', { email: 'not-an-email' }));

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'invalid_email' });
});

test('contact-create handler passes a sanitized payload to createContact', async () => {
  let received;
  const handler = makeContactCreateHandler({
    createContact: async (_deps, input) => { received = input; return { id: 'c_1', ghl_contact_id: 'g_1' }; },
    deps: {},
    log: silentLog,
  });

  await handler(req('POST', {
    email: 'A@X.com',
    source: 'evil',
    full_name: 'n'.repeat(200),
    company_website: '',
  }));

  assert.equal(received.email, 'a@x.com');
  assert.equal(received.source, 'site');
  assert.equal(received.full_name.length, 120);
  assert.equal(received.tier, 'free');
  assert.equal('company_website' in received, false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — honeypot test fails because `createContact` runs; invalid email returns 201 instead of 400.

- [ ] **Step 3: Update `functions/lib/handlers.js`**

Replace the import block at the top of the file with:

```js
import { json } from './http.js';
import { randomUUID } from 'node:crypto';
import { isValidEmail, sanitizeContactInput } from './sanitize.js';
```

Replace the body of `makeContactCreateHandler` with:

```js
export function makeContactCreateHandler({ createContact, deps, log = console }) {
  return async (req) => {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    let body;
    try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

    // Honeypot: a real browser never fills this hidden field. Return a
    // convincing 201 rather than a 400 — an error teaches a bot to retry.
    if (typeof body?.company_website === 'string' && body.company_website.trim() !== '') {
      log.info?.('contact.honeypot');
      return json({ id: randomUUID(), ghl_contact_id: null }, 201);
    }

    if (!body?.email) return json({ error: 'email_required' }, 400);
    if (!isValidEmail(body.email)) return json({ error: 'invalid_email' }, 400);

    // tier is never client-controlled: this endpoint is public and unauthenticated.
    // Paid tiers are written only by the signature-verified Stripe webhook path.
    const contact = await createContact(deps, sanitizeContactInput(body));
    log.info?.('contact.created', { id: contact.id });
    return json({ id: contact.id, ghl_contact_id: contact.ghl_contact_id }, 201);
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: 40 passing, 0 failing. The pre-existing `email_required` and tier tests must still pass.

- [ ] **Step 5: Commit**

```
git add functions/lib/handlers.js test/handlers.test.js
git commit -m "feat(contacts): honeypot and email validation on the public endpoint"
```

---

## Task 6: contact_inquiries ledger

**Files:**
- Modify: `functions/lib/contacts.js`, `functions/lib/supabase.js`, `test/helpers/fake-db.js`, `test/contacts.test.js`

**Interfaces:**
- Consumes: sanitized input from Task 5 (`source`, `notes` are always present, possibly `null`).
- Produces: db port method `insertContactInquiry({ contact_id, source, notes }) => row`. `createContact` appends exactly one inquiry row per successful call.

- [ ] **Step 1: Extend the fake DB**

In `test/helpers/fake-db.js`, add `const contactInquiries = [];` next to the other arrays, add `notes` to `insertContact`, and add the new method. The `insertContact` line becomes:

```js
    async insertContact({ email, full_name, phone, tier, source, notes }) {
      const c = { id: id('c'), email, full_name, phone, tier, source, notes: notes ?? null, ghl_contact_id: null, created_at: nowIso() };
      contacts.push(c);
      return c;
    },
```

And add these two members to the returned object:

```js
    async insertContactInquiry({ contact_id, source, notes }) {
      const row = { id: id('ci'), contact_id, source, notes: notes ?? null, created_at: nowIso() };
      contactInquiries.push(row);
      return row;
    },
    _inquiries: contactInquiries,
```

`_inquiries` is a test-only accessor on the fake, not on the production adapter.

- [ ] **Step 2: Write the failing tests**

Add to `test/contacts.test.js`:

```js
test('createContact appends an inquiry row for a brand-new contact', async () => {
  const db = createFakeDb();
  const ghl = fakeGhl();

  await createContact({ db, ghl }, {
    email: 'a@x.com', full_name: 'A', phone: '1', tier: 'free',
    source: 'web_sponsor', notes: 'Interested in Hole in One',
  });

  assert.equal(db._inquiries.length, 1);
  assert.equal(db._inquiries[0].source, 'web_sponsor');
  assert.equal(db._inquiries[0].notes, 'Interested in Hole in One');
});

test('createContact appends a second inquiry for a repeat submission without duplicating the contact', async () => {
  const db = createFakeDb();
  const ghl = fakeGhl();

  const first = await createContact({ db, ghl }, {
    email: 'a@x.com', tier: 'free', source: 'web_free_profile', notes: null,
  });
  const second = await createContact({ db, ghl }, {
    email: 'a@x.com', tier: 'free', source: 'web_sponsor', notes: 'Now interested in sponsoring',
  });

  assert.equal(second.id, first.id, 'must not create a second contact');
  assert.equal(ghl.calls.length, 1, 'must not re-push to GHL');
  assert.equal(db._inquiries.length, 2, 'both inquiries must be recorded');
  assert.equal(db._inquiries[1].source, 'web_sponsor');
  assert.equal(db._inquiries[1].contact_id, first.id);
});

test('createContact stores the first-touch note on the contact row', async () => {
  const db = createFakeDb();
  const ghl = fakeGhl();

  const c = await createContact({ db, ghl }, {
    email: 'a@x.com', tier: 'free', source: 'web_lessons', notes: 'First message',
  });

  assert.equal(c.notes, 'First message');
});

test('createContact records no inquiry when the email is missing', async () => {
  const db = createFakeDb();
  const ghl = fakeGhl();

  await assert.rejects(() => createContact({ db, ghl }, { email: '' }), /email is required/);
  assert.equal(db._inquiries.length, 0);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `db.insertContactInquiry is not a function` is NOT the error (the fake has it); the failures are `_inquiries.length` being 0 because `createContact` never appends.

- [ ] **Step 4: Rewrite `functions/lib/contacts.js`**

Replace the whole file with:

```js
import { assertPresent } from './idempotency.js';

export async function createContact({ db, ghl }, input) {
  assertPresent(input.email, 'email');

  const existing = await db.findContactByEmail(input.email);
  let contact;

  if (existing) {
    if (existing.ghl_contact_id) {
      contact = existing;
    } else {
      // Stranded contact: GHL push failed on a prior attempt. Re-push now.
      const ghlId = await ghl.upsertContact({
        email: existing.email,
        full_name: existing.full_name,
        phone: existing.phone,
      });
      contact = await db.setContactGhlId(existing.id, ghlId);
    }
  } else {
    const inserted = await db.insertContact({
      email: input.email,
      full_name: input.full_name ?? null,
      phone: input.phone ?? null,
      tier: input.tier ?? 'free',
      source: input.source ?? 'site',
      notes: input.notes ?? null,
    });

    const ghlId = await ghl.upsertContact({
      email: inserted.email,
      full_name: inserted.full_name,
      phone: inserted.phone,
    });

    contact = await db.setContactGhlId(inserted.id, ghlId);
  }

  // Append-only: every submission is a fact, including repeat ones from a
  // known email. Without this the warm leads (free profile now, sponsorship
  // later) would be silently dropped by the dedupe above.
  await db.insertContactInquiry({
    contact_id: contact.id,
    source: input.source ?? 'site',
    notes: input.notes ?? null,
  });

  return contact;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: 44 passing, 0 failing. All four pre-existing `createContact` tests still pass.

- [ ] **Step 6: Add the production adapter method**

In `functions/lib/supabase.js`, add this line to the returned object, immediately after `setContactGhlId`:

```js
    insertContactInquiry: (input) => one(sb.from('contact_inquiries').insert(input).select().single()),
```

- [ ] **Step 7: Verify the suite is still green**

Run: `npm test`
Expected: 44 passing, 0 failing.

- [ ] **Step 8: Commit**

```
git add functions/lib/contacts.js functions/lib/supabase.js test/helpers/fake-db.js test/contacts.test.js
git commit -m "feat(contacts): append every submission to the contact_inquiries ledger"
```

---

## Task 7: Capture form partial, progressive enhancement, /thanks

**Files:**
- Create: `src/_includes/partials/capture-form.njk`, `src/js/form.js`, `src/thanks.njk`
- Modify: `src/css/main.css`, `src/index.njk`

**Interfaces:**
- Consumes: `base.njk` (Task 3); `/api/contacts` behaviour (Tasks 5–6).
- Produces: a form partial included as
  `{% set formSource = "web_sponsor" %}{% set formHeading = "..." %}{% include "partials/capture-form.njk" %}`
  Valid `formSource` values are exactly the five in `ALLOWED_SOURCES`.

- [ ] **Step 1: Create `src/_includes/partials/capture-form.njk`**

`showNotes` is optional and defaults to false.

```njk
<form class="capture-form" data-capture-form id="join">
  <h2>{{ formHeading }}</h2>

  <input type="hidden" name="source" value="{{ formSource }}">

  <div class="field">
    <label for="cf-name-{{ formSource }}">Name</label>
    <input id="cf-name-{{ formSource }}" name="full_name" type="text"
           autocomplete="name" maxlength="120">
  </div>

  <div class="field">
    <label for="cf-email-{{ formSource }}">Email <span aria-hidden="true">*</span></label>
    <input id="cf-email-{{ formSource }}" name="email" type="email" required
           inputmode="email" autocomplete="email" maxlength="254">
  </div>

  <div class="field">
    <label for="cf-phone-{{ formSource }}">Phone</label>
    <input id="cf-phone-{{ formSource }}" name="phone" type="tel"
           inputmode="tel" autocomplete="tel" maxlength="40">
  </div>

  {% if showNotes %}
  <div class="field">
    <label for="cf-notes-{{ formSource }}">Tell us a little about what you're looking for</label>
    <textarea id="cf-notes-{{ formSource }}" name="notes" rows="4" maxlength="2000"></textarea>
  </div>
  {% endif %}

  <div class="hp-field" aria-hidden="true">
    <label for="cf-hp-{{ formSource }}">Company website</label>
    <input id="cf-hp-{{ formSource }}" name="company_website" type="text"
           tabindex="-1" autocomplete="off">
  </div>

  <button class="btn btn-primary" type="submit">Create free profile</button>
  <p class="form-error" data-form-error role="alert" hidden></p>
</form>
```

- [ ] **Step 2: Add form styles to the end of `src/css/main.css`**

```css
/* Forms */
.capture-form { max-width: var(--prose-max); display: grid; gap: var(--space-4); }
.field { display: grid; gap: var(--space-2); }
.field label { font-size: 0.875rem; font-weight: 600; }
.field input, .field textarea {
  font-family: var(--font-body);
  font-size: 16px;                      /* below 16px iOS Safari zooms on focus */
  min-height: var(--touch-min);
  padding: var(--space-3);
  background: var(--paper-raised);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  width: 100%;
}
.field textarea { min-height: 120px; }
.hp-field { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
.form-error { color: var(--error); font-size: 0.875rem; }
.form-error[hidden] { display: none; }
```

- [ ] **Step 3: Create `src/js/form.js`**

```js
(function () {
  var forms = document.querySelectorAll('[data-capture-form]');

  Array.prototype.forEach.call(forms, function (form) {
    var errorEl = form.querySelector('[data-form-error]');
    var button = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
      if (button) button.disabled = true;

      var data = {};
      var fd = new FormData(form);
      fd.forEach(function (value, key) { data[key] = value; });

      fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
        .then(function (res) {
          if (res.status === 201) { window.location.href = '/thanks/'; return; }
          return res.json().then(function (body) {
            throw new Error(body && body.error === 'invalid_email'
              ? 'That email address does not look right. Please check it and try again.'
              : 'Something went wrong. Please try again.');
          });
        })
        .catch(function (err) {
          if (button) button.disabled = false;
          if (errorEl) {
            errorEl.textContent = err.message || 'Something went wrong. Please try again.';
            errorEl.hidden = false;
          }
        });
    });
  });
})();
```

- [ ] **Step 4: Create `src/thanks.njk`**

```njk
---
layout: base.njk
title: You're in — PWRHaus Golf Society
description: Thanks for reaching out to PWRHaus Golf Society.
---
<section class="section">
  <div class="container">
    <p class="eyebrow">Confirmed</p>
    <h1>You're on the list.</h1>
    <p>We've got your details. Someone will be in touch shortly — and in the meantime,
       have a look at what's coming up.</p>
    <p><a class="btn btn-secondary" href="/events/">Browse events</a></p>
  </div>
</section>
```

- [ ] **Step 5: Add the form to the placeholder home page**

Append to `src/index.njk`:

```njk
<section class="section">
  <div class="container">
    {% set formSource = "web_free_profile" %}
    {% set formHeading = "Create your free profile" %}
    {% include "partials/capture-form.njk" %}
  </div>
</section>
```

- [ ] **Step 6: Build and verify the form renders**

Run: `npm run build`

Run: `Select-String -Path public/index.html -Pattern 'name="company_website"'`
Expected: one match — the honeypot is present.

Run: `Select-String -Path public/thanks/index.html -Pattern "You're on the list"`
Expected: one match.

- [ ] **Step 7: Commit**

```
git add src/
git commit -m "feat(site): capture form partial, progressive enhancement, thanks page"
```

---

## Task 8: Build-output guarantees

**Files:**
- Create: `test/build-output.test.js`

**Interfaces:**
- Consumes: the Eleventy build (Task 1) and the layout (Task 3).
- Produces: regression tests that fail if the credit is dropped, a shadow is introduced, or a page loses its single `h1`.

- [ ] **Step 1: Write the failing test**

Create `test/build-output.test.js`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

let outDir;

before(() => {
  outDir = mkdtempSync(join(tmpdir(), 'pwrhaus-build-'));
  execFileSync('npx', ['@11ty/eleventy', '--output=' + outDir], {
    stdio: 'pipe',
    shell: true,
  });
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

test('every built page carries the Framework & Co. credit', () => {
  const pages = htmlFiles(outDir);
  assert.ok(pages.length > 0, 'build produced no HTML');
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    assert.match(html, /Developed by Framework &amp; Co\./, `missing credit: ${page}`);
    assert.match(html, /https:\/\/www\.frameworkandco\.com/, `missing credit href: ${page}`);
  }
});

test('every built page has exactly one h1', () => {
  for (const page of htmlFiles(outDir)) {
    const html = readFileSync(page, 'utf8');
    const count = (html.match(/<h1[\s>]/g) || []).length;
    assert.equal(count, 1, `expected exactly one h1 in ${page}, found ${count}`);
  }
});

test('every built page declares a viewport and a lang attribute', () => {
  for (const page of htmlFiles(outDir)) {
    const html = readFileSync(page, 'utf8');
    assert.match(html, /<html lang="en">/, `missing lang: ${page}`);
    assert.match(html, /name="viewport"/, `missing viewport: ${page}`);
  }
});

test('the stylesheet contains no box-shadow and no max-width media queries', () => {
  const css = readFileSync('src/css/main.css', 'utf8');
  assert.equal(/box-shadow/.test(css), false, 'box-shadow is banned by the design system');
  assert.equal(/@media[^{]*max-width/.test(css), false, 'CSS must be mobile-first: min-width only');
});

test('the stylesheet never uses the decorative brass token for text colour', () => {
  const css = readFileSync('src/css/main.css', 'utf8');
  assert.equal(
    /color:\s*var\(--brass\)/.test(css),
    false,
    '--brass fails AA on paper; use --brass-text for text',
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Temporarily delete the credit line from `src/_includes/partials/footer.njk`, then run:

Run: `npm test`
Expected: FAIL — "missing credit".

Restore the line, then continue.

- [ ] **Step 3: Run the test to verify it passes**

Run: `npm test`
Expected: 49 passing, 0 failing.

- [ ] **Step 4: Commit**

```
git add test/build-output.test.js
git commit -m "test(site): assert credit, single h1, and design-system rules in build output"
```

---

## Manual verification before handoff

Not automatable — run these by hand once Task 8 is green.

- [ ] `npm run dev`, then check every width in the spec's matrix: **320, 375, 390, 768, 820, 1024, 1280, 1440**. No horizontal scroll on the body at any of them.
- [ ] At 375px: tap the menu toggle. The overlay opens, `Tab` cycles only inside it, `Esc` closes it, and focus returns to the toggle.
- [ ] At 1024px and above: the overlay is gone, the horizontal nav and CTA button are visible.
- [ ] Keyboard-only pass on the home page: the skip link appears on first `Tab`, and every interactive element shows the brass focus ring.
- [ ] On a real iPhone (or Safari responsive mode): tap the email field. **The page must not zoom.**
- [ ] Submit the form with a bad email — the inline error appears and the button re-enables.
- [ ] Submit the form with a good email — lands on `/thanks/`. Confirm in Supabase that one `contacts` row and one `contact_inquiries` row were written, and that the contact has a `ghl_contact_id`.
- [ ] Submit again with the **same** email and a different source — confirm no second `contacts` row, and a **second** `contact_inquiries` row.

---

## Plan self-review

**Spec coverage:** §3 IA — partially, by design: B1 builds the layout and `/thanks`; the seven content pages are Plan B2. §4 tokens — Task 2, verbatim. §4 fonts — Task 2. §4 components/focus/motion — Task 3. §4 breakpoints and nav — Task 3. §4 touch/input rules — Tasks 3 and 7. §4 footer credit — Task 3, enforced by Task 8. §5 events — B2. §6 forms and sources — Task 7. §6 hardening items 2–5 — Tasks 4 and 5; item 1 already landed in `f86ac71`. §6 repeat submissions — Task 6. §7 schema — applied; adapter in Task 6. §8 build/deploy — Task 1. §9 automated tests — Tasks 4–6, 8; responsive matrix — manual section. §4 image rules and performance budget — B2, where images first appear.

**Placeholder scan:** none. Every code step carries complete code; every command states its expected output.

**Type consistency:** `sanitizeContactInput` returns `{ email, full_name, phone, notes, source, tier }` in Task 4 and is consumed with exactly those keys in Tasks 5 and 6. `insertContactInquiry({ contact_id, source, notes })` is defined identically in the fake (Task 6 Step 1), called identically in `contacts.js` (Step 4), and implemented identically in the adapter (Step 6). `formSource` values match `ALLOWED_SOURCES` exactly.

**Known gap, stated deliberately:** there is still no rate limiting. See spec §6.
