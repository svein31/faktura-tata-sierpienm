require('../register-ts.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {sanitizeColors,themePalette,contrastRatio,COLOR_TOKENS,colorScope}=require('../../src/lib/theme-colors.ts');
const {normalizeDiagnostic,normalizeSupport,productScreen,diagnosticFingerprint,boundedJson}=require('../../src/lib/product-diagnostics.ts');
const {revenueChartType,revenueDomain,revenuePie}=require('../../src/lib/revenue-chart.ts');
const uuid='5d30bed5-6e50-42dd-af41-751db707071d';
test('custom palettes keep text readable on every editable surface, including conflicting choices',()=>{
  for(let i=0;i<100;i++)for(const mode of ['light','dark']){
    const background='#'+((i*987643)%16777216).toString(16).padStart(6,'0');
    const colors=sanitizeColors({modes:{[mode]:Object.fromEntries(COLOR_TOKENS.map((key,index)=>[key,index%2?'#ffffff':'#000000']))},backgrounds:{[mode]:background},sections:{invoices:{[mode]:{background}}}});
    const p=themePalette(mode,colors,'invoices');
    for(const surface of ['background','card','popover','muted','secondary'])for(const text of ['foreground','card-foreground','popover-foreground','muted-foreground','primary','success','warning','destructive','info','status-paid','status-overdue','finance-income'])assert.ok(contrastRatio(p[surface],p[text])>=4.5,`${i} ${mode} ${surface} ${text}`);
    for(const semantic of ['primary','accent','success','warning','destructive','info'])assert.ok(contrastRatio(p[semantic],p[semantic+'-foreground'])>=4.5);
  }
});
test('scoped colors preserve legacy preferences, reject CSS injection and never cross sections or themes',()=>{
  const p=sanitizeColors({accent:'#4669a8',backgrounds:{dark:'#121212'},modes:{light:{primary:'red;display:none','background':'#ffffff',imaginary:'#123456'}},sections:{invoices:{dark:{primary:'#abcdef'}},public:{dark:{background:'#000000'}}}});
  assert.deepEqual(p.backgrounds,{dark:'#121212'});assert.deepEqual(p.modes,{light:{background:'#ffffff'}});assert.deepEqual(p.sections,{invoices:{dark:{primary:'#abcdef'}}});
  assert.notEqual(themePalette('dark',p,'invoices').primary,themePalette('dark',p,'dashboard').primary);
  assert.equal(colorScope('/invoices/private-id'), 'invoices');assert.equal(colorScope('/portal/private-token'),'global');
});
test('chart domains preserve corrections and pie never turns negative amounts into positive slices',()=>{
 const points=[{key:'a',label:'A',net:-100,gross:-123},{key:'b',label:'B',net:50,gross:61.5}];
 assert.deepEqual(revenueDomain(points),{low:-123,high:61.5,range:184.5});assert.equal(revenuePie(points,'gross').reason,'negative');
 assert.equal(revenuePie(points.map(p=>({...p,net:0,gross:0})),'gross').reason,'empty');
 const pie=revenuePie([{...points[0],net:100,gross:123},{...points[1],net:300,gross:369}],'gross');assert.equal(pie.total,492);assert.deepEqual(pie.shares.map(p=>p.share),[.25,.75]);
 for(const v of ['column','bar','line','pie'])assert.equal(revenueChartType(v),v);assert.equal(revenueChartType('__proto__'),'line');
});
test('diagnostic payloads contain fixed categories and reject URL, stack, message and account data',()=>{
 const sample={kind:'window',name:'HydrationError',screen:'invoice-detail',fingerprint:'1234abcd',revision:'1e59742',device:'mobile',browser:'safari',reactCode:418};assert.deepEqual(normalizeDiagnostic(sample),sample);
 for(const field of ['message','stack','url','userId','invoice','token'])assert.equal(normalizeDiagnostic({...sample,[field]:'private'}),null);
 for(const patch of [{screen:'/invoices/private-id'},{revision:'private-value'},{fingerprint:'<script>'},{reactCode:NaN},{kind:'server'},{name:'Customer name'}])assert.equal(normalizeDiagnostic({...sample,...patch}),null);
 assert.equal(productScreen('/invoices/a-private-id?nip=123'),'invoice-detail');assert.equal(productScreen('/portal/private-token'),'public');assert.equal(diagnosticFingerprint('a'),diagnosticFingerprint('a'));assert.notEqual(diagnosticFingerprint('a'),diagnosticFingerprint('b'));
});
test('support keeps user-entered descriptions separate from automatic technical context',()=>{
 const sample={description:'  Nie mogę otworzyć menu filtrów.  ',category:'problem',screen:'invoices',requestId:uuid};assert.equal(normalizeSupport(sample).description,'Nie mogę otworzyć menu filtrów.');
 for(const patch of [{description:'krótki'},{description:'x'.repeat(2001)},{requestId:'x'},{incident:'an-invoice-id'},{category:'admin'},{userId:'another-user'},{attachments:['private']}])assert.equal(normalizeSupport({...sample,...patch}),null);
});
test('bounded JSON checks actual bytes, accepts multibyte Polish and rejects oversized streams without a header',async()=>{
 const text=JSON.stringify({description:'Płatność za usługę'});assert.deepEqual(await boundedJson(new Request('http://example.test',{method:'POST',body:text}),200),JSON.parse(text));
 await assert.rejects(boundedJson(new Request('http://example.test',{method:'POST',body:'x'.repeat(120)}),100),/body_limit/);
});
test('availability probe detects HTML, database and transport failures with redirects disabled',async()=>{
 const {availabilityProbe}=await import('../ops/availability-core.mjs');
 const calls=[];const good=await availabilityProbe('https://example.test',async(url,init)=>{calls.push({url:String(url),init});return new Response(url.pathname==='/'?'<html></html>':JSON.stringify({ok:true,db:'ok',revision:'1e59742'}),{headers:{'content-type':url.pathname==='/'?'text/html':'application/json'}})});
 assert.equal(good.ok,true);assert.ok(calls.every(c=>c.init.redirect==='error'));
 const bad=await availabilityProbe('https://example.test',async()=>new Response('{}',{status:503}));assert.equal(bad.ok,false);
 await assert.rejects(availabilityProbe('http://example.test'),/HTTPS/);await assert.rejects(availabilityProbe('https://user:password@example.test'),/HTTPS/);
});
test('onboarding report does not call a saved draft an issued invoice and exposes small samples',async()=>{
 const {onboardingSummary}=await import('../ops/onboarding-report-core.mjs');const r=onboardingSummary({registered:20,opened:10,drafted:8,issued:2});assert.equal(r.steps[2].completed,2);assert.equal(r.steps[1].completed,8);assert.equal(r.suggestedInvestigation,'registration_to_editor');assert.equal(onboardingSummary().suggestedInvestigation,'insufficient_samples');assert.equal(onboardingSummary().steps[0].conversion,null);
});
test('server diagnostic sink receives only safe metadata and its failure cannot replace the original incident',()=>{
 const {reportUnexpectedError}=require('../../src/lib/error-report.ts');const previous=globalThis.fakturaprostoErrorSink,log=console.error;const events=[];console.error=()=>{};
 try{globalThis.fakturaprostoErrorSink=event=>events.push(event);const incident=reportUnexpectedError(new Error('PRIVATE_CUSTOMER_DESCRIPTION'));assert.equal(events.length,1);assert.equal(events[0].incident,incident);assert.ok(!JSON.stringify(events).includes('PRIVATE_CUSTOMER_DESCRIPTION'));globalThis.fakturaprostoErrorSink=()=>{throw new Error('collector unavailable')};assert.doesNotThrow(()=>reportUnexpectedError(new Error('another operation')));}finally{globalThis.fakturaprostoErrorSink=previous;console.error=log;}
});
test('expected framework redirects and access outcomes are distinct from real server failures',()=>{
 const {expectedFrameworkError}=require('../../src/lib/product-diagnostics.ts');for(const digest of ['NEXT_REDIRECT;replace;/login;307;','NEXT_HTTP_ERROR_FALLBACK;404','NEXT_HTTP_ERROR_FALLBACK;403'])assert.equal(expectedFrameworkError({digest}),true);for(const error of [new Error('NEXT_REDIRECT'),{digest:'real-server-failure'},null,{digest:42},{digest:'NEXT_HTTP_ERROR_FALLBACK;500'}])assert.equal(expectedFrameworkError(error),false);
});
