const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const originalLoad = Module._load;
let mocks = {};
Module._load = function(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
  if (request === "server-only") return {};
  if (request.startsWith("@/")) request = path.join(root, "src", request.slice(2));
  return originalLoad.call(this, request, parent, isMain);
};
for (const ext of [".ts", ".tsx"]) require.extensions[ext] = function(mod, file) {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText;
  mod._compile(code, file);
};
const load = p => require(path.join(root, p));

const {MongoMemoryReplSet} = require("mongodb-memory-server");
const {PrismaClient} = require("@prisma/client");
const {execFileSync} = require("node:child_process");
test("real MongoDB: purchase policy, stale updates, payment rollback and session revocation", {timeout:180000}, async () => {
  const mongo = await MongoMemoryReplSet.create({replSet:{count:1},binary:{version:"7.0.24"}});
  const url = mongo.getUri("faktura_regression");
  assert.match(url,/^mongodb:\/\/127\.0\.0\.1:/);
  process.env.DATABASE_URL = url;
  const db = new PrismaClient({datasourceUrl:url});
  try {
    execFileSync(process.execPath,[require.resolve("prisma/build/index.js"),"db","push","--skip-generate"],{cwd:root,env:{...process.env,DATABASE_URL:url},stdio:"pipe"});
    const user = await db.user.create({data:{email:"regression@example.test",password:"test-hash",name:"Test"}});
    const company = await db.companyProfile.create({data:{userId:user.id,nip:"7831574888",companyName:"Test company",isDefault:true}});
    const contractor = await db.contractor.create({data:{userId:user.id,name:"Buyer",nip:"7831574888",address:{street:"Test",postal:"00-001",city:"Warszawa",country:"PL"}}});
    mocks = {"@/lib/db":{prisma:db},"./db":{prisma:db},"@/lib/auth":{getSessionUser:async()=>user}};
    const req = body => new Request("http://localhost/api/invoices",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const payload = {number:"FV/1/2026",type:"sale",status:"draft",contractorId:contractor.id,sellerCompanyId:company.id,issueDate:"2026-09-14",saleDate:"2026-09-14",dueDate:"2026-09-28",currency:"PLN",language:"PL",paymentMethod:"transfer",lines:[{id:"line",name:"Service",quantity:1,netPrice:100,vatRate:"23",unit:"szt."}]};
    const create = load("src/app/api/invoices/route.ts");
    const response = await create.POST(req(payload));
    assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
    const invoice = await db.invoice.findFirst({where:{number:payload.number}});
    assert.equal(invoice.totalGross,123);
    assert.match(invoice.shareToken,/^[a-f0-9]{64}$/);
    const route = load("src/app/api/invoices/[id]/route.ts");
    const ctx = {params:Promise.resolve({id:invoice.id})};
    assert.equal((await route.PUT(req({...payload,version:0}),ctx)).status,409);
    assert.equal((await route.PUT(req({...payload,version:1,notes:"updated"}),ctx)).status,200);
    const {recordInvoicePayment} = load("src/lib/payments.ts");
    const payment = amount => ({userId:user.id,amount,paidAt:new Date(),method:"transfer",note:null});
    await db.$transaction(async tx=>{
      await recordInvoicePayment(tx,invoice.id,payment(20));
      await recordInvoicePayment(tx,invoice.id,payment(30));
    });
    assert.equal((await db.invoice.findUnique({where:{id:invoice.id}})).paidAmount,50);
    await assert.rejects(db.$transaction(async tx=>{
      await recordInvoicePayment(tx,invoice.id,payment(40));
      throw Error("rollback");
    }));
    assert.equal((await db.invoice.findUnique({where:{id:invoice.id}})).paidAmount,50);
    assert.equal(await db.paymentRecord.count({where:{invoiceId:invoice.id}}),2);
    await db.invoice.update({where:{id:invoice.id},data:{type:"purchase"}});
    assert.equal((await route.PUT(req({...payload,version:4}),ctx)).status,403);
    assert.equal((await route.DELETE(req({}),ctx)).status,403);
    const approve = load("src/app/api/invoices/approve/route.ts");
    assert.equal((await approve.POST(req({invoiceIds:[invoice.id],status:"approved"}))).status,200);
    assert.equal((await db.invoice.findUnique({where:{id:invoice.id}})).approvalStatus,"approved");

    const auth = load("src/lib/auth.ts");
    const first = await auth.createSession(user.id);
    const second = await auth.createSession(user.id);
    assert.notEqual(first.token,second.token);
    assert.equal((await auth.getSession(first.token)).sessionId,first.sessionId);
    await db.session.delete({where:{id:first.sessionId}});
    assert.equal(await auth.getSession(first.token),null);
    assert.equal((await auth.getSession(second.token)).user.id,user.id);
    assert.equal(await auth.getSession("forged.jwt.token"),null);
  } finally {
    await db.$disconnect();
    await mongo.stop();
  }
});
