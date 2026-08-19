import { test } from 'node:test';
import assert from 'node:assert/strict';

async function loadSiteData(cacheKey) {
  return (await import(`../src/_data/site.js?${cacheKey}`)).default;
}

test('site portalUrl defaults to an empty string', async () => {
  const previous = process.env.GHL_PORTAL_URL;
  delete process.env.GHL_PORTAL_URL;

  try {
    const site = await loadSiteData('portal-default');
    assert.equal(site.portalUrl, '');
  } finally {
    if (previous === undefined) delete process.env.GHL_PORTAL_URL;
    else process.env.GHL_PORTAL_URL = previous;
  }
});

test('site portalUrl reads the configured GHL portal URL', async () => {
  const previous = process.env.GHL_PORTAL_URL;
  process.env.GHL_PORTAL_URL = 'https://portal.example.com/pwrhaus';

  try {
    const site = await loadSiteData('portal-configured');
    assert.equal(site.portalUrl, 'https://portal.example.com/pwrhaus');
  } finally {
    if (previous === undefined) delete process.env.GHL_PORTAL_URL;
    else process.env.GHL_PORTAL_URL = previous;
  }
});
