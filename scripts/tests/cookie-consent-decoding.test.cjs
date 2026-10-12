const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require(path.join(process.cwd(), 'node_modules/typescript'));

const source = fs.readFileSync(path.join(process.cwd(), 'src/components/legal/cookie-consent-banner.tsx'), 'utf8');
const compiled = ts.transpileModule(source + '\nexport { getCookie };\n', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

function readConsent(cookie) {
  const module = { exports: {} };
  const document = { cookie };
  const requireStub = name => {
    if (name === 'next/dynamic') return () => function DeferredDialog() {};
    if (['react', 'next/link', 'lucide-react', 'react/jsx-runtime'].includes(name)) return {};
    throw new Error('Unexpected component import: ' + name);
  };
  new Function('require', 'module', 'exports', 'document', compiled)(requireStub, module, module.exports, document);
  return module.exports.getCookie('fakturo_consent');
}

test('missing consent and similar cookie names do not provide a consent value', () => {
  assert.equal(readConsent(''), null);
  assert.equal(readConsent('unrelated=value; fakturo_consent_backup=accepted'), null);
});

test('a valid consent cookie retains exact JSON and optional false choices', () => {
  const value = JSON.stringify({ version: '1.1.0-2026-10-08', essential: true, functional: false, analytics: false, marketing: false });
  assert.equal(readConsent('other=one; fakturo_consent=' + encodeURIComponent(value) + '; tail=two'), value);
});

for (const malformed of ['%', '%ZZ', '%E0%A4%A']) {
  test('malformed percent-encoded consent ' + malformed + ' becomes absent without throwing', () => {
    assert.equal(readConsent('fakturo_consent=' + malformed), null);
  });
}

test('valid Unicode consent values still decode without altering Polish characters', () => {
  const value = JSON.stringify({ note: 'Zażółć gęślą jaźń' });
  assert.equal(readConsent('fakturo_consent=' + encodeURIComponent(value)), value);
});

test('valid percent encoding preserves malformed JSON for the existing JSON validation', () => {
  assert.equal(readConsent('fakturo_consent=' + encodeURIComponent('{broken')), '{broken');
});
