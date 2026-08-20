-- Lock down the data tables that shipped without row-level security. With RLS
-- off, Supabase's default grants let the PUBLIC anon key read these tables via
-- the REST API — and the anon key is embedded in the public site + /admin/. This
-- closes that exposure (contact PII especially).
--
-- Service-role writes are unaffected: the lead-capture, reconcile, and stripe
-- functions use the service-role key, which bypasses RLS entirely. The build
-- only reads events/site_content (already RLS'd in 0003) — never these tables.
--
-- The dashboard CRM (Phase: lead-intake) reads contacts + contact_inquiries as
-- an authenticated (owner) session only. The remaining tables get RLS enabled
-- with NO policy — fully locked to the service role until a feature needs them.

alter table contacts            enable row level security;
alter table contact_inquiries   enable row level security;
alter table memberships         enable row level security;
alter table membership_events   enable row level security;
alter table orders              enable row level security;
alter table order_events        enable row level security;
alter table tickets             enable row level security;
alter table event_attendance    enable row level security;
alter table sponsors            enable row level security;

-- CRM read access — authenticated (owner) only. No anon, no writes.
drop policy if exists contacts_admin_read          on contacts;
drop policy if exists contact_inquiries_admin_read  on contact_inquiries;

create policy contacts_admin_read on contacts
  for select to authenticated using (true);
create policy contact_inquiries_admin_read on contact_inquiries
  for select to authenticated using (true);
