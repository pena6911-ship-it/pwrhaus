import { createClient } from '@supabase/supabase-js';
import { makeTicketsCheckinHandler } from './lib/tickets-checkin.js';
import { createSupabaseDb } from './lib/supabase.js';
import { createContact } from './lib/contacts.js';
import { buildDeps } from './lib/deps.js';
import { isPwrhausAdmin } from './lib/auth.js';

export default async (req) => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

  const verifySession = async (token) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.getUser(token);
    if (error) return null;
    return data?.user ?? null;
  };

  return makeTicketsCheckinHandler({
    verifySession, isAdmin: isPwrhausAdmin,
    db: createSupabaseDb(process.env),
    createContact,
    deps: buildDeps(process.env),
  })(req);
};

export const config = { path: '/api/tickets/checkin' };
