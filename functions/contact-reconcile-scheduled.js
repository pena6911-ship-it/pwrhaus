import { reconcileContacts } from './lib/contact-reconciliation.js';
import { buildDeps } from './lib/deps.js';

export default async () => {
  const result = await reconcileContacts(buildDeps(process.env));
  console.info?.('contact.reconcile_scheduled_complete', result);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = {
  schedule: '@daily',
};
