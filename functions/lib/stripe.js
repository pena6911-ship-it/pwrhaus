import Stripe from 'stripe';

export function createStripeVerifier(env) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  return (rawBody, signature) => stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}
