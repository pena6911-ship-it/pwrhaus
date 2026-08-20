import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SLUGS = ['home', 'events', 'membership', 'lessons', 'corporate', 'sponsors', 'about'];

async function load(key) {
  const prev = { u: process.env.SUPABASE_URL, k: process.env.SUPABASE_ANON_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY;
  try { return await (await import(`../src/_data/siteContent.js?${key}`)).default(); }
  finally {
    if (prev.u === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prev.u;
    if (prev.k === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = prev.k;
  }
}

test('siteContent seed fixture has a hero for every page', () => {
  const seed = JSON.parse(readFileSync('data/siteContent.seed.json', 'utf8'));
  for (const slug of SLUGS) {
    const hero = seed.pages?.[slug]?.hero;
    assert.ok(hero, `missing pages.${slug}.hero`);
    assert.ok(hero.eyebrow?.trim(), `${slug} eyebrow`);
    assert.ok(hero.heading?.trim(), `${slug} heading`);
    assert.ok(hero.lead?.trim(), `${slug} lead`);
  }
  assert.ok(seed.pages.home.hero.video, 'home is a video hero');
  assert.ok(seed.pages.membership.hero.image, 'membership is an image hero');
  assert.ok(seed.pages.membership.hero.position, 'image heroes carry a focal position');
});

test('siteContent.js returns pages.<slug>.hero for every page (seed fallback)', async () => {
  const content = await load('pages');
  for (const slug of SLUGS) {
    assert.ok(content.pages[slug].hero.heading.trim(), `${slug} heading rendered from data`);
  }
  assert.equal(content.pages.events.hero.heading, 'Rooms where the right people already have something in common.');
});
