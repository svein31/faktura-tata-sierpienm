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
  const output = await mkdtemp(join(tmpdir(), "faktura-ui-primitives-"));
  const compiled = require("next/dist/compiled/webpack/webpack"); compiled.init();
  const compiler = compiled.webpack({
    mode: "development", devtool: false, target: "web", context: root,
    entry: join(directory, "ui-primitives-fixture.tsx"),
    output: { path: output, filename: "fixture.js" },
    resolve: { extensions: [".tsx", ".ts", ".js", ".mjs", ".json"], alias: {
      "@/lib/store$": join(directory, "ui-fixture-store.ts"),
      "@/lib/use-invoice-search$": join(directory, "ui-fixture-search.ts"),
      "@/lib/sound$": join(directory, "ui-fixture-sound.ts"),
      "next/navigation$": join(directory, "ui-fixture-navigation.ts"),
      "next/link$": join(directory, "ui-fixture-link.tsx"),
      "@": join(root, "src"),
    } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [{ loader: join(directory, "typescript-browser-loader.cjs") }] }] },
    optimization: { minimize: false },
  });
  try {
    await new Promise((resolve, reject) => compiler.run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : resolve()));
  } finally { await new Promise(resolve => compiler.close(resolve)); }
  const postcss = require("postcss"), tailwind = require("tailwindcss"), loadConfig = require("tailwindcss/loadConfig");
  const config = loadConfig(join(root, "tailwind.config.ts"));
  config.content = [join(root, "src/**/*.tsx"), join(directory, "ui-primitives-fixture.tsx")];
  const css = await postcss([tailwind(config), require("autoprefixer")]).process(await readFile(join(root, "src/app/globals.css"), "utf8"), { from: join(root, "src/app/globals.css") });
  return { output, js: await readFile(join(output, "fixture.js")), css: css.css };
}

/** Uses only synthetic component fixtures; never opens a production URL. */
export async function auditUiPrimitives(browser, { outputPath } = {}) {
  fixturePromise ||= buildFixture();
  const fixture = await fixturePromise;
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); response.end(fixture.js); }
    else if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(fixture.css); }
    else if (request.url === "/") { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated UI QA</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script defer src="/fixture.js"></script></body></html>'); }
    else { response.statusCode = 404; response.end(); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", error => consoleErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  const checks = [];
  const check = async (name, action) => {
    const evidence = await action();
    checks.push({ name, status: "passed", ...(evidence ? { evidence } : {}) });
  };
  const textEquals = async (selector, text) => {
    await page.waitForFunction(([query, expected]) => document.querySelector(query)?.textContent === expected, [selector, text]);
  };
  const focused = async selector => {
    try { await page.waitForFunction(query => document.activeElement?.matches(query), selector); }
    catch (error) {
      console.error("[ui-primitives] Focus failure", selector, await page.evaluate(() => ({ active: document.activeElement?.outerHTML.slice(0, 500), events: window.fixtureFocusEvents.slice(-30) })));
      throw error;
    }
  };
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => {
      window.fixtureFocusEvents = [];
      document.addEventListener("focusin", event => {
        window.fixtureFocusEvents.push({ id: event.target.id, tag: event.target.tagName, label: event.target.getAttribute("aria-label"), dialog: event.target.closest('[role="dialog"]')?.getAttribute("aria-labelledby") });
      });
    });
    await page.locator('[role="tab"]').first().waitFor();
    await check("tabs: one tab stop and left/right/Home/End keyboard activation", async () => {
      assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1);
      await page.getByRole("tab", { name: "Pierwsza", exact: true }).focus();
      await page.keyboard.press("ArrowRight"); await textEquals("#tab-value", "second");
      await focused('[role="tab"][aria-selected="true"]');
      await page.keyboard.press("End"); await textEquals("#tab-value", "third");
      await page.keyboard.press("Home"); await textEquals("#tab-value", "first");
      await page.keyboard.press("ArrowLeft"); await textEquals("#tab-value", "third");
    });
    await check("tabs: Enter/click never submits parent form", async () => {
      await page.keyboard.press("Enter"); await page.getByRole("tab", { name: "Pierwsza", exact: true }).click();
      await textEquals("#submits", "0");
    });
    await check("select: empty required field blocks React submit before callback", async () => {
      await page.locator("#submit-select").click();
      await textEquals("#submits", "0");
      await focused("#required-select");
      assert.equal(await page.locator("#required-select").getAttribute("aria-invalid"), "true");
      await page.getByRole("alert").getByText("Wybierz opcję.", { exact: true }).waitFor();
    });
    await check("select: disabled option skipped, typeahead handles Polish, chosen value reaches FormData", async () => {
      await page.keyboard.press("ArrowDown");
      await page.waitForFunction(() => {
        const activeId = document.getElementById("required-select").getAttribute("aria-activedescendant");
        return activeId && document.getElementById(activeId)?.textContent === "Żółć — polskie znaki";
      });
      const active = await page.locator("#required-select").getAttribute("aria-activedescendant");
      assert.equal(await page.locator(`[id="${active}"]`).textContent(), "Żółć — polskie znaki");
      await page.keyboard.press("Escape");
      // Playwright has no hardware key mapping for Ż; dispatch the same
      // KeyboardEvent so the real component handles Unicode typeahead.
      await page.locator("#required-select").dispatchEvent("keydown", { key: "Ż", bubbles: true });
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => new FormData(document.getElementById("select-form")).get("choice") === "polish");
      assert.equal(await page.evaluate(() => new FormData(document.getElementById("select-form")).get("choice")), "polish");
      await page.locator("#submit-select").click(); await textEquals("#submits", "1");
      assert.equal(await page.locator("#required-select").getAttribute("aria-invalid"), null);
    });
    await check("select: form reset restores default and disabled control cannot open", async () => {
      await page.locator("#reset-select").focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
      await page.waitForFunction(() => new FormData(document.getElementById("reset-form")).get("resetChoice") === "two");
      assert.equal(await page.evaluate(() => new FormData(document.getElementById("reset-form")).get("resetChoice")), "two");
      await page.getByRole("button", { name: "Resetuj wybór", exact: true }).click();
      await page.waitForFunction(() => new FormData(document.getElementById("reset-form")).get("resetChoice") === "one");
      assert.equal(await page.locator("#disabled-select").isDisabled(), true);
      assert.equal(await page.locator("#disabled-select").getAttribute("aria-expanded"), "false");
    });
    await check("select segments: initially disabled first option is skipped by keyboard", async () => {
      await page.getByRole("button", { name: "Segment pierwszy", exact: true }).focus();
      await page.keyboard.press("ArrowDown"); await focused('[data-segment][aria-pressed="true"]');
      assert.equal(await page.getByRole("button", { name: "Segment drugi", exact: true }).getAttribute("aria-pressed"), "true");
    });
    await check("tooltip: focus exposes associated description and Escape dismisses", async () => {
      const button = page.getByRole("button", { name: "Informacja", exact: true });
      await button.focus();
      const tooltip = page.getByRole("tooltip"); await tooltip.waitFor();
      assert.equal(await button.getAttribute("aria-describedby"), await tooltip.getAttribute("id"));
      await page.keyboard.press("Escape"); await tooltip.waitFor({ state: "detached" });
      await button.hover(); await tooltip.waitFor();
      await page.locator("h1").hover(); await tooltip.waitFor({ state: "detached" });
    });
    await check("dialog: native last select participates in focus wrap and background focus is contained", async () => {
      await page.locator("#open-dialog").click();
      const dialog = page.getByRole("dialog", { name: "Dialog testowy", exact: true }); await dialog.waitFor();
      await dialog.getByRole("button", { name: "Zamknij", exact: true }).focus();
      await page.keyboard.press("Shift+Tab"); await focused("#native-select");
      await page.keyboard.press("Tab"); await focused('[role="dialog"] [aria-label="Zamknij"]');
      await page.evaluate(() => document.getElementById("open-dialog").focus());
      assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), true);
    });
    await check("dialog: dropdown Escape closes only dropdown; nested Escape restores outer focus", async () => {
      await page.getByRole("combobox", { name: "Lista w dialogu", exact: true }).click();
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog", { name: "Dialog testowy", exact: true }).count(), 1);
      await page.locator("#open-nested").click(); await page.getByRole("dialog", { name: "Dialog wewnętrzny", exact: true }).waitFor();
      await page.keyboard.press("Escape"); await page.getByRole("dialog", { name: "Dialog wewnętrzny", exact: true }).waitFor({ state: "detached" });
      await focused("#open-nested");
      await page.keyboard.press("Escape"); await page.getByRole("dialog", { name: "Dialog testowy", exact: true }).waitFor({ state: "detached" });
      await focused("#open-dialog");
    });
    await check("dialog: no focusable fields retain focus, non-dismissible modal ignores Escape", async () => {
      await page.locator("#open-empty").click(); await page.getByRole("dialog", { name: "Dialog bez pól", exact: true }).waitFor();
      await focused('[role="dialog"][tabindex="-1"]');
      await page.keyboard.press("Tab"); await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog", { name: "Dialog bez pól", exact: true }).count(), 1);
      await page.evaluate(() => window.closeEmpty()); await page.getByRole("dialog", { name: "Dialog bez pól", exact: true }).waitFor({ state: "detached" });
      await focused("#open-empty");
    });
    await check("button: disabled/loading prevent actions and loading is announced", async () => {
      assert.equal(await page.locator("#disabled-button").isDisabled(), true);
      assert.equal(await page.locator("#loading-button").isDisabled(), true);
      assert.equal(await page.locator("#loading-button").getAttribute("aria-busy"), "true");
      await page.evaluate(() => { document.getElementById("disabled-button").click(); document.getElementById("loading-button").click(); });
      await textEquals("#actions", "0");
    });
    await check("command palette: Tab reaches filters/results, empty arrows remain stable, Escape restores focus", async () => {
      await page.locator("#open-command").click();
      const command = page.getByRole("dialog", { name: "Wyszukiwanie i polecenia", exact: true }); await command.waitFor();
      const search = command.getByRole("textbox", { name: "Szukaj faktur, kontrahentów i poleceń", exact: true });
      await search.focus(); await page.keyboard.press("Tab");
      assert.equal(await command.getByRole("button", { name: "Wszystko", exact: true }).evaluate(element => element === document.activeElement), true);
      await search.fill("nothing-synthetic-match-9876"); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowDown");
      await search.fill(""); await command.getByRole("button", { name: "Żółć — testowy kontrahent", exact: true }).waitFor();
      await page.keyboard.press("Escape"); await command.waitFor({ state: "detached" }); await focused("#open-command");
    });
    await check("command palette: hover keeps the copy target at the same position", async () => {
      await page.mouse.move(0, 0);
      await page.locator("#open-command").click();
      await page.mouse.move(0, 0);
      const command = page.getByRole("dialog", { name: "Wyszukiwanie i polecenia", exact: true }); await command.waitFor();
      const copy = command.getByRole("button", { name: "Kopiuj NIP: 1234567890", exact: true });
      await copy.scrollIntoViewIfNeeded();
      const before = await copy.boundingBox();
      await copy.hover();
      await copy.locator("..").locator("svg.lucide-arrow-right.opacity-100").waitFor();
      const after = await copy.boundingBox();
      assert.ok(Math.abs(before.x - after.x) < 1, `Hover must not move the adjacent copy hit target (${before.x} → ${after.x})`);
      assert.ok(Math.abs(before.width - after.width) < 1, "Copy hit target must keep its width");
      await page.keyboard.press("Escape"); await command.waitFor({ state: "detached" });
    });
    await check("command palette: repeated clipboard denial reports failure and never claims copy success", async () => {
      await page.mouse.move(0, 0);
      await page.locator("#open-command").click();
      const command = page.getByRole("dialog", { name: "Wyszukiwanie i polecenia", exact: true }); await command.waitFor();
      await page.evaluate(() => {
        window.fixtureClipboardCalls = 0;
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { window.fixtureClipboardCalls++; throw new Error("Synthetic clipboard denial"); } } });
      });
      const copy = command.getByRole("button", { name: "Kopiuj NIP: 1234567890", exact: true });
      for (let attempt = 1; attempt <= 10; attempt++) {
        await page.mouse.move(0, 0);
        await copy.click();
        await page.waitForFunction(expected => window.fixtureClipboardCalls === expected, attempt);
        await page.getByText("Nie udało się skopiować NIP", { exact: true }).first().waitFor();
        assert.equal(await copy.locator("svg.lucide-check").count(), 0);
        assert.equal(await command.count(), 1, "Copy must not accidentally activate row navigation");
      }
      await page.keyboard.press("Escape"); await command.waitFor({ state: "detached" });
    });
    await check("notifications: failed writes report error, retain unread state and Escape restores trigger", async () => {
      await page.evaluate(() => { window.failNotificationWrites = true; });
      const trigger = page.getByRole("button", { name: "Powiadomienia (2 nieprzeczytanych)", exact: true });
      await trigger.click();
      const popup = page.getByRole("dialog", { name: "Powiadomienia", exact: true }); await popup.waitFor();
      await popup.getByRole("button", { name: "Przeczytane", exact: true }).click();
      await page.getByText("Nie oznaczono wszystkich powiadomień", { exact: true }).waitFor();
      assert.equal(await page.getByText("Oznaczono jako przeczytane", { exact: true }).count(), 0);
      assert.equal(await trigger.count(), 1);
      await page.keyboard.press("Escape"); await popup.waitFor({ state: "detached" });
      assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
    });
    await check("select: native validation proxy cannot escape an unpositioned horizontal table scroller", async () => {
      await page.setViewportSize({ width: 320, height: 900 });
      // Move the already-mounted real Select form within the React root. This
      // synthetic layout exercises the shared component, without introducing a
      // second component implementation or changing the production application.
      await page.evaluate(() => {
        const form = document.getElementById("select-form");
        const main = form.closest("main");
        for (const child of main.children) if (child !== form) child.style.display = "none";
        main.style.cssText = "display:block;margin:0;padding:16px;max-width:none;width:100%;box-sizing:border-box";
        const scroller = document.createElement("div");
        scroller.id = "unpositioned-select-scroller";
        scroller.style.cssText = "position:static;overflow-x:auto;width:100%";
        const table = document.createElement("table");
        table.style.cssText = "position:static;width:960px;min-width:960px;table-layout:fixed;border-collapse:collapse";
        const row = table.insertRow();
        for (let index = 0; index < 4; index++) {
          const cell = row.insertCell();
          cell.style.cssText = "position:static;width:240px;vertical-align:top";
          if (index < 3) cell.textContent = `Syntetyczna kolumna ${index + 1}`;
          else cell.append(form);
        }
        scroller.append(table); main.append(scroller);
      });
      const geometry = () => page.evaluate(() => {
        const scroller = document.getElementById("unpositioned-select-scroller");
        const native = document.querySelector('#select-form select[aria-hidden="true"]');
        const style = getComputedStyle(native);
        return {
          viewport: window.innerWidth,
          documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          scrollerWidth: scroller.clientWidth, contentWidth: scroller.scrollWidth,
          scrollerPosition: getComputedStyle(scroller).position,
          left: native.style.left, top: native.style.top,
          ariaHidden: native.getAttribute("aria-hidden"), tabIndex: native.tabIndex,
          proxyPosition: style.position, proxyWidth: style.width, proxyHeight: style.height,
          proxyClip: style.clip,
        };
      });
      const fixedBefore = await geometry();
      assert.equal(fixedBefore.scrollerPosition, "static", "The fixture must not supply a positioned-parent workaround");
      assert.ok(fixedBefore.contentWidth > fixedBefore.scrollerWidth, "The table must genuinely overflow inside its own scroller");
      assert.equal(fixedBefore.left, "0px"); assert.equal(fixedBefore.top, "0px");
      assert.ok(fixedBefore.documentWidth <= fixedBefore.viewport, `Fixed proxy caused document overflow: ${JSON.stringify(fixedBefore)}`);
      assert.equal(fixedBefore.ariaHidden, "true"); assert.equal(fixedBefore.tabIndex, -1);
      assert.equal(fixedBefore.proxyPosition, "absolute");
      assert.equal(fixedBefore.proxyWidth, "1px"); assert.equal(fixedBefore.proxyHeight, "1px");
      assert.equal(fixedBefore.proxyClip, "rect(0px, 0px, 0px, 0px)");
      // Causal DOM recreation of the prior missing-anchor styles; this is not
      // represented as a test of an older compiled application build.
      await page.locator('#select-form select[aria-hidden="true"]').evaluate(native => {
        native.style.removeProperty("left"); native.style.removeProperty("top");
      });
      const oldStyleRecreation = await geometry();
      const oldStyleReproducesDocumentOverflow = oldStyleRecreation.documentWidth > oldStyleRecreation.viewport;
      // Chromium reproduces the production-table failure. Engines differ in
      // clipping an absolutely positioned descendant whose containing block
      // lies outside the scroller; do not claim Firefox has the same old bug.
      if (browser.browserType().name() === "chromium") {
        assert.ok(oldStyleReproducesDocumentOverflow, `Missing anchors did not reproduce the known Chromium overflow: ${JSON.stringify(oldStyleRecreation)}`);
      }
      await page.locator('#select-form select[aria-hidden="true"]').evaluate(native => {
        native.style.left = "0px"; native.style.top = "0px";
      });
      assert.ok((await geometry()).documentWidth <= fixedBefore.viewport, "Restoring only the proxy anchors must remove global overflow");
      const trigger = page.locator("#required-select");
      await trigger.focus(); await page.keyboard.press("Home"); await page.keyboard.press("Enter");
      await page.waitForFunction(() => new FormData(document.getElementById("select-form")).get("choice") === "");
      await page.locator("#submit-select").click(); await textEquals("#submits", "1");
      await focused("#required-select");
      assert.equal(await trigger.getAttribute("aria-invalid"), "true");
      assert.equal(await page.locator('#select-form select[aria-hidden="true"]').evaluate(native => native.validity.valueMissing), true);
      await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
      await page.waitForFunction(() => new FormData(document.getElementById("select-form")).get("choice") === "polish");
      await page.locator("#submit-select").click(); await textEquals("#submits", "2");
      assert.equal(await trigger.getAttribute("aria-invalid"), null);
      const fixedAfter = await geometry();
      assert.ok(fixedAfter.documentWidth <= fixedAfter.viewport, "Focus, validation and successful submission must keep overflow inside the table");
      await page.setViewportSize({ width: 1024, height: 900 });
      return { experiment: "Prior styles recreated in the current fixture DOM, not an older compiled build", oldStyleReproducesDocumentOverflow, fixedBefore, oldStyleRecreation, fixedAfter };
    });
    await check("page guide: native keyboard toggle works when optional browser storage throws", async () => {
      await page.addInitScript(() => {
        Object.defineProperty(Storage.prototype, "getItem", { configurable: true, value: () => { throw new DOMException("Synthetic storage blocked", "SecurityError"); } });
        Object.defineProperty(Storage.prototype, "setItem", { configurable: true, value: () => { throw new DOMException("Synthetic storage blocked", "SecurityError"); } });
      });
      await page.reload();
      const guide = page.getByRole("button", { name: /Testowy przewodnik/ }); await guide.waitFor(); await guide.focus();
      await page.keyboard.press("Enter"); await page.getByText("Krok testowy", { exact: true }).waitFor();
      assert.equal(await guide.getAttribute("aria-expanded"), "true");
      await page.keyboard.press("Space"); await page.getByText("Krok testowy", { exact: true }).waitFor({ state: "detached" });
    });
    assert.deepEqual(consoleErrors, [], "Fixture has browser/React console errors");
    const result = { browser: browser.browserType().name(), scope: "synthetic shared primitives, not full application UI", checks, consoleErrors };
    if (outputPath) await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally { await context.close(); await new Promise(resolve => server.close(resolve)); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
  const { chromium, firefox, webkit } = await import("playwright");
  for (const type of [chromium, firefox, webkit]) {
    const browser = await type.launch({ headless: true });
    try { const result = await auditUiPrimitives(browser, { outputPath: `/tmp/faktura-ui-${type.name()}.json` }); console.log(`[ui-primitives] PASS ${type.name()}: ${result.checks.length} regressions`); }
    finally { await browser.close(); }
  }
  if (fixturePromise) await rm((await fixturePromise).output, { recursive: true, force: true });
}
