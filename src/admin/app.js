// PWRHaus Dashboard SPA — auth, events CRUD, page settings, publish, polish.
// Pure logic lives in /admin/lib.js (unit-tested). This module is DOM glue.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { slugify, usd, eventDateLabel, validateEvent, sortByOrder, nextSortOrder, computeStats } from '/admin/lib.js';

const cfg = window.__PWRHAUS || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const show = (el, on) => { if (el) el.hidden = !on; };

const state = { events: [], slugTouched: false, editingId: null, pendingFile: null, deferredInstall: null };

let sb = null;

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
    '<div class="ph-monogram" aria-hidden="true">PH</div>' +
    '<h1>Dashboard not configured</h1>' +
    '<p class="login-sub">This preview has no Supabase connection. Set SUPABASE_URL and SUPABASE_ANON_KEY to enable the dashboard.</p>';
}

async function requireSession() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    show($('#login-view'), false);
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
}

/* ============================ app shell ============================ */

async function boot() {
  wireNav();
  wireList();
  wireDrawer();
  wireSettings();
  renderSkeleton();
  await loadEvents();
  renderStats();
  renderList();
  loadSettings();
}

function wireNav() {
  const go = (view) => {
    show($('#view-events'), view === 'events');
    show($('#view-settings'), view === 'settings');
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
  renderStats();
  renderList();
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
    { k: 'Registrations', n: '—', title: 'Available when ticketing lands' },
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
  meta2.textContent = `${ev.venue || ''} · ${usd(ev.price_cents)} · ${ev.capacity ?? 0} spots`;
  const badge = document.createElement('span');
  badge.className = 'badge ' + (ev.published ? 'published' : 'draft');
  badge.textContent = ev.published ? 'Published' : 'Draft';
  body.append(title, meta, meta2, badge);

  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(
    actionBtn('Edit', 'edit', ev.id, 'btn-secondary'),
    actionBtn(ev.published ? 'Unpublish' : 'Publish', 'publish', ev.id, 'btn-secondary'),
    actionBtn('Duplicate', 'duplicate', ev.id, 'btn-secondary'),
    actionBtn('Delete', 'delete', ev.id, 'btn-link btn-danger'),
  );

  card.append(img, body, actions);
  return card;
}

function actionBtn(label, action, id, cls) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn ' + cls;
  b.dataset.action = action;
  b.dataset.id = id;
  b.textContent = label;
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

/* ============================ page settings ============================ */

function settingsFields() {
  return `
    <label>Eyebrow<input id="s-eyebrow" type="text"></label>
    <label>Heading<textarea id="s-heading"></textarea></label>
    <label>Lead<textarea id="s-lead"></textarea></label>
    <label>Hero video path<input id="s-video" type="text" placeholder="/img/....mp4"></label>
    <label>Hero poster path<input id="s-poster" type="text" placeholder="/img/....jpg"></label>
    <p class="form-error" id="settings-error" role="alert" hidden></p>
    <div class="drawer-actions"><button class="btn btn-primary" type="submit">Save page</button></div>`;
}

let settingsWired = false;
function wireSettings() {
  const form = $('#settings-form');
  form.innerHTML = settingsFields();
  if (!settingsWired) {
    settingsWired = true;
    form.addEventListener('submit', onSettingsSubmit);
  }
}

async function loadSettings() {
  const { data } = await sb.from('site_content').select('value').eq('key', 'events_page').maybeSingle();
  const hero = data?.value?.eventsHero || {};
  $('#s-eyebrow').value = hero.eyebrow || '';
  $('#s-heading').value = hero.heading || '';
  $('#s-lead').value = hero.lead || '';
  $('#s-video').value = hero.video || '';
  $('#s-poster').value = hero.poster || '';
}

async function onSettingsSubmit(e) {
  e.preventDefault();
  const err = $('#settings-error');
  show(err, false);
  const value = { eventsHero: {
    eyebrow: $('#s-eyebrow').value.trim(),
    heading: $('#s-heading').value.trim(),
    lead: $('#s-lead').value.trim(),
    video: $('#s-video').value.trim(),
    poster: $('#s-poster').value.trim(),
  } };
  if (!value.eventsHero.heading || !value.eventsHero.lead) {
    err.textContent = 'Heading and lead are required.'; show(err, true); return;
  }
  const { error } = await sb.from('site_content').upsert({ key: 'events_page', value, updated_at: new Date().toISOString() });
  if (error) { err.textContent = error.message; show(err, true); return; }
  toast('Events page saved.', 'info');
  triggerPublish();
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
