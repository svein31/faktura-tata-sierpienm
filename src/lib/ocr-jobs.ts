import { ensureDocumentSafety } from "@/lib/document-safety";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { objectId } from "@/lib/company-scope";
import { recordAuditLog } from "@/lib/audit";
import { ocrSpace, OcrProviderError, type OcrProvider } from "@/lib/ocr-provider";

async function access(tx: Prisma.TransactionClient, userId: string, companyId: unknown) {
  try { return await companyAccess(tx, userId, companyId, "canIssueInvoices"); }
  catch (e) { if (!(e instanceof ApiError) || e.status !== 403) throw e; return companyAccess(tx, userId, companyId, "canExport"); }
}

export async function enqueueOcr(userId: string, id: string) {
  if (!objectId(id)) throw new ApiError(404, "Nie znaleziono dokumentu.");
  const original = await prisma.expenseScan.findUnique({ where: { id } });
  if (!original) throw new ApiError(404, "Nie znaleziono oryginału.");
  await access(prisma, userId, original.companyId);
  await ensureDocumentSafety(original);
  return prisma.$transaction(async tx => {
    const record = await tx.expenseScan.findUnique({ where: { id } });
    if (!record?.imageData) throw new ApiError(404, "Nie znaleziono oryginału.");
    const { company } = await access(tx, userId, record.companyId);
    if (record.expenseId || ["converted", "rejected"].includes(record.status)) throw new ApiError(409, "Dokument ma już zapisaną decyzję.");
    const existing = await tx.ocrJob.findUnique({ where: { id } });
    if (existing && ["queued", "processing"].includes(existing.status) && existing.scanVersion === record.version) return { id, status: existing.status, alreadyQueued: true };
    const scan = await tx.expenseScan.update({ where: { id, version: record.version }, data: { status: "queued", version: { increment: 1 }, errorMessage: null } });
    const data = { companyId: company.id, userId, scanVersion: scan.version, status: "queued", attempts: 0, leaseToken: null, leaseUntil: new Date(), nextAttemptAt: new Date(), lastError: null };
    await tx.ocrJob.upsert({ where: { id }, create: { id, ...data }, update: data });
    await recordAuditLog({ client: tx, companyId: company.id, userId, action: "document.ocr.queued", entityType: "expense_scan", entityId: id, details: { version: scan.version } });
    return { id, status: "queued", alreadyQueued: false };
  });
}

/** One job per invocation bounds serverless execution; leases survive tabs closing and process crashes. */
export async function processOcrJob(scope: { companyId?: string; id?: string } = {}, provider: OcrProvider = ocrSpace) {
  const now = new Date();
  const candidate = await prisma.ocrJob.findFirst({ where: { ...scope, OR: [{ status: "queued", nextAttemptAt: { lte: now } }, { status: "processing", leaseUntil: { lt: now } }] }, orderBy: { nextAttemptAt: "asc" } });
  if (!candidate) return { status: "idle" };
  const token = randomUUID();
  let claimed;
  try {
    claimed = await prisma.$transaction(async tx => {
      const job = await tx.ocrJob.findUnique({ where: { id: candidate.id } });
      if (!job || job.updatedAt.getTime() !== candidate.updatedAt.getTime()) return null;
      const scan = await tx.expenseScan.findUnique({ where: { id: job.id } });
      if (!scan || scan.companyId !== job.companyId || scan.version !== job.scanVersion || scan.expenseId || ["converted", "rejected"].includes(scan.status)) {
        await tx.ocrJob.update({ where: { id: job.id }, data: { status: "cancelled", leaseToken: null } }); return null;
      }
      try { await access(tx, job.userId, job.companyId); }
      catch (e) {
        if (!(e instanceof ApiError) || e.status !== 403) throw e;
        await tx.ocrJob.update({ where: { id: job.id }, data: { status: "cancelled", leaseToken: null, lastError: "Osoba zlecająca utraciła dostęp do firmy." } });
        await tx.expenseScan.update({ where: { id: job.id, version: job.scanVersion }, data: { status: "needs_review", version: { increment: 1 }, errorMessage: "Odczyt anulowany po zmianie uprawnień." } }); return null;
      }
      if (!scan.imageData || job.attempts >= 3) {
        await tx.ocrJob.update({ where: { id: job.id }, data: { status: "failed", leaseToken: null, lastError: "Przekroczono liczbę prób lub brakuje oryginału." } });
        await tx.expenseScan.update({ where: { id: job.id, version: job.scanVersion }, data: { status: "failed", version: { increment: 1 }, errorMessage: "OCR wymaga ręcznego ponowienia lub opracowania." } }); return null;
      }
      await tx.ocrJob.update({ where: { id: job.id, updatedAt: job.updatedAt }, data: { status: "processing", attempts: { increment: 1 }, leaseToken: token, leaseUntil: new Date(Date.now() + 120000) } });
      await tx.expenseScan.update({ where: { id: job.id, version: job.scanVersion }, data: { status: "processing", provider: "ocrspace" } });
      return { ...job, imageData: scan.imageData, attempts: job.attempts + 1 };
    });
  } catch (e) { if (["P2034", "P2025"].includes(String((e as { code?: string }).code))) return { status: "contended" }; throw e; }
  if (!claimed) return { status: "skipped" };
  let output: Awaited<ReturnType<OcrProvider>> | null = null, failure: OcrProviderError | null = null;
  try {
    const original = await prisma.expenseScan.findUnique({ where: { id: claimed.id } });
    if (!original) throw new ApiError(404, "Brak oryginału.");
    await ensureDocumentSafety(original);
    await access(prisma, claimed.userId, claimed.companyId);
    output = await provider(claimed.imageData);
  }
  catch (e) { failure = e instanceof OcrProviderError ? e : e instanceof ApiError ? new OcrProviderError(e.message, false) : new OcrProviderError("Rozpoznawanie nie powiodło się. Zaplanowano ponowienie.", true); }
  return prisma.$transaction(async tx => {
    const job = await tx.ocrJob.findFirst({ where: { id: claimed.id, status: "processing", leaseToken: token } });
    if (!job) return { status: "superseded" };
    const scan = await tx.expenseScan.findUnique({ where: { id: job.id } });
    if (!scan || scan.version !== job.scanVersion || scan.status !== "processing" || scan.expenseId) {
      await tx.ocrJob.update({ where: { id: job.id, leaseToken: token }, data: { status: "cancelled", leaseToken: null } }); return { status: "superseded" };
    }
    if (output) {
      await tx.expenseScan.update({ where: { id: job.id, version: job.scanVersion }, data: { rawText: output.rawText, ocrResult: output.extraction as unknown as Prisma.InputJsonValue, confidence: null, status: "needs_review", processedAt: new Date(), version: { increment: 1 }, errorMessage: null } });
      await tx.ocrJob.update({ where: { id: job.id, leaseToken: token }, data: { status: "completed", leaseToken: null, lastError: null } });
      await recordAuditLog({ client: tx, companyId: job.companyId, userId: job.userId, action: "document.ocr.completed", entityType: "expense_scan", entityId: job.id, details: { attempts: job.attempts, version: job.scanVersion + 1 } });
      return { status: "completed", id: job.id };
    }
    const retry = failure!.retryable && job.attempts < 3;
    await tx.ocrJob.update({ where: { id: job.id, leaseToken: token }, data: { status: retry ? "queued" : "failed", leaseToken: null, lastError: failure!.message, nextAttemptAt: new Date(Date.now() + 30000 * 2 ** (job.attempts - 1)) } });
    await tx.expenseScan.update({ where: { id: job.id, version: job.scanVersion }, data: { status: retry ? "queued" : "failed", errorMessage: failure!.message, ...(!retry ? { version: { increment: 1 } } : {}) } });
    return { status: retry ? "retry_scheduled" : "failed", id: job.id };
  });
}
