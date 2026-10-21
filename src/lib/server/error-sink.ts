import "server-only";
import { after } from "next/server";
import { persistDiagnostic, productRevision } from "./product-observability";
/** Installed only by Next's Node instrumentation, never imported by client-side validators. */
export function installServerErrorSink() {
  const host = globalThis as unknown as { fakturaprostoErrorSink?: (event: { incident: string; fingerprint: string; errorCode?: string }) => void };
  host.fakturaprostoErrorSink = event => {
    try {
      after(() => persistDiagnostic({ kind: "server", name: "ServerError", screen: "server", fingerprint: event.fingerprint.padStart(8, "0"), revision: productRevision(), device: "server", browser: "none", ...(event.errorCode ? { prismaCode: event.errorCode } : {}) }, event.incident).then(() => {}).catch(() => {}));
    } catch { /* Outside a request, the existing structured host log remains available. */ }
  };
}
