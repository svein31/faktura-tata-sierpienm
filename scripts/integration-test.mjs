#!/usr/bin/env node
/**
 * Test integracyjny (przez HTTP) — dwa konta użytkowników, izolacja danych,
 * pusty bootstrap nowego użytkownika, powiadomienia, auth.
 *
 * Przepływ:
 *  1. buduje .next (jeśli brak), tworzy CZYSTĄ bazę testową (SQLite),
 *  2. uruchamia serwer (app.js / next start) na losowym porcie,
 *  3. wykonuje scenariusze HTTP (register/login/data/CRUD/izolacja/notifications),
 *  4. zatrzymuje serwer i raportuje wynik (exit code).
 *
 * Uruchomienie: npm run test:integration
 */

import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DB_PATH = path.join(mkdtempSync(path.join(os.tmpdir(), "fakturo-test-")), "test.db");
const DB_URL = `file:${DB_PATH}`;
const PORT = 3900 + Math.floor(Math.random() * 500);

const BASE = `http://127.0.0.1:${PORT}`;
let server = null;
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  ✔" : "  ✘"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then((v) => {
      record(name, true);
      return v;
    })
    .catch((e) => {
      record(name, false, e.message);
      throw e;
    });
}

async function api(method, urlPath, { body, cookie } = {}) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* pusta odpowiedź */
  }
  return { res, data };
}

function cookieOf(res) {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const sc = setCookies.find((c) => c.startsWith("fakturo_session="));
  return sc ? sc.split(";")[0] : "";
}

function waitFor(fn, timeoutMs = 60000, intervalMs = 500) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const v = await fn();
        if (v) return resolve(v);
      } catch {
        /* retry */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error("timeout"));
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

async function main() {
  console.log(`\n[Fakturo] Test integracyjny — DB: ${DB_PATH} · port: ${PORT}\n`);

  // 0. Przygotuj bazę testową (schema) i zbuduj aplikację (jeśli brak .next).
  console.log("[setup] prisma db push (test DB)…");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", "db", "push", "--skip-generate"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
    shell: true,
  });
  console.log("[setup] db push OK");

  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    console.log("[setup] brak .next — uruchamiam npm run build…");
    execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], { cwd: ROOT, stdio: "pipe", shell: true });
  }

  // 1. Start serwera.
  console.log("[setup] start serwera…");
  server = spawn(process.execPath, [path.join(ROOT, "app.js")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB_URL },
    stdio: "inherit",
  });

  await waitFor(async () => {
    try {
      const r = await fetch(`${BASE}/api/health`);
      return r.ok;
    } catch {
      return false;
    }
  }, 90000);
  console.log("[setup] serwer gotowy (health OK)\n");

  // ── Scenariusze ──────────────────────────────────────────────────────────
  const emailA = `user-a-${Date.now()}@test.local`;
  const emailB = `user-b-${Date.now()}@test.local`;
  const password = "Haslo12345!";
  let cookieA = "";
  let cookieB = "";
  let invoiceAId = "";
  let notificationId = "";

  try {
    // 1. Health publiczny (bez auth).
    await check("GET /api/health publiczny (bez sesji)", async () => {
      const r = await fetch(`${BASE}/api/health`);
      assert.equal(r.status, 200);
      const j = await r.json();
      assert.equal(j.ok, true);
      assert.equal(j.db, "ok");
    });

    // 2. /api/data bez sesji → 401.
    await check("GET /api/data bez sesji → 401", async () => {
      const { res } = await api("GET", "/api/data");
      assert.equal(res.status, 401);
    });

    // 3. Rejestracja użytkownika A.
    const regA = await check("POST /api/auth/register (użytkownik A)", async () => {
      const { res, data } = await api("POST", "/api/auth/register", {
        body: { name: "Użytkownik A", email: emailA, password },
      });
      assert.equal(res.status, 201);
      assert.ok(data.user?.id);
      assert.equal(data.user.email, emailA);
      const c = cookieOf(res);
      assert.ok(c, "brak cookie sesji");
      cookieA = c;
      return data;
    });

    // 4. Bootstrap A — PUSTE dane (brak seedu dla nowego użytkownika).
    await check("GET /api/data (A) — pusty bootstrap (0 faktur/kontrahentów/produktów)", async () => {
      const { res, data } = await api("GET", "/api/data", { cookie: cookieA });
      assert.equal(res.status, 200);
      assert.equal(data.invoices.length, 0);
      assert.equal(data.contractors.length, 0);
      assert.equal(data.products.length, 0);
      assert.equal(data.company.name, "", "profil firmy ma być pusty");
      assert.equal(data.ksef.environment, "demo");
      assert.deepEqual(data.notificationPrefs, { browserEnabled: false, soundEnabled: true });
    });

    // 5. Rejestracja użytkownika B.
    const regB = await check("POST /api/auth/register (użytkownik B)", async () => {
      const { res, data } = await api("POST", "/api/auth/register", {
        body: { name: "Użytkownik B", email: emailB, password },
      });
      assert.equal(res.status, 201);
      assert.ok(data.user?.id);
      const c = cookieOf(res);
      assert.ok(c);
      cookieB = c;
      return data;
    });
    assert.notEqual(regA.user.id, regB.user.id, "użytkownicy muszą mieć różne id");

    // 6. Duplikat e-mail → 409 z ogólnym komunikatem (brak enumeracji).
    await check("POST /api/auth/register duplikat e-mail → 409 (ogólny komunikat)", async () => {
      const { res, data } = await api("POST", "/api/auth/register", {
        body: { name: "Ktoś", email: emailA, password },
      });
      assert.equal(res.status, 409);
      assert.ok(!/istnieje|zajęty/i.test(data.error ?? ""), "komunikat nie może zdradzać stanu konta");
    });

    // 7. Zły e-mail → 401 (login), taki sam komunikat jak złe hasło.
    await check("POST /api/auth/login złe dane → 401", async () => {
      const { res, data } = await api("POST", "/api/auth/login", {
        body: { email: emailA, password: "ZleHaslo123" },
      });
      assert.equal(res.status, 401);
      assert.ok(data.code === "INVALID_CREDENTIALS");
    });

    // 8. Login A.
    await check("POST /api/auth/login (A) + GET /api/auth/me", async () => {
      const { res, data } = await api("POST", "/api/auth/login", {
        body: { email: emailA, password },
      });
      assert.equal(res.status, 200);
      assert.equal(data.user.email, emailA);
      const c = cookieOf(res);
      assert.ok(c);
      cookieA = c;
      const me = await api("GET", "/api/auth/me", { cookie: cookieA });
      assert.equal(me.res.status, 200);
      assert.equal(me.data.user.email, emailA);
    });

    // 9. A tworzy kontrahenta + fakturę.
    const contractor = await check("POST /api/contractors (A)", async () => {
      const { res, data } = await api("POST", "/api/contractors", {
        cookie: cookieA,
        body: {
          name: "DemoIT Solutions Sp. z o.o.",
          nip: "5270000024",
          address: { street: "ul. Przykładowa 1", city: "Warszawa", postal: "00-001", country: "PL" },
          isVatPayer: true,
        },
      });
      assert.equal(res.status, 201);
      assert.ok(data.contractor?.id);
      return data.contractor;
    });

    const invoiceA = await check("POST /api/invoices (A) — faktura FV", async () => {
      const { res, data } = await api("POST", "/api/invoices", {
        cookie: cookieA,
        body: {
          number: `FV/${new Date().getFullYear()}/0001`,
          type: "sale",
          status: "issued",
          contractorId: contractor.id,
          issueDate: "2026-08-01",
          saleDate: "2026-08-01",
          dueDate: "2026-08-15",
          currency: "PLN",
          language: "PL",
          paymentMethod: "transfer",
          paymentTermDays: 14,
          lines: [{ name: "Usługa programistyczna", quantity: 2, unit: "md", netPrice: 1200, vatRate: "23" }],
        },
      });
      assert.equal(res.status, 201);
      assert.ok(data.invoice?.id);
      invoiceAId = data.invoice.id;
      return data.invoice;
    });

    // 10. IZOLACJA: B nie widzi faktury A (bootstrap + bezpośredni dostęp).
    await check("IZOLACJA: bootstrap B — brak faktur/kontrahentów A", async () => {
      const { res, data } = await api("GET", "/api/data", { cookie: cookieB });
      assert.equal(res.status, 200);
      assert.equal(data.invoices.length, 0);
      assert.equal(data.contractors.length, 0);
    });

    await check("IZOLACJA: GET /api/invoices/{idA} jako B → 404", async () => {
      const { res } = await api("GET", `/api/invoices/${invoiceAId}`, { cookie: cookieB });
      assert.equal(res.status, 404);
    });

    await check("IZOLACJA: PUT /api/invoices/{idA} jako B → 404", async () => {
      const { res } = await api("PUT", `/api/invoices/${invoiceAId}`, {
        cookie: cookieB,
        body: { ...invoiceA, status: "paid" },
      });
      assert.equal(res.status, 404);
    });

    await check("IZOLACJA: DELETE /api/invoices/{idA} jako B → 404", async () => {
      const { res } = await api("DELETE", `/api/invoices/${invoiceAId}`, { cookie: cookieB });
      assert.equal(res.status, 404);
    });

    await check("IZOLACJA: A nadal widzi swoją fakturę (200)", async () => {
      const { res } = await api("GET", `/api/invoices/${invoiceAId}`, { cookie: cookieA });
      assert.equal(res.status, 200);
    });

    // 11. Profil firmy B — zapis; A nadal ma pusty profil (izolacja ustawień).
    await check("PUT /api/company (B) — izolacja profilu firmy", async () => {
      const { res, data } = await api("PUT", "/api/company", {
        cookie: cookieB,
        body: { name: "Firma B Sp. z o.o.", nip: "5260301706", city: "Warszawa" },
      });
      assert.equal(res.status, 200);
      assert.equal(data.company.name, "Firma B Sp. z o.o.");
      const a = await api("GET", "/api/data", { cookie: cookieA });
      assert.equal(a.data.company.name, "", "profil A musi pozostać pusty");
    });

    // 12. Symulacja faktury zakupowej z KSeF (A) → FZ + notification.
    await check("POST /api/ksef/simulate-purchase (A) — FZ + powiadomienie", async () => {
      const { res, data } = await api("POST", "/api/ksef/simulate-purchase", { cookie: cookieA });
      assert.equal(res.status, 201);
      assert.equal(data.invoice.type, "purchase");
      assert.ok(/^FZ\//.test(data.invoice.number));
      assert.ok(data.notification?.id);
      assert.equal(data.notification.kind, "invoice_purchase");
      notificationId = data.notification.id;
    });

    await check("GET /api/notifications (A) — nieprzeczytane ≥ 1", async () => {
      const { res, data } = await api("GET", "/api/notifications", { cookie: cookieA });
      assert.equal(res.status, 200);
      assert.ok(data.unread >= 1);
      assert.ok(data.notifications.some((n) => n.kind === "invoice_purchase"));
    });

    await check("IZOLACJA: GET /api/notifications (B) — brak powiadomień A", async () => {
      const { res, data } = await api("GET", "/api/notifications", { cookie: cookieB });
      assert.equal(res.status, 200);
      assert.ok(!data.notifications.some((n) => n.id === notificationId));
    });

    await check("PUT /api/notifications/{id} read (A)", async () => {
      const { res, data } = await api("PUT", `/api/notifications/${notificationId}`, {
        cookie: cookieA,
        body: { read: true },
      });
      assert.equal(res.status, 200);
      assert.equal(data.notification.read, true);
    });

    // 13. KSeF send — wymaga auth; demo zapisuje status faktury.
    await check("POST /api/ksef/send bez sesji → 401", async () => {
      const { res } = await api("POST", "/api/ksef/send", {
        body: { xml: "<Faktura>…</Faktura>", environment: "demo", invoiceId: invoiceAId },
      });
      assert.equal(res.status, 401);
    });

    await check("POST /api/ksef/send (A, demo) — status zapisany na fakturze", async () => {
      const { res, data } = await api("POST", "/api/ksef/send", {
        cookie: cookieA,
        body: { xml: "<Faktura><DowodSprzedazy>x</DowodSprzedazy></Faktura>", environment: "demo", invoiceId: invoiceAId },
      });
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.ok(data.ksefNumber);
      assert.equal(data.invoice.status, "ksef_sent");
      assert.ok(data.invoice.ksef?.number);
    });

    // 14. Preferencje powiadomień.
    await check("PUT /api/notifications/preferences (A)", async () => {
      const { res, data } = await api("PUT", "/api/notifications/preferences", {
        cookie: cookieA,
        body: { browserEnabled: true, soundEnabled: false },
      });
      assert.equal(res.status, 200);
      assert.equal(data.notificationPrefs.browserEnabled, true);
      assert.equal(data.notificationPrefs.soundEnabled, false);
    });

    // 15. Logout + sesja unieważniona.
    await check("POST /api/auth/logout (A) → stary cookie nie działa", async () => {
      const { res } = await api("POST", "/api/auth/logout", { cookie: cookieA });
      assert.equal(res.status, 200);
      const after = await api("GET", "/api/data", { cookie: cookieA });
      assert.equal(after.res.status, 401);
    });

    // 16. Testowy endpoint powiadomień (test/incoming).
    await check("POST /api/test/incoming (B) — powiadomienie testowe", async () => {
      const { res, data } = await api("POST", "/api/test/incoming", { cookie: cookieB });
      assert.equal(res.status, 201);
      assert.equal(data.notification.kind, "test");
    });
  } catch (e) {
    console.error("\n[Fakturo] Test przerwany z powodu błędu:", e.message);
  } finally {
    if (server) server.kill("SIGTERM");
  }

  // ── Raport ───────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log(`\n[Fakturo] Wynik: ${results.length - failed.length}/${results.length} testów OK`);
  if (failed.length > 0) {
    console.log("Nieudane testy:");
    for (const f of failed) console.log(`  ✘ ${f.name} — ${f.detail}`);
  }
  rmSync(path.dirname(DB_PATH), { recursive: true, force: true });
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  if (server) server.kill("SIGTERM");
  process.exit(1);
});
