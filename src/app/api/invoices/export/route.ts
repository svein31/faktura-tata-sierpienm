import {prisma} from "@/lib/db";
import {getSessionUser} from "@/lib/auth";
import {ApiError,handleApiError,json,readJson} from "@/lib/api";
import {companyAccess} from "@/lib/company-write";
import {financialAmounts,isAccountingInvoice,csvCell} from "@/lib/accountant-summary";
import {DOCUMENT_HEADERS,documentRow,workbook} from "@/lib/export/files";
import {recordAuditLog} from "@/lib/audit";
export const runtime="nodejs";
function validDate(value:unknown){if(value==null||value==="")return undefined;if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+"T00:00:00Z"))||new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value)throw new ApiError(400,"Nieprawidłowa data eksportu.");return value;}
export async function POST(req:Request){try{
 const user=await getSessionUser();if(!user)throw new ApiError(401,"Nieautoryzowany.");const body=await readJson(req),{company}=await companyAccess(prisma,user.id,body.companyId,"canExport"),format=String(body.format||"csv");if(!["csv","xlsx","json"].includes(format))throw new ApiError(400,"Obsługiwane formaty: CSV, XLSX i JSON.");const from=validDate(body.dateFrom),to=validDate(body.dateTo);if(from&&to&&from>to)throw new ApiError(400,"Początek okresu przypada po końcu.");if(body.type&&!['all','sale','purchase'].includes(String(body.type)))throw new ApiError(400,"Nieprawidłowy typ dokumentów.");
 const records=await prisma.invoice.findMany({where:{sellerCompanyId:company.id,...(body.type==='sale'||body.type==='purchase'?{type:body.type}:{}),...(from||to?{issueDate:{gte:from,lte:to}}:{})},orderBy:{issueDate:"asc"},take:10001});if(records.length>10000)throw new ApiError(413,"Zawęź okres do 10 000 dokumentów.");const published=records.filter(isAccountingInvoice),contacts=new Map((await prisma.contractor.findMany({where:{id:{in:published.map(i=>i.contractorId).filter((id):id is string=>Boolean(id))}}})).map(c=>[c.id,c]));
 const documents=published.map(i=>({...i,...financialAmounts(i),contractorName:contacts.get(i.contractorId||'')?.name||'',nip:contacts.get(i.contractorId||'')?.nip||i.nip||''})),rows=documents.map(d=>documentRow(d,d.type));await recordAuditLog({companyId:company.id,userId:user.id,userName:user.name,userEmail:user.email,action:"invoices_exported",entityType:"invoice_batch",entityId:company.id,details:{count:rows.length,format,from,to}});
 if(format==='json')return json({companyId:company.id,documents:documents.map(d=>({id:d.id,number:d.number,type:d.type,issueDate:d.issueDate,currency:d.currency,...financialAmounts(d),contractorName:d.contractorName,nip:d.nip,ksefNumber:d.ksefNumber}))});
 const content=format==='xlsx'?workbook(DOCUMENT_HEADERS,rows):'\uFEFF'+[DOCUMENT_HEADERS,...rows].map(row=>row.map(csvCell).join(';')).join('\r\n');return new Response(content as BodyInit,{headers:{"Content-Type":format==='xlsx'?"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="faktury.${format}"`,"Cache-Control":"no-store"}});
}catch(e){return handleApiError(e);}}
