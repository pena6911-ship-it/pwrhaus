const TYPE_MAP = {
  'payment_intent.succeeded': 'paid',
  'charge.refunded': 'refunded',
  'payment_intent.payment_failed': 'failed',
};

export function mapStripeEventType(type) {
  return TYPE_MAP[type] ?? null;
}

export function extractPaymentIntent(event) {
  const obj = event?.data?.object ?? {};
  if (event.type === 'charge.refunded') return obj.payment_intent ?? null;
  return obj.id ?? null;
}

export function amountCentsOf(event) {
  const obj = event?.data?.object ?? {};
  if (event.type === 'payment_intent.succeeded') return obj.amount_received ?? 0;
  // NOTE: amount_refunded is the CUMULATIVE refunded total on the charge, not the
  // per-event delta. Current ledger math assumes single full refunds (matching the
  // Phase-1 48-hr full-refund policy — no partials). A future dev handling partial
  // refunds must account for double-counting across multiple charge.refunded events.
  if (event.type === 'charge.refunded') return obj.amount_refunded ?? 0;
  if (event.type === 'payment_intent.payment_failed') return obj.amount ?? 0;
  return 0;
}
