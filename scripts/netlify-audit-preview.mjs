import { spawn } from 'node:child_process';

const isAudit = process.env.CONTEXT === 'deploy-preview' && process.env.REVIEW_ID === '24';
if (isAudit) {
  const env = {};
  for (const key of ['PATH','HOME','TMPDIR','TEMP','TMP','LANG','LC_ALL','NODE_EXTRA_CA_CERTS','LD_LIBRARY_PATH']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {CI:'true',NEXT_TELEMETRY_DISABLED:'1',RUN_ALL_MOBILE_CHECKS:'1',MONGOMS_DOWNLOAD_IGNORE_MISSING_HEADER:'true',MONGOMS_DISTRO:'ubuntu-22.04'});
  const report={sourceSha:process.env.COMMIT_REF,createdAt:new Date().toISOString(),stages:[],ok:false};
  function command(executable,args,options={}) {
    return new Promise((resolve,reject)=>{
      let output='';
      const child=spawn(executable,args,{env:options.env||env,stdio:['pipe','pipe','pipe']});
      const record=chunk=>{const text=chunk.toString();output=(output+text).slice(-60000);if(!options.quiet)process.stdout.write(text);};
      child.stdout.on('data',record);child.stderr.on('data',record);
      child.once('error',reject);
      child.once('exit',(code,signal)=>resolve({code,signal,output}));
      child.stdin.end(options.input||'');
    });
  }
  async function run(executable,args) {
    console.log('[audit-preview-stage] '+executable+' '+args.join(' '));
    const result=await command(executable,args);
    report.stages.push({command:executable,args,ok:result.code===0,code:result.code,output:result.output});
    if(result.code!==0)throw new Error(executable+' failed: '+(result.signal||result.code));
  }
  let failure;
  try {
    // Isolate browser availability before diagnosing UI assertions.
    await run('npx',['playwright','install','chromium']);
    await run('node',['--input-type=module','-e',"import { chromium } from '@playwright/test'; const browser=await chromium.launch({headless:true}); try { const page=await browser.newPage(); await page.setContent('<h1>Chromium smoke test</h1>'); if(await page.locator('h1').textContent()!=='Chromium smoke test') throw new Error('Browser render failed'); console.log('Chromium launch/render PASS'); } finally { await browser.close(); }"]);
    report.ok=true;
  } catch(error) {failure=error;report.error=error.message;}
  if(failure)throw failure;
  console.log('[audit-preview] PASS Chromium installation, launch and render only; full UI assertions remain pending');
} else {
  console.log('[audit-preview] Standard preview build');
}
