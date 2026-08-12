import { makeContactCreateHandler } from './lib/handlers.js';
import { createContact } from './lib/contacts.js';
import { buildDeps } from './lib/deps.js';

export default async (req) => {
  const handler = makeContactCreateHandler({ createContact, deps: buildDeps(process.env) });
  return handler(req);
};

export const config = { path: '/api/contacts' };
