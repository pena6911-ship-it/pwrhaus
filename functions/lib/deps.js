import { createSupabaseDb } from './supabase.js';
import { createGhlClient } from './ghl.js';

export function buildDeps(env) {
  return {
    db: createSupabaseDb(env),
    ghl: createGhlClient({ apiKey: env.GHL_API_KEY, locationId: env.GHL_LOCATION_ID }),
  };
}

export function buildStripeDeps(env) {
  return { db: createSupabaseDb(env) };
}
