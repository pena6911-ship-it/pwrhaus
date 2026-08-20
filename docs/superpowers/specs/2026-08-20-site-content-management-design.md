# PWRHaus Dashboard — Phase 2a: Site Content Management (Page Heroes) Design Spec

**Date:** 2026-08-20
**Status:** Approved design. Implementation plan next.
**Relationship to other docs:**
- Phase 2 of the **PWRHaus command center**, building on Phase 1 (events dashboard,
  `2026-08-19-michelle-dashboard-events-design.md`).
- Extends the existing dashboard **Site Content** view (which today edits only the events-page
  hero) to manage the **hero of every public page**.

---

## 1 · Goal

Let Michelle edit the **hero** (eyebrow, heading, lead, and — on photo pages — the background
image) of every public page from the dashboard, with changes live on the static site in ~30–60s
via the existing publish path. Scope is **page heroes only** (Phase 2a); deeper section/body
editing is a later phase. Hero **CTAs/buttons stay non-editable** (structural links).

**Pages in scope:** Home, Events (already partly done), Membership, Lessons, Corporate, Sponsors,
About. Out: 404, thanks, merch (POC).

**Per-page media rule:**
- **Image heroes** (Membership, Lessons, Corporate, Sponsors, About): text + **image upload** +
  focal-position.
- **Video heroes** (Home, Events): text + video/poster as **path fields** (no upload; the video
  stays). Matches what the current events form already does — no regression.

---

## 2 · Data model

`site_content` (existing: `key text pk`, `value jsonb`, `updated_at timestamptz`) — **no structural
migration**. One row per page:

| key | media type | hero fields |
|---|---|---|
| `home_page` | video | eyebrow, heading, lead, video, poster |
| `events_page` | video | eyebrow, heading, lead, video, poster |
| `membership_page` | image | eyebrow, heading, lead, image, position |
| `lessons_page` | image | eyebrow, heading, lead, image, position |
| `corporate_page` | image | eyebrow, heading, lead, image, position |
| `sponsors_page` | image | eyebrow, heading, lead, image, position |
| `about_page` | image | eyebrow, heading, lead, image, position |

**Uniform value shape** going forward:
```json
{ "hero": { "eyebrow": "...", "heading": "...", "lead": "...", "image": "/img/x.jpg", "position": "50% 55%" } }
```
Video pages carry `video` + `poster` instead of `image`/`position`.

**Existing `events_page` compatibility:** it currently stores `{ "eventsHero": {...} }`.
`siteContent.js` normalizes `value.hero ?? value.eventsHero` so the live row keeps working; the
dashboard writes the new `{ hero }` shape on the next save.

**Defaults / seed of record:** `data/siteContent.seed.json` expands from just `eventsHero` to a
default `hero` for **every** in-scope page — the current hardcoded copy verbatim. This is the
offline/CI fallback *and* the "current copy" the dashboard shows before any edit. Field values are
lifted exactly from today's templates (see §6 for the source values).

**Pre-seed migration** `supabase/migrations/0004_site_content_pages.sql`: `insert ... on conflict
(key) do nothing` a row per in-scope page with its default `{ hero }` value (same copy as the seed),
so the dashboard is pre-filled with current copy rather than blank-until-first-save. Idempotent and
safe to re-run. `events_page` is left untouched (its row already exists).

---

## 3 · Build integration

- **`src/_data/siteContent.js`** generalizes from "fetch `events_page`" to "fetch all in-scope page
  rows." For each page it merges the Supabase row's `hero` over the seed default `hero`, and returns:
  ```js
  { pages: { home: { hero }, events: { hero }, membership: { hero }, … },
    eventsHero: <pages.events.hero> }   // back-compat alias, see below
  ```
  - Reads Supabase when `SUPABASE_URL` + `SUPABASE_ANON_KEY` are present; otherwise returns the seed
    defaults (offline/CI builds render exactly the current copy). Same fallback discipline as the
    Phase 1 `events.js`.
  - Merge is per-field over defaults so a partial row never blanks a hero.
- **Page templates** change each `pageHero({...})` call from hardcoded strings to
  `siteContent.pages.<slug>.hero` fields. Example (home):
  ```njk
  {{ pageHero({
    eyebrow: siteContent.pages.home.hero.eyebrow,
    heading: siteContent.pages.home.hero.heading,
    lead:    siteContent.pages.home.hero.lead,
    video:   siteContent.pages.home.hero.video,
    poster:  siteContent.pages.home.hero.poster,
    actions: [ … ]        // CTAs stay hardcoded
  }) }}
  ```
  Image pages pass `image` + `position` instead of `video`/`poster`. `events.njk` switches from
  `siteContent.eventsHero` to `siteContent.pages.events.hero` (or keeps the alias — implementer's
  choice; the alias exists so nothing breaks mid-refactor).

---

## 4 · Dashboard UX

The **Site Content** view (`#view-settings`) becomes a **page picker → hero editor**:

- **Page list:** Home · Events · Membership · Lessons · Corporate · Sponsors · About. Selecting one
  opens its hero form in the workspace (same styling as the current settings form).
- **Schema-driven form** — a `PAGES` config array in `app.js` declares each page:
  ```js
  { key: 'home_page', slug: 'home', label: 'Home', media: 'video' }
  ```
  Fields render by `media`:
  - **All:** eyebrow (text), heading (textarea), lead (textarea).
  - **`image`:** image upload with live preview (reusing the existing **`event-media`** Storage
    bucket + the events drawer's upload helper) **+ position** text field (`50% 55%`).
  - **`video`:** video + poster as **path text fields** (advanced; preserves current events
    behavior).
- **Save:** validate heading + lead non-empty → `sb.from('site_content').upsert({ key, value: { hero
  }, updated_at })` → toast → the existing **`triggerPublish()`** (`/api/publish` → build hook →
  rebuild). No new publish plumbing.
- The current standalone events-hero form folds into this picker as the **Events** entry.

**Reused, unchanged:** auth/session, Storage upload, `/api/publish`, toasts, publishing indicator.

---

## 5 · Testing

**Automated (node --test):**
- `siteContent.js`: returns `pages.<slug>.hero` for every in-scope page; falls back to the seed when
  Supabase env is absent; normalizes the legacy `events_page` `eventsHero` shape.
- Seed fixture: every in-scope page has a non-empty hero `heading` (and `eyebrow`).
- Migration `0004`: contains an idempotent seed row (`on conflict do nothing`) for each new page key.
- Build-output: each page renders its own hero heading sourced from `siteContent` (offline → seed) —
  e.g. Home "Never golfed? Perfect.", Membership "Three ways in.", Lessons "You don't need to know
  how to play." — while the existing one-`h1`, canonical/OG, non-empty-alt, and nav-resolves rules
  keep passing.

**Manual (dashboard DOM, via `netlify dev` against dev Supabase):** pick each page → edit heading →
save → rebuild → the public hero updates; on an image page, upload a new hero image + adjust
position → saved and rendered; the video pages edit text without disturbing the video.

`npm test` stays green throughout.

---

## 6 · Default hero content (lifted verbatim from current templates)

Source of the seed/migration defaults (exact current copy):

- **home** (`index.njk`): eyebrow `Co-ed · Fort Lauderdale & Miami`, heading `Never golfed?<br>Perfect.`,
  lead `Most of our members hadn't either. They came for the business. They stayed for the game.`,
  video `/img/Golfmiami_aerial.mp4`, poster `/img/groupgolf1.jpg`.
- **events** (existing `events_page`): eyebrow `Events`, heading `Rooms where the right people already
  have something in common.`, lead `PWRHaus events pair golf with intentional introductions…`,
  video `/img/Dronegolfcourse.mp4`, poster `/img/groupgolf1.jpg`.
- **membership** (`membership.njk`): eyebrow `Membership`, heading `Three ways in.`, image
  `/img/membership-hero.jpg`, position `50% 65%`. (lead: as in template, if present.)
- **lessons** (`lessons.njk`): eyebrow `Lessons`, heading `You don't need to know how to play.`, image
  `/img/lessons-hero.jpg`, position `50% 55%`.
- **corporate** (`corporate.njk`): eyebrow `Corporate`, heading `Bring the simulator to your
  conference.`, image `/img/corporate-hero.webp`, position `50% 40%`.
- **sponsors** (`sponsors.njk`): eyebrow `Sponsorship`, heading `Put your brand in the room.`, image
  `/img/sponsors-hero.jpg`, position `50% 55%`.
- **about** (`about.njk`): eyebrow `About`, heading `We started because the deals were happening
  somewhere we weren't.`, image `/img/groupgolf1.jpg`, position `50% 60%`.

> The implementation plan must copy the exact `eyebrow`/`heading`/`lead` strings from each template
> at build time (including any `lead` this summary abbreviates), preserving inline markup like
> `<br>`/`&middot;`. No paraphrasing.

---

## 7 · Out of scope (this phase)

- Body/section content beyond the hero (membership tiers/pricing, lessons details, gallery, etc.) —
  a later phase, same `site_content` pattern.
- Editing hero **CTAs/buttons** (structural links).
- Video **upload** from the dashboard (video heroes keep configured videos; path is editable text).
- Merch, 404, thanks pages.

---

## 8 · Branch

Implement on `main` (the live, canonical branch), so it flows into `feat/rebrand-official` via a
later merge — unless the rebrand is chosen first, in which case rebase onto that branch.
