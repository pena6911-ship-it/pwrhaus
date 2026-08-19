import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const seed = () => JSON.parse(readFileSync(new URL('../../data/events.seed.json', import.meta.url), 'utf8')).events;

const byOrder = (rows) =>
  [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || new Date(a.starts_at) - new Date(b.starts_at));

export default async function events() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return byOrder(seed().filter((e) => e.published === true));
  }
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.from('events').select('*').eq('published', true);
    if (error) throw error;
    return byOrder(data ?? []);
  } catch (err) {
    console.warn('[events.js] Supabase read failed, using seed:', err.message);
    return byOrder(seed().filter((e) => e.published === true));
  }
}
