import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { chromium } from '@playwright/test';
const root = process.cwd(), bytes = await readFile(root + '/public/media/fakturaprosto-demo.mp4');
const boxes=[];let offset=0;while(offset+8<=bytes.length){const size=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);assert.ok(size>=8);boxes.push({type,offset,size});offset+=size;}
assert.ok(boxes.find(x=>x.type==='moov').offset<boxes.find(x=>x.type==='mdat').offset,'MP4 must have faststart metadata');
const ranges=[],errors=[];
const server=createServer(async(req,res)=>{try{const file=req.url==='/movie'?'/public/media/fakturaprosto-demo.mp4':req.url==='/captions'?'/public/media/fakturaprosto-demo.pl.vtt':null;
if(!file){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><html lang="pl"><button id="play">Odtwórz</button><video controls width="1280" height="720" preload="none"><source src="/movie" type="video/mp4"><track default kind="captions" srclang="pl" label="Polski" src="/captions"></video><script>document.querySelector("button").onclick=()=>document.querySelector("video").play()</script></html>');}
const path=root+file,info=await stat(path);res.setHeader('Content-Type',file.endsWith('.mp4')?'video/mp4':'text/vtt; charset=utf-8');res.setHeader('Accept-Ranges','bytes');
if(req.headers.range){ranges.push(req.headers.range);const m=/bytes=(\d+)-(\d*)/.exec(req.headers.range);const start=Number(m[1]),end=m[2]?Number(m[2]):info.size-1;res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${info.size}`,'Content-Length':end-start+1});return createReadStream(path,{start,end}).pipe(res);}
res.setHeader('Content-Length',info.size);createReadStream(path).pipe(res);
}catch(e){res.writeHead(500);res.end(e.message);}});
server.listen(0,'127.0.0.1');await once(server,'listening');let browser;
try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});const page=await browser.newPage({viewport:{width:1320,height:800}});page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByRole('button',{name:'Odtwórz'}).click();await page.waitForFunction(()=>{const v=document.querySelector('video');return v.readyState>=3&&v.videoWidth===1920&&v.currentTime>0;});
const initial=await page.locator('video').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,error:v.error?.message??null,audioTracks:v.webkitAudioDecodedByteCount??null}));assert.ok(Math.abs(initial.duration-69.8)<.1);assert.equal(initial.width,1920);assert.equal(initial.height,1080);assert.equal(initial.error,null);
for (const second of [3, 35, 67]) {
  await page.locator('video').evaluate((v, t) => new Promise((resolve, reject) => {
    v.pause();
    const deadline = setTimeout(() => reject(Error('seek timeout')), 10000);
    // Paused video may deliver its new frame before the seeked listener runs.
    // Register before seeking and assert the actual decoded position below.
    v.addEventListener('seeked', () => { clearTimeout(deadline); resolve(); }, { once: true });
    v.currentTime = t;
  }), second);
  const decoded = await page.locator('video').evaluate(v => ({time: v.currentTime, readyState: v.readyState, error: v.error?.message ?? null}));
  assert.ok(Math.abs(decoded.time - second) < 0.1);
  assert.ok(decoded.readyState >= 2);
  assert.equal(decoded.error, null);
  await page.locator('video').screenshot({path: `${root}/artifacts/product-demo/browser-frame-${second}.png`});
}
await page.waitForFunction(()=>document.querySelector('track').readyState===2);const captions=await page.locator('video').evaluate(v=>({count:v.textTracks[0].cues.length,language:v.textTracks[0].language,first:v.textTracks[0].cues[0].text,last:v.textTracks[0].cues[7].endTime}));assert.equal(captions.count,8);assert.equal(captions.language,'pl');assert.ok(Math.abs(captions.last-69.8)<.1);assert.deepEqual(errors,[]);
await writeFile(root+'/artifacts/product-demo/browser-validation.json',JSON.stringify({status:'PASS',browser:browser.version(),initial,seekSeconds:[3,35,67],captions,pageErrors:errors,rangeRequests:ranges,mp4TopLevelBoxes:boxes},null,2));console.log('[product-film-browser] PASS: H.264/AAC playback, 3/35/67s seeks, 8 Polish captions, faststart; page errors 0');
}finally{await browser?.close();server.close();await once(server,'close');}
