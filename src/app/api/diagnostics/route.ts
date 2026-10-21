import { json } from "@/lib/api";
import { isUnsafeCrossOrigin } from "@/lib/csrf";
import { rateLimitShared, rateLimitSubject } from "@/lib/rate-limit";
import { boundedJson, normalizeDiagnostic } from "@/lib/product-diagnostics";
import { persistDiagnostic, productRevision } from "@/lib/server/product-observability";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if (isUnsafeCrossOrigin(req)) return json({ ok: false }, { status: 403 });
  let event; try { event = normalizeDiagnostic(await boundedJson(req, 1024)); } catch { return json({ ok: false }, { status: 400 }); }
  if (!event) return json({ ok: false }, { status: 400 });
  try {
    if (!(await rateLimitShared(req, { max: 15, windowMs: 60000 }, "product-diagnostic")).allowed || !(await rateLimitSubject("site", { max: 300, windowMs: 60000 }, "product-diagnostic-global")).allowed) return json({ ok: false }, { status: 429 });
    // The client revision is useful for stale tabs; the deployed revision is trusted separately.
    const incident = await persistDiagnostic(event);
    return json({ ok: true, incident, deployedRevision: productRevision() });
  } catch { return json({ ok: false }, { status: 503 }); }
}
