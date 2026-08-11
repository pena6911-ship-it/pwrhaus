# PWRHaus — Phase 1 Design Spec

**Date:** 2026-08-11
**Author:** Oz (developer) · with Claude Code
**Source of truth for requirements:** `docs/pwrhaus-scope-session.md` (Michelle scope session)
**Status:** Design approved in brainstorm; sponsor pipeline (§4c) inputs pending.

---

## 1 · What PWRHaus is

A co-ed, business-networking-through-golf organization. Members are founders/business
owners who use golf to make deals. Formerly women-only (founding story), now co-ed and
explicitly welcoming to men. The old "chapters" framing is being dropped in favor of one
holistic organization that hosts deal-making events in cities that support the clientele
(Fort Lauderdale + Miami real today; Boca/NY aspirational).

**Membership tiers (§5):**
- **Free** — create a profile, explore and book events/lessons. No vetting. The
  low-commitment first step.
- **Member — $650/yr** — unlocks the member portal.
- **Inner Circle — invitation only, from $5,000** — business valuation + coaching +
  certified exit strategy (Michelle is certified). Handled manually; not an online flow
  in Phase 1.

---

## 2 · Locked architecture decisions

- **Option B** — use GoHighLevel (GHL) *only where it genuinely exceeds*; build the rest
  as a custom site. Do not force everything into GHL.
- **GHL is Michelle's CRM and single-pane dashboard**, provided its dashboard is good
  enough for her day-to-day. Everything we build integrates *into* GHL.
  - Known, accepted cost: she loses the custom self-serve site-editing dashboard.
    **Deferred** — solve later with a git-based CMS (Sveltia/Decap on the Netlify repo).
- **Source of truth**
  - **Supabase owns facts** — contacts, orders, tickets, payments, membership status,
    event attendance.
  - **GHL owns relationship state** — pipeline stage, tags, conversation history,
    campaign membership.
  - Flow: site writes facts to Supabase first, then pushes to GHL. Never the reverse for
    facts. A **nightly read-only pull** copies GHL-owned state into Supabase as disaster
    recovery (one direction only — not bidirectional sync).
  - Every record carries `ghl_contact_id` + an idempotency key so retried webhooks never
    double-create.
- **Stripe** — Michelle sells on a **standalone Stripe account** (not Wix Payments), so
  the 33 existing members' subscriptions and payment history already live in the account
  we will connect. No payment migration needed — the "legacy cohort" is effectively free.
  Build on **Stripe test/sandbox credentials**; connect the live account at go-live.
- **Billing ownership per revenue line**
  - Membership: **GHL owns new subscriptions**; existing 33 remain in Stripe (mirrored).
  - Event tickets: **site → Stripe direct** (custom capacity/refund logic).
  - Sponsorships: invoice-based, manual (deal-sized).
  - Merch: deferred ($0 today).
- **Financial reporting** — Michelle runs financials in **Stripe** (native, $0 build).
  A **unified Supabase BI dashboard is Phase 2**; the Phase 1 schema is built BI-ready so
  Phase 2 is a view layer, not a migration.
- **No Framework & Co. branding** — pro-bono portfolio piece; skip brand/design-system
  overhead.

---

## 3 · Journeys / workflow maps

### Map A — Event lifecycle
1. **Publish** — event created (planned ~1yr ahead). Facts → Supabase; push → GHL.
2. **Promote** — GHL campaign (replaces today's manual social/email/text).
3. **Register + pay** — custom **Stripe-direct** checkout. Facts → Supabase; contact
   enters GHL event funnel (stage: registered).
4. **Confirm + remind** — GHL sequence.
5. **Day-of** — check-in → attendance fact → Supabase; GHL stage: attended.
6. **Post-event nurture** — the gap Michelle named (today: nothing). GHL nurture to
   convert attendee → member.
7. **Refund/cancel** — 48-hr window, **no credit** (§4b). Stripe refund + Supabase marks
   ticket refunded. Pure checkout logic.

### Map B — Sponsor pipeline (PROPOSED — §4c blank, pending Michelle)
Inquiry → Qualify → Proposal → Close (invoice, not automated checkout) → Fulfill → Renew.
Manual GHL pipeline. Tiers named in doc only: Social-Tee / Hole in One / Double Eagle.
**Blocking inputs (all blank in §4c):** where sponsor info lives today; time-to-close;
what each tier delivers; who owns the relationship.

---

## 4 · Phase 1 scope — what ships (replaces Wix)

1. **New public site** — full redesign, repositioned as one co-ed deal-making org
   (chapters framing removed), **pricing shown on-site**.
2. **Free profile + signup** — Supabase auth, no vetting. Top of funnel.
3. **Fixed Join → Pay** — rebuilt (§3 broken flow). $650/yr; GHL owns new subs; Stripe.
4. **Member portal — capped at exactly 5 features (§10):**
   1. Browse & book events + lessons
   2. Membership status & renewal
   3. Member perks
   4. Member directory / networking
   5. Profile management
5. **Event registration + funnel** — custom Stripe-direct checkout, auto-drop into GHL
   event funnel, plus the post-event nurture touches (§4b).
6. **Data backbone** — Supabase (BI-ready facts) → push to GHL → nightly read-only backup
   pull from GHL.
7. **Member migration** — all 33 members re-register (Wix won't export password hashes);
   legacy Stripe cohort mirrored, not migrated. Comms drafted in Michelle's voice before
   cutover.
8. **Pre-go-live Wix data export** — contacts, past orders, and specifically the
   **Aug 21 + Aug 27 attendee lists**, imported into Supabase/GHL so recent attendees land
   in the nurture funnel.

---

## 5 · Explicitly deferred to Phase 2

- Sponsor pipeline automation (blocked on §4c; interim = manual GHL pipeline)
- Unified Supabase financial dashboard (Stripe covers now; schema is BI-ready)
- Inner Circle ($5k) online flow (invitation-only, manual for now)
- Self-serve site CMS for Michelle (the site-editing gap)
- Golf-simulator corporate experience — the $10k conference gig (new revenue line)
- Merch ($0 today)

---

## 6 · Hard constraints (non-negotiable)

- 🔒 **Do not repoint DNS to Netlify until after Aug 27.** The new site is dark on Netlify
  until DNS flips; Wix keeps selling FTL (Aug 21) + Miami (Aug 27) untouched. This is a
  go-live *timing* gate, not a scope split — native Stripe ticketing ships in Phase 1.
- 🔒 **Stripe + live events cannot break** (§9).
- 🔒 **Every member re-registers** — needs Michelle's voice, drafted before cutover (§10).
- After go-live, Wix is decommissioned (kept read-only briefly for data export only).

---

## 7 · Success in 90 days (§8)

- Members **33 → 63**
- Sponsor dollars **$2,800 → $20k**
- Average event attendance **12 → 24**

---

## 8 · Phase 1 Supabase schema (BI-ready, append-only ledger)

Two rules baked into everything: **money is never overwritten** (status changes are new
rows, not updates), and **every fact carries a UTC `timestamptz` + the `ghl_contact_id`
join key**.

```
contacts
  id (uuid pk) · ghl_contact_id (unique) · email · full_name · phone
  tier (free|member|inner_circle) · source · created_at (timestamptz UTC)

memberships
  id · contact_id (fk) · tier · stripe_subscription_id
  current_status (active|lapsed|cancelled)   -- derived convenience field
  started_at · current_period_end (timestamptz UTC)

membership_events            -- APPEND-ONLY ledger
  id · membership_id (fk) · event_type (created|activated|renewed|lapsed|cancelled)
  occurred_at (timestamptz UTC) · stripe_event_id (unique, idempotency)

events
  id · name · city · capacity · price_cents (int) · currency
  starts_at (timestamptz UTC) · published (bool)

orders
  id · contact_id (fk) · type (membership|event|sponsorship|merch)
  amount_cents (int) · currency · stripe_payment_intent_id
  idempotency_key (unique) · current_status (created|paid|refunded|failed)
  created_at (timestamptz UTC)

order_events                 -- APPEND-ONLY ledger (the money truth)
  id · order_id (fk) · event_type (created|paid|refunded|failed)
  amount_cents (int) · occurred_at (timestamptz UTC) · stripe_event_id (unique)

tickets
  id · order_id (fk) · event_id (fk) · contact_id (fk)
  status (valid|refunded) · created_at (timestamptz UTC)

event_attendance
  id · ticket_id (fk) · event_id (fk) · contact_id (fk)
  attended_at (timestamptz UTC)

sponsors                     -- minimal in Phase 1; automation is Phase 2
  id · contact_id (fk) · tier (social_tee|hole_in_one|double_eagle)
  status · created_at (timestamptz UTC)

ghl_mirror_*                 -- nightly READ-ONLY backup (pipeline stage, tags, conversations)
  synced_at (timestamptz UTC) · raw payload
```

**Why BI-ready:** revenue for any window = `SUM(amount_cents)` over
`order_events WHERE event_type='paid'` minus refunds, sliced by `orders.type` — no schema
change to add the Phase 2 dashboard. Cents-as-integers avoids float rounding; `timestamptz`
UTC makes date-range reporting correct; `stripe_event_id` unique constraints make webhook
retries idempotent so a payment never double-counts.

---

## 9 · Open items before build

1. **§4c sponsor answers** (4): info location today, time-to-close, per-tier deliverables,
   relationship owner.
2. Confirm GHL's dashboard is sufficient as Michelle's day-to-day pane (validate before
   committing her fully to it).
3. Draft member re-registration comms in Michelle's voice.
