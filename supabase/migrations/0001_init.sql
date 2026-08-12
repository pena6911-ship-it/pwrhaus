-- PWRHaus Phase 1 data backbone. BI-ready: integer cents, timestamptz UTC,
-- append-only ledgers, idempotency + ghl_contact_id join key.

create table contacts (
  id              uuid primary key default gen_random_uuid(),
  ghl_contact_id  text unique,
  email           text not null unique,
  full_name       text,
  phone           text,
  tier            text not null default 'free' check (tier in ('free','member','inner_circle')),
  source          text,
  created_at      timestamptz not null default now()
);

create table memberships (
  id                     uuid primary key default gen_random_uuid(),
  contact_id             uuid not null references contacts(id),
  tier                   text not null,
  stripe_subscription_id text,
  current_status         text not null default 'active' check (current_status in ('active','lapsed','cancelled')),
  started_at             timestamptz not null default now(),
  current_period_end     timestamptz
);

create table membership_events (
  id             uuid primary key default gen_random_uuid(),
  membership_id  uuid not null references memberships(id),
  event_type     text not null check (event_type in ('created','activated','renewed','lapsed','cancelled')),
  occurred_at    timestamptz not null default now(),
  stripe_event_id text unique
);

create table events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text,
  capacity    int,
  price_cents int not null default 0,
  currency    text not null default 'usd',
  starts_at   timestamptz,
  published   boolean not null default false
);

create table orders (
  id                       uuid primary key default gen_random_uuid(),
  contact_id               uuid not null references contacts(id),
  type                     text not null check (type in ('membership','event','sponsorship','merch')),
  amount_cents             int not null,
  currency                 text not null default 'usd',
  stripe_payment_intent_id text,
  idempotency_key          text not null unique,
  current_status           text not null default 'created' check (current_status in ('created','paid','refunded','failed')),
  created_at               timestamptz not null default now()
);

create table order_events (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id),
  event_type      text not null check (event_type in ('created','paid','refunded','failed')),
  amount_cents    int not null default 0,
  occurred_at     timestamptz not null default now(),
  stripe_event_id text not null unique
);

create table tickets (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id),
  event_id   uuid not null references events(id),
  contact_id uuid not null references contacts(id),
  status     text not null default 'valid' check (status in ('valid','refunded')),
  created_at timestamptz not null default now()
);

create table event_attendance (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references tickets(id),
  event_id    uuid not null references events(id),
  contact_id  uuid not null references contacts(id),
  attended_at timestamptz not null default now()
);

create table sponsors (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id),
  tier       text check (tier in ('social_tee','hole_in_one','double_eagle')),
  status     text,
  created_at timestamptz not null default now()
);

create index on orders (contact_id);
create index on order_events (order_id);
create index on tickets (event_id);
create index on event_attendance (event_id);
