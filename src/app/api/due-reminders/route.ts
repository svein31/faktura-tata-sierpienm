import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireCompanyAccess, getCompanyMembership } from "@/lib/permissions";
import { objectId } from "@/lib/company-scope";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { recordAuditLog } from "@/lib/audit";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401,"Nieautoryzowany.");
    const companyId = new URL(req.url).searchParams.get("companyId"); if (!objectId(companyId)) throw new ApiError(400,"Wybierz firmę.");
    if (!await getCompanyMembership(user.id,companyId)) throw new ApiError(403,"Brak dostępu.");
    const [settings,deliveries] = await Promise.all([prisma.dueReminderSetting.findMany({where:{companyId}}),prisma.dueReminderDelivery.findMany({where:{companyId},orderBy:{createdAt:"desc"},take:50})]);
    return json({settings: settings.map(({id,invoiceId,enabled,channels}) => ({id,invoiceId,enabled:enabled && (!channels.length || channels.includes("email"))})),deliveries:deliveries.filter(d=>!d.channel || d.channel==="email")});
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
        const result=await tx.dueReminderDelivery.updateMany({where:{id:body.id as string,companyId,status:{in:["failed","verify_needed"]},OR:[{channel:"email"},{channel:null},{channel:{isSet:false}}]},data:{status:"pending",error:null}});
        if(!result.count)throw new ApiError(409,"Nie można ponowić tej wiadomości.");
        await recordAuditLog({client:tx,companyId,userId:user.id,action:"due_reminder_retry",entityType:"reminder",entityId:body.id as string});return result;
      });return json({ok:changed.count===1});
    }
    if(!objectId(body.invoiceId) || typeof body.enabled!=="boolean")throw new ApiError(400,"Nieprawidłowa konfiguracja.");
    if (body.channels !== undefined && (!Array.isArray(body.channels) || body.channels.length !== 1 || body.channels[0] !== "email")) throw new ApiError(400, "Dostępne są wyłącznie przypomnienia e-mail.");
    if (body.smsRecipient !== undefined) throw new ApiError(400, "Konfiguracja SMS została usunięta.");
    const channelData = { channels: ["email"] };
    const invoice=await prisma.invoice.findFirst({where:{id:body.invoiceId,sellerCompanyId:companyId}});
    if(!invoice || invoice.type!=="sale" || invoice.isProforma || invoice.isCorrection)throw new ApiError(400,"Wybierz fakturę sprzedaży VAT.");
    const setting=await prisma.$transaction(async tx=>{
      const record=await tx.dueReminderSetting.upsert({where:{invoiceId:invoice.id},create:{invoiceId:invoice.id,companyId,userId:user.id,enabled:body.enabled as boolean,...channelData},update:{enabled:body.enabled as boolean,userId:user.id,nextCheckAt:new Date(),...channelData}});
      await recordAuditLog({client:tx,companyId,userId:user.id,documentId:invoice.id,entityType:"invoice",entityId:invoice.id,action:"due_reminder_configured",details:{enabled:record.enabled}});return record;
    });return json({setting});
  } catch(e){return handleApiError(e);}
}
