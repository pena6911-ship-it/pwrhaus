import Stripe from 'stripe';
import { makeTicketsCheckoutHandler } from './lib/tickets-checkout.js';
import { createSupabaseDb } from './lib/supabase.js';

export default async (req) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const db = createSupabaseDb(process.env);
  return makeTicketsCheckoutHandler({ env: process.env, db, stripe })(req);
};

export const config = { path: '/api/tickets/checkout' };
