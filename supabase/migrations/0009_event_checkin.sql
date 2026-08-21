-- Check-in (Phase 5). Attendance is additive: it never mutates ticket status,
-- and it is deliberately NOT cleared when tickets expire — the record of who
-- was in the room outlives the event.

-- One check-in per ticket, enforced by the database rather than by hope.
alter table event_attendance drop constraint if exists event_attendance_ticket_uniq;
alter table event_attendance add constraint event_attendance_ticket_uniq unique (ticket_id);

create index if not exists event_attendance_event_idx on event_attendance (event_id);

-- Dashboard reads attendance as the owner. Writes stay service-role only.
-- (RLS itself was enabled on this table by 0005_lock_down_pii.sql.)
drop policy if exists event_attendance_admin_read on event_attendance;
create policy event_attendance_admin_read on event_attendance
  for select to authenticated using (true);
