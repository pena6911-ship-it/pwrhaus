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
- Client Portal branding is set to PWRHaus:
  - Portal name: `PWRHaus Golf Society`
  - Primary color: `#1A4D36`
  - Secondary color: `#B8912A`
  - Favicon: `src/img/favicon-mark.png`
  - Portal image: `src/img/portal-image-8x9.png`
- Free member area exists.
- Paid member area exists.
- Virtual lessons course area exists.
- Community space exists; sandbox community name is `PWRHAUS Business`.
- Community cover image: `src/img/community-cover-16x9.jpg`
- Directory or community profile fields exist with opt-in visibility.

## Directory Privacy Model

- Status: deferred from GHL-native Phase 2.
- GHL does not currently expose the required member-directory privacy controls in the
  available PWRHAUS Business community UI.
- The community `Members` tab may remain visible; do not represent it as a privacy-controlled
  member directory.
- Do not ask members to publish phone, email, or sensitive profile details inside the GHL
  community.
- Future custom directory requirement: directory access is paid-member only.
- Future custom directory requirement: free members can access the welcome/community orientation
  area, but not the member directory.
- Future custom directory requirement: no member appears in the directory by default.
- Future custom directory requirement: a member appears only when `pwrhaus_directory_opt_in` is
  true.
- Future custom directory requirement: each directory field has its own visibility flag; never
  infer one visible field from another.
- Safe optional fields:
  - Display name: `pwrhaus_directory_display_name_visible`
  - Company: `pwrhaus_directory_company_visible`
  - Role or title: `pwrhaus_directory_role_visible`
  - City: `pwrhaus_directory_city_visible`
  - Website: `pwrhaus_directory_website_visible`
  - LinkedIn URL: `pwrhaus_directory_linkedin_visible`
- Sensitive optional fields:
  - Email: `pwrhaus_directory_email_visible`
  - Phone: `pwrhaus_directory_phone_visible`
- Email and phone stay hidden unless the member explicitly enables each field.
- Member-facing wording: `You control whether you appear and what others can see.`

## Contact Tags Or Fields

The website produces these deterministic GHL contact tags. Do not configure the invite workflow
against a custom field named `pwrhaus_tier`.

- `pwrhaus_tier_free`: produced for every public website signup; this is the portal-invite trigger.
- `pwrhaus_source_<sanitized-source>`: produced for the validated website source, for example
  `pwrhaus_source_web_free_profile`.
- Paid upgrade workflows replace `pwrhaus_tier_free` with `pwrhaus_tier_member` or
  `pwrhaus_tier_inner_circle`.
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

- New website contact tagged `pwrhaus_tier_free` receives a portal invite.
- In sandbox agencies, GHL may enroll and run the workflow but block email delivery with
  `Email sending is blocked for sandbox agencies`; treat enrollment and completion as the sandbox
  proof, then verify actual email delivery in the real PWRHaus subaccount.
- Existing GHL contact is updated, not duplicated.
- Paid upgrade replaces the tier tag with `pwrhaus_tier_member` or `pwrhaus_tier_inner_circle`.
- A member-access workflow triggered by `pwrhaus_tier_member` grants `PWRHaus Member Access`.
- Failed invite or bounced email is visible for manual follow-up.
- Portal invite workflow does not require a website deploy to change email wording.
- Stripe/payment-provider wiring is deferred until checkout can be tested against the intended
  PWRHaus payment provider. For sandbox access testing, use tags to grant member access.

## Manual Verification

- Submit a new free-profile form from the local website.
- Confirm Supabase receives or updates the contact.
- Confirm GHL receives or updates the contact.
- Confirm the GHL contact has `pwrhaus_tier_free` and the expected `pwrhaus_source_*` tag.
- Confirm the workflow enrolls the contact and reaches `Finished`.
- Confirm the contact can log in with the exact email address on the GHL contact record.
- Confirm free-only access cannot open paid member content.
- Add `pwrhaus_tier_member` to the contact or complete the paid-upgrade workflow.
- Confirm paid member content unlocks.
- Confirm the member can see `PWRHaus Welcome`, `Virtual Golf Lessons`, and `Member Perks`.
- Confirm directory is hidden by default.
- Turn on only display name and city.
- Confirm the directory shows only display name and city.
- Turn directory opt-in off.
- Confirm the member no longer appears in the directory.

## Sandbox Verification Notes

- Verified in the GHL sandbox with `pena6911+20260818020917@gmail.com`: the website-created
  contact enrolled in the free portal invite workflow from `pwrhaus_tier_free`.
- The sandbox workflow reached `Finished`, but GHL blocked email delivery because sandbox agencies
  cannot send email.
- Logging into the portal with the exact test contact email exposed the expected member content
  after `pwrhaus_tier_member` granted `PWRHaus Member Access`.
- `PWRHAUS Business` was visible from the member portal for
  `pena6911+20260818020917@gmail.com` after member access was granted.
- Existing contacts that were synced before tag production was added may need a one-time GHL
  tag/backfill operation.

## PWRHaus Sub-Account Migration Notes

- Real sub-account name: `Pwrhaus Golf Society`.
- Real `GHL_LOCATION_ID`: `2xkWZPrCKFZbcXBhsGrB`.
- Private Integration Token for the real sub-account must include contact write access; contact
  read access is useful for API smoke checks.
- API smoke test succeeded for `pwrhaus-live-smoke+20260819002557@example.com`.
- Smoke contact ID: `udjxmdx8e2jm9qup6hVJ`.
- Smoke contact tags confirmed by API read-back:
  - `pwrhaus_tier_free`
  - `pwrhaus_source_web_free_profile`
- Published free portal invite workflow was verified with
  `pwrhaus-live-published+20260819005739@example.com`.
- Workflow test contact ID: `TeuF8KEjawfQ2ZfNU9Ad`.
- Workflow added `pwrhaus_portal_invited` after `pwrhaus_tier_free` was added.
- Real GHL-generated portal URL confirmed from the PWRHaus sub-account email flow:
  `https://2xkwzprckfzbcxbhsgrb.app.clientclub.net/`.
- This URL resolves to `PWRHaus Golf Society`, displays `Exclusive Member Zone`, and is the
  canonical website `Member Login` target.
- Earlier testing also saw `https://xvd2qxmb2qww31ht8pwz.app.clientclub.net/` render PWRHaus
  branding, but do not use that URL unless GHL changes the email/login URL.
- Published member access workflow was verified with
  `pwrhaus-live-member+20260819013625@example.com`.
- Member workflow test contact ID: `xmjKjckViOeW6GwZG1Vt`.
- Member workflow added `pwrhaus_member_paid` after `pwrhaus_tier_member` was added.
- Free portal access was visually verified with `pena6911@gmail.com` after granting the actual
  `PWRHaus Free Access` offer.
- Workflow debugging note: adding a tag named `pwrhaus free access` is not the same as granting
  the `PWRHaus Free Access` offer.
- Member portal access was visually verified from the email-confirmed
  `https://2xkwzprckfzbcxbhsgrb.app.clientclub.net/` portal after granting member access.
- Portal URL debugging note: the local site had previously linked to
  `https://xvd2qxmb2qww31ht8pwz.app.clientclub.net/`, which showed `Courses: 0` and
  `Communities: 0`; use the email-confirmed `bhsgrb` URL for site links.

## Site Handoff Values

- `GHL_PORTAL_URL`: `https://2xkwzprckfzbcxbhsgrb.app.clientclub.net/`.
- Preferred header label: `Member Login`.
- Preferred footer label: `Member Login`.
- Preferred membership-page label: `Enter Member Portal`.

## CRM Reconciliation Sweep

- Purpose: retry Supabase contacts whose `ghl_contact_id` is null after a prior GHL outage.
- Manual function: `functions/contact-reconcile.js`.
- Scheduled function: `functions/contact-reconcile-scheduled.js`.
- Manual endpoint: `POST /api/admin/reconcile-contacts`.
- Scheduled cadence: `@daily`.
- Required manual-run env var: `RECONCILE_ADMIN_TOKEN`.
- Default batch limit: `25`.
- Maximum batch limit: `100`.
- Local smoke command:

```bash
curl -X POST http://localhost:8888/api/admin/reconcile-contacts \
  -H "Authorization: Bearer $RECONCILE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"limit\":25}"
```

- Expected response shape:

```json
{"processed":0,"linked":0,"failed":0,"failures":[]}
```
