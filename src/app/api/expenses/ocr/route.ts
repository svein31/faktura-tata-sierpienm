import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { ApiError, handleApiError, json } from '@/lib/api';
import { businessAccess } from '@/lib/business/access';
import { fileMime, MAX_UPLOAD } from '@/lib/ocr/contract';
import { extractInvoice, ocrConfiguration } from '@/lib/ocr/provider';
export const runtime='nodejs';
export const maxDuration=120;
export async function GET(req:Request) {
  try { const {companyId}=await businessAccess(req); let configured=false; try{ocrConfiguration();configured=true;}catch{} return json({configured,drafts:await prisma.ocrDraft.findMany({where:{companyId,status:'review',expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'},take:50})}); }catch(e){return handleApiError(e);}
}
export async function POST(req:Request) {
  try {
    const {user,companyId}=await businessAccess(req,'write');
    ocrConfiguration();
    if(Number(req.headers.get('content-length'))>MAX_UPLOAD+65536) throw new ApiError(413,'Maksymalny rozmiar to 10 MB.');
    // Bound streaming input even when Content-Length is absent/spoofed.
    const reader=req.body?.getReader(); if(!reader) throw new ApiError(400,'Brak dokumentu.');
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX_UPLOAD+65536){await reader.cancel();throw new ApiError(413,'Maksymalny rozmiar to 10 MB.');}chunks.push(value);}
    const form=await new Request(req.url,{method:'POST',headers:{'content-type':req.headers.get('content-type')||''},body:Buffer.concat(chunks)}).formData();
    const file=form.get('file');if(!file || typeof file==='string')throw new ApiError(400,'Wybierz dokument.');
    const bytes=Buffer.from(await file.arrayBuffer());const mime=fileMime(bytes,file.type);
    const hour=Math.floor(Date.now()/3600000), quotaId=`${companyId}:${hour}`;
    try { await prisma.ocrQuota.upsert({where:{id:quotaId},create:{id:quotaId,companyId,expiresAt:new Date((hour+2)*3600000)},update:{}}); }
    catch(e) { if((e as {code?:string}).code!=='P2002')throw e; }
    const reserved=await prisma.ocrQuota.updateMany({where:{id:quotaId,attempts:{lt:30}},data:{attempts:{increment:1}}});
    if(reserved.count!==1)throw new ApiError(429,'Limit OCR: 30 prób odczytu na godzinę na firmę.');
    const result=await extractInvoice(bytes,mime);
    const draft=await prisma.ocrDraft.create({data:{companyId,userId:user.id,fileHash:createHash('sha256').update(bytes).digest('hex'),filename:file.name.slice(0,200),mimeType:mime,provider:result.provider,data:JSON.parse(JSON.stringify(result.data)),warnings:result.warnings,expiresAt:new Date(Date.now()+7*86400000)}});
    return json({draft},{status:201});
  } catch(e){return handleApiError(e);}
}
