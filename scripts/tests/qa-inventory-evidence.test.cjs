const test=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../audit/api-inventory-evidence.mjs');
const fixture=()=>({sourceSha256:'source-under-test',api:[
  {route:'/api/invoices/[id]',methods:['GET','DELETE'],status:'source-discovered',checks:{authorized:'unverified',unauthorized:'unverified','cross-tenant':'unverified',csrf:'unverified','invalid-json':'unverified','extreme-input':'unverified',success:'unverified',failure:'unverified'}},
  {route:'/api/invoices/search',methods:['GET'],status:'source-discovered',checks:{authorized:'unverified',unauthorized:'unverified','cross-tenant':'unverified',csrf:'unverified','invalid-json':'unverified','extreme-input':'unverified',success:'unverified',failure:'unverified'}},
]});
async function report(inventory,results,patch={}) {
  const {apiCatalogFingerprint}=await load();
  return {sourceSha256:inventory.sourceSha256,buildId:'test-build',routeCatalogSha256:apiCatalogFingerprint(inventory.api),results,failures:[],...patch};
}

test('generic 401 smoke observation never certifies authorization or a successful invoice read',async()=>{
  const inventory=fixture(),{applyApiRuntimeEvidence}=await load();
  const result=applyApiRuntimeEvidence(inventory,await report(inventory,[{label:'anonymous route boundary',method:'GET',path:'/api/invoices/test-id',status:401,ok:true,expected:null,assertion:'no-server-error-smoke',actor:'anonymous'}]),'test-build');
  assert.equal(result.smokeObservations,1);
  assert.equal(result.targetedStatusChecks,0);
  assert.equal(inventory.api[0].methodChecks.GET.unauthorized,'unverified');
  assert.equal(inventory.api[0].methodChecks.GET.success,'unverified');
  assert.equal(inventory.api[0].methodChecks.DELETE.authorized,'unverified');
});

test('literal search route takes precedence over invoice-id template; checks remain method-specific',async()=>{
  const inventory=fixture(),{applyApiRuntimeEvidence}=await load();
  const result=applyApiRuntimeEvidence(inventory,await report(inventory,[{label:'read search results',method:'GET',path:'/api/invoices/search?search=%C5%BC%C3%B3%C5%82%C4%87',status:200,ok:true,expected:[200],assertion:'expected-status',actor:'fixture-owner'}]),'test-build');
  assert.equal(result.targetedStatusChecks,1);
  assert.equal(inventory.api[0].runtimeEvidence,undefined);
  assert.equal(inventory.api[1].methodChecks.GET.success,'checked-targeted-http-scenario');
  assert.equal(inventory.api[1].methodChecks.GET.csrf,'unverified');
});

test('stale source, build or route catalog reports cannot promote checklist states',async()=>{
  const {applyApiRuntimeEvidence}=await load();
  for(const patch of [{sourceSha256:'old-source'},{buildId:'old-build'},{routeCatalogSha256:'old-route-catalog'},{buildId:null}]) {
    const inventory=fixture();
    const result=applyApiRuntimeEvidence(inventory,await report(inventory,[{label:'read invoice',method:'GET',path:'/api/invoices/example',status:200,ok:true,expected:[200],assertion:'expected-status',actor:'fixture-owner'}],patch),'test-build');
    assert.equal(result.status,'ignored-stale-or-unidentified-report');
    assert.equal(inventory.api[0].runtimeEvidence,undefined);
  }
});

test('explicit outsider denial proves its negative case, not owner access or other methods',async()=>{
  const inventory=fixture(),{applyApiRuntimeEvidence}=await load();
  const result=applyApiRuntimeEvidence(inventory,await report(inventory,[{label:'deny outsider invoice read',method:'GET',path:'/api/invoices/example',status:404,ok:true,expected:[404],assertion:'expected-status',actor:'fixture-other'}]),'test-build');
  assert.equal(result.targetedStatusChecks,1);
  assert.equal(inventory.api[0].methodChecks.GET['cross-tenant'],'checked-targeted-http-scenario');
  assert.equal(inventory.api[0].methodChecks.GET.authorized,'unverified');
  assert.equal(inventory.api[0].methodChecks.DELETE['cross-tenant'],'unverified');
});

test('failed or contradictory status evidence cannot be marked checked; unsupported methods remain unmatched',async()=>{
  const inventory=fixture(),{applyApiRuntimeEvidence}=await load();
  const result=applyApiRuntimeEvidence(inventory,await report(inventory,[
    {label:'read invoice',method:'GET',path:'/api/invoices/example',status:500,ok:false,expected:[200],assertion:'expected-status',actor:'fixture-owner'},
    {label:'contradictory read',method:'GET',path:'/api/invoices/example',status:401,ok:true,expected:[200],assertion:'expected-status',actor:'fixture-owner'},
    {label:'unsupported write',method:'POST',path:'/api/invoices/example',status:200,ok:true,expected:[200],assertion:'expected-status',actor:'fixture-owner'},
  ]),'test-build');
  assert.equal(result.failedRequests,1);
  assert.equal(result.unmatched,1);
  assert.equal(result.targetedStatusChecks,0);
  assert.equal(inventory.api[0].methodChecks.GET.success,'unverified');
});
