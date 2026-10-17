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
    // useOverview imports the same store through a relative path. Replace
    // only that catalog boundary, keeping both actual hook implementations.
    plugins: [new compiled.webpack.NormalModuleReplacementPlugin(/^\.\/store$/, resource => {
      if (resource.context === join(root, "src/lib")) resource.request = join(directory, "invoice-search-store.ts");
    })],
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
    const pathname = new URL(request.url, "http://fixture.invalid").pathname;
    response.setHeader("Cache-Control", "no-store");
    if (pathname === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); response.end(fixture.js); }
    else if (pathname === "/favicon.ico") { response.statusCode = 204; response.end(); }
    else if (pathname === "/") { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Invoice search hook QA</title></head><body><div id="root"></div><script defer src="/fixture.js"></script></body></html>'); }
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
  const http = (driver, id, status, message, invalidJson = false) => page.evaluate(([driver, id, status, message, invalidJson]) => window[driver].http(id, status, message, invalidJson), [driver, id, status, message, invalidJson]);
  const overviewSnapshot = () => page.evaluate(() => window.overviewSeedTest.snapshot());
  const overviewAct = (action, value) => page.evaluate(([action, value]) => window.overviewSeedTest.act(action, value), [action, value]);
  const overviewRespond = (id, row) => page.evaluate(([id, row]) => window.overviewSeedTest.respond(id, row), [id, row]);
  const mountSeed = (seed, mode = "invoices") => page.goto(`http://127.0.0.1:${server.address().port}/?${new URLSearchParams({ seed, mode }).toString()}`);
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
  const scope = "actual useInvoiceSearch and useOverview hooks with synthetic store/transport and paused browser clock";
  const check = async (name, run) => {
    try { await run(); checks.push({ name, status: "passed" }); }
    catch (error) {
      checks.push({ name, status: "failed", error: error instanceof Error ? error.message : String(error) });
      if (outputPath) await writeFile(outputPath, `${JSON.stringify({ browser: browser.browserType().name(), scope, checks, errors }, null, 2)}\n`);
      throw error;
    }
  };
  // Host-side polling deliberately never advances the browser's paused clock.
  const waitFor = async (predicate, message, read = snapshot) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const value = await read();
      if (predicate(value)) return value;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail(`${message}: ${JSON.stringify(await read())}`);
  };
  const expectRow = row => waitFor(({ state }) => state.invoices[0] === row && !state.loading && !state.error, `Expected settled row ${row}`);
  const expectOverviewRow = row => waitFor(({ state }) => state.row === row && !state.error, `Expected overview row ${row}`, overviewSnapshot);
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
    await check("matching invoice SSR seed is visible immediately while its authenticated revalidation is pending", async () => {
      await mountSeed("matching");
      let value = await snapshot();
      assert.deepEqual(value.history[0].invoices, ["server-seed"]);
      assert.equal(value.history[0].loading, false);
      assert.equal(value.state.total, 17);
      assert.equal(value.requests.length, 1, "A seed must not suppress the first API request");
      assert.equal(value.requests[0].settled, false);
      assert.equal(value.requests[0].url, value.state.key);
      assert.deepEqual(await page.getByRole("listitem").allTextContents(), ["server-seed"]);
      await drainTasks(); value = await snapshot();
      assert.equal(value.state.loading, false, "Background revalidation must not hide ready SSR rows");
      assert.deepEqual(value.state.invoices, ["server-seed"]);
      await respond(1, "fresh-after-seed"); await expectRow("fresh-after-seed");
      assert.equal((await snapshot()).state.total, 1);
    });
    for (const seed of ["wrong-company", "wrong-filter", "wrong-cursor"]) {
      await check(`invoice SSR seed with ${seed} never appears in any committed render`, async () => {
        await mountSeed(seed);
        let value = await snapshot();
        assert.deepEqual(value.history[0].invoices, []);
        assert.equal(value.history[0].loading, true);
        assert.equal(value.requests.length, 1);
        assert.deepEqual(await page.getByRole("listitem").allTextContents(), []);
        await respond(1, `authorized-${seed}`); await expectRow(`authorized-${seed}`);
        value = await snapshot();
        assert.equal(value.history.some(render => render.invoices.includes("server-seed")), false);
      });
    }
    for (const [status, invalidJson] of [[401, false], [403, false], [403, true]]) {
      await check(`invoice seed is removed after HTTP ${status}${invalidJson ? " with invalid JSON" : ""}, including counters and cursor`, async () => {
        await mountSeed("matching");
        assert.deepEqual((await snapshot()).state.invoices, ["server-seed"]);
        const message = `Synthetic access denied ${status}`;
        await http("invoiceSearchTest", 1, status, message, invalidJson);
        const value = await waitFor(({ state }) => !!state.error && !state.loading, "Access denial must settle with an alert");
        assert.deepEqual(value.state.invoices, []);
        assert.equal(value.state.total, 0);
        assert.deepEqual(value.state.counts, { all: 0, sale: 0, purchase: 0, proforma: 0, approved: 0 });
        assert.equal(value.state.nextCursor, null);
        assert.equal(await page.getByRole("listitem").count(), 0);
        assert.equal(await page.getByRole("alert").textContent(), invalidJson ? "Synthetic non-JSON response" : message);
        await act("reload");
        assert.equal((await snapshot()).requests.length, 2);
        assert.deepEqual((await snapshot()).state.invoices, [], "Retry must not resurrect the revoked server snapshot");
        await respond(2, `recovered-${status}`); await expectRow(`recovered-${status}`);
      });
    }
    for (const kind of ["503", "network"]) {
      await check(`temporary ${kind} failure preserves the same-scope invoice seed and exposes an alert`, async () => {
        await mountSeed("matching");
        const message = `Synthetic temporary ${kind} failure`;
        if (kind === "503") await http("invoiceSearchTest", 1, 503, message);
        else await page.evaluate(message => window.invoiceSearchTest.fail(1, message), message);
        const value = await waitFor(({ state }) => state.error === message && !state.loading, "Temporary failure must expose an alert");
        assert.deepEqual(value.state.invoices, ["server-seed"]);
        assert.equal(value.state.total, 17);
        assert.equal(value.state.counts.purchase, 6);
        assert.equal(value.state.nextCursor, "seed-next-page");
        assert.equal(await page.getByRole("alert").textContent(), message);
        await act("reload"); assert.equal((await snapshot()).requests.length, 2);
        assert.equal((await snapshot()).state.loading, true, "An explicit retry is not the initial background revalidation");
        await respond(2, `recovered-${kind}`); await expectRow(`recovered-${kind}`);
      });
    }
    await check("company switching, return, reload and mutations never resurrect an obsolete invoice seed", async () => {
      await mountSeed("matching");
      await page.evaluate(() => window.invoiceSearchTest.ignoreAbort(1));
      await act("company", "another-company");
      let value = await snapshot();
      assert.equal(value.requests.length, 2);
      assert.equal(value.requests[0].aborted, true);
      assert.deepEqual(value.state.invoices, []);
      await respond(2, "company-b-current"); await expectRow("company-b-current");
      await respond(1, "obsolete-company-a"); await drainTasks(); await expectRow("company-b-current");
      assert.equal((await snapshot()).history.some(render => render.companyId === "another-company" && render.invoices.includes("server-seed")), false);
      await act("company", "synthetic-company");
      value = await snapshot(); assert.equal(value.requests.length, 3);
      assert.deepEqual(value.state.invoices, [], "Returning to the seed key must wait for a current response");
      assert.equal(value.state.loading, true);
      await respond(3, "company-a-current"); await expectRow("company-a-current");
      await act("reload"); value = await snapshot();
      assert.equal(value.requests.length, 4); assert.equal(value.state.loading, true);
      assert.deepEqual(value.state.invoices, ["company-a-current"]);
      await respond(4, "company-a-reloaded"); await expectRow("company-a-reloaded");
      await page.evaluate(() => window.invoiceSearchTest.mutate());
      assert.equal((await snapshot()).requests.length, 5);
      await respond(5, "company-a-mutated"); await expectRow("company-a-mutated");
    });
    await check("returning to the seed company before either revalidation settles cannot revive its discarded seed", async () => {
      await mountSeed("matching");
      await page.evaluate(() => window.invoiceSearchTest.ignoreAbort(1));
      await act("company", "another-company");
      await page.evaluate(() => window.invoiceSearchTest.ignoreAbort(2));
      await act("company", "synthetic-company");
      const value = await snapshot();
      assert.equal(value.requests.length, 3);
      assert.equal(value.requests[0].aborted, true);
      assert.equal(value.requests[1].aborted, true);
      assert.deepEqual(value.state.invoices, [], "A previously discarded seed must not reappear while current data is pending");
      assert.equal(value.state.loading, true);
      await respond(3, "current-after-rapid-switch"); await expectRow("current-after-rapid-switch");
      await respond(1, "obsolete-seed-refresh"); await respond(2, "obsolete-other-company");
      await drainTasks(); await expectRow("current-after-rapid-switch");
    });
    await check("matching overview SSR seed remains visible during its authenticated API revalidation", async () => {
      await mountSeed("matching", "overview");
      const value = await overviewSnapshot();
      assert.equal(value.history[0].row, "server-seed");
      assert.equal(value.state.row, "server-seed");
      assert.equal(value.requests.length, 1);
      assert.equal(value.requests[0].settled, false);
      assert.equal(value.requests[0].url, "/api/overview?companyId=synthetic-company&months=6");
      assert.equal(await page.locator("[data-overview-row]").textContent(), "server-seed");
      await overviewRespond(1, "fresh-overview"); await expectOverviewRow("fresh-overview");
    });
    for (const seed of ["wrong-company", "wrong-filter"]) {
      await check(`overview SSR seed with ${seed} never appears in any committed render`, async () => {
        await mountSeed(seed, "overview");
        let value = await overviewSnapshot();
        assert.equal(value.history[0].row, null);
        assert.equal(value.state.row, null);
        assert.equal(value.requests.length, 1);
        await overviewRespond(1, `authorized-${seed}`); await expectOverviewRow(`authorized-${seed}`);
        value = await overviewSnapshot();
        assert.equal(value.history.some(render => render.row === "server-seed"), false);
      });
    }
    for (const [status, invalidJson] of [[401, false], [403, false], [403, true]]) {
      await check(`overview seed is removed after HTTP ${status}${invalidJson ? " with invalid JSON" : ""} and can be retried`, async () => {
        await mountSeed("matching", "overview");
        assert.equal((await overviewSnapshot()).state.row, "server-seed");
        await http("overviewSeedTest", 1, status, `Synthetic access denied ${status}`, invalidJson);
        const value = await waitFor(({ state }) => !!state.error, "Overview access denial must expose an alert", overviewSnapshot);
        assert.equal(value.state.row, null);
        assert.equal(await page.locator("[data-overview-row]").count(), 0);
        assert.equal(await page.getByRole("alert").count(), 1);
        await overviewAct("reload");
        assert.equal((await overviewSnapshot()).requests.length, 2);
        assert.equal((await overviewSnapshot()).state.row, null);
        await overviewRespond(2, `recovered-${status}`); await expectOverviewRow(`recovered-${status}`);
      });
    }
    await check("temporary overview failure keeps its same-scope seed, while company/period changes and reload discard it", async () => {
      await mountSeed("matching", "overview");
      await http("overviewSeedTest", 1, 503, "Synthetic temporary overview failure");
      let value = await waitFor(({ state }) => !!state.error, "Temporary overview failure must expose an alert", overviewSnapshot);
      assert.equal(value.state.row, "server-seed");
      await overviewAct("company", "another-company");
      value = await overviewSnapshot(); assert.equal(value.requests.length, 2); assert.equal(value.state.row, null);
      await overviewRespond(2, "company-b-overview"); await expectOverviewRow("company-b-overview");
      await overviewAct("company", "synthetic-company");
      value = await overviewSnapshot(); assert.equal(value.requests.length, 3); assert.equal(value.state.row, null);
      await overviewRespond(3, "company-a-overview"); await expectOverviewRow("company-a-overview");
      await overviewAct("months", 12);
      value = await overviewSnapshot(); assert.equal(value.requests.length, 4); assert.equal(value.state.row, null);
      assert.equal(new URL(value.requests[3].url, "http://fixture.invalid").searchParams.get("months"), "12");
      await overviewRespond(4, "twelve-month-overview"); await expectOverviewRow("twelve-month-overview");
      await overviewAct("reload");
      value = await overviewSnapshot(); assert.equal(value.requests.length, 5); assert.equal(value.state.row, null);
      await overviewRespond(5, "refreshed-twelve-month-overview"); await expectOverviewRow("refreshed-twelve-month-overview");
    });
    assert.deepEqual(errors, [], "The real-hook fixture must have no React or browser console errors");
    const result = { browser: browser.browserType().name(), scope, checks, errors };
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
