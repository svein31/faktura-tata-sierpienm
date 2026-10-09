import { createHash } from 'node:crypto';

const categories=['authorized','unauthorized','cross-tenant','csrf','invalid-json','extreme-input','success','failure'];
export const apiCatalogFingerprint=api=>createHash('sha256').update(JSON.stringify(api.map(route=>({path:route.route,methods:route.methods})))).digest('hex');
const escaped=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const matcher=route=>new RegExp('^'+route.split('/').map(segment=>/^\[\.\.\.[^\]]+\]$/.test(segment)?'.+':/^\[[^\]]+\]$/.test(segment)?'[^/]+':escaped(segment)).join('/')+'$');
const specificity=route=>route.split('/').filter(segment=>segment && !segment.startsWith('[')).length;

/** Report attribution is intentionally stricter than a generic HTTP smoke run. */
export function applyApiRuntimeEvidence(inventory,report,currentBuildId) {
  const expectedCatalog=apiCatalogFingerprint(inventory.api);
  if(!report.sourceSha256 || report.sourceSha256!==inventory.sourceSha256 || !report.buildId || report.buildId!==currentBuildId || report.routeCatalogSha256!==expectedCatalog) {
    return {status:'ignored-stale-or-unidentified-report',expectedSourceSha256:inventory.sourceSha256,receivedSourceSha256:report.sourceSha256 || null,expectedBuildId:currentBuildId || null,receivedBuildId:report.buildId || null,expectedCatalogSha256:expectedCatalog,receivedCatalogSha256:report.routeCatalogSha256 || null};
  }
  let matched=0,smoke=0,targeted=0,unmatched=0,failed=0;
  for(const result of report.results || []) {
    let pathname;try{pathname=new URL(result.path,'http://127.0.0.1').pathname;}catch{unmatched++;continue;}
    let candidates=inventory.api.filter(route=>route.methods.includes(result.method) && route.route===pathname);
    if(!candidates.length) {
      candidates=inventory.api.filter(route=>route.methods.includes(result.method) && matcher(route.route).test(pathname));
      const max=Math.max(...candidates.map(route=>specificity(route.route)));
      candidates=candidates.filter(route=>specificity(route.route)===max);
    }
    if(candidates.length!==1){unmatched++;continue;}
    const route=candidates[0];matched++;
    route.methodChecks ??= Object.fromEntries(route.methods.map(method=>[method,Object.fromEntries(categories.map(category=>[category,'unverified']))]));
    route.runtimeEvidence ??= {buildId:report.buildId,sourceSha256:report.sourceSha256,methods:{}};
    const evidence={label:result.label,path:result.path,status:result.status ?? null,actor:result.actor || 'unidentified',assertion:result.assertion || 'unidentified',expected:result.expected || null,statusVerified:false};
    (route.runtimeEvidence.methods[result.method] ??= []).push(evidence);
    if(result.ok!==true || !Number.isInteger(result.status)){failed++;evidence.outcome='failed-request';continue;}
    if(result.assertion!=='expected-status' || !Array.isArray(result.expected) || !result.expected.length || !result.expected.includes(result.status)) {
      smoke++;evidence.outcome='observed-smoke-only';
      if(route.status==='source-discovered')route.status='source-and-http-smoke-observed';
      continue;
    }
    targeted++;evidence.statusVerified=true;evidence.outcome='checked-targeted-http-status';
    route.status='source-and-targeted-http-checked';
    const mark=category=>{route.methodChecks[result.method][category]='checked-targeted-http-scenario';route.checks[category]='checked-in-some-methods-see-methodChecks';};
    const negative=result.expected.every(status=>status>=400 && status<500);
    const positive=result.expected.every(status=>status>=200 && status<300);
    if(positive) {
      mark('success');
      if(result.actor==='fixture-owner' || result.actor==='fixture-other')mark('authorized');
    }
    if(negative)mark('failure');
    if(negative && result.actor==='anonymous' && /requires login|anonymous route boundary/i.test(result.label) && result.expected.every(status=>[401,403].includes(status)))mark('unauthorized');
    if(negative && result.actor==='fixture-other' && /outsider|revoked|permission|read-only/i.test(result.label) && result.expected.every(status=>[403,404].includes(status)))mark('cross-tenant');
    if(/overflow|excessive|negative|fractional|half-up/i.test(result.label))mark('extreme-input');
    if(negative && /invalid json|malformed json/i.test(result.label))mark('invalid-json');
    if(negative && /csrf|cross-origin/i.test(result.label) && result.expected.every(status=>[400,403].includes(status)))mark('csrf');
  }
  return {status:'applied-exact-method-route-evidence',buildId:report.buildId,sourceSha256:report.sourceSha256,routeCatalogSha256:expectedCatalog,reportChecks:(report.results || []).length,matched,smokeObservations:smoke,targetedStatusChecks:targeted,failedRequests:failed,unmatched,reportFailures:(report.failures || []).length,routesObserved:inventory.api.filter(route=>route.runtimeEvidence).length,routesWithTargetedChecks:inventory.api.filter(route=>route.status==='source-and-targeted-http-checked').length,scope:'A checked category proves only listed cases/methods; a generic response below 500 proves no access boundary or successful business operation.'};
}
