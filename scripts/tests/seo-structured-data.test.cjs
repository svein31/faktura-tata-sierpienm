require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { topics, topicsFor, topicCategory, topicDates, PUBLIC_ORIGIN } = require('../../src/lib/seo/content.ts');
const { topicMetadata } = require('../../src/lib/seo/metadata.ts');
const { PRIVATE_CRAWL_PREFIXES, INDEXABLE_PATHS } = require('../../src/lib/seo/discovery.ts');
const { TopicPage, PillarPage, JsonLd } = require('../../src/components/seo/public-pages.tsx');
const robots = require('../../src/app/robots.ts').default;
const graphs = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .flatMap(match => { const graph = JSON.parse(match[1]); return graph['@graph'] || [graph]; });

test('all published guides render matching structured entities, breadcrumbs, sources and dates', () => {
  for (const topic of topics) {
    const html = renderToStaticMarkup(React.createElement(TopicPage, { topic }));
    const nodes = graphs(html), category = topicCategory(topic.path);
    const article = nodes.find(node => node['@type'] === 'Article');
    const page = nodes.find(node => node['@type'] === 'WebPage');
    const breadcrumbs = nodes.find(node => node['@type'] === 'BreadcrumbList');
    assert.equal(page.mainEntity['@id'], article['@id'], topic.path);
    assert.equal(page.breadcrumb['@id'], breadcrumbs['@id'], topic.path);
    assert.equal(article.abstract, topic.answer, topic.path + ' answer matches visible text');
    assert.equal(article.articleSection, category.name, topic.path);
    assert.equal(breadcrumbs.itemListElement[1].name, category.name, topic.path);
    assert.equal(breadcrumbs.itemListElement[1].item, PUBLIC_ORIGIN + category.path, topic.path);
    assert.match(html, /aria-current="page"/, topic.path);
    assert.ok(html.includes('>' + category.name + '</a>'), topic.path + ' visible category');
    const dates = topicDates(topic), metadata = topicMetadata(topic);
    assert.equal(article.datePublished, dates.publishedAt, topic.path);
    assert.equal(article.dateModified, dates.modifiedAt, topic.path);
    assert.ok(html.includes('dateTime="' + dates.modifiedAt + '"'), topic.path);
    assert.equal(metadata.openGraph.type, 'article', topic.path);
    assert.equal(metadata.openGraph.publishedTime, article.datePublished, topic.path);
    assert.equal(metadata.openGraph.modifiedTime, article.dateModified, topic.path);
    assert.equal(metadata.openGraph.section, category.name, topic.path);
    assert.ok(!article.aggregateRating && !article.review, topic.path);
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
    for (const section of article.hasPart) {
      const url = new URL(section.url);
      assert.equal(url.origin, PUBLIC_ORIGIN, topic.path);
      assert.ok(ids.has(url.hash.slice(1)), topic.path + ' existing section ' + url.hash);
    }
    for (const citation of article.citation) assert.ok(html.includes('href="' + citation.replaceAll('&', '&amp;') + '"'), topic.path + ' visible source');
    for (const source of topic.sections.flatMap(section => section.source ? [section.source] : [])) {
      assert.ok(article.citation.includes(source.url), topic.path + ' inline source included');
    }
  }
});

test('pillar collections describe exactly the linked, visible articles in their displayed order', () => {
  for (const prefix of ['/faktury', '/poradnik-ksef', '/vat', '/porownania']) {
    const group = topicsFor(prefix);
    const html = renderToStaticMarkup(React.createElement(PillarPage, { title: 'Poradniki', description: 'Lista poradników', prefix }));
    const nodes = graphs(html);
    const collection = nodes.find(node => node['@type'] === 'CollectionPage');
    const list = nodes.find(node => node['@type'] === 'ItemList');
    assert.equal(collection.mainEntity['@id'], list['@id'], prefix);
    assert.equal(list.numberOfItems, group.length, prefix);
    assert.deepEqual(list.itemListElement.map(item => [item.position, item.name, item.url]),
      group.map((topic, index) => [index + 1, topic.title, PUBLIC_ORIGIN + topic.path]));
    for (const topic of group) assert.ok(html.includes('href="' + topic.path + '"'), prefix);
  }
});

test('a publication-only date is consistent and does not get a fictitious later review date', () => {
  assert.deepEqual(topicDates({ publishedAt: '2026-10-03' }), { publishedAt: '2026-10-03', modifiedAt: '2026-10-03' });
  assert.deepEqual(topicDates({ publishedAt: '2026-09-24', modifiedAt: '2026-10-03' }), { publishedAt: '2026-09-24', modifiedAt: '2026-10-03' });
});

test('one shared robots group preserves private exclusions for search and AI crawlers without blocking public resources', () => {
  const document = robots();
  assert.equal(document.rules.userAgent, '*'); // Includes Googlebot, Bingbot, OAI-SearchBot and GPTBot; no policy change.
  const forbidden = document.rules.disallow;
  const blocked = path => forbidden.some(rule => {
    const end = rule.endsWith('$');
    const prefix = end ? rule.slice(0, -1) : rule;
    return end ? path === prefix : path.startsWith(prefix);
  });
  for (const path of INDEXABLE_PATHS) assert.equal(blocked(path), false, path);
  for (const path of ['/_next/static/chunk.js', '/_next/image?url=logo', '/icon.svg', '/opengraph-image', '/llms.txt', '/sitemap.xml', '/login']) {
    assert.equal(blocked(path), false, path);
  }
  for (const path of PRIVATE_CRAWL_PREFIXES) {
    for (const suffix of ['', '/', '/example', '?query=example']) assert.equal(blocked(path + suffix), true, path + suffix);
  }
  function visit(directory, segments = []) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) visit(join(directory, entry.name), [...segments, entry.name]);
      else if (entry.name === 'page.tsx') assert.equal(blocked('/' + segments.map(segment => segment.startsWith('[') ? 'example' : segment).join('/')), true, segments.join('/'));
    }
  }
  visit(join(__dirname, '../../src/app/(app)'));
});

test('JSON-LD remains valid JSON and escapes script termination in content', () => {
  const value = { '@context': 'https://schema.org', name: '</script><script>alert(1)</script>' };
  const html = renderToStaticMarkup(React.createElement(JsonLd, { value }));
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.equal(graphs(html)[0].name, value.name);
});
