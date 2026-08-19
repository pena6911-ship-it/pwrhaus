-- PWRHaus Phase 1 dashboard: event CMS fields, editable page content,
-- RLS (authenticated = admin; anon reads published only), media storage, seed.

-- 1) Extend events with the CMS fields the table lacked.
alter table events add column if not exists slug             text unique;
alter table events add column if not exists venue            text;
alter table events add column if not exists summary          text;
alter table events add column if not exists body             text;
alter table events add column if not exists image            text;   -- Storage public URL
alter table events add column if not exists image_alt        text;
alter table events add column if not exists registration_url text;
alter table events add column if not exists sort_order       int not null default 0;
alter table events add column if not exists updated_at        timestamptz not null default now();

-- 2) Editable page content (Phase 1: the events-page hero).
create table if not exists site_content (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- 3) RLS. Only Michelle has an account, so authenticated = admin.
alter table events        enable row level security;
alter table site_content  enable row level security;

drop policy if exists events_public_read      on events;
drop policy if exists events_admin_all         on events;
drop policy if exists site_content_public_read on site_content;
drop policy if exists site_content_admin_all   on site_content;

create policy events_public_read on events
  for select to anon using (published = true);
create policy events_admin_all on events
  for all to authenticated using (true) with check (true);

create policy site_content_public_read on site_content
  for select to anon using (true);
create policy site_content_admin_all on site_content
  for all to authenticated using (true) with check (true);

-- 4) Public-read media bucket; authenticated writes.
insert into storage.buckets (id, name, public)
values ('event-media', 'event-media', true)
on conflict (id) do update set public = true;

drop policy if exists event_media_public_read on storage.objects;
drop policy if exists event_media_admin_write on storage.objects;

create policy event_media_public_read on storage.objects
  for select to anon using (bucket_id = 'event-media');
create policy event_media_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'event-media') with check (bucket_id = 'event-media');

-- 5) Seed current events (idempotent on slug) so nothing is lost at cutover.
insert into events (name, city, venue, starts_at, price_cents, capacity, summary, body, image, image_alt, published, registration_url, slug, sort_order)
values
  ('Fall Founder Scramble','Fort Lauderdale','TPC Eagle Trace','2026-09-18T13:00:00-04:00',15000,40,
   'A business-first scramble for founders, operators, and investors.',
   'A relaxed competitive round built for warm introductions, smart pairings, and useful follow-up after the final putt.',
   '/img/groupgolf1.jpg','Golfers walking together across a green course',true,null,'fall-founder-scramble',0),
  ('Spring Networking Nine','Miami','The Tips Golf Miami','2026-04-22T17:30:00-04:00',8500,24,
   'Nine holes, one focused room of business owners, and enough time to actually talk.',
   'This evening-format event pairs golf with intentional introductions for members and prospective members.',
   '/img/corporate-hero.webp','PWRHaus members gathered at an indoor golf venue',true,null,'spring-networking-nine',1)
on conflict (slug) do nothing;

-- 6) Seed the events-page hero.
insert into site_content (key, value)
values ('events_page', jsonb_build_object('eventsHero', jsonb_build_object(
  'eyebrow','Events',
  'heading','Rooms where the right people already have something in common.',
  'lead','PWRHaus events pair golf with intentional introductions for founders, operators, and business owners across Fort Lauderdale and Miami.',
  'video','/img/Dronegolfcourse.mp4',
  'poster','/img/groupgolf1.jpg')))
on conflict (key) do nothing;
