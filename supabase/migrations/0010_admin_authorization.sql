-- Dashboard access is reserved for users whose server-managed app metadata
-- carries the explicit PWRHaus admin role. Authenticated alone is not enough.

drop policy if exists events_admin_all on public.events;
create policy events_admin_all on public.events
  for all to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'pwrhaus_role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'pwrhaus_role') = 'admin');

drop policy if exists site_content_admin_all on public.site_content;
create policy site_content_admin_all on public.site_content
  for all to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'pwrhaus_role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'pwrhaus_role') = 'admin');

drop policy if exists event_media_admin_write on storage.objects;
create policy event_media_admin_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'event-media'
    and (select auth.jwt() -> 'app_metadata' ->> 'pwrhaus_role') = 'admin'
  )
  with check (
    bucket_id = 'event-media'
    and (select auth.jwt() -> 'app_metadata' ->> 'pwrhaus_role') = 'admin'
  );

drop policy if exists contacts_admin_read on public.contacts;
create policy contacts_admin_read on public.contacts
  for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'pwrhaus_role') = 'admin');

drop policy if exists contact_inquiries_admin_read on public.contact_inquiries;
create policy contact_inquiries_admin_read on public.contact_inquiries
  for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'pwrhaus_role') = 'admin');

drop policy if exists orders_admin_read on public.orders;
create policy orders_admin_read on public.orders
  for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'pwrhaus_role') = 'admin');

drop policy if exists tickets_admin_read on public.tickets;
create policy tickets_admin_read on public.tickets
  for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'pwrhaus_role') = 'admin');

drop policy if exists event_attendance_admin_read on public.event_attendance;
create policy event_attendance_admin_read on public.event_attendance
  for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'pwrhaus_role') = 'admin');
