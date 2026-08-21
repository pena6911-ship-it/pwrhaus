# Michelle's Dashboard — Owner Go-Live Checklist

**Date:** 2026-08-19
**Branch:** `feat/michelle-dashboard` (code complete, `npm test` green — 115 tests)
**Design spec:** `2026-08-19-michelle-dashboard-events-design.md`
**Plan:** `../plans/2026-08-19-michelle-dashboard.md`

The dashboard code is fully implemented and tested offline. The steps below need
owner access to Supabase and Netlify (agents can't create accounts, provision
projects, or set live secrets), and should be done on a **deploy preview first**.

## 1 · Supabase
1. Choose the project (dev first, then prod). Confirm you can apply migrations to it.
2. Apply the migration `supabase/migrations/0003_events_cms.sql` (adds event CMS
   columns, `site_content`, RLS policies, the `event-media` bucket, and seeds the
   two published events + the events-page hero).
   - If your project restricts direct `insert into storage.buckets`, create the
     **`event-media`** bucket in the Supabase Storage UI (public read) and apply
     only the object policies from section 4 of the migration.
2a. Apply the migration `supabase/migrations/0004_site_content_pages.sql` (pre-seeds
   a `site_content` row per page so the dashboard's Site Content view can edit every
   page's hero, not just events).
2b. Apply the migration `supabase/migrations/0005_lock_down_pii.sql` (if not already applied)
   (locks down PII reads to authenticated users only).
3. **Invite Michelle** as an Auth user (email + password) — Authentication →
   Users → Invite. Only she gets an account, so *authenticated = admin*.
3a. **Disable public signups (required — protects lead PII):** Supabase →
    Authentication → Sign In / Providers → Email → turn OFF "Allow new users to
    sign up." *Authenticated = admin* only holds if nobody else can create an
    account, and the CRM's RLS policies grant `contacts`/`contact_inquiries`
    reads to any authenticated user, not just Michelle.
4. Copy the project's **anon key** (Settings → API) for the env vars below.
5. Schedule the **one-time GHL → Supabase contact import** to run on launch day (build
   near launch; see CRM spec §1).
6. **Name-format audit (do this WITH the import, launch day).** Names are captured and
   stored as a single `contacts.full_name` field end to end — the forms post one
   `full_name` input, `sanitize.js` only truncates it to 120 chars, and `ghl.js` sends it
   to GHL's single `name` field. There is no first/last split anywhere, by design.
   The import is the moment to decide whether that should change, because it is the first
   time we see the real shape of Michelle's contact base. While importing, sample the
   incoming names and count:
   - single-word / mononym entries;
   - business or organisation names rather than people;
   - multi-word surnames and particles (`van der`, `de la`, `O'`, hyphenated);
   - anything already split first/last on the GHL side.
   **Then decide, and record the decision:** (a) leave single-field — correct if the only
   uses are display, search, and the GHL push; (b) add `first_name`/`last_name` captured
   at the source (two form fields) with `full_name` retained; or (c) add derived
   first/last columns from a documented, explicitly-lossy split, flagged as derived.
   Do **not** parse-and-split existing rows before this audit — `full_name` is currently a
   faithful, lossless capture, and splitting on messy input bakes in guesses that cannot be
   undone. Also check whether GHL has already split the `name` we push; if the
   personalisation need lives in GHL campaigns, no change may be required on our side.

7. **Pre-launch database reset (launch day, BEFORE the GHL import).** Testing on Netlify
   generated real rows in Supabase — test purchases, test tickets, test contacts. Clear the
   transactional data so Michelle starts from zero, but **do not blanket-wipe every table**:
   the live site's capture forms have been collecting *genuine* leads throughout, and
   `events`/`site_content` hold her real content.

   | Data | Action |
   |---|---|
   | `event_attendance`, `tickets`, `orders`, `order_events` | **Clear** — all of it is test purchase data |
   | `contacts`, `contact_inquiries` | **Curate** — delete test rows by email/date; keep real captured leads. Export first |
   | `events`, `site_content` | **Curate** — remove test events; keep her real content |

   **Order matters** (foreign keys): `event_attendance` → `tickets` → `orders` → `order_events`.
   Deleting `orders` before `tickets` will fail on the FK.

   ```sql
   -- Transactional test data only. Run in this order.
   delete from event_attendance;
   delete from tickets;
   delete from order_events;
   delete from orders;

   -- Real ticket numbers should start at 000-0001-00001, not continue the test count.
   alter sequence event_order_seq restart with 1;
   ```

   For contacts, inspect before deleting — do NOT truncate:
   ```sql
   -- Review what is test vs real first.
   select id, email, full_name, source, created_at from contacts order by created_at;
   -- Then delete only the test addresses you identify, e.g.:
   -- delete from contact_inquiries where contact_id in (select id from contacts where email in ('...'));
   -- delete from contacts where email in ('...');
   ```

   Afterwards, re-check each event's `tickets_enabled`, prices and `sales_end_at` before sales open.

## 2 · Netlify
5. Create a **build hook** (Site config → Build & deploy → Build hooks) →
   copy its URL into `NETLIFY_BUILD_HOOK` (server-side only).
6. Set env vars per context (Site config → Environment variables):
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` — needed by the **build** (published event
     reads) and the **browser** dashboard.
   - `SUPABASE_SERVICE_ROLE_KEY` — existing (contact/stripe functions).
   - `NETLIFY_BUILD_HOOK` — publish function only.
   Scope sandbox/test values to deploy-preview + branch-deploy; production values
   to production (mirrors the existing Stripe context split in `netlify.toml`).

## 3 · Verify on a deploy preview (before production)
7. Visit `/admin/` → log in with Michelle's credentials.
8. Create an event, upload an image from the device, mark it published, save.
9. Confirm the "Publishing… live in ~30s" indicator, wait for the rebuild, and
   confirm the event appears on the public `/events/` page + a `/events/<slug>/`
   detail page with correct meta/OG.
10. Edit the events-page hero under **Site Content**; confirm the public hero updates
    after rebuild.
11. Toggle publish off → confirm the event drops from the public site on rebuild.
12. Drag to reorder → confirm the order persists and matches public ordering.
13. Test the recovery flow: "Forgot password?" → email → set new password → log in.
14. **RLS spot-check:** with the anon key only (logged out / a curl using the anon
    key), confirm you cannot read draft events or write any row. Also confirm
    `GET /rest/v1/contacts` and `GET /rest/v1/contact_inquiries` return empty/denied
    with the anon key alone — applying `0005_lock_down_pii.sql` **and** disabling
    public signups (step 3a) are both hard gates before the CRM view goes to
    production; either one missing means a stranger can read the lead database.

## 4 · Follow-ups (non-blocking)
- ~~**PWA icons**~~ — DONE: replaced with a brand maskable SVG (`src/img/pwa-icon.svg`).
- ~~**CDN dependency**~~ — DONE: `supabase-js` is vendored at `src/admin/vendor/supabase.js`
  (UMD global) and loaded locally; no runtime CDN. To update it, re-copy the bundle from
  `node_modules/@supabase/supabase-js/dist/umd/supabase.js` after bumping the package.
- **Sveltia teardown:** the GitHub OAuth app previously used by Sveltia can be
  removed from the GitHub account — it's no longer referenced.
- **Reorder:** both drag-and-drop and keyboard **Move up/down** buttons now write `sort_order`.

## 5 · Operational must-dos (learned at launch, 2026-08-19)

These three bit us during go-live. Keep them true or the dashboard silently breaks.

1. **Netlify auto-publishing MUST stay ON.**
   Netlify → Deploys shows a "Stop auto publishing" toggle (if it reads "Start auto
   publishing", it is currently OFF — turn it on). The dashboard's whole publish flow
   depends on it: Michelle clicks Publish → `/api/publish` fires the build hook →
   Netlify rebuilds → **auto-publishing is what promotes that rebuild to the live URL.**
   With it off, her edits build but never go live, and production serves a stale deploy
   (this exact confusion cost us an hour: production looked like an older, buggy build).

2. **Supabase Auth URL configuration (required for password recovery).**
   Supabase → Authentication → URL Configuration:
   - **Site URL** = `https://pwrhaus.netlify.app` (the default is `http://localhost:3000`,
     which is where recovery emails wrongly pointed until this was set).
   - **Redirect URLs** (allowlist — must exactly match where the app sends people):
     `https://pwrhaus.netlify.app/admin/` and `http://localhost:8888/admin/` (local dev).
   The recovery token arrives in the URL hash and only `/admin/` has code to catch it, so
   the `/admin/` redirect must be both requested (it is, in `app.js`) and allowlisted.

3. **Custom SMTP for production auth emails.**
   Supabase's built-in email sender is rate-limited to a few messages/hour ("email rate
   limit exceeded") and is test-only. Before Michelle relies on password reset / invites,
   configure custom SMTP (Resend, Postmark, SendGrid, or SES) under
   Supabase → Authentication → Emails / SMTP Settings.

## 6 · Event ticketing go-live (Phase 4)

Ticketing ships wired to Stripe **test mode** and with ticket email dormant. These
steps are what turn it into a real, sellable feature — do them per event, deliberately,
not all at once.

1. **Apply migration `0006_event_ticketing.sql`** to the Supabase project (adds
   `member_price_cents`, `nonmember_price_cents`, `sales_end_at`, `tickets_enabled` to
   `events`; `manage_token` to `orders`; `ticket_no`, `tier_sold`, `qr_token`,
   `assigned_at` to `tickets`; and the authenticated-read policies the dashboard
   roster depends on).
2. **Create the tickets webhook endpoint** in the Stripe Dashboard pointing at
   `/api/tickets/webhook`, and copy its signing secret into
   `STRIPE_TICKETS_WEBHOOK_SECRET`. This is a separate endpoint and secret from the
   merch webhook — do not reuse `STRIPE_MERCH_WEBHOOK_SECRET`.
3. **Set per-event prices and sales window** in the dashboard (or directly in
   Supabase): `member_price_cents`, `nonmember_price_cents`, `sales_end_at`, and only
   then flip `tickets_enabled` to `true`. Sales stay off by default — this is the
   explicit switch that puts the selector live on that event's public page.
4. **Swap to live Stripe keys** (`STRIPE_SECRET_KEY`, and the tickets webhook secret
   from a live-mode endpoint) once a real event is ready to sell for real money. Keep
   test-mode keys in deploy-preview/branch contexts, same pattern as merch.
5. **Verify Resend** — set `RESEND_API_KEY` and a Resend-verified `TICKETS_FROM_EMAIL`
   before relying on ticket emails; until then, buyers only get Stripe's own receipt,
   with no ticket/QR or assignment link.
6. **Rewrite the refund and weather policies for events.** The existing policies were
   written for merch/membership; ticketing needs its own owner-decided language
   (refund window, no-show, event cancellation/reschedule for weather) before tickets
   go on sale. There is no dashboard refund flow — refunds are handled directly in
   Stripe.
7. **Never sell the same event on WIX and here simultaneously.** Capacity is enforced
   only against tickets issued through this system; a duplicate listing on WIX can
   oversell the room with neither system aware of the other.
