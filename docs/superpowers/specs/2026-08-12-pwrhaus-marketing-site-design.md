# PWRHaus — Public Marketing Site (Plan B) Design Spec

**Date:** 2026-08-12
**Author:** Oz (developer) · with Claude Code
**Requirements source of truth:** `docs/pwrhaus-scope-session.md`
**Supersedes nothing.** Builds on `docs/superpowers/specs/2026-08-11-pwrhaus-phase1-design.md` §4.1.
**Status:** Design approved in brainstorm. Ready for implementation planning.

---

## 1 · What this is

The public-facing PWRHaus site that replaces Wix. It repositions the organization as one
co-ed deal-making society (chapters framing removed), puts pricing on-site, and converts
strangers into captured contacts.

It ships **without auth, without checkout, and without a member portal** — those are Plan C
and Plan D. Every conversion affordance on this site resolves to free-profile capture,
which is what makes it shippable independently.

**The job to be done:** the scope session names the free profile as "probably the single
highest-leverage change on the whole site" (§5), and the 90-day goal is 33 → 63 members
(§8). Every page is measured against whether it produces a captured contact.

---

## 2 · Decisions locked in this brainstorm

| # | Decision | Rationale |
|---|---|---|
| D1 | CTAs write **live** to the existing `/api/contacts` | The backbone is built and smoke-tested; a stubbed CTA would ship a site whose most valuable behavior is fake |
| D2 | Events live in **`src/_data/events.json`** | No backend dependency on the highest-traffic page; it is the exact file a git-based CMS edits in Phase 2 |
| D3 | Site sells **five** things: membership, events, lessons, sponsorship, corporate | Lessons and scrambles are the growing lines; sponsorship is the largest stretch goal; the corporate simulator gig has zero site presence today |
| D4 | **Claude drafts all copy** in Michelle's voice; she edits | Her §1–§5 answers are already raw material in her own words; waiting blocks the build on someone with four questions outstanding |
| D5 | Visual direction: **Clubhouse Light** | Chosen from three hybrids; light grounds flatter the mixed-quality real event photography that actually exists |
| D6 | **Eleventy** static site generator | Explicitly approved by Oz as a deviation from the no-build-step convention. Seven pages share nav/footer; hand-written HTML means a seven-file edit per menu change |
| D7 | **F&Co footer credit ships** | Oz override, 2026-08-12. The house *design system* stays deferred; the credit does not travel with it |
| D8 | **`contact_inquiries` append-only ledger** | `createContact` dedupes on email and drops repeat submissions; the repeat ones are the warm leads |

---

## 3 · Information architecture

| Path | Job | Primary CTA `source` |
|---|---|---|
| `/` | Convert stranger → free profile | `web_free_profile` |
| `/about` | Co-ed repositioning + founding story | `web_free_profile` |
| `/events` | Upcoming + past, from `events.json` | `web_event_interest` |
| `/events/<slug>` | One event, generated per entry | `web_event_interest` |
| `/membership` | Pricing on-site: Free / $650 / Inner Circle | `web_free_profile` |
| `/lessons` | The growing revenue line | `web_lessons` |
| `/sponsors` | Tiers named, deliverables generic | `web_sponsor` |
| `/corporate` | Golf-simulator experience | `web_corporate` |
| `/thanks` | Post-submit confirmation | — |
| `/404` | Not found | — |

**Chapters framing appears nowhere.** Cities appear only as event locations (Fort Lauderdale,
Miami). No Boca Raton or New York placeholders — per §6, "no longer positioning as chapters."

**Men are explicitly welcomed** in `/about` and `/membership` copy, per §1.

---

## 4 · Design tokens — FINAL. Implement exactly. Do not substitute.

```css
:root {
  /* Ground */
  --paper:        #FAF8F3;   /* page background */
  --paper-raised: #FFFFFF;   /* cards, inputs */

  /* Text */
  --ink:          #14201A;
  --ink-muted:    #55645B;

  /* Brand */
  --forest:       #1A4D36;   /* primary action */
  --forest-deep:  #123527;   /* hover */
  --brass:        #B8912A;   /* rules, underlines, decorative ONLY - 2.9:1 on paper */
  --brass-text:   #7D6218;   /* brass-coloured TEXT - 5.9:1 on paper, passes AA */
  --line:         #E6E1D6;

  /* Type */
  --font-display: "Fraunces", Georgia, serif;
  --font-body:    "Work Sans", system-ui, sans-serif;

  /* Spacing (8px scale) */
  --space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
  --space-5: 24px;  --space-6: 32px;  --space-7: 48px;  --space-8: 64px;
  --space-9: 96px;  --space-10: 128px;

  /* Section rhythm, mobile-first */
  --space-section-sm: 56px;  /* base / phone */
  --space-section-md: 80px;  /* >= 768px  */
  --space-section-lg: 96px;  /* >= 1024px */

  /* Breakpoints are 768px / 1024px / 1280px, min-width only, never mixed
     with max-width. They are deliberately NOT custom properties: CSS custom
     properties cannot be used in media query conditions, so
     `@media (min-width: var(--bp-md))` does not work. Write the literals. */

  --content-max: 1120px;
  --prose-max:   680px;
  --gutter:      24px;   /* 16px base, 20px at --bp-md, 24px at --bp-lg */
  --radius-card: 4px;
  --radius-pill: 999px;

  /* Minimum interactive target - never go below this */
  --touch-min:   44px;
}
```

**Never use `--brass` for text.** It fails AA at every size below 24px. The two-token split
exists because a designer reaching for a 12px brass eyebrow is the predictable failure.

### Font loading

Self-hosted `woff2` variable fonts in `src/fonts/`. No CDN — the client's site must not
depend on a third party staying up.

```
src/fonts/fraunces-variable.woff2    (axes: opsz, wght; WONK 0, SOFT 0)
src/fonts/work-sans-variable.woff2   (axis: wght)
```

- `@font-face` with `font-display: swap` and `font-weight: 100 900`
- Both preloaded in `<head>` via `<link rel="preload" as="font" type="font/woff2" crossorigin>`
- Fraunces pinned to `font-variation-settings: "SOFT" 0, "WONK" 0`
- Both are SIL OFL licensed. Ship the license file at `src/fonts/OFL.txt`.
- **Approved swap** if Michelle rejects Fraunces: Source Serif 4, no other change.

### Type scale

| Role | Size | Line-height | Tracking | Family |
|---|---|---|---|---|
| display-xl | `clamp(2.25rem, 5vw, 3.5rem)` | 1.05 | -0.02em | display |
| display-l | 2.5rem / 40px | 1.10 | -0.02em | display |
| h2 | 2rem / 32px | 1.15 | -0.015em | display |
| h3 | 1.375rem / 22px | 1.25 | -0.01em | display |
| body-l | 1.125rem / 18px | 1.60 | 0 | body |
| body | 1rem / 16px | 1.65 | 0 | body |
| small | 0.875rem / 14px | 1.50 | 0 | body |
| eyebrow | 0.75rem / 12px | 1.40 | 0.16em | body, 700, uppercase, color `--brass-text` |

### Components

- **Primary button** — `--forest` fill, `--paper` text, `--radius-pill`, padding `14px 28px`,
  weight 600, 16px. Hover `--forest-deep`, `transition: background-color 160ms ease-out`.
- **Secondary button** — transparent, `--forest` text, 2px `--brass` bottom border, no radius.
- **Card** — `--paper-raised`, `--radius-card`, `1px solid --line`. **No box-shadow anywhere
  in the stylesheet.**
- **Focus ring** — `2px solid --brass`, `outline-offset: 2px`, on every focusable element.
- **Motion** — 160ms hovers, 240ms reveals, no parallax. All transitions wrapped in
  `@media (prefers-reduced-motion: no-preference)`.

### Section layout shapes (named, per page)

Do not repeat the same shape three times running.

| Page | Section shapes, in order |
|---|---|
| `/` | full-bleed hero (`min-height: 60vh` desktop, `auto` below 768px — never 100vh) → two-column story split → horizontal 3-item value list → event teaser (2-up cards) → single-column CTA band |
| `/about` | narrow prose hero → two-column founding-story split → full-width photo → stacked list of what members get |
| `/events` | short hero → card grid in two labelled groups, **Upcoming** then **Past** (client-sorted, see §5) → single-column CTA band |
| `/events/<slug>` | event header (two-column: details left, image right) → prose body → inline interest form |
| `/membership` | short hero → three-column pricing table → stacked FAQ list → CTA band |
| `/lessons` | two-column hero → horizontal 3-step list → inline form |
| `/sponsors` | short hero → three-column tier cards → single-column prose → inline form |
| `/corporate` | two-column hero → prose → inline form |
| `/thanks`, `/404` | shared layout, single-column, centered, `--space-section-lg` top and bottom, no form |

### Breakpoints & grid — mobile-first

CSS is authored **mobile-first**: base rules target the smallest screen, and every media
query is `min-width`. No `max-width` queries — mixing both is how spacing rules end up
cancelling each other out.

| Token | Width | Target | Columns | Gutter | Page padding |
|---|---|---|---|---|---|
| (base) | 320–767px | Phone | 4 | 16px | 20px |
| `--bp-md` | 768px | Tablet portrait | 8 | 20px | 32px |
| `--bp-lg` | 1024px | Tablet landscape / small laptop | 12 | 24px | 40px |
| `--bp-xl` | 1280px | Desktop | 12 | 24px | centered at `--content-max` 1120px |

Section rhythm by breakpoint: **56px** base → **80px** at `--bp-md` → **96px** at `--bp-lg`.
(`--space-section-sm` / `-md` / `-lg` respectively.)

**The page must never scroll horizontally at any width from 320px up.** Any element that can
overflow — tables, pricing rows, long unbroken strings — is wrapped in its own
`overflow-x: auto` container rather than allowed to widen the body.

### Responsive collapse, per section shape

Named explicitly so nothing is left to interpretation.

| Desktop shape | At `--bp-md` (tablet) | Base (phone) |
|---|---|---|
| Two-column split | stays 2-col, 50/50 | stacks; image first, text second |
| Three-column pricing | 3-col | stacks vertically, full width, `--space-5` between |
| Three-column tier cards | 2-col, third wraps | stacks |
| Horizontal 3-item list | 3-col | stacks, left-aligned, no centering |
| Event card grid | 2-up | 1-up, full width |
| Event teaser (2-up) | 2-up | 1-up, shows only the next event |
| Event header (details + image) | stacks: image, then details | same |
| Full-bleed hero | `min-height: 60vh` | `min-height: auto`, `--space-section-md` vertical padding |
| Footer | 3-col | stacks, credit last |

### Navigation

Six destinations plus a CTA is too many for a phone bar.

- **`--bp-lg` and up:** horizontal nav — Events · Membership · Lessons · Sponsors · Corporate ·
  About — with the primary CTA button right-aligned.
- **Below `--bp-lg`:** a toggle button (44×44px minimum) opens a full-screen overlay panel.
  Panel items are 18px, `--space-4` vertical padding each. Focus is trapped inside the panel
  while open, `Esc` closes it, and focus returns to the toggle. Body scroll locks while open.
- The header is **not sticky** on phones — it costs vertical space on the surface that has
  least of it.

### Touch and input

- **Minimum touch target 44×44 CSS px** for every interactive element, including nav toggle,
  buttons, and form controls. Spacing between adjacent targets ≥ 8px.
- **Form inputs are 16px minimum font-size.** Below 16px, iOS Safari zooms the viewport on
  focus and the user lands on a scrolled, misaligned page. This is not a preference.
- Inputs carry correct mobile keyboard hints: `type="email" inputmode="email"
  autocomplete="email"`, `type="tel" inputmode="tel" autocomplete="tel"`,
  `autocomplete="name"`. The honeypot gets `tabindex="-1"`, `autocomplete="off"`, and is
  hidden from assistive tech.
- On phones only, a **sticky bottom CTA bar** ("Create free profile") appears after the user
  scrolls past the hero. Height 64px plus `env(safe-area-inset-bottom)` so it clears the home
  indicator on notched devices. It is the site's stated job on the surface most people use.

### Images

Every content image must specify all of the following, or it will cause layout shift:

- explicit `width` and `height` attributes, plus a CSS `aspect-ratio` (16/9 for event and hero
  images, 4/3 for portraits)
- `srcset` at **480 / 768 / 1200 / 1600px** widths with a matching `sizes` attribute
- `loading="lazy"` and `decoding="async"` on everything below the fold; the hero image is
  `loading="eager"` with `fetchpriority="high"` and is preloaded
- AVIF with WebP fallback, JPEG as last resort
- `object-fit: cover` with a defined focal point so crops don't decapitate people

### Performance budget

Michelle's audience arrives on phones, often on cellular. Targets, measured on a simulated
4G connection:

- **LCP < 2.5s**, **CLS < 0.1**, **INP < 200ms**
- Hero image ≤ 200KB after compression; any single image ≤ 300KB
- Total JS ≤ 15KB minified — there is no framework, so this is only form enhancement, the
  event sort, and the nav toggle
- Fonts: 2 woff2 files, both preloaded, both subset to Latin

### Footer

Present on all pages via the shared layout:

```html
<a href="https://www.frameworkandco.com" rel="noopener">Developed by Framework &amp; Co.</a>
```

Styled `--ink-muted`, 14px, `--font-body`, no underline until hover, hover `--forest`,
no accent color.

---

## 5 · Event data

`src/_data/events.json` — array of objects:

```json
{
  "slug": "fall-scramble-ftl",
  "name": "Fall Scramble",
  "city": "Fort Lauderdale",
  "venue": "TPC Eagle Trace",
  "starts_at": "2026-09-18T13:00:00-04:00",
  "price_cents": 15000,
  "capacity": 40,
  "summary": "One-line teaser used on cards.",
  "body": "Multi-paragraph description.",
  "image": "/img/events/fall-scramble-ftl.jpg",
  "published": true,
  "registration_url": null
}
```

- `published: false` entries are excluded from the build entirely.
- `registration_url` is an **optional external link**, default `null`. When set, the event CTA
  is a link out to that URL (a third-party or interim registration page); when `null`, the CTA
  is the interest form. Note that Wix is decommissioned at go-live, so this will normally be
  `null`. Native checkout is Plan D and out of scope here.
- Eleventy pagination generates one page per entry at `/events/<slug>`.
- `price_cents` is an integer, consistent with the backbone's money rule. Rendered as
  `$150` via a filter — never stored as a float.

**Upcoming vs. past is computed client-side, not at build time.** All published events render
into the HTML with a machine-readable `datetime` attribute; a small script sorts them and
labels past ones on load. Build-time splitting would silently rot — Michelle touches the site
monthly, events are planned a year ahead, and an event would sit under "Upcoming" for weeks
after it happened. Server-rendered content keeps SEO; client-side labelling keeps correctness
independent of deploy timing.

---

## 6 · Lead capture

All five forms POST JSON to the existing `/api/contacts`:

```
{ full_name, email, phone, notes, source, company_website }
```

`company_website` is the honeypot and is never persisted.

### Allowed `source` slugs (whitelist)

`web_free_profile` · `web_event_interest` · `web_lessons` · `web_sponsor` · `web_corporate`

Anything else falls back to `site`. For event interest, `notes` is auto-prefixed
`Event: <slug>` so the specific event is recoverable without unbounded source slugs.

### Endpoint hardening (changes to existing code)

1. ✅ **DONE 2026-08-12 — already on `main`, ahead of this plan.** `tier` is never read from
   the request body; the handler forces `tier: 'free'`. Paid tiers are written only by the
   signature-verified Stripe webhook path. *This closed a privilege escalation: a public POST
   could previously self-assign `member` or `inner_circle`.* Covered by
   `test/handlers.test.js` → "ignores a client-supplied tier and forces free".
   **The implementation plan should not redo this.**
2. **`source` whitelisted** against the list above; unknown values → `site`.
3. **Email format validated**, max 254 chars → `400 invalid_email`.
4. **Honeypot**: if `company_website` is non-empty, return `201` with a synthetic id — a
   freshly generated, never-persisted UUID matching the shape of a real response — and write
   nothing to either Supabase or GHL. Returning `400` would teach a bot to retry differently.
5. **Length caps**: `full_name` ≤ 120, `phone` ≤ 40, `notes` ≤ 2000. Truncate, don't reject.

### Repeat submissions

`createContact` dedupes on email. It is extended so that **every** submission — new contact
or existing — appends a row to `contact_inquiries`. The `contacts` row is still created only
once; `contacts.notes` holds the first-touch message only.

### Known limitation — stated, not solved

There is **no rate limiting**. Netlify Functions offer no free primitive for it, and an
in-memory counter is meaningless across serverless invocations; doing it properly requires a
shared store. The honeypot plus validation stops commodity bots. A determined attacker could
still flood `contacts`. Revisit before go-live if abuse appears.

---

## 7 · Schema changes

`supabase/migrations/0002_contact_notes.sql` — **applied to `pwrhaus-dev` 2026-08-12**.
Still to be applied to production at go-live, alongside `0001_init.sql`.

```sql
alter table contacts add column notes text;

create table contact_inquiries (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references contacts(id),
  source      text not null,
  notes       text,
  created_at  timestamptz not null default now()
);

create index on contact_inquiries (contact_id);
```

Apply to `pwrhaus-dev` via the Supabase SQL editor, as with `0001_init.sql`.

---

## 8 · Build & deploy

- Eleventy outputs to `public/`, which already matches `publish = "public"` in `netlify.toml`.
  Add `command = "npm run build"` to `[build]`; add `"build": "eleventy"` to package.json scripts.
- `public/` is gitignored as build output.
- Templates in `src/`, Nunjucks layouts. Nav and footer defined exactly once.
- **No client-side framework.** JS is limited to: progressive form enhancement, and the
  events upcoming/past sort.
- The site stays **dark on Netlify until after Aug 27** — DNS is not repointed from Wix.
  This is unchanged from the Phase 1 hard constraint.

### DNS cutover — Wix is the registrar (confirmed 2026-08-12)

This resolves the `docs/pwrhaus-scope-session.md` §0 blank. **Wix is both the registrar and
the current DNS host** (confirmed 2026-08-12).

Because Wix holds both roles there are two different cutover mechanisms, and they have
opposite risk profiles:

- **Change A/CNAME records inside Wix DNS** → governed by the record TTL, which you control.
  Propagates in minutes and rolls back in minutes. **Use this for the cutover.**
- **Delegate nameservers to Netlify DNS** → governed by the parent zone's NS TTL, typically
  24–48h and *not* under your control. Cleaner long-term, but far slower to reverse.

So: cut over by record change, confirm stable, and only then consider delegating nameservers
to Netlify as a separate, unhurried change. Doing the nameserver switch as the cutover would
trade a five-minute rollback for a two-day one.

**Cutover is a DNS record change, not a domain transfer.** In the Wix Domains area, repoint
at Netlify using the exact records shown in the Netlify dashboard (do not hardcode an apex IP
from memory — Netlify's can change). Minutes to apply, fully reversible.

**Ordered sequence:**

1. **24–48h before cutover:** lower TTL on the existing records to **300s**. Whatever the TTL
   is now is how long a rollback takes. This step is worthless if done on the day.
2. **After Aug 27:** repoint DNS to Netlify. Verify apex and `www` both resolve, and that TLS
   is issued before announcing.
3. **Then, and only then:** decide the domain's long-term home (below).

**Do not transfer the domain before go-live.** Transfers take 5–7 days, require an auth code,
and are blocked within 60 days of registration or a prior transfer. A transfer near the
Aug 21 / Aug 27 events risks a dark site during the two highest-stakes dates of the quarter.

**⚠ Conflicts with "Wix is decommissioned after go-live"** (Phase 1 spec §6). The domain is
registered at Wix, so cancelling the account endangers the domain — especially if it was
issued free with a Premium plan, where cancellation can affect the registration directly.
Two acceptable resolutions, to be chosen after cutover is stable:

- **Keep a minimal Wix account** for the domain only, cancelling the site plan. Zero effort;
  leaves the domain tied to an otherwise-abandoned vendor and easy to miss at renewal.
- **Transfer out** to a dedicated registrar (Cloudflare at cost, Porkbun, Namecheap) once the
  60-day window allows. Clean long-term ownership; a few days of work, done at low stakes.

Until this is settled, **the Wix account must not be cancelled**, regardless of what the
decommissioning step says.

---

## 9 · Testing & verification

**Automated** — existing `node --test` harness, no new framework:

- `tier` escalation rejected: POST with `tier: 'member'` produces a `free` contact
- unknown `source` falls back to `site`; each whitelisted slug passes through
- malformed emails → `400 invalid_email`
- honeypot filled → `201`, zero DB writes
- length caps truncate rather than reject
- repeat submission from a known email → no second `contacts` row, one new
  `contact_inquiries` row
- **the existing 29 tests stay green** — the handler change sits on a path they cover

**Build** — Eleventy builds clean; `events.json` yields exactly one page per published entry.

**Responsive verification** — every page checked at all of these widths, not just the extremes:

| Width | Represents |
|---|---|
| 320px | Smallest supported — iPhone SE 1st gen, and where overflow bugs surface first |
| 375px | iPhone SE / 13 mini |
| 390px | iPhone 14/15 — the most common single width |
| 768px | iPad portrait — the `--bp-md` boundary |
| 820px | iPad Air portrait |
| 1024px | iPad landscape — the `--bp-lg` boundary, and where the nav switches |
| 1280px | Laptop |
| 1440px+ | Desktop — confirm content stays centered at `--content-max` and does not sprawl |

At each width: no horizontal scroll on the body, no text clipped or overlapping, every touch
target ≥ 44×44px, and nothing relies on hover to be usable.

**Also verify** — the nav overlay traps focus and returns it to the toggle on close; form
inputs do not trigger iOS zoom on focus (16px minimum); the sticky mobile CTA clears the home
indicator via `env(safe-area-inset-bottom)`; images reserve space so CLS stays under 0.1.

**Manual, before handoff** — keyboard focus visible on every interactive element;
`prefers-reduced-motion` honored; heading order semantic; alt text meaningful; images below
the fold lazy-loaded; Lighthouse mobile run meets the §4 performance budget.

---

## 10 · Out of scope

Member portal, login, ticket checkout, member directory (Plan C / Plan D) · sponsor pipeline
automation (§4c blocked) · Inner Circle online flow · self-serve CMS (Phase 2, Sveltia/Decap
against `events.json`) · merch · unified BI dashboard.

---

## 11 · Open items

1. **§4c sponsor answers still blocked** (4 questions). `/sponsors` ships with tiers named and
   deliverables generic; it captures inquiries rather than closing them.
2. **Copy requires Michelle's sign-off before go-live.** Drafted in her voice, not authored
   by her.
3. **Event photography** — real event photos exist and are cleared for use, but they have not
   been collected, cropped, or optimized. Needed before `/events` and `/about` are finishable.
4. ✅ **`0002` applied to `pwrhaus-dev`** on 2026-08-12. Not yet applied to the production
   Supabase project, which remains pristine until go-live.
5. **Domain name, current DNS host, and current TTL not yet recorded.** Registrar is confirmed
   as Wix; the domain string itself appears nowhere in this repo. Needed before the TTL
   pre-drop in §8.
6. **Long-term domain ownership undecided** — keep a minimal Wix account, or transfer out
   post-cutover. See §8. Until decided, do not cancel Wix.
