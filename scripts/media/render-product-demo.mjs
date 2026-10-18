/** Reproducible 1080p product film from real app captures; no paid APIs/assets.
 * Usage: node scripts/media/render-product-demo.mjs [capture-dir] [public-dir]
 * Dependencies: Chromium, ffmpeg/ffprobe, pdftoppm, @playwright/test.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const captures = resolve(process.argv[2] || repo + '/artifacts/product-demo');
const output = resolve(process.argv[3] || repo + '/public/media');
const storyboard = JSON.parse(await readFile(new URL('./demo-storyboard.json', import.meta.url), 'utf8'));
const { width, height, fps, transitionSeconds: transition, scenes } = storyboard;
await mkdir(output, { recursive: true });
await mkdir(captures + '/artboards', { recursive: true });
const run = async (command, args, options = {}) => {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  assert.equal((await once(child, 'exit'))[0], 0, `${command} failed`);
};
await run('pdftoppm', ['-f', '1', '-singlefile', '-scale-to', '1500', '-png', captures + '/demo-invoice.pdf', captures + '/demo-invoice-page']);
const font = (await readFile(repo + '/public/fonts/DejaVuSans.ttf')).toString('base64');
const fontBold = (await readFile(repo + '/public/fonts/DejaVuSans-Bold.ttf')).toString('base64');
const imageData = async name => 'data:image/png;base64,' + (await readFile(captures + '/' + name)).toString('base64');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const mark = `<span class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/></svg><i></i></span>`;
const css = `
@font-face{font-family:Demo;src:url(data:font/ttf;base64,${font})} @font-face{font-family:Demo;src:url(data:font/ttf;base64,${fontBold});font-weight:700}
*{box-sizing:border-box}html,body{width:${width}px;height:${height}px;overflow:hidden;margin:0;font-family:Demo,sans-serif;color:#f7f8ff;background:#080d1c}
.stage{position:relative;width:100%;height:100%;overflow:hidden;background:radial-gradient(ellipse at 82% 45%,#25254e 0,transparent 48%),radial-gradient(ellipse at 15% 95%,#172b46 0,transparent 42%),linear-gradient(135deg,#0c1428,#0b1021 58%,#171328)}
.grid{position:absolute;inset:0;opacity:.2;background-image:linear-gradient(#9aabff18 1px,transparent 1px),linear-gradient(90deg,#9aabff18 1px,transparent 1px);background-size:80px 80px;mask-image:linear-gradient(180deg,transparent,#000 50%,transparent)}
.orb{position:absolute;border-radius:50%;filter:blur(95px);width:520px;height:520px;right:-180px;top:130px;background:#7450ff25}.orb.pink{width:400px;height:400px;right:35%;top:850px;background:#f23aaa16}
header{position:absolute;top:53px;left:86px;right:86px;display:flex;align-items:center;justify-content:space-between;z-index:2}.brand{display:flex;align-items:center;gap:17px;font-size:31px;font-weight:700;letter-spacing:-1px}.mark{display:flex;position:relative;width:54px;height:54px;border-radius:16px;align-items:center;justify-content:center;background:linear-gradient(140deg,#9a80ff,#654cf5 60%,#5145cb);box-shadow:0 6px 30px #6d5eff33,inset 0 1px 1px #ffffff66}.mark svg{width:30px;height:30px}.mark i{position:absolute;right:-3px;bottom:-3px;background:#61dfb4;border:4px solid #0c1428;border-radius:50%;width:18px;height:18px}.header-tag{font-size:15px;letter-spacing:2.8px;color:#a9b5d1;display:flex;align-items:center;gap:13px}.dot{width:7px;height:7px;background:#9b85ff;border-radius:50%;box-shadow:0 0 17px #a892ff88}
.heading{position:absolute;left:90px;top:153px;z-index:2}.heading h1{font-size:49px;letter-spacing:-2.1px;margin:0 0 12px;font-weight:700;line-height:1.17}.heading p{font-size:23px;letter-spacing:-.3px;margin:0;color:#b1bdd7}
.rail{position:absolute;left:93px;top:332px;width:252px;z-index:2}.step{font-size:80px;line-height:1;font-weight:700;letter-spacing:-6px;color:#b5a0ff}.chapter{font-size:13px;letter-spacing:1.8px;margin-top:17px;color:#ced6eb;font-weight:700;line-height:1.7}.rail ul{list-style:none;margin:47px 0 0;padding:0}.rail li{display:flex;align-items:center;gap:11px;font-size:16px;line-height:1.6;margin:19px 0;color:#c6d2ea}.tick{width:22px;height:22px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:8px;background:#7782ff18;color:#ad9cff;border:1px solid #a69aff25;font-size:13px}.note{margin-top:54px;padding:19px 18px;border:1px solid #b2b4ff1c;border-radius:17px;background:linear-gradient(140deg,#a4afff09,#ffffff02);font-size:14px;line-height:1.85;color:#9eacc7}
.window{position:absolute;left:398px;top:290px;width:1432px;height:752px;z-index:2;border-radius:20px;overflow:hidden;background:#0d1220;box-shadow:0 38px 110px #0009,0 0 0 1px #b9b8ff33,inset 0 1px 0 #fff2}.window-bar{height:32px;border-bottom:1px solid #ffffff0a;display:flex;align-items:center;gap:7px;padding-left:17px;background:linear-gradient(90deg,#242a40,#171e31)}.window-bar i{height:6px;width:6px;border-radius:50%;background:#626e88}.window-bar span{font-size:10px;color:#94a0b8;letter-spacing:.5px;position:absolute;left:50%;transform:translateX(-50%)}.window img{display:block;width:100%;height:720px;object-fit:cover;object-position:top center}.window.pdf{background:#192235}.window.pdf .pdf-wrap{height:720px;display:flex;align-items:flex-start;justify-content:center;background:linear-gradient(125deg,#1a253a,#111a2c);padding:25px}.window.pdf img{width:505px;height:auto;max-width:none;box-shadow:0 18px 60px #0008;object-fit:contain}.pdf-context{position:absolute;left:43px;top:125px;width:300px}.pdf-context h2{font-size:24px;line-height:1.5;font-weight:700}.pdf-context p{font-size:17px;line-height:1.85;color:#adbdd8}.pdf-badge{display:inline-block;margin-top:13px;padding:9px 14px;border:1px solid #aca0ff40;border-radius:10px;color:#b9a9ff;background:#9b81ff0c;font-size:14px}.pdf-side{position:absolute;right:42px;top:177px;width:260px;padding:20px;border:1px solid #96acff24;border-radius:17px;background:#a4baff08}.pdf-side strong{display:block;font-size:14px;letter-spacing:.4px;color:#a6bcdf}.pdf-side b{display:block;margin:16px 0 10px;color:#8cdac1;font-size:31px;letter-spacing:-1px}.pdf-side p{font-size:13px;color:#9babca;line-height:1.7}
footer{position:absolute;bottom:19px;left:91px;right:91px;display:flex;align-items:center;justify-content:space-between;z-index:3;font-size:12px;letter-spacing:.35px;color:#8190ad}.footer-line{display:flex;gap:9px;align-items:center}.safe-dot{height:5px;width:5px;background:#6bb6a6;border-radius:100%}.progress{display:flex;gap:7px}.progress i{width:23px;height:3px;background:#62708b44;border-radius:10px}.progress i.current{background:#b09bff;box-shadow:0 0 12px #b09bff40}
.hero-copy{position:absolute;left:98px;top:306px;width:850px;z-index:4}.eyebrow{font-size:16px;letter-spacing:3.3px;font-weight:700;color:#bbaaff;margin-bottom:28px}.hero-copy h1{font-size:105px;line-height:1.07;letter-spacing:-6px;font-weight:700;margin:0;background:linear-gradient(105deg,#fcfdff 15%,#eee8ff 45%,#c8aaff 77%,#faa5dc);background-clip:text;color:transparent}.hero-copy p{font-size:28px;line-height:1.65;color:#adbcd8;max-width:710px;margin:30px 0 0}.hero-window{left:1000px;top:280px;width:1030px;height:625px;transform:perspective(1800px) rotateY(-13deg) rotateZ(1.6deg);border-radius:21px}.hero-window img{height:593px;object-fit:cover;object-position:top left;width:1133px}.hero-line{width:100px;height:3px;background:linear-gradient(90deg,#a38fff,#ec83c5);margin-top:37px;border-radius:8px}.pill{display:inline-flex;align-items:center;gap:13px;margin-top:38px;padding:17px 23px;border:1px solid #c9b7ff44;background:linear-gradient(120deg,#9175ff20,#b386fc0a);box-shadow:0 10px 35px #0002;border-radius:15px;color:#e1d8ff;font-size:19px}.pill svg{width:21px;height:21px}.outro .hero-copy{top:290px;width:1530px;text-align:center;left:195px}.outro .hero-copy h1{font-size:91px;letter-spacing:-4.8px}.outro .hero-copy p{max-width:none;font-size:29px;margin-top:31px}.outro .hero-line{margin:35px auto 0}.outro .pill{margin-top:40px}.url{margin-top:30px;color:#a0aecb;font-size:23px;letter-spacing:1px}.outro .glow-ring{position:absolute;left:650px;top:-460px;width:1250px;height:1250px;border:1px solid #bfa3ff19;border-radius:100%;box-shadow:0 0 0 100px #a39aff03,0 0 0 220px #a39aff03}.hero-foot{position:absolute;left:100px;top:905px;font-size:17px;color:#91a1bd;display:flex;align-items:center;gap:20px}.hero-foot span{width:4px;height:4px;background:#98a6c1;border-radius:100%}
`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  for (const [index, scene] of scenes.entries()) {
    const img = await imageData(scene.image);
    const bar = `<div class="window-bar"><i></i><i></i><i></i><span>fakturaprosto.pl · dane demonstracyjne</span></div>`;
    const footer = `<footer><div class="footer-line"><span class="safe-dot"></span>${escape(storyboard.disclosure)}</div><div class="progress">${scenes.map((_, i) => `<i class="${i === index ? 'current' : ''}"></i>`).join('')}</div><span>fakturaprosto.pl</span></footer>`;
    const heading = `<div class="heading"><h1>${escape(scene.title)}</h1><p>${escape(scene.subtitle)}</p></div>`;
    const rail = `<aside class="rail"><div class="step">${scene.step}</div><div class="chapter">${escape(scene.chapter)}</div><ul>${(scene.bullets || []).map(text => `<li><span class="tick">✓</span>${escape(text)}</li>`).join('')}</ul><div class="note">${escape(scene.note || '')}</div></aside>`;
    let content;
    if (scene.kind === 'intro' || scene.kind === 'outro') {
      const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
      content = `<div class="hero-copy"><div class="eyebrow">${escape(scene.eyebrow)}</div><h1>${escape(scene.title).replaceAll('\n', '<br>')}</h1><p>${escape(scene.subtitle)}</p><div class="hero-line"></div>${scene.kind === 'outro' ? `<div class="pill">Odkryj FakturaProsto ${arrow}</div><div class="url">fakturaprosto.pl</div>` : ''}</div>${scene.kind === 'intro' ? `<div class="window hero-window">${bar}<img src="${img}"></div><div class="hero-foot">Faktury online <span></span> Podgląd PDF <span></span> Korekty</div>` : '<div class="glow-ring"></div>'}`;
    } else if (scene.kind === 'pdf') {
      content = `${heading}${rail}<div class="window pdf">${bar}<div class="pdf-wrap"><img src="${img}"></div><div class="pdf-context"><div class="pdf-badge">RZECZYWISTY EKSPORT PDF</div><h2>Przejrzysty dokument.<br>Każdy szczegół<br>na swoim miejscu.</h2><p>Sprawdź dane, pozycje<br>i termin płatności.</p></div><div class="pdf-side"><strong>FAKTURA DEMONSTRACYJNA</strong><b>1 672,80 zł</b><p>Przykładowa kwota brutto.<br>Film pokazuje dokument<br>wygenerowany w aplikacji.</p></div></div>`;
    } else content = `${heading}${rail}<div class="window">${bar}<img src="${img}"></div>`;
    const html = `<!doctype html><html lang="pl"><meta charset="UTF-8"><style>${css}</style><body><main class="stage ${scene.kind}"><div class="grid"></div><div class="orb"></div><div class="orb pink"></div><header><div class="brand">${mark}FakturaProsto</div><div class="header-tag"><span class="dot"></span>POZNAJ APLIKACJĘ</div></header>${content}${footer}</main></body></html>`;
    await writeFile(`${captures}/artboards/${String(index).padStart(2, '0')}-${scene.id}.html`, html);
    await page.setContent(html); await page.evaluate(() => document.fonts.ready); await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
    await page.screenshot({ path: `${captures}/artboards/${String(index).padStart(2, '0')}-${scene.id}.png` });
  }
} finally { await browser.close(); }

// Original generated ambient score: soft sine partials, slow chord crossfades
// and sparse bells. No samples, voices, third-party music or external services.
const seconds = scenes.reduce((sum, s) => sum + s.seconds, 0) - transition * (scenes.length - 1);
const rate = 48000, frames = Math.ceil(seconds * rate), wav = Buffer.alloc(44 + frames * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
const chords = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 59]];
const hz = note => 440 * 2 ** ((note - 69) / 12);
for (let i = 0; i < frames; i++) {
  const t = i / rate, chordIndex = Math.floor(t / 8) % chords.length, phase = (t % 8) / 8, blend = Math.min(1, phase / .2), fade = Math.min(1, t / 3, (seconds - t) / 4);
  let sample = 0;
  for (let n = 0; n < 4; n++) {
    const prev = hz(chords[(chordIndex + 3) % 4][n]), now = hz(chords[chordIndex][n]);
    sample += .0105 * ((1 - blend) * Math.sin(2 * Math.PI * prev * t) + blend * Math.sin(2 * Math.PI * now * t));
    sample += .0018 * Math.sin(2 * Math.PI * now * 2 * t) * (1 + Math.sin(t * .19 + n));
  }
  const bellTime = t % 4, bellNote = [76, 79, 83, 79, 74, 76, 81, 79][Math.floor(t / 4) % 8];
  sample += .011 * Math.sin(2 * Math.PI * hz(bellNote) * bellTime) * Math.exp(-bellTime * 2.2) * Math.min(1, bellTime * 120);
  wav.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(sample * fade * 32767))), 44 + i * 2);
}
await writeFile(captures + '/original-ambient.wav', wav);

const inputs = scenes.flatMap((scene, i) => ['-loop', '1', '-framerate', String(fps), '-t', String(scene.seconds), '-i', `${captures}/artboards/${String(i).padStart(2, '0')}-${scene.id}.png`]);
// Inputs start at zero. Keep the explicit constant rate after zoompan; FFmpeg
// 7 clears frame-rate metadata on setpts, which xfade correctly rejects.
const filters = scenes.map((scene, i) => `[${i}:v]zoompan=z='1+0.009*on/${scene.seconds * fps}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${width}x${height}:fps=${fps},fps=${fps}[v${i}]`);
let offset = scenes[0].seconds - transition, previous = 'v0';
for (let i = 1; i < scenes.length; i++) { filters.push(`[${previous}][v${i}]xfade=transition=fade:duration=${transition}:offset=${offset.toFixed(3)}[x${i}]`); previous = 'x' + i; offset += scenes[i].seconds - transition; }
filters.push(`[${previous}]fade=t=in:st=0:d=0.4,fade=t=out:st=${(seconds - .7).toFixed(3)}:d=0.7,format=yuv420p[video]`);
const movie = output + '/fakturaprosto-demo.mp4';
await run('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-y', ...inputs, '-i', captures + '/original-ambient.wav', '-filter_complex_threads', '1', '-filter_complex', filters.join(';'), '-map', '[video]', '-map', `${scenes.length}:a`, '-t', String(seconds), '-r', String(fps), '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-maxrate', '1200k', '-bufsize', '2400k', '-pix_fmt', 'yuv420p', '-threads', '2', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-metadata', 'title=FakturaProsto — poznaj aplikację', '-metadata', 'comment=Real application; synthetic demonstration data. Original generated ambient score. No KSeF transmission.', movie]);
await run('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-y', '-i', captures + '/artboards/00-intro.png', '-vf', 'scale=1600:900', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '83', output + '/fakturaprosto-demo.webp']);
const time = seconds => { const ms = Math.round(seconds * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; };
let start = 0, vtt = 'WEBVTT\n\n';
for (const [i, scene] of scenes.entries()) { const end = Math.min(seconds, start + scene.seconds - (i === scenes.length - 1 ? 0 : transition)); vtt += `${i + 1}\n${time(start)} --> ${time(end)}\n${scene.caption}\n\n`; start += scene.seconds - transition; }
await writeFile(output + '/fakturaprosto-demo.pl.vtt', vtt.trimEnd() + '\n');
await writeFile(output + '/fakturaprosto-demo.transcript.txt', storyboard.title + '\n\n' + scenes.map(s => s.caption).join('\n\n') + '\n\n' + storyboard.disclosure + '\nMuzyka: oryginalny, syntetyzowany podkład ambientowy. Film bez lektora.\n');
await run('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-y', '-i', movie, '-vf', `fps=9/${seconds},scale=640:360,tile=3x3`, '-frames:v', '1', captures + '/contact-sheet.jpg']);
const probe = spawn('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', movie], { stdio: ['ignore', 'pipe', 'inherit'] }); let probeText = ''; probe.stdout.on('data', d => probeText += d); assert.equal((await once(probe, 'exit'))[0], 0); const metadata = JSON.parse(probeText);
const video = metadata.streams.find(s => s.codec_type === 'video'), audio = metadata.streams.find(s => s.codec_type === 'audio');
assert.equal(video.codec_name, 'h264'); assert.equal(video.width, width); assert.equal(video.height, height); assert.equal(video.pix_fmt, 'yuv420p'); assert.equal(audio.codec_name, 'aac'); assert.ok(Math.abs(Number(metadata.format.duration) - seconds) < .1); assert.ok((await stat(movie)).size < 12 * 1024 * 1024, 'Keep the film small enough for an optional on-demand tutorial');
await writeFile(captures + '/render-manifest.json', JSON.stringify({ ...JSON.parse(await readFile(captures + '/capture-manifest.json', 'utf8')), renderedAt: new Date().toISOString(), durationSeconds: Number(metadata.format.duration), width, height, fps, video: video.codec_name, audio: audio.codec_name, byteLength: (await stat(movie)).size, sha256: createHash('sha256').update(await readFile(movie)).digest('hex'), originalAudio: 'Generated sine-wave ambient score, no samples or voice', captions: 'Polish WebVTT', storyboard: 'scripts/media/demo-storyboard.json' }, null, 2));
console.log('[product-film] PASS: ' + seconds + ' s, 1920×1080 H.264/AAC, faststart, Polish captions; ' + (await stat(movie)).size + ' bytes');
