-- Every ticket for an event becomes terminal 3 hours after the event starts —
-- used, unassigned, or no-show alike. One deadline, no per-ticket special cases.
-- 'expired' is the honest word: a used ticket was consumed, not forfeited.
--
-- Attendance history is unaffected: who actually turned up lives in
-- event_attendance, not in ticket status.
alter table tickets drop constraint if exists tickets_status_check;
alter table tickets add constraint tickets_status_check
  check (status in ('valid','refunded','expired'));
