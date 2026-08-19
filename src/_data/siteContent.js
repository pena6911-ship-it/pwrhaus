import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const seed = () => JSON.parse(readFileSync(new URL('../../data/siteContent.seed.json', import.meta.url), 'utf8'));

export default async function siteContent() {
  const fallback = seed();
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return fallback;
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.from('site_content').select('value').eq('key', 'events_page').maybeSingle();
    if (error) throw error;
    // Merge over defaults so a partial row never blanks the hero.
    return { ...fallback, ...(data?.value ?? {}), eventsHero: { ...fallback.eventsHero, ...(data?.value?.eventsHero ?? {}) } };
  } catch (err) {
    console.warn('[siteContent.js] Supabase read failed, using seed:', err.message);
    return fallback;
  }
}
