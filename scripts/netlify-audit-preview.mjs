import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const isAudit = process.env.CONTEXT === 'deploy-preview' && process.env.REVIEW_ID === '24';
if (isAudit) {
  const env = {};
  for (const key of ['PATH','HOME','TMPDIR','TEMP','TMP','LANG','LC_ALL','NODE_EXTRA_CA_CERTS','LD_LIBRARY_PATH']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {CI:'true',NEXT_TELEMETRY_DISABLED:'1',SKIP_BROWSER_CHECKS:'1'});
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
  // Use only existing Git checkout credentials; never extract or log them.
  // If the checkout is read-only, reporting is skipped and the failed build stays failed.
  async function publishReport() {
    const gitEnv={...process.env,GIT_TERMINAL_PROMPT:'0',GIT_AUTHOR_NAME:'Codex',GIT_AUTHOR_EMAIL:'codex@users.noreply.github.com',GIT_COMMITTER_NAME:'Codex',GIT_COMMITTER_EMAIL:'codex@users.noreply.github.com',GIT_INDEX_FILE:'/tmp/fakturaprosto-audit-index-'+process.pid};
    const git=async(args,input)=>{const r=await command('git',args,{env:gitEnv,quiet:true,input});if(r.code!==0)throw new Error('Git report operation failed');return r.output.trim();};
    const remote=await git(['remote','get-url','origin']);
    if(!remote.includes('svein31/faktura-tata-sierpienm'))throw new Error('Unexpected report repository');
    const head=await git(['rev-parse','HEAD']);if(!/^[a-f0-9]{40}$/.test(head))throw new Error('Invalid checkout');
    report.sourceSha=report.sourceSha||head;
    if(!/^[a-f0-9]{40}$/.test(report.sourceSha))throw new Error('Invalid report source');
    try {report.http=JSON.parse(await readFile('artifacts/functional/http-audit.json','utf8'));} catch {}
    const blob=await git(['hash-object','-w','--stdin'],JSON.stringify(report,null,2));
    await git(['read-tree','HEAD']);
    await git(['update-index','--add','--cacheinfo','100644,'+blob+',docs/audit/2026-09-30/netlify-result.json']);
    const tree=await git(['write-tree']);
    const commit=await git(['commit-tree',tree,'-p',head], 'chore: save isolated functional audit result\n');
    const site=(process.env.SITE_ID||'preview').replace(/[^a-zA-Z0-9-]/g,'').slice(0,80);
    const branch='audit-results/'+report.sourceSha+'/'+site;
    await git(['push','origin',commit+':refs/heads/'+branch]);
    console.log('[audit-preview] Diagnostic result saved in '+branch);
  }
  let failure;
  try {
    // Unit phase: XSD validation requires lxml; MongoDB and browsers remain separate.
    await run('npm',['run','typecheck']);
    await run('npm',['run','lint']);
    await run('node',['--test','scripts/tests/business-document-validation.test.cjs','scripts/tests/email-template.test.cjs','scripts/tests/invoice-input-boundaries.test.cjs']);
    await run('python3',['-m','venv','/tmp/fakturaprosto-audit-python']);
    await run('/tmp/fakturaprosto-audit-python/bin/pip',['install','lxml==6.0.2']);
    env.PATH='/tmp/fakturaprosto-audit-python/bin:'+env.PATH;
    await run('npm',['test']);
    report.ok=true;
  } catch(error) {failure=error;report.error=error.message;}
  await publishReport().catch(()=>console.log('[audit-preview] Checkout does not permit publishing a diagnostic result'));
  if(failure)throw failure;
  console.log('[audit-preview] PASS typecheck, lint and all unit tests');
} else {
  console.log('[audit-preview] Standard preview build');
}
