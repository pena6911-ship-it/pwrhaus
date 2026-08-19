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
    // Both ids are synthetic and unpersisted. ghl_contact_id must NOT be null:
    // every genuine success returns a non-null one, so null would be a reliable
    // tell that the submission was discarded.
    if (typeof body?.company_website === 'string' && body.company_website.trim() !== '') {
      log.info?.('contact.honeypot');
      return json({ id: randomUUID(), ghl_contact_id: randomUUID() }, 201);
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

function bearerToken(req) {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? '';
}

export function makeContactReconcileHandler({ reconcileContacts, deps, env = process.env, log = console }) {
  return async (req) => {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    let body = {};
    try {
      const raw = await req.text();
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }

    const expected = env.RECONCILE_ADMIN_TOKEN;
    if (!expected || bearerToken(req) !== expected) return json({ error: 'unauthorized' }, 401);

    try {
      const result = await reconcileContacts(deps, { limit: body.limit });
      log.info?.('contact.reconcile_complete', result);
      return json(result, 200);
    } catch (err) {
      log.error?.('contact.reconcile_failed', { err: err?.message });
      return json({ error: 'reconcile_failed' }, 500);
    }
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
