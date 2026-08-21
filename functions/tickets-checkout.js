import Stripe from 'stripe';
import { makeTicketsCheckoutHandler } from './lib/tickets-checkout.js';
import { createSupabaseDb } from './lib/supabase.js';
import { createContact } from './lib/contacts.js';
import { buildDeps } from './lib/deps.js';

export default async (req) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const db = createSupabaseDb(process.env);
  return makeTicketsCheckoutHandler({
    env: process.env,
    db,
    stripe,
    createContact,
    deps: buildDeps(process.env),
  })(req);
};

export const config = { path: '/api/tickets/checkout' };
