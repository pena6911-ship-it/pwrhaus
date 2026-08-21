import { randomBytes } from 'node:crypto';

const MEMBER_TIERS = new Set(['member', 'inner_circle']);
const MAX_QTY = 10;

export function isMemberTier(tier) {
  return MEMBER_TIERS.has(tier);
}

// Price authority lives here: always derived from the event row + the buyer's
// real tier. A member price that is not configured must not discount.
export function priceForTier(event, tier) {
  if (isMemberTier(tier) && Number.isInteger(event.member_price_cents)) return event.member_price_cents;
  if (Number.isInteger(event.nonmember_price_cents)) return event.nonmember_price_cents;
  return event.price_cents;
}

export function salesOpen(event, nowMs = Date.now()) {
  if (!event.tickets_enabled) return { open: false, reason: 'tickets_disabled' };
  if (event.sales_end_at && nowMs > Date.parse(event.sales_end_at)) return { open: false, reason: 'sales_closed' };
  if (event.starts_at && nowMs > Date.parse(event.starts_at)) return { open: false, reason: 'event_passed' };
  return { open: true, reason: null };
}

export function remainingCapacity(event, issuedCount = 0) {
  return Math.max(0, (event.capacity ?? 0) - issuedCount);
}

export function computeOrder({ event, tier, quantity, issuedCount = 0, nowMs = Date.now() }) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { ok: false, error: 'bad_quantity' };

  const open = salesOpen(event, nowMs);
  if (!open.open) return { ok: false, error: open.reason };

  if (qty > remainingCapacity(event, issuedCount)) return { ok: false, error: 'insufficient_capacity' };

  const unitCents = priceForTier(event, tier);
  return {
    ok: true,
    tierSold: isMemberTier(tier) ? 'member' : 'non_member',
    unitCents,
    quantity: qty,
    totalCents: unitCents * qty,
  };
}

export function ticketNumber(orderSeq, seatIndex) {
  return `000-${String(orderSeq).padStart(4, '0')}-${String(seatIndex).padStart(5, '0')}`;
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}
