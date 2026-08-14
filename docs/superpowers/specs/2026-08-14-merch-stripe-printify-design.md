# PWRHaus — Merchandise Commerce (Plan D increment) Design Spec

**Date:** 2026-08-14
**Author:** Oz (developer) · with Claude Code
**Requirements source of truth:** this doc + `docs/pwrhaus-scope-session.md`
**Builds on:** `docs/superpowers/specs/2026-08-12-pwrhaus-marketing-site-design.md`
(that spec put merch in §10 **Out of scope**; this spec brings it *into* scope as the
first Plan D increment — native checkout).
**Status:** DRAFT for review. No implementation until approved.

---

## 1 · What this is

On-site merchandise sales for PWRHaus, fully drop-shipped through **Printify** and paid
through **Stripe**. The design goal that dominates every decision below:

> **Michelle's involvement per order is zero.** Merch is low-margin; her time is worth more
> than the profit. The system takes the money, submits the order to Printify, and Printify
> prints and ships to the customer with tracking. No packing, no manual order entry, and
> nobody re-keys the order into a print vendor by hand.

This is the first thing on the site that takes a real payment, so it is explicitly a **Plan D**
increment, not part of the checkout-free marketing site. It reuses the existing Stripe/orders
backbone (`functions/stripe-webhook.js`, `functions/lib/stripe.js`, `orders.js`, `ledger.js`,
`idempotency.js`) rather than starting fresh.

---

## 2 · Decisions locked in this brainstorm

| # | Decision | Rationale |
|---|---|---|
| M1 | Fulfillment is **Printify API**, fully automated | The whole point — no human in the loop. Printify exposes a real order-submission API, so a paid order is auto-created and sent to production without anyone re-keying it. |
| M2 | Checkout is **Stripe-hosted Checkout Sessions** (redirect) | Least code, PCI handled by Stripe, collects address + tax, and keeps card entry *off* the marketing pages — consistent with the site's checkout-free design (transaction happens on Stripe, like events' `registration_url` links out). |
| M3 | Catalog lives in **`src/_data/products.json`** | Same git-edited, no-backend pattern as `events.json`. Each entry maps a retail product to its Printify `product_id` + `variant_id`s. |
| M4 | **Free shipping, baked into retail price** for launch | Low margin + Stripe Checkout can't easily price live per-address shipping. Baking Printify's shipping into the sticker price removes an entire checkout step and a class of "we lost money on shipping" bugs. Printify shipping becomes a known COGS line. Revisit with live rates later. |
| M5 | **Stripe Tax** collects customer-facing sales tax | The compliant answer for a US merchant selling physical goods. Requires Michelle to register where she has nexus (FL at minimum). See §7. |
| M6 | Orders are recorded in **Supabase** via the existing orders/ledger tables | One durable record per sale, idempotent on the Stripe event id — reuses `orders.js` + `idempotency.js`. |
| M7 | Storefront = **`/merch` page + homepage teaser** | Mirrors the live Wix site (merch strip between Events and Sponsors) and gives products their own indexable page. |

---

## 3 · Order flow (happy path)

```
Customer                 New site            Stripe                 Printify
   |  browse /merch          |                  |                       |
   |  pick product + variant |                  |                       |
   |------ "Buy" ----------->|                  |                       |
   |                         | create Checkout  |                       |
   |                         | Session (server) |                       |
   |                         |----------------->|                       |
   |<--- redirect to Stripe hosted checkout ----|                       |
   |  pay + enter shipping address ------------->|                       |
   |                         |                  | checkout.session.completed (webhook)
   |                         |<-----------------|                       |
   |                         | verify sig +     |                       |
   |                         | idempotency +    |                       |
   |                         | write order row  |                       |
   |                         |------- create order (variant + address) ->|
   |                         |                  |   send_to_production   |
   |                         |                  |                       | prints + ships
   |<--------- confirmation + (later) tracking email --------------------| 
```

Every hop is idempotent and durable: Stripe retries the webhook on any non-2xx, and the
Printify order is keyed by the Stripe session id so a retry never double-orders.

---

## 4 · Catalog data model — `src/_data/products.json`

```json
[
  {
    "slug": "golf-cap",
    "name": "PWRHaus Golf Cap",
    "summary": "Structured cap, embroidered PH mark.",
    "price_cents": 3500,
    "image": "/img/merch/golf-cap.jpg",
    "printify_product_id": "<from Printify>",
    "variants": [
      { "label": "One size", "printify_variant_id": 0, "price_cents": 3500 }
    ],
    "published": true
  },
  {
    "slug": "brooks-brothers-polo",
    "name": "Polo — PWRHaus Golf Society",
    "summary": "…",
    "price_cents": 7500,
    "image": "/img/merch/polo.jpg",
    "printify_product_id": "<from Printify>",
    "variants": [
      { "label": "Navy · M", "printify_variant_id": 0, "price_cents": 7500 },
      { "label": "Navy · L", "printify_variant_id": 0, "price_cents": 7500 }
    ],
    "published": true
  }
]
```

- **`printify_product_id` / `printify_variant_id` are the source of truth for fulfillment.**
  The customer's variant choice carries the exact Printify variant id through checkout
  (as Checkout `metadata`) so the webhook orders precisely the right size/colour.
- Prices are integer cents (backbone money rule). Rendered `$35` via a filter.
- Variant ids are numeric and come **from Michelle's Printify account** — an open item (§11).
  Ideally the build validates every `printify_variant_id` against the Printify product on
  deploy so a bad id fails the build, not a customer's order.
- `published: false` excludes an item from the build.

---

## 5 · Checkout (Stripe)

New function `functions/merch-checkout.js` (POST `/api/merch/checkout`):

- Input: `[{ slug, variant_id, quantity }]` (server re-reads price from `products.json` — the
  client never sends the price).
- Creates a **Checkout Session**:
  - `mode: 'payment'`
  - `line_items` via `price_data` built from `products.json` (single source of truth; no
    duplicate Stripe product catalog to maintain), with `product_data.name`, `images`, and a
    `tax_code` for apparel.
  - `shipping_address_collection: { allowed_countries: [...] }` — physical goods.
  - `automatic_tax: { enabled: true }` (§7).
  - `metadata` / line-item metadata: `slug`, `printify_product_id`, `printify_variant_id`,
    `quantity` — everything the webhook needs to place the Printify order.
  - `success_url` → `/merch/thanks/`, `cancel_url` → `/merch/`.
- Uses `STRIPE_MODE` from `netlify.toml` context (test on previews, live on production) — the
  wiring already exists.

Card data never touches our pages; Stripe hosts the payment form.

---

## 6 · Fulfillment automation (Printify)

Extend `functions/stripe-webhook.js` to handle `checkout.session.completed`:

1. **Verify** the Stripe signature (existing path).
2. **Idempotency**: key on the Stripe event id via `idempotency.js`; a duplicate delivery is a
   no-op.
3. **Record** the order in Supabase (`orders` + ledger) with status `paid`.
4. **Create the Printify order**: `POST /v1/shops/{SHOP_ID}/orders.json`
   - `external_id`: the Stripe session id (Printify dedupes on this — a webhook retry can't
     double-order).
   - `line_items`: `[{ product_id, variant_id, quantity }]` from the session metadata.
   - `address_to`: name + shipping address from the Stripe session's collected shipping details.
   - `shipping_method`: standard.
5. **Send to production**: `POST /v1/shops/{SHOP_ID}/orders/{id}/send_to_production.json`
   (API-created orders are on-hold until this call — or enable shop auto-approval; the explicit
   call is safer and testable).
6. Store the returned Printify order id on our order row for reconciliation.

**Printify → tracking:** register a Printify webhook (`order:shipment:created`) → a small
function updates our order row to `shipped` and emails the customer the tracking link. (Printify
can also email the customer directly; we choose one, not both, to avoid duplicate emails.)

---

## 7 · Shipping & tax — the compliant approach

**Shipping (M4):** free to the customer, baked into the retail price. Set each retail price to
cover Printify's *base cost + Printify's shipping* to the primary market (US) + Stripe's fee,
with margin on top. This is the honest way to offer "free shipping" without a live rating step
Stripe Checkout can't cleanly do pre-address. **Trade-off named:** international orders cost
Printify more to ship than domestic, so either restrict `allowed_countries` to US at launch or
accept thinner margin abroad. Recommend **US-only at launch**.

**Sales tax (M5):** enable **Stripe Tax**. Selling physical goods creates a tax-collection
obligation in states where Michelle has nexus (FL at minimum, plus any economic-nexus states
once volume crosses thresholds — unlikely soon for a small line). Stripe Tax computes and
collects the right amount at checkout; Michelle files/remits.

- **Requires:** Michelle registers for a FL sales-tax permit and enables Stripe Tax with her
  origin address. Until she does, the compliant fallback is **US-only, FL tax only** or a brief
  "tax handled at fulfillment" note — but the right answer is registering. Flagged in §11.
- **Separate from customer tax:** Printify charges *Michelle* sales tax on the wholesale order
  (her COGS) unless she files a resale certificate with Printify. That's her bookkeeping, not a
  site concern — noted so it isn't a surprise.

I am not a tax advisor; this is the standard Stripe-Tax-for-POD setup, and Michelle's accountant
should confirm the registration before go-live.

---

## 8 · Failure modes (the money is real now)

| Failure | Handling |
|---|---|
| Stripe charged, Printify order create fails | Webhook returns non-2xx → Stripe retries (idempotent). If it still fails after retries, flag the order `needs_attention`, email Michelle + developer, and hold. Manual re-submit or Stripe refund. **The one case Michelle must ever see.** |
| Duplicate webhook delivery | `idempotency.js` on the Stripe event id; Printify `external_id` on the session id. No double order. |
| Out-of-stock / discontinued variant | Build-time validation of `printify_variant_id`s; if Printify rejects at order time, `needs_attention` + refund path. |
| Customer wants a refund/return | POD has no returns except misprint/damage. A short policy on `/merch`. Refunds via Stripe dashboard; if already produced, Michelle absorbs COGS. |
| Chargeback | Stripe's normal flow; order row keeps the evidence trail. |

---

## 9 · Storefront

- **`/merch`** — product grid from `products.json`, each card: image, name, price, "View".
- **Product detail** (either `/merch/<slug>` generated per entry, or an on-card variant picker) —
  variant selector (polo size/colour), "Buy" → creates the Checkout Session.
- **Homepage teaser** — a 3-up merch strip placed after Events / before Sponsors, matching the
  live site's information order.
- **`/merch/thanks/`** — post-purchase confirmation (distinct from the lead-capture `/thanks/`).
- Design uses the existing hero component + card system; no new visual language.

---

## 10 · Config / secrets (Netlify env, per context)

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (exist) · **new:** `PRINTIFY_API_TOKEN`,
`PRINTIFY_SHOP_ID`, `PRINTIFY_WEBHOOK_SECRET`. Test values on deploy-preview/branch, live on
production — same split `netlify.toml` already defines. No secrets in the repo.

---

## 11 · Open items (needed before build / from Michelle)

1. **Printify account access** — API token + shop id, and the products must exist in her
   Printify shop with final print files. Everything keys off her Printify product/variant ids.
2. **Variant/SKU details** — polo sizes + colours (and their Printify variant ids); cap/towel
   confirmed one-size. (You noted these aren't finalized yet.)
3. **Final retail prices** with shipping baked in (M4) — may nudge the current $25 / $75 / $35.
4. **Sales-tax registration** — FL permit + Stripe Tax enablement, or an explicit interim
   decision (§7). Accountant sign-off.
5. **Markets** — US-only at launch confirmed? (Recommended.)
6. **Returns/refunds policy** copy for `/merch`.

---

## 12 · Out of scope (this increment)

Member portal / login · event-ticket checkout (still `registration_url` link-out) · discount
codes · inventory UI · a self-serve product admin (products stay git-edited) · subscriptions ·
international shipping optimization · abandoned-cart email.

---

## 13 · Plan ownership (per marketing-site spec §12)

This spec is a new scope area. When it goes to an implementation plan, that plan must state which
of §4–§9 it implements and which it defers, with an owner for each gap. Suggested slices:

| Area | Likely plan |
|---|---|
| `products.json` model + `/merch` + homepage teaser + product/variant UI | Merch-1 storefront |
| `merch-checkout.js` (Stripe Checkout Session, tax, address) | Merch-2 checkout |
| webhook → Printify order + send_to_production + order row | Merch-3 fulfillment |
| Printify shipment webhook → tracking email + order status | Merch-4 post-purchase |
| failure alerting / `needs_attention` path | folded into Merch-3 |

---

## 14 · Testing

- Stripe **test mode** end-to-end on a deploy preview: test card → session → webhook →
  Printify **sandbox/hold** order (do not send_to_production in test) → order row written.
- Idempotency: replay the same `checkout.session.completed` → exactly one order, one Printify
  submission.
- Variant integrity: a bad `printify_variant_id` fails the build.
- Failure path: force a Printify 4xx → order flagged `needs_attention`, alert fired, no silent
  loss.
- Existing 62 tests stay green.
