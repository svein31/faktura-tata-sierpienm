require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { buildKsefVerificationUrl, buildKsefOfflineCertUrl, calculateXmlDigestBase64Url } = require('../../src/lib/ksef/qr.ts');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), {execFileSync} = require('node:child_process');

test('KSeF verification hash covers exact XML bytes, including whitespace', () => {
  const xml = '<Fa>ąć</Fa>\n';
  const digest = crypto.createHash('sha256').update(Buffer.from(xml, 'utf8')).digest('base64url');
  assert.equal(calculateXmlDigestBase64Url(xml), digest);
  assert.equal(buildKsefVerificationUrl({ sellerNip: '123-456-78-90', issueDate: '2026-09-23', xmlContent: xml, environment: 'test' }), `https://qr-test.ksef.mf.gov.pl/invoice/1234567890/23-09-2026/${digest}`);
  assert.notEqual(calculateXmlDigestBase64Url(xml), calculateXmlDigestBase64Url(xml.trim()));
});

test('missing XML and unsigned offline certificate never produce plausible QR URLs', () => {
  const params = { sellerNip: '1234567890', issueDate: '2026-09-23' };
  assert.throws(() => buildKsefVerificationUrl(params), /XML/);
  assert.throws(() => buildKsefOfflineCertUrl({ ...params, xmlContent: '<Fa/>' }), /certyfikatem/);
});

test('Kod II signs the official path with the matching private key and exact XML digest', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ksef-qr-'));
  try {
    const certFile=path.join(dir,'cert.pem'), keyFile=path.join(dir,'key.pem');
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-sha256','-nodes','-keyout',keyFile,'-out',certFile,'-days','1','-subj','/CN=Synthetic test'],{stdio:'ignore'});
    const certificatePem=fs.readFileSync(certFile,'utf8'),privateKeyPem=fs.readFileSync(keyFile,'utf8');
    const url=buildKsefOfflineCertUrl({sellerNip:'1111111111',issueDate:'2026-09-23',xmlContent:'<Fa/>\n',environment:'test',contextType:'Nip',contextValue:'1111111111',certificatePem,privateKeyPem});
    const parts=url.slice('https://'.length).split('/');
    assert.equal(parts[0],'qr-test.ksef.mf.gov.pl');
    assert.deepEqual(parts.slice(1,5),['certificate','Nip','1111111111','1111111111']);
    assert.equal(parts[6],calculateXmlDigestBase64Url('<Fa/>\n'));
    const signed=url.slice('https://'.length).slice(0,-parts[7].length-1);
    const cert=new crypto.X509Certificate(certificatePem);
    assert.equal(crypto.verify('sha256',Buffer.from(signed),{key:cert.publicKey,padding:crypto.constants.RSA_PKCS1_PSS_PADDING,saltLength:32},Buffer.from(parts[7],'base64url')),true);
    assert.equal(crypto.verify('sha256',Buffer.from(signed+'x'),{key:cert.publicKey,padding:crypto.constants.RSA_PKCS1_PSS_PADDING,saltLength:32},Buffer.from(parts[7],'base64url')),false);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
