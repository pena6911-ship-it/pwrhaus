import { json } from './http.js';
import { randomUUID } from 'node:crypto';
import { isValidEmail, sanitizeContactInput } from './sanitize.js';

export function makeContactCreateHandler({ createContact, deps, log = console }) {
  return async (req) => {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    let body;
    try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

    // Honeypot: a real browser never fills this hidden field. Return a
    // convincing 201 rather than a 400 — an error teaches a bot to retry.
    if (typeof body?.company_website === 'string' && body.company_website.trim() !== '') {
      log.info?.('contact.honeypot');
      return json({ id: randomUUID(), ghl_contact_id: null }, 201);
    }

    if (!body?.email) return json({ error: 'email_required' }, 400);
    if (!isValidEmail(body.email)) return json({ error: 'invalid_email' }, 400);

    // tier is never client-controlled: this endpoint is public and unauthenticated.
    // Paid tiers are written only by the signature-verified Stripe webhook path.
    const contact = await createContact(deps, sanitizeContactInput(body));
    log.info?.('contact.created', { id: contact.id });
    return json({ id: contact.id, ghl_contact_id: contact.ghl_contact_id }, 201);
  };
}

export function makeStripeWebhookHandler({ recordStripeEvent, deps, verify, log = console }) {
  return async (req) => {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    const raw = await req.text();
    const sig = req.headers.get('stripe-signature');
    let event;
    try {
      event = verify(raw, sig);
    } catch (err) {
      log.error('stripe.webhook.invalid_signature', { err: err?.message });
      return json({ error: 'invalid_signature' }, 400);
    }
    const result = await recordStripeEvent(deps, event);
    if (result.status === 'no_order') {
      log.warn('stripe.webhook.no_order', { eventId: event?.id });
      return json({ status: 'no_order' }, 503);
    }
    log.info('stripe.webhook.' + result.status, { eventId: event?.id });
    return json({ status: result.status }, 200);
  };
}
