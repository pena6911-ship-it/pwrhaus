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
3. **Michelle's Dashboard (Phase 1: Events) — BUILT on `feat/michelle-dashboard`.** Bespoke `src/admin/` SPA (plain HTML/CSS/vanilla JS, supabase-js via pinned CDN) replaces Sveltia for events: email+password login, events CRUD + image upload + drag-reorder, events-page hero editor. Supabase is the source of truth; the build reads published rows (`src/_data/events.js` / `siteContent.js`) with a `data/*.seed.json` fallback when env is absent. Save → `/api/publish` (Netlify Function) verifies the session and pings `NETLIFY_BUILD_HOOK` to rebuild. **Sveltia (`src/admin/config.yml` + GitHub OAuth) is retired.** Owner go-live steps (Supabase account, build hook, env, migration apply, deploy-preview QA): `docs/superpowers/specs/2026-08-19-michelle-dashboard-handoff.md`. Design spec: `docs/superpowers/specs/2026-08-19-michelle-dashboard-events-design.md`; plan: `docs/superpowers/plans/2026-08-19-michelle-dashboard.md`. **Phase 2a (Site Content) — SHIPPED on `feat/site-content-mgmt`.** The dashboard's Site Content view now edits every page's hero, not just events; `siteContent.js` serves per-page heroes with seed fallback; migration `0004_site_content_pages.sql` pre-seeds a `site_content` row per page; hero image uploads reuse the existing `event-media` Storage bucket. **Phase 3 (CRM lead-intake, read-only) — SHIPPED on `feat/crm-lead-intake`.** The CRM nav shows website-captured leads from `contacts`/`contact_inquiries` (RLS `0005`, authenticated-only); GHL remains the working CRM; the one-time **GHL → Supabase contact import is a deliberate go-live task** (run on launch day). **Phase 4 (event ticketing, Stripe test mode) — SHIPPED on `feat/event-ticketing`.** Buyer-only checkout on the public event page with server-verified member pricing (the browser never sends a price); one QR-bearing ticket issued per seat; token-link attendee assignment (`/tickets/manage/?token=`) that feeds the CRM; a dashboard roster per event and a real Registrations count on the Events stat row. Ticket email is dormant until `RESEND_API_KEY` is set (Stripe's own receipt still sends). Go-live steps: `docs/superpowers/specs/2026-08-19-michelle-dashboard-handoff.md`. **Phase 5 (event check-in) — SHIPPED on `feat/event-checkin`.** QR tickets rendered from `qr_token` (vendored `qrcode-generator`); session-verified `/api/tickets/checkin` endpoint; phone-first Check-in dashboard view with BarcodeDetector camera scanning, manual ticket-number entry, door capture that syncs unnamed seats to GHL, offline retry queue, and a running roster. Attendance lands in `event_attendance` and is additive (never mutates ticket status, not cleared on expiry). Migration `0009_event_checkin.sql` adds unique constraint, event index, and authenticated-read policy; check-in requires no new secrets. **KNOWN BUG: camera QR scanning does not decode — see "ACTIVE BUG" section below. Manual ticket-number entry works and is the current door fallback.**
4. **Member portal (Plan C / Phase 2):** portal via **GHL native** (memberships/community); Supabase stays the fact-store. Not started. Doc: `docs/superpowers/specs/2026-08-14-member-portal-and-cms-architecture.md`. (The CMS half of this thread is now delivered by the dashboard above.) When the member portal gives end users Supabase Auth accounts, the `0005` `to authenticated` read policies on `contacts`/`contact_inquiries` MUST first be tightened to an owner/admin identity check (e.g. an admins table or email pin) — otherwise every member could read the lead database. The same tightening applies to `0009`'s `to authenticated` read policy on `event_attendance`, and to `/api/tickets/checkin`, which currently authorizes on any valid session rather than an admin identity — otherwise every member could read the attendance roster or check tickets in.
4. **Go-live:** Netlify is **not connected** to this repo yet. Connect it (main = production branch, set env vars in Netlify UI per `.env.example` + `netlify.toml` contexts). DNS cutover is post-Aug 27 (site stays dark until then).
5. **Partner courtesy:** confirm The Tips Golf Miami is OK with the corporate photo (credit already added).

---

## ACTIVE BUG — QR check-in scanner will not decode (handoff, 2026-08-21)

**Status: UNRESOLVED. Three contributing faults were found and fixed; the core
symptom remains.** The camera now opens and shows live video, but no QR is ever
decoded. Manual ticket-number entry works and is unaffected.

### Symptom

On the Check-in view of the dashboard (`/admin/`, Check-in nav), tapping
**Start scanning** opens the camera and displays a live picture. Pointing it at
a ticket QR never registers a check-in. The same QR **scans correctly with the
phone's normal camera app**, so the printed/displayed code itself is valid.

### Environment (matters — do not assume desktop)

- Owner tests on an **Android phone**, against the deployed Netlify site.
- **No browser console access.** Any diagnostic must be visible on screen.
  This is why `decoderDiagnostics()` writes decoder state into the result box.
- Netlify build credits are limited — prefer local testing (`npm start`) over
  push-and-see cycles.
- Do NOT test this in an incognito window. Incognito uses a separate camera
  permission store and produced a misleading dead-camera result once already.

### Confirmed working — do not re-investigate

Each of these was verified, not assumed:

- `main` is fully pushed; the deployed site serves the current code.
- **No CSP** anywhere (`netlify.toml`, `_headers`) — scripts are not blocked.
- `https://pwrhaus.netlify.app/js/vendor/jsqr.js` **serves JavaScript** (owner
  confirmed in-browser). The decoder file reaches the device.
- The vendored bundle sets `window.jsQR` to a **function** (verified by running
  `src/js/vendor/jsqr.js` in a Node `vm` sandbox with no `module`/`exports`).
- Script order in `src/admin/index.html` is correct: `jsqr.js` is a classic
  script and executes before the `type="module"` `app.js`.
- `.checkin-result` CSS styles all four kinds (`ok`/`warn`/`err`/`info`), so no
  message is being rendered invisibly.
- `getUserMedia` **succeeds** — the `<video>` is only unhidden after it resolves.
- 220 tests pass (`npm test`). `tokenFromScan` and `resolveJsqr` are unit-tested
  in `test/admin-lib.test.js`.

### Fixes already landed (do not redo)

| Commit | Fault |
|---|---|
| `04360b1` | `BarcodeDetector` was trusted on existence alone. On some Android builds the constructor exists while `qr_code` is unsupported, so `detect()` silently never fires. Now checks `getSupportedFormats()`. Vendored jsQR 1.4.0 (Apache-2.0) as fallback. |
| `ed1cebf` | Decoder selection ran **before** `getUserMedia`, so a missing decoder presented as a dead camera. Camera now opens first; failures are distinguishable; decoder state is shown on screen. |
| `6762edf` | **`await video.play()` was unguarded.** Its rejection aborted `startScanning()` after the video was already visible — a black box, no message, no decode loop. Now caught and non-fatal, plus a 4s black-screen watchdog. |

### The one unknown that would narrow this fastest

Nobody has yet reported **what the on-screen diagnostics line says** while
scanning. It reads:

`QR decoder: loaded|MISSING · built-in: yes|no`

Get this first — it splits the remaining hypotheses cleanly. `built-in: yes`
points at H1; `built-in: no` + `loaded` points at H2/H3.

### Ranked hypotheses

**H1 — native `BarcodeDetector` is selected and is the thing that does not work
(strongest).** `src/admin/app.js:1172`:

```js
checkinDecoder = native ? 'native' : (jsqr ? 'jsqr' : '');
```

Native is preferred, and **there is no fallback once chosen**. If this Android
build reports `qr_code` support but `detect()` returns `[]` forever, jsQR — the
decoder added specifically to fix this — never runs at all. That would fully
explain "camera live, nothing decodes."
*Suggested fix:* if the native path yields nothing after ~3-4 seconds of frames
with `videoWidth > 0`, fall back to jsQR at runtime and say so on screen. Or
simply prefer jsQR outright; it is known-good and the per-frame cost is
acceptable at door volumes.

**H2 — camera resolution/focus too poor to resolve the QR.** `app.js:1153`
requests only `{ video: { facingMode: 'environment' } }` with **no resolution
constraint**, so the browser may hand back a low default (e.g. 640×480) with no
macro/continuous focus. The phone's own camera app applies autofocus and higher
resolution — which is exactly why it succeeds where this fails.
*Suggested fix:* request `width: { ideal: 1280 }, height: { ideal: 720 }` and
advanced `focusMode: 'continuous'`; consider decoding a centred crop.

**H3 — per-frame cost starves the decode loop.** `readFrame()` draws the full
frame and runs `getImageData` + jsQR on every `requestAnimationFrame`, with
`inversionAttempts: 'attemptBoth'` (roughly double work). On a mid-range phone
this can fall far behind real time.
*Suggested fix:* throttle to ~10 fps, downscale the canvas, decode a centre
crop, and use `'dontInvert'` for a dark-on-light QR.

**H4 — the rendered QR is hard to read on screen.** Tickets render as SVG via
`window.qrcodeSvg` (`src/js/vendor/qrcode.js:2320`, error-correction `H`,
margin 4). Low contrast or small display size could hurt, though the phone
camera app reading it argues against this being the primary cause.

### Files involved

- `src/admin/app.js` — `nativeSupportsQr()` :1125, `decoderDiagnostics()` :1137,
  `startScanning()` :1142, decoder pick :1172, `readFrame()`/`tick()` :1204-1245,
  `submitCheckin()` :977, button wiring :893
- `src/admin/lib.js` — `tokenFromScan()`, `resolveJsqr()` (pure, unit-tested)
- `src/admin/index.html:147` — `<script src="/js/vendor/jsqr.js">`
- `src/js/vendor/jsqr.js` — vendored jsQR 1.4.0 (Apache-2.0)
- `src/admin/admin.css:202-208` — `.checkin-video`, `.checkin-result`
- `functions/lib/checkin.js`, `functions/lib/tickets-checkin.js` — server side,
  **known good** (manual entry exercises the same endpoint successfully)

### Ground rules for whoever picks this up

- **Never `git push`** — commit locally; the owner reviews and pushes.
- Use `git add -u`, never `git add -A` (the tree mixes in local-only files).
- Keep `npm test` at 220 passing; add tests for any new pure logic.
- No new runtime dependencies or CDN loads — browser libraries are vendored
  into `src/js/vendor/` with a licence header.
- Any new diagnostic must be **on-screen**, not console-only.

### Fallback worth considering if live decoding stays unreliable

Add a **"Take a photo of the ticket"** control: `<input type="file"
accept="image/*" capture="environment">`, then decode the captured still with
jsQR. This bypasses `getUserMedia`, `play()`, and the live-video path entirely
and leans on the camera stack already proven to read these codes. One extra tap
per guest, but reliable at the door. Offered to the owner; not yet built.

---

## Key docs

- **`docs/superpowers/specs/2026-08-14-phase-2-roadmap.md` — the authoritative "what's next" (supersedes scattered Phase 2 lists). Start here for roadmap/sequencing.**
- `docs/superpowers/specs/2026-08-12-pwrhaus-marketing-site-design.md` — the site design spec (tokens, IA, rules).
- `docs/superpowers/specs/2026-08-14-merch-stripe-printify-design.md` — merch commerce spec.
- `docs/superpowers/specs/2026-08-14-member-portal-and-cms-architecture.md` — portal + CMS decisions.
