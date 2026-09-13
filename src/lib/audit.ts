import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "tokenhash",
  "kseftoken",
  "secret",
  "sessiontoken",
  "accesstoken",
  "refreshtoken",
  "authenticationtoken",
  "apikey",
  "privatekey",
]);

/**
 * Usuwa hasła, tokeny i sekrety przed zapisem w historii audytowej.
 */
export function sanitizeAuditData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map(sanitizeAuditData);
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes("password") || lowerKey.includes("token")) {
      result[key] = "[UKRYTO_ZE_WZGLĘDÓW_BEZPIECZEŃSTWA]";
    } else if (typeof value === "object") {
      result[key] = sanitizeAuditData(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export interface RecordAuditParams {
  companyId?: string | null;
  documentId?: string | null;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  description?: string;
  diff?: Record<string, { old: any; new: any; label?: string }> | null;
  details?: any;
  client?: any;
}

/**
 * Zapisuje niezmienne zdarzenie audytowe w bazie danych.
 * Tożsamość wykonawcy jest utrwalana w snapshotcie (`userName`, `userEmail`),
 * dzięki czemu usunięcie użytkownika nie niszczy historii.
 */
export async function recordAuditLog(params: RecordAuditParams) {
  const db = (params.client || defaultPrisma) as PrismaClient;

  const sanitizedDiff = params.diff ? sanitizeAuditData(params.diff) : null;
  const sanitizedDetails = params.details ? sanitizeAuditData(params.details) : null;

  return db.auditLog.create({
    data: {
      companyId: params.companyId || null,
      documentId: params.documentId || null,
      userId: params.userId || null,
      userName: params.userName || "System",
      userEmail: params.userEmail || null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      description: params.description || null,
      diff: sanitizedDiff,
      details: sanitizedDetails,
    },
  });
}

/**
 * Pomocnik do wyliczania różnic pomiędzy starym a nowym stanem obiektu.
 */
export function buildFieldDiff(
  oldObj: Record<string, any>,
  newObj: Record<string, any>,
  fieldLabels: Record<string, string>
): { diff: Record<string, { old: any; new: any; label: string }>; changesSummary: string[] } {
  const diff: Record<string, { old: any; new: any; label: string }> = {};
  const changesSummary: string[] = [];

  for (const [key, label] of Object.entries(fieldLabels)) {
    if (newObj[key] !== undefined && oldObj[key] !== undefined) {
      const oldVal = oldObj[key];
      const newVal = newObj[key];

      // Porównanie wartości
      const isDifferent =
        typeof oldVal === "object"
          ? JSON.stringify(oldVal) !== JSON.stringify(newVal)
          : String(oldVal ?? "") !== String(newVal ?? "");

      if (isDifferent) {
        diff[key] = {
          old: oldVal,
          new: newVal,
          label,
        };
        changesSummary.push(`zmienił(a) ${label.toLowerCase()} z "${oldVal ?? 'brak'}" na "${newVal ?? 'brak'}"`);
      }
    }
  }

  return { diff, changesSummary };
}
