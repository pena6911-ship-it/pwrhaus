import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const eventsData = JSON.parse(readFileSync('src/_data/events.json', 'utf8'));
const events = eventsData.events;
const content = JSON.parse(readFileSync('src/_data/content.json', 'utf8'));

const requiredEventFields = [
  'slug',
  'name',
  'city',
  'venue',
  'starts_at',
  'price_cents',
  'capacity',
  'summary',
  'body',
  'image',
  'image_alt',
  'published',
  'registration_url',
];

test('events.json exposes a CMS-editable events array', () => {
  assert.ok(eventsData && typeof eventsData === 'object', 'events.json must be an object');
  assert.ok(Array.isArray(events), 'events.json must expose an events array');
  assert.ok(events.length >= 2, 'seed at least one upcoming and one past event');

  const slugs = new Set();
  for (const event of events) {
    for (const field of requiredEventFields) {
      assert.ok(Object.hasOwn(event, field), `${event.name ?? 'event'} missing ${field}`);
    }
    assert.match(event.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${event.slug} must be URL-safe`);
    assert.equal(slugs.has(event.slug), false, `duplicate event slug ${event.slug}`);
    slugs.add(event.slug);
    assert.equal(typeof event.published, 'boolean', `${event.slug}.published must be boolean`);
    assert.equal(Number.isInteger(event.price_cents), true, `${event.slug}.price_cents must be integer cents`);
    assert.equal(Number.isInteger(event.capacity), true, `${event.slug}.capacity must be an integer`);
    assert.ok(Date.parse(event.starts_at), `${event.slug}.starts_at must be parseable`);
    assert.ok(event.image.startsWith('/img/'), `${event.slug}.image must be a site image path`);
    assert.ok(event.image_alt.trim().length > 0, `${event.slug}.image_alt is required`);
  }
});

test('content.json exposes the events page hero singleton', () => {
  assert.ok(content.eventsHero, 'content.json must define eventsHero');
  assert.equal(typeof content.eventsHero.eyebrow, 'string');
  assert.equal(typeof content.eventsHero.heading, 'string');
  assert.equal(typeof content.eventsHero.lead, 'string');
  assert.ok(content.eventsHero.heading.trim().length > 0, 'events hero heading is required');
  assert.ok(content.eventsHero.lead.trim().length > 0, 'events hero lead is required');
});
