export const ALLOWED_SOURCES = new Set([
  'web_free_profile',
  'web_event_interest',
  'web_lessons',
  'web_sponsor',
  'web_corporate',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  return EMAIL_RE.test(trimmed);
}

export function truncate(value, max) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '') return null;
  return s.length > max ? s.slice(0, max) : s;
}

export function sanitizeContactInput(body) {
  return {
    email: String(body.email).trim().toLowerCase(),
    full_name: truncate(body.full_name, 120),
    phone: truncate(body.phone, 40),
    notes: truncate(body.notes, 2000),
    source: ALLOWED_SOURCES.has(body.source) ? body.source : 'site',
    tier: 'free',
  };
}
