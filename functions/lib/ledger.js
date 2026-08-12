export function reduceOrderStatus(events) {
  const types = new Set(events.map((e) => e.event_type));
  if (types.has('refunded')) return 'refunded';
  if (types.has('paid')) return 'paid';
  if (types.has('failed')) return 'failed';
  return 'created';
}

export function netRevenueCents(events) {
  return events.reduce((sum, e) => {
    if (e.event_type === 'paid') return sum + e.amount_cents;
    if (e.event_type === 'refunded') return sum - e.amount_cents;
    return sum;
  }, 0);
}
