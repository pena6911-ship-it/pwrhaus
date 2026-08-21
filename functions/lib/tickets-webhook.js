import { json } from './http.js';
import { ticketNumber, randomToken, remainingCapacity } from './ticketing.js';

// POST /api/tickets/webhook — Stripe fires checkout.session.completed.
// Verify → idempotency → order → RE-CHECK capacity → issue seats → confirm.
export function makeTicketsWebhookHandler({ env, verify, db, email, now = Date.now }) {
  return async (req) => {
    const signature = req.headers.get('stripe-signature');
    const raw = await req.text();

    let event;
    try { event = await verify(raw, signature); } catch { return json({ error: 'bad_signature' }, 400); }

    if (event.type !== 'checkout.session.completed') {
      return json({ received: true, ignored: event.type });
    }

    // A Stripe retry must never issue a second set of tickets.
    const seen = await db.findOrderEventByStripeEventId(event.id);
    if (seen) return json({ received: true, duplicate: true });

    const s = event.data.object;
    const m = s.metadata || {};
    const quantity = Number(m.quantity) || 0;
    const unitCents = Number(m.unit_cents) || 0;

    const ev = await db.findEventById(m.event_id);
    const issued = await db.countIssuedTickets(m.event_id);

    // Two buyers can pass the checkout-time check at once; this is the real gate.
    const oversold = quantity > remainingCapacity(ev, issued);

    const order = await db.insertOrder({
      contact_id: m.contact_id,
      type: 'event',
      amount_cents: s.amount_total ?? unitCents * quantity,
      currency: 'usd',
      stripe_payment_intent_id: s.payment_intent ?? null,
      idempotency_key: m.idempotency_key,
      current_status: oversold ? 'needs_attention' : 'paid',
      manage_token: randomToken(),
    });
    await db.insertOrderEvent({ stripe_event_id: event.id, order_id: order.id, type: event.type });

    if (oversold) {
      // Paid but unfulfillable: flag for refund. The one case Michelle must see.
      return json({ received: true, needs_attention: 'insufficient_capacity' });
    }

    const seq = await db.nextOrderSeq();
    const rows = [];
    for (let i = 1; i <= quantity; i++) {
      rows.push({
        order_id: order.id,
        event_id: m.event_id,
        contact_id: i === 1 ? m.contact_id : null, // the buyer keeps seat 1
        assigned_at: i === 1 ? new Date(now()).toISOString() : null,
        status: 'valid',
        tier_sold: m.tier_sold,
        ticket_no: ticketNumber(seq, i),
        qr_token: randomToken(),
      });
    }
    await db.insertTickets(rows);

    const buyer = await db.findContactById(m.contact_id);
    const origin = new URL(req.url).origin;
    await email.sendOrderConfirmation({
      to: buyer?.email || s.customer_email,
      buyerName: buyer?.full_name || 'there',
      eventName: ev.name, startsAt: ev.starts_at, venue: ev.venue, city: ev.city,
      orderNo: `000-${String(seq).padStart(4, '0')}`,
      totalCents: s.amount_total ?? unitCents * quantity,
      manageUrl: `${origin}/tickets/manage/?token=${order.manage_token}`,
      tickets: rows.map((r) => ({ ticketNo: r.ticket_no, tierSold: r.tier_sold, qrToken: r.qr_token })),
    });

    return json({ received: true, tickets: rows.length });
  };
}
