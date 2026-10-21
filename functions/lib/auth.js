// Authorization claims belong in app_metadata, which users cannot edit from
// the client. user_metadata is intentionally never accepted for access control.
//
// ============================================================================
// TEMPORARY (2026-10-21): 2FA DEFAULTS **OFF**. THIS IS NOT THE END STATE.
// ============================================================================
// The owner has no authenticator factor (hers was cleared because it had been
// enrolled on the developer's phone) and she tests on the production deploy,
// so the dashboard gate locked her out entirely. The env-var approach that
// preceded this did not survive contact with Netlify's scoping: a variable
// that is merely scoped wrong is indistinguishable from one that is unset, and
// the symptom is a silent lockout. So enforcement is now off by DEFAULT and
// requires an explicit opt-in to switch on.
//
// Consequences, stated plainly:
//   - A fresh environment with no config has 2FA OFF. This is fail-OPEN.
//   - Nothing but the pre-cutover checklist stands between this and launch.
//     See docs/pwrhaus-auth-2fa-plan.md § 0 and § 4.
//
// Re-enable with AUTH_REQUIRE_2FA=true (see below), then restore the
// fail-closed form from that doc's § 1 before the domain is repointed.
//
// Parsing is deliberately PERMISSIVE toward switching 2FA ON and strict about
// leaving it off: with the default inverted, a typo'd 'True' that silently
// left the dashboard unprotected is the expensive mistake, not a typo that
// turns protection on.
const ENABLED = new Set(['true', '1', 'yes', 'on']);

export function require2fa(env = process.env) {
  return ENABLED.has(String(env.AUTH_REQUIRE_2FA ?? '').trim().toLowerCase());
}

export function isPwrhausAdmin(user, env = process.env) {
  if (user?.app_metadata?.pwrhaus_role !== 'admin') return false;
  return require2fa(env) ? user?.aal === 'aal2' : true;
}
