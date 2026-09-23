require('../register-ts.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseImportCsv } = require('../../src/lib/csv-import.ts');

test('CSV import reads UTF-8 BOM, semicolons, escaped quotes and embedded newlines', () => {
  const csv = '\uFEFFNazwa;NIP;Miasto\r\n"Firma ""A""; Poznań";1234563218;Poznań\r\n"B\nC";5250001003;Warszawa\r\n';
  assert.deepEqual(parseImportCsv(csv), { headers: ['Nazwa', 'NIP', 'Miasto'], rows: [['Firma "A"; Poznań', '1234563218', 'Poznań'], ['B\nC', '5250001003', 'Warszawa']] });
});
test('CSV import rejects broken quoting, inconsistent rows and large batches', () => {
  assert.throws(() => parseImportCsv('name,nip\n"broken,5250001003'), /Niezamknięte/);
  assert.throws(() => parseImportCsv('name,nip\nOnly name'), /różną liczbę/);
  assert.throws(() => parseImportCsv('name,nip\n' + 'a,1234563218\n'.repeat(201)), /200/);
});
