/** Build a light poster from an actual synthetic-data app screenshot.
 * Usage: CHROMIUM_EXECUTABLE=/usr/bin/chromium node scripts/media/render-product-poster.mjs capture.png [output.webp]
 * No generated UI, external image services, provider calls or customer data.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import sharp from 'sharp';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
assert.ok(process.argv[2],'Supply a screenshot from the isolated synthetic app');
const source=await readFile(resolve(process.argv[2]));
const output=resolve(process.argv[3]||root+'/public/media/fakturaprosto-demo-poster.webp');
const font=await readFile(root+'/src/app/fonts/fakturaprosto-sans-latin-variable.woff2');
const extended=await readFile(root+'/src/app/fonts/fakturaprosto-sans-extended-variable.woff2');
const html=`<!doctype html><html lang="pl"><meta charset="utf-8"><style>
@font-face{font-family:Product;src:url(data:font/woff2;base64,${font.toString('base64')});font-weight:100 900}
@font-face{font-family:ProductExtended;src:url(data:font/woff2;base64,${extended.toString('base64')});font-weight:100 900}
*{box-sizing:border-box}body{margin:0;width:1600px;height:900px;overflow:hidden;background:#f5f6f8;color:#232830;font-family:Product,ProductExtended,sans-serif}
header{position:absolute;inset:60px 72px auto;display:flex;justify-content:space-between;align-items:center}.brand{font-size:32px;font-weight:700;letter-spacing:-1.1px}.brand small{display:block;margin-top:8px;font-size:14px;font-weight:500;color:#636b79;letter-spacing:.3px}.eyebrow{font-size:13px;font-weight:600;letter-spacing:2px;color:#636b79}
.copy{position:absolute;left:72px;top:260px;width:500px}h1{margin:0;font-size:88px;line-height:1.04;font-weight:650;letter-spacing:-4.5px}.copy p{font-size:27px;line-height:1.6;color:#5f6878;margin:30px 0 0}.features{display:flex;gap:21px;font-size:16px;margin-top:42px;color:#4669a8}.features span+span{border-left:1px solid #ccd1d9;padding-left:21px}
.window{position:absolute;left:620px;top:194px;width:920px;height:560px;border:1px solid #d7dbe2;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 14px 36px #202b3c0b}.window img{display:block;width:100%;height:auto}.window-label{position:absolute;right:24px;top:18px;padding:7px 10px;border:1px solid #d7dbe2;border-radius:6px;background:#fff;font-size:11px;color:#5f6878}
footer{position:absolute;left:72px;right:72px;bottom:54px;border-top:1px solid #d7dbe2;padding-top:24px;display:flex;justify-content:space-between;font-size:15px;color:#636b79}footer strong{color:#4669a8;font-weight:600}
</style><body><header><div class="brand">FakturaProsto<small>VAT &amp; KSeF 2.0</small></div><div class="eyebrow">POZNAJ APLIKACJĘ</div></header><main><div class="copy"><h1>Faktury.<br>Po prostu.</h1><p>Faktury, płatności i KSeF<br>w jednym miejscu.</p><div class="features"><span>Podgląd PDF</span><span>Korekty</span><span>Księgowość</span></div></div><div class="window"><img alt="Aktualny pulpit FakturaProsto na danych demonstracyjnych" src="data:image/png;base64,${source.toString('base64')}"></div></main><footer><span>Rzeczywisty interfejs · Dane demonstracyjne</span><strong>fakturaprosto.pl</strong></footer></body></html>`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,headless:true});
let png;
try{const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});await page.setContent(html);await page.evaluate(()=>Promise.all([document.fonts.ready,...[...document.images].map(i=>i.decode())]));png=await page.screenshot({animations:'disabled'});}finally{await browser.close()}
await mkdir(dirname(output),{recursive:true});await sharp(png).webp({quality:88,effort:6}).toFile(output);
const bytes=await readFile(output),metadata=await sharp(bytes).metadata();assert.equal(metadata.width,1600);assert.equal(metadata.height,900);assert.ok(bytes.length<200000);
await writeFile(output+'.manifest.json',JSON.stringify({generatedAt:new Date().toISOString(),source:'Isolated synthetic-data dashboard screenshot',sourceSha256:createHash('sha256').update(source).digest('hex'),posterSha256:createHash('sha256').update(bytes).digest('hex'),width:1600,height:900,bytes:bytes.length},null,2));
console.log(JSON.stringify({output,width:1600,height:900,bytes:bytes.length}));
