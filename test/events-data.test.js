import { test } from 'node:test';
import assert from 'node:assert/strict';

async function load(mod, key) {
  const m = await import(`../src/_data/${mod}.js?${key}`);
  const val = m.default;
  return typeof val === 'function' ? await val() : val;
}

test('events.js falls back to the published seed rows when Supabase env is absent', async () => {
  const prevUrl = process.env.SUPABASE_URL, prevKey = process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY;
  try {
    const events = await load('events', 'seed');
    assert.ok(Array.isArray(events) && events.length >= 2, 'expected seeded published events');
    assert.equal(events.every((e) => e.published === true), true, 'only published rows are exposed');
    assert.equal(events.some((e) => e.slug === 'draft-member-preview'), false, 'drafts must not leak to the build');
    const idx = (s) => events.findIndex((e) => e.slug === s);
    assert.ok(idx('fall-founder-scramble') > -1 && idx('spring-networking-nine') > -1);
  } finally {
    if (prevUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = prevKey;
  }
});

test('siteContent.js falls back to the seed hero when Supabase env is absent', async () => {
  const prevUrl = process.env.SUPABASE_URL, prevKey = process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY;
  try {
    const content = await load('siteContent', 'seed');
    assert.ok(content.eventsHero, 'must expose eventsHero');
    assert.equal(typeof content.eventsHero.heading, 'string');
    assert.ok(content.eventsHero.heading.trim().length > 0);
  } finally {
    if (prevUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = prevKey;
  }
});
