# PWRHaus Dashboard — Phase 3: CRM Lead-Intake View (v1) Design Spec

**Date:** 2026-08-20
**Status:** Approved design. Implementation plan next.
**Relationship to other docs:**
- Phase 3 of the **PWRHaus command center**, after Phase 1 (events) and Phase 2a (site content).
- Activates the dashboard's disabled **CRM** nav item.
- Depends on the RLS lockdown migration **`0005_lock_down_pii.sql`** (already merged) which grants
  `authenticated`-only `select` on `contacts` + `contact_inquiries`.

---

## 1 · Goal & scope

A **read-only** CRM view in Michelle's dashboard that shows the **leads captured through the
website** — the people in `contacts` and their **inquiry history** in `contact_inquiries` — as an
at-a-glance intake list she can browse, search, and drill into.

**Data-flow context (decides everything):** lead capture is **Supabase → GHL**, one-way. Supabase
"owns facts" (`functions/lib/contacts.js:17`): a form submission writes the `contacts` row + appends
a `contact_inquiries` row *before* pushing to GoHighLevel. There is **no GHL → Supabase reverse
sync**. So this view reflects **website-captured leads as captured**, not the live GHL CRM. GHL
remains where Michelle actively *works* contacts.

**In scope (v1):** read-only browse / search / filter of contacts; a contact detail with its full
inquiry ledger.

**Out of scope (v1):**
- **Any writes** — no editing contacts, no "mark inquiry handled", no dashboard notes. (Contacts are
  GHL-synced; editing here would desync. A write increment is a possible v1.1.)
- **GHL contact import** — a one-time GHL → Supabase backfill that populates Supabase with her full
  existing base. **Deliberately deferred to a go-live task** (run on launch day so the snapshot is
  fresh); built separately, not part of v1.
- Orders / memberships / revenue / tickets (empty or GHL-owned).
- Ongoing GHL → Supabase sync.

---

## 2 · Data & access

The dashboard reads, with Michelle's **authenticated** session (anon is denied by `0005`):

- **`contacts`** — `id, email, full_name, phone, tier` (`free`|`member`|`inner_circle`), `source`,
  `notes` (first-touch message), `created_at`, `ghl_contact_id`.
- **`contact_inquiries`** — `id, contact_id, source, notes, created_at` (append-only, one per
  submission).

**No new schema.** Queries:
- **Stat counts** — accurate at any scale via head-count queries, not from the list page:
  - Total: `contacts.select('*', { count: 'exact', head: true })`
  - New this week: same with `.gte('created_at', weekAgoIso())`
  - Members: `.eq('tier', 'member')`; Inner circle: `.eq('tier', 'inner_circle')`
- **Contact list** — `contacts.select('id,email,full_name,phone,tier,source,created_at,ghl_contact_id, contact_inquiries(count)').order('created_at', { ascending: false }).limit(100)`.
  The embedded `contact_inquiries(count)` yields each contact's inquiry count **without a migration**
  (PostgREST resource-embedding count; the `0005` select policy covers the embedded read).
- **Search** — re-runs the list query with `.or('email.ilike.%q%,full_name.ilike.%q%')` (server-side).
- **Filters** — tier via `.eq('tier', …)`; source via `.eq('source', …)` (the dropdown offers the
  `source` values present in the loaded data).
- **Contact detail** — `contact_inquiries.select('source,notes,created_at').eq('contact_id', id).order('created_at', { ascending: false })`.

---

## 3 · The CRM view (UI)

Read-only, reusing the Events-view patterns (stat row + list + slide-over drawer):

- **Pulse stat row** (4 tiles, from the count queries): **Total contacts · New this week · Members ·
  Inner circle.**
- **Search + filters:** a search box (name/email), a **tier** filter (All / Free / Member / Inner
  circle), and a **source** filter (All / …present sources…).
- **Contact list:** one row per contact — `full_name` (or email if unnamed), email, a **tier badge**,
  `source`, joined date (`eventDateLabel`), and the **inquiry count**. No edit controls.
- **Contact detail** (click a row → read-only `.drawer` slide-over): the contact's info
  (name, email, phone, tier, source, first-touch note) + the **inquiry history** — every submission
  with its `source`, `notes`, and date. When `ghl_contact_id` is present, a **"View in GHL"** link.

Empty/skeleton states mirror the Events view (skeleton while loading; a friendly empty state when no
contacts match).

---

## 4 · Code structure

- **`src/admin/index.html`** — enable the disabled CRM nav item (`data-view="crm"`, remove `disabled`;
  add a bottom-nav tab); add `#view-crm` with the stat row, a `#crm-controls` search/filter bar, and a
  `#contact-list` container.
- **`src/admin/app.js`** — a CRM section: `loadCrm()` (count queries + list query), `renderCrmStats()`,
  `renderContactList()`, a debounced search/filter handler, `openContactDrawer(id)` (loads inquiries,
  renders read-only). Wire the CRM nav into the existing `wireNav()` view-switch. Reuses `toast`,
  `$`, `$$`, `state`, and the `.drawer` shell.
- **`src/admin/lib.js`** — pure helpers: `weekAgoIso()` (7-day boundary ISO string) and a `tierLabel(tier)`
  map (`free`→"Free", `member`→"Member", `inner_circle`→"Inner circle"). Reuse `eventDateLabel`.
- **`src/admin/admin.css`** — contact-row + tier-badge styles (reuse the badge pattern).

Boundaries: the data-fetch functions and the pure helpers are the testable seams; the render/drawer
functions are DOM glue.

---

## 5 · Testing

- **Automated (`node --test`):**
  - `lib.js`: `weekAgoIso()` returns an ISO string ~7 days before a passed reference time (inject the
    reference so it's deterministic — `weekAgoIso(nowMs)`); `tierLabel` maps each tier + falls back
    for unknown.
  - Build-output: the admin shell ships the **enabled CRM nav** (`data-view="crm"`, not `disabled`)
    and a `#view-crm` / `#contact-list` container.
  - `npm test` stays green.
- **Manual (dev Supabase seeded with a few contacts + inquiries, via `netlify dev`):** CRM nav opens
  the view; the four stats show real counts; the list loads newest-first with inquiry counts; search
  filters by name/email; tier + source filters work; opening a contact shows its inquiry history; a
  contact with `ghl_contact_id` shows "View in GHL".
- Honest note: most of this is DOM code with a thin pure-logic surface, so the manual checklist is the
  real proof; the automated side covers the helpers and that the view ships.

---

## 6 · Out of scope / future

- **Writes** (mark-handled, dashboard notes) — v1.1 if she triages leads in the dashboard vs GHL.
- **GHL import** — go-live task (one-time backfill), built + run separately near launch.
- **Ongoing GHL → Supabase sync**, orders/members/revenue tiles, sponsors.

## 7 · Branch

Implement on `main`; sync into `feat/rebrand-official` afterward (same as prior phases).
