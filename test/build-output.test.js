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

test('primary CTA buttons keep short labels on one line across breakpoints', () => {
  const css = declarationsOnly('src/css/main.css');
  const buttonRule = css.match(/\.btn\s*\{[^}]*\}/);
  const navCtaRule = css.match(/\.nav-cta\s*\{[^}]*\}/);

  assert.ok(buttonRule, 'expected a shared .btn rule');
  assert.match(
    buttonRule[0],
    /white-space:\s*nowrap/,
    'short CTA labels like "Create free profile" should not wrap inside buttons',
  );
  assert.ok(navCtaRule, 'expected a .nav-cta rule');
  assert.match(
    navCtaRule[0],
    /flex-shrink:\s*0/,
    'desktop nav CTA should not shrink into a wrapped label at laptop widths',
  );
});

test('header brand aligns the wordmark with the logo mark without a tagline', () => {
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  const header = html.match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0];
  const css = declarationsOnly('src/css/main.css');
  const brandNameRule = css.match(/\.brand-name\s*\{[^}]*\}/);

  assert.ok(header, 'header should render');
  assert.doesNotMatch(header, /brand-tagline/, 'header brand should not render a tagline under the logo');
  assert.ok(brandNameRule, 'expected a .brand-name rule');
  assert.match(brandNameRule[0], /justify-content:\s*center/, 'brand wordmark should height-align with the logo mark');
});

test('capture forms use the sitewide softened container corners', () => {
  const css = declarationsOnly('src/css/main.css');
  const captureFormRule = css.match(/\.capture-form\s*\{[^}]*\}/);

  assert.ok(captureFormRule, 'expected a .capture-form rule');
  assert.match(
    captureFormRule[0],
    /border-radius:\s*var\(--radius-media\)/,
    'capture form container should use the same softened radius as cards and media',
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

test('header navigation marks and highlights the current page', () => {
  const html = readFileSync(join(outDir, 'membership', 'index.html'), 'utf8');
  const desktopNav = html.match(/<nav class="nav-desktop"[\s\S]*?<\/nav>/)?.[0];
  const mobileNav = html.match(/<div class="nav-overlay"[\s\S]*?<\/nav>/)?.[0];
  const css = declarationsOnly('src/css/main.css');
  const desktopActiveRule = css.match(/\.nav-desktop a:is\(:hover,\s*\[aria-current="page"\]\)\s*\{[^}]*\}/);
  const mobileActiveRule = css.match(/\.nav-overlay a:is\(:hover,\s*\[aria-current="page"\]\)\s*\{[^}]*\}/);

  assert.ok(desktopNav, 'desktop navigation should render');
  assert.ok(mobileNav, 'mobile navigation should render');
  assert.match(desktopNav, /<a href="\/membership\/" aria-current="page">Membership<\/a>/);
  assert.match(mobileNav, /<a href="\/membership\/" aria-current="page">Membership<\/a>/);
  assert.ok(desktopActiveRule, 'expected desktop nav hover/current-page rule');
  assert.match(desktopActiveRule[0], /font-weight:\s*700/, 'desktop selected nav item should be bold');
  assert.match(desktopActiveRule[0], /border-bottom-color:\s*var\(--brass-text\)/, 'desktop selected nav item should be highlighted');
  assert.ok(mobileActiveRule, 'expected mobile nav hover/current-page rule');
  assert.match(mobileActiveRule[0], /font-weight:\s*700/, 'mobile selected nav item should be bold');
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

test('footer navigation sits above social links in a wrapping horizontal row', () => {
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  const footer = html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0];
  const css = declarationsOnly('src/css/main.css');
  const footerNavListRule = css.match(/\.footer-nav ul\s*\{[^}]*\}/);

  assert.ok(footer, 'footer should render');
  assert.ok(
    footer.indexOf('class="footer-nav"') < footer.indexOf('class="footer-social"'),
    'footer page links should render before social icons',
  );
  assert.ok(footerNavListRule, 'expected a .footer-nav ul rule');
  assert.match(footerNavListRule[0], /display:\s*flex/, 'footer links should read left to right');
  assert.match(footerNavListRule[0], /flex-wrap:\s*wrap/, 'footer links should wrap when space is tight');
});

test('membership and sponsor tier cards use the softer media radius', () => {
  const css = declarationsOnly('src/css/main.css');
  const tierCardRule = css.match(/\.cards-3\s*>\s*\.card\s*\{[^}]*\}/);

  assert.ok(tierCardRule, 'expected a cards-3 tier card rule');
  assert.match(
    tierCardRule[0],
    /border-radius:\s*var\(--radius-media\)/,
    'membership and sponsor cards should use the softer media radius',
  );
});

test('membership tier cards align their action rows to a shared bottom layer', () => {
  const css = declarationsOnly('src/css/main.css');
  const tierCardRule = css.match(/\.cards-3\s*>\s*\.card\s*\{[^}]*\}/);
  const tierActionsRule = css.match(/\.cards-3\s*>\s*\.card\s*>\s*\.card-actions\s*\{[^}]*\}/);

  assert.ok(tierCardRule, 'expected a cards-3 tier card rule');
  assert.match(tierCardRule[0], /display:\s*flex/, 'tier cards should be vertical layout containers');
  assert.match(tierCardRule[0], /flex-direction:\s*column/, 'tier card content should stack vertically');
  assert.ok(tierActionsRule, 'expected a tier card actions rule');
  assert.match(tierActionsRule[0], /margin-top:\s*auto/, 'tier card action rows should align at the bottom');
});

test('membership page hides portal CTA until a GHL portal URL is configured', () => {
  const html = readFileSync(join(outDir, 'membership', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /Enter Member Portal/, 'membership page should not show portal CTA without GHL_PORTAL_URL');
});

test('membership page renders portal CTA when a GHL portal URL is configured', () => {
  const dir = buildWithEnv({ GHL_PORTAL_URL: 'https://portal.example.com/pwrhaus' });
  try {
    const html = readFileSync(join(dir, 'membership', 'index.html'), 'utf8');
    const portalCta = '<a class="btn btn-secondary" href="https://portal.example.com/pwrhaus">Enter Member Portal</a>';
    const freeCard = html.match(/<li class="card">[\s\S]*?<\/li>/)?.[0];
    const memberCard = html.match(/<li class="card card-featured">[\s\S]*?<\/li>/)?.[0];

    assert.ok(freeCard, 'Free membership card should render');
    assert.match(freeCard, new RegExp(portalCta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(memberCard, 'Member membership card should render');
    assert.match(memberCard, new RegExp(portalCta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
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
