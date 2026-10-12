require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const Module = require('node:module');
const { deflateSync } = require('node:zlib');
const { PDFDocument } = require('pdf-lib');
const { validateLogoBytes, decodeLogoDataUrl, normalizeLogoUrl, MAX_LOGO_BYTES, MAX_LOGO_DATA_URL_LENGTH } = require('../../src/lib/pdf/logo-safety.ts');
const { parseCompanyProfileBody } = require('../../src/lib/parsers.ts');

// One red pixel, encoded as an ordinary baseline JPEG.
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z', 'base64');
function chunk(type, data) {
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0); output.write(type, 4, 'ascii'); data.copy(output, 8);
  let crc = 0xffffffff;
  for (const byte of output.subarray(4, output.length - 4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4);
  return output;
}
function png(width = 1, height = 1, extras = []) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  // Boundary fixtures change headers only; no giant pixel buffer is created or decoded.
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), ...extras, chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0))]);
}
function pngAfterData(type, data) {
  const bytes = png();
  return Buffer.concat([bytes.subarray(0, -12), chunk(type, data), bytes.subarray(-12)]);
}
function jpegHeader(width, height) {
  const bytes = Buffer.from(jpeg), frame = bytes.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(frame > 0); bytes.writeUInt16BE(height, frame + 5); bytes.writeUInt16BE(width, frame + 7);
  return bytes;
}
const dataUrl = (bytes, format = 'png') => `data:image/${format};base64,${bytes.toString('base64')}`;

test('small valid PNG and JPEG logos keep their bytes and embed successfully', async () => {
  const pdf = await PDFDocument.create();
  for (const [bytes, format] of [[png(), 'png'], [jpeg, 'jpeg']]) {
    assert.deepEqual(validateLogoBytes(bytes), { format, width: 1, height: 1 });
    const decoded = decodeLogoDataUrl(dataUrl(bytes, format));
    assert.deepEqual(Buffer.from(decoded.bytes), bytes);
    const image = format === 'png' ? await pdf.embedPng(decoded.bytes) : await pdf.embedJpg(decoded.bytes);
    assert.equal(image.width, 1); assert.equal(image.height, 1);
  }
  assert.equal(decodeLogoDataUrl(dataUrl(jpeg, 'jpg')).format, 'jpeg');
});

test('PNG and JPEG header dimensions enforce edge and pixel budgets before decoding', () => {
  for (const image of [png, jpegHeader]) {
    for (const [width, height] of [[4096, 1], [1, 4096], [2000, 2000]]) {
      const metadata = validateLogoBytes(image(width, height));
      assert.equal(metadata.width, width); assert.equal(metadata.height, height);
    }
    for (const [width, height] of [[4097, 1], [1, 4097], [2001, 2000], [0, 1], [1, 0]]) {
      assert.throws(() => validateLogoBytes(image(width, height)), /4096.*4 mln/);
    }
  }
});

test('unsupported, animated, mislabeled and corrupt image containers are rejected', () => {
  const corrupt = png(); corrupt[corrupt.length - 1] ^= 1;
  const acTL = Buffer.alloc(8); acTL.writeUInt32BE(1, 0);
  for (const bytes of [Buffer.from('GIF89a'), Buffer.from('RIFF....WEBP'), Buffer.from('<svg/>'), png(1, 1, [chunk('acTL', acTL)]), corrupt, Buffer.concat([png(), Buffer.from([0])])]) {
    assert.throws(() => validateLogoBytes(bytes));
  }
  assert.throws(() => decodeLogoDataUrl(dataUrl(jpeg)), /PNG.*JPG/);
  assert.throws(() => decodeLogoDataUrl(dataUrl(png(), 'jpeg')), /PNG.*JPG/);
});

test('valid PNG text metadata preserves embedding, including empty optional international fields', async () => {
  const pdf = await PDFDocument.create();
  const text = [
    ['tEXt', Buffer.from('Author\0QA')],
    ['tEXt', Buffer.from(`${'K'.repeat(79)}\0`)],
    ['iTXt', Buffer.from('Author\0\0\0pl\0Autor\0żółć', 'utf8')],
    ['iTXt', Buffer.from('Title\0\0\0\0\0')],
    ['iTXt', Buffer.concat([Buffer.from('Author\0'), Buffer.from([1, 0, 0, 0]), deflateSync(Buffer.from('żółć', 'utf8'))])],
  ];
  for (const [type, content] of text) {
    for (const bytes of [png(1, 1, [chunk(type, content)]), pngAfterData(type, content)]) {
      assert.deepEqual(validateLogoBytes(bytes), { format: 'png', width: 1, height: 1 });
      const decoded = decodeLogoDataUrl(dataUrl(bytes));
      assert.deepEqual(Buffer.from(decoded.bytes), bytes, 'Valid text chunks keep their original bytes');
      const image = await pdf.embedPng(decoded.bytes);
      assert.equal(image.width, 1); assert.equal(image.height, 1);
    }
  }
});

test('PNG text separators and international flags must stay inside the chunk before PDF decoding', () => {
  const keyword = Buffer.from('Author\0');
  const metadata = [
    ['tEXt', Buffer.alloc(0)],
    ['tEXt', Buffer.from('Author')],
    ['tEXt', Buffer.from('\0text')],
    ['tEXt', Buffer.from(`${'K'.repeat(80)}\0text`)],
    ['iTXt', Buffer.alloc(0)],
    ['iTXt', Buffer.from('Author')],
    ['iTXt', keyword],
    ['iTXt', Buffer.concat([keyword, Buffer.from([0])])],
    ['iTXt', Buffer.concat([keyword, Buffer.from([0, 0]), Buffer.from('pl')])],
    ['iTXt', Buffer.concat([keyword, Buffer.from([0, 0]), Buffer.from('pl\0Autor')])],
    ['iTXt', Buffer.concat([keyword, Buffer.from([2, 0, 0, 0])])],
    ['iTXt', Buffer.concat([keyword, Buffer.from([0, 1, 0, 0])])],
    ['iTXt', Buffer.from('\0\0\0\0\0')],
    ['iTXt', Buffer.from(`${'K'.repeat(80)}\0\0\0\0\0`) ],
  ];
  assert.equal(chunk('iTXt', Buffer.alloc(0)).toString('hex'), '000000006954587429d58380');
  for (const [type, content] of metadata) {
    for (const bytes of [png(1, 1, [chunk(type, content)]), pngAfterData(type, content)]) {
      // Never pass these malformed files to the unsafe decoder; validate the shared boundary first.
      assert.throws(() => validateLogoBytes(bytes), /Nieprawidłowy/);
      assert.throws(() => normalizeLogoUrl(dataUrl(bytes)), /Nieprawidłowy/);
      assert.throws(() => parseCompanyProfileBody({ companyName: 'Test', nip: '5260301706', logoUrl: dataUrl(bytes) }),
        error => error.status === 400 && typeof error.fieldErrors.logoUrl === 'string');
    }
  }
});

test('truncated PNG chunks, JPEG segments and malformed data URLs are rejected', () => {
  for (const bytes of [png(), jpeg]) {
    for (let end = 0; end < bytes.length; end++) assert.throws(() => validateLogoBytes(bytes.subarray(0, end)));
  }
  const badLength = png(); badLength.writeUInt32BE(0xffffffff, 33);
  assert.throws(() => validateLogoBytes(badLength));
  const scan = jpeg.indexOf(Buffer.from([0xff, 0xda])), scanHeaderEnd = scan + 2 + jpeg.readUInt16BE(scan + 2);
  const restartWithoutData = Buffer.concat([jpeg.subarray(0, scanHeaderEnd), Buffer.from([0xff, 0xd0, 0xff, 0xd9])]);
  assert.throws(() => validateLogoBytes(restartWithoutData));
  for (const value of ['data:image/png;base64', 'data:image/png;base64,', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png,abc', 'data:image/png;base64,AA', 'data:image/png;base64,AAAA=', 'data:image/png;base64,AA?=', 'data:image/png;base64,AB==']) {
    assert.throws(() => decodeLogoDataUrl(value));
  }
  const valid = dataUrl(png());
  assert.throws(() => decodeLogoDataUrl(valid.slice(0, -1)));
  assert.throws(() => decodeLogoDataUrl(valid + '\n'));
});

test('company parser accepts optional logos and public HTTPS URLs and returns logo field errors', () => {
  const company = { companyName: 'Test', nip: '5260301706' };
  assert.equal(parseCompanyProfileBody(company).logoUrl, null);
  assert.equal(parseCompanyProfileBody({ ...company, logoUrl: '  ' }).logoUrl, null);
  for (const logoUrl of [dataUrl(png()), dataUrl(jpeg, 'jpeg'), 'https://cdn.example.com/logo.png?version=2']) {
    assert.equal(parseCompanyProfileBody({ ...company, logoUrl: ` ${logoUrl} ` }).logoUrl, logoUrl);
  }
  for (const logoUrl of [23, true, {}, [], dataUrl(png(4097, 1)), dataUrl(Buffer.from('<svg/>'), 'svg+xml'), 'http://example.com/logo.png', 'https://user:pass@example.com/logo.png', 'https://example.com:444/logo.png', 'https://example.com/logo.png#fragment', `https://example.com/${'x'.repeat(2000)}`]) {
    assert.throws(() => parseCompanyProfileBody({ ...company, logoUrl }), error => error.status === 400 && typeof error.fieldErrors.logoUrl === 'string');
  }
  assert.equal(normalizeLogoUrl(null), null);
});

test('PDF validates stored and fetched bytes before calling image embedders', async t => {
  const rendererPath = require.resolve('../../src/lib/pdf/generate-invoice-pdf.ts');
  const previousRenderer = require.cache[rendererPath], originalLoad = Module._load;
  const documents = [], requests = [];
  let fetched = { bytes: png(), isPng: true };
  function document() {
    const page = { getSize: () => ({ width: 595.28, height: 841.89 }), drawText() {}, drawRectangle() {}, drawImage() {}, drawLine() {} };
    const value = {
      embeds: [], setTitle() {}, setAuthor() {}, registerFontkit() {}, addPage: () => page,
      embedFont: async () => ({ widthOfTextAtSize: (text, size) => text.length * size / 2 }),
      embedPng: async bytes => { value.embeds.push(['png', bytes]); return {}; },
      embedJpg: async bytes => { value.embeds.push(['jpeg', bytes]); return {}; },
      getPages: () => [page], getPageCount: () => 1, save: async () => Buffer.from('%PDF-stub'),
    };
    documents.push(value); return value;
  }
  delete require.cache[rendererPath];
  Module._load = function(request, parent, main) {
    if (parent?.filename === rendererPath && request === 'pdf-lib') return { PDFDocument: { create: async () => document() }, rgb: (...values) => values };
    if (parent?.filename === rendererPath && request === 'node:fs/promises') return { readFile: async () => Buffer.alloc(0) };
    if (parent?.filename === rendererPath && request === './remote-logo') return { remoteLogo: async url => { requests.push(url); return fetched; } };
    return originalLoad.call(this, request, parent, main);
  };
  let render;
  try { render = require(rendererPath).generateInvoicePdfBuffer; }
  finally { Module._load = originalLoad; }
  t.after(() => { if (previousRenderer) require.cache[rendererPath] = previousRenderer; else delete require.cache[rendererPath]; });
  t.mock.method(console, 'warn', () => {});
  const invoice = { number: 'TEST/1', type: 'sale', language: 'PL', currency: 'PLN', lines: [], paymentMethod: 'cash', issueDate: '2026-10-09', saleDate: '2026-10-09', dueDate: '2026-10-09' };
  const company = { companyName: 'Test', nip: '5260301706' };
  async function check(logoUrl, expectedFormat) {
    assert.equal((await render(invoice, undefined, { ...company, logoUrl })).toString(), '%PDF-stub');
    const embeds = documents.at(-1).embeds;
    assert.equal(embeds.length, expectedFormat ? 1 : 0);
    if (expectedFormat) assert.equal(embeds[0][0], expectedFormat);
  }
  await check(dataUrl(png()), 'png');
  await check(dataUrl(jpeg, 'jpeg'), 'jpeg');
  // A valid container can still hold incomplete compressed data. It must never
  // reach the PDF library's PNG decoder, even for an existing stored logo.
  const incompleteData = Buffer.alloc(32); incompleteData[0] = 0x78; incompleteData[1] = 0x9c; incompleteData[2] = 5;
  const incompletePng = Buffer.concat([png().subarray(0, 33), chunk('IDAT', incompleteData), chunk('IEND', Buffer.alloc(0))]);
  assert.equal(validateLogoBytes(incompletePng).format, 'png');
  await check(dataUrl(incompletePng), null);
  await check(dataUrl(png(4097, 1)), null);
  await check(dataUrl(png(2001, 2000)), null);
  await check(dataUrl(pngAfterData('iTXt', Buffer.alloc(0))), null);
  await check(dataUrl(Buffer.from('GIF89a'), 'gif'), null);
  await check('https://cdn.example.com/logo.png', 'png');
  fetched = { bytes: png(4097, 1), isPng: true };
  await check('https://cdn.example.com/logo.png', null);
  fetched = { bytes: jpegHeader(2001, 2000), isPng: false };
  await check('https://cdn.example.com/logo.jpg', null);
  fetched = { bytes: png(), isPng: false };
  await check('https://cdn.example.com/mislabeled.jpg', null);
  fetched = { bytes: pngAfterData('iTXt', Buffer.alloc(0)), isPng: true };
  await check('https://cdn.example.com/malformed-text.png', null);
  fetched = { bytes: incompletePng, isPng: true };
  await check('https://cdn.example.com/incomplete-data.png', null);
  fetched = { bytes: jpeg.subarray(0, jpeg.length - 1), isPng: false };
  await check('https://cdn.example.com/truncated.jpg', null);
  // The remote body may be a pooled Buffer view; the embedder receives exact bytes.
  const pool = Buffer.alloc(jpeg.length + 10); jpeg.copy(pool, 5);
  fetched = { bytes: pool.subarray(5, 5 + jpeg.length), isPng: false };
  await check('https://cdn.example.com/valid.jpg', 'jpeg');
  const passedBytes = documents.at(-1).embeds[0][1];
  assert.equal(passedBytes.byteOffset, 0); assert.equal(passedBytes.buffer.byteLength, jpeg.length);
  assert.deepEqual(Buffer.from(passedBytes), jpeg);
  assert.equal(requests.length, 8);
});

test('encoded and byte size guards reject over-budget inputs before processing images', () => {
  // One bounded allocation covers both byte and encoded limits; no image pixels are decoded.
  const oversized = Buffer.alloc(MAX_LOGO_BYTES + 1);
  assert.throws(() => validateLogoBytes(oversized), /2 MB/);
  assert.throws(() => decodeLogoDataUrl(dataUrl(oversized)), /2 MB/);
  assert.throws(() => normalizeLogoUrl('x'.repeat(MAX_LOGO_DATA_URL_LENGTH + 1)), /2 MB/);
});
