# PWRHaus — Agent Working Notes & Handoff

Repo context for any coding agent (Codex, Claude, etc.). Read this first.

**Last handoff:** 2026-08-14 (Claude → Codex). See "Current state" and "Open threads".

---

## Stack & commands

- **Static site:** Eleventy (11ty v3), Nunjucks templates in `src/`, output to `public/` (gitignored).
- **Hosting:** Netlify (Netlify Functions v2 in `functions/`, routed via `export const config = { path }`).
- **Commerce:** Stripe (payments) + Printify (merch drop-ship). **Supabase** = data backbone; **GoHighLevel (GHL)** = CRM (contacts sync downstream).
- **No client-side framework.** Vanilla JS in `src/js/` only (nav, form, sticky-cta, gate, merch).

```bash
npm run build     # eleventy build -> public/
npm test          # node --test (currently 115 tests) — MUST stay green
npm run dev       # eleventy --serve (site only, no functions)
netlify dev --offline   # site + functions on http://localhost:8888 (loads .env)
```

For merch webhook testing: `stripe listen --api-key <sk_test> --forward-to http://localhost:8888/api/merch/webhook` (paste the printed `whsec_` into `.env` as `STRIPE_MERCH_WEBHOOK_SECRET`).

**Shell is Windows PowerShell 5.1** (no `&&` chaining; use `;` or separate lines). ffmpeg/ffprobe available via scoop.

---

## Branch model (IMPORTANT)

- **`main`** = the real production site. Site changes land here.
- **`poc/merch`** = `main`'s site work **plus** the merch POC (Stripe+Printify). NOT production-ready.

**Workflow used so far:** make **site** changes on `main`, then `git cherry-pick main` onto `poc/merch` so both stay current. Make **merch** changes on `poc/merch` only. When merch is productionized it becomes a PR `poc/merch → main` (git dedupes the cherry-picked site commits).

---

## Working rules (from the owner's global CLAUDE.md)

- **Commit locally; a human reviews before push.** The owner has been reviewing and pushing (and explicitly waived push a few times). Don't push unless directed. Never `git push --force` / skip hooks.
- **`git add -u`, never `git add -A`.** Working dir mixes tracked code with local-only files. Add new files by explicit path.
- **Backup branch before any risky multi-file change.**
- **Propose diffs for review before large/irreversible changes.** Don't add new deps/build steps without asking.
- Keep `npm test` green. `.env` is gitignored — never commit secrets. `.netlify/` and `deno.lock` are netlify scratch (ignored on `poc/merch`).

## Design system ("Clubhouse Light")

Tokens in `src/css/tokens.css` are **FINAL — do not substitute values**. Rules enforced by tests: **mobile-first CSS (min-width only, no `max-width` queries), no `box-shadow`, never `color: var(--brass)` for text (use `--brass-text`), 44px min touch targets, every `<img>` needs non-empty alt, one `<h1>` per page, F&Co footer credit on every page.** Full spec: `docs/superpowers/specs/2026-08-12-pwrhaus-marketing-site-design.md`.

Reusable hero: `src/_includes/partials/page-hero.njk` (image OR video, per-page). Contained vertical video: `.video-portrait` (used on lessons + corporate).

---

## Current state (2026-08-14)

Done and pushed (site work on `main`, everything on `poc/merch`):
- **Redesign:** full-bleed hero videos/images per page; brand logo in header (CSS-cropped monogram + wordmark) + footer; monogram favicon; tagline; site-wide **lead-capture gate** (blurs page until submit/dismiss, JS-only so it's SEO-safe, posts `web_gate` → GHL).
- **Per-page heroes** from the shared macro. **Lessons** + **Corporate** have contained portrait-video showcases. **Corporate hero** = a real event photo from venue partner **The Tips Golf Miami** (credited, links thetipsgolf.com).
- **Footer:** Instagram + Facebook social icons (inline SVG); credit row aligned.
- **Merch POC** (`poc/merch` only): `/merch` storefront is **built live from Printify** (`src/_data/products.js` fetches at build time — the static `products.json` in the merch spec §4 is superseded by this dynamic approach). Checkout = Stripe **test** hosted Checkout (`functions/merch-checkout.js`), webhook (`functions/merch-webhook.js`) creates a **Printify DRAFT order** only. **Safety rail: `PRINTIFY_LIVE=false` → never calls `send_to_production`.** Verified end-to-end in test mode.

`.env` keys (names only): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GHL_API_KEY`, `GHL_LOCATION_ID`, `STRIPE_SECRET_KEY` (sk_test), `STRIPE_WEBHOOK_SECRET`, `PRINTIFY_API_TOKEN`, `PRINTIFY_SHOP_ID` (28584383), `PRINTIFY_LIVE=false`, `STRIPE_MERCH_WEBHOOK_SECRET`.

---

## Open threads / next steps

1. **Asset swaps (easy, site):** the lessons (`golflessons.mp4`) and corporate (`simulator-lounge.mp4`) loops are short (~3–7s) and loop hard — owner is sourcing longer clips; swap same filenames when they land. A higher-res corporate hero from The Tips is already in (`corporate-hero.webp`, 2048px).
2. **Merch productionization (Plan D):** live Stripe keys + `PRINTIFY_LIVE` go-live path (`send_to_production`), persist orders to Supabase (`functions/lib/orders.js` backbone exists), fulfillment-failure alerting, Printify shipment→tracking-email webhook, Stripe Tax, get polo/towel set up in Printify (only "Cap" exists). Then PR `poc/merch → main`. Spec: `docs/superpowers/specs/2026-08-14-merch-stripe-printify-design.md`.
3. **Michelle's Dashboard (Phase 1: Events) — BUILT on `feat/michelle-dashboard`.** Bespoke `src/admin/` SPA (plain HTML/CSS/vanilla JS, supabase-js via pinned CDN) replaces Sveltia for events: email+password login, events CRUD + image upload + drag-reorder, events-page hero editor. Supabase is the source of truth; the build reads published rows (`src/_data/events.js` / `siteContent.js`) with a `data/*.seed.json` fallback when env is absent. Save → `/api/publish` (Netlify Function) verifies the session and pings `NETLIFY_BUILD_HOOK` to rebuild. **Sveltia (`src/admin/config.yml` + GitHub OAuth) is retired.** Owner go-live steps (Supabase account, build hook, env, migration apply, deploy-preview QA): `docs/superpowers/specs/2026-08-19-michelle-dashboard-handoff.md`. Design spec: `docs/superpowers/specs/2026-08-19-michelle-dashboard-events-design.md`; plan: `docs/superpowers/plans/2026-08-19-michelle-dashboard.md`.
4. **Member portal (Plan C / Phase 2):** portal via **GHL native** (memberships/community); Supabase stays the fact-store. Not started. Doc: `docs/superpowers/specs/2026-08-14-member-portal-and-cms-architecture.md`. (The CMS half of this thread is now delivered by the dashboard above.)
4. **Go-live:** Netlify is **not connected** to this repo yet. Connect it (main = production branch, set env vars in Netlify UI per `.env.example` + `netlify.toml` contexts). DNS cutover is post-Aug 27 (site stays dark until then).
5. **Partner courtesy:** confirm The Tips Golf Miami is OK with the corporate photo (credit already added).

---

## Key docs

- **`docs/superpowers/specs/2026-08-14-phase-2-roadmap.md` — the authoritative "what's next" (supersedes scattered Phase 2 lists). Start here for roadmap/sequencing.**
- `docs/superpowers/specs/2026-08-12-pwrhaus-marketing-site-design.md` — the site design spec (tokens, IA, rules).
- `docs/superpowers/specs/2026-08-14-merch-stripe-printify-design.md` — merch commerce spec.
- `docs/superpowers/specs/2026-08-14-member-portal-and-cms-architecture.md` — portal + CMS decisions.
