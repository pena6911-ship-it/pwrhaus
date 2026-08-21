-- Event ticketing (Phase 4). Sales stay OFF per event until deliberately enabled.
-- Ticket/order writes are service-role only; the dashboard reads as authenticated.

alter table events add column if not exists member_price_cents    int;
alter table events add column if not exists nonmember_price_cents int;
alter table events add column if not exists sales_end_at          timestamptz;
alter table events add column if not exists tickets_enabled       boolean not null default false;

-- The unguessable link the buyer uses to assign guests.
alter table orders add column if not exists manage_token text unique;

-- Which event this order paid for, and the Stripe Checkout Session that
-- produced it (used to resolve the buyer back to their manage link).
alter table orders add column if not exists event_id uuid references events(id);
alter table orders add column if not exists stripe_session_id text;

-- Order numbers must come from a real sequence, not a row count: two
-- concurrent webhooks counting the same rows would mint duplicate ticket_no
-- values, and tickets.ticket_no is unique. PostgREST cannot call nextval()
-- directly, so it is wrapped in a callable SQL function.
create sequence if not exists event_order_seq;

create or replace function next_event_order_seq() returns bigint
  language sql volatile as $$ select nextval('event_order_seq') $$;

-- A seat is issued unassigned and claimed later.
alter table tickets alter column contact_id drop not null;
alter table tickets add column if not exists ticket_no   text unique;
alter table tickets add column if not exists tier_sold   text check (tier_sold in ('member','non_member'));
alter table tickets add column if not exists qr_token    text unique;
alter table tickets add column if not exists assigned_at timestamptz;

create index if not exists tickets_event_idx on tickets (event_id);
create index if not exists orders_manage_token_idx on orders (manage_token);
create index if not exists orders_stripe_session_idx on orders (stripe_session_id);

-- Dashboard roster reads (authenticated = owner). No anon, no writes.
drop policy if exists orders_admin_read  on orders;
drop policy if exists tickets_admin_read on tickets;

create policy orders_admin_read on orders
  for select to authenticated using (true);
create policy tickets_admin_read on tickets
  for select to authenticated using (true);
