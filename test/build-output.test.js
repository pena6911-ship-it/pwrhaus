import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

let outDir;

before(() => {
  outDir = mkdtempSync(join(tmpdir(), 'pwrhaus-build-'));
  execFileSync('npx', ['@11ty/eleventy', '--output=' + outDir], {
    stdio: 'pipe',
    shell: true,
  });
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
  for (const page of htmlFiles(outDir)) {
    const html = readFileSync(page, 'utf8');
    const count = (html.match(/<h1[\s>]/g) || []).length;
    assert.equal(count, 1, `expected exactly one h1 in ${page}, found ${count}`);
  }
});

test('every built page declares a viewport and a lang attribute', () => {
  for (const page of htmlFiles(outDir)) {
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
    /color:\s*var\(--brass\)/.test(css),
    false,
    '--brass fails AA on paper; use --brass-text for text',
  );
});
