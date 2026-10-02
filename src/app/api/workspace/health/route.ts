import { backupStatus } from "@/lib/backup-monitor";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { requireIntegrationOwner } from "@/lib/public-api";
import { objectId } from "@/lib/company-scope";
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401,"Nieautoryzowany.");
    const companyId = new URL(req.url).searchParams.get("companyId"); if (!objectId(companyId)) throw new ApiError(400,"Wybierz firmę.");
    await requireIntegrationOwner(user.id,companyId);
    const hooks = await prisma.statusWebhook.findMany({ where:{companyId},select:{id:true} });
    const [queue,ocr,webhooks,offline] = await Promise.all([
      prisma.ksefQueueTask.findMany({where:{invoice:{sellerCompanyId:companyId}},select:{id:true,status:true,attempts:true,maxAttempts:true,environment:true,updatedAt:true,nextAttemptAt:true,invoiceId:true,invoice:{select:{number:true}}},orderBy:{updatedAt:"desc"},take:50}),
      prisma.expenseScan.findMany({where:{companyId,status:{in:["processing","failed"]}},select:{id:true,status:true,updatedAt:true,fileName:true},orderBy:{updatedAt:"desc"},take:50}),
      prisma.webhookDelivery.findMany({where:{webhookId:{in:hooks.map(h=>h.id)},status:{not:"delivered"}},select:{id:true,status:true,attempts:true,createdAt:true,nextAttemptAt:true},orderBy:{createdAt:"desc"},take:50}),
      prisma.invoice.findMany({where:{sellerCompanyId:companyId,isOffline:true,ksefNumber:null,offlineDeadline:{lte:new Date(Date.now()+24*3600000)}},select:{id:true,number:true,offlineDeadline:true},orderBy:{offlineDeadline:"asc"},take:10}),
    ]);
    const backups = backupStatus(await prisma.backupReceipt.findMany(), Boolean(process.env.BACKUP_MONITOR_SECRET && process.env.BACKUP_MONITOR_SECRET.length >= 32));
    const now=Date.now();
    const alerts=[
      ...queue.filter(t=>t.status==="verify_needed").map(t=>({kind:"KSeF",message:`${t.invoice?.number||"Faktura"}: wynik wysyłki wymaga sprawdzenia.`,href:`/invoices/${t.invoiceId}`})),
      ...queue.filter(t=>t.status==="queued" && now-new Date(t.updatedAt).getTime()>10*60000 || t.status==="processing" && now-new Date(t.updatedAt).getTime()>5*60000).map(t=>({kind:"Kolejka",message:`${t.invoice?.number||"Faktura"}: zadanie długo czeka. Sprawdź pracownika kolejki.`,href:`/invoices/${t.invoiceId}`})),
      ...offline.map(i=>({kind:"Offline",message:`${i.number}: termin przesłania ${i.offlineDeadline?.toLocaleDateString("pl-PL")||"do ustalenia"}.`,href:`/invoices/${i.id}`})),
      ...webhooks.filter(w=>w.status==="failed").map(()=>({kind:"Webhook",message:"Nieudane dostarczenie webhooka.",href:"/settings/integrations"})).slice(0,3),
    ];
    return json({ backups, scannerConfigured: Boolean(process.env.DOCUMENT_SCAN_URL && process.env.DOCUMENT_SCAN_TOKEN), scanRequired: process.env.DOCUMENT_SCAN_REQUIRED === "true", checkedAt:new Date().toISOString(), queue,ocr,webhooks,alerts,ocrConfigured:Boolean(process.env.OCR_SPACE_API_KEY), note:"Do 50 ostatnich zadań w każdej grupie. Potwierdzenia kopii pochodzą od podpisanego monitora operatora; brak potwierdzenia nie oznacza działającej kopii." });
  } catch(e){return handleApiError(e);}
}
