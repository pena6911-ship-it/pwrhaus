import { createClient } from '@supabase/supabase-js';
import { makePublishHandler } from './lib/publish.js';
import { isPwrhausAdmin } from './lib/auth.js';

export default async (req) => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, NETLIFY_BUILD_HOOK } = process.env;

  const verifySession = async (token) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.getClaims(token);
    if (error) return null;
    return data?.claims ?? null;
  };

  const triggerBuild = async () => {
    if (!NETLIFY_BUILD_HOOK) throw new Error('NETLIFY_BUILD_HOOK not configured');
    const res = await fetch(NETLIFY_BUILD_HOOK, { method: 'POST' });
    if (!res.ok) throw new Error(`build hook failed: ${res.status}`);
  };

  return makePublishHandler({ verifySession, isAdmin: isPwrhausAdmin, triggerBuild })(req);
};

export const config = { path: '/api/publish' };
