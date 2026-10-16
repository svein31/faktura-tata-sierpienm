import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:http";

const require = createRequire(import.meta.url);
const directory = dirname(fileURLToPath(import.meta.url));
const root = join(directory, "../..");
let fixturePromise;

async function buildFixture() {
  require("../register-ts.cjs");
  const React = require("react");
  const { renderToString } = require("react-dom/server");
  const { CookieConsentBanner } = require("../../src/components/legal/cookie-consent-banner.tsx");
  const { COOKIE_CONSENT_VISIBILITY_SCRIPT, COOKIE_CONSENT_NAME, COOKIE_CONSENT_VERSION } = require("../../src/lib/cookie-consent.ts");
  const css = await readFile(join(root, "src/app/globals.css"), "utf8");
  const visibilityRule = css.match(/html\[data-saved-cookie-consent="true"\]\s*\[data-cookie-consent-banner\]\s*\{[^}]+\}/)?.[0];
  assert.ok(visibilityRule, "Use the production visibility rule, rather than reproducing its behavior in the fixture");
  const markup = renderToString(React.createElement(CookieConsentBanner));
  const output = await mkdtemp(join(tmpdir(), "faktura-consent-"));
  const compiled = require("next/dist/compiled/webpack/webpack"); compiled.init();
  const compiler = compiled.webpack({
    mode: "production", devtool: false, target: "web", context: root,
    entry: join(directory, "consent-fixture.tsx"),
    output: { path: output, filename: "fixture.js", chunkFilename: "[id].fixture.js", publicPath: "/" },
    resolve: { extensions: [".tsx", ".ts", ".js", ".mjs", ".json"], alias: {
      "next/link$": join(directory, "ui-fixture-link.tsx"),
      "next/navigation$": join(directory, "consent-fixture-navigation.ts"),
      "next/dynamic$": join(directory, "consent-fixture-dynamic.tsx"),
      "@": join(root, "src"),
    } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [{ loader: join(directory, "consent-browser-loader.cjs") }] }] },
    optimization: { minimize: false },
  });
  try {
    const stats = await new Promise((resolve, reject) => compiler.run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : resolve(stats)));
    const assets = Object.fromEntries(await Promise.all(stats.toJson({ all: false, assets: true }).assets.filter(asset => asset.name.endsWith(".js")).map(async asset => [asset.name, await readFile(join(output, asset.name))])));
    return { output, assets, name: COOKIE_CONSENT_NAME, version: COOKIE_CONSENT_VERSION,
      html: `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Consent integration QA</title><style>${visibilityRule}\nsvg{width:16px;height:16px}button{margin:5px;padding:8px}[data-app-dialog]{position:fixed;inset:12px;overflow:auto;background:white;padding:16px;z-index:90}body{font-family:sans-serif}</style><script>${COOKIE_CONSENT_VISIBILITY_SCRIPT}</script></head><body><main><h1>Synthetic public page</h1><a id="register-cta" href="/register?email=never-send@example.test#private">Register</a><a id="demo-cta" href="/demo?token=never-send#private">Demo</a><button id="footer-preferences" onclick="window.dispatchEvent(new CustomEvent('open-cookie-preferences'))">Footer privacy settings</button></main><div id="consent-root">${markup}</div><script defer src="/fixture.js"></script></body></html>` };
  } catch (error) { await rm(output, { recursive: true, force: true }); throw error; }
  finally { await new Promise(resolve => compiler.close(resolve)); }
}

/** Actual SSR and client components; no production services or user data. */
export async function auditConsent(browser, { outputPath } = {}) {
  fixturePromise ||= buildFixture();
  const fixture = await fixturePromise;
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const asset = basename(new URL(request.url, "http://fixture.invalid").pathname);
    if (fixture.assets[asset] && request.url === `/${asset}`) { response.setHeader("Content-Type", "application/javascript"); response.end(fixture.assets[asset]); }
    else if (request.url === "/favicon.ico") { response.statusCode = 204; response.end(); }
    else { response.setHeader("Content-Type", "text/html"); response.end(fixture.html); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const checks = [], browserErrors = [];
  const consent = analytics => encodeURIComponent(JSON.stringify({ version: fixture.version, essential: true, functional: analytics, analytics, marketing: false, timestamp: "2026-10-15T12:00:00Z" }));
  const region = page => page.locator("[data-cookie-consent-banner]");
  const check = async (name, run) => {
    try { await run(); checks.push({ name, status: "passed" }); }
    catch (error) { error.message = `${name}: ${error.message}`; throw error; }
  };
  const open = async ({ cookie, path = "/", privacy } = {}) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    if (cookie !== undefined) await context.addCookies([{ name: fixture.name, value: cookie, url: origin }]);
    if (privacy) await context.addInitScript(privacy => {
      if (privacy === "dnt") Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: "1" });
      if (privacy === "gpc") Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, value: true });
    }, privacy);
    const requests = [];
    // Never call a real Google endpoint. This records the request that the real
    // component decides to make and supplies a harmless tag with no side effects.
    await context.route("https://www.googletagmanager.com/**", route => route.fulfill({ status: 200, contentType: "application/javascript", body: "/* synthetic inert gtag.js */" }));
    await context.route("https://*.google-analytics.com/**", route => route.abort());
    const page = await context.newPage();
    page.on("request", request => requests.push(request.url()));
    page.on("pageerror", error => browserErrors.push(error.message));
    page.on("console", message => { if (message.type() === "error") browserErrors.push(message.text()); });
    await page.goto(`${origin}${path}`);
    await page.waitForFunction(() => !!window.consentTest);
    return { context, page, requests };
  };
  const hydrate = async page => {
    await page.evaluate(() => window.consentTest.hydrate());
    await page.waitForFunction(() => window.consentTest.mounted);
    assert.deepEqual(await page.evaluate(() => window.consentTest.errors), [], "The real server-rendered banner must hydrate without recoverable mismatches");
  };
  const googleRequests = requests => requests.filter(url => /^https:\/\/(?:www\.googletagmanager\.com|[^/]*google-analytics\.com)\//.test(url));
  const pageEvents = page => page.evaluate(() => (window.dataLayer || []).map(args => Array.from(args)).filter(args => args[0] === "event"));
  const flush = page => page.evaluate(() => new Promise(resolve => {
    const channel = new MessageChannel(); let remaining = 3;
    channel.port1.onmessage = () => { if (--remaining) channel.port2.postMessage(null); else { channel.port1.close(); channel.port2.close(); resolve(); } };
    channel.port2.postMessage(null);
  }));
  try {
    await check("first visit has all three actionable choices in HTML before hydration and no analytics chunk or Google request", async () => {
      const { context, page, requests } = await open();
      try {
        assert.equal(await region(page).isVisible(), true);
        assert.equal(await region(page).getByRole("button").count(), 3);
        assert.equal(await page.evaluate(() => window.consentTest.mounted), false);
        assert.equal(requests.filter(url => /\/\d+\.fixture\.js/.test(url)).length, 0);
        assert.deepEqual(googleRequests(requests), []);
        await hydrate(page);
        assert.equal(await region(page).isVisible(), true);
        await flush(page);
        assert.equal(requests.filter(url => /\/\d+\.fixture\.js/.test(url)).length, 0);
        assert.deepEqual(googleRequests(requests), []);
      } finally { await context.close(); }
    });
    for (const accepted of [false, true]) await check(`saved current ${accepted ? "acceptance" : "rejection"} hides the SSR banner before and after hydration`, async () => {
      const { context, page, requests } = await open({ cookie: consent(accepted) });
      try {
        assert.equal(await region(page).count(), 1, "SSR still contains real choices");
        assert.equal(await region(page).isVisible(), false);
        assert.equal(await page.locator("html").getAttribute("data-saved-cookie-consent"), "true");
        assert.deepEqual(googleRequests(requests), []);
        await hydrate(page);
        assert.equal(await region(page).count(), 0);
        assert.equal(await page.locator("html").getAttribute("data-saved-cookie-consent"), null);
        if (accepted) await page.waitForFunction(() => (window.dataLayer || []).some(args => args[0] === "event" && args[1] === "page_view"));
        else { await flush(page); assert.deepEqual(googleRequests(requests), []); }
        await page.locator("#footer-preferences").click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor({ state: "visible" });
        assert.equal(await dialog.getByLabel("Cookies analityczne").isChecked(), accepted);
        await dialog.getByRole("button", { name: "Zamknij", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
      } finally { await context.close(); }
    });
    for (const [name, cookie] of [["stale", encodeURIComponent(JSON.stringify({ version: "old", analytics: true }))], ["malformed JSON", "%7Bbroken"], ["malformed URI", "%E0%A4%A"]]) await check(`${name} saved choice stays visible before and after hydration and never authorizes analytics`, async () => {
      const { context, page, requests } = await open({ cookie });
      try {
        assert.equal(await region(page).isVisible(), true);
        await hydrate(page); await flush(page);
        assert.equal(await region(page).isVisible(), true);
        assert.deepEqual(googleRequests(requests), []);
      } finally { await context.close(); }
    });
    await check("closing preferences opened from the first-visit banner restores focus to its remounted trigger", async () => {
      const { context, page, requests } = await open();
      try {
        await hydrate(page);
        await region(page).getByRole("button", { name: "Ustawienia", exact: true }).click();
        await page.getByRole("dialog").waitFor({ state: "visible" });
        await page.keyboard.press("Escape");
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Ustawienia");
        assert.deepEqual(googleRequests(requests), []);
      } finally { await context.close(); }
    });
    await check("accepting starts the real deferred analytics runtime; footer reopens preferences; withdrawing stops events and removes GA cookies", async () => {
      const { context, page, requests } = await open();
      try {
        await hydrate(page);
        assert.deepEqual(googleRequests(requests), []);
        const tagRequest = page.waitForRequest("https://www.googletagmanager.com/**");
        await region(page).getByRole("button", { name: "Akceptuj wszystkie" }).click();
        await tagRequest;
        await page.waitForFunction(() => (window.dataLayer || []).some(args => args[0] === "event" && args[1] === "page_view"));
        assert.equal(googleRequests(requests).length, 1);
        assert.ok(requests.some(url => /\/\d+\.fixture\.js/.test(url)), "The runtime is a separate deferred chunk");
        await page.evaluate(() => document.cookie = "_ga=synthetic; Path=/");
        await page.locator("#footer-preferences").click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor({ state: "visible" });
        assert.equal(await dialog.getByLabel("Cookies analityczne").isChecked(), true);
        await dialog.getByRole("button", { name: "Odrzuć wszystkie opcjonalne" }).click();
        await dialog.waitFor({ state: "hidden" });
        assert.equal(await page.evaluate(() => window["ga-disable-G-4P218PFSBX"]), true);
        assert.equal((await context.cookies()).some(cookie => /^_ga(?:_|$)/.test(cookie.name)), false);
        assert.deepEqual(await pageEvents(page), []);
        await page.evaluate(() => history.pushState({}, "", "/cennik?email=never-send@example.test#private"));
        await flush(page);
        assert.deepEqual(await pageEvents(page), []);
        assert.equal(googleRequests(requests).length, 1);
      } finally { await context.close(); }
    });
    await check("public CTA events are preserved, stripped of query/hash; private navigation suspends before history changes", async () => {
      const { context, page } = await open({ cookie: consent(true), path: "/?email=never-send@example.test#private" });
      try {
        await hydrate(page);
        await page.waitForFunction(() => (window.dataLayer || []).some(args => args[0] === "event" && args[1] === "page_view"));
        await page.evaluate(() => { document.addEventListener("click", event => event.preventDefault()); document.getElementById("register-cta").click(); document.getElementById("demo-cta").click(); });
        let events = await pageEvents(page);
        assert.deepEqual(events.map(event => event[1]), ["page_view", "registration_click", "demo_click"]);
        assert.equal(events[1][2].link_url, `${origin}/register`);
        assert.equal(events[2][2].link_url, `${origin}/demo`);
        assert.ok(events.every(event => event[2].page_location === `${origin}/`));
        await page.evaluate(() => history.pushState({}, "", "/invoices?email=never-send@example.test#private"));
        assert.equal(await page.evaluate(() => window["ga-disable-G-4P218PFSBX"]), true);
        await page.evaluate(() => document.getElementById("register-cta").click());
        assert.equal((await pageEvents(page)).length, 3);
        await page.evaluate(() => history.pushState({}, "", "/cennik?token=never-send#private"));
        events = await pageEvents(page);
        assert.equal(events.at(-1)[2].page_location, `${origin}/cennik`);
        assert.equal(events.length, 4);
      } finally { await context.close(); }
    });
    for (const privacy of ["dnt", "gpc"]) await check(`${privacy.toUpperCase()} blocks Google requests even with accepted saved consent`, async () => {
      const { context, page, requests } = await open({ cookie: consent(true), privacy });
      try {
        await hydrate(page);
        // Wait for the real lazy module to install its privacy guard.
        await page.waitForFunction(() => window["ga-disable-G-4P218PFSBX"] === true);
        assert.deepEqual(googleRequests(requests), []);
        assert.deepEqual(await pageEvents(page), []);
      } finally { await context.close(); }
    });
    await check("accepted saved consent on a private route cannot request Google", async () => {
      const { context, page, requests } = await open({ cookie: consent(true), path: "/invoices?token=never-send#private" });
      try {
        await hydrate(page);
        await page.waitForFunction(() => window["ga-disable-G-4P218PFSBX"] === true);
        assert.deepEqual(googleRequests(requests), []);
        assert.deepEqual(await pageEvents(page), []);
      } finally { await context.close(); }
    });
    assert.deepEqual(browserErrors, [], "There must be no browser or React hydration errors");
    const result = { browser: browser.browserType().name(), scope: "real SSR CookieConsentBanner, early head script, production visibility CSS, hydrated components and deferred analytics runtime; Next adapters only; inert Google tag", checks, errors: browserErrors };
    if (outputPath) await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally { await new Promise(resolve => server.close(resolve)); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    const result = await auditConsent(browser, { outputPath: process.env.CONSENT_AUDIT_OUTPUT });
    console.log(`[consent] PASS ${result.browser}: ${result.checks.length} regressions`);
  } finally {
    await browser.close();
    if (fixturePromise) await rm((await fixturePromise).output, { recursive: true, force: true });
  }
}
