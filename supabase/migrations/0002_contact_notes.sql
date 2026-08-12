-- Public inquiry capture for the marketing site (sponsorship, corporate, lessons,
-- event interest, free profile).
--
-- Two pieces:
--   1. contacts.notes      -- first-touch message, denormalised for convenience
--   2. contact_inquiries   -- APPEND-ONLY ledger, one row per submission
--
-- Why the ledger: createContact dedupes on email and early-returns for a known
-- contact, so without this a repeat submission is silently dropped. Repeat
-- inquiries are the warm ones (free profile in September -> sponsorship in
-- November), so they are exactly the facts worth keeping. Same reasoning as
-- order_events / membership_events.
--
-- source is intentionally unconstrained (like contacts.source): the allowed
-- slugs are whitelisted in the application layer so adding a page does not
-- require a migration. Field lengths are capped in the app for the same reason.

alter table contacts add column notes text;

create table contact_inquiries (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references contacts(id),
  source      text not null,
  notes       text,
  created_at  timestamptz not null default now()
);

create index on contact_inquiries (contact_id);
