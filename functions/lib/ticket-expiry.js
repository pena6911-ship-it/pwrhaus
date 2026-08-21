// Every ticket for an event is terminal 3 hours after it starts — used,
// unassigned or no-show alike. This sweep flips them to 'expired' so a roster
// never shows a stale 'valid' seat for an event that has already happened.
//
// Attendance is unaffected: who actually turned up lives in event_attendance.
import { assignmentDeadline } from './ticketing.js';

export function makeTicketExpirySweep({ db, now = Date.now }) {
  return async () => {
    const events = await db.listEventsWithValidTickets();
    const due = (events || []).filter((ev) => {
      const deadline = assignmentDeadline(ev);
      return deadline !== null && now() >= deadline;
    });

    let expired = 0;
    for (const ev of due) {
      const n = await db.expireTicketsForEvent(ev.id);
      expired += n || 0;
    }
    return { events_swept: due.length, tickets_expired: expired };
  };
}
