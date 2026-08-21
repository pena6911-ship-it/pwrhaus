// Authorization claims belong in app_metadata, which users cannot edit from
// the client. user_metadata is intentionally never accepted for access control.
export function isPwrhausAdmin(user) {
  return user?.app_metadata?.pwrhaus_role === 'admin';
}
