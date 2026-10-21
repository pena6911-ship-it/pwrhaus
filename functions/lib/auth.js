// Authorization claims belong in app_metadata, which users cannot edit from
// the client. user_metadata is intentionally never accepted for access control.
//
// The second-factor requirement is gated on the same AUTH_REQUIRE_2FA env var
// the dashboard build reads (src/_data/admin.js), so the UI gate and the API
// gate can never disagree — a dashboard that lets the owner in but an API that
// rejects every save is worse than either state alone.
//
// DEFAULT IS ON: only the explicit string 'false' disables it.
export function require2fa(env = process.env) {
  return env.AUTH_REQUIRE_2FA !== 'false';
}

export function isPwrhausAdmin(user, env = process.env) {
  if (user?.app_metadata?.pwrhaus_role !== 'admin') return false;
  return require2fa(env) ? user?.aal === 'aal2' : true;
}
