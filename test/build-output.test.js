import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let outDir;

before(() => {
  outDir = mkdtempSync(join(tmpdir(), 'pwrhaus-build-'));
  execFileSync('npx', ['@11ty/eleventy', '--output=' + outDir], {
    stdio: 'pipe',
    shell: true,
  });
});

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

test('every built page carries the Framework & Co. credit', () => {
  const pages = htmlFiles(outDir);
  assert.ok(pages.length > 0, 'build produced no HTML');
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    assert.match(html, /Developed by Framework &amp; Co\./, `missing credit: ${page}`);
    assert.match(html, /https:\/\/www\.frameworkandco\.com/, `missing credit href: ${page}`);
  }
});

test('every built page has exactly one h1', () => {
  const pages = htmlFiles(outDir);
  assert.ok(pages.length > 0, 'build produced no HTML');
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const count = (html.match(/<h1[\s>]/g) || []).length;
    assert.equal(count, 1, `expected exactly one h1 in ${page}, found ${count}`);
  }
});

test('every built page declares a viewport and a lang attribute', () => {
  const pages = htmlFiles(outDir);
  assert.ok(pages.length > 0, 'build produced no HTML');
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    assert.match(html, /<html lang="en">/, `missing lang: ${page}`);
    assert.match(html, /name="viewport"/, `missing viewport: ${page}`);
  }
});

test('the stylesheet contains no box-shadow and no max-width media queries', () => {
  const css = readFileSync('src/css/main.css', 'utf8');
  assert.equal(/box-shadow/.test(css), false, 'box-shadow is banned by the design system');
  assert.equal(/@media[^{]*max-width/.test(css), false, 'CSS must be mobile-first: min-width only');
});

test('the stylesheet never uses the decorative brass token for text colour', () => {
  const css = readFileSync('src/css/main.css', 'utf8');
  assert.equal(
    /(?<!-)color:\s*var\(--brass\)/.test(css),
    false,
    '--brass fails AA on paper; use --brass-text for text',
  );
});

test('every rendered form posts a source the backend whitelists', async () => {
  const { ALLOWED_SOURCES } = await import('../functions/lib/sanitize.js');
  const pages = htmlFiles(outDir);
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
  const pages = htmlFiles(outDir);
  assert.ok(pages.length > 0, 'build produced no HTML');
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    assert.match(html, /<link rel="canonical" href="http/, `missing canonical: ${page}`);
    assert.match(html, /<meta property="og:title"/, `missing og:title: ${page}`);
    assert.match(html, /<meta property="og:description"/, `missing og:description: ${page}`);
  }
});

test('no shipped image has an empty alt attribute', () => {
  const pages = htmlFiles(outDir);
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
