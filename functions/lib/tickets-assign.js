import { json } from './http.js';
import { assignmentOpen, assignmentDeadline } from './ticketing.js';

// /api/tickets/assign — the token grants access to ONE order, never the database.
export function makeTicketsAssignHandler({ db, createContact, deps, email, now = Date.now }) {
  const load = async (token) => (token ? db.findOrderByManageToken(token) : null);

  return async (req) => {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const order = await load(url.searchParams.get('token'));
      if (!order) return json({ error: 'not_found' }, 404);
      const [event, tickets, buyer] = await Promise.all([
        db.findEventById(order.event_id),
        db.listTicketsByOrder(order.id),
        order.contact_id ? db.findContactById(order.contact_id) : Promise.resolve(null),
      ]);
      const rows = [];
      for (const t of tickets) {
        const attendee = t.contact_id ? await db.findContactById(t.contact_id) : null;
        rows.push({
          id: t.id, ticket_no: t.ticket_no, tier_sold: t.tier_sold, qr_token: t.qr_token,
          attendee: attendee ? { full_name: attendee.full_name, email: attendee.email } : null,
        });
      }
      const open = assignmentOpen(event, now());
      // A real ticket needs what a door and a holder both expect: the event, the
      // attendee it belongs to, who bought it, and proof it is paid.
      return json({
        event: { name: event.name, starts_at: event.starts_at, venue: event.venue, city: event.city },
        order: {
          // Ticket numbers are 000-<order>-<seat>; the order half is the order number.
          order_no: tickets[0]?.ticket_no ? tickets[0].ticket_no.split('-').slice(0, 2).join('-') : null,
          ordered_by: buyer ? buyer.full_name || buyer.email : null,
          ordered_at: order.created_at ?? null,
          paid: order.current_status === 'paid',
        },
        assignment_open: open.open,
        assignment_deadline: assignmentDeadline(event),
        tickets: rows,
      });
    }

    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

    const order = await load(body.token);
    if (!order) return json({ error: 'not_found' }, 404);

    const event = await db.findEventById(order.event_id);
    // One deadline governs everything: no new names and no reassignment after it.
    if (!assignmentOpen(event, now()).open) return json({ error: 'assignment_closed' }, 409);

    const tickets = await db.listTicketsByOrder(order.id);
    const ticket = tickets.find((t) => t.id === body.ticket_id);
    if (!ticket) return json({ error: 'unknown_ticket' }, 400);

    const attendeeEmail = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim();
    if (!attendeeEmail.includes('@') || !fullName) return json({ error: 'name_and_email_required' }, 400);

    // Attendees are first-class contacts: deduped, and pushed to GHL like any lead.
    const contact = await createContact(deps, {
      email: attendeeEmail, full_name: fullName, source: 'event_attendee',
    });

    await db.assignTicket(ticket.id, contact.id);

    await email.sendAttendeeTicket({
      to: attendeeEmail, attendeeName: fullName,
      eventName: event.name, startsAt: event.starts_at, venue: event.venue, city: event.city,
      orderNo: ticket.ticket_no.slice(0, 8), ticketNo: ticket.ticket_no,
      tierSold: ticket.tier_sold, qrToken: ticket.qr_token,
    });

    return json({ ok: true });
  };
}
