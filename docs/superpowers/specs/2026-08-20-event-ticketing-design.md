# PWRHaus — Event Ticketing via Stripe (Phase 4) Design Spec

**Date:** 2026-08-20
**Status:** Approved design. Implementation plan next.
**Relationship to other docs:**
- Replaces WIX Events ticketing for PWRHaus events. Built and proven in **Stripe test mode** on
  Netlify; switching real ticket sales over is a later business decision, not part of this spec.
- Reuses the Stripe→webhook→Supabase pattern proven by the merch POC
  (`2026-08-14-merch-stripe-printify-design.md`).
- Feeds the CRM (`2026-08-20-crm-lead-intake-design.md`): every attendee becomes a `contact`.
- **Check-in / QR scanning is explicitly a follow-on spec** (see §9).

---

## 1 · Why this exists

Michelle currently sells event tickets through WIX Events. That flow works but carries real
defects we should not reproduce:

| Observed on the live WIX flow | Problem |
|---|---|
| Refund + Inclement Weather policies are written about **"lessons"** | Wrong copy on an events checkout |
| Event map points at **San Francisco** | Stale WIX default; event is in Plantation, FL |
| **2.5% "service fee"** added to the buyer's price, filed under **"Tax breakdown"** | A platform fee mislabelled as tax, inflating the buyer's price |
| Invoice shows **"Amount Paid $0.00 / Balance Due"** on a paid order | Misleading paid-order record |
| Member rate is **self-selected** — anyone can choose the $65 "PWRHAUS Member" ticket | No verification; observed on a real order |
| **Name + email for every attendee demanded before payment** | Highest-friction moment sits in front of the payment |

**Goal:** a ticketing flow that is faster to buy, produces *better* attendee data, verifies member
pricing, and costs the buyer less — while making attendee identity a first-class asset.

**Why attendee data matters:** PWRHaus is a networking society whose end goal is a business-exit
network for member business owners. *Who is in the room* is the product, not event admin. Attendee
capture is therefore a business-intelligence requirement, not a nicety.

**Current pricing (from the live August event):** PWRHAUS Member **$65.00**, Non-Member **$75.00**,
sales ending the day before the event.

---

## 2 · Decisions locked

| # | Decision | Rationale |
|---|---|---|
| D1 | **Buyer-only checkout; attendees assigned afterward** ("c with teeth") | Removes the worst friction point from the funnel; deferred capture yields *more* accurate emails (buyer has the roster in front of them) and models real substitutions |
| D2 | **Verified member pricing** from `contacts.tier` | WIX lets anyone self-select the member rate; we already hold the tier |
| D3 | **Server-side price recomputation** — the browser never dictates price | Client-supplied prices are trivially forged |
| D4 | **No buyer-facing service fee** — Stripe's fee is absorbed | Removes WIX's 2.5% surcharge; a real price advantage |
| D5 | **One ticket per seat**, each with its own `qr_token` | Per-attendee identity + check-in later |
| D6 | Attendees become **first-class `contacts`** (`source='event_attendee'`), synced to GHL | A guest on someone else's ticket is exactly the warm prospect the society is built to find |
| D7 | **Stripe Checkout (hosted)** | Apple/Google Pay, cards, billing address, promo codes, PCI — all free and maintained |
| D8 | Email built **dormant** against Resend, activated by env var | DNS/Resend is blocked on the Cloudflare migration (owner-run, separate effort). **Superseded 2026-08-22:** Google Workspace is now the chosen transport (no DNS changes needed); Resend retained as a config-selectable alternative. See — see `2026-08-22-dns-migration-cloudflare.md` § 5. |
| D9 | **Check-in scanning is a follow-on spec** | Distinct surface; ticketing is complete and shippable without it |
| D10 | **Stripe test mode** for this build | Same posture as merch; real keys are a go-live step |

---

## 3 · Data model

### 3.1 `events` — add ticketing fields
```sql
alter table events add column if not exists member_price_cents    int;
alter table events add column if not exists nonmember_price_cents int;
alter table events add column if not exists sales_end_at          timestamptz;
alter table events add column if not exists tickets_enabled       boolean not null default false;
```
The existing `price_cents` remains the displayed base/non-member price; `nonmember_price_cents`
takes precedence when set. `capacity` (existing) is the seat limit. `tickets_enabled` lets Michelle
publish an event without opening sales.

### 3.2 `orders` — used as-is
Existing columns already model this: `type='event'`, `contact_id`, `amount_cents`, `currency`,
`stripe_payment_intent_id`, `idempotency_key` (unique), `current_status`
(`created`/`paid`/`refunded`/`failed`). Add one column for the assignment link:
```sql
alter table orders add column if not exists manage_token text unique;
```

### 3.3 `tickets` — extend
Existing: `id`, `order_id`, `event_id`, `contact_id`, `status` (`valid`/`refunded`), `created_at`.
```sql
alter table tickets alter column contact_id drop not null;         -- unassigned until claimed
alter table tickets add column if not exists ticket_no  text unique;  -- human-readable
alter table tickets add column if not exists tier_sold  text check (tier_sold in ('member','non_member'));
alter table tickets add column if not exists qr_token   text unique;  -- unguessable, for check-in
alter table tickets add column if not exists assigned_at timestamptz;
```

### 3.4 `event_attendance` — untouched
Reserved for the check-in follow-on.

### 3.5 RLS
`orders`, `tickets`, `event_attendance` are already RLS-enabled with **no policy** (migration
`0005`), i.e. service-role only. This spec keeps that: all ticket writes happen in Netlify
functions using the service-role key. Add **authenticated read** policies on `orders` + `tickets`
so the dashboard roster (§7) can read them. The public assignment page (§6) reads via a function,
not directly — the token never grants database access.

---

## 4 · Purchase flow (public)

1. **Event page** (`/events/<slug>/`) shows both prices, remaining capacity ("6 spots left"), and a
   quantity selector per ticket type. Sales close at `sales_end_at`; a closed event shows a clear
   "Ticket sales have closed" state rather than a broken button.
2. **Buyer enters name + email.** If that email matches a `contact` with tier `member` or
   `inner_circle`, member pricing applies; otherwise non-member. The UI states which rate applied
   and why ("Member rate applied" / "Not a member? Join to save $10").
3. **`POST /api/tickets/checkout`** (Netlify function):
   - Loads the event from Supabase; rejects if `tickets_enabled=false` or past `sales_end_at`.
   - **Recomputes every price server-side** from the event row + the buyer's actual tier (D3).
   - Checks remaining capacity (`capacity` − issued valid tickets).
   - Creates the buyer as a `contact` if new (`source='event_ticket'`).
   - Creates a **Stripe Checkout Session** with line items per ticket type, `metadata`
     (`event_id`, `contact_id`, `member_qty`, `nonmember_qty`, `idempotency_key`).
   - Returns the session URL; the browser redirects to Stripe.
4. **Stripe hosts payment.** Success → `/events/<slug>/thanks/?session_id=…`; cancel → back to the
   event page.

**Capacity is enforced twice** — at session creation *and* in the webhook before issuing tickets,
since two buyers can pass the first check simultaneously. If the webhook check fails, the order is
recorded `paid` and flagged `needs_attention` for refund rather than overselling. This is the one
case Michelle must ever see.

---

## 5 · Fulfillment (webhook)

`POST /api/tickets/webhook` on `checkout.session.completed`, mirroring `merch-webhook.js`:

1. **Verify the Stripe signature** (`constructEventAsync`); reject unsigned/invalid.
2. **Idempotency** on the Stripe event id — a retry must never double-issue tickets.
3. Insert the `order` (`type='event'`, `current_status='paid'`, `stripe_payment_intent_id`).
4. **Re-check capacity.** On failure: flag `needs_attention`, notify, stop.
5. **Issue N `tickets`** — one per seat — each with a sequential `ticket_no`, a `tier_sold`, and a
   unique `qr_token`. The **buyer's own ticket is auto-assigned** to their `contact_id`; the rest
   are left unassigned.
6. Generate the order's `manage_token`.
7. **Send the confirmation email** (§8) with the buyer's ticket and the "Add your guests" link.

---

## 6 · Attendee assignment — "the teeth"

A token-protected page at `/tickets/manage/?token=<manage_token>`:

- Lists the order's tickets: assigned ones show their attendee; unassigned ones show a name + email
  form.
- Saving an assignment calls `POST /api/tickets/assign`, which:
  - **creates or matches a `contact`** by email (`source='event_attendee'`),
  - sets `tickets.contact_id` + `assigned_at`,
  - emails that attendee **their own ticket** (§8),
  - pushes the contact to **GHL** via the existing `createContact` path, so attendees flow into the
    CRM exactly like every other lead.
- **Reassignable** until the event starts (golf groups change; substitutions are normal).
- The token is unguessable and grants access to **that order only** — never to the database.

**Chasing gaps (what makes it "teeth"):** the confirmation email leads with the link; a scheduled
reminder emails buyers who still have unassigned tickets before the event; and the dashboard shows
Michelle the unassigned count per event so she can chase directly.

---

## 7 · Dashboard

The Events view gains, per event:
- **Registrations** — the "—" stat tile becomes a real count of valid tickets.
- **Roster** — attendees with name, email, member/non-member, assigned/unassigned.
- **Unassigned count**, surfaced prominently so gaps are visible and chaseable.
- Read-only in this phase; refunds and cancellations are handled in Stripe.

---

## 8 · Email (built dormant)

Three messages, written against **Resend** and gated behind `RESEND_API_KEY`:

| Email | To | Contains |
|---|---|---|
| Order confirmation | Buyer | Order summary, their own ticket, **"Add your guests"** link |
| Attendee ticket | Each assigned attendee | Event name, date, venue, ticket type, ticket no., order no., **QR**, entry instructions |
| Unassigned reminder | Buyers with gaps | "You still have N tickets to assign" + link |

Ticket layout follows the WIX ticket's useful structure (event, time/location, ticket + price,
ticket no., order no., payment status, QR, entry instructions) — **without** its defects: correct
event-specific policies, correct venue, no mislabelled fee, no "Amount Paid $0.00" on a paid order.

**Until DNS/Resend is live** (owner-run Cloudflare migration), `RESEND_API_KEY` is absent, email
send is skipped, and **Stripe's own receipt** covers the buyer. No code change is needed at
activation — only the env var.

**Copy to rewrite (do not carry over):** the Refund and Inclement Weather policies must be written
for **events**, not lessons, and shown on the event page + checkout.

---

## 9 · Out of scope (this phase)

- **Check-in / QR scanning** and `event_attendance` writes — follow-on spec. QRs are *generated*
  here, not *scanned*.
- Refunds/cancellations from the dashboard (handled in Stripe).
- Waitlists, seat maps, multi-day or recurring ticketing.
- Coupons beyond Stripe's built-in promotion codes.
- Real (live-mode) Stripe keys — a go-live step, as with merch.
- The **DNS/Cloudflare migration** and Resend verification — owner-run, tracked separately.

---

## 10 · Testing

**Automated (`node --test`):**
- Pure pricing logic: member vs non-member selection, quantity totals, capacity math, sales-window
  open/closed.
- Checkout handler: rejects disabled/closed/over-capacity; **never trusts a client-supplied price**.
- Webhook: rejects bad signatures; idempotent on repeated Stripe event ids (no double issuance);
  issues exactly N tickets; auto-assigns the buyer's ticket; flags over-capacity rather than
  overselling.
- Assignment handler: rejects a bad token; creates/matches the contact; assigns; is reassignable.
- Email module: no-ops cleanly when `RESEND_API_KEY` is absent.

**Manual (Stripe test mode, `netlify dev`):** buy 1 member + 3 non-member tickets with a test card →
confirm one order, four tickets, buyer auto-assigned → open the manage link → assign three guests →
confirm three new contacts appear in the CRM → confirm the dashboard roster and unassigned count.

`npm test` stays green throughout.

---

## 11 · Go-live checklist (owner, later)

1. Michelle's **live Stripe keys** + a live-mode webhook endpoint/secret.
2. **Resend** verified (after the Cloudflare DNS migration) → set `RESEND_API_KEY`.
3. Set per-event `member_price_cents` / `nonmember_price_cents` / `sales_end_at`, then flip
   `tickets_enabled`.
4. Decide the WIX cutover moment — do not sell the same event on both platforms simultaneously.
5. Rewrite and publish the event refund + weather policies.
