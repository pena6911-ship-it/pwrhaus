# PWRHaus — Member Portal & Site Management: Architecture Decisions

**Date:** 2026-08-14
**Author:** Oz (developer) · with Claude Code
**Type:** Decision record (direction set; not yet a full implementation spec)
**Relates to:** `docs/superpowers/specs/2026-08-12-pwrhaus-marketing-site-design.md` (§10 named
member portal, self-serve CMS, and merch as out-of-scope Plan C / Phase 2 work) and
`docs/superpowers/specs/2026-08-14-merch-stripe-printify-design.md`.

---

## 1 · Context

Michelle's requirements introduced a **member portal** ("become a member → members get a portal
where they can update payment + mailing/physical address, see a member directory, access an events
calendar and virtual lessons, and get perks — paid members only"). A parallel goal surfaced: give
Michelle **a way to manage her own web pages** over time, tied to the same data we capture.

Working through it revealed that what felt like "one admin system" is really **three distinct
layers**. Conflating them is what would turn a lean setup into a bespoke platform. This record
captures the layers and the decisions.

---

## 2 · The three layers

| Layer | What it is | Home | Michelle's tool |
|---|---|---|---|
| **CRM + member data** | Contacts, tiers, memberships, orders, inquiries | **Supabase** (source of truth) → syncs to **GHL** | GHL |
| **Member portal** | What *members* log into | Not built yet (Plan C) | **GHL native** |
| **Website content** | Page copy, events, product text/images | **Git** (templates + `_data`) + **Printify** | **Git-based CMS** |

Key clarification that drives everything below: **website content is not CRM data.** Page copy and
the events list live in the git repo; products come from Printify. GHL's dashboard manages *people
and pipelines*, not website pages. So "edit pages" and "feed GHL" are two different jobs.

---

## 3 · What "signing up" already does today

Confirmed by reading `functions/lib/contacts.js` + `supabase/migrations/`:

Submitting any capture form runs `createContact`, which:
1. Creates a **`contacts`** row in Supabase — email, name, phone, source, notes, **`tier: 'free'`**
   (forced server-side; a visitor cannot self-assign a paid tier).
2. Appends a **`contact_inquiries`** ledger row (every submission, so repeat/warm leads are kept).
3. Upserts the person into **GoHighLevel**, storing `ghl_contact_id`.

So a signup **already creates a profile** — in Supabase *and* GHL — but it is a **CRM record, not a
login account**. There is no auth, no session, no portal today.

**The schema is already built for this future.** `contacts.tier` is `free | member | inner_circle`;
there are `memberships` (Stripe subscription, status, period end), `orders`, `tickets`,
`event_attendance`, `sponsors`. A portal adds **auth + UI on top of the existing model**, not a
rebuild.

---

## 4 · Decisions

### D1 — Member portal = GoHighLevel native (Plan C)
Use GHL's built-in **Memberships / Courses** (virtual lessons), **Communities** (member directory +
interaction), and **client portal / login**, plus its subscription handling. The website **captures
on-site and links members into their GHL portal** — the same "transact/host elsewhere" pattern used
for events (`registration_url`) and merch (Stripe/Printify). Rationale: GHL is already paid for and
already the CRM; this delivers most of the portal at near-zero custom build and maintenance.

### D2 — Everyone who signs up gets a portal; paid-only sections are locked
Free and paid members both get a login. Free members see their profile, the events calendar, and
**locked** paid-only sections (member directory, virtual lessons, perks, membership/payment
management). Locked-but-visible sections are the **upgrade mechanic** — they show the value paid
unlocks. Fits the site's "start free, decide later" positioning and turns the free profile from a
dead CRM record into a re-engageable foothold.

### D3 — Website content editing = git-based CMS (Phase 2)
Give Michelle a friendly admin UI that **commits content to the repo and triggers a Netlify
rebuild** — no new backend, no new database, minimal maintenance. **Recommended tool: Sveltia CMS**
(modern, actively maintained, no-backend, git-native; Decap's maintenance has slowed). Start with
the highest-churn content (events, page hero copy, merch text); structural templates stay in code.

### D4 — Do NOT build a custom unified admin platform
A single Supabase-backed dashboard that edits pages *and* shows CRM data *and* syncs to GHL is
technically possible but is a **bespoke software product** (auth, content modeling, page editor, CRM
views, sync, security, ongoing upkeep) that duplicates what GHL and a git-CMS already do. Rejected in
favor of two focused tools. Revisit only if "one dashboard for absolutely everything" becomes a hard,
non-negotiable requirement.

### D5 — Supabase stays the shared fact-store (no change)
Supabase remains source of truth and **already feeds GHL** (every contact syncs on capture). That
half of the "Supabase data feeding GHL" vision is already implemented.

---

## 5 · Privacy flag (must be designed in)

A **member directory exposes members' information to other members.** It must be **opt-in with
per-field controls** (a member chooses whether they appear and which fields show), never on by
default. This applies whether the directory is delivered via GHL Communities or otherwise.

---

## 6 · Open decisions for the future spec

Before Plan C / Phase 2 becomes an implementation spec, confirm:
1. **GHL plan capabilities** — does Michelle's GHL subscription include Memberships / Communities /
   Courses / client portal? What's the member invite + login flow?
2. **Virtual lessons** — hosted in GHL Courses, or elsewhere and linked?
3. **Payment + address management** — via GHL, or Stripe Customer Portal linked from GHL? (Addresses:
   which is authoritative — Supabase, GHL, or Stripe?)
4. **CMS specifics** — confirm Sveltia; auth backend (GitHub) for Michelle; exact editable content
   models; who reviews CMS commits before deploy (if anyone).
5. **Directory privacy model** — opt-in fields, default state, how members edit visibility.
6. **Data flow** — keep Supabase as source of truth with GHL downstream; define what the portal reads
   from GHL vs. Supabase so the two don't drift.

---

## 7 · Out of scope right now

This record sets **direction only**. No portal, no CMS, and no custom admin are being built yet.
Implementation of each is a separate spec → plan → build cycle, sequenced after the marketing site
and the merch productionization.
