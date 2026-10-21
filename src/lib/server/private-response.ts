import "server-only";
import { createHash } from "node:crypto";
import { json } from "@/lib/api";

/** A validator of a freshly authorised read, never a shared cache or an access token. */
export function privateEtag(data: unknown) {
  return '"' + createHash("sha256").update(JSON.stringify(data)).digest("hex") + '"';
}

/** Call only AFTER session, company permissions and current data have been read. */
export function privateResponse(req: Request, data: unknown, etag = privateEtag(data)) {
  const headers = { "Cache-Control": "no-store", ETag: etag, Vary: "Cookie" };
  return req.headers.get("if-none-match") === etag
    ? new Response(null, { status: 304, headers })
    : json(data, { headers });
}
