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
- **PWA icons:** `src/img/pwa-icon-192.png` / `-512.png` are currently copies of the
  brand favicon mark. Replace with exact-size (192×192, 512×512, maskable-safe) art
  for a crisp installed icon.
- **CDN dependency:** the browser dashboard imports `@supabase/supabase-js` from
  `https://esm.sh/@supabase/supabase-js@2` (matches the retired Sveltia CDN pattern).
  If you prefer no runtime CDN, vendor a pinned copy under `src/admin/vendor/` and
  update the import in `src/admin/app.js`.
- **Sveltia teardown:** the GitHub OAuth app previously used by Sveltia can be
  removed from the GitHub account — it's no longer referenced.
