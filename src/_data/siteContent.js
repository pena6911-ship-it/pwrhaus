import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// key ↔ slug for every editable page. Single source of truth for the build.
const PAGE_KEYS = {
  home_page: 'home',
  events_page: 'events',
  membership_page: 'membership',
  lessons_page: 'lessons',
  corporate_page: 'corporate',
  sponsors_page: 'sponsors',
  about_page: 'about',
};

const seed = () => JSON.parse(readFileSync(new URL('../../data/siteContent.seed.json', import.meta.url), 'utf8'));

export default async function siteContent() {
  const fallback = seed();
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return fallback;
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.from('site_content').select('key,value');
    if (error) throw error;
    const rows = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
    const pages = {};
    for (const [key, slug] of Object.entries(PAGE_KEYS)) {
      const defaults = fallback.pages[slug]?.hero ?? {};
      const value = rows[key] ?? {};
      // Normalize the legacy events shape ({ eventsHero }) into { hero }.
      const hero = value.hero ?? value.eventsHero ?? {};
      pages[slug] = { hero: { ...defaults, ...hero } };
    }
    return { pages };
  } catch (err) {
    console.warn('[siteContent.js] Supabase read failed, using seed:', err.message);
    return fallback;
  }
}
