require('../register-ts.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const {DEFAULT_ROLE_PERMISSIONS}=require('../../src/lib/role-permissions.ts');
const {validateTeamGrant}=require('../../src/lib/team-grants.ts');
function fixture({stale=false,loggedIn=false,live=true,mfa=false,newAccount=false}={}){
 const target={id:'a'.repeat(24),email:'synthetic-recipient@example.invalid',password:'checked-hash',name:'Synthetic recipient'},calls=[];
 const invitation={id:'b'.repeat(24),token:'c'.repeat(64),email:target.email,userId:'d'.repeat(24),companyId:'e'.repeat(24),company:{companyName:'Synthetic team'},role:'employee',permissions:null,status:'pending',expiresAt:new Date(Date.now()+3600000)};
 const db={user:{findUnique:async()=>newAccount?null:target,create:async args=>{calls.push(['create',args]);return target;},updateMany:async args=>{calls.push(['proof',args]);return{count:stale?0:1};}},userMfa:{findUnique:async()=>({enabledAt:mfa?new Date(0):null})},session:{updateMany:async()=>({count:live?1:0})},teamInvitation:{findUnique:async()=>invitation,updateMany:async()=>{calls.push(['claim']);return{count:1};}},companyMember:{findUnique:async()=>null,create:async()=>{calls.push(['grant']);}},$transaction:callback=>{calls.push(['transaction']);return callback(db);}};
 const mocks={
  '@/lib/auth':{getSession:async()=>loggedIn?{user:target,sessionId:'f'.repeat(24)}:null,verifyPassword:async()=>true,validateCredentials:()=>({ok:true}),hashPassword:async()=>target.password,createSession:async()=>{calls.push(['session']);return{token:'new-synthetic-token'};},sessionCookieOptions:()=>({path:'/',secure:false,maxAge:3600,sameSite:'lax'}),AUTH_SESSION_COOKIE:'auth_session'},
  '@/lib/db':{prisma:db},'@/lib/rate-limit':{rateLimitShared:async()=>({allowed:true})},
  '@/lib/team-grants':{validateTeamGrant,teamInvitationGrantor:async(_tx,id)=>{calls.push(['issuer-recheck',id]);return{role:'owner',permissions:DEFAULT_ROLE_PERMISSIONS.owner};},teamActor:async()=>{throw new Error('Accepting cannot require the inviter browser session');}},
  '@/lib/audit':{recordAuditLog:async()=>{}},
 };
 const originalLoad=Module._load,path=require.resolve('../../src/app/api/invite/[token]/route.ts');delete require.cache[path];
 Module._load=function(request,parent,isMain){if(Object.hasOwn(mocks,request))return mocks[request];return originalLoad.call(this,request,parent,isMain)};
 try{return{route:require(path),calls,invitation};}finally{Module._load=originalLoad;}
}
const req=(body={password:'checked-password'})=>new Request('http://127.0.0.1/api/invite/test',{method:'POST',headers:{'Content-Type':'application/json','x-real-ip':'192.0.2.54','user-agent':'Synthetic invitation regression'},body:JSON.stringify(body)});
test('an existing recipient can accept without the inviter browser session; issuer permissions are rechecked',async()=>{
 const f=fixture();const response=await f.route.POST(req(),{params:Promise.resolve({token:f.invitation.token})});
 assert.equal(response.status,200);assert.deepEqual(f.calls.map(call=>call[0]),['transaction','proof','issuer-recheck','claim','grant','session']);
 assert.equal(f.calls[2][1],f.invitation.userId);
});
test('stale password, revoked recipient session and newly enabled MFA cannot consume or grant an invitation',async()=>{
 for(const options of[{stale:true},{loggedIn:true,live:false},{mfa:true}]){
  const f=fixture(options);const response=await f.route.POST(req(),{params:Promise.resolve({token:f.invitation.token})});
  assert.ok([401,403].includes(response.status));assert.equal(f.calls.some(call=>['claim','grant','session'].includes(call[0])),false);
 }
});
test('an authenticated recipient keeps its existing session on valid acceptance',async()=>{
 const f=fixture({loggedIn:true});const response=await f.route.POST(req(),{params:Promise.resolve({token:f.invitation.token})});
 assert.equal(response.status,200);assert.equal(f.calls.some(call=>call[0]==='grant'),true);assert.equal(f.calls.some(call=>call[0]==='session'),false);
});
test('new account requires explicit boolean terms acceptance before any account, consent, claim or grant write',async()=>{
 for(const acceptTerms of[undefined,false,'true',1]){
  const f=fixture({newAccount:true});const response=await f.route.POST(req({password:'checked-password',name:'Żółć QA',acceptTerms}),{params:Promise.resolve({token:f.invitation.token})});
  assert.equal(response.status,400);assert.equal((await response.json()).code,'TERMS_NOT_ACCEPTED');assert.deepEqual(f.calls,[]);
 }
});
test('new account and current legal consent are persisted inside the same invitation transaction',async()=>{
 const f=fixture({newAccount:true});const response=await f.route.POST(req({password:'checked-password',name:'  Żółć QA  ',acceptTerms:true}),{params:Promise.resolve({token:f.invitation.token})});
 assert.equal(response.status,200);assert.deepEqual(f.calls.map(call=>call[0]),['transaction','create','proof','issuer-recheck','claim','grant','session']);
 const data=f.calls[1][1].data,consent=data.legalConsents.create;
 assert.equal(data.name,'Żółć QA');assert.ok(data.emailVerificationRequiredAt instanceof Date);assert.ok(data.termsAcceptedAt instanceof Date);
 assert.equal(consent.documentType,'terms_of_service');assert.equal(consent.accepted,true);assert.equal(consent.documentVersion,data.termsAcceptedVersion);
 assert.equal(consent.context,'invite_accept');assert.equal(consent.companyId,f.invitation.companyId);assert.equal(consent.ipAddress,'192.0.2.0/24');
});
test('new-account names reject missing, excessive and non-text data without writes',async()=>{
 for(const name of['', ' ', 'x'.repeat(101), {name:'QA'}]){
  const f=fixture({newAccount:true});const response=await f.route.POST(req({password:'checked-password',name,acceptTerms:true}),{params:Promise.resolve({token:f.invitation.token})});
  assert.equal(response.status,400);assert.deepEqual(f.calls,[]);
 }
});
test('malformed JSON cannot use an authenticated recipient session to consume an invitation',async()=>{
 const f=fixture({loggedIn:true});const response=await f.route.POST(new Request('http://127.0.0.1/api/invite/test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}),{params:Promise.resolve({token:f.invitation.token})});
 assert.equal(response.status,400);assert.deepEqual(f.calls,[]);
});
