// PWRHaus Dashboard SPA — auth, events CRUD, page settings, publish, polish.
// Pure logic lives in /admin/lib.js (unit-tested). This module is DOM glue.
import { slugify, usd, eventDateLabel, validateEvent, sortByOrder, nextSortOrder, computeStats, moveInOrder, escapeHtml, escapeAttr, crmDateRange, tierLabel, tokenFromScan, resolveJsqr, shouldFallbackToJsqr, checkinOverlayState } from '/admin/lib.js';

// supabase-js is vendored locally (UMD global) — no runtime CDN dependency.
const { createClient } = window.supabase;

const cfg = window.__PWRHAUS || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const show = (el, on) => { if (el) el.hidden = !on; };

const CHECKIN_QUEUE_STORAGE_KEY = 'pwrhaus.checkinQueue';

// A reload or an iOS background-tab eviction must not silently lose a queued
// check-in — the queue is small (token/number + a door-captured name/email)
// and lives in localStorage so it survives both. A private-mode failure here
// must not break check-in, so every access is wrapped.
function loadPersistedCheckinQueue() {
  try {
    const raw = localStorage.getItem(CHECKIN_QUEUE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistCheckinQueue() {
  try {
    localStorage.setItem(CHECKIN_QUEUE_STORAGE_KEY, JSON.stringify(state.checkinQueue));
  } catch {
    // Storage unavailable (private mode, full disk, etc). The in-memory
    // queue still drives this session; it just won't survive a reload.
  }
}

const state = { events: [], contacts: [], tickets: [], slugTouched: false, editingId: null, pendingFile: null, deferredInstall: null, checkinQueue: loadPersistedCheckinQueue() };

let sb = null;
let pendingMfaFactorId = '';

/* ============================ boot / auth ============================ */

document.addEventListener('DOMContentLoaded', () => {
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    renderUnconfigured();
    return;
  }
  sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  wireAuth();
  registerServiceWorker();
  wireInstallPrompt();
  requireSession();

  sb.auth.onAuthStateChange((evt) => {
    if (evt === 'PASSWORD_RECOVERY') {
      show($('#app-view'), false);
      show($('#login-view'), true);
      show($('#login-form'), false);
      show($('#recover-form'), false);
      show($('#reset-form'), true);
    }
  });
});

function renderUnconfigured() {
  const login = $('#login-view');
  show(login, true);
  $('.login-card').innerHTML =
    '<img class="login-logo" src="/img/logo.png" alt="PWRHAUS Golf Society">' +
    '<h1>Dashboard not configured</h1>' +
    '<p class="login-sub">This preview has no Supabase connection. Set SUPABASE_URL and SUPABASE_ANON_KEY to enable the dashboard.</p>';
}

async function requireSession() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    const { data: userData } = await sb.auth.getUser();
    if (userData?.user?.app_metadata?.pwrhaus_role !== 'admin') {
      await sb.auth.signOut();
      show($('#mfa-view'), false);
      show($('#login-view'), true);
      show($('#login-form'), true);
      $('#login-error').textContent = 'This account is not authorized for the dashboard.';
      show($('#login-error'), true);
      return;
    }
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== 'aal2') {
      await requireMfa(aal);
      return;
    }
    show($('#login-view'), false);
    show($('#mfa-view'), false);
    show($('#app-view'), true);
    boot();
  } else {
    show($('#app-view'), false);
    show($('#login-view'), true);
    show($('#login-form'), true);
    show($('#recover-form'), false);
    show($('#reset-form'), false);
  }
}

async function requireMfa() {
  show($('#login-view'), false);
  show($('#app-view'), false);
  show($('#mfa-view'), true);
  show($('#mfa-enroll-panel'), false);
  show($('#mfa-enroll-view'), false);
  show($('#mfa-challenge-form'), false);
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error) { showMfaError(error.message); return; }
  const factor = (data?.totp || []).find((item) => item.status === 'verified');
  if (factor) {
    pendingMfaFactorId = factor.id;
    show($('#mfa-challenge-form'), true);
  } else {
    show($('#mfa-enroll-view'), true);
  }
}

function showMfaError(message) {
  show($('#login-view'), false);
  show($('#app-view'), false);
  show($('#mfa-view'), true);
  const target = $('#mfa-general-error');
  target.textContent = message;
  show(target, true);
}

async function verifyMfa(factorId, code, errorEl) {
  show(errorEl, false);
  const challenge = await sb.auth.mfa.challenge({ factorId });
  if (challenge.error) { errorEl.textContent = challenge.error.message; show(errorEl, true); return false; }
  const result = await sb.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: code.trim() });
  if (result.error) { errorEl.textContent = 'That verification code was not accepted.'; show(errorEl, true); return false; }
  return true;
}

async function beginMfaEnrollment() {
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'PWRHaus Dashboard' });
  if (error) { showMfaError(error.message); return; }
  pendingMfaFactorId = data.id;
  $('#mfa-qr').innerHTML = data.totp.qr;
  $('#mfa-secret').textContent = `Manual setup key: ${data.totp.secret}`;
  show($('#mfa-enroll-panel'), true);
  $('#mfa-enroll-code').focus();
}

function wireAuth() {
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    show(err, false);
    const { error } = await sb.auth.signInWithPassword({
      email: $('#login-email').value.trim(),
      password: $('#login-password').value,
    });
    if (error) { err.textContent = 'That email and password did not match.'; show(err, true); return; }
    requireSession();
  });

  const logout = async () => { await sb.auth.signOut(); requireSession(); };
  $('#logout-btn').addEventListener('click', logout);
  $('#logout-btn-top').addEventListener('click', logout);

  $('#forgot-btn').addEventListener('click', () => { show($('#login-form'), false); show($('#recover-form'), true); });
  $('#recover-cancel').addEventListener('click', () => { show($('#recover-form'), false); show($('#login-form'), true); });

  $('#recover-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#recover-error');
    show(err, false);
    const { error } = await sb.auth.resetPasswordForEmail($('#recover-email').value.trim(), {
      redirectTo: location.origin + '/admin/',
    });
    if (error) { err.textContent = error.message; show(err, true); return; }
    show($('#recover-form'), false); show($('#login-form'), true);
    toast('Check your email for a reset link.', 'info');
  });

  $('#reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#reset-error');
    show(err, false);
    const { error } = await sb.auth.updateUser({ password: $('#reset-password').value });
    if (error) { err.textContent = error.message; show(err, true); return; }
    toast('Password updated.', 'info');
    requireSession();
  });

  $('#mfa-enroll-btn').addEventListener('click', beginMfaEnrollment);
  $('#mfa-enroll-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = await verifyMfa(pendingMfaFactorId, $('#mfa-enroll-code').value, $('#mfa-enroll-error'));
    if (ok) requireSession();
  });
  $('#mfa-challenge-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = await verifyMfa(pendingMfaFactorId, $('#mfa-challenge-code').value, $('#mfa-challenge-error'));
    if (ok) requireSession();
  });
  $('#mfa-signout-btn').addEventListener('click', async () => { await sb.auth.signOut(); requireSession(); });
}

/* ============================ app shell ============================ */

async function boot() {
  wireNav();
  wireList();
  wireDrawer();
  wireSettings();
  wireCrm();
  wireCheckin();
  renderSkeleton();
  await loadEvents();
  await loadRosters();
  renderStats();
  renderList();
}

function wireNav() {
  const go = (view) => {
    show($('#view-events'), view === 'events');
    show($('#view-settings'), view === 'settings');
    show($('#view-crm'), view === 'crm');
    show($('#view-checkin'), view === 'checkin');
    if (view === 'crm') loadCrm();
    if (view === 'checkin') loadCheckin();
    if (view !== 'checkin') stopScanning();
    $$('.nav-item[data-view], .tab[data-view]').forEach((b) => {
      if (b.dataset.view === view) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
  };
  $$('.nav-item[data-view], .tab[data-view]').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  $('#new-event-btn').addEventListener('click', () => openDrawer(null));
  $('#new-event-tab').addEventListener('click', () => openDrawer(null));
}

async function loadEvents() {
  const { data, error } = await sb.from('events').select('*');
  if (error) { toast('Could not load events.', 'error'); state.events = []; return; }
  state.events = sortByOrder(data || []);
}

async function refresh() {
  await loadEvents();
  await loadRosters();
  renderStats();
  renderList();
}

// Real registration counts + per-event roster, replacing the "—" tile.
async function loadRosters() {
  const { data, error } = await sb
    .from('tickets')
    .select('id,event_id,ticket_no,tier_sold,contact_id,status,contacts(full_name,email)')
    .eq('status', 'valid');
  // null is distinct from "zero registrations" — a failed load must not be
  // rendered as an empty roster.
  if (error) { state.tickets = null; toast('Could not load registrations.', 'error'); return; }
  state.tickets = data || [];
}

function ticketsForEvent(eventId) {
  if (!state.tickets) return null;
  return state.tickets.filter((t) => t.event_id === eventId);
}

function renderRoster(ev) {
  const box = $('#event-roster');
  const rows = ticketsForEvent(ev.id);
  box.innerHTML = '';
  if (rows === null) {
    const p = document.createElement('p');
    p.className = 'meta';
    p.textContent = 'Could not load registrations.';
    box.appendChild(p);
    box.hidden = false;
    return;
  }
  const unassigned = rows.filter((t) => !t.contact_id).length;
  const h = document.createElement('h3');
  h.textContent = `${ev.name} — ${rows.length} registered${unassigned ? `, ${unassigned} unassigned` : ''}`;
  box.appendChild(h);
  for (const t of rows) {
    const p = document.createElement('p');
    p.className = 'meta';
    p.textContent = `${t.ticket_no} · ${t.tier_sold === 'member' ? 'Member' : 'Non-member'} · ` +
      (t.contacts ? `${t.contacts.full_name || ''} <${t.contacts.email}>` : 'Unassigned');
    box.appendChild(p);
  }
  box.hidden = false;
}

/* ============================ events view ============================ */

function renderSkeleton() {
  const list = $('#event-list');
  list.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const s = document.createElement('div');
    s.className = 'skeleton';
    list.appendChild(s);
  }
}

function renderStats() {
  const s = computeStats(state.events);
  const tiles = [
    { k: 'Upcoming', n: s.upcoming },
    { k: 'Published', n: s.published },
    { k: 'Draft', n: s.draft },
    { k: 'Registrations', n: state.tickets ? state.tickets.length : '—' },
  ];
  const row = $('#stat-row');
  row.innerHTML = '';
  for (const t of tiles) {
    const el = document.createElement('div');
    el.className = 'stat';
    if (t.title) el.title = t.title;
    const n = document.createElement('div'); n.className = 'n'; n.textContent = String(t.n);
    const k = document.createElement('div'); k.className = 'k'; k.textContent = t.k;
    el.append(n, k);
    row.appendChild(el);
  }
}

function renderList() {
  const list = $('#event-list');
  list.innerHTML = '';
  if (!state.events.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No events yet — create your first one.';
    list.appendChild(empty);
    return;
  }
  for (const ev of state.events) list.appendChild(eventCard(ev));
}

function eventCard(ev) {
  const card = document.createElement('article');
  card.className = 'event-card';
  card.draggable = true;
  card.dataset.id = ev.id;

  const img = document.createElement('img');
  img.className = 'thumb';
  img.src = ev.image || '/img/favicon-mark.png';
  img.alt = ev.image_alt || ev.name || 'Event image';
  img.loading = 'lazy';

  const body = document.createElement('div');
  const title = document.createElement('h3'); title.className = 'title'; title.textContent = ev.name;
  const meta = document.createElement('p'); meta.className = 'meta';
  meta.textContent = `${ev.city || ''}${ev.city ? ' · ' : ''}${eventDateLabel(ev.starts_at)}`;
  const meta2 = document.createElement('p'); meta2.className = 'meta';
  meta2.textContent = `${ev.venue || ''} · ${usd(ev.price_cents)} · ${ev.tickets_enabled ? 'Ticketed' : 'No tickets'}`;
  const badge = document.createElement('span');
  badge.className = 'badge ' + (ev.published ? 'published' : 'draft');
  badge.textContent = ev.published ? 'Published' : 'Draft';
  body.append(title, meta, meta2, badge);

  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(
    actionBtn('↑', 'move-up', ev.id, 'btn-secondary btn-icon', 'Move up'),
    actionBtn('↓', 'move-down', ev.id, 'btn-secondary btn-icon', 'Move down'),
    actionBtn('Edit', 'edit', ev.id, 'btn-secondary'),
    actionBtn(ev.published ? 'Unpublish' : 'Publish', 'publish', ev.id, 'btn-secondary'),
    actionBtn('Duplicate', 'duplicate', ev.id, 'btn-secondary'),
    actionBtn('Roster', 'roster', ev.id, 'btn-secondary'),
    actionBtn('Delete', 'delete', ev.id, 'btn-link btn-danger'),
  );

  card.append(img, body, actions);
  return card;
}

function actionBtn(label, action, id, cls, ariaLabel) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn ' + cls;
  b.dataset.action = action;
  b.dataset.id = id;
  b.textContent = label;
  if (ariaLabel) { b.setAttribute('aria-label', ariaLabel); b.title = ariaLabel; }
  return b;
}

function wireList() {
  const list = $('#event-list');

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const ev = state.events.find((x) => x.id === btn.dataset.id);
    if (!ev) return;
    const action = btn.dataset.action;

    if (action === 'edit') { openDrawer(ev); return; }

    if (action === 'roster') { renderRoster(ev); return; }

    if (action === 'move-up' || action === 'move-down') {
      const reordered = moveInOrder(state.events, ev.id, action === 'move-up' ? 'up' : 'down');
      const changed = reordered.filter((r) => {
        const cur = state.events.find((x) => x.id === r.id);
        return cur && cur.sort_order !== r.sort_order;
      });
      if (!changed.length) return; // already at the boundary
      for (const r of changed) {
        await sb.from('events').update({ sort_order: r.sort_order, updated_at: new Date().toISOString() }).eq('id', r.id);
      }
      toast('Order updated.', 'info');
      await refresh();
      // Keep focus on the same control so it can be pressed repeatedly by keyboard.
      document.querySelector(`button[data-action="${action}"][data-id="${ev.id}"]`)?.focus();
      triggerPublish();
      return;
    }

    if (action === 'publish') {
      const { error } = await sb.from('events').update({ published: !ev.published, updated_at: new Date().toISOString() }).eq('id', ev.id);
      if (error) return toast('Update failed.', 'error');
      toast(ev.published ? 'Moved to draft.' : 'Published.', 'info');
      await refresh(); triggerPublish(); return;
    }

    if (action === 'duplicate') {
      const copy = { ...ev };
      delete copy.id; delete copy.created_at;
      copy.name = `${ev.name} (copy)`;
      copy.slug = `${slugify(ev.name)}-copy-${Date.now().toString(36)}`;
      copy.published = false;
      copy.sort_order = nextSortOrder(state.events);
      copy.updated_at = new Date().toISOString();
      const { error } = await sb.from('events').insert(copy);
      if (error) return toast('Duplicate failed.', 'error');
      toast('Duplicated as a draft.', 'info');
      await refresh(); return;
    }

    if (action === 'delete') {
      if (!confirm(`Delete "${ev.name}"? This cannot be undone.`)) return;
      const { error } = await sb.from('events').delete().eq('id', ev.id);
      if (error) return toast('Delete failed.', 'error');
      toast('Event deleted.', 'info');
      await refresh(); triggerPublish(); return;
    }
  });

  // Drag-to-reorder
  let dragId = null;
  list.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.event-card');
    if (!card) return;
    dragId = card.dataset.id;
    card.classList.add('dragging');
  });
  list.addEventListener('dragend', (e) => {
    const card = e.target.closest('.event-card');
    if (card) card.classList.remove('dragging');
  });
  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    const after = elementAfter(list, e.clientY);
    const dragging = $('.event-card.dragging');
    if (!dragging) return;
    if (after == null) list.appendChild(dragging);
    else list.insertBefore(dragging, after);
  });
  list.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (!dragId) return;
    dragId = null;
    const order = $$('.event-card', list).map((c) => c.dataset.id);
    const updates = order.map((id, i) => ({ id, sort_order: i }));
    // Persist only changed rows.
    const changed = updates.filter((u) => {
      const cur = state.events.find((x) => x.id === u.id);
      return cur && cur.sort_order !== u.sort_order;
    });
    for (const u of changed) {
      await sb.from('events').update({ sort_order: u.sort_order, updated_at: new Date().toISOString() }).eq('id', u.id);
    }
    if (changed.length) { toast('Order saved.', 'info'); await refresh(); triggerPublish(); }
  });
}

function elementAfter(container, y) {
  const cards = $$('.event-card:not(.dragging)', container);
  return cards.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

/* ============================ drawer (create/edit) ============================ */

function drawerFields() {
  return `
    <h3 id="drawer-title">New event</h3>
    <label>Name<input id="f-name" type="text" required></label>
    <label>Slug<input id="f-slug" type="text" required></label>
    <div class="drawer-row">
      <label>City<input id="f-city" type="text"></label>
      <label>Venue<input id="f-venue" type="text"></label>
    </div>
    <label>Date &amp; time<input id="f-starts" type="datetime-local"></label>
    <div class="drawer-row">
      <label>Price (USD)<input id="f-price" type="number" min="0" step="0.01"></label>
      <label>Capacity<input id="f-capacity" type="number" min="0" step="1"></label>
    </div>
    <div class="toggle-row"><input id="f-tickets-enabled" type="checkbox"><span>Ticketed event</span></div>
    <p class="field-hint">Turn this on only when guests should buy tickets through the website. Publishing alone does not open ticket sales.</p>
    <label>Summary<textarea id="f-summary"></textarea></label>
    <label>Body<textarea id="f-body"></textarea></label>
    <label>Registration URL<input id="f-reg" type="url"></label>
    <label>Image<input id="f-image" type="file" accept="image/*"></label>
    <img id="f-preview" class="img-preview" alt="" hidden>
    <label>Image alt text<input id="f-alt" type="text"></label>
    <div class="toggle-row"><input id="f-published" type="checkbox"><span>Published</span></div>
    <p class="form-error" id="drawer-error" role="alert" hidden></p>
    <div class="drawer-actions">
      <button class="btn btn-primary" type="submit">Save event</button>
      <button class="btn btn-secondary" type="button" data-close>Cancel</button>
    </div>`;
}

let drawerWired = false;
function wireDrawer() {
  const drawer = $('#event-drawer');
  const form = $('#event-form');
  form.innerHTML = drawerFields();

  if (!drawerWired) {
    drawerWired = true;
    drawer.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeDrawer(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) closeDrawer(); });
    form.addEventListener('submit', onDrawerSubmit);
  }

  $('#f-name').addEventListener('input', () => {
    if (!state.slugTouched) $('#f-slug').value = slugify($('#f-name').value);
  });
  $('#f-slug').addEventListener('input', () => { state.slugTouched = true; });
  $('#f-image').addEventListener('change', () => {
    const file = $('#f-image').files[0];
    state.pendingFile = file || null;
    const prev = $('#f-preview');
    if (file) { prev.src = URL.createObjectURL(file); show(prev, true); }
    else show(prev, false);
  });
}

function openDrawer(ev) {
  state.editingId = ev?.id || null;
  state.slugTouched = !!ev;
  state.pendingFile = null;
  wireDrawer(); // reset form + field listeners
  $('#drawer-title').textContent = ev ? 'Edit event' : 'New event';
  $('#f-name').value = ev?.name || '';
  $('#f-slug').value = ev?.slug || '';
  $('#f-city').value = ev?.city || '';
  $('#f-venue').value = ev?.venue || '';
  $('#f-starts').value = isoToLocalInput(ev?.starts_at);
  $('#f-price').value = ev ? (ev.price_cents / 100) : '';
  $('#f-capacity').value = ev?.capacity ?? '';
  $('#f-tickets-enabled').checked = !!ev?.tickets_enabled;
  $('#f-summary').value = ev?.summary || '';
  $('#f-body').value = ev?.body || '';
  $('#f-reg').value = ev?.registration_url || '';
  $('#f-alt').value = ev?.image_alt || '';
  $('#f-published').checked = !!ev?.published;
  const prev = $('#f-preview');
  if (ev?.image) { prev.src = ev.image; show(prev, true); } else show(prev, false);

  const drawer = $('#event-drawer');
  drawer.hidden = false;
  drawer.setAttribute('aria-hidden', 'false');
  $('#f-name').focus();
}

function closeDrawer() {
  const drawer = $('#event-drawer');
  drawer.hidden = true;
  drawer.setAttribute('aria-hidden', 'true');
  state.editingId = null; state.slugTouched = false; state.pendingFile = null;
}

async function onDrawerSubmit(e) {
  e.preventDefault();
  const err = $('#drawer-error');
  show(err, false);
  clearFieldErrors();

  const dollars = parseFloat($('#f-price').value);
  const payload = {
    name: $('#f-name').value.trim(),
    slug: $('#f-slug').value.trim(),
    city: $('#f-city').value.trim(),
    venue: $('#f-venue').value.trim(),
    starts_at: localInputToIso($('#f-starts').value),
    price_cents: Number.isFinite(dollars) ? Math.round(dollars * 100) : NaN,
    capacity: parseInt($('#f-capacity').value, 10),
    tickets_enabled: $('#f-tickets-enabled').checked,
    summary: $('#f-summary').value.trim(),
    body: $('#f-body').value.trim(),
    registration_url: $('#f-reg').value.trim() || null,
    image: state.editingId ? (state.events.find((x) => x.id === state.editingId)?.image || '') : '',
    image_alt: $('#f-alt').value.trim(),
    published: $('#f-published').checked,
  };

  // Upload a newly chosen image first so validation sees the URL.
  if (state.pendingFile) {
    try {
      payload.image = await uploadImage(state.pendingFile, payload.slug || 'event');
    } catch (uErr) {
      err.textContent = 'Image upload failed: ' + uErr.message; show(err, true); return;
    }
  }

  const { ok, errors } = validateEvent(payload);
  if (!ok) { renderFieldErrors(errors); err.textContent = 'Please fix the highlighted fields.'; show(err, true); return; }

  payload.updated_at = new Date().toISOString();
  let error;
  if (state.editingId) {
    ({ error } = await sb.from('events').update(payload).eq('id', state.editingId));
  } else {
    payload.sort_order = nextSortOrder(state.events);
    ({ error } = await sb.from('events').insert(payload));
  }
  if (error) { err.textContent = error.message; show(err, true); return; }

  closeDrawer();
  toast(state.editingId ? 'Event updated.' : 'Event created.', 'info');
  await refresh();
  triggerPublish();
}

const FIELD_MAP = { name: 'f-name', slug: 'f-slug', city: 'f-city', venue: 'f-venue', starts_at: 'f-starts', price_cents: 'f-price', capacity: 'f-capacity', summary: 'f-summary', image: 'f-image', image_alt: 'f-alt' };
function clearFieldErrors() {
  $$('.field-error').forEach((n) => n.remove());
  Object.values(FIELD_MAP).forEach((id) => $('#' + id)?.classList.remove('invalid'));
}
function renderFieldErrors(errors) {
  for (const [field, msg] of Object.entries(errors)) {
    const input = $('#' + (FIELD_MAP[field] || ''));
    if (!input) continue;
    input.classList.add('invalid');
    const p = document.createElement('p');
    p.className = 'field-error';
    p.textContent = msg;
    input.closest('label')?.appendChild(p);
  }
}

async function uploadImage(file, slug) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${slug}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('event-media').upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = sb.storage.from('event-media').getPublicUrl(path);
  return data.publicUrl;
}

function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/* ============================ site content (page heroes) ============================ */

const PAGES = [
  { key: 'home_page',       slug: 'home',       label: 'Home',       media: 'video' },
  { key: 'events_page',     slug: 'events',     label: 'Events',     media: 'video' },
  { key: 'membership_page', slug: 'membership', label: 'Membership', media: 'image' },
  { key: 'lessons_page',    slug: 'lessons',    label: 'Lessons',    media: 'image' },
  { key: 'corporate_page',  slug: 'corporate',  label: 'Corporate',  media: 'image' },
  { key: 'sponsors_page',   slug: 'sponsors',   label: 'Sponsors',   media: 'image' },
  { key: 'about_page',      slug: 'about',      label: 'About',      media: 'image' },
];

let settingsWired = false;
function wireSettings() {
  const list = $('#page-list');
  list.innerHTML = '';
  for (const p of PAGES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'page-item'; b.dataset.key = p.key;
    b.textContent = p.label;
    b.addEventListener('click', () => selectPage(p.key));
    list.appendChild(b);
  }
  if (!settingsWired) {
    settingsWired = true;
    $('#settings-form').addEventListener('submit', onSettingsSubmit);
  }
  selectPage(PAGES[0].key); // default to Home
}

function heroFields(page, hero) {
  const t = (id, label, val, area) => area
    ? `<label>${label}<textarea id="${id}">${escapeHtml(val || '')}</textarea></label>`
    : `<label>${label}<input id="${id}" type="text" value="${escapeAttr(val || '')}"></label>`;
  let media = '';
  if (page.media === 'image') {
    media =
      `<p class="field-hint">The current hero media is served from the site. You only need this if you want to swap the photo.</p>` +
      `<label>Hero image<input id="s-image-file" type="file" accept="image/*"></label>` +
      `<img id="s-image-preview" class="img-preview" alt=""${hero.image ? '' : ' hidden'}${hero.image ? ` src="${escapeAttr(hero.image)}"` : ''}>` +
      t('s-position', 'Focal position', hero.position) +
      `<p class="field-hint">Which part of the photo stays in view when it's cropped to the hero. Left–right, then top–bottom — <strong>50% 50%</strong> is centered; lower the second number to show more of the top (e.g. <strong>50% 30%</strong>), raise it to show more of the bottom.</p>`;
  } else {
    media =
      `<p class="field-hint">The hero video and its poster still are served from the site; edit these paths only if a developer has added a new file.</p>` +
      t('s-video', 'Hero video path', hero.video) + t('s-poster', 'Poster image path', hero.poster);
  }
  // Text is the everyday edit; media is tucked behind an optional toggle so the
  // default view is clean. The fields still exist (populated) so an untouched
  // save preserves the current image/video/poster/position.
  return t('s-eyebrow', 'Eyebrow', hero.eyebrow) +
         t('s-heading', 'Heading', hero.heading, true) +
         t('s-lead', 'Lead', hero.lead, true) +
         `<details class="media-advanced"><summary>Replace hero media (optional)</summary>${media}</details>` +
         `<p class="form-error" id="settings-error" role="alert" hidden></p>` +
         `<div class="drawer-actions"><button class="btn btn-primary" type="submit">Save page</button></div>`;
}

async function selectPage(key) {
  state.currentPageKey = key;
  state.pendingHeroFile = null;
  $$('.page-item').forEach((b) => b.classList.toggle('active', b.dataset.key === key));
  const page = PAGES.find((p) => p.key === key);
  const { data, error } = await sb.from('site_content').select('value').eq('key', key).maybeSingle();
  if (error) toast('Could not load page content.', 'error');
  const hero = data?.value?.hero ?? data?.value?.eventsHero ?? {};
  $('#settings-form').innerHTML = heroFields(page, hero);
  if (page.media === 'image') {
    $('#s-image-file').addEventListener('change', () => {
      const file = $('#s-image-file').files[0];
      state.pendingHeroFile = file || null;
      const prev = $('#s-image-preview');
      if (file) { prev.src = URL.createObjectURL(file); prev.hidden = false; }
    });
  }
}

async function onSettingsSubmit(e) {
  e.preventDefault();
  const err = $('#settings-error');
  err.hidden = true;
  const page = PAGES.find((p) => p.key === state.currentPageKey);
  const hero = {
    eyebrow: $('#s-eyebrow').value.trim(),
    heading: $('#s-heading').value.trim(),
    lead: $('#s-lead').value.trim(),
  };
  if (!hero.heading || !hero.lead) { err.textContent = 'Heading and lead are required.'; err.hidden = false; return; }
  if (page.media === 'image') {
    hero.position = $('#s-position').value.trim() || '50% 50%';
    hero.image = $('#s-image-preview').getAttribute('src') || '';
    if (state.pendingHeroFile) {
      try { hero.image = await uploadImage(state.pendingHeroFile, page.slug); }
      catch (uErr) { err.textContent = 'Image upload failed: ' + uErr.message; err.hidden = false; return; }
    }
    if (!hero.image) { err.textContent = 'A hero image is required.'; err.hidden = false; return; }
  } else {
    hero.video = $('#s-video').value.trim();
    hero.poster = $('#s-poster').value.trim();
  }
  const { error } = await sb.from('site_content').upsert({ key: page.key, value: { hero }, updated_at: new Date().toISOString() });
  if (error) { err.textContent = error.message; err.hidden = false; return; }
  toast(`${page.label} page saved.`, 'info');
  triggerPublish();
}

/* ============================ CRM (read-only lead intake) ============================ */

const CRM_PAGE_SIZE = 100;

let crmWired = false;
let listReq = 0;
let contactReq = 0;
let activeCrmRange = crmDateRange('week');
let crmPage = 0;
let crmTotal = 0;
function wireCrm() {
  if (crmWired) return;
  crmWired = true;
  let t = null;
  $('#crm-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { crmPage = 0; loadContactList(); }, 250); });
  $('#crm-tier').addEventListener('change', () => { crmPage = 0; loadContactList(); });
  $('#crm-source').addEventListener('change', () => { crmPage = 0; loadContactList(); });
  $('#crm-period').addEventListener('change', () => {
    const custom = $('#crm-period').value === 'custom';
    show($('#crm-custom-range'), custom);
    if (!custom) refreshCrmRange();
  });
  $('#crm-apply-range').addEventListener('click', refreshCrmRange);
  $('#contact-drawer').addEventListener('click', (e) => { if (e.target.closest('[data-close-contact]')) closeContactDrawer(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#contact-drawer').hidden) closeContactDrawer(); });
}

async function loadCrm() {
  renderCrmStats(null); // skeleton state
  await refreshCrmRange();
}

function selectedCrmRange() {
  return crmDateRange(
    $('#crm-period').value,
    Date.now(),
    $('#crm-date-from').value,
    $('#crm-date-to').value,
  );
}

async function refreshCrmRange() {
  const range = selectedCrmRange();
  if (!range) { toast('Choose a valid custom date range.', 'error'); return; }
  activeCrmRange = range;
  crmPage = 0;
  await Promise.all([loadCrmStats(range), loadContactList(range)]);
}

async function loadCrmStats(range = activeCrmRange) {
  const count = (q) => q.then(({ count: n, error }) => (error ? null : n));
  let periodQuery = sb.from('contacts').select('*', { count: 'exact', head: true });
  if (range?.from) periodQuery = periodQuery.gte('created_at', range.from);
  if (range?.to) periodQuery = periodQuery.lt('created_at', range.to);
  const [total, fresh, members, inner] = await Promise.all([
    count(sb.from('contacts').select('*', { count: 'exact', head: true })),
    count(periodQuery),
    count(sb.from('contacts').select('*', { count: 'exact', head: true }).eq('tier', 'member')),
    count(sb.from('contacts').select('*', { count: 'exact', head: true }).eq('tier', 'inner_circle')),
  ]);
  renderCrmStats({ total, fresh, members, inner, periodLabel: range?.label || 'Selected period' });
}

function renderCrmStats(s) {
  const periodStatLabel = s?.periodLabel === 'All time'
    ? 'All leads'
    : s?.periodLabel
      ? `New ${s.periodLabel.toLowerCase()}`
      : 'New this week';
  const tiles = [
    { k: 'Contacts', n: s?.total },
    { k: periodStatLabel, n: s?.fresh },
    { k: 'Members', n: s?.members },
    { k: 'Inner circle', n: s?.inner },
  ];
  const row = $('#crm-stat-row');
  row.innerHTML = '';
  for (const tdef of tiles) {
    const el = document.createElement('div');
    el.className = 'stat';
    const n = document.createElement('div'); n.className = 'n'; n.textContent = tdef.n == null ? '—' : String(tdef.n);
    const k = document.createElement('div'); k.className = 'k'; k.textContent = tdef.k;
    el.append(n, k);
    row.appendChild(el);
  }
}

async function loadContactList(range = activeCrmRange) {
  const list = $('#contact-list');
  list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
  const req = ++listReq;
  let q = sb.from('contacts')
    .select('id,email,full_name,phone,tier,source,notes,created_at,ghl_contact_id,contact_inquiries(count)', { count: 'exact' })
    .order('created_at', { ascending: false });
  const term = $('#crm-search').value.trim().replace(/[,()]/g, ' ').trim();
  if (term) q = q.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  const tier = $('#crm-tier').value;
  if (tier) q = q.eq('tier', tier);
  const source = $('#crm-source').value;
  if (source) q = q.eq('source', source);
  if (range?.from) q = q.gte('created_at', range.from);
  if (range?.to) q = q.lt('created_at', range.to);
  const { data, count, error } = await q.range(crmPage * CRM_PAGE_SIZE, ((crmPage + 1) * CRM_PAGE_SIZE) - 1);
  if (req !== listReq) return; // a newer search/filter superseded this request
  if (error) { toast('Could not load contacts.', 'error'); list.innerHTML = ''; show($('#crm-pagination'), false); return; }
  state.contacts = data || [];
  crmTotal = count || 0;
  populateSourceFilter(state.contacts);
  renderContactList();
  renderCrmPagination();
}

// Fill the source dropdown from sources seen so far; never remove the current pick.
function populateSourceFilter(rows) {
  const sel = $('#crm-source');
  const have = new Set($$('option', sel).map((o) => o.value));
  for (const r of rows) {
    if (r.source && !have.has(r.source)) {
      have.add(r.source);
      const o = document.createElement('option');
      o.value = r.source; o.textContent = r.source;
      sel.appendChild(o);
    }
  }
}

function renderContactList() {
  const list = $('#contact-list');
  list.innerHTML = '';
  if (!state.contacts.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No contacts match.';
    list.appendChild(empty);
    return;
  }
  for (const c of state.contacts) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'contact-row';
    row.dataset.id = c.id;

    const who = document.createElement('div'); who.className = 'who';
    const name = document.createElement('span'); name.className = 'name';
    name.textContent = c.full_name || c.email;
    const badge = document.createElement('span');
    badge.className = `badge tier-${c.tier}`;
    badge.textContent = tierLabel(c.tier);
    who.append(name, badge);

    const meta = document.createElement('div'); meta.className = 'meta';
    const inquiries = c.contact_inquiries?.[0]?.count ?? 0;
    meta.textContent = `${c.email} · ${c.source || 'site'} · joined ${eventDateLabel(c.created_at)} · ${inquiries} ${inquiries === 1 ? 'inquiry' : 'inquiries'}`;

    row.append(who, meta);
    row.addEventListener('click', () => openContactDrawer(c));
    list.appendChild(row);
  }
}

function renderCrmPagination() {
  const nav = $('#crm-pagination');
  nav.innerHTML = '';
  const pages = Math.ceil(crmTotal / CRM_PAGE_SIZE);
  if (pages <= 1) { show(nav, false); return; }
  show(nav, true);

  const previous = document.createElement('button');
  previous.className = 'btn btn-secondary';
  previous.type = 'button';
  previous.textContent = 'Previous';
  previous.setAttribute('aria-label', 'Previous lead page');
  previous.disabled = crmPage === 0;
  previous.addEventListener('click', () => { crmPage -= 1; loadContactList(); });

  const status = document.createElement('span');
  status.className = 'crm-pagination-status';
  const start = crmPage * CRM_PAGE_SIZE + 1;
  const end = Math.min((crmPage + 1) * CRM_PAGE_SIZE, crmTotal);
  status.textContent = `Showing ${start}-${end} of ${crmTotal}`;
  status.setAttribute('aria-live', 'polite');

  const next = document.createElement('button');
  next.className = 'btn btn-secondary';
  next.type = 'button';
  next.textContent = 'Next';
  next.setAttribute('aria-label', 'Next lead page');
  next.disabled = crmPage >= pages - 1;
  next.addEventListener('click', () => { crmPage += 1; loadContactList(); });

  nav.append(previous, status, next);
}

async function openContactDrawer(c) {
  const req = ++contactReq;
  const panel = $('#contact-panel');
  const ghlLoc = cfg.ghlLocationId;
  const ghlLink = c.ghl_contact_id && ghlLoc
    ? `<p><a href="https://app.gohighlevel.com/v2/location/${escapeAttr(ghlLoc)}/contacts/detail/${escapeAttr(c.ghl_contact_id)}" target="_blank" rel="noopener">View in GHL</a></p>`
    : (c.ghl_contact_id ? '<p class="meta">Synced to GHL</p>' : '');
  panel.innerHTML =
    `<h3>${escapeHtml(c.full_name || c.email)}</h3>` +
    `<p class="meta">${escapeHtml(c.email)}${c.phone ? ' · ' + escapeHtml(c.phone) : ''}</p>` +
    `<p><span class="badge tier-${escapeAttr(c.tier)}">${escapeHtml(tierLabel(c.tier))}</span></p>` +
    `<p class="meta">Source: ${escapeHtml(c.source || 'site')} · joined ${escapeHtml(eventDateLabel(c.created_at))}</p>` +
    (c.notes ? `<p>${escapeHtml(c.notes)}</p>` : '') +
    ghlLink +
    `<h3>Inquiries</h3><div id="inquiry-list"><div class="skeleton"></div></div>` +
    `<div class="drawer-actions"><button class="btn btn-secondary" type="button" data-close-contact>Close</button></div>`;
  const drawer = $('#contact-drawer');
  drawer.hidden = false;
  drawer.setAttribute('aria-hidden', 'false');

  const { data, error } = await sb.from('contact_inquiries')
    .select('source,notes,created_at')
    .eq('contact_id', c.id)
    .order('created_at', { ascending: false });
  if (req !== contactReq) return; // a newer contact was opened
  const box = $('#inquiry-list');
  if (error) { box.innerHTML = '<p class="meta">Could not load inquiries.</p>'; return; }
  box.innerHTML = '';
  if (!data.length) { box.innerHTML = '<p class="meta">No inquiries recorded.</p>'; return; }
  for (const i of data) {
    const item = document.createElement('div');
    item.className = 'inquiry-item';
    const meta = document.createElement('p'); meta.className = 'meta';
    meta.textContent = `${i.source} · ${eventDateLabel(i.created_at)}`;
    item.appendChild(meta);
    if (i.notes) { const p = document.createElement('p'); p.textContent = i.notes; item.appendChild(p); }
    box.appendChild(item);
  }
}

function closeContactDrawer() {
  const drawer = $('#contact-drawer');
  drawer.hidden = true;
  drawer.setAttribute('aria-hidden', 'true');
}

/* ============================ check-in ============================ */

let checkinWired = false;
let checkinStream = null;
let checkinScanner = null;

function wireCheckin() {
  if (checkinWired) return;
  checkinWired = true;
  $('#checkin-scan-btn').addEventListener('click', startScanning);
  $('#checkin-confirmation-ok').addEventListener('click', closeCheckinConfirmation);
  $('#checkin-manual').addEventListener('submit', async (e) => {
    e.preventDefault();
    const no = $('#checkin-ticket-no').value.trim();
    if (!no) return;
    await submitCheckin({ ticket_no: no });
    $('#checkin-ticket-no').value = '';
  });
  $('#checkin-event').addEventListener('change', loadRoster);
  // A queue built while standing on this view (network dead the whole time)
  // never drains on its own otherwise — only loadCheckin() called flushQueue.
  window.addEventListener('online', flushQueue);
  // Reflect a queue restored from a previous session immediately, rather
  // than waiting for the first flush attempt to render it.
  renderQueue();
}

async function loadCheckin() {
  const sel = $('#checkin-event');
  sel.innerHTML = '';
  // Today's event first — that is the one she is standing at.
  const sorted = [...state.events].sort((a, b) =>
    Math.abs(new Date(a.starts_at) - Date.now()) - Math.abs(new Date(b.starts_at) - Date.now()));
  for (const ev of sorted) {
    const o = document.createElement('option');
    o.value = ev.id;
    o.textContent = `${ev.name} — ${eventDateLabel(ev.starts_at)}`;
    sel.appendChild(o);
  }
  await loadRoster();
  flushQueue();
}

async function loadRoster() {
  const eventId = $('#checkin-event').value;
  if (!eventId) return;
  const { data } = await sb.from('event_attendance')
    .select('ticket_id,attended_at,contacts(full_name,email)').eq('event_id', eventId);
  const rows = data || [];
  const ev = state.events.find((e) => e.id === eventId);
  $('#checkin-count').textContent = `${rows.length} of ${ev?.capacity ?? '?'} checked in`;
  const box = $('#checkin-roster');
  box.innerHTML = '';
  for (const r of rows) {
    const p = document.createElement('p');
    p.className = 'meta';
    p.textContent = `${r.contacts?.full_name || r.contacts?.email || 'Guest'} · ${eventDateLabel(r.attended_at)}`;
    box.appendChild(p);
  }
}

function showCheckinResult(kind, text) {
  const box = $('#checkin-result');
  box.className = `checkin-result ${kind}`;
  box.textContent = text;
}

function showCheckinConfirmation(out, body) {
  const state = checkinOverlayState(out);
  const overlay = $('#checkin-confirmation');
  if (!state || !overlay || !checkinScanner) return false;

  const detail = $('#checkin-confirmation-detail');
  const title = $('#checkin-confirmation-title');
  const kicker = $('#checkin-confirmation-kicker');
  title.textContent = state.title;
  kicker.textContent = out.ok ? 'Ticket scan' : 'Scan result';
  if (out.ok) {
    detail.textContent = `${out.attendee_name || 'Guest'} · ${out.tier_sold === 'member' ? 'Member' : 'Non-member'}`;
  } else if (out.code === 'already_checked_in') {
    detail.textContent = `Checked in at ${eventDateLabel(out.attended_at)}.`;
  } else if (out.code === 'queued') {
    detail.textContent = `${ticketLabel(body)} is saved and will sync when the connection returns.`;
  } else {
    detail.textContent = refusalMessage(body, out.code);
  }
  overlay.className = `checkin-confirmation ${state.kind}`;
  overlay.hidden = false;
  checkinScanner.paused = true;
  $('#checkin-confirmation-ok').focus();
  return true;
}

function closeCheckinConfirmation() {
  const overlay = $('#checkin-confirmation');
  if (!overlay) return;
  overlay.hidden = true;
  checkinScanner?.resume();
}

// A refused check-in is a real server answer, not an ambiguous failure — the
// operator must know which ticket it was about, so every message here is
// built with the ticket label in front of it.
const REFUSAL_REASONS = {
  wrong_event: 'is for a different event.',
  ticket_refunded: 'was refunded.',
  ticket_expired: 'has expired.',
  unknown_ticket: 'is not recognised.',
  already_checked_in: 'was already checked in.',
  needs_attendee: 'needs a name — check in manually.',
};

function ticketLabel(body) {
  return body?.ticket_no || body?.qr_token || 'That ticket';
}

function refusalMessage(body, code) {
  return `${ticketLabel(body)} ${REFUSAL_REASONS[code] || 'could not be checked in.'}`;
}

function queueCheckin(body) {
  state.checkinQueue.push(body);
  renderQueue();
}

// The scanner posts { qr_token } from a camera scan, or { ticket_no } typed by
// hand. Both go through the same server validation.
async function submitCheckin(payload, attendee) {
  const eventId = $('#checkin-event').value;
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) { showCheckinResult('err', 'Session expired — sign in again.'); return; }

  const body = { ...payload, event_id: eventId, ...(attendee || {}) };

  let res;
  try {
    res = await fetch('/api/tickets/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
  } catch {
    // Transport failure — a dead spot must not stop the line: hold it and
    // retry when signal returns.
    queueCheckin(body);
    showCheckinResult('warn', 'No signal — saved, will sync automatically.');
    showCheckinConfirmation({ ok: false, code: 'queued' }, body);
    return;
  }

  if (res.status >= 500) {
    // A server error is not a real answer either — treat it the same as no
    // signal at all, rather than dropping the check-in.
    queueCheckin(body);
    showCheckinResult('warn', 'No signal — saved, will sync automatically.');
    showCheckinConfirmation({ ok: false, code: 'queued' }, body);
    return;
  }

  const out = await res.json().catch(() => null);
  if (!out) {
    showCheckinResult('err', `${ticketLabel(body)} could not be checked in.`);
    showCheckinConfirmation({ ok: false, code: 'invalid_response' }, body);
    return;
  }

  if (out.ok) {
    showCheckinResult('ok', `${out.attendee_name} · ${out.tier_sold === 'member' ? 'Member' : 'Non-member'} · checked in`);
    await loadRoster();
    await flushQueue();
    showCheckinConfirmation(out, body);
    return;
  }
  if (out.code === 'already_checked_in') {
    showCheckinResult('warn', `Already checked in at ${eventDateLabel(out.attended_at)}`);
    showCheckinConfirmation(out, body);
    return;
  }
  if (out.code === 'needs_attendee') {
    if (checkinScanner) checkinScanner.paused = true;
    promptForAttendee(payload);
    return;
  }
  showCheckinResult('err', refusalMessage(body, out.code));
  showCheckinConfirmation(out, body);
}

function promptForAttendee(payload) {
  const box = $('#checkin-result');
  box.className = 'checkin-result info';
  box.innerHTML = '';
  const form = document.createElement('form');
  form.innerHTML =
    '<p>This ticket has no name yet. Who is arriving?</p>' +
    '<label>Name<input name="full_name" type="text" required></label>' +
    '<label>Email<input name="email" type="email" required></label>' +
    '<button class="btn btn-primary" type="submit">Check in</button>';
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitCheckin(payload, { full_name: form.full_name.value, email: form.email.value });
  });
  box.appendChild(form);
}

function renderQueue() {
  persistCheckinQueue();
  const el = $('#checkin-queue');
  const n = state.checkinQueue.length;
  el.hidden = n === 0;
  el.textContent = n ? `${n} waiting to sync` : '';
}

async function flushQueue() {
  if (!state.checkinQueue.length) return;

  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) {
    // No session — do not POST "Bearer undefined". Leave the queue intact
    // and try again on the next flush.
    showCheckinResult('warn', 'Session expired — sign in again to sync queued check-ins.');
    return;
  }

  const pending = state.checkinQueue.splice(0, state.checkinQueue.length);
  const refusedMessages = [];
  for (const body of pending) {
    let res;
    try {
      res = await fetch('/api/tickets/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(body),
      });
    } catch {
      // Still offline (transport failure) — keep it for the next flush.
      state.checkinQueue.push(body);
      continue;
    }

    if (res.status >= 500) {
      // A server error is not a real answer — keep it for the next flush,
      // same as a transport failure. Do not drop it.
      state.checkinQueue.push(body);
      continue;
    }

    const out = await res.json().catch(() => null);
    // Only an unambiguous success clears the item. Anything that reached the
    // server and was refused (hard refusal, already_checked_in, needs_attendee)
    // is a real answer — it must not be dropped silently, and must not be
    // re-queued forever either. It is pulled out and surfaced to the operator,
    // named, so an unattributable "could not be checked in" never happens.
    if (out && out.ok === true) continue;
    refusedMessages.push(refusalMessage(body, out?.code));
  }
  renderQueue();
  if (refusedMessages.length) {
    showCheckinResult('warn', `${refusedMessages.length} queued check-in${refusedMessages.length === 1 ? '' : 's'} could not sync — ${refusedMessages.join('; ')}`);
  }
  await loadRoster();
}

function stopScanning() {
  checkinScanner = null;
  const confirmation = $('#checkin-confirmation');
  if (confirmation) confirmation.hidden = true;
  if (checkinStream) {
    checkinStream.getTracks().forEach((t) => t.stop());
    checkinStream = null;
  }
  const video = $('#checkin-video');
  if (video) {
    video.srcObject = null;
    video.hidden = true; // the detect loop checks this and exits on its own
  }
}

// Which decoder is live, so a failure is diagnosable without a console.
let checkinDecoder = '';

// BarcodeDetector is absent on iOS Safari, and on some Android builds the
// constructor exists while qr_code is NOT actually supported - detect() then
// silently never fires. Ask what it supports, not whether it exists.
async function nativeSupportsQr() {
  try {
    if (window.BarcodeDetector && window.BarcodeDetector.getSupportedFormats) {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      return formats.includes('qr_code');
    }
  } catch { /* treat as unsupported */ }
  return false;
}

// The door phone has no console, so the state that explains a failure has to be
// legible on screen.
function decoderDiagnostics(native) {
  return 'QR decoder: ' + (resolveJsqr(window) ? 'loaded' : 'MISSING')
    + ' \u00b7 built-in: ' + (native ? 'yes' : 'no');
}

async function startScanning() {
  stopScanning(); // a second tap restarts cleanly instead of leaking a stream
  const video = $('#checkin-video');

  // Camera FIRST. Choosing a decoder before opening the camera makes a decoder
  // problem present as a dead camera, sending debugging in the wrong direction.
  try {
    checkinStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (err) {
    const name = (err && err.name) || 'unknown';
    showCheckinResult('err', name === 'NotAllowedError'
      ? 'Camera permission denied. Tap the lock icon in the address bar, allow Camera, then reload. Or use the ticket number below.'
      : 'Camera unavailable (' + name + '). Use the ticket number below.');
    return;
  }
  video.srcObject = checkinStream;
  video.hidden = false;
  // play() rejects on some Android builds even when the stream is perfectly good.
  // Letting it throw here aborts the rest of this function, leaving a visible
  // black <video> and no message - the exact "camera opened and did nothing"
  // symptom. Report it and carry on; the decode loop tolerates empty frames.
  try {
    await video.play();
  } catch (err) {
    showCheckinResult('warn', 'Video playback was blocked ('
      + ((err && err.name) || 'unknown') + '). Still trying to read the camera...');
  }

  const native = await nativeSupportsQr();
  const jsqr = resolveJsqr(window);
  checkinDecoder = native ? 'native' : (jsqr ? 'jsqr' : '');

  if (!checkinDecoder) {
    // The camera demonstrably worked - say so, so this is not mistaken for one.
    stopScanning();
    showCheckinResult('warn', 'Camera works, but no QR decoder is available. Use the ticket number below. '
      + decoderDiagnostics(native));
    $('#checkin-ticket-no').focus();
    return;
  }

  showCheckinResult('info', 'Scanning \u2014 point the camera at the ticket QR. '
    + decoderDiagnostics(native));

  let detector = checkinDecoder === 'native' ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let last = '';
  let errorsShown = false;
  let frames = 0;
  let fallbackShown = false;
  const decoderStartedAt = Date.now();
  const scannerSession = { paused: false, resume: null };
  checkinScanner = scannerSession;

  // Black-screen watchdog: a stream can be granted and still never produce a
  // frame (camera held by another app). Without this it just looks broken.
  let watchdog = setTimeout(() => {
    if (!video.hidden && !video.videoWidth) {
      showCheckinResult('err', 'The camera turned on but is not sending any picture. '
        + 'Close other apps using the camera and reload, or use the ticket number below.');
    }
  }, 4000);
  const clearWatchdog = () => { if (watchdog) { clearTimeout(watchdog); watchdog = null; } };

  const readFrame = async () => {
    if (detector) {
      if (video.videoWidth) clearWatchdog();
      const codes = await detector.detect(video);
      if (codes.length === 0 && video.videoWidth
        && shouldFallbackToJsqr(checkinDecoder, Boolean(jsqr), Date.now() - decoderStartedAt)) {
        checkinDecoder = 'jsqr';
        detector = null;
        if (!fallbackShown) {
          fallbackShown = true;
          showCheckinResult('info', 'Built-in QR scanning did not find a code. Switching to the backup scanner...');
        }
      }
      return codes.length ? codes[0].rawValue : '';
    }
    // jsQR needs pixels, so draw the current frame and hand over the buffer.
    if (!video.videoWidth) return '';
    clearWatchdog();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const found = jsqr(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
    return found ? found.data : '';
  };

  const tick = async () => {
    if (video.hidden || scannerSession.paused || checkinScanner !== scannerSession) { clearWatchdog(); return; }
    try {
      const raw = await readFrame();
      frames += 1;
      if (raw) {
        const t = tokenFromScan(raw);
        if (t && t !== last) {
          // Ignore the same code repeating across frames while it sits in view.
          last = t;
          await submitCheckin({ qr_token: t });
        } else if (!t) {
          showCheckinResult('warn', 'Scanned a code, but it is not a PWRHAUS ticket.');
          last = '';
        }
      } else {
        // A blank frame means the operator has moved away from the previous
        // ticket; only then should that token be eligible again.
        last = '';
        if (frames === 150) {
          // ~5 seconds of clean frames with no read: say so rather than sit mute.
          showCheckinResult('info', 'Scanning \u2014 no QR detected yet. Fill the frame with the code, '
            + 'or use the ticket number below. ' + decoderDiagnostics(native));
        }
      }
    } catch (err) {
      // Never swallow this - a decoder throwing every frame is exactly the
      // symptom that looks like "the camera works but nothing happens".
      if (!errorsShown) {
        errorsShown = true;
        showCheckinResult('err', 'Scanner error: ' + ((err && err.message) || String(err))
          + ' \u2014 use the ticket number below.');
      }
    }
    requestAnimationFrame(tick);
  };
  scannerSession.resume = () => {
    if (checkinScanner !== scannerSession) return;
    scannerSession.paused = false;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ============================ publish indicator ============================ */

async function triggerPublish() {
  try {
    const { data } = await sb.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;
    showPublishing(true);
    const res = await fetch('/api/publish', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
    if (res.status === 404) return;               // local `eleventy --serve`: functions not mounted
    if (!res.ok) throw new Error('publish failed');
    toast('Publishing… live in ~30s', 'info');
  } catch {
    toast('Saved, but the rebuild did not trigger.', 'error');
  } finally {
    showPublishing(false);
  }
}

let publishingEl = null;
function showPublishing(on) {
  if (on) {
    if (publishingEl) return;
    publishingEl = document.createElement('div');
    publishingEl.className = 'publishing';
    publishingEl.setAttribute('role', 'status');
    publishingEl.textContent = 'Publishing… live in ~30s';
    document.body.appendChild(publishingEl);
  } else if (publishingEl) {
    setTimeout(() => { publishingEl?.remove(); publishingEl = null; }, 1200);
  }
}

/* ============================ toasts / PWA ============================ */

function toast(msg, kind = 'info') {
  const host = $('#toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' }).catch(() => {});
  }
}

function wireInstallPrompt() {
  const btn = $('#install-btn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstall = e;
    show(btn, true);
  });
  btn?.addEventListener('click', async () => {
    if (!state.deferredInstall) return;
    state.deferredInstall.prompt();
    await state.deferredInstall.userChoice;
    state.deferredInstall = null;
    show(btn, false);
  });
}
