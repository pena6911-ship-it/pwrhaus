import { makeTicketExpirySweep } from './lib/ticket-expiry.js';
import { createSupabaseDb } from './lib/supabase.js';

export default async () => {
  const sweep = makeTicketExpirySweep({ db: createSupabaseDb(process.env) });
  const result = await sweep();
  console.info?.('tickets.expiry_sweep_complete', result);
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
};

export const config = {
  schedule: '@daily',
};
