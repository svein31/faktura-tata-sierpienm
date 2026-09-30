import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

// Run the fallback only on this audit PR and one preview site.
const isAudit = process.env.CONTEXT === 'deploy-preview' &&
  process.env.BRANCH === 'codex/full-functional-audit-20260930' &&
  (process.env.SITE_NAME === 'faktura-tata' || (process.env.DEPLOY_PRIME_URL || '').includes('--faktura-tata.netlify.app'));
if (isAudit) {
  // Do not pass production database/provider credentials to test processes.
  const env = {};
  for (const key of ['PATH','HOME','TMPDIR','TEMP','TMP','LANG','LC_ALL','NODE_EXTRA_CA_CERTS','LD_LIBRARY_PATH']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, { CI:'true', NEXT_TELEMETRY_DISABLED:'1', RUN_ALL_MOBILE_CHECKS:'1', RUN_WEBKIT_CHECKS:'1' });
  const run = (command,args,extra={}) => new Promise((resolve,reject)=>{
    const child=spawn(command,args,{env:{...env,...extra},stdio:'inherit'});
    child.once('error',reject);
    child.once('exit',(code,signal)=>code===0?resolve():reject(new Error(command+' failed: '+(signal||code))));
  });
  console.log('[audit-preview] Running isolated unit, HTTP and browser checks');
  await run('python3',['-m','venv','/tmp/fakturaprosto-audit-python']);
  await run('/tmp/fakturaprosto-audit-python/bin/pip',['install','lxml==6.0.2']);
  env.PATH='/tmp/fakturaprosto-audit-python/bin:'+env.PATH;
  await run('npx',['playwright','install','--with-deps','chromium','webkit']);
  for(const script of ['typecheck','lint','test','test:integration']) await run('npm',['run',script]);
  assert.equal(env.DATABASE_URL,undefined);
  console.log('[audit-preview] PASS all isolated verification checks');
} else {
  console.log('[audit-preview] Standard preview build; audit fallback not selected');
}
