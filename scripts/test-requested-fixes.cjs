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
const id = "123456789012345678901234";
function routeMocks(invoice, role = "owner") {
  let writes = 0;
  const db = {
    $transaction: async callback => callback(db),
    accountingPeriod: { upsert: async () => ({ status: "open" }) },
    invoice: {
      findUnique: async () => invoice,
      findMany: async () => [invoice],
      update: async () => { writes++; return invoice; },
      updateMany: async () => { writes++; return {count: 1}; },
      delete: async () => { writes++; },
    },
    companyProfile: {findUnique: async () => ({id: "company", userId: "owner"})},
    companyMember: {findUnique: async () => role ? ({id: "member",role}) : null, findMany: async () => []},
    paymentRecord: {create: async () => { writes++; }, findMany: async () => []},
  };
  mocks = {
    "@/lib/db": {prisma: db},
    "@/lib/auth": {getSessionUser: async () => ({id:"user",name:"Tester",email:"test@example.com"})},
    "@/lib/dto": {invoiceToDto: value => value},
    "@/lib/audit": {buildFieldDiff: () => ({diff:[]}), recordAuditLog: async () => {}},
  };
  for (const key of Object.keys(require.cache)) if (key.startsWith(path.join(root, "src"))) delete require.cache[key];
  return () => writes;
}
const req = (body={}) => new Request("http://localhost/api", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
test("purchase preview remains available; update/delete/payment reject before writing", async () => {
  const writes = routeMocks({id,userId:"user",sellerCompanyId:"company",type:"purchase",version:1});
  const route = load("src/app/api/invoices/[id]/route.ts");
  const payments = load("src/app/api/invoices/[id]/payments/route.ts");
  const ctx = {params:{id}};
  assert.equal((await route.GET(req(),ctx)).status,200);
  assert.equal((await route.PUT(req(),ctx)).status,403);
  assert.equal((await route.DELETE(req(),ctx)).status,403);
  assert.equal((await payments.POST(req({amount:50}),ctx)).status,403);
  assert.equal(writes(),0);
});
test("previously issued invoice cannot become a deletable draft", async () => {
  const writes = routeMocks({id,userId:"user",sellerCompanyId:null,type:"sale",status:"draft",documentStatus:"draft",issuedAt:new Date("2026-09-10"),version:1});
  mocks["@/lib/parsers"] = {parseInvoiceBody: async () => ({sellerCompanyId:null,type:"sale",status:"draft",isProforma:false})};
  const route = load("src/app/api/invoices/[id]/route.ts");
  const ctx = {params:{id}};
  assert.equal((await route.PUT(req({status:"draft"}),ctx)).status,409);
  assert.equal((await route.DELETE(req(),ctx)).status,400);
  assert.equal(writes(),0);
});
test("purchase approval and revocation work for accountants", async () => {
  const writes = routeMocks({id,userId:"author",sellerCompanyId:"company",type:"purchase",issueDate:"2026-09-20"},"accountant");
  const route = load("src/app/api/invoices/approve/route.ts");
  for (const status of ["approved","pending"]) assert.equal((await route.POST(req({invoiceIds:[id],status}))).status,200);
  assert.equal(writes(),2);
});
test("viewer and revoked author cannot approve", async () => {
  for (const role of ["viewer",null]) {
    const writes = routeMocks({id,userId:"user",sellerCompanyId:"company",type:"purchase"},role);
    const route = load("src/app/api/invoices/approve/route.ts");
    assert.equal((await route.POST(req({invoiceIds:[id]}))).status,403);
    assert.equal(writes(),0);
  }
});
test("sales cannot be approved as costs and sales viewer cannot edit", async () => {
  const writes = routeMocks({id,userId:"user",sellerCompanyId:"company",type:"sale",version:1},"viewer");
  assert.equal((await load("src/app/api/invoices/approve/route.ts").POST(req({invoiceIds:[id]}))).status,400);
  assert.equal((await load("src/app/api/invoices/[id]/route.ts").PUT(req({version:1}),{params:{id}})).status,403);
  assert.equal(writes(),0);
});
test("company switch and refresh keep matching company and invoices", async () => {
  mocks = {};
  const {useAppStore} = load("src/lib/store.ts");
  const a = {id:"a",isDefault:true}, b = {id:"b",isDefault:false};
  useAppStore.setState({hydrated:true,companies:[a,b],company:a,selectedCompanyId:"a",invoices:[]});
  useAppStore.getState().setSelectedCompanyId("b");
  assert.equal(useAppStore.getState().company.id,"b");
  const previousFetch = global.fetch;
  global.fetch = async () => Response.json({companies:[a,b],company:a,invoices:[],contractors:[],products:[],notifications:[]});
  await useAppStore.getState().revalidate();
  assert.equal(useAppStore.getState().company.id,"b");
  global.fetch = async () => Response.json({companies:[a],company:a,invoices:[],contractors:[],products:[],notifications:[]});
  await useAppStore.getState().revalidate();
  assert.equal(useAppStore.getState().selectedCompanyId,"a");
  global.fetch = previousFetch;
  const {invoicesForCompany} = load("src/lib/company-selection.ts");
  assert.deepEqual(invoicesForCompany([{id:1,sellerCompanyId:"a"},{id:2,sellerCompanyId:"b"},{id:3}],"b").map(i=>i.id),[2]);
});
test("store rejects optimistic changes to purchase invoices", async () => {
  mocks = {};
  const {useAppStore} = load("src/lib/store.ts");
  useAppStore.setState({invoices:[{id,type:"purchase"}]});
  await assert.rejects(useAppStore.getState().updateInvoice(id,{status:"paid"}));
  await assert.rejects(useAppStore.getState().deleteInvoice(id));
  assert.equal(useAppStore.getState().invoices.length,1);
});
