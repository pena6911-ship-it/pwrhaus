import { json } from './http.js';
import { checkinOutcome } from './checkin.js';

// POST /api/tickets/checkin — body: { qr_token | ticket_no, event_id, full_name?, email? }
//
// The QR token (or, typed by hand, the ticket number) identifies a ticket; it
// NEVER authorizes the write. Tickets can be photographed, so a verified
// dashboard session is required as well.
export function makeTicketsCheckinHandler({ verifySession, db, createContact, deps }) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const user = token ? await verifySession(token).catch(() => null) : null;
    if (!user) return json({ error: 'unauthorized' }, 401);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

    const qrToken = String(body.qr_token || '');
    const ticket = qrToken
      ? await db.findTicketByQrToken(qrToken)
      : await db.findTicketByNumber(String(body.ticket_no || ''));
    const existingAttendance = ticket ? await db.findAttendanceByTicket(ticket.id) : null;
    const attendee = { full_name: String(body.full_name || ''), email: String(body.email || '').trim().toLowerCase() };

    const outcome = checkinOutcome({ ticket, eventId: String(body.event_id || ''), existingAttendance, attendee });

    if (!outcome.ok) {
      // Not all refusals are failures: a re-presented ticket is a normal event,
      // so the scanner gets 200 and shows its amber state.
      const soft = outcome.code === 'already_checked_in' || outcome.code === 'needs_attendee';
      return json(
        outcome.code === 'already_checked_in'
          ? { ok: false, code: outcome.code, attended_at: outcome.attended_at }
          : { ok: false, code: outcome.code },
        soft ? 200 : 400,
      );
    }

    // Door capture: an unnamed seat becomes a real contact, synced to GHL like
    // every other lead, then the seat is assigned before attendance is recorded.
    let contactId = ticket.contact_id;
    if (outcome.assignNeeded) {
      const contact = await createContact(deps, {
        email: attendee.email, full_name: attendee.full_name.trim(), source: 'event_attendee',
      });
      contactId = contact.id;
      await db.assignTicket(ticket.id, contactId);
    }

    await db.insertAttendance({ ticket_id: ticket.id, event_id: ticket.event_id, contact_id: contactId });

    const person = await db.findContactById(contactId);
    return json({
      ok: true,
      code: 'ok',
      attendee_name: person?.full_name || attendee.full_name.trim() || person?.email || '',
      ticket_no: ticket.ticket_no,
      tier_sold: ticket.tier_sold,
    });
  };
}
