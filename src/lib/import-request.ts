import { ApiError } from "@/lib/api";

/** Enforce the actual body limit, including requests without Content-Length. */
export async function readImportRequest(req: Request, limit: number) {
  if (Number(req.headers.get("content-length") || 0) > limit) throw new ApiError(413, "Plik importu jest za duży.");
  const reader = req.body?.getReader(), chunks: Uint8Array[] = [];
  if (!reader) throw new ApiError(400, "Brak pliku lub danych importu.");
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new ApiError(413, "Plik importu jest za duży."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}
export async function readImportJson(req: Request) {
  const bytes = await readImportRequest(req, 1_600_000);
  try {
    const data: unknown = JSON.parse(bytes.toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch { throw new ApiError(400, "Nieprawidłowe dane JSON."); }
}
