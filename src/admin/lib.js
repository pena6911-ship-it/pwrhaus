// Pure dashboard helpers — no DOM. Importable by node --test and the browser SPA.

export function slugify(name = '') {
  return String(name).toLowerCase().trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function usd(cents) {
  const n = Number(cents) / 100;
  return '$' + (Number.isInteger(n) ? String(n) : n.toFixed(2));
}

export function eventDateLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
}

export function validateEvent(input = {}) {
  const errors = {};
  const need = (k, msg) => { if (!input[k] || String(input[k]).trim() === '') errors[k] = msg; };
  need('name', 'Name is required');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug || '')) errors.slug = 'Use lowercase letters, numbers, and hyphens';
  need('city', 'City is required');
  need('venue', 'Venue is required');
  if (!Date.parse(input.starts_at)) errors.starts_at = 'A valid date/time is required';
  if (!Number.isInteger(input.price_cents) || input.price_cents < 0) errors.price_cents = 'Price must be whole cents ≥ 0';
  if (!Number.isInteger(input.capacity) || input.capacity < 0) errors.capacity = 'Capacity must be a whole number ≥ 0';
  need('summary', 'Summary is required');
  need('image', 'An image is required');
  need('image_alt', 'Alt text is required for accessibility');
  return { ok: Object.keys(errors).length === 0, errors };
}

export function sortByOrder(events = []) {
  return [...events].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || new Date(a.starts_at) - new Date(b.starts_at));
}

export function nextSortOrder(events = []) {
  return events.length ? Math.max(...events.map((e) => e.sort_order ?? 0)) + 1 : 0;
}

// Keyboard-accessible reorder: move `id` one slot up/down among its peers and
// renumber sort_order sequentially. Boundaries and unknown ids are safe no-ops
// (still returned renumbered 0..n). Returns a fresh array of shallow copies.
export function moveInOrder(events = [], id, direction) {
  const list = sortByOrder(events);
  const renumber = (arr) => arr.map((e, idx) => ({ ...e, sort_order: idx }));
  const i = list.findIndex((e) => e.id === id);
  if (i === -1) return renumber(list);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return renumber(list);
  const swapped = [...list];
  [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
  return renumber(swapped);
}

export function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
export function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

export function computeStats(events = []) {
  const now = Date.now();
  return {
    upcoming: events.filter((e) => new Date(e.starts_at).getTime() >= now).length,
    published: events.filter((e) => e.published === true).length,
    draft: events.filter((e) => e.published !== true).length,
  };
}

export function weekAgoIso(nowMs = Date.now()) {
  return new Date(nowMs - 7 * 864e5).toISOString();
}

export function tierLabel(tier) {
  return { free: 'Free', member: 'Member', inner_circle: 'Inner circle' }[tier] ?? String(tier ?? '');
}

// A scanned QR carries the /checkin/?t=<token> URL; the token is that parameter.
// Returns '' for anything that is not one of our ticket codes.
export function tokenFromScan(raw) {
  const text = String(raw || '');
  const marker = text.indexOf('?t=');
  if (marker === -1) return '';
  return decodeURIComponent(text.slice(marker + 3).split('&')[0]);
}

// jsQR ships a UMD bundle whose global can be either the decode function itself
// or a module object wrapping it as `default`, depending on how it is loaded.
// Accepting only one shape is how a perfectly good decoder reads as "missing".
export function resolveJsqr(global) {
  const g = global && global.jsQR;
  if (typeof g === 'function') return g;
  if (g && typeof g.default === 'function') return g.default;
  return null;
}

// Native QR support can report true while detect() returns no codes forever.
// Give the vendored decoder a chance after a short, frame-producing wait.
export function shouldFallbackToJsqr(decoder, hasJsqr, elapsedMs, thresholdMs = 3500) {
  return decoder === 'native' && hasJsqr && elapsedMs >= thresholdMs;
}
