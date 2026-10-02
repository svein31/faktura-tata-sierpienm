import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("./register-ts.cjs");
const { topics } = require("../src/lib/seo/content.ts");
const copy = require("../src/lib/seo/onpage.json");
export async function auditSeoContracts(base) {
  const paths = [...new Set(["/", "/program-do-faktur", "/porownania", "/poradnik-ksef", "/faktury", "/vat", "/narzedzia", "/narzedzia/kalkulator-vat", "/narzedzia/limit-ksef", "/demo", "/pomoc", ...topics.map(t=>t.path)])];
  const canonicalOrigin="https://fakturaprosto.pl";
  const titles=new Set();
  for(const path of paths) {
    const res=await fetch(base+path,{signal:AbortSignal.timeout(15000)}),html=await res.text();
    assert.equal(res.status,200,path);
    const title=html.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    assert.ok(title && !titles.has(title),path+" has a unique title"); titles.add(title);
    assert.ok(title.length <= 65,path+" title length"); // serialized entities may add characters
    assert.equal((html.match(/<h1\b/g)||[]).length,1,path+" exactly one H1");
    assert.ok(html.includes('rel="canonical" href="'+canonicalOrigin+(path==="/"?"":path)+'"') || html.includes('rel="canonical" href="'+canonicalOrigin+path+'"'),path+" canonical");
    assert.ok(html.includes('property="og:image"'),path+" image");
    const meta=html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.ok(meta && meta.length<=165,path+" description");
    assert.ok(!html.includes('noindex'),path+" indexable");
    const graphs=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
    assert.ok(graphs.length,path+" JSON-LD");
    const topic=topics.find(t=>t.path===path);
    if(topic) {
      assert.ok(html.includes(topic.answer.split(" ").slice(0,6).join(" ")),path+" direct answer");
      assert.ok(graphs.some(g=>g["@graph"]?.some(n=>n["@type"]==="Article" && n.dateModified===(topic.modifiedAt||"2026-09-24"))),path+" actual article dates");
    }
  }
  for(const path of ["/login","/register","/forgot-password","/reset-password"]) {
    const html=await (await fetch(base+path)).text(); assert.ok(html.includes('noindex'),path+" noindex");
  }
  const sitemap=await (await fetch(base+"/sitemap.xml")).text();
  for(const path of paths) assert.ok(sitemap.includes(canonicalOrigin+path.replace(/\/$/,"")),path+" sitemap");
  const llms=await fetch(base+"/llms.txt");assert.equal(llms.status,200);const text=await llms.text();assert.ok(text.includes("7 zł")&&text.includes("brutto"),"LLMS price gross");
  const image=await fetch(base+"/opengraph-image");assert.equal(image.status,200);assert.match(image.headers.get("content-type"),/^image\//);
  assert.ok(copy.every(p=>p.title.length<=60&&p.description.length<=155),"onpage copy bounds");
  console.log("[seo-contracts] PASS "+paths.length+" public URLs, unique metadata, H1, canonical, images, JSON-LD, sitemap, llms and private noindex");
}
