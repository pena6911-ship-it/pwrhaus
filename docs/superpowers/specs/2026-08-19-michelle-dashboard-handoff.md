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
3. **Invite Michelle** as an Auth user (email + password) — Authentication →
   Users → Invite. Only she gets an account, so *authenticated = admin*.
4. Copy the project's **anon key** (Settings → API) for the env vars below.

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
    key), confirm you cannot read draft events or write any row.

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
