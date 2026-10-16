import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:http";

const require = createRequire(import.meta.url);
const directory = dirname(fileURLToPath(import.meta.url));
const root = join(directory, "../..");
let fixturePromise;

async function buildFixture() {
  const output = await mkdtemp(join(tmpdir(), "faktura-invoice-search-"));
  const compiled = require("next/dist/compiled/webpack/webpack"); compiled.init();
  const compiler = compiled.webpack({
    mode: "development", devtool: false, target: "web", context: root,
    entry: join(directory, "invoice-search-fixture.tsx"),
    output: { path: output, filename: "fixture.js" },
    resolve: { extensions: [".tsx", ".ts", ".js", ".mjs", ".json"], alias: {
      "@/lib/store$": join(directory, "invoice-search-store.ts"),
      "@": join(root, "src"),
    } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [{ loader: join(directory, "typescript-browser-loader.cjs") }] }] },
    optimization: { minimize: false },
  });
  try {
    await new Promise((resolve, reject) => compiler.run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : resolve()));
    return { output, js: await readFile(join(output, "fixture.js")) };
  } catch (error) { await rm(output, { recursive: true, force: true }); throw error; }
  finally { await new Promise(resolve => compiler.close(resolve)); }
}

/** Exercises the real React hook against a controlled synthetic transport. */
export async function auditInvoiceSearch(browser, { outputPath } = {}) {
  fixturePromise ||= buildFixture();
  const fixture = await fixturePromise;
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); response.end(fixture.js); }
    else if (request.url === "/favicon.ico") { response.statusCode = 204; response.end(); }
    else if (request.url === "/") { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Invoice search hook QA</title></head><body><div id="root"></div><script defer src="/fixture.js"></script></body></html>'); }
    else { response.statusCode = 404; response.end(); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const snapshot = () => page.evaluate(() => window.invoiceSearchTest.snapshot());
  const act = (action, value) => page.evaluate(([action, value]) => window.invoiceSearchTest.act(action, value), [action, value]);
  const respond = (id, row, cursor = null) => page.evaluate(([id, row, cursor]) => window.invoiceSearchTest.respond(id, row, cursor), [id, row, cursor]);
  // Let promise handlers and React's MessageChannel scheduler settle without
  // moving the debounce clock. Otherwise a stale-result assertion could read
  // the already correct previous render before the bad update even commits.
  const drainTasks = () => page.evaluate(() => new Promise(resolve => {
    const channel = new MessageChannel();
    let remaining = 3;
    channel.port1.onmessage = () => {
      if (--remaining) channel.port2.postMessage(null);
      else { channel.port1.close(); channel.port2.close(); resolve(); }
    };
    channel.port2.postMessage(null);
  }));
  const checks = [];
  const check = async (name, run) => { await run(); checks.push({ name, status: "passed" }); };
  // Host-side polling deliberately never advances the browser's paused clock.
  const waitFor = async (predicate, message) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const value = await snapshot();
      if (predicate(value)) return value;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail(`${message}: ${JSON.stringify(await snapshot())}`);
  };
  const expectRow = row => waitFor(({ state }) => state.invoices[0] === row && !state.loading && !state.error, `Expected settled row ${row}`);
  try {
    const frozen = new Date("2026-10-15T12:00:00.000Z");
    await page.clock.install({ time: frozen });
    // Freeze before mounting. The later instant avoids racing a clock that
    // advanced a few real milliseconds while the install command returned.
    await page.clock.pauseAt(new Date(frozen.getTime() + 60_000));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(await page.evaluate(() => !!window.invoiceSearchTest), true, "The real hook fixture must finish its initial committed render on load");
    await check("initial request starts without advancing the debounce clock", async () => {
      assert.equal((await snapshot()).requests.length, 1);
      assert.equal((await snapshot()).state.loading, true);
      await respond(1, "initial", "page-2"); await expectRow("initial");
    });
    await check("pagination, non-text filters, explicit refresh and catalog mutation start immediately", async () => {
      await act("next");
      let value = await snapshot(); assert.equal(value.requests.length, 2); assert.equal(new URL(value.requests[1].url, "http://fixture.invalid").searchParams.get("cursor"), "page-2");
      await respond(2, "second-page"); await expectRow("second-page");
      assert.equal((await snapshot()).state.page, 2);
      await act("previous"); assert.equal((await snapshot()).requests.length, 3);
      await respond(3, "first-page"); await expectRow("first-page");
      await act("status", "approved"); value = await snapshot();
      assert.equal(value.requests.length, 4); assert.equal(new URL(value.requests[3].url, "http://fixture.invalid").searchParams.get("status"), "approved");
      await respond(4, "filtered"); await expectRow("filtered");
      await act("reload"); assert.equal((await snapshot()).requests.length, 5);
      await page.evaluate(() => window.invoiceSearchTest.mutate()); value = await snapshot();
      assert.equal(value.requests.length, 6); assert.equal(value.requests[4].aborted, true);
      await respond(6, "mutated"); await expectRow("mutated");
    });
    await check("typing waits 200 ms from the latest key and cancels earlier scheduled searches", async () => {
      await act("search", "a"); assert.equal((await snapshot()).requests.length, 6);
      await page.clock.runFor(100);
      await act("search", "ab");
      await page.clock.runFor(199); assert.equal((await snapshot()).requests.length, 6);
      await page.clock.runFor(1);
      const value = await snapshot(); assert.equal(value.requests.length, 7);
      assert.equal(new URL(value.requests[6].url, "http://fixture.invalid").searchParams.get("search"), "ab");
      await respond(7, "typed"); await expectRow("typed");
    });
    await check("a canceled transport completing after newer results cannot overwrite data or loading", async () => {
      await act("search", "old"); await page.clock.runFor(200);
      assert.equal((await snapshot()).requests.length, 8);
      await page.evaluate(() => window.invoiceSearchTest.ignoreAbort(8));
      await act("search", "new"); assert.equal((await snapshot()).requests[7].aborted, true);
      await page.clock.runFor(200); assert.equal((await snapshot()).requests.length, 9);
      await respond(9, "newest"); await expectRow("newest");
      await respond(8, "stale"); await drainTasks(); await expectRow("newest");
      assert.deepEqual((await snapshot()).state.invoices, ["newest"]);
    });
    await check("a stale transport rejection cannot show errors or finish a newer pending request", async () => {
      await act("reload"); assert.equal((await snapshot()).requests.length, 10);
      await page.evaluate(() => window.invoiceSearchTest.ignoreAbort(10));
      await act("search", "newer"); await page.clock.runFor(200);
      assert.equal((await snapshot()).requests.length, 11);
      await page.evaluate(() => window.invoiceSearchTest.fail(10, "Late obsolete failure"));
      await drainTasks();
      assert.equal((await snapshot()).state.loading, true, "The newer request is still pending");
      assert.equal((await snapshot()).state.error, "", "An obsolete rejection must not show an error");
      await respond(11, "successful"); await expectRow("successful");
    });
    await check("disabling cancels a pending debounce; reenabling the same query starts immediately", async () => {
      await act("search", "disabled-before-debounce"); await page.clock.runFor(50); await act("enable", false);
      await page.clock.runFor(250); assert.equal((await snapshot()).requests.length, 11);
      assert.deepEqual((await snapshot()).state.invoices, []);
      await act("enable", true); assert.equal((await snapshot()).requests.length, 12);
      await respond(12, "reenabled"); await expectRow("reenabled");
    });
    await check("document departure cancels pending typing and persisted restoration resumes the actual hook", async () => {
      await act("search", "departing"); await page.clock.runFor(50);
      await page.evaluate(() => {
        window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
        window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      });
      await page.clock.runFor(250); assert.equal((await snapshot()).requests.length, 12);
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
      await waitFor(({ requests }) => requests.length === 13, "Restoration starts the current query without a debounce");
      await respond(13, "restored"); await expectRow("restored");
    });
    await check("unmount aborts an active request and late completion cannot update an unmounted hook", async () => {
      await act("reload"); assert.equal((await snapshot()).requests.length, 14);
      await page.evaluate(() => { window.invoiceSearchTest.ignoreAbort(14); window.invoiceSearchTest.unmount(); });
      assert.equal((await snapshot()).requests[13].aborted, true);
      await respond(14, "after-unmount");
      await drainTasks();
      assert.equal(await page.locator("#search-state").count(), 0);
    });
    assert.deepEqual(errors, [], "The real-hook fixture must have no React or browser console errors");
    const result = { browser: browser.browserType().name(), scope: "actual useInvoiceSearch hook with synthetic store/transport and paused browser clock", checks, errors };
    if (outputPath) await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally { await context.close(); await new Promise(resolve => server.close(resolve)); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    const result = await auditInvoiceSearch(browser, { outputPath: process.env.INVOICE_SEARCH_AUDIT_OUTPUT });
    console.log(`[invoice-search] PASS ${result.browser}: ${result.checks.length} regressions`);
  } finally {
    await browser.close();
    if (fixturePromise) await rm((await fixturePromise).output, { recursive: true, force: true });
  }
}
