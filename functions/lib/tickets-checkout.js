import { json } from './http.js';
import { computeOrder, randomToken } from './ticketing.js';

// POST /api/tickets/checkout — body: { slug, email, full_name, quantity }
// Price is ALWAYS recomputed from the event row + the buyer's real tier. Any
// price or tier in the request body is ignored.
export function makeTicketsCheckoutHandler({ env, db, stripe, createContact, deps, now = Date.now }) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim();
    if (!email || !email.includes('@')) return json({ error: 'email_required' }, 400);

    const event = await db.findEventBySlug(String(body.slug || ''));
    if (!event) return json({ error: 'unknown_event' }, 400);

    // The buyer's tier decides the price — look them up, create if new. Uses
    // the same path attendees use so the buyer reaches the CRM too, not just
    // a bare Supabase row.
    const contact = await createContact(deps, { email, full_name: fullName || null, source: 'event_ticket' });

    const issued = await db.countIssuedTickets(event.id);
    const quote = computeOrder({ event, tier: contact.tier, quantity: body.quantity, issuedCount: issued, nowMs: now() });
    if (!quote.ok) return json({ error: quote.error }, 400);

    const origin = new URL(req.url).origin;
    const idempotencyKey = `event:${event.id}:${contact.id}:${randomToken(8)}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      payment_method_types: ['card'],
      line_items: [{
        quantity: quote.quantity,
        price_data: {
          currency: 'usd',
          unit_amount: quote.unitCents, // authority: the events table
          product_data: {
            name: `${event.name} — ${quote.tierSold === 'member' ? 'PWRHAUS Member' : 'Non-Member'}`,
          },
        },
      }],
      success_url: `${origin}/tickets/thanks/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/events/${event.slug}/`,
      metadata: {
        event_id: event.id,
        contact_id: contact.id,
        quantity: String(quote.quantity),
        tier_sold: quote.tierSold,
        unit_cents: String(quote.unitCents),
        idempotency_key: idempotencyKey,
      },
    });

    return json({ url: session.url });
  };
}
