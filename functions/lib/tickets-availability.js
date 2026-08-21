import { json } from './http.js';
import { salesOpen, remainingCapacity } from './ticketing.js';

// GET /api/tickets/availability?slug=... — live remaining spots for an event.
// The public site is static, so it is built before any sale happens and cannot
// know how many seats are left; the event page calls this on load instead.
//
// Returns ONLY { capacity, remaining, sales_open, reason } — counts and a
// status, never attendee, order or contact data. This endpoint is public by
// design (anyone viewing the event page can see how many spots are left).
export function makeTicketsAvailabilityHandler({ db, now = Date.now }) {
  return async (req) => {
    if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

    const slug = new URL(req.url).searchParams.get('slug') || '';
    const event = slug ? await db.findEventBySlug(slug) : null;
    if (!event) return json({ error: 'not_found' }, 404);

    const issued = await db.countIssuedTickets(event.id);
    const remaining = remainingCapacity(event, issued);
    const window = salesOpen(event, now());

    // Sold out is a closed sale even when the window is otherwise open.
    const open = window.open && remaining > 0;
    const reason = window.open ? (remaining > 0 ? null : 'insufficient_capacity') : window.reason;

    return json({ capacity: event.capacity ?? 0, remaining, sales_open: open, reason });
  };
}
