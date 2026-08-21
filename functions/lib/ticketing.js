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

// iOS has no hyphen key on the numeric keypad, and typed entry is the only
// path on iOS Safari (no BarcodeDetector there). Accept whatever the operator
// typed and coerce it back into the canonical NNN-NNNN-NNNNN shape when it's
// plausibly a ticket number with the hyphens stripped out.
export function normalizeTicketNo(input) {
  const stripped = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (stripped.length === 12) {
    return `${stripped.slice(0, 3)}-${stripped.slice(3, 7)}-${stripped.slice(7, 12)}`;
  }
  return stripped;
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

// Every ticket for an event is terminal 3 hours after it starts — used,
// unassigned or no-show alike. The same moment closes assignment AND
// reassignment, so a leaked manage link cannot rewrite a roster after the fact.
export const ASSIGNMENT_GRACE_MS = 3 * 60 * 60 * 1000;

export function assignmentDeadline(event) {
  if (!event || !event.starts_at) return null;
  const startsAt = Date.parse(event.starts_at);
  return Number.isNaN(startsAt) ? null : startsAt + ASSIGNMENT_GRACE_MS;
}

export function assignmentOpen(event, nowMs = Date.now()) {
  const deadline = assignmentDeadline(event);
  if (deadline === null) return { open: true, reason: null };
  return nowMs >= deadline ? { open: false, reason: 'assignment_closed' } : { open: true, reason: null };
}
