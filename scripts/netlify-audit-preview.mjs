import { spawn } from 'node:child_process';

const isAudit = process.env.CONTEXT === 'deploy-preview' && process.env.REVIEW_ID === '24';
if (isAudit) {
  const env = {};
  for (const key of ['PATH','HOME','TMPDIR','TEMP','TMP','LANG','LC_ALL','NODE_EXTRA_CA_CERTS','LD_LIBRARY_PATH']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {CI:'true',NEXT_TELEMETRY_DISABLED:'1',SKIP_BROWSER_CHECKS:'1',MONGOMS_DOWNLOAD_IGNORE_MISSING_HEADER:'true',MONGOMS_DISTRO:'ubuntu-22.04'});
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
    // Unit phase: XSD validation requires lxml; MongoDB and browsers remain separate.
    await run('npm',['run','typecheck']);
    await run('npm',['run','lint']);
    await run('node',['--test','scripts/tests/business-document-validation.test.cjs','scripts/tests/email-template.test.cjs','scripts/tests/invoice-input-boundaries.test.cjs']);
    await run('python3',['-m','venv','/tmp/fakturaprosto-audit-python']);
    await run('/tmp/fakturaprosto-audit-python/bin/pip',['install','lxml==6.0.2']);
    env.PATH='/tmp/fakturaprosto-audit-python/bin:'+env.PATH;
    await run('npm',['test']);
    await run('node',['--input-type=module','-e',`
      import { MongoMemoryReplSet } from 'mongodb-memory-server';
      import { MongoClient } from 'mongodb';
      const replica = await MongoMemoryReplSet.create({replSet:{count:1,storageEngine:'wiredTiger'}});
      const client = new MongoClient(replica.getUri());
      try { await client.connect(); await client.db('audit').command({ping:1}); }
      finally { await client.close(); await replica.stop(); }
      console.log('PASS isolated MongoDB startup');
    `]);
    report.ok=true;
  } catch(error) {failure=error;report.error=error.message;}
  if(failure)throw failure;
  console.log('[audit-preview] PASS typecheck, lint, all unit tests and isolated MongoDB startup (HTTP integration remains pending)');
} else {
  console.log('[audit-preview] Standard preview build');
}
