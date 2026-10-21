// Eleventy merges EVERY export of a _data module into the data object, so this
// file must export the default only. A named export here gets serialized into
// the page (a helper function once landed in window.__PWRHAUS as its own source
// text), so the 2FA rule is imported from the functions layer instead of being
// redefined — one source of truth, and the UI gate can never drift from the API
// gate. See functions/lib/auth.js for the rule and the owner-approved deviation
// from docs/pwrhaus-auth-2fa-plan.md § 1.
import { require2fa } from '../../functions/lib/auth.js';

export default function admin() {
  return {
    require2fa: require2fa(),
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    ghlLocationId: process.env.GHL_LOCATION_ID || '',
  };
}
