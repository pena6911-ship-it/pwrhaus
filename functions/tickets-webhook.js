import Stripe from 'stripe';
import { makeTicketsWebhookHandler } from './lib/tickets-webhook.js';
import { createSupabaseDb } from './lib/supabase.js';
import { createEmailer } from './lib/ticket-email.js';

export default async (req) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const verify = (raw, signature) =>
    stripe.webhooks.constructEventAsync(raw, signature, process.env.STRIPE_TICKETS_WEBHOOK_SECRET);
  return makeTicketsWebhookHandler({
    env: process.env,
    verify,
    db: createSupabaseDb(process.env),
    email: createEmailer(process.env),
  })(req);
};

export const config = { path: '/api/tickets/webhook' };
