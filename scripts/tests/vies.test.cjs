const test = require('node:test');
const assert = require('node:assert/strict');
require('../register-ts.cjs');
const { checkVies, viesNumber } = require('../../src/lib/vies.ts');
const { validateTaxId } = require('../../src/lib/validation.ts');

const soap = valid => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns:checkVatResponse xmlns:ns="urn:ec.europa.eu:taxud:vies:services:checkVat:types"><ns:countryCode>DE</ns:countryCode><ns:vatNumber>123456789</ns:vatNumber><ns:requestDate>2026-09-23</ns:requestDate><ns:valid>${valid}</ns:valid></ns:checkVatResponse></soap:Body></soap:Envelope>`;

test('VIES request uses fixed official endpoint, normalized VAT and distinguishes inactive from unavailable', async () => {
  let called = 0;
  const transport = async (url, init) => {
    called++;
    assert.equal(url, 'https://ec.europa.eu/taxation_customs/vies/services/checkVatService');
    assert.match(init.body, /<tns:countryCode>DE<\/tns:countryCode><tns:vatNumber>123456789<\/tns:vatNumber>/);
    assert.equal(init.redirect, 'error');
    return new Response(soap('false'), { status: 200 });
  };
  assert.deepEqual(await checkVies('DE 123456789', 'DE', transport), { valid: false, requestDate: '2026-09-23', countryCode: 'DE', vatNumber: '123456789' });
  assert.equal(called, 1);
  await assert.rejects(checkVies('FR123456789', 'DE', transport), e => e.code === 'VIES_COUNTRY_MISMATCH');
  assert.equal(called, 1);
  await assert.rejects(checkVies('DE123456789', 'DE', async () => new Response('<Fault>MS_UNAVAILABLE</Fault>', {status:500})), e => e.code === 'VIES_UNAVAILABLE');
  await assert.rejects(checkVies('DE123456789', 'DE', async () => new Response('<Fault/>', {status:200})), e => e.code === 'VIES_UNAVAILABLE');
  assert.deepEqual(viesNumber('GR123456789', 'GR'), { countryCode: 'EL', vatNumber: '123456789' });
  assert.equal(validateTaxId('FR123456789', 'vat_eu', 'DE').valid, false);
  assert.equal(validateTaxId('DE123456789', 'vat_eu', 'DE').valid, true);
  assert.equal(validateTaxId('DE<bad>', 'vat_eu', 'DE').valid, false);
});
