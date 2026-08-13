import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let outDir;

before(() => {
  outDir = mkdtempSync(join(tmpdir(), 'pwrhaus-a11y-'));
  execFileSync('npx', ['@11ty/eleventy', '--output=' + outDir], { stdio: 'pipe', shell: true });
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

test('no page skips a heading level', () => {
  const pages = htmlFiles(outDir);
  assert.ok(pages.length > 0, 'build produced no HTML');
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    for (let i = 1; i < levels.length; i++) {
      assert.ok(
        levels[i] <= levels[i - 1] + 1,
        `${page} jumps from h${levels[i - 1]} to h${levels[i]} — screen reader users navigate by heading level`,
      );
    }
  }
});

test('the skip link is the first focusable element on every page', () => {
  for (const page of htmlFiles(outDir)) {
    const html = readFileSync(page, 'utf8');
    const body = html.slice(html.indexOf('<body'));
    const first = body.match(/<(?:a|button|input|select|textarea)\b[^>]*>/);
    assert.ok(first, `${page} has no focusable element at all`);
    assert.match(
      first[0],
      /class="skip-link"/,
      `${page}: first focusable element must be the skip link, found ${first[0].slice(0, 60)}`,
    );
  }
});

test('every form input has a label bound to it', () => {
  for (const page of htmlFiles(outDir)) {
    const html = readFileSync(page, 'utf8');
    const forId = new Set([...html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]));
    for (const m of html.matchAll(/<(?:input|textarea)\b[^>]*>/g)) {
      const tag = m[0];
      if (/type="hidden"/.test(tag)) continue;
      const id = tag.match(/\sid="([^"]+)"/);
      assert.ok(id, `${page}: form control without an id, so no label can bind to it: ${tag.slice(0, 60)}`);
      assert.ok(forId.has(id[1]), `${page}: no <label for="${id[1]}">`);
    }
  }
});

test('form inputs declare at least 16px so iOS Safari does not zoom on focus', () => {
  const css = readFileSync('src/css/main.css', 'utf8');
  const rule = css.match(/\.field input,\s*\.field textarea\s*\{[^}]*\}/);
  assert.ok(rule, 'expected a .field input/.field textarea rule in main.css');
  const size = rule[0].match(/font-size:\s*(\d+)px/);
  assert.ok(size, 'form inputs must declare an explicit px font-size');
  assert.ok(
    Number(size[1]) >= 16,
    `form inputs declare ${size[1]}px; below 16px iOS Safari zooms the viewport on focus`,
  );
});

test('no fixed width in the stylesheet exceeds the narrowest supported viewport', () => {
  const css = readFileSync('src/css/main.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // Exclude every hyphenated -width property: min-width, max-width, border-width.
  for (const m of css.matchAll(/(?<![a-z-])width:\s*(\d+)px/g)) {
    assert.ok(
      Number(m[1]) <= 320,
      `fixed width ${m[1]}px will overflow a 320px viewport — use a relative unit or a max-width`,
    );
  }
});
