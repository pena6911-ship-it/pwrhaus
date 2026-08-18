# GHL Member Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure a GHL-native member portal and add conditional website entry points that appear only when a real portal URL is configured.

**Architecture:** GHL owns portal login, access control, courses, community, and profile management. The Eleventy site exposes a single `site.portalUrl` value from `GHL_PORTAL_URL`; templates render member-login links only when that value is non-empty. The GHL setup is documented as an operations checklist because most of Phase 2B happens inside Michelle's GHL account, not in repo code.

**Tech Stack:** Eleventy v3, Nunjucks, vanilla JS/CSS, Node `node:test`, GoHighLevel Client Portal/Memberships/Communities/Courses/Workflows.

**Spec:** `docs/superpowers/specs/2026-08-17-ghl-member-portal-design.md`

## Global Constraints

- Do not add npm dependencies or a new frontend framework.
- Shell is Windows PowerShell 5.1; do not use `&&`.
- Use `git add -u` for tracked files and explicit paths for new files; never use `git add -A`.
- Do not run `git push`.
- Preserve Clubhouse Light tokens; do not substitute colors, type, spacing, or radii.
- CSS remains mobile-first with `min-width` media queries only.
- No `box-shadow`.
- Never use `color: var(--brass)` for text; use `--brass-text`.
- Every `<img>` rendered by the public site has non-empty alt text.
- Every built public page has exactly one `<h1>`.
- F&Co footer credit remains on every public page.
- GHL is the member portal; do not add custom website auth, sessions, passwords, or protected static member pages.
- Directory visibility is off by default and opt-in per field.
- Website member-login links render only when `GHL_PORTAL_URL` is configured.

---

## File Structure

- Create `docs/operations/ghl-member-portal-checklist.md`: owner-facing setup and verification checklist for the GHL portal, workflows, access groups, courses, community, and directory privacy.
- Modify `src/_data/site.js`: expose `portalUrl` from `process.env.GHL_PORTAL_URL || ''`.
- Create `test/site-data.test.js`: verify `site.portalUrl` defaults to `''` and reads `GHL_PORTAL_URL`.
- Modify `src/_includes/partials/header.njk`: render desktop and mobile "Member Login" links only when `site.portalUrl` exists.
- Modify `src/_includes/partials/footer.njk`: render a footer "Member Login" utility link only when `site.portalUrl` exists.
- Modify `src/membership.njk`: render "Enter Member Portal" CTAs only when `site.portalUrl` exists; keep free-profile CTAs unchanged when it is empty.
- Modify `test/build-output.test.js`: verify built output hides portal links by default and renders them when `GHL_PORTAL_URL` is set.
- Leave `src/js/form.js` unchanged: after a successful capture-form submit, preserve the existing `/thanks/` redirect; no portal invite logic is added client-side.
- Modify `src/thanks.njk`: include copy telling users to check email for the portal invite. This page remains useful before the portal URL exists.

---

### Task 1: GHL Portal Operations Checklist

**Files:**
- Create: `docs/operations/ghl-member-portal-checklist.md`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-08-17-ghl-member-portal-design.md`
- Produces: a concrete manual checklist that Michelle or an operator can follow inside GHL before the website exposes login links.

- [ ] **Step 1: Create the operations directory**

Run:

```powershell
New-Item -ItemType Directory -Force -Path docs\operations
```

Expected: `docs\operations` exists.

- [ ] **Step 2: Create the GHL checklist**

Create `docs/operations/ghl-member-portal-checklist.md` with this exact content:

```markdown
# PWRHaus GHL Member Portal Checklist

**Purpose:** Configure the GHL-native member portal described in `docs/superpowers/specs/2026-08-17-ghl-member-portal-design.md`.

## Access Model

- Free contacts can log in.
- Free contacts can see profile/orientation/events and locked upgrade prompts.
- Paid `member` contacts can access member directory, virtual lessons, paid perks, and account management.
- Paid `inner_circle` contacts can access all `member` content plus future Inner Circle-only areas.
- Directory visibility starts off for every contact.

## GHL Areas To Create Or Confirm

- Client Portal login is enabled.
- Free member area exists.
- Paid member area exists.
- Virtual lessons course area exists.
- Community space exists.
- Directory or community profile fields exist with opt-in visibility.

## Contact Tags Or Fields

- `pwrhaus_tier`: `free`, `member`, `inner_circle`
- `pwrhaus_portal_invited`: boolean
- `pwrhaus_directory_opt_in`: boolean, default false
- `pwrhaus_directory_display_name_visible`: boolean, default false
- `pwrhaus_directory_company_visible`: boolean, default false
- `pwrhaus_directory_role_visible`: boolean, default false
- `pwrhaus_directory_city_visible`: boolean, default false
- `pwrhaus_directory_website_visible`: boolean, default false
- `pwrhaus_directory_linkedin_visible`: boolean, default false
- `pwrhaus_directory_email_visible`: boolean, default false
- `pwrhaus_directory_phone_visible`: boolean, default false

## Workflows

- New website contact with `pwrhaus_tier = free` receives a portal invite.
- Existing GHL contact is updated, not duplicated.
- Paid upgrade changes `pwrhaus_tier` to `member` or `inner_circle`.
- Failed invite or bounced email is visible for manual follow-up.
- Portal invite workflow does not require a website deploy to change email wording.

## Manual Verification

- Submit a new free-profile form from the local website.
- Confirm Supabase receives or updates the contact.
- Confirm GHL receives or updates the contact.
- Confirm the contact receives a portal invite.
- Confirm the contact can log in.
- Confirm free-only access cannot open paid member content.
- Change the contact to `member`.
- Confirm paid member content unlocks.
- Confirm directory is hidden by default.
- Turn on only display name and city.
- Confirm the directory shows only display name and city.
- Turn directory opt-in off.
- Confirm the member no longer appears in the directory.

## Site Handoff Values

- `GHL_PORTAL_URL`: the final login URL from GHL.
- Preferred header label: `Member Login`.
- Preferred footer label: `Member Login`.
- Preferred membership-page label: `Enter Member Portal`.
```

- [ ] **Step 3: Review the checklist for disallowed defaults**

Run:

```powershell
Select-String -Path docs\operations\ghl-member-portal-checklist.md -Pattern 'default true|visible by default|custom auth'
```

Expected: no matches.

- [ ] **Step 4: Commit the checklist**

Run:

```powershell
git add docs\operations\ghl-member-portal-checklist.md
git commit -m "docs: add GHL portal operations checklist"
```

---

### Task 2: Portal URL Data Contract

**Files:**
- Modify: `src/_data/site.js`
- Create: `test/site-data.test.js`

**Interfaces:**
- Produces: `site.portalUrl: string`
- `site.portalUrl` is `''` when `process.env.GHL_PORTAL_URL` is unset.
- `site.portalUrl` equals the exact environment value when `GHL_PORTAL_URL` is set.

- [ ] **Step 1: Write the failing data test**

Create `test/site-data.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

async function loadSiteData(cacheKey) {
  return (await import(`../src/_data/site.js?${cacheKey}`)).default;
}

test('site portalUrl defaults to an empty string', async () => {
  const previous = process.env.GHL_PORTAL_URL;
  delete process.env.GHL_PORTAL_URL;

  try {
    const site = await loadSiteData('portal-default');
    assert.equal(site.portalUrl, '');
  } finally {
    if (previous === undefined) delete process.env.GHL_PORTAL_URL;
    else process.env.GHL_PORTAL_URL = previous;
  }
});

test('site portalUrl reads the configured GHL portal URL', async () => {
  const previous = process.env.GHL_PORTAL_URL;
  process.env.GHL_PORTAL_URL = 'https://portal.example.com/pwrhaus';

  try {
    const site = await loadSiteData('portal-configured');
    assert.equal(site.portalUrl, 'https://portal.example.com/pwrhaus');
  } finally {
    if (previous === undefined) delete process.env.GHL_PORTAL_URL;
    else process.env.GHL_PORTAL_URL = previous;
  }
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```powershell
node --test test\site-data.test.js
```

Expected: FAIL because `site.portalUrl` is undefined.

- [ ] **Step 3: Add `portalUrl` to site data**

Modify `src/_data/site.js` so the exported object includes `portalUrl`:

```js
// Netlify sets URL to the site's primary address, which follows the custom
// domain after DNS cutover. The literal below is only used for local builds —
// it must never be what a production page declares as its canonical.
export default {
  name: 'PWRHaus Golf Society',
  shortName: 'PWRHaus',
  tagline: 'Claim your place on the green',
  description: 'A co-ed society of founders who use golf to find, build, and exit businesses.',
  url: process.env.URL || 'https://pwrhaus.netlify.app',
  portalUrl: process.env.GHL_PORTAL_URL || '',
};
```

- [ ] **Step 4: Run the new test and verify it passes**

Run:

```powershell
node --test test\site-data.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit the data contract**

Run:

```powershell
git add -u
git add test\site-data.test.js
git commit -m "feat: add portal URL site data"
```

---

### Task 3: Conditional Header And Footer Login Links

**Files:**
- Modify: `src/_includes/partials/header.njk`
- Modify: `src/_includes/partials/footer.njk`
- Modify: `test/build-output.test.js`

**Interfaces:**
- Consumes: `site.portalUrl: string` from Task 2.
- Produces: no "Member Login" link in built output when `site.portalUrl === ''`.
- Produces: header, mobile menu, and footer "Member Login" links when `site.portalUrl` is configured.

- [ ] **Step 1: Write the failing default-hidden build test**

Add this test to `test/build-output.test.js` after `the home page hosts the form the nav CTAs anchor to`:

```js
test('member login links are hidden until a GHL portal URL is configured', () => {
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /Member Login/, 'portal links should not render without GHL_PORTAL_URL');
});
```

- [ ] **Step 2: Run the build-output test and verify it passes before template changes**

Run:

```powershell
node --test test\build-output.test.js
```

Expected: PASS because no portal links exist yet.

- [ ] **Step 3: Add a configured-build helper and failing configured test**

Add this helper near the existing `before` block in `test/build-output.test.js`:

```js
function buildWithEnv(extraEnv) {
  const dir = mkdtempSync(join(tmpdir(), 'pwrhaus-build-env-'));
  execFileSync('npx', ['@11ty/eleventy', '--output=' + dir], {
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  return dir;
}
```

Add this test after the default-hidden test:

```js
test('member login links render when a GHL portal URL is configured', () => {
  const dir = buildWithEnv({ GHL_PORTAL_URL: 'https://portal.example.com/pwrhaus' });
  try {
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const matches = html.match(/href="https:\/\/portal\.example\.com\/pwrhaus"/g) || [];
    assert.ok(matches.length >= 2, 'header and footer should link to the configured portal URL');
    assert.match(html, /Member Login/, 'configured portal link should use the approved label');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 4: Run the configured test and verify it fails**

Run:

```powershell
node --test test\build-output.test.js
```

Expected: FAIL because templates do not render `site.portalUrl` yet.

- [ ] **Step 5: Add conditional desktop and mobile header links**

Modify `src/_includes/partials/header.njk`.

In the desktop nav list, after the `nav` loop and before `</ul>`, add:

```njk
        {% if site.portalUrl %}
        <li><a href="{{ site.portalUrl }}">Member Login</a></li>
        {% endif %}
```

In the mobile nav list, after the `nav` loop and before `</ul>`, add:

```njk
        {% if site.portalUrl %}
        <li><a href="{{ site.portalUrl }}">Member Login</a></li>
        {% endif %}
```

- [ ] **Step 6: Add a conditional footer utility link**

Modify `src/_includes/partials/footer.njk`.

In the footer nav list, after the `nav` loop and before `</ul>`, add:

```njk
        {% if site.portalUrl %}
        <li><a href="{{ site.portalUrl }}">Member Login</a></li>
        {% endif %}
```

- [ ] **Step 7: Run the build-output test and verify it passes**

Run:

```powershell
node --test test\build-output.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit the conditional navigation links**

Run:

```powershell
git add -u
git commit -m "feat: add conditional member login links"
```

---

### Task 4: Membership Page Portal CTA And Confirmation Copy

**Files:**
- Modify: `src/membership.njk`
- Modify: `src/thanks.njk`
- Modify: `test/build-output.test.js`

**Interfaces:**
- Consumes: `site.portalUrl: string` from Task 2.
- Produces: membership-page portal CTAs only when `site.portalUrl` is configured.
- Produces: a `/thanks/` page telling form submitters to check email for their portal invite.

- [ ] **Step 1: Confirm the thanks page exists**

Run:

```powershell
Test-Path -LiteralPath src\thanks.njk
```

Expected: `True`.

- [ ] **Step 2: Write failing tests for membership CTA and thanks copy**

Add these tests to `test/build-output.test.js` after the member-login configured test from Task 3:

```js
test('membership page hides portal CTA until a GHL portal URL is configured', () => {
  const html = readFileSync(join(outDir, 'membership', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /Enter Member Portal/, 'membership page should not show portal CTA without GHL_PORTAL_URL');
});

test('membership page renders portal CTA when a GHL portal URL is configured', () => {
  const dir = buildWithEnv({ GHL_PORTAL_URL: 'https://portal.example.com/pwrhaus' });
  try {
    const html = readFileSync(join(dir, 'membership', 'index.html'), 'utf8');
    assert.match(html, /Enter Member Portal/);
    assert.match(html, /href="https:\/\/portal\.example\.com\/pwrhaus"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('thanks page mentions the portal invite email', () => {
  const html = readFileSync(join(outDir, 'thanks', 'index.html'), 'utf8');
  assert.match(html, /check your email/i);
  assert.match(html, /portal invite/i);
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run:

```powershell
node --test test\build-output.test.js
```

Expected: FAIL because the membership portal CTA and/or thanks page invite copy is missing.

- [ ] **Step 4: Add conditional membership-page CTAs**

Modify the Free card action in `src/membership.njk`:

```njk
        <p class="card-actions">
          <a class="btn btn-secondary" href="#join-web_free_profile">Start here</a>
          {% if site.portalUrl %}
          <a class="btn btn-secondary" href="{{ site.portalUrl }}">Enter Member Portal</a>
          {% endif %}
        </p>
```

Modify the Member card action in `src/membership.njk`:

```njk
        <p class="card-actions">
          <a class="btn btn-primary" href="#join-web_free_profile">Create a profile</a>
          {% if site.portalUrl %}
          <a class="btn btn-secondary" href="{{ site.portalUrl }}">Enter Member Portal</a>
          {% endif %}
        </p>
```

- [ ] **Step 5: Update the thanks page copy**

Replace the body of `src/thanks.njk` after the front matter with:

```njk
<section class="section">
  <div class="container">
    <p class="eyebrow">Confirmed</p>
    <h1>Check your email for the next step.</h1>
    <p>We received your profile request. Your portal invite arrives by email after your profile is created in the PWRHaus member system.</p>
    <p><a class="btn btn-secondary" href="/events/">See upcoming events</a></p>
  </div>
</section>
```

- [ ] **Step 6: Run the tests and verify they pass**

Run:

```powershell
node --test test\build-output.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit the membership and thanks updates**

Run:

```powershell
git add -u
git commit -m "feat: add member portal website entry points"
```

---

### Task 5: Final Verification And Handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-08-14-phase-2-roadmap.md`

**Interfaces:**
- Consumes: all tasks above.
- Produces: verified local build/test status and roadmap notes for remaining GHL manual work.

- [ ] **Step 1: Update the roadmap status**

Modify `docs/superpowers/specs/2026-08-14-phase-2-roadmap.md` so the Member portal row says:

```markdown
| C. Member portal | Plan C | 🟡 **site hooks planned; GHL configuration next** | `2026-08-17-ghl-member-portal-design.md` |
```

In section `### C · Member portal (Plan C)`, add this bullet after the confirmed GHL access bullet:

```markdown
- Implementation plan exists: `docs/superpowers/plans/2026-08-17-ghl-member-portal.md`; GHL setup should happen before `GHL_PORTAL_URL` is enabled on the site.
```

- [ ] **Step 2: Run the full build**

Run:

```powershell
npm run build
```

Expected: build completes with Eleventy writing the site to `public/`.

- [ ] **Step 3: Run the full test suite**

Run:

```powershell
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Inspect git status**

Run:

```powershell
git status --short --branch
```

Expected:
- `main` is ahead by the local commits created for this plan.
- `.netlify/` and `deno.lock` may remain untracked local scratch.
- No unintended source files are modified.

- [ ] **Step 5: Commit the roadmap handoff**

Run:

```powershell
git add -u
git commit -m "docs: update member portal roadmap handoff"
```

- [ ] **Step 6: Report the local handoff**

Final response must include:
- The GHL checklist path.
- The configured environment variable name: `GHL_PORTAL_URL`.
- The verification commands and whether they passed.
- The local commits created.
- A reminder that Codex did not run `git push`.
