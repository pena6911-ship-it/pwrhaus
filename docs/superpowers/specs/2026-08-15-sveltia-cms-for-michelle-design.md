# PWRHaus - Sveltia CMS for Michelle Design Spec

**Date:** 2026-08-15
**Status:** Approved direction, ready for implementation planning
**Source docs:** `2026-08-14-phase-2-roadmap.md` workstream D and `2026-08-14-member-portal-and-cms-architecture.md` D3/D4

---

## 1. Purpose

Give Michelle a focused site-management UI for routine edits without building a custom admin
platform. The CMS edits structured content in Git; Eleventy keeps rendering the public site.
This is Phase 2A. It does not build the GHL member portal, CRM dashboard, sponsor automation,
Inner Circle flow, merch productionization, or Netlify go-live.

## 2. Decisions

### D1. Use Sveltia CMS

Use Sveltia CMS with the GitHub backend against `pena6911-ship-it/pwrhaus`. Sveltia is a
static admin UI; it adds `admin/index.html` and `admin/config.yml` to the Eleventy source.
No npm dependency or client-side framework is added.

### D2. Start With CMS Content, Not Page Building

Michelle can edit structured content. She cannot redesign templates, add arbitrary HTML,
change CSS tokens, or modify navigation structure in this increment.

Editable in Phase 2A:
- Events in `src/_data/events.json`
- Reusable page content in `src/_data/siteContent.json`
- CMS-uploaded images under `src/img/cms/`

Code-only in Phase 2A:
- Layouts, macros, navigation, forms, conversion sources, CSS, scripts, Netlify functions
- Merch catalog, because this branch currently builds merch dynamically from Printify
- Member portal configuration, because that lives in GHL

### D3. Editorial Workflow Before Production

Use Sveltia's editorial workflow once the GitHub auth app is configured. CMS changes should
create reviewable Git changes instead of silently editing `main`. This protects production,
avoids surprise Netlify publishes, and matches the project rule that human review happens
before changes reach GitHub production flow.

Implementation may include a local/test CMS mode for development, but production config is
GitHub-backed and review-first.

### D4. Events Are The First Real Content Model

Events are highest-churn and already identified by the marketing-site spec as content a
git-based CMS edits. Add `src/_data/events.json` and render it on `/events/`. The file is
an object with an `events` array so Sveltia's file collection can edit it cleanly:

```json
{
  "events": []
}
```

Each item in `events` has:
- `slug`
- `name`
- `city`
- `venue`
- `starts_at`
- `price_cents`
- `capacity`
- `summary`
- `body`
- `image`
- `image_alt`
- `published`
- `registration_url`

`published: false` events are hidden from public event lists and event detail pages. Past vs
upcoming is derived from `starts_at`, not hand-entered.

### D5. Page Content Is A Narrow File Collection

Add `src/_data/siteContent.json` for copy that benefits from gentle editing without turning every
template into a CMS page. Phase 2A includes only:
- Events page hero eyebrow, heading, lead, video, poster
- Home intro image alt text, if needed later

Templates read from `siteContent.json` with existing fallback copy so a missing field cannot blank
the site.

### D6. Media Storage Stays In The Repo

CMS uploads go to `src/img/cms/` and publish as `/img/cms/...`. Images still need meaningful alt
text in the content model. The existing build copies `src/img` assets to the public output, so
no media service is introduced.

### D7. Preserve The Existing Design System

All rendered CMS content must use existing components and tokens:
- No new CSS palette, no `box-shadow`, no `max-width` media queries
- One `<h1>` per page
- Every `<img>` has non-empty alt text
- Touch targets remain 44px minimum
- Footer credit remains on every page

## 3. User Flow

1. Michelle opens `/admin/`.
2. She signs in with GitHub through the configured Sveltia backend.
3. She edits an event or event-page copy.
4. The CMS saves a reviewable Git change.
5. A human reviews, merges, and deploys when appropriate.
6. Eleventy rebuilds and renders the updated public site.

## 4. Acceptance Criteria

- `/admin/` loads the Sveltia CMS UI in a local build.
- `admin/config.yml` is valid YAML and points at `pena6911-ship-it/pwrhaus`.
- `src/_data/events.json` exists and drives the `/events/` page.
- `/events/` renders upcoming and past event sections from the data file.
- Each published event gets a detail page at `/events/<slug>/`.
- An unpublished event is not linked from `/events/` and does not generate a public detail page.
- Event images render with non-empty alt text and use the existing rounded media style.
- `npm run build` succeeds.
- `npm test` passes.

## 5. Out Of Scope

- Netlify connection/go-live
- GitHub OAuth app setup in a live production environment
- Preview deployments
- Member portal, login, member directory, perks, virtual lessons
- Merch productionization
- CRM/GHL reconciliation jobs
- Sponsor automation
- Inner Circle online payment/application flow

## 6. External Notes

Sveltia's current documentation says it supports GitHub as a Git-based backend, supports a
configurable branch, supports internal media folders, and offers simple vs editorial workflows.
This spec uses those capabilities but keeps implementation constrained to static files in this
repo.

## 7. Implementation Status

Initial CMS implementation shipped with:
- `/admin/` Sveltia boot page
- GitHub backend configuration for `pena6911-ship-it/pwrhaus`
- Editorial workflow
- `src/_data/events.json`
- `src/_data/siteContent.json`
- CMS media folder at `src/img/cms/`
- Data-driven `/events/` page and generated published event detail pages
