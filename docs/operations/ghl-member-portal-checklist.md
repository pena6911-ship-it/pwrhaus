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
- Existing GHL contact is updated, not duplicated.
- Paid upgrade replaces the tier tag with `pwrhaus_tier_member` or `pwrhaus_tier_inner_circle`.
- Failed invite or bounced email is visible for manual follow-up.
- Portal invite workflow does not require a website deploy to change email wording.

## Manual Verification

- Submit a new free-profile form from the local website.
- Confirm Supabase receives or updates the contact.
- Confirm GHL receives or updates the contact.
- Confirm the GHL contact has `pwrhaus_tier_free` and the expected `pwrhaus_source_*` tag.
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
