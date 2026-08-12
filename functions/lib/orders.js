import { mapStripeEventType, extractPaymentIntent, amountCentsOf } from './stripe-events.js';

export async function recordStripeEvent({ db }, event) {
  const duplicate = await db.findOrderEventByStripeEventId(event.id);
  if (duplicate) return { status: 'duplicate', orderEvent: duplicate };

  const eventType = mapStripeEventType(event.type);
  if (!eventType) return { status: 'ignored' };

  const pi = extractPaymentIntent(event);
  const order = pi ? await db.findOrderByPaymentIntent(pi) : null;
  if (!order) return { status: 'no_order' };

  const orderEvent = await db.insertOrderEvent({
    order_id: order.id,
    event_type: eventType,
    amount_cents: amountCentsOf(event),
    stripe_event_id: event.id,
  });
  return { status: 'recorded', orderEvent };
}
