# PWRHaus CRM/Data Hardening Reconciliation Design

**Date:** 2026-08-19
**Status:** Ready for implementation planning
**Workstream:** Phase 2E - CRM/data hardening

## Purpose

The public contact endpoint already writes the contact fact to Supabase before pushing to
GoHighLevel. That protects leads during a GHL outage, but it leaves contacts with
`ghl_contact_id = null` until the same person submits another form. The reconciliation sweep
closes that gap by retrying stranded contacts without waiting for another form submission.

## Scope

Build a small backend maintenance flow that:

- Finds Supabase `contacts` rows where `ghl_contact_id` is null.
- Sends each stranded contact to GHL using the same deterministic tag contract as the public
  contact endpoint.
- Stores the returned GHL contact ID on the Supabase contact row.
- Logs per-contact failures without aborting the whole sweep.
- Returns a machine-readable summary for manual smoke tests and scheduled-run logs.

This work does not change the public website forms, portal UI, GHL workflows, or membership offer
configuration.

## Existing Contracts

- Supabase is the fact store.
- GHL is downstream CRM and portal automation.
- Public form submissions call `createContact()` in `functions/lib/contacts.js`.
- GHL contact creation is wrapped by `createGhlClient()` in `functions/lib/ghl.js`.
- A stranded contact is any `contacts` row with `ghl_contact_id` set to null.
- GHL tags must remain deterministic:
  - `pwrhaus_tier_<tier>`
  - `pwrhaus_source_<source>`
- The real PWRHaus GHL location ID is `2xkWZPrCKFZbcXBhsGrB`.
- The canonical portal URL is `https://2xkwzprckfzbcxbhsgrb.app.clientclub.net/`.

## Proposed Architecture

Add a focused library module:

`functions/lib/contact-reconciliation.js`

It exports `reconcileContacts({ db, ghl, log }, options)`. The function asks the database adapter
for a capped batch of stranded contacts, upserts each one to GHL, and writes the returned
`ghl_contact_id` back through the database adapter.

Extend `functions/lib/supabase.js` with:

- `findContactsMissingGhlId({ limit })`

The query selects contact fields needed by GHL and orders by `created_at` ascending so the oldest
stranded leads are retried first.

Add a Netlify scheduled function:

`functions/contact-reconcile.js`

It runs daily with a small batch limit and exposes a protected manual path at
`/api/admin/reconcile-contacts` for local/manual smoke testing. Manual runs require
`RECONCILE_ADMIN_TOKEN` in the environment and an `Authorization: Bearer <token>` header.

## Runtime Behavior

Default batch limit:

`25`

Maximum accepted batch limit:

`100`

Daily schedule:

`@daily`

Manual endpoint:

`POST /api/admin/reconcile-contacts`

Manual success response:

```json
{
  "processed": 2,
  "linked": 2,
  "failed": 0,
  "failures": []
}
```

Partial-failure response:

```json
{
  "processed": 2,
  "linked": 1,
  "failed": 1,
  "failures": [
    {
      "contact_id": "contact_2",
      "email": "lead@example.com",
      "error": "GHL upsert failed: 503"
    }
  ]
}
```

Partial failures still return HTTP 200 because the sweep itself completed and the failed rows remain
stranded for the next run. Missing or invalid admin token returns HTTP 401 for the manual endpoint.

## Error Handling

- One failed GHL upsert does not stop the batch.
- One failed Supabase update after a successful GHL upsert does not stop the batch.
- Each failed contact is logged with `contact.reconcile_failed`.
- The summary includes failed contact IDs, emails, and error messages.
- If the database query itself fails before a batch is available, the function returns HTTP 500.

## Security

- The scheduled function can run without an admin token because Netlify invokes it internally.
- The manual endpoint requires `RECONCILE_ADMIN_TOKEN`.
- The admin token is never committed. It belongs in local `.env` and later Netlify environment
  variables.
- The endpoint never returns secret environment values.

## Acceptance Criteria

- A test proves a stranded contact is upserted to GHL and linked in Supabase.
- A test proves contacts that already have `ghl_contact_id` are not selected by the database adapter.
- A test proves one failed GHL push does not stop the next stranded contact.
- A test proves the manual endpoint rejects missing or wrong bearer tokens.
- `npm test` passes.
- A manual local run can reconcile a known stranded test contact when real Supabase and GHL env vars
  are present.

## Out Of Scope

- BI dashboard.
- Rate limiting the public contact endpoint.
- Pulling GHL contact changes back into Supabase.
- GHL workflow creation.
- Membership/payment reconciliation.
