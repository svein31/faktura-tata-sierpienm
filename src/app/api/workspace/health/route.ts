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
    const [queue,ocr,webhooks] = await Promise.all([
      prisma.ksefQueueTask.findMany({where:{invoice:{sellerCompanyId:companyId}},select:{id:true,status:true,attempts:true,maxAttempts:true,environment:true,updatedAt:true,nextAttemptAt:true,invoiceId:true,invoice:{select:{number:true}}},orderBy:{updatedAt:"desc"},take:50}),
      prisma.expenseScan.findMany({where:{companyId,status:{in:["processing","failed"]}},select:{id:true,status:true,updatedAt:true,fileName:true},orderBy:{updatedAt:"desc"},take:50}),
      prisma.webhookDelivery.findMany({where:{webhookId:{in:hooks.map(h=>h.id)},status:{not:"delivered"}},select:{id:true,status:true,attempts:true,createdAt:true,nextAttemptAt:true},orderBy:{createdAt:"desc"},take:50}),
    ]);
    return json({ checkedAt:new Date().toISOString(), queue,ocr,webhooks,ocrConfigured:Boolean(process.env.OCR_SPACE_API_KEY), note:"Do 50 ostatnich zadań w każdej grupie. Ten widok pokazuje stan kolejki; nie wykonuje testu zewnętrznych usług." });
  } catch(e){return handleApiError(e);}
}
