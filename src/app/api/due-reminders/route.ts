import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireCompanyAccess, getCompanyMembership } from "@/lib/permissions";
import { objectId } from "@/lib/company-scope";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { recordAuditLog } from "@/lib/audit";
import {smsConfigured,normalizeSmsPhone} from "@/lib/sms";
import {getEmailConfigStatus} from "@/lib/email/sender";
import {companyAccess} from "@/lib/company-write";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401,"Nieautoryzowany.");
    const companyId = new URL(req.url).searchParams.get("companyId"); if (!objectId(companyId)) throw new ApiError(400,"Wybierz firmę.");
    if (!await getCompanyMembership(user.id,companyId)) throw new ApiError(403,"Brak dostępu.");
    const [settings,deliveries] = await Promise.all([prisma.dueReminderSetting.findMany({where:{companyId}}),prisma.dueReminderDelivery.findMany({where:{companyId},orderBy:{createdAt:"desc"},take:50})]);
    return json({settings,deliveries,providers:{email:getEmailConfigStatus().configured,sms:smsConfigured()}});
  } catch(e) {return handleApiError(e);}
}
export async function POST(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401,"Nieautoryzowany.");
    const body = await readJson(req); if (!objectId(body.companyId)) throw new ApiError(400,"Wybierz firmę.");
    const companyId=body.companyId, access=await requireCompanyAccess(user.id,companyId,"canIssueInvoices"); if(!access.ok)throw new ApiError(access.status,access.error);
    if (body.action === "retry") {
      if (!objectId(body.id)) throw new ApiError(400,"Nieprawidłowe ID.");
      const changed=await prisma.$transaction(async tx => {
        await companyAccess(tx,user.id,companyId,"canIssueInvoices");
        const result=await tx.dueReminderDelivery.updateMany({where:{id:body.id as string,companyId,status:{in:["failed","verify_needed"]}},data:{status:"pending",error:null}});
        if(!result.count)throw new ApiError(409,"Nie można ponowić tej wiadomości.");
        await recordAuditLog({client:tx,companyId,userId:user.id,action:"due_reminder_retry",entityType:"reminder",entityId:body.id as string});return result;
      });return json({ok:changed.count===1});
    }
    if(!objectId(body.invoiceId) || typeof body.enabled!=="boolean")throw new ApiError(400,"Nieprawidłowa konfiguracja.");
    const invoice=await prisma.invoice.findFirst({where:{id:body.invoiceId,sellerCompanyId:companyId}});
    if(!invoice || invoice.type!=="sale" || invoice.isProforma || invoice.isCorrection)throw new ApiError(400,"Wybierz fakturę sprzedaży VAT.");
    const setting=await prisma.$transaction(async tx=>{
      await companyAccess(tx,user.id,companyId,"canIssueInvoices");
      const existing=await tx.dueReminderSetting.findUnique({where:{invoiceId:invoice.id}}),channels=body.channels===undefined?(existing?.channels?.length?existing.channels:["email"]):body.channels;
      if(!Array.isArray(channels)||!channels.length||channels.length>2||channels.some(c=>!["email","sms"].includes(c as string))||new Set(channels).size!==channels.length)throw new ApiError(400,"Wybierz e-mail lub SMS.");
      let smsPhone=existing?.smsPhone||null;if(channels.includes("sms")){try{smsPhone=normalizeSmsPhone(body.smsPhone===undefined?smsPhone:body.smsPhone);}catch(e){throw new ApiError(400,(e as Error).message);}if(body.enabled&&!smsConfigured())throw new ApiError(503,"Administrator musi skonfigurować SMSAPI.");}
      const record=await tx.dueReminderSetting.upsert({where:{invoiceId:invoice.id},create:{invoiceId:invoice.id,companyId,userId:user.id,enabled:body.enabled as boolean,channels:channels as string[],smsPhone},update:{enabled:body.enabled as boolean,userId:user.id,nextCheckAt:new Date(),channels:channels as string[],smsPhone}});
      await recordAuditLog({client:tx,companyId,userId:user.id,documentId:invoice.id,entityType:"invoice",entityId:invoice.id,action:"due_reminder_configured",details:{enabled:record.enabled,channels:record.channels}});return record;
    });return json({setting});
  } catch(e){return handleApiError(e);}
}
