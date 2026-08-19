# PWRHaus — Michelle's Dashboard (Phase 1: Events) Design Spec

**Date:** 2026-08-19
**Author:** Oz (developer) · with Claude Code
**Status:** DRAFT for review. No implementation until approved.
**Relationship to other docs:**
- Implements the "premium, on-brand, mobile-first dashboard" goal and **replaces** the
  Sveltia CMS approach for events (Codex's `src/admin/`, spec `2026-08-15-sveltia-cms-for-michelle-design.md`).
- Phase 1 of a larger **PWRHaus command center** (future phases: all site content + a CRM/data
  overview reading Supabase). This spec covers **Phase 1 = the events dashboard + its foundation**.
- Adopts the **house dashboard pattern** used across the owner's other client sites
  (Treeman, Anahit Bakery, La Cocinita de Vanessa): a bespoke single-page admin in plain
  HTML/CSS/JS inside the static Netlify site, Supabase Auth email+password, browser-direct
  Supabase reads/writes guarded by RLS, secrets in Netlify Functions.

---

## 1 · Why this exists

The current CMS (Sveltia) is GitHub-OAuth login → edit a git file → wait for a rebuild, with a
generic, un-branded UI. Michelle should instead log into **her own premium, branded dashboard**
with an email + password from her phone or laptop, manage her events, and see them go live — a
tool she feels good using. This spec builds that, matching the established house pattern, and lays
the Supabase + auth + shell **foundation** that later phases (full site content, CRM overview)
extend.

**Phase 1 goal:** Michelle logs in and fully manages her events (create/edit/publish/reorder/
image-upload) and the events-page hero copy, from any device, with changes live in ~30–60s and
full SEO preserved.

---

## 2 · Decisions locked (brainstorm)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Bespoke `admin/` SPA** (plain HTML/CSS/vanilla JS, no build) inside this repo, at `/admin/` | Matches the house pattern; no framework/build; deploys with the site |
| D2 | **Supabase is the source of truth** for events + editable page content | Instant dashboard, house-pattern data model; links to existing `orders`/`tickets` |
| D3 | **SEO-preserving publish** — dashboard writes Supabase instantly; on save a Netlify **build hook** rebuilds the static site (~30–60s) | Keeps event pages server-rendered with JSON-LD/meta; owner invested in SEO |
| D4 | **Supabase Auth email+password**; only Michelle has an account → *authenticated = admin* | Simplest secure model (Treeman's `auth-any-user`); no GitHub account for her |
| D5 | **Retire Sveltia** (`src/admin/` + GitHub OAuth) | Replaced by the bespoke dashboard |
| D6 | Brand the dashboard from a `:root` token block in **PWRHaus colors + fonts** (forest/cream/brass, Fraunces + Work Sans) | Feels like *her* brand, not a stock admin |

---

## 3 · Architecture

```
Michelle (phone/laptop)
   │  email+password (Supabase Auth)
   ▼
/admin/  bespoke SPA ──(supabase-js, anon key + her session)──►  Supabase
   │   read/write events + site_content, upload images to Storage   (RLS-guarded)
   │
   └─ on Save ──► POST /api/publish (Netlify Function, authed) ──► Netlify Build Hook
                                                                        │
Public static site (Eleventy)  ◄── build reads Supabase (published) ────┘
   src/_data/events.js  +  src/_data/siteContent.js   (build-time fetch)
```

- The **dashboard** is live/instant (browser ↔ Supabase).
- The **public site** stays static and SEO-strong: Eleventy fetches published events + page
  content from Supabase **at build time** (same pattern as `src/_data/products.js` for Printify),
  and a save triggers a rebuild via the build hook.
- Anything secret (the build-hook URL) lives in a **Netlify Function**, never in the browser.

---

## 4 · Data model

### 4.1 `events` table (extend existing `0001_init.sql`)
New migration `supabase/migrations/0003_events_cms.sql` adds the CMS fields the table lacks:

```sql
alter table events add column slug text unique;
alter table events add column venue text;
alter table events add column summary text;
alter table events add column body text;
alter table events add column image text;             -- Storage public URL
alter table events add column image_alt text;
alter table events add column registration_url text;
alter table events add column sort_order int not null default 0;
alter table events add column updated_at timestamptz not null default now();
```

(Existing columns kept: `id`, `name`, `city`, `capacity`, `price_cents`, `currency`, `starts_at`,
`published`.) A one-time **seed** migrates current `src/_data/events.json` rows into the table so
nothing is lost; then `events.json` is removed as a source.

### 4.2 `site_content` table (editable page content)
```sql
create table site_content (
  key        text primary key,        -- e.g. 'events_page'
  value      jsonb not null,          -- { eventsHero: { eyebrow, heading, lead, video, poster } }
  updated_at timestamptz not null default now()
);
```
Phase 1 uses key `events_page` (the events-page hero). Extensible to all pages in a later phase.

### 4.3 Storage
A public-read Storage bucket `event-media`; dashboard uploads event images, saves the public URL
into `events.image`.

---

## 5 · Auth & RLS

- **Supabase Auth**, email + password. Michelle's account is created by **invite** (owner action;
  agents cannot create accounts). Password recovery flow included (`resetPasswordForEmail` +
  set-new-password panel, per La Cocinita).
- **RLS** (only Michelle has an account, so authenticated = admin):
  - `events`: `select` allowed to **anon** only where `published = true`; **all** operations
    (incl. reading drafts, insert/update/delete) allowed to **authenticated**.
  - `site_content`: `select` to anon; write to authenticated.
  - Storage `event-media`: public read; authenticated write.
- The **build** reads published rows with the anon key (RLS-safe) — no service key in the build.
- Dashboard uses the **anon key** (public, safe in browser) + the authenticated session.

---

## 6 · Public-site integration (SEO-preserving)

- New `src/_data/events.js`: build-time fetch of the Supabase `events` table (published only for
  render; the events page + generated `/events/<slug>/` detail pages come from this). Replaces the
  static `events.json`. Falls back to `[]` if Supabase env is absent (build still succeeds, like
  `products.js`).
- New `src/_data/siteContent.js`: build-time fetch of `site_content` (merged with sensible
  defaults) so the events-page hero renders from Supabase.
- **Publish path:** `functions/publish.js` (Netlify Function, path `/api/publish`) — requires a
  valid Supabase session (verify the JWT), then POSTs the **Netlify build hook** (`NETLIFY_BUILD_HOOK`
  env, server-side only). The dashboard calls it after a successful save; UI shows
  "Publishing… live in ~30s".

---

## 7 · UX & design

**Tokens/fonts:** a `:root` block in PWRHaus brand — forest/cream/brass, Fraunces (display +
numbers), Work Sans (UI). Self-hosted fonts reused from the site.

**Login:** full-screen forest→forest-deep gradient + soft glow; centered cream card; PH monogram;
email + password; "Forgot password?" recovery.

**App shell:**
- Desktop: left **forest sidebar** (PH logo; nav: Dashboard · Events · *Site Content* · *CRM* ·
  Settings — later items visible-but-disabled) + cream/white workspace + top account menu.
- Mobile: **bottom nav bar** (thumb-reachable) + slim top bar (logo + account). Mobile-first.
- Installable **PWA** (manifest + icons) so it lives on her home screen.

**Events view:**
- **Stat row** from real data: Upcoming · Published · Draft · (Registrations — from `tickets`/
  `orders`, shows "—" until ticketing lands).
- Events as **cards** (image thumb, name, date, city, published/draft badge) with actions:
  publish toggle, edit, duplicate, delete, and **drag-to-reorder** (writes `sort_order`).
- Create/edit in a **slide-over drawer**: name, slug (auto from name, editable), city, venue,
  date/time, price, capacity, summary, body, registration URL, **image upload from device** with
  live preview + alt text, published toggle. Client + server validation.
- **Page settings** panel edits the events-page hero (`site_content.events_page`).

**Polish (the "premium" bar):** skeleton loaders, friendly empty states, toast on save, the
"Publishing… live in ~30s" indicator, restrained motion, keyboard-accessible, 44px touch targets.

---

## 8 · Config / env (Netlify, per context)

Existing: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. **New:** `SUPABASE_ANON_KEY` (browser +
build reads), `NETLIFY_BUILD_HOOK` (server-side, in `functions/publish.js` only). No secrets in
the repo or the browser beyond the anon key (which is public by design).

---

## 9 · Testing

- `src/_data/events.js` / `siteContent.js`: build reads Supabase; empty/fallback when env absent
  (so the existing build-output tests stay green).
- `functions/publish.js`: rejects unauthenticated calls; triggers the hook exactly once on a valid
  session; no build-hook URL leaks to the client.
- Event page generation still passes existing tests (one `<h1>`, non-empty alts, canonical/OG,
  nav-resolves) sourced from Supabase instead of `events.json`.
- Manual: login → CRUD an event → upload image → publish → rebuild → live; recovery flow; mobile
  bottom-nav + drawer; RLS (anon cannot read drafts or write).
- `npm test` stays green.

---

## 10 · Migration / cutover

1. Apply `0003_events_cms.sql` + seed current `events.json` rows into Supabase (dev first).
2. Add `src/_data/events.js` + `siteContent.js`; delete `events.json`/`siteContent.json` as sources
   (keep git history).
3. Build the `admin/` dashboard; remove Sveltia `src/admin/` + GitHub OAuth app usage.
4. Create Michelle's Supabase Auth account (owner) + Netlify build hook; set env vars.
5. Verify end-to-end on a Netlify deploy preview before production.

---

## 11 · Out of scope (this phase)

- **Site-content management beyond the events-page hero** (membership/lessons/corporate copy,
  gallery) — future phase, same foundation.
- **CRM / data overview** (contacts, inquiries, orders, members, revenue read from Supabase) —
  future phase; the stat row here is the seed of it.
- Multi-user roles / permissions (only Michelle has an account).
- Editing merch/products (that's the Printify-driven `poc/merch` flow).

---

## 12 · Open items

1. **Michelle's Supabase Auth account** — owner invites her / she sets a password (agents can't
   create accounts).
2. **Netlify build hook** — create it, store as `NETLIFY_BUILD_HOOK`.
3. Confirm the **events field set** is complete (any field Michelle wants that's not listed?).
4. Confirm **which Supabase project** (dev vs prod) and that migrations can be applied there.
5. **Branch:** implement on a feature branch (e.g. `feat/michelle-dashboard`), not directly on
   `main`; it's a multi-file change and touches the events data source.
