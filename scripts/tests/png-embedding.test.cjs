require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const Module = require('node:module');
const { deflateSync } = require('node:zlib');
const { PDFDocument } = require('pdf-lib');
const { PNG } = require('pdf-lib/cjs/utils/png');
const { validateLogoBytes } = require('../../src/lib/pdf/logo-safety.ts');
const { preparePngForEmbedding, validateInlineLogoForStorage } = require('../../src/lib/pdf/png-embedding.ts');
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const passes = [[0,0,8,8], [4,0,8,8], [0,4,4,8], [2,0,4,4], [0,2,2,4], [1,0,2,2], [0,1,1,2]];

function chunk(type, data) {
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length); output.write(type, 4); data.copy(output, 8);
  let crc = 0xffffffff;
  for (const byte of output.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4);
  return output;
}
function paeth(a, b, c) {
  const p = a + b - c, da = Math.abs(p-a), db = Math.abs(p-b), dc = Math.abs(p-c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}
function fixture({ width = 1, height = 1, color = 6, depth = 8, interlace = 0, compressed, extras = [], afterData = [] } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = depth; header[9] = color; header[12] = interlace;
  const channels = { 0:1, 2:3, 3:1, 4:2, 6:4 }[color], max = 2 ** depth - 1;
  const paletteCount = Math.min(4, 2 ** depth), palette = Buffer.from([255,0,0, 0,255,0, 0,0,255, 0,0,0].slice(0, paletteCount * 3));
  const rows = [], filterOffsets = [];
  let rawOffset = 0;
  for (const [x, y, dx, dy] of interlace ? passes : [[0,0,1,1]]) {
    const w = Math.max(0, Math.ceil((width-x)/dx)), h = Math.max(0, Math.ceil((height-y)/dy));
    if (!w || !h) continue;
    let previous = Buffer.alloc(Math.ceil(w * channels * depth / 8));
    for (let row = 0; row < h; row++) {
      const packed = Buffer.alloc(previous.length);
      let bit = 0;
      for (let col = 0; col < w; col++) {
        const px = x + col * dx, py = y + row * dy;
        const rgb = [px * 73 + 17, py * 53 + 23, px * 29 + py * 11 + 41].map(value => value % 256);
        const gray = (px + py) % (max + 1), alpha = (px + py) % 2 ? max : Math.floor(max/2);
        const values = color === 0 ? [gray] : color === 2 ? rgb.map(value => depth === 16 ? value * 257 : value)
          : color === 3 ? [(px + py) % paletteCount] : color === 4 ? [gray, alpha]
            : [...rgb.map(value => depth === 16 ? value * 257 : value), alpha];
        for (const value of values) for (let shift = depth - 1; shift >= 0; shift--, bit++) packed[bit >> 3] |= ((value >> shift) & 1) << (7 - (bit & 7));
      }
      const filter = row % 5, bpp = Math.max(1, Math.ceil(channels * depth / 8)), filtered = Buffer.alloc(packed.length + 1);
      filtered[0] = filter;
      for (let i = 0; i < packed.length; i++) {
        const left = i >= bpp ? packed[i-bpp] : 0, up = previous[i], upperLeft = i >= bpp ? previous[i-bpp] : 0;
        const prediction = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left+up)/2) : filter === 4 ? paeth(left, up, upperLeft) : 0;
        filtered[i+1] = (packed[i] - prediction) & 255;
      }
      filterOffsets.push(rawOffset); rawOffset += filtered.length; rows.push(filtered); previous = packed;
    }
  }
  const raw = Buffer.concat(rows), idat = compressed ?? deflateSync(raw);
  const imageChunks = [chunk('IHDR', header), ...(color === 3 ? [chunk('PLTE', palette), chunk('tRNS', Buffer.from([0,128,255,255].slice(0,paletteCount)))] : []), ...extras];
  return { raw, filterOffsets, bytes: Buffer.concat([signature, ...imageChunks, chunk('IDAT', idat), ...afterData, chunk('IEND', Buffer.alloc(0))]) };
}
function chunkTypes(bytes) {
  const result = [];
  for (let offset = 8; offset < bytes.length; offset += bytes.readUInt32BE(offset) + 12) result.push(bytes.toString('ascii', offset+4, offset+8));
  return result;
}
function invalidCompressed() {
  // Container CRC/dimensions are valid; native zlib rejects its incomplete data.
  const compressed = Buffer.alloc(32); compressed[0] = 0x78; compressed[1] = 0x9c; compressed[2] = 5;
  return fixture({ compressed }).bytes;
}
const url = bytes => `data:image/png;base64,${bytes.toString('base64')}`;

test('valid PNG colors, bit depths, all filters and Adam7 passes preserve PDF pixels', async t => {
  const combinations = [[0,[1,2,4,8,16]], [2,[8,16]], [3,[1,2,4,8]], [4,[8,16]], [6,[8,16]]];
  for (const [color, depths] of combinations) for (const depth of depths) for (const interlace of [0,1]) {
    await t.test(`color ${color}, depth ${depth}, interlace ${interlace}`, async () => {
      const original = fixture({ width: 9, height: 9, color, depth, interlace, extras: [chunk('tEXt', Buffer.from('Author\0QA'))] }).bytes;
      const before = Buffer.from(original), expected = PNG.load(original);
      const prepared = await preparePngForEmbedding(original);
      assert.deepEqual(original, before, 'Original stored/uploaded bytes remain unchanged');
      const actual = PNG.load(prepared);
      assert.deepEqual(actual.rgbChannel, expected.rgbChannel);
      assert.deepEqual(actual.alphaChannel, expected.alphaChannel);
      assert.deepEqual([actual.width, actual.height], [9,9]);
      assert.equal(chunkTypes(Buffer.from(prepared)).includes('tEXt'), false);
      if (color === 3) assert.deepEqual(chunkTypes(Buffer.from(prepared)), ['IHDR','PLTE','tRNS','IDAT','IEND']);
      const pdf = await PDFDocument.create(), image = await pdf.embedPng(prepared);
      assert.deepEqual([image.width,image.height], [9,9]);
      assert.ok((await pdf.save()).length > 0);
    });
  }
});

test('tiny Adam7 images skip empty passes and keep exact standalone bytes', async () => {
  for (const [width,height] of [[1,1],[1,2],[2,1],[3,2]]) {
    const original = fixture({ width,height,interlace:1 }).bytes;
    const pool = Buffer.alloc(original.length+20); original.copy(pool,7);
    const prepared = await preparePngForEmbedding(pool.subarray(7,7+original.length));
    assert.equal(prepared.byteOffset,0); assert.equal(prepared.buffer.byteLength,original.length);
    assert.deepEqual(Buffer.from(prepared),original);
    const pdf = await PDFDocument.create(), image = await pdf.embedPng(prepared);
    assert.deepEqual([image.width,image.height],[width,height]);
    prepared[0] = 0;
    assert.equal(pool[7],137,'Returned bytes do not alias stored input');
  }
});

test('native PNG boundary rejects invalid, truncated, trailing and over-expanded IDAT', async t => {
  const { raw } = fixture(), valid = deflateSync(raw), badHeader = Buffer.from(valid), badChecksum = Buffer.from(valid);
  badHeader[0] ^= 1; badChecksum[badChecksum.length-1] ^= 1;
  const badFilter = Buffer.from(raw); badFilter[0] = 5;
  const cases = [
    ['incomplete dynamic table',invalidCompressed()],
    ['invalid zlib header',fixture({compressed:badHeader}).bytes],
    ['invalid checksum',fixture({compressed:badChecksum}).bytes],
    ['truncated stream',fixture({compressed:valid.subarray(0,-1)}).bytes],
    ['too few scanline bytes',fixture({compressed:deflateSync(raw.subarray(0,-1))}).bytes],
    ['extra scanline bytes',fixture({compressed:deflateSync(Buffer.concat([raw,Buffer.from([0])]))}).bytes],
    ['over-expanded stream',fixture({compressed:deflateSync(Buffer.alloc(65536))}).bytes],
    ['invalid filter',fixture({compressed:deflateSync(badFilter)}).bytes],
    ['trailing compressed garbage',fixture({compressed:Buffer.concat([valid,Buffer.from([0])])}).bytes],
    ['second compressed stream',fixture({compressed:Buffer.concat([valid,valid])}).bytes],
    ['header/data dimensions mismatch',fixture({width:2,compressed:valid}).bytes],
  ];
  const adam7 = fixture({width:9,height:9,interlace:1});
  const badPass = Buffer.from(adam7.raw); badPass[adam7.filterOffsets.at(-1)] = 5;
  cases.push(['invalid last Adam7 filter',fixture({width:9,height:9,interlace:1,compressed:deflateSync(badPass)}).bytes]);
  for (const [name,bytes] of cases) await t.test(name, async () => {
    assert.equal(validateLogoBytes(bytes).format,'png','Container alone is structurally valid');
    await assert.rejects(preparePngForEmbedding(bytes),/Nieprawidłowe dane/);
  });
});

test('PDF preparation preserves grayscale/RGB transparency and rejects invalid transparency chunks', async () => {
  for (const [color,length] of [[0,2],[2,6]]) {
    const bytes = fixture({color,extras:[chunk('tRNS',Buffer.alloc(length))]}).bytes;
    const prepared = await preparePngForEmbedding(bytes);
    assert.deepEqual(PNG.load(prepared).alphaChannel,PNG.load(bytes).alphaChannel);
    assert.ok(chunkTypes(Buffer.from(prepared)).includes('tRNS'));
  }
  for (const bytes of [
    fixture({extras:[chunk('tRNS',Buffer.alloc(2))]}).bytes,
    fixture({color:0,extras:[chunk('tRNS',Buffer.alloc(1))]}).bytes,
    fixture({color:0,extras:[chunk('tRNS',Buffer.from([1,0]))]}).bytes,
    fixture({color:2,extras:[chunk('tRNS',Buffer.alloc(6)),chunk('tRNS',Buffer.alloc(6))]}).bytes,
    fixture({color:3,extras:[chunk('tRNS',Buffer.alloc(5))]}).bytes,
    fixture({color:2,afterData:[chunk('tRNS',Buffer.alloc(6))]}).bytes,
  ]) await assert.rejects(preparePngForEmbedding(bytes),/Nieprawidłowe dane/);
});

test('PDF preparation strips unused metadata while preserving palette and IDAT bytes', async () => {
  const text = chunk('iTXt',Buffer.from('Title\0\0\0\0\0QA'));
  const bytes = fixture({color:3,extras:[text,chunk('gAMA',Buffer.from([0,0,177,143]))]}).bytes;
  const prepared = Buffer.from(await preparePngForEmbedding(bytes));
  assert.deepEqual(chunkTypes(prepared),['IHDR','PLTE','tRNS','IDAT','IEND']);
  assert.deepEqual(PNG.load(prepared).rgbChannel,PNG.load(bytes).rgbChannel);
});

test('inline storage boundary returns field errors and skips absent, JPEG and remote logos', async () => {
  await assert.rejects(validateInlineLogoForStorage(url(invalidCompressed())),error => error.status === 400 && error.code === 'FIELD_INVALID' && typeof error.fieldErrors.logoUrl === 'string');
  for (const value of [undefined,null,'','https://cdn.example.test/logo.png','data:image/jpeg;base64,already-validated-by-shared-parser']) await validateInlineLogoForStorage(value);
  const original = url(fixture().bytes);
  await validateInlineLogoForStorage(original);
  assert.equal(original,url(fixture().bytes));
});

function profileRoute(method, { user = {id:'a'.repeat(24),name:'QA',email:'qa@example.test'}, existing = true } = {}) {
  const routePath = require.resolve(method === 'POST' ? '../../src/app/api/companies/route.ts' : '../../src/app/api/companies/[id]/route.ts');
  const prior = require.cache[routePath], originalLoad = Module._load, writes = [], reads = [], audits = [];
  const company = {id:'b'.repeat(24),userId:'a'.repeat(24),companyName:'QA',nip:'5260301706',isDefault:true,createdAt:new Date(0),updatedAt:new Date(0),logoUrl:null};
  const profile = {
    findFirst: async args => { reads.push(args); return args.where.id && existing ? company : null; },
    findMany: async () => [], count: async () => 0,
    create: async args => { writes.push(['create',args.data]); return {...company,...args.data}; },
    update: async args => { writes.push(['update',args.data]); return {...company,...args.data}; },
    updateMany: async args => { writes.push(['updateMany',args.data]); return {count:0}; },
  };
  const db = {companyProfile:profile,$transaction:async callback => callback({companyProfile:profile})};
  delete require.cache[routePath];
  Module._load = function(request,parent,isMain) {
    if (request === '@/lib/auth') return {getSessionUser:async () => user};
    if (request === '@/lib/db') return {prisma:db};
    if (request === '@/lib/audit') return {recordAuditLog:async args => audits.push(args),buildFieldDiff:() => ({diff:[]})};
    if (request === '@/lib/permissions') return {DEFAULT_ROLE_PERMISSIONS:{owner:{}},getCompanyMembership:async () => null};
    if (request === '@/lib/security-policy') return {requireRecentAuth:async () => {}};
    return originalLoad.call(this,request,parent,isMain);
  };
  let route;
  try { route = require(routePath); }
  finally { Module._load = originalLoad; if (prior) require.cache[routePath] = prior; else delete require.cache[routePath]; }
  return {writes,reads,audits,run:body => route[method](new Request('https://example.test/api/companies',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id:company.id})})};
}

test('company POST/PUT reject compressed PNG before database writes and return logoUrl errors', async t => {
  for (const method of ['POST','PUT']) await t.test(method,async () => {
    const fixture = profileRoute(method), response = await fixture.run({companyName:'QA',nip:'5260301706',logoUrl:url(invalidCompressed())});
    assert.equal(response.status,400);
    const body = await response.json(); assert.equal(body.code,'FIELD_INVALID'); assert.equal(typeof body.fieldErrors.logoUrl,'string');
    assert.deepEqual(fixture.writes,[]); assert.deepEqual(fixture.audits,[]);
  });
});

test('company POST/PUT retain original valid PNG and existing absent/remote behavior', async t => {
  const valid = url(fixture({extras:[chunk('tEXt',Buffer.from('Author\0QA'))]}).bytes);
  for (const method of ['POST','PUT']) for (const logoUrl of [valid,null,'https://cdn.example.test/logo.png']) await t.test(`${method} ${logoUrl === valid ? 'inline' : logoUrl === null ? 'absent' : 'remote'}`,async () => {
    const fixture = profileRoute(method), response = await fixture.run({companyName:'QA',nip:'5260301706',...(logoUrl === null ? {} : {logoUrl})});
    assert.equal(response.status,method === 'POST' ? 201 : 200);
    assert.equal(fixture.writes.length,1); assert.equal(fixture.writes[0][1].logoUrl,logoUrl); assert.equal(fixture.audits.length,1);
  });
});

test('company PNG validation preserves authentication and ownership refusals', async () => {
  for (const method of ['POST','PUT']) {
    const fixture = profileRoute(method,{user:null});
    const response = await fixture.run({companyName:'QA',nip:'5260301706',logoUrl:url(invalidCompressed())});
    assert.equal(response.status,401); assert.deepEqual(fixture.writes,[]); assert.deepEqual(fixture.audits,[]);
  }
  const fixture = profileRoute('PUT',{existing:false});
  assert.equal((await fixture.run({companyName:'QA',nip:'5260301706',logoUrl:url(invalidCompressed())})).status,404);
  assert.deepEqual(fixture.writes,[]);
});
