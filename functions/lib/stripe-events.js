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
  if (event.type === 'charge.refunded') return obj.amount_refunded ?? 0;
  if (event.type === 'payment_intent.payment_failed') return obj.amount ?? 0;
  return 0;
}
