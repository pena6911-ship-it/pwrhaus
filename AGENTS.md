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

## Session close protocol (READ THIS — applies to every agent)

When the owner says **"let's wrap up here"**, **"let's stop here"**, or anything
equivalent, that is not just a goodbye. It is an instruction to hand off. Before
you finish the turn, do all four:

1. **Update `## Current state` in this file** — append a dated bullet list of what
   you changed: features, migrations, and any owner action they create. If you
   contradicted something written earlier in this file, fix the earlier text
   rather than leaving both. A file that says two things is worse than a stale one.
2. **Update project memory** at
   `~/.claude/projects/C--Users-pena6/memory/` — one file per fact, plus a
   one-line pointer in `MEMORY.md`. Record only what the repo does not already
   say: ordering constraints, landmines, decisions and their reasons. Do not
   restate code or git history.
3. **Update the client manual** — `docs/PWRHAUS_Website_User_Manual_v1_N.html`,
   bumped one minor version, superseding the previous file (delete the old one;
   git history keeps it). There is exactly **one** manual in `docs/` at a time.
   Any owner-visible change belongs in it.
4. **State plainly what is unpushed, unapplied, or unverified.** Never say a fix
   works when it has not been confirmed on a device.

**Why this matters:** the owner alternates between Codex and Claude, using Claude
for design and planning and Codex for implementation. Neither can see the other's
session. This file plus project memory is the entire handoff channel. If you skip
it, the next agent re-derives your work from diffs, or worse, contradicts it.

A wrap-up that skipped steps 1-3 has already happened (2026-08-22): six commits
landed with no update here and nothing written to memory, and the next session
had to reconstruct the state by reading diffs.

---

## Current state (2026-08-21)

Done and pushed (site work on `main`, everything on `poc/merch`):
- **Redesign:** full-bleed hero videos/images per page; brand logo in header (CSS-cropped monogram + wordmark) + footer; monogram favicon; tagline; site-wide **lead-capture gate** (blurs page until submit/dismiss, JS-only so it's SEO-safe, posts `web_gate` → GHL).
- **Per-page heroes** from the shared macro. **Lessons** + **Corporate** have contained portrait-video showcases. **Corporate hero** = a real event photo from venue partner **The Tips Golf Miami** (credited, links thetipsgolf.com).
- **Footer:** Instagram + Facebook social icons (inline SVG); credit row aligned.
- **Merch POC** (`poc/merch` only): `/merch` storefront is **built live from Printify** (`src/_data/products.js` fetches at build time — the static `products.json` in the merch spec §4 is superseded by this dynamic approach). Checkout = Stripe **test** hosted Checkout (`functions/merch-checkout.js`), webhook (`functions/merch-webhook.js`) creates a **Printify DRAFT order** only. **Safety rail: `PRINTIFY_LIVE=false` → never calls `send_to_production`.** Verified end-to-end in test mode.

`.env` keys (names only): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GHL_API_KEY`, `GHL_LOCATION_ID`, `STRIPE_SECRET_KEY` (sk_test), `STRIPE_WEBHOOK_SECRET`, `PRINTIFY_API_TOKEN`, `PRINTIFY_SHOP_ID` (28584383), `PRINTIFY_LIVE=false`, `STRIPE_MERCH_WEBHOOK_SECRET`.

### Authoritative security and launch update (2026-08-21)

- **QR check-in is fixed and working.** The Android camera path now falls back from native `BarcodeDetector` to vendored jsQR, uses a resilient video start path, and shows a confirmation overlay over the camera after each result. Manual ticket-number entry remains available.
- **Supabase admin authorization is live.** Migration `0010_admin_authorization.sql` replaced broad authenticated-user policies with `app_metadata.pwrhaus_role = 'admin'` checks for CRM, events, CMS, media, tickets, and attendance. Both `hello@pwrhausgolfsociety.com` and `pena6911@gmail.com` have that app metadata role. Migration `0011_security_hardening.sql` fixed the mutable search path on `next_event_order_seq()`.
- **MFA code is merged to `main` in commit `fae06d6`.** The dashboard includes TOTP enrollment/challenge UX; Netlify functions use verified JWT claims and require admin role plus `aal2`. Migration `0012_require_mfa.sql` is intentionally **not applied live yet** so the final lock does not precede deployment and enrollment.
- **MFA status:** `hello@pwrhausgolfsociety.com` has a verified TOTP factor. `pena6911@gmail.com` still needs to enroll and verify one. CAPTCHA protection is currently disabled because the dashboard does not yet pass a CAPTCHA token; re-enable only after a frontend Turnstile/hCaptcha integration is added.
- **Final launch order:** deploy the MFA code; both admins verify login and TOTP; run the one-time GHL → Supabase contact migration after go-live; then apply `0012_require_mfa.sql` as the final RLS lock. Do not apply it earlier.
- **Testing:** current repository verification is 232 passing tests; `npm run build` passes.

### 2026-08-22 — dashboard self-service + CRM review tools (Codex)

Six commits, all on `main`. Verified: 234 tests pass, `npm run build` clean.

- **Ticket sales are now owner-controlled** (`b2f63af`). A **Ticketed event**
  checkbox in the event editor writes `tickets_enabled`; event cards read
  `Ticketed` / `No tickets`. **Prices and the sales-close date are still NOT
  editable in the dashboard** — they remain a developer step, so set them before
  the owner toggles sales on.
- **Live ticket availability on the public events page** (`4d1ea3f`).
  `src/js/event-availability.js` refetches remaining seats from
  `/api/tickets/availability` after load and renders "N spots available" /
  "Sold out". On fetch failure it falls back to full capacity, so a sold-out
  event can briefly read as available during an outage — accepted trade-off,
  documented in the manual.
- **CRM capture-period filter** (`acd571a`). `crmDateRange()` in
  `src/admin/lib.js` (unit-tested) resolves Today / week / month / quarter /
  all-time plus custom ranges, using local calendar boundaries converted to UTC.
  The custom end date is inclusive for the operator, exclusive in the query.
- **CRM pagination** (`93db6ad`) at 100 rows per page; filters apply across the
  whole result set, not just the visible page.
- **Manual** consolidated to a single `docs/PWRHAUS_Website_User_Manual_v1_6.html`
  (v1.5 removed; git history retains it). The published copy lives at the
  artifact URL the owner shares with the client — republish it when the manual
  changes.
- Handoff spec gained §9 (CRM lead review).

**Manual location changed:** the client manual now lives in `docs/` in this repo,
not in the owner's Downloads folder. Superseded copies still sitting in
`~/Downloads` (v1.3, v1.4) are stale — do not edit them.

---

## Open threads / next steps

1. **Asset swaps (easy, site):** the lessons (`golflessons.mp4`) and corporate (`simulator-lounge.mp4`) loops are short (~3–7s) and loop hard — owner is sourcing longer clips; swap same filenames when they land. A higher-res corporate hero from The Tips is already in (`corporate-hero.webp`, 2048px).
2. **Merch productionization (Plan D):** live Stripe keys + `PRINTIFY_LIVE` go-live path (`send_to_production`), persist orders to Supabase (`functions/lib/orders.js` backbone exists), fulfillment-failure alerting, Printify shipment→tracking-email webhook, Stripe Tax, get polo/towel set up in Printify (only "Cap" exists). Then PR `poc/merch → main`. Spec: `docs/superpowers/specs/2026-08-14-merch-stripe-printify-design.md`.
3. **Michelle's Dashboard (Phase 1: Events) — BUILT on `feat/michelle-dashboard`.** Bespoke `src/admin/` SPA (plain HTML/CSS/vanilla JS, supabase-js via pinned CDN) replaces Sveltia for events: email+password login, events CRUD + image upload + drag-reorder, events-page hero editor. Supabase is the source of truth; the build reads published rows (`src/_data/events.js` / `siteContent.js`) with a `data/*.seed.json` fallback when env is absent. Save → `/api/publish` (Netlify Function) verifies the session and pings `NETLIFY_BUILD_HOOK` to rebuild. **Sveltia (`src/admin/config.yml` + GitHub OAuth) is retired.** Owner go-live steps (Supabase account, build hook, env, migration apply, deploy-preview QA): `docs/superpowers/specs/2026-08-19-michelle-dashboard-handoff.md`. Design spec: `docs/superpowers/specs/2026-08-19-michelle-dashboard-events-design.md`; plan: `docs/superpowers/plans/2026-08-19-michelle-dashboard.md`. **Phase 2a (Site Content) — SHIPPED on `feat/site-content-mgmt`.** The dashboard's Site Content view now edits every page's hero, not just events; `siteContent.js` serves per-page heroes with seed fallback; migration `0004_site_content_pages.sql` pre-seeds a `site_content` row per page; hero image uploads reuse the existing `event-media` Storage bucket. **Phase 3 (CRM lead-intake, read-only) — SHIPPED on `feat/crm-lead-intake`.** The CRM nav shows website-captured leads from `contacts`/`contact_inquiries` (RLS `0005`, authenticated-only); GHL remains the working CRM; the one-time **GHL → Supabase contact import is a deliberate go-live task** (run on launch day). **Phase 4 (event ticketing, Stripe test mode) — SHIPPED on `feat/event-ticketing`.** Buyer-only checkout on the public event page with server-verified member pricing (the browser never sends a price); one QR-bearing ticket issued per seat; token-link attendee assignment (`/tickets/manage/?token=`) that feeds the CRM; a dashboard roster per event and a real Registrations count on the Events stat row. Ticket email is dormant until `RESEND_API_KEY` is set (Stripe's own receipt still sends). Go-live steps: `docs/superpowers/specs/2026-08-19-michelle-dashboard-handoff.md`. **Phase 5 (event check-in) — SHIPPED on `feat/event-checkin`.** QR tickets rendered from `qr_token` (vendored `qrcode-generator`); session-verified `/api/tickets/checkin` endpoint; phone-first Check-in dashboard view with BarcodeDetector camera scanning, manual ticket-number entry, door capture that syncs unnamed seats to GHL, offline retry queue, and a running roster. Attendance lands in `event_attendance` and is additive (never mutates ticket status, not cleared on expiry). Migration `0009_event_checkin.sql` adds unique constraint, event index, and authenticated-read policy; check-in requires no new secrets. **Camera QR scanning: root cause found and fixed 2026-08-21 (native `BarcodeDetector` could stall forever with no fallback) — see "RESOLVED" section below. Confirmed working by the owner on Android. Manual ticket-number entry remains available.**
4. **Member portal (Plan C / Phase 2):** portal via **GHL native** (memberships/community); Supabase stays the fact-store. Not started. Doc: `docs/superpowers/specs/2026-08-14-member-portal-and-cms-architecture.md`. (The CMS half of this thread is now delivered by the dashboard above.) When the member portal gives end users Supabase Auth accounts, the `0005` `to authenticated` read policies on `contacts`/`contact_inquiries` MUST first be tightened to an owner/admin identity check (e.g. an admins table or email pin) — otherwise every member could read the lead database. The same tightening applies to `0009`'s `to authenticated` read policy on `event_attendance`, and to `/api/tickets/checkin`, which currently authorizes on any valid session rather than an admin identity — otherwise every member could read the attendance roster or check tickets in.
4. **DNS migration (Wix → Cloudflare) — owner-run, NOT STARTED.** Wix is both registrar and DNS host; its DNS tooling cannot carry the SPF/DKIM/DMARC records Resend needs, so ticket email stays dormant until this lands. Move nameservers to Cloudflare **early and separately** from the site cutover — delegation has a 24-48h rollback, a record change has a five-minute one. Google Workspace mail rides on the same zone, so the Cloudflare zone must be a byte-for-byte copy before switching. Full plan, sequencing and mail-protection checklist: `docs/superpowers/specs/2026-08-22-dns-migration-cloudflare.md`. **Do not cancel the Wix account — the domain is registered there.**
4. **Go-live:** Netlify is **not connected** to this repo yet. Connect it (main = production branch, set env vars in Netlify UI per `.env.example` + `netlify.toml` contexts). DNS cutover is post-Aug 27 (site stays dark until then).
5. **Partner courtesy:** confirm The Tips Golf Miami is OK with the corporate photo (credit already added).

---

## RESOLVED — QR check-in scanner would not decode (2026-08-21)

**Status: FIXED in `c0b5fec` + `2859f6e` (Codex). Confirmed working on the owner's Android device 2026-08-21.**
The root cause was hypothesis H1 below: the native `BarcodeDetector` was preferred
and, once chosen, never yielded — with no path back to jsQR. Four faults total were
found across this investigation; the first three were real but secondary.

**The fix:** `shouldFallbackToJsqr()` (`src/admin/lib.js`, unit-tested) switches the
live decoder from native to jsQR after 3.5s of frames with no read, and says so on
screen. A confirmation overlay now covers the camera after each scan and pauses
scanning until acknowledged, so a result cannot be missed at the door.

**Still open:** hypothesis H2 (no resolution/focus constraints on `getUserMedia`)
was NOT addressed. If scanning is slow or needs the code held very close, that is
the next thing to fix. H3 (per-frame cost) is also untouched.

The history below is retained because it records what was already ruled out.

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

### The diagnostic that settled it

*(Answered: the native detector was being selected and then stalling.)* The
on-screen diagnostics line remains the fastest way to narrow any future scanner
report. It reads:

`QR decoder: loaded|MISSING · built-in: yes|no`

Get this first — it splits the remaining hypotheses cleanly. `built-in: yes`
points at H1; `built-in: no` + `loaded` points at H2/H3.

### Ranked hypotheses

**H1 — CONFIRMED ROOT CAUSE. Native `BarcodeDetector` is selected and is the
thing that does not work.** `src/admin/app.js:1172`:

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
