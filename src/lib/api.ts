import { NextResponse } from "next/server";

/** Błąd aplikacji z kodem HTTP — rzucany w route handlerach i łapany przez handleApiError. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function json(data: unknown, init?: { status?: number; headers?: Record<string, string> }): NextResponse {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await req.json()) as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new ApiError(400, "Nieprawidłowe body JSON.");
    }
    return body as Record<string, unknown>;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "Nieprawidłowe body JSON.");
  }
}

export function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function bool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Walidacja stringa z limitem długości (anty-spam / anty-injection pól). */
export function cleanStr(v: unknown, maxLen: number, field: string): string {
  if (v === undefined || v === null) return ""; // pola opcjonalne
  if (typeof v !== "string") throw new ApiError(400, `Pole „${field}” musi być tekstem.`);
  const s = v.trim();
  if (s.length > maxLen) throw new ApiError(400, `Pole „${field}” jest za długie (max ${maxLen}).`);
  return s;
}

export function handleApiError(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return json({ error: e.message, code: e.code ?? "BAD_REQUEST" }, { status: e.status });
  }
  // Unikalność e-mail (P2002) — ogólny komunikat (brak enumeracji użytkowników).
  const code = (e as { code?: string })?.code;
  if (code === "P2025" || code === "P2034") return json({ error: "Dokument zmienił się w trakcie operacji. Odśwież dane.", code: "CONFLICT" }, { status: 409 });
  if (code === "P2002") {
    return json(
      { error: "Nie udało się utworzyć konta. Spróbuj ponownie.", code: "CONFLICT" },
      { status: 409 }
    );
  }
  console.error("[api-error]", e);
  return json({ error: "Wewnętrzny błąd serwera.", code: "INTERNAL" }, { status: 500 });
}
