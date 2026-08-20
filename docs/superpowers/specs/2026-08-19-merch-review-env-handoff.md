# Merch POC — Review & Environment Setup Handoff

**Date:** 2026-08-19
**Status:** POC merged for review onto **`main`** (Clubhouse theme) and **`feat/rebrand-official`**
(brand-deck theme). **Test mode only** — safe to deploy to the Netlify `.netlify.app` URL while
WIX remains the truly-live site.
**Design spec:** `2026-08-14-merch-stripe-printify-design.md` (unchanged).

## Safety rails (do not remove for review)
- **Stripe is `sk_test`** — sandbox keys; no real charge can occur. (Michelle's real Stripe keys
  were never obtained.)
- **`PRINTIFY_LIVE=false`** — the webhook creates a Printify **draft order only**; it never calls
  `send_to_production`, so nothing is ever fulfilled.

## Which env vars matter, by goal

The storefront (`/merch`) builds live from Printify and shows a friendly "no products yet"
message when its keys are absent, so a build never fails for lack of these.

### Goal A — Michelle just browses the storefront + opens checkout (minimum)
Set these in the relevant Netlify context (branch-deploy for a preview, or production for `main`):
| Var | Purpose | Where to get it |
|---|---|---|
| `PRINTIFY_API_TOKEN` | Build-time product fetch (populates the page) | Printify → Account → **Connections / API** → generate a token |
| `PRINTIFY_SHOP_ID` | Which Printify shop to read | Printify shop URL / API; ours is **28584383** |
| `STRIPE_SECRET_KEY` | Creates the Stripe **test** Checkout session for "Buy" | Stripe Dashboard (**Test mode**) → Developers → API keys → *Secret key* (`sk_test_…`) |

With just these, products render and the "Buy" button opens a real Stripe **test** checkout.
Payment completion won't create the Printify draft yet (that needs Goal B).

### Goal B — Full test loop (checkout → Printify draft order)
Add the webhook signing secret and the guard flag:
| Var | Purpose | Where to get it |
|---|---|---|
| `STRIPE_MERCH_WEBHOOK_SECRET` | Verifies the `checkout.session.completed` event | See **Webhook secret** below |
| `PRINTIFY_LIVE` | Keep **`false`** (draft-only) for review | Set literally to `false` |

## Webhook secret (`STRIPE_MERCH_WEBHOOK_SECRET`)
It's a Stripe **webhook signing secret** (`whsec_…`), generated **per endpoint**. The handler
lives at **`/api/merch/webhook`** and acts only on **`checkout.session.completed`**.

**Deployed (Netlify):**
1. Stripe Dashboard → **Test mode** (top-right toggle — required, since we use `sk_test`).
2. **Developers → Webhooks → Add endpoint.**
3. **Endpoint URL:** `https://pwrhaus.netlify.app/api/merch/webhook` (production), or the exact
   branch-deploy URL if testing on a branch.
4. **Select events:** `checkout.session.completed`.
5. Create → on the endpoint page, **Reveal** the **Signing secret** → copy `whsec_…`.
6. Set it as `STRIPE_MERCH_WEBHOOK_SECRET` in the matching Netlify context.

The secret is **bound to that exact endpoint URL** — a secret made for `pwrhaus.netlify.app`
will not validate on a branch-deploy URL, and vice-versa.

**Local:** the Stripe CLI prints one:
```bash
stripe listen --api-key sk_test_... --forward-to http://localhost:8888/api/merch/webhook
```
Paste the printed `whsec_…` into `.env`. (Per-session; differs from the Dashboard endpoint's.)

## Go-live (later — NOT for this review)
When Michelle's store goes truly live (the eventual WIX → Netlify cutover):
- Swap in **Michelle's live Stripe keys** (`sk_live_…`) + a **live-mode** webhook endpoint/secret.
- Deliberately set `PRINTIFY_LIVE=true` only when fulfillment should really happen.
- Confirm Printify has all products set up (per the current state notes, only "Cap" existed).
- Consider Stripe Tax, order persistence to Supabase, and fulfillment-failure alerting
  (see the design spec §"Failure modes").
