import { json } from './http.js';

export function makeContactCreateHandler({ createContact, deps }) {
  return async (req) => {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    let body;
    try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    if (!body?.email) return json({ error: 'email_required' }, 400);
    const contact = await createContact(deps, body);
    return json({ id: contact.id, ghl_contact_id: contact.ghl_contact_id }, 201);
  };
}

export function makeStripeWebhookHandler({ recordStripeEvent, deps, verify }) {
  return async (req) => {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    const raw = await req.text();
    const sig = req.headers.get('stripe-signature');
    let event;
    try { event = verify(raw, sig); } catch { return json({ error: 'invalid_signature' }, 400); }
    const result = await recordStripeEvent(deps, event);
    return json({ status: result.status }, 200);
  };
}
