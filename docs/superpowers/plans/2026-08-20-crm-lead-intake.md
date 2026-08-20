# CRM Lead-Intake View (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only CRM view in the dashboard: pulse stats, a searchable/filterable contact list from `contacts`, and a per-contact drawer showing the `contact_inquiries` ledger.

**Architecture:** Activates the disabled CRM nav item as a new `#view-crm` built on the Events-view patterns (stat row + list + slide-over drawer). Reads Supabase with Michelle's authenticated session (the `0005` RLS policies grant `select` on `contacts`/`contact_inquiries` to `authenticated` only). Stats come from head-count queries; the list is a newest-first limited query with server-side `ilike` search and `eq` filters; inquiry counts come via PostgREST embedded `contact_inquiries(count)`. No new schema, no writes.

**Tech Stack:** Vanilla-JS dashboard SPA (`src/admin/`), vendored supabase-js, `node --test`.

## Global Constraints

- **Branch:** work on the feature branch the controller creates from `main`. Commit locally, **never push**. Stage only explicit paths (never `git add -A`).
- **Shell is Windows PowerShell 5.1** — no `&&`; use `;` or separate lines. Bash tool available.
- **`npm test` MUST stay green** at every task boundary (baseline: **124 tests**). No new dependencies, no build step.
- **Read-only:** no insert/update/delete anywhere in this feature. No new Supabase tables/columns/policies.
- **Page registry of tiers:** `free` → "Free", `member` → "Member", `inner_circle` → "Inner circle".
- **Reuse existing `app.js` helpers unchanged:** `$`, `$$`, `state`, `toast`, `show`, `eventDateLabel`, `escapeHtml`, `escapeAttr`, and the `.drawer`/`.drawer-panel`/`.drawer-scrim` CSS classes.

---

## File Structure

**Modify**
- `src/admin/lib.js` — add pure `weekAgoIso(nowMs)` + `tierLabel(tier)`.
- `src/_data/admin.js` — expose `ghlLocationId` (public GHL location id, already treated as public — it's embedded in capture forms and listed in `SECRETS_SCAN_OMIT_KEYS`).
- `src/admin/index.html` — enable CRM nav, add bottom-nav CRM tab, add `#view-crm` + `#contact-drawer`, add `ghlLocationId` to `window.__PWRHAUS`.
- `src/admin/app.js` — CRM section (`loadCrm`, `renderCrmStats`, `renderContactList`, search/filter handlers, `openContactDrawer`) + `wireNav` integration.
- `src/admin/admin.css` — contact rows, tier badges, controls bar, 4-column bottom nav.
- `test/admin-lib.test.js`, `test/admin-data.test.js`, `test/build-output.test.js`.

---

## Task 1: Pure helpers + admin env plumbing

**Files:**
- Modify: `src/admin/lib.js`, `src/_data/admin.js`
- Test: `test/admin-lib.test.js`, `test/admin-data.test.js`

**Interfaces:**
- Produces: `weekAgoIso(nowMs?: number) → string` (ISO timestamp exactly 7 days before `nowMs`, defaulting to now); `tierLabel(tier: string) → string` (`free`→`Free`, `member`→`Member`, `inner_circle`→`Inner circle`, unknown→the raw input); `admin()` global gains `ghlLocationId: string` (empty when env absent). Task 2 imports the helpers and injects `ghlLocationId` into `window.__PWRHAUS`.

- [ ] **Step 1: Write the failing tests.** Append to `test/admin-lib.test.js` (extend the existing import from `../src/admin/lib.js` with `weekAgoIso, tierLabel`):

```js
test('weekAgoIso returns the ISO instant 7 days before the reference', () => {
  const ref = Date.parse('2026-08-20T12:00:00.000Z');
  assert.equal(weekAgoIso(ref), '2026-08-13T12:00:00.000Z');
  // Default reference is "now": result must parse and sit ~7 days back.
  const ms = Date.now() - Date.parse(weekAgoIso());
  assert.ok(ms > 6.9 * 864e5 && ms < 7.1 * 864e5);
});

test('tierLabel maps known tiers and passes unknown through', () => {
  assert.equal(tierLabel('free'), 'Free');
  assert.equal(tierLabel('member'), 'Member');
  assert.equal(tierLabel('inner_circle'), 'Inner circle');
  assert.equal(tierLabel('mystery'), 'mystery');
});
```

Append to `test/admin-data.test.js` (inside the existing env-juggling style):

```js
test('admin config exposes the public GHL location id (empty when absent)', async () => {
  const prev = process.env.GHL_LOCATION_ID;
  delete process.env.GHL_LOCATION_ID;
  try {
    assert.equal((await load('ghl-empty')).ghlLocationId, '');
    process.env.GHL_LOCATION_ID = 'loc-123';
    assert.equal((await load('ghl-set')).ghlLocationId, 'loc-123');
  } finally {
    if (prev === undefined) delete process.env.GHL_LOCATION_ID; else process.env.GHL_LOCATION_ID = prev;
  }
});
```

- [ ] **Step 2: Run to confirm failure** — `cd C:\dev\pwrhaus; node --test test/admin-lib.test.js test/admin-data.test.js` → FAIL (missing exports / property).

- [ ] **Step 3: Implement.** In `src/admin/lib.js` add:

```js
export function weekAgoIso(nowMs = Date.now()) {
  return new Date(nowMs - 7 * 864e5).toISOString();
}

export function tierLabel(tier) {
  return { free: 'Free', member: 'Member', inner_circle: 'Inner circle' }[tier] ?? String(tier ?? '');
}
```

In `src/_data/admin.js` add to the returned object:

```js
    ghlLocationId: process.env.GHL_LOCATION_ID || '',
```

- [ ] **Step 4: Run to confirm pass** — same command → PASS. Then full `npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add src/admin/lib.js src/_data/admin.js test/admin-lib.test.js test/admin-data.test.js
git commit -m "feat(admin): weekAgoIso + tierLabel helpers; expose public GHL location id"
```

---

## Task 2: The CRM view (HTML + CSS + app.js)

**Files:**
- Modify: `src/admin/index.html`, `src/admin/admin.css`, `src/admin/app.js`
- Test: `test/build-output.test.js`

**Interfaces:**
- Consumes: Task 1's `weekAgoIso`, `tierLabel`; existing `$`, `$$`, `state`, `toast`, `show`, `eventDateLabel`, `escapeHtml`, `sb`; `window.__PWRHAUS.ghlLocationId`.
- Produces: the working read-only CRM view. Nothing downstream consumes it.

> **Testing note:** this is DOM code; automated coverage is the build-output assertion below plus syntax/build checks. Behavior is proven by the manual checklist (needs a dev Supabase session) — same convention as the Events and Site Content views.

- [ ] **Step 1: Add the failing build assertions.** In `test/build-output.test.js` add:

```js
test('admin ships the enabled CRM view', () => {
  const html = readFileSync(join(outDir, 'admin', 'index.html'), 'utf8');
  assert.match(html, /data-view="crm"/, 'CRM nav must be enabled');
  assert.doesNotMatch(html, /disabled title="Coming soon">CRM/, 'CRM must no longer be a disabled placeholder');
  assert.match(html, /id="view-crm"/, 'CRM view container must ship');
  assert.match(html, /id="contact-list"/, 'contact list container must ship');
  assert.match(html, /ghlLocationId/, 'admin must inject the GHL location id');
});
```

- [ ] **Step 2: Run to confirm failure** — `node --test test/build-output.test.js` → the new test FAILs.

- [ ] **Step 3: `src/admin/index.html` changes** (four spots):

1. `window.__PWRHAUS` line becomes:
```html
      window.__PWRHAUS = { supabaseUrl: "{{ admin.supabaseUrl }}", supabaseAnonKey: "{{ admin.supabaseAnonKey }}", ghlLocationId: "{{ admin.ghlLocationId }}" };
```
2. Sidebar nav — replace `<button class="nav-item" disabled title="Coming soon">CRM</button>` with:
```html
          <button class="nav-item" data-view="crm">CRM</button>
```
(The "Settings" placeholder stays disabled.)
3. Bottom nav — insert before the `new-event-tab` button:
```html
        <button class="tab" data-view="crm">CRM</button>
```
4. After the `#view-settings` section, add the CRM view; and after `#event-drawer`, add the contact drawer:
```html
        <section id="view-crm" class="view" hidden>
          <div class="view-head"><h2>Leads</h2></div>
          <div class="stat-row" id="crm-stat-row"><!-- stats injected --></div>
          <div class="crm-controls" id="crm-controls">
            <input type="search" id="crm-search" placeholder="Search name or email" aria-label="Search contacts">
            <select id="crm-tier" aria-label="Filter by tier">
              <option value="">All tiers</option>
              <option value="free">Free</option>
              <option value="member">Member</option>
              <option value="inner_circle">Inner circle</option>
            </select>
            <select id="crm-source" aria-label="Filter by source"><option value="">All sources</option></select>
          </div>
          <div class="contact-list" id="contact-list" aria-live="polite"><!-- rows injected --></div>
        </section>
```
```html
    <div id="contact-drawer" class="drawer" hidden aria-hidden="true" role="dialog" aria-modal="true" aria-label="Contact details">
      <div class="drawer-scrim" data-close-contact></div>
      <div class="drawer-panel" id="contact-panel"><!-- contact detail injected --></div>
    </div>
```

- [ ] **Step 4: `src/admin/admin.css` additions** (near the event-list rules; and update the bottom-nav grid):

Change `.bottom-nav { ... grid-template-columns: repeat(3, 1fr); ... }` to `repeat(4, 1fr)`.

Add:
```css
/* ---------- CRM (leads) ---------- */
.crm-controls { display: grid; gap: var(--space-3); margin-bottom: var(--space-5); }
@media (min-width: 768px) { .crm-controls { grid-template-columns: 2fr 1fr 1fr; } }
.contact-list { display: grid; gap: var(--space-3); }
.contact-row {
  background: var(--paper-raised); border: 1px solid var(--line);
  border-radius: var(--radius); padding: var(--space-4);
  display: grid; gap: var(--space-1); text-align: left; cursor: pointer;
  font: inherit; color: inherit; width: 100%;
}
.contact-row:hover { border-color: var(--forest); }
.contact-row .who { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.contact-row .name { font-weight: 700; }
.contact-row .meta { color: var(--ink-muted); font-size: 14px; }
.badge.tier-free { background: var(--paper); color: var(--ink-muted); border: 1px solid var(--line); }
.badge.tier-member { background: rgba(26, 77, 54, .12); color: var(--forest); }
.badge.tier-inner_circle { background: var(--forest-deep); color: #fff; }
.inquiry-item { border-top: 1px solid var(--line); padding: var(--space-3) 0; }
.inquiry-item .meta { color: var(--ink-muted); font-size: 13px; }
```

- [ ] **Step 5: `src/admin/app.js` — the CRM section.** Extend the `lib.js` import with `weekAgoIso, tierLabel`. In `wireNav()`, add `#view-crm` to `go()` and load on entry:

```js
  const go = (view) => {
    show($('#view-events'), view === 'events');
    show($('#view-settings'), view === 'settings');
    show($('#view-crm'), view === 'crm');
    if (view === 'crm') loadCrm();
    $$('.nav-item[data-view], .tab[data-view]').forEach((b) => {
      if (b.dataset.view === view) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
  };
```

In `boot()`, after `wireSettings();` add `wireCrm();`. Then add the section (before the publish-indicator section):

```js
/* ============================ CRM (read-only lead intake) ============================ */

const CRM_PAGE_SIZE = 100;

let crmWired = false;
function wireCrm() {
  if (crmWired) return;
  crmWired = true;
  let t = null;
  $('#crm-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(loadContactList, 250); });
  $('#crm-tier').addEventListener('change', loadContactList);
  $('#crm-source').addEventListener('change', loadContactList);
  $('#contact-drawer').addEventListener('click', (e) => { if (e.target.closest('[data-close-contact]')) closeContactDrawer(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#contact-drawer').hidden) closeContactDrawer(); });
}

async function loadCrm() {
  renderCrmStats(null); // skeleton state
  await Promise.all([loadCrmStats(), loadContactList()]);
}

async function loadCrmStats() {
  const count = (q) => q.then(({ count: n, error }) => (error ? null : n));
  const [total, fresh, members, inner] = await Promise.all([
    count(sb.from('contacts').select('*', { count: 'exact', head: true })),
    count(sb.from('contacts').select('*', { count: 'exact', head: true }).gte('created_at', weekAgoIso())),
    count(sb.from('contacts').select('*', { count: 'exact', head: true }).eq('tier', 'member')),
    count(sb.from('contacts').select('*', { count: 'exact', head: true }).eq('tier', 'inner_circle')),
  ]);
  renderCrmStats({ total, fresh, members, inner });
}

function renderCrmStats(s) {
  const tiles = [
    { k: 'Contacts', n: s?.total },
    { k: 'New this week', n: s?.fresh },
    { k: 'Members', n: s?.members },
    { k: 'Inner circle', n: s?.inner },
  ];
  const row = $('#crm-stat-row');
  row.innerHTML = '';
  for (const tdef of tiles) {
    const el = document.createElement('div');
    el.className = 'stat';
    const n = document.createElement('div'); n.className = 'n'; n.textContent = tdef.n == null ? '—' : String(tdef.n);
    const k = document.createElement('div'); k.className = 'k'; k.textContent = tdef.k;
    el.append(n, k);
    row.appendChild(el);
  }
}

async function loadContactList() {
  const list = $('#contact-list');
  list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
  let q = sb.from('contacts')
    .select('id,email,full_name,phone,tier,source,notes,created_at,ghl_contact_id,contact_inquiries(count)')
    .order('created_at', { ascending: false })
    .limit(CRM_PAGE_SIZE);
  const term = $('#crm-search').value.trim().replace(/[,()]/g, ' ').trim();
  if (term) q = q.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  const tier = $('#crm-tier').value;
  if (tier) q = q.eq('tier', tier);
  const source = $('#crm-source').value;
  if (source) q = q.eq('source', source);
  const { data, error } = await q;
  if (error) { toast('Could not load contacts.', 'error'); list.innerHTML = ''; return; }
  state.contacts = data || [];
  populateSourceFilter(state.contacts);
  renderContactList();
}

// Fill the source dropdown from sources seen so far; never remove the current pick.
function populateSourceFilter(rows) {
  const sel = $('#crm-source');
  const have = new Set($$('option', sel).map((o) => o.value));
  for (const r of rows) {
    if (r.source && !have.has(r.source)) {
      have.add(r.source);
      const o = document.createElement('option');
      o.value = r.source; o.textContent = r.source;
      sel.appendChild(o);
    }
  }
}

function renderContactList() {
  const list = $('#contact-list');
  list.innerHTML = '';
  if (!state.contacts.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No contacts match.';
    list.appendChild(empty);
    return;
  }
  for (const c of state.contacts) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'contact-row';
    row.dataset.id = c.id;

    const who = document.createElement('div'); who.className = 'who';
    const name = document.createElement('span'); name.className = 'name';
    name.textContent = c.full_name || c.email;
    const badge = document.createElement('span');
    badge.className = `badge tier-${c.tier}`;
    badge.textContent = tierLabel(c.tier);
    who.append(name, badge);

    const meta = document.createElement('div'); meta.className = 'meta';
    const inquiries = c.contact_inquiries?.[0]?.count ?? 0;
    meta.textContent = `${c.email} · ${c.source || 'site'} · joined ${eventDateLabel(c.created_at)} · ${inquiries} ${inquiries === 1 ? 'inquiry' : 'inquiries'}`;

    row.append(who, meta);
    row.addEventListener('click', () => openContactDrawer(c));
    list.appendChild(row);
  }
}

async function openContactDrawer(c) {
  const panel = $('#contact-panel');
  const ghlLoc = cfg.ghlLocationId;
  const ghlLink = c.ghl_contact_id && ghlLoc
    ? `<p><a href="https://app.gohighlevel.com/v2/location/${escapeAttr(ghlLoc)}/contacts/detail/${escapeAttr(c.ghl_contact_id)}" target="_blank" rel="noopener">View in GHL</a></p>`
    : (c.ghl_contact_id ? '<p class="meta">Synced to GHL</p>' : '');
  panel.innerHTML =
    `<h3>${escapeHtml(c.full_name || c.email)}</h3>` +
    `<p class="meta">${escapeHtml(c.email)}${c.phone ? ' · ' + escapeHtml(c.phone) : ''}</p>` +
    `<p><span class="badge tier-${escapeAttr(c.tier)}">${escapeHtml(tierLabel(c.tier))}</span></p>` +
    `<p class="meta">Source: ${escapeHtml(c.source || 'site')} · joined ${escapeHtml(eventDateLabel(c.created_at))}</p>` +
    (c.notes ? `<p>${escapeHtml(c.notes)}</p>` : '') +
    ghlLink +
    `<h3>Inquiries</h3><div id="inquiry-list"><div class="skeleton"></div></div>` +
    `<div class="drawer-actions"><button class="btn btn-secondary" type="button" data-close-contact>Close</button></div>`;
  const drawer = $('#contact-drawer');
  drawer.hidden = false;
  drawer.setAttribute('aria-hidden', 'false');

  const { data, error } = await sb.from('contact_inquiries')
    .select('source,notes,created_at')
    .eq('contact_id', c.id)
    .order('created_at', { ascending: false });
  const box = $('#inquiry-list');
  if (error) { box.innerHTML = '<p class="meta">Could not load inquiries.</p>'; return; }
  box.innerHTML = '';
  if (!data.length) { box.innerHTML = '<p class="meta">No inquiries recorded.</p>'; return; }
  for (const i of data) {
    const item = document.createElement('div');
    item.className = 'inquiry-item';
    const meta = document.createElement('p'); meta.className = 'meta';
    meta.textContent = `${i.source} · ${eventDateLabel(i.created_at)}`;
    item.appendChild(meta);
    if (i.notes) { const p = document.createElement('p'); p.textContent = i.notes; item.appendChild(p); }
    box.appendChild(item);
  }
}

function closeContactDrawer() {
  const drawer = $('#contact-drawer');
  drawer.hidden = true;
  drawer.setAttribute('aria-hidden', 'true');
}
```

Also add `contacts: []` to the `state` object literal at the top of `app.js`.

- [ ] **Step 6: Verify** — `node --check src/admin/app.js` → OK; `npm run build` → succeeds; `node --test test/build-output.test.js` → the new assertion PASSes; full `npm test` → green.

- [ ] **Step 7: Manual verification** (`netlify dev` against dev Supabase, logged in): CRM nav (sidebar + bottom tab) opens the Leads view; the four stats show real counts; the list loads newest-first with tier badges + inquiry counts; typing in search filters by name/email (250ms debounce); tier + source filters work; clicking a row opens the drawer with contact info + inquiry history; a contact with `ghl_contact_id` shows "View in GHL" (link opens GHL; if the deep-link URL pattern is off, note it — the fallback is cosmetic); Escape and the Close button dismiss the drawer.

- [ ] **Step 8: Commit**

```bash
git add src/admin/index.html src/admin/admin.css src/admin/app.js test/build-output.test.js
git commit -m "feat(admin): read-only CRM lead-intake view (stats, search, inquiry drawer)"
```

---

## Task 3: Docs

**Files:**
- Modify: `AGENTS.md`, `docs/superpowers/specs/2026-08-19-michelle-dashboard-handoff.md`

- [ ] **Step 1:** In `AGENTS.md`'s dashboard thread, append: Phase 3 (CRM lead-intake, read-only) shipped — the CRM nav shows website-captured leads from `contacts`/`contact_inquiries` (RLS `0005`, authenticated-only); GHL remains the working CRM; the one-time **GHL → Supabase contact import is a deliberate go-live task** (run on launch day).
- [ ] **Step 2:** In the handoff doc, add to the Supabase go-live list: apply `0005_lock_down_pii.sql` (if not already applied); and add a go-live task line: "Run the one-time GHL → Supabase contact import (build near launch; see CRM spec §1)."
- [ ] **Step 3:** Full sweep — `npm test` green; `npm run build` succeeds. Record the final count.
- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/superpowers/specs/2026-08-19-michelle-dashboard-handoff.md
git commit -m "docs: Phase 3 CRM lead-intake shipped; 0005 + GHL import in go-live list"
```

---

## Self-Review

**Spec coverage:** §2 data/queries (counts, embedded inquiry count, ilike search, eq filters, detail query) → Task 2 Step 5. §3 UI (stats, controls, rows, badges, drawer, GHL link, empty/skeleton) → Task 2 Steps 3–5. §4 structure (lib helpers, admin.js env, nav wiring) → Tasks 1–2. §5 testing (helper tests, build assertions, manual checklist) → Tasks 1–2. §6 out-of-scope respected (no writes, no import, no sync). §7 branch → Global Constraints.

**Placeholder scan:** the only intentionally-deferred item is manual confirmation of GHL's deep-link URL pattern (Task 2 Step 7, explicitly flagged with a harmless fallback). All code is complete.

**Type consistency:** `weekAgoIso`/`tierLabel` signatures match between Task 1 (definition/tests) and Task 2 (import/usage). `cfg.ghlLocationId` matches the `window.__PWRHAUS` injection and `admin.js` key. `state.contacts`, `#crm-*`/`#contact-*` ids, and `data-close-contact` are used consistently across Steps 3/5. `contact_inquiries?.[0]?.count` matches PostgREST's embedded-count shape.
