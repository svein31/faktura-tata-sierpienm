// Operator-only smoke against the MF TEST environment. One prepared test invoice, one send.
// Credentials stay in operator environment; no production or demo fallback is permitted.
const base = process.env.KSEF_SMOKE_BASE_URL;
const cookie = process.env.KSEF_SMOKE_COOKIE;
const companyId = process.env.KSEF_SMOKE_COMPANY_ID;
const invoiceId = process.env.KSEF_SMOKE_INVOICE_ID;
if (!base || !/^https:\/\//.test(base) || !cookie || !/^[a-f\d]{24}$/i.test(companyId || "") || !/^[a-f\d]{24}$/i.test(invoiceId || "") || process.env.KSEF_SMOKE_SEND !== "test") {
  console.error("Set HTTPS KSEF_SMOKE_BASE_URL, KSEF_SMOKE_COOKIE, KSEF_SMOKE_COMPANY_ID, KSEF_SMOKE_INVOICE_ID and KSEF_SMOKE_SEND=test.");
  process.exit(2);
}
const root = new URL(base);
const request = async (path, body) => {
  const response = await fetch(new URL(path, root), { method: body ? "POST" : "GET", headers: { Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return data;
};
try {
  const connection = await request("/api/ksef/test-connection", { companyId, environment: "test" });
  if (connection.environment !== "test" || !connection.ok || !connection.authTested || !connection.authSuccess) throw new Error("MF test gateway/auth check failed");
  console.log(JSON.stringify({ step: "test_gateway_and_auth", ok: true }));
  const sent = await request("/api/ksef/send", { invoiceId, environment: "test" });
  if (!sent.success || sent.demo === true || sent.environment !== "test") throw new Error("Test invoice send failed");
  console.log(JSON.stringify({ step: "test_invoice_submitted", ok: true }));
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const status = await request(`/api/ksef/status/${invoiceId}`);
    if (status.status === "ACCEPTED" && status.ksefReferenceNumber && status.hasUpo) {
      console.log(JSON.stringify({ step: "test_invoice_accepted_and_upo", ok: true }));
      process.exit(0);
    }
    if (status.status === "REJECTED") throw new Error("MF rejected the test invoice; inspect it in the application");
    await new Promise(resolve => setTimeout(resolve, 3_000));
  }
  throw new Error("MF result pending; reconcile the invoice in KSeF before any new submission");
} catch (error) {
  // Do not print response payloads, invoice numbers, cookies or URLs.
  console.error(JSON.stringify({ kind: "ksef_test_smoke", ok: false, reason: error instanceof Error ? error.message.replace(/\/api\/ksef\/status\/[^:]+/, "/api/ksef/status/[redacted]") : "Unexpected error" }));
  process.exitCode = 1;
}
