import { makeTicketsAssignHandler } from './lib/tickets-assign.js';
import { createSupabaseDb } from './lib/supabase.js';
import { createEmailer } from './lib/ticket-email.js';
import { createContact } from './lib/contacts.js';
import { buildDeps } from './lib/deps.js';

export default async (req) => {
  return makeTicketsAssignHandler({
    db: createSupabaseDb(process.env),
    createContact,
    deps: buildDeps(process.env),
    email: createEmailer(process.env),
  })(req);
};

export const config = { path: '/api/tickets/assign' };
