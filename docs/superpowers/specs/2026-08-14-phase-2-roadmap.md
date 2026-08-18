# PWRHaus — Phase 2 Roadmap (authoritative "what's next")

**Date:** 2026-08-14
**Status:** Living roadmap. **Supersedes** the stale "deferred to Phase 2" list in
`2026-08-11-pwrhaus-phase1-design.md` §5 and the scattered "Phase 2" mentions in the
marketing-site spec. Keep this current as workstreams ship.
**Audience:** whoever codes next (Claude / Codex). Read `AGENTS.md` first for repo conventions.

---

## 0 · Naming — read this once

The repo has used two overlapping labels; this roadmap unifies them:

- **"Phase 2"** = the deferred bucket from the Phase 1 spec (CMS, BI dashboard, sponsor
  automation, Inner Circle flow, reconciliation sweep).
- **"Plan C" / "Plan D"** = the marketing-site spec's deferrals: **Plan C = member portal**,
  **Plan D = native checkout** (merch is the first Plan D increment).

They are the same forward roadmap seen from two docs. Below, each workstream is listed once
with its real status, regardless of which label it wore.

---

## 1 · Status snapshot

| Workstream | Label | Status | Detailed spec |
|---|---|---|---|
| A. Site polish + go-live | — | 🟡 in progress | this doc |
| B. Merch → production | Plan D | 🟢 **POC built**, needs productionizing | `2026-08-14-merch-stripe-printify-design.md` |
| C. Member portal | Plan C | 🟡 **site hooks implemented; GHL configuration next** | `2026-08-17-ghl-member-portal-design.md` |
| D. Site CMS for Michelle | Phase 2 | 🟢 **built initial CMS**: events + events-page content editable via Sveltia | `2026-08-15-sveltia-cms-for-michelle-design.md` |
| E. CRM/data hardening | Phase 2 | ⬜ not started | needs its own spec |
| F. Sponsor pipeline automation | Phase 2 | ⬜ blocked on sponsor answers | needs its own spec |
| G. Inner Circle ($5k) online flow | Phase 2 | ⬜ not started | needs its own spec |

Already shipped (no longer "Phase 2"): the corporate golf-simulator **marketing page**, the
full site redesign, and the lead-capture gate. Merch moved from "not started" to a working POC.

---

## 2 · Workstreams

### A · Site polish + go-live  🟡
Near-term, low-risk, mostly on `main`.
- **Asset swaps:** replace the short/hard-looping `golflessons.mp4` and `simulator-lounge.mp4`
  with longer clips when the owner supplies them (same filenames, keep `.video-portrait`).
- **Real photography:** Michelle's real event photos replace remaining placeholders (drop-in
  via the `mediaSlot` macro / hero image fields). Higher-res partner assets where noted.
- **Netlify hookup (go-live):** connect the repo to a Netlify site, `main` = production branch,
  set env vars in the Netlify UI per `.env.example` + `netlify.toml` contexts. **Site stays
  dark until DNS cutover (post-Aug 27).** DNS = record change in Wix, not a domain transfer
  (see marketing spec §8).
- **Partner courtesy:** confirm The Tips Golf Miami is OK with the corporate photo (credit added).
- **Acceptance:** production build green on Netlify, all pages load, forms POST to GHL, gate works.

### B · Merch → production (Plan D)  🟢→
From the working POC (`poc/merch`, Stripe test + Printify draft-only) to real sales.
- Live Stripe keys via `STRIPE_MODE`/Netlify context; wire the **`PRINTIFY_LIVE=true`** path so
  the webhook calls `send_to_production` after a paid order.
- Persist orders to Supabase (reuse `functions/lib/orders.js` + `idempotency.js`; `orders.type`
  already allows `'merch'`).
- **Fulfillment-failure alerting:** charge-succeeded-but-Printify-failed → flag order
  `needs_attention` + email owner (the one case a human must see).
- Printify **shipment webhook → tracking email** to the customer; store tracking on the order.
- **Stripe Tax** enabled (needs FL registration) or an explicit interim decision.
- Get **polo + towel** set up in Printify (only "Cap" exists today); the storefront is already
  dynamic from Printify, so they appear on the next build.
- Then PR **`poc/merch → main`** (git dedupes the cherry-picked site commits).
- **Acceptance:** a live test order prints + ships + emails tracking; a forced Printify failure
  refunds/alerts, never silently loses the order.
- ⚠ POC note: storefront is **dynamic from Printify at build time** (`src/_data/products.js`),
  which supersedes the static `products.json` described in the merch spec §4.

### C · Member portal (Plan C)  🟡
Decision locked and designed: **use GoHighLevel native** memberships/community/client-portal; the
site captures on-site and links members into their GHL portal. Free + paid both get a login; paid
unlocks gated sections (directory, virtual lessons, perks, payment/address management).
- GHL access confirmed: Michelle's account includes Memberships, Communities, Courses, and Client
  Portal.
- Site hooks are implemented: portal links and both membership CTAs render from `GHL_PORTAL_URL`, and signup confirmation tells new profiles to expect a portal invite.
- Remaining GHL configuration: create the `pwrhaus_tier_free` tag-triggered invite workflow and complete the portal areas, access rules, courses, and community before enabling `GHL_PORTAL_URL`.
- **Member directory = opt-in, per-field privacy** (never on by default).
- Reconcile what the portal reads from GHL vs Supabase so the two don't drift.
- **Acceptance:** a free signup can log into a portal; paid sections are gated; payment/address
  edits work. Mostly configuration + linking, minimal custom code (that's the point).

### D · Site CMS for Michelle (Phase 2)  🟢
Decision locked: **git-based CMS, Sveltia recommended** (no backend; commits to the repo →
Netlify rebuild). Decap is the fallback (maintenance has slowed).
- **Initial CMS built:** `/admin/`, GitHub-backed Sveltia config, editorial workflow,
  editable `src/_data/events.json`, editable `src/_data/siteContent.json`, repo media
  folder at `src/img/cms/`, data-driven `/events/`, and generated published event detail
  pages.
- Add Sveltia config (`admin/`), auth backend (GitHub) for Michelle.
- Model the highest-churn content first: **events** (`src/_data/events.json`), page hero copy,
  merch/product text. Structural templates stay in code.
- Decide review flow (does a human review CMS commits before deploy?).
- **Acceptance:** Michelle edits an event/copy via the CMS UI, it commits, Netlify rebuilds,
  the change is live — no developer involved.

### E · CRM/data hardening (Phase 2)  ⬜  *(needs its own spec)*
- **Reconciliation sweep:** nightly job that finds `contacts` with null `ghl_contact_id` and
  retries the GHL push (self-heal for CRM-outage stragglers; marketing spec §6 open gap).
- **Unified Supabase financial/BI dashboard:** a view layer over the already-BI-ready schema
  (`orders`, `order_events`, `memberships`, `membership_events`, revenue = SUM(paid) − refunds).
- Consider **rate limiting** on `/api/contacts` (currently none; honeypot + validation only).

### F · Sponsor pipeline automation (Phase 2)  ⬜ *blocked*
Blocked on the §4c sponsor answers (4 questions outstanding). Interim = manual GHL pipeline.
Needs those answers + its own spec before build.

### G · Inner Circle ($5k) online flow (Phase 2)  ⬜ *(needs its own spec)*
Invitation-only tier, manual today. A gated online application/payment flow. Low priority until
demand justifies it; likely a Stripe payment link/Checkout + GHL tagging rather than custom UI.

---

## 3 · Suggested sequencing

1. **A (go-live prep)** + finish A's asset swaps — unblocks the Aug-27 launch.
2. **B (merch → production)** — a POC already exists; highest ROI-to-effort of the big items.
3. **D (CMS)** — removes the developer from routine content edits; relatively small.
4. **C (member portal)** — mostly GHL configuration; sequence with Michelle's GHL plan.
5. **E (data hardening)** — do the reconciliation sweep with the nightly GHL pull; dashboard later.
6. **F / G** — when unblocked / when demand justifies.

## 4 · Before building E, F, or G

Each needs its own design spec (data flow, acceptance, values resolved) before implementation —
same discipline as the merch and portal specs. A, B, C, D are already specified enough to code
against (A here, B/C/D in their linked docs).
