import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, cleanStr } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { objectId } from "@/lib/company-scope";
import { recordAuditLog } from "@/lib/audit";

export type ReviewStep = { userId: string; name: string };
export function reviewSteps(value: unknown): ReviewStep[] {
  if (!Array.isArray(value) || !value.length || value.length > 5) throw new ApiError(400, "Wybierz od jednej do pięciu osób akceptujących.");
  const steps = value.map(v => {
    if (!v || typeof v !== "object" || !objectId(v.userId)) throw new ApiError(400, "Nieprawidłowa osoba akceptująca.");
    return { userId: v.userId as string, name: typeof v.name === "string" ? v.name.slice(0, 200) : "" };
  });
  if (new Set(steps.map(s => s.userId)).size !== steps.length) throw new ApiError(400, "Każdy etap wymaga innej osoby.");
  return steps;
}
export function assertReviewDecision(review: { status: string; currentStep: number; version: number; steps: unknown }, actorId: string, version: unknown) {
  if (version !== review.version) throw new ApiError(409, "Obieg został zmieniony. Odśwież dane.");
  if (review.status !== "pending") throw new ApiError(409, "Obieg ma już decyzję końcową.");
  const steps = reviewSteps(review.steps);
  if (steps[review.currentStep]?.userId !== actorId) throw new ApiError(403, "Decyzję podejmuje osoba przypisana do bieżącego etapu.");
  return steps;
}
const reviewId = (company: string, type: string, id: string) => createHash("sha256").update(`${company}:${type}:${id}`).digest("hex").slice(0, 24);
type Actor = { id: string; name?: string | null; email?: string | null };
async function validSteps(tx: Prisma.TransactionClient, companyId: string, value: unknown) {
  const steps = reviewSteps(value);
  const result: ReviewStep[] = [];
  for (const step of steps) {
    await companyAccess(tx, step.userId, companyId, "canExport");
    const user = await tx.user.findUnique({ where: { id: step.userId }, select: { name: true } });
    if (!user) throw new ApiError(400, "Nie znaleziono osoby akceptującej.");
    result.push({ userId: step.userId, name: user.name || "Użytkownik" });
  }
  return result;
}
async function notification(tx: Prisma.TransactionClient, companyId: string, userId: string, number: string, title: string) {
  try { await companyAccess(tx, userId, companyId); } catch (e) { if (e instanceof ApiError && e.status === 403) return; throw e; }
  await tx.notification.create({ data: { userId, kind: "system", title, body: `Dokument ${number}.`, link: "/cost-reviews" } });
}

export async function costReviewCommand(actor: Actor, body: Record<string, unknown>) {
  if (!objectId(body.companyId)) throw new ApiError(400, "Wybierz firmę.");
  const companyId = body.companyId;
  return prisma.$transaction(async tx => {
    const { company, role } = await companyAccess(tx, actor.id, companyId);
    const action = cleanStr(body.action, 30, "operacja");
    const authorName = actor.name || actor.email || "Użytkownik";
    const audit = { client: tx, userId: actor.id, userName: actor.name, userEmail: actor.email, companyId };
    if (action === "policy") {
      if (role !== "owner") throw new ApiError(403, "Kolejność akceptacji ustala właściciel firmy.");
      const steps = await validSteps(tx, companyId, body.steps);
      const current = await tx.costReviewPolicy.findUnique({ where: { id: companyId } });
      if ((current?.version ?? 0) !== body.version) throw new ApiError(409, "Zasady zostały zmienione. Odśwież dane.");
      const policy = current ? await tx.costReviewPolicy.update({ where: { id: companyId, version: current.version }, data: { steps, version: { increment: 1 } } }) : await tx.costReviewPolicy.create({ data: { id: companyId, steps } });
      await recordAuditLog({ ...audit, action: "cost.policy.updated", entityType: "costReviewPolicy", entityId: companyId, details: { steps, version: policy.version } });
      return { policy };
    }
    const message = cleanStr(body.message, 2000, "komentarz");
    if (action === "submit") {
      // Accountants can submit; employees with issuing rights can submit without obtaining approval rights.
      try { await companyAccess(tx, actor.id, companyId, "canIssueInvoices"); }
      catch (e) { if (!(e instanceof ApiError) || e.status !== 403) throw e; await companyAccess(tx, actor.id, companyId, "canExport"); }
      if (!objectId(body.documentId) || !["invoice", "expense"].includes(String(body.documentType))) throw new ApiError(400, "Wybierz dokument kosztowy.");
      const documentType = String(body.documentType), documentId = body.documentId;
      const invoice = documentType === "invoice" ? await tx.invoice.findFirst({ where: { id: documentId, sellerCompanyId: companyId, type: "purchase" } }) : null;
      const expense = documentType === "expense" ? await tx.expense.findFirst({ where: { id: documentId, companyId } }) : null;
      const document = invoice || expense;
      if (!document) throw new ApiError(404, "Nie znaleziono kosztu w tej firmie.");
      const id = reviewId(companyId, documentType, documentId);
      const existing = await tx.costReview.findUnique({ where: { id } });
      if (existing) throw new ApiError(409, "Dokument jest już w obiegu. Otwórz istniejący obieg.");
      const policy = await tx.costReviewPolicy.findUnique({ where: { id: companyId } });
      const steps = await validSteps(tx, companyId, policy?.steps || [{ userId: company.userId }]);
      const review = await tx.costReview.create({ data: { id, companyId, documentType, documentId, number: document.number, requestedBy: actor.id, steps, snapshot: { number: document.number, issueDate: document.issueDate, currency: document.currency, totalNet: document.totalNet, totalVat: document.totalVat, totalGross: document.totalGross } } });
      if (invoice) await tx.invoice.update({ where: { id: documentId }, data: { costReviewId: id, approvalStatus: "pending", approvedAt: null, approvedBy: null, version: { increment: 1 } } });
      else await tx.expense.update({ where: { id: documentId }, data: { costReviewId: id, workflowStatus: "to_verify" } });
      await tx.costReviewEvent.create({ data: { reviewId: id, companyId, userId: actor.id, authorName, action, message, step: 0 } });
      await recordAuditLog({ ...audit, action: "cost.review.submitted", entityType: "costReview", entityId: id, details: { steps, snapshot: review.snapshot } });
      await notification(tx, companyId, steps[0].userId, document.number, "Koszt oczekuje na Twoją akceptację");
      return { review };
    }
    if (!objectId(body.reviewId)) throw new ApiError(400, "Wybierz obieg.");
    const review = await tx.costReview.findFirst({ where: { id: body.reviewId, companyId } });
    if (!review) throw new ApiError(404, "Nie znaleziono obiegu.");
    if (body.version !== review.version) throw new ApiError(409, "Obieg został zmieniony. Odśwież dane.");
    let data: Prisma.CostReviewUpdateInput = { version: { increment: 1 } };
    if (action === "comment") {
      if (role === "viewer") throw new ApiError(403, "Masz dostęp tylko do podglądu.");
      if (!message) throw new ApiError(400, "Wpisz komentarz.");
    } else if (action === "approve" || action === "reject") {
      await companyAccess(tx, actor.id, companyId, "canExport");
      const steps = assertReviewDecision(review, actor.id, body.version);
      if (action === "reject" && !message) throw new ApiError(400, "Podaj powód odrzucenia.");
      const final = action === "approve" && review.currentStep === steps.length - 1;
      if (action === "approve" && !final) await companyAccess(tx, steps[review.currentStep + 1].userId, companyId, "canExport");
      data = { ...data, status: action === "reject" ? "rejected" : final ? "approved" : "pending", currentStep: action === "approve" && !final ? review.currentStep + 1 : review.currentStep };
      if (final) {
        if (review.documentType === "invoice") await tx.invoice.update({ where: { id: review.documentId, sellerCompanyId: companyId, type: "purchase", costReviewId: review.id }, data: { approvalStatus: "approved", approvedAt: new Date(), approvedBy: authorName, version: { increment: 1 } } });
        else await tx.expense.update({ where: { id: review.documentId, companyId, costReviewId: review.id }, data: { workflowStatus: "verified" } });
      }
      await notification(tx, companyId, action === "approve" && !final ? steps[review.currentStep + 1].userId : review.requestedBy, review.number, final ? "Koszt zaakceptowany" : action === "reject" ? "Koszt odrzucony" : "Koszt oczekuje na Twoją akceptację");
    } else if (action === "reopen") {
      if (role !== "owner") throw new ApiError(403, "Ponowne otwarcie wymaga właściciela firmy.");
      if (!message) throw new ApiError(400, "Podaj powód ponownego otwarcia.");
      const policy = await tx.costReviewPolicy.findUnique({ where: { id: companyId } });
      const steps = await validSteps(tx, companyId, policy?.steps || [{ userId: company.userId }]);
      data = { ...data, status: "pending", currentStep: 0, steps };
      if (review.documentType === "invoice") await tx.invoice.update({ where: { id: review.documentId, costReviewId: review.id }, data: { approvalStatus: "pending", approvedAt: null, approvedBy: null, version: { increment: 1 } } });
      else await tx.expense.update({ where: { id: review.documentId, costReviewId: review.id }, data: { workflowStatus: "to_verify" } });
      await notification(tx, companyId, steps[0].userId, review.number, "Ponownie otwarto obieg kosztu");
    } else throw new ApiError(400, "Nieznana operacja obiegu.");
    const updated = await tx.costReview.update({ where: { id: review.id, version: review.version }, data });
    await tx.costReviewEvent.create({ data: { reviewId: review.id, companyId, userId: actor.id, authorName, action, message, step: review.currentStep } });
    await recordAuditLog({ ...audit, action: `cost.review.${action}`, entityType: "costReview", entityId: review.id, details: { previousVersion: review.version, version: updated.version, step: review.currentStep, message } });
    return { review: updated };
  }, { timeout: 30000 });
}
