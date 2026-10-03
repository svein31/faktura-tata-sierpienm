import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
require("./register-ts.cjs");
const { topics } = require("../src/lib/seo/content.ts");
const copy = require("../src/lib/seo/onpage.json");
export async function auditSeoContracts(base) {
  const paths = [...new Set(["/", "/cennik", "/program-do-faktur", "/porownania", "/poradnik-ksef", "/faktury", "/vat", "/narzedzia", "/narzedzia/kalkulator-vat", "/narzedzia/limit-ksef", "/demo", "/pomoc", ...topics.map(t=>t.path)])];
  const canonicalOrigin="https://fakturaprosto.pl";
  const titles=new Set();
  const descriptions=new Set(), links=new Map();
  for(const path of paths) {
    const res=await fetch(base+path,{redirect:"manual",signal:AbortSignal.timeout(15000)}),html=await res.text();
    assert.equal(res.status,200,path);
    assert.ok(!/noindex/i.test(res.headers.get("x-robots-tag") || ""),path+" indexable HTTP header");
    const title=html.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    assert.ok(title && !titles.has(title),path+" has a unique title"); titles.add(title);
    assert.ok(title.length <= 65,path+" title length"); // serialized entities may add characters
    assert.equal((html.match(/<h1\b/g)||[]).length,1,path+" exactly one H1");
    assert.ok(html.includes('rel="canonical" href="'+canonicalOrigin+(path==="/"?"":path)+'"') || html.includes('rel="canonical" href="'+canonicalOrigin+path+'"'),path+" canonical");
    assert.ok(html.includes('property="og:image"'),path+" image");
    const meta=html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.ok(meta && meta.length<=165,path+" description");
    assert.ok(!descriptions.has(meta),path+" unique description"); descriptions.add(meta);
    const robots=html.match(/<meta name="robots" content="([^"]+)"/)?.[1];
    assert.ok(robots && !robots.includes("noindex"),path+" indexable");
    const graphs=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
    assert.ok(graphs.length,path+" JSON-LD");
    const nodes=graphs.flatMap(g=>g["@graph"] || [g]);
    const hrefs=[...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map(m=>m[1]);
    links.set(path,hrefs.filter(href=>href.startsWith("/") || href.startsWith(canonicalOrigin)).map(href=>new URL(href,canonicalOrigin).pathname));
    for(const href of hrefs.filter(href=>href.startsWith("#") && href.length>1)) {
      assert.ok(html.includes('id="'+href.slice(1)+'"'),path+" valid fragment "+href);
    }
    const software=nodes.find(n=>n["@type"]==="SoftwareApplication");
    if(software) {
      assert.deepEqual(software.offers.map(o=>o.price),["0","7","59"],path+" actual plan prices");
      assert.ok(software.offers.every(o=>o.url.startsWith(canonicalOrigin+"/cennik#")),path+" offers link to public pricing");
    }
    const topic=topics.find(t=>t.path===path);
    if(topic) {
      assert.ok(html.includes(topic.answer.split(" ").slice(0,6).join(" ")),path+" direct answer");
      assert.ok(graphs.some(g=>g["@graph"]?.some(n=>n["@type"]==="Article" && n.dateModified===(topic.modifiedAt||"2026-09-24"))),path+" actual article dates");
      assert.ok(nodes.some(n=>n["@type"]==="Organization" && n["@id"]===canonicalOrigin+"/#organization"),path+" publisher definition");
      assert.ok(nodes.find(n=>n["@type"]==="Article")?.image,path+" article image");
    }
  }
  const reachable=new Set(["/"]), queue=["/"];
  for(let i=0;i<queue.length;i++) for(const target of links.get(queue[i]) || []) {
    if(links.has(target) && !reachable.has(target)) { reachable.add(target); queue.push(target); }
  }
  for(const path of paths) assert.ok(reachable.has(path),path+" discoverable from homepage links");
  for(const section of ["/faktury","/poradnik-ksef","/vat","/program-do-faktur","/porownania"]) {
    const res=await fetch(base+section+"/nieistniejacy-poradnik",{redirect:"manual"});
    assert.equal(res.status,404,section+" missing article returns 404");
    assert.ok((await res.text()).includes("noindex"),section+" missing article noindex");
  }
  for(const path of ["/login","/register","/forgot-password","/reset-password"]) {
    const html=await (await fetch(base+path)).text(); assert.ok(html.includes('noindex'),path+" noindex");
  }
  const sitemap=await (await fetch(base+"/sitemap.xml")).text();
  const sitemapUrls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
  assert.equal(new Set(sitemapUrls).size,sitemapUrls.length,"sitemap has no duplicates");
  for(const path of paths) assert.ok(sitemapUrls.includes(new URL(path,canonicalOrigin).href),path+" sitemap exact canonical URL");
  assert.ok(sitemapUrls.every(url=>!/^\/(login|register|api|portal|dashboard|settings)(\/|$)/.test(new URL(url).pathname)),"sitemap excludes private pages");
  const robots=await (await fetch(base+"/robots.txt")).text();
  assert.ok(robots.includes("Sitemap: "+canonicalOrigin+"/sitemap.xml"),"robots advertises sitemap");
  const blocked=[...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map(m=>m[1]);
  for(const path of [...paths,"/_next/static/test.js"]) assert.ok(!blocked.some(prefix=>path.startsWith(prefix)),path+" crawlable");
  const llms=await fetch(base+"/llms.txt");assert.equal(llms.status,200);const text=await llms.text();assert.ok(text.includes("7 zł")&&text.includes("brutto"),"LLMS price gross");
  const image=await fetch(base+"/opengraph-image");assert.equal(image.status,200);assert.match(image.headers.get("content-type"),/^image\//);
  assert.ok(copy.every(p=>p.title.length<=60&&p.description.length<=155),"onpage copy bounds");
  console.log("[seo-contracts] PASS "+paths.length+" public URLs, unique metadata, H1, canonical, images, JSON-LD, sitemap, llms and private noindex");
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  assert.ok(process.argv[2],"Usage: node scripts/seo-contract-audit.mjs http://127.0.0.1:3000");
  await auditSeoContracts(process.argv[2].replace(/\/$/,""));
}
