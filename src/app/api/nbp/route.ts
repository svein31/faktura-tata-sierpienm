import { NextRequest, NextResponse } from "next/server";
import { getEffectiveNbpRate, NbpApiError } from "@/lib/nbp";
import type { ExchangeRateRule } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const currency = searchParams.get("currency") || "EUR";
    const issueDate = searchParams.get("issueDate") || new Date().toISOString().slice(0, 10);
    const saleDate = searchParams.get("saleDate") || issueDate;
    const taxPointDate = searchParams.get("taxPointDate") || undefined;
    const rule = (searchParams.get("rule") as ExchangeRateRule) || undefined;

    const result = await getEffectiveNbpRate({
      currency,
      issueDate,
      saleDate,
      taxPointDate,
      rule,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof NbpApiError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "NBP_API_ERROR",
          statusCode: error.statusCode || 502,
        },
        { status: error.statusCode && error.statusCode < 500 ? error.statusCode : 502 }
      );
    }

    return NextResponse.json(
      {
        error: error?.message || "Nie udało się ustalić kursu NBP dla wskazanych parametrów.",
        code: "NBP_CALCULATION_ERROR",
      },
      { status: 400 }
    );
  }
}
