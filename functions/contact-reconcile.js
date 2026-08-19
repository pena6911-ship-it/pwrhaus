import { makeContactReconcileHandler } from './lib/handlers.js';
import { reconcileContacts } from './lib/contact-reconciliation.js';
import { buildDeps } from './lib/deps.js';

export default async (req) => {
  const handler = makeContactReconcileHandler({
    reconcileContacts,
    deps: buildDeps(process.env),
    env: process.env,
  });
  return handler(req);
};

export const config = {
  path: '/api/admin/reconcile-contacts',
};
