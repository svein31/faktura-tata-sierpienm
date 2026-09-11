import { NextRequest, NextResponse } from "next/server";
import { getEffectiveNbpRate } from "@/lib/nbp";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const currency = searchParams.get("currency") || "EUR";
  const date = searchParams.get("date") || undefined;

  const result = await getEffectiveNbpRate(currency, date);

  if (!result) {
    return NextResponse.json(
      { error: `Nie udało się pobrać kursu NBP dla ${currency}` },
      { status: 404 }
    );
  }

  return NextResponse.json(result);
}
