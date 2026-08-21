import { makeTicketsAvailabilityHandler } from './lib/tickets-availability.js';
import { createSupabaseDb } from './lib/supabase.js';

export default async (req) => {
  return makeTicketsAvailabilityHandler({ db: createSupabaseDb(process.env) })(req);
};

export const config = { path: '/api/tickets/availability' };
