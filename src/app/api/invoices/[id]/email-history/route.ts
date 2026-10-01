import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertObjectId, handleApiError, json } from "@/lib/api";
import { getCompanyMembership } from "@/lib/permissions";
import { emailLogToDto } from "@/lib/dto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return json({error:"Nieautoryzowany."},{status:401});
    const { id } = await params;
    assertObjectId(id);
    const invoice = await prisma.invoice.findUnique({where:{id},select:{id:true,userId:true,sellerCompanyId:true}});
    if (!invoice || (invoice.sellerCompanyId
      ? !await getCompanyMembership(user.id,invoice.sellerCompanyId)
      : invoice.userId !== user.id)) return json({error:"Faktura nie istnieje lub brak uprawnień."},{status:404});
    const logs = await prisma.invoiceEmailLog.findMany({
      where:{invoiceId:id},orderBy:{sentAt:"desc"},
      include:{user:{select:{name:true,email:true}}},
    });
    return json({logs:logs.map(emailLogToDto)});
  } catch(error) { return handleApiError(error); }
}
