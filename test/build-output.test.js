import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let outDir;

before(() => {
  outDir = buildWithEnv({ GHL_PORTAL_URL: '' });
});

function buildWithEnv(extraEnv) {
  const dir = mkdtempSync(join(tmpdir(), 'pwrhaus-build-env-'));
  try {
    execFileSync('npx', ['@11ty/eleventy', '--output=' + dir], {
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, ...extraEnv },
    });
    return dir;
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

function htmlFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...htmlFiles(full));
    else if (entry.endsWith('.html')) found.push(full);
  }
  return found;
}

function publicHtmlFiles(dir) {
  return htmlFiles(dir).filter((page) => !page.replace(/\\/g, '/').includes('/admin/'));
}

test('every built page carries the Framework & Co. credit', () => {
  const pages = publicHtmlFiles(outDir);
  assert.ok(pages.length > 0, 'build produced no HTML');
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    assert.match(html, /Developed by Framework &amp; Co\./, `missing credit: ${page}`);
    assert.match(html, /https:\/\/www\.frameworkandco\.com/, `missing credit href: ${page}`);
  }
});

test('every built page has exactly one h1', () => {
  const pages = publicHtmlFiles(outDir);
  assert.ok(pages.length > 0, 'build produced no HTML');
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const count = (html.match(/<h1[\s>]/g) || []).length;
    assert.equal(count, 1, `expected exactly one h1 in ${page}, found ${count}`);
  }
});

test('every built page declares a viewport and a lang attribute', () => {
  const pages = publicHtmlFiles(outDir);
  assert.ok(pages.length > 0, 'build produced no HTML');
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    assert.match(html, /<html lang="en">/, `missing lang: ${page}`);
    assert.match(html, /name="viewport"/, `missing viewport: ${page}`);
  }
});

// These rules are about what the stylesheet SHIPS, not what it mentions. Comments
// legitimately name the banned properties to explain why they are banned, so strip
// them first — otherwise documenting a rule is enough to violate it.
function declarationsOnly(cssPath) {
  return readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

test('the stylesheet contains no box-shadow and no max-width media queries', () => {
  const css = declarationsOnly('src/css/main.css');
  assert.equal(/box-shadow/.test(css), false, 'box-shadow is banned by the design system');
  assert.equal(/@media[^{]*max-width/.test(css), false, 'CSS must be mobile-first: min-width only');
});

test('the stylesheet never uses the decorative brass token for text colour', () => {
  const css = declarationsOnly('src/css/main.css');
  assert.equal(
    /(?<!-)color:\s*var\(--brass\)/.test(css),
    false,
    '--brass fails AA on paper; use --brass-text for text',
  );
});

test('every rendered form posts a source the backend whitelists', async () => {
  const { ALLOWED_SOURCES } = await import('../functions/lib/sanitize.js');
  const pages = publicHtmlFiles(outDir);
  assert.ok(pages.length > 0, 'build produced no HTML');

  let found = 0;
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const matches = html.matchAll(/name="source"\s+value="([^"]+)"/g);
    for (const m of matches) {
      found++;
      assert.ok(
        ALLOWED_SOURCES.has(m[1]),
        `${page} posts source="${m[1]}", which the backend would silently downgrade to 'site'`,
      );
    }
  }
  assert.ok(found > 0, 'no capture form found in the built output');
});

test('every built page declares canonical and Open Graph metadata', () => {
  const pages = publicHtmlFiles(outDir);
  assert.ok(pages.length > 0, 'build produced no HTML');
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    assert.match(html, /<link rel="canonical" href="http/, `missing canonical: ${page}`);
    assert.match(html, /<meta property="og:title"/, `missing og:title: ${page}`);
    assert.match(html, /<meta property="og:description"/, `missing og:description: ${page}`);
  }
});

test('no shipped image has an empty alt attribute', () => {
  const pages = publicHtmlFiles(outDir);
  assert.ok(pages.length > 0, 'build produced no HTML');
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    for (const m of html.matchAll(/<img\b[^>]*>/g)) {
      assert.ok(
        /\salt="[^"]+"/.test(m[0]),
        `${page} ships an image with a missing or empty alt: ${m[0]}`,
      );
    }
  }
});

test('every navigation link resolves to a page that was actually built', () => {
  const nav = JSON.parse(readFileSync('src/_data/nav.json', 'utf8'));
  assert.ok(nav.length > 0, 'nav.json is empty');
  const built = htmlFiles(outDir).map((p) => p.replace(/\\/g, '/'));

  for (const item of nav) {
    const slug = item.url.replace(/^\/|\/$/g, '');
    assert.ok(
      built.some((p) => p.endsWith(`/${slug}/index.html`)),
      `nav links to ${item.url} but no page was built for it`,
    );
  }
});

test('the home page hosts the form the nav CTAs anchor to', () => {
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  // Both header CTAs link to /#join-web_free_profile. The id is derived from
  // the form's source, so changing that source silently breaks them sitewide.
  assert.match(
    html,
    /id="join-web_free_profile"/,
    'home page must host the form the header CTAs link to',
  );
});

test('member login links are hidden until a GHL portal URL is configured', () => {
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /Member Login/, 'portal links should not render without GHL_PORTAL_URL');
});

test('member login links render when a GHL portal URL is configured', () => {
  const dir = buildWithEnv({ GHL_PORTAL_URL: 'https://portal.example.com/pwrhaus' });
  try {
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const desktopNav = html.match(/<nav class="nav-desktop"[\s\S]*?<\/nav>/)?.[0];
    const mobileNav = html.match(/<div class="nav-overlay"[\s\S]*?<\/nav>/)?.[0];
    const footerNav = html.match(/<nav class="footer-nav"[\s\S]*?<\/nav>/)?.[0];

    assert.ok(desktopNav, 'desktop navigation should render');
    assert.match(desktopNav, /<a href="https:\/\/portal\.example\.com\/pwrhaus">Member Login<\/a>/);
    assert.ok(mobileNav, 'mobile navigation should render');
    assert.match(mobileNav, /<a href="https:\/\/portal\.example\.com\/pwrhaus">Member Login<\/a>/);
    assert.ok(footerNav, 'footer navigation should render');
    assert.match(footerNav, /<a href="https:\/\/portal\.example\.com\/pwrhaus">Member Login<\/a>/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('membership page hides portal CTA until a GHL portal URL is configured', () => {
  const html = readFileSync(join(outDir, 'membership', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /Enter Member Portal/, 'membership page should not show portal CTA without GHL_PORTAL_URL');
});

test('membership page renders portal CTA when a GHL portal URL is configured', () => {
  const dir = buildWithEnv({ GHL_PORTAL_URL: 'https://portal.example.com/pwrhaus' });
  try {
    const html = readFileSync(join(dir, 'membership', 'index.html'), 'utf8');
    assert.match(html, /Enter Member Portal/);
    assert.match(html, /href="https:\/\/portal\.example\.com\/pwrhaus"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('thanks page mentions the portal invite email', () => {
  const html = readFileSync(join(outDir, 'thanks', 'index.html'), 'utf8');
  assert.match(html, /check your email/i);
  assert.match(html, /portal invite/i);
});

test('events page renders published CMS events and hides drafts', () => {
  const html = readFileSync(join(outDir, 'events', 'index.html'), 'utf8');
  assert.match(html, /Fall Founder Scramble/, 'published upcoming event should render');
  assert.match(html, /Spring Networking Nine/, 'published past event should render');
  assert.doesNotMatch(html, /Draft Member Preview/, 'unpublished event should not render');
  assert.match(html, /Upcoming/, 'events page should label upcoming events');
  assert.match(html, /Past/, 'events page should label past events');
});

test('published CMS events generate detail pages and drafts do not', () => {
  const fall = readFileSync(join(outDir, 'events', 'fall-founder-scramble', 'index.html'), 'utf8');
  assert.match(fall, /Fall Founder Scramble/);
  assert.match(fall, /A business-first scramble/);

  assert.throws(
    () => readFileSync(join(outDir, 'events', 'draft-member-preview', 'index.html'), 'utf8'),
    /ENOENT/,
    'unpublished events must not generate public detail pages',
  );
});

test('admin route ships the Sveltia CMS boot page and config', () => {
  const html = readFileSync(join(outDir, 'admin', 'index.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex">/, 'admin must not be indexed');
  assert.match(html, /@sveltia\/cms/, 'admin page should load Sveltia CMS');

  const config = readFileSync(join(outDir, 'admin', 'config.yml'), 'utf8');
  assert.match(config, /repo: pena6911-ship-it\/pwrhaus/);
  assert.match(config, /name: events/);
  assert.match(config, /file: src\/_data\/siteContent.json/);
});
