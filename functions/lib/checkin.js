// Pure check-in decisions. No database, no network — every branch the scanner
// can hit is decided here so it can be tested exhaustively.

export function checkinUrl(origin, qrToken) {
  return `${origin}/checkin/?t=${encodeURIComponent(qrToken)}`;
}

export function checkinOutcome({ ticket, eventId, existingAttendance = null, attendee = null }) {
  if (!ticket) return { ok: false, code: 'unknown_ticket' };
  if (ticket.event_id !== eventId) return { ok: false, code: 'wrong_event' };

  if (ticket.status === 'refunded') return { ok: false, code: 'ticket_refunded' };
  if (ticket.status === 'expired') return { ok: false, code: 'ticket_expired' };
  if (ticket.status !== 'valid') return { ok: false, code: 'ticket_invalid' };

  // A second scan is normal (someone re-presents a ticket). Report when they
  // arrived rather than erroring — and write nothing further.
  if (existingAttendance) {
    return { ok: false, code: 'already_checked_in', attended_at: existingAttendance.attended_at };
  }

  const hasName = Boolean(attendee?.full_name?.trim() && attendee?.email?.trim());
  if (!ticket.contact_id && !hasName) return { ok: false, code: 'needs_attendee' };

  return { ok: true, code: 'ok', assignNeeded: !ticket.contact_id };
}
