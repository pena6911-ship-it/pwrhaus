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

- Directory access is paid-member only.
- Free members can access the welcome/community orientation area, but not the member directory.
- No member appears in the directory by default.
- A member appears only when `pwrhaus_directory_opt_in` is true.
- Each directory field has its own visibility flag; never infer one visible field from another.
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

## Site Handoff Values

- `GHL_PORTAL_URL`: the final login URL from GHL.
- Preferred header label: `Member Login`.
- Preferred footer label: `Member Login`.
- Preferred membership-page label: `Enter Member Portal`.
