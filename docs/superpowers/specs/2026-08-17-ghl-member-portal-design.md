# PWRHaus - GHL Member Portal Design Spec

**Date:** 2026-08-17
**Status:** Approved direction, ready for implementation planning after owner review
**Source docs:** `2026-08-14-phase-2-roadmap.md` workstream C and `2026-08-14-member-portal-and-cms-architecture.md`

---

## 1. Purpose

Build Phase 2B as a GoHighLevel-native member portal, not a custom auth application inside this
repo. The public website remains the polished front door: it captures interest, explains the member
value, and links members into the GHL portal. GHL owns login, gated member areas, courses,
community, and profile management.

This spec does not build merch productionization, the Supabase BI dashboard, sponsor automation,
Inner Circle checkout, Netlify go-live, or a custom admin platform.

## 2. Confirmed Capability

Michelle's GHL account has access to:
- Memberships
- Communities
- Courses
- Client Portal

That confirms the architecture decision from `2026-08-14-member-portal-and-cms-architecture.md`:
use GHL native portal tools wherever they cover the requirement.

## 3. Decisions

### D1. GHL Is The Member Portal

Use GHL Client Portal as the login surface. Use GHL Memberships for access control, Courses for
virtual lessons, and Communities for member interaction and directory-style features.

The repo does not add custom auth, sessions, passwords, protected static pages, or a separate
member database for portal UI. Supabase remains the site-side fact store, and GHL remains the
member-facing tool.

### D2. Free And Paid Members Both Get Access

Every legitimate signup can receive a portal invite. Free members see a useful but limited portal:
profile access, events orientation, and locked paid-member areas. Paid members unlock directory
access, virtual lessons, perks, and membership management.

Locked paid sections should stay visible enough to show value. The lock state is the upgrade prompt.

### D3. The Website Uses A Configured Portal URL

The site should expose portal entry points only after the real GHL portal URL is known. Until then,
portal CTAs stay hidden or disabled by a single content/config value instead of pointing at a fake
URL.

Recommended repo shape:
- Add a portal URL field to site data, not hard-coded template strings.
- Render "Member Login" links only when that field has a real URL.
- Keep public signup forms on the website; they continue using the existing contact function.

### D4. Signup-To-Portal Is A GHL Workflow

The existing website form creates a Supabase contact and upserts the contact into GHL. The portal
invite should be sent by GHL automation after the GHL contact exists.

Required workflow behavior:
- New free signup receives a portal invite or account-creation email from GHL.
- Existing contacts are not duplicated.
- Paid upgrades update the same contact record and unlock paid areas.
- Failed portal invites are visible in GHL for manual follow-up.

If a repo change is needed, it should be limited to adding source tags or metadata that help GHL
route the workflow. Do not move the portal invite logic into a Netlify function unless GHL cannot
perform it reliably.

### D5. Directory Privacy Is Opt-In Per Field

The member directory must never publish a member by default. A member opts in before appearing, and
each field has its own visibility decision.

Directory fields:
- Display name
- Company or affiliation
- Role or title
- City
- Website
- LinkedIn URL
- Email visibility
- Phone visibility

Default state for every field is private. Email and phone are especially sensitive and remain hidden
unless the member explicitly turns each one on.

### D6. Payment And Address Ownership Is Explicit

GHL should own the member-facing profile experience. Payment and address management should use the
least custom path GHL supports for this account.

Implementation planning must resolve one operational owner for each field before code changes:
- Billing/payment method
- Billing address
- Mailing or physical address
- Membership tier/status

The preferred order is:
1. GHL native profile or membership billing tools, if available in this account.
2. Stripe Customer Portal linked from GHL, if payment method management cannot be handled cleanly in
   GHL.
3. A custom site function only if neither managed option can cover the requirement.

### D7. Supabase Remains The Site-Side Fact Store

Supabase remains authoritative for website-captured contacts, inquiries, and future BI reporting.
GHL remains the operational CRM and portal host.

The portal should not introduce two competing member profiles. If GHL edits a field that Supabase
also stores, implementation planning must decide whether that field syncs back to Supabase or is
considered GHL-only.

## 4. GHL Configuration Model

Create these GHL areas:
- **Free Member Portal:** profile, welcome orientation, upcoming events, upgrade prompts.
- **Paid Member Area:** member directory, virtual lesson access, paid perks, account management.
- **Courses:** virtual lessons and lesson libraries.
- **Community:** member networking space and opt-in directory experience.
- **Workflows:** invite free signups, unlock paid users, handle failed invites, tag source and tier.

Access rules:
- `free` contacts can log in but cannot access paid member content.
- `member` contacts can access paid member content.
- `inner_circle` contacts can access paid member content plus any future Inner Circle-only areas.

## 5. Website Integration

The website should add portal entry points after the GHL portal URL is available:
- Header navigation or primary action: "Member Login"
- Membership page CTA: "Enter Member Portal"
- Post-signup confirmation copy: tell the user to check email for their portal invite
- Footer utility link: "Member Login"

All links use the same configured URL. If the URL is empty, the login entry points do not render.

The public website keeps handling lead capture and public marketing pages. It should not mirror
private lessons, directory profiles, or paid perks as static pages.

## 6. Data Flow

Free signup:
1. Visitor submits an existing website capture form.
2. Netlify function creates or updates the Supabase contact with `tier: 'free'`.
3. Netlify function upserts the contact into GHL.
4. GHL workflow sends the portal invite.
5. User logs into the GHL Client Portal.

Paid upgrade:
1. User purchases or is manually assigned a paid membership through the chosen payment flow.
2. GHL updates the contact's membership access.
3. Supabase membership data stays aligned through the chosen payment or reconciliation path.
4. Paid-only portal areas unlock in GHL.

Directory opt-in:
1. Member edits directory visibility in GHL.
2. GHL stores opt-in fields.
3. Community/directory view displays only explicitly visible fields.
4. A member can opt out again without developer help.

## 7. Error Handling

Portal invite failures are operational CRM issues, not website rendering failures. GHL should surface
failed workflow sends or bounced invites to Michelle for manual follow-up.

If the website contact function succeeds in Supabase but fails to upsert into GHL, the existing CRM
reconciliation workstream remains the recovery path. Phase 2B should not duplicate the upcoming
CRM/data hardening workstream unless the implementation plan finds a small field or tag addition is
needed.

## 8. Testing And Acceptance

Acceptance criteria:
- A new free signup is created in Supabase and GHL.
- The free signup receives a GHL portal invite.
- The free user can log in and see the free portal experience.
- Paid-only portal sections are visible but gated for free users.
- A paid member can access directory, lessons, perks, and account management.
- Directory appearance is off by default.
- A member can enable and disable individual directory fields.
- The website shows member-login links only when a real portal URL is configured.
- `npm run build` and `npm test` stay green after any repo changes.

Manual GHL verification is required because most of this phase lives in account configuration rather
than repo code.

## 9. Out Of Scope

Not included in Phase 2B:
- Custom website authentication
- Custom member dashboard UI
- Custom password reset or account-security flows
- Public rendering of private member directory data
- Merch productionization
- BI dashboard
- Sponsor pipeline automation
- Inner Circle payment/application flow
- Netlify go-live

## 10. Implementation Planning Notes

The implementation plan should split work into two tracks:
- **GHL configuration checklist:** portal areas, courses, community, workflows, access rules,
  directory privacy fields, and invite testing.
- **Repo integration:** one portal URL config value, conditional login links, signup confirmation
  copy, and tests for hidden/rendered link behavior.

Do the GHL checklist first. Repo changes should wait until the real GHL portal URL and the desired
site entry points are confirmed.
