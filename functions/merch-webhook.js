import Stripe from 'stripe';
import { makeMerchWebhookHandler } from './lib/merch.js';
import { createPrintifyClient } from './lib/printify.js';

export default async (req) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  // constructEventAsync uses async crypto — the correct choice in serverless.
  const verify = (raw, signature) =>
    stripe.webhooks.constructEventAsync(raw, signature, process.env.STRIPE_MERCH_WEBHOOK_SECRET);
  const printify = createPrintifyClient({
    token: process.env.PRINTIFY_API_TOKEN,
    shopId: process.env.PRINTIFY_SHOP_ID,
    userAgent: 'pwrhaus-poc',
  });
  return makeMerchWebhookHandler({ env: process.env, verify, printify })(req);
};

export const config = { path: '/api/merch/webhook' };
