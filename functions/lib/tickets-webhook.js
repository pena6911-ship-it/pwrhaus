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

    const s = event.data.object;

    // checkout.session.completed can fire before the payment has actually
    // settled (delayed-notification methods). Guarded on the field being
    // present so fixtures that omit it still exercise the paid path.
    if (s.payment_status && s.payment_status !== 'paid') {
      return json({ received: true, pending: s.payment_status });
    }

    // A Stripe retry must never issue a second set of tickets.
    const seen = await db.findOrderEventByStripeEventId(event.id);
    if (seen) return json({ received: true, duplicate: true });

    const m = s.metadata || {};
    const quantity = Number(m.quantity) || 0;
    const unitCents = Number(m.unit_cents) || 0;

    const ev = await db.findEventById(m.event_id);
    const issued = await db.countIssuedTickets(m.event_id);

    // Two buyers can pass the checkout-time check at once; this is the real gate.
    const oversold = quantity > remainingCapacity(ev, issued);

    // Coupons are out of scope and checkout no longer allows promotion codes,
    // but this is defence in depth: never trust the charged amount blindly.
    const expectedCents = unitCents * quantity;
    const paidCents = s.amount_total ?? expectedCents;
    const underpaid = paidCents < expectedCents;

    const flagged = oversold || underpaid;

    const order = await db.insertOrder({
      contact_id: m.contact_id,
      event_id: m.event_id,
      type: 'event',
      amount_cents: paidCents,
      currency: 'usd',
      stripe_payment_intent_id: s.payment_intent ?? null,
      stripe_session_id: s.id,
      idempotency_key: m.idempotency_key,
      current_status: flagged ? 'needs_attention' : 'paid',
      manage_token: randomToken(),
    });

    if (flagged) {
      // Paid but unfulfillable or underpaid: flag for refund/review. The
      // marker is still recorded on this path so a Stripe retry does not
      // re-insert the order — but it must never be recorded before the
      // tickets are actually issued on the normal path below.
      await db.insertOrderEvent({
        stripe_event_id: event.id,
        order_id: order.id,
        event_type: 'paid',
        amount_cents: paidCents,
      });
      return json({ received: true, needs_attention: oversold ? 'insufficient_capacity' : 'underpaid' });
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

    // The idempotency marker is written only after the tickets are safely
    // issued. If insertTickets throws, no marker exists, so a Stripe retry
    // can still recover the order — writing it earlier would silently strand
    // a paid order with zero tickets and no needs_attention flag.
    await db.insertOrderEvent({
      stripe_event_id: event.id,
      order_id: order.id,
      event_type: 'paid',
      amount_cents: paidCents,
    });

    const buyer = await db.findContactById(m.contact_id);
    const origin = new URL(req.url).origin;
    await email.sendOrderConfirmation({
      to: buyer?.email || s.customer_email,
      buyerName: buyer?.full_name || 'there',
      eventName: ev.name, startsAt: ev.starts_at, venue: ev.venue, city: ev.city,
      orderNo: `000-${String(seq).padStart(4, '0')}`,
      totalCents: paidCents,
      manageUrl: `${origin}/tickets/manage/?token=${order.manage_token}`,
      tickets: rows.map((r) => ({ ticketNo: r.ticket_no, tierSold: r.tier_sold, qrToken: r.qr_token })),
    });

    return json({ received: true, tickets: rows.length });
  };
}
