require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { topics } = require('../../src/lib/seo/content.ts');
const { contentModifiedAt, INDEXABLE_PATHS, llmsText } = require('../../src/lib/seo/discovery.ts');
const sitemap = require('../../src/app/sitemap.ts').default;

test('sitemap collection dates include the latest linked article without fabrication', () => {
  assert.equal(contentModifiedAt('/porownania'), '2026-10-08');
  assert.equal(contentModifiedAt('/faktury'), '2026-10-02');
  assert.equal(contentModifiedAt('/faktury/jak-wystawic'), '2026-09-24');
  assert.equal(contentModifiedAt('/'), '2026-10-15', 'Homepage product answers were actually published on this date');
  const items = sitemap();
  assert.equal(items.find(item => item.url === 'https://fakturaprosto.pl/').lastModified.toISOString(), '2026-10-15T12:00:00.000Z');
  assert.equal(items.find(item => item.url === 'https://fakturaprosto.pl/porownania').lastModified.toISOString(), '2026-10-08T12:00:00.000Z');
  assert.equal(new Set(items.map(item => item.url)).size, items.length);
  assert.ok(items.every(item => !/^\/(api|portal|login|register|verify-email|settings|dashboard)(\/|$)/.test(new URL(item.url).pathname)));
  for (const path of ['/cennik', '/polityka-prywatnosci', '/porownania/fakturowo', '/porownania/faktura-pl']) {
    assert.ok(INDEXABLE_PATHS.includes(path), path);
  }
});

test('AI-readable public directory preserves titles, canonical URLs, dates and transparent prices', () => {
  const text = llmsText();
  for (const topic of topics) assert.ok(text.includes(`[${topic.title}](https://fakturaprosto.pl${topic.path})`), topic.path);
  assert.match(text, /7 zł brutto miesięcznie lub 59 zł brutto za cały rok/);
  assert.match(text, /Subskrypcja odnawia się automatycznie/);
  assert.match(text, /Aktualizacja: 2026-10-03/);
  assert.doesNotMatch(text, /\[kody-qr\]|\[2027\]|\[dla-jdg\]/);
  assert.doesNotMatch(text, /top\s*5|najlepszy program|rating|aggregateRating/i);
});

test('public legal pages define unique absolute titles and their own canonical URL', () => {
  const titles = new Set();
  for (const slug of ['regulamin', 'polityka-prywatnosci', 'polityka-cookies', 'powierzenie-danych', 'podwykonawcy']) {
    const { metadata } = require(`../../src/app/${slug}/page.tsx`);
    assert.equal(metadata.alternates.canonical, '/'+slug);
    assert.equal(metadata.robots.index, true);
    assert.ok(metadata.title.absolute.length <= 60);
    assert.ok(!titles.has(metadata.title.absolute)); titles.add(metadata.title.absolute);
    assert.equal(metadata.openGraph.url, '/'+slug);
  }
});
