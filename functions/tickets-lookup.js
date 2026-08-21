import { makeTicketsLookupHandler } from './lib/tickets-lookup.js';
import { createSupabaseDb } from './lib/supabase.js';

export default async (req) => {
  return makeTicketsLookupHandler({ db: createSupabaseDb(process.env) })(req);
};

export const config = { path: '/api/tickets/lookup' };
