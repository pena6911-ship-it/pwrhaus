-- Event ticketing (Phase 4). Sales stay OFF per event until deliberately enabled.
-- Ticket/order writes are service-role only; the dashboard reads as authenticated.

alter table events add column if not exists member_price_cents    int;
alter table events add column if not exists nonmember_price_cents int;
alter table events add column if not exists sales_end_at          timestamptz;
alter table events add column if not exists tickets_enabled       boolean not null default false;

-- The unguessable link the buyer uses to assign guests.
alter table orders add column if not exists manage_token text unique;

-- A seat is issued unassigned and claimed later.
alter table tickets alter column contact_id drop not null;
alter table tickets add column if not exists ticket_no   text unique;
alter table tickets add column if not exists tier_sold   text check (tier_sold in ('member','non_member'));
alter table tickets add column if not exists qr_token    text unique;
alter table tickets add column if not exists assigned_at timestamptz;

create index if not exists tickets_event_idx on tickets (event_id);
create index if not exists orders_manage_token_idx on orders (manage_token);

-- Dashboard roster reads (authenticated = owner). No anon, no writes.
drop policy if exists orders_admin_read  on orders;
drop policy if exists tickets_admin_read on tickets;

create policy orders_admin_read on orders
  for select to authenticated using (true);
create policy tickets_admin_read on tickets
  for select to authenticated using (true);
