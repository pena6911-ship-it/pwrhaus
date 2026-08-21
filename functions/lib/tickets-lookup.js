import { json } from './http.js';

// GET /api/tickets/lookup?session_id=... — resolves a completed Stripe
// Checkout Session back to the buyer's manage link. The success_url lands
// on the thanks page with only the session id, so this is how the buyer
// reaches the token-gated assignment flow without relying on email (ticket
// email is dormant until RESEND_API_KEY exists).
//
// Returns ONLY { manage_url } — never the raw manage_token under any key,
// and never ticket or contact data.
export function makeTicketsLookupHandler({ db }) {
  return async (req) => {
    if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

    const url = new URL(req.url);
    const sessionId = url.searchParams.get('session_id') || '';
    const order = sessionId ? await db.findOrderByStripeSession(sessionId) : null;
    if (!order || !order.manage_token) return json({ error: 'not_found' }, 404);

    return json({ manage_url: `${url.origin}/tickets/manage/?token=${order.manage_token}` });
  };
}
