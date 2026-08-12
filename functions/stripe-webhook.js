import { makeStripeWebhookHandler } from './lib/handlers.js';
import { recordStripeEvent } from './lib/orders.js';
import { buildStripeDeps } from './lib/deps.js';
import { createStripeVerifier } from './lib/stripe.js';

export default async (req) => {
  const handler = makeStripeWebhookHandler({
    recordStripeEvent,
    deps: buildStripeDeps(process.env),
    verify: createStripeVerifier(process.env),
  });
  return handler(req);
};

export const config = { path: '/api/stripe-webhook' };
