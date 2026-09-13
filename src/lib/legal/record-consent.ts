/**
 * src/lib/legal/record-consent.ts
 * 
 * Serwerowa rejestracja akceptacji i wycofania zgód prawnych
 * z zachowaniem zasady minimalizacji danych (anonimizacja IP wg art. 5 ust. 1 lit. c RODO).
 */

import { prisma } from "@/lib/prisma";

export interface RecordConsentInput {
  userId: string;
  documentType:
    | "terms_of_service"
    | "privacy_policy"
    | "dpa"
    | "marketing_email"
    | "cookie_functional"
    | "cookie_analytics"
    | "cookie_marketing";
  documentVersion: string;
  accepted: boolean;
  rawIp?: string | null;
  userAgent?: string | null;
  context?: "registration" | "invite_accept" | "terms_update_modal" | "settings" | "cookie_banner";
  companyId?: string | null;
}

/**
 * Anonimizacja adresu IP w celu ochrony prywatności:
 * - IPv4: zerowanie ostatniego oktetu (np. 192.0.2.54 -> 192.0.2.0/24)
 * - IPv6: zachowanie tylko pierwszych 3 bloków (/48)
 */
export function anonymizeIp(ip?: string | null): string | null {
  if (!ip) return null;
  const clean = ip.trim();

  // IPv4
  if (clean.includes(".")) {
    const parts = clean.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    }
  }

  // IPv6
  if (clean.includes(":")) {
    const parts = clean.split(":");
    if (parts.length >= 3) {
      return `${parts[0]}:${parts[1]}:${parts[2]}::/48`;
    }
  }

  return "anonymized";
}

/**
 * Trwałe zarejestrowanie zgody lub jej wycofania w bazie danych.
 */
export async function recordLegalConsent(input: RecordConsentInput) {
  try {
    const consent = await prisma.legalConsent.create({
      data: {
        userId: input.userId,
        documentType: input.documentType,
        documentVersion: input.documentVersion,
        accepted: input.accepted,
        acceptedAt: new Date(),
        revokedAt: input.accepted ? null : new Date(),
        ipAddress: anonymizeIp(input.rawIp),
        userAgent: input.userAgent ? input.userAgent.slice(0, 255) : null,
        context: input.context || "registration",
        companyId: input.companyId || null,
      },
    });

    // Jeśli to akceptacja regulaminu, zaktualizuj także skrótowe pola w modelu User
    if (input.documentType === "terms_of_service" && input.accepted) {
      await prisma.user.update({
        where: { id: input.userId },
        data: {
          termsAcceptedAt: new Date(),
          termsAcceptedVersion: input.documentVersion,
        },
      });
    }

    return { success: true, consentId: consent.id };
  } catch (error) {
    console.error("[RecordLegalConsent] Błąd rejestracji zgody:", error);
    return { success: false, error: (error as Error).message };
  }
}
