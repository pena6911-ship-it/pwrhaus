import Stripe from 'stripe';
import { json } from './http.js';
import { findEnabledVariant } from './catalog.js';

// POST /api/merch/checkout — body: { items: [{ product_id, variant_id, quantity }] }
// Each item is validated against Printify at request time — the product must be
// visible and the variant enabled — and the price is read from Printify, never
// from the client. Returns { url } to redirect to Stripe's hosted checkout.
export function makeMerchCheckoutHandler({ env, printify }) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    let items;
    try {
      const body = await req.json();
      items = body.items;
    } catch {
      return json({ error: 'bad_json' }, 400);
    }
    if (!Array.isArray(items) || items.length === 0) {
      return json({ error: 'empty_cart' }, 400);
    }

    const lineItems = [];
    const printifyLines = [];
    for (const it of items) {
      let product;
      try {
        product = await printify.getProduct(it.product_id);
      } catch {
        return json({ error: 'unknown_product', product_id: it.product_id }, 400);
      }
      const variant = findEnabledVariant(product, it.variant_id);
      if (!variant) {
        return json({ error: 'unknown_variant', product_id: it.product_id, variant_id: it.variant_id }, 400);
      }
      const quantity = Math.max(1, Math.min(10, Number(it.quantity) || 1));
      const img = (product.images || []).find((i) => i.is_default) || (product.images || [])[0];
      lineItems.push({
        quantity,
        price_data: {
          currency: 'usd',
          unit_amount: variant.price, // price authority = Printify
          product_data: {
            name: `${product.title} — ${variant.title}`,
            ...(img && /^https?:\/\//.test(img.src) ? { images: [img.src] } : {}),
          },
        },
      });
      printifyLines.push({ product_id: it.product_id, variant_id: variant.id, quantity });
    }

    const origin = new URL(req.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      // Physical goods: collect where to ship. US-only for the POC.
      shipping_address_collection: { allowed_countries: ['US'] },
      phone_number_collection: { enabled: true },
      // NOTE: Stripe Tax (automatic_tax) is intentionally OFF for the POC — it
      // needs tax registrations configured on the account. The spec turns it on
      // for production.
      success_url: `${origin}/thanks/?merch=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/merch/`,
      // Everything the webhook needs to place the Printify order travels here.
      metadata: { printify_line_items: JSON.stringify(printifyLines) },
    });

    return json({ url: session.url });
  };
}

// POST /api/merch/webhook — Stripe fires checkout.session.completed. Verify the
// signature, then create the Printify order. Draft-only unless PRINTIFY_LIVE.
export function makeMerchWebhookHandler({ env, verify, printify }) {
  const live = env.PRINTIFY_LIVE === 'true';

  return async (req) => {
    const signature = req.headers.get('stripe-signature');
    const raw = await req.text();

    let event;
    try {
      event = await verify(raw, signature);
    } catch (e) {
      return json({ error: 'bad_signature' }, 400);
    }

    if (event.type !== 'checkout.session.completed') {
      return json({ received: true, ignored: event.type });
    }

    const session = event.data.object;
    let printifyLines;
    try {
      printifyLines = JSON.parse(session.metadata?.printify_line_items || '[]');
    } catch {
      printifyLines = [];
    }
    const lineItems = printifyLines
      .filter((l) => l.product_id)
      .map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity }));
    if (lineItems.length === 0) return json({ error: 'no_printify_items' }, 200);

    const ship = session.shipping_details || {};
    const cust = session.customer_details || {};
    const addr = ship.address || cust.address || {};
    const fullName = (ship.name || cust.name || '').trim();
    const [firstName, ...rest] = fullName.split(' ');
    const addressTo = {
      first_name: firstName || 'PWRHaus',
      last_name: rest.join(' ') || 'Customer',
      email: cust.email || '',
      phone: cust.phone || '',
      country: addr.country || 'US',
      region: addr.state || '',
      address1: addr.line1 || '',
      address2: addr.line2 || '',
      city: addr.city || '',
      zip: addr.postal_code || '',
    };

    try {
      const order = await printify.createDraftOrder({
        externalId: session.id, // idempotent on Stripe session id
        lineItems,
        addressTo,
      });
      if (live) await printify.sendToProduction(order.id);
      return json({
        ok: true,
        printify_order_id: order.id,
        mode: live ? 'LIVE (sent to production)' : 'DRAFT_ONLY (not sent to production)',
      });
    } catch (e) {
      // Non-2xx makes Stripe retry (idempotent). In the real build this also
      // flags the order needs_attention and alerts Michelle.
      console.error('printify order failed', e.status, JSON.stringify(e.body));
      return json({ error: 'printify_failed', status: e.status || null, body: e.body || null }, 500);
    }
  };
}
