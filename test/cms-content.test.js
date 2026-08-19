import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const eventsData = JSON.parse(readFileSync('src/_data/events.json', 'utf8'));
const events = eventsData.events;
const siteContent = JSON.parse(readFileSync('src/_data/siteContent.json', 'utf8'));

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

test('siteContent.json exposes the events page hero singleton', () => {
  assert.ok(siteContent.eventsHero, 'siteContent.json must define eventsHero');
  assert.equal(typeof siteContent.eventsHero.eyebrow, 'string');
  assert.equal(typeof siteContent.eventsHero.heading, 'string');
  assert.equal(typeof siteContent.eventsHero.lead, 'string');
  assert.ok(siteContent.eventsHero.heading.trim().length > 0, 'events hero heading is required');
  assert.ok(siteContent.eventsHero.lead.trim().length > 0, 'events hero lead is required');
});

test('publishedEvents contains only published event records', async () => {
  const { default: publishedEvents } = await import('../src/_data/publishedEvents.js');
  assert.ok(publishedEvents.length > 0, 'expected at least one published event');
  assert.equal(
    publishedEvents.some((event) => event.slug === 'draft-member-preview'),
    false,
    'unpublished events must not be exposed as publishedEvents',
  );
  assert.equal(
    publishedEvents.every((event) => event.published === true),
    true,
    'publishedEvents may only include published records',
  );
});
