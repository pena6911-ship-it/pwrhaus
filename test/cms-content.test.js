import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const eventsData = JSON.parse(readFileSync('data/events.seed.json', 'utf8'));
const events = eventsData.events;
const siteContent = JSON.parse(readFileSync('data/siteContent.seed.json', 'utf8'));

const requiredEventFields = ['slug', 'name', 'city', 'venue', 'starts_at', 'price_cents', 'capacity', 'summary', 'body', 'image', 'image_alt', 'published', 'registration_url'];

test('seed events fixture is CMS-shaped and URL-safe', () => {
  assert.ok(Array.isArray(events) && events.length >= 2, 'seed at least one upcoming and one past event');
  const slugs = new Set();
  for (const event of events) {
    for (const field of requiredEventFields) assert.ok(Object.hasOwn(event, field), `${event.name ?? 'event'} missing ${field}`);
    assert.match(event.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${event.slug} must be URL-safe`);
    assert.equal(slugs.has(event.slug), false, `duplicate slug ${event.slug}`); slugs.add(event.slug);
    assert.equal(typeof event.published, 'boolean');
    assert.equal(Number.isInteger(event.price_cents), true);
    assert.equal(Number.isInteger(event.capacity), true);
    assert.ok(Date.parse(event.starts_at));
    assert.ok(event.image.startsWith('/img/'));
    assert.ok(event.image_alt.trim().length > 0);
  }
});

test('seed siteContent fixture exposes a hero per page', () => {
  assert.ok(siteContent.pages, 'seed must expose pages');
  assert.ok(siteContent.pages.events.hero.heading.trim(), 'events hero heading is required');
  assert.ok(siteContent.pages.home.hero.lead.trim(), 'home hero lead is required');
});

test('events.js exposes only published records (seed fallback)', async () => {
  const prev = { u: process.env.SUPABASE_URL, k: process.env.SUPABASE_ANON_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY;
  try {
    const list = await (await import('../src/_data/events.js?cms')).default();
    assert.ok(list.length > 0);
    assert.equal(list.some((e) => e.slug === 'draft-member-preview'), false);
    assert.equal(list.every((e) => e.published === true), true);
  } finally {
    if (prev.u === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prev.u;
    if (prev.k === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = prev.k;
  }
});
