// MongoDB migration: safe to rerun. Run after prisma db push on a replica set.
import { PrismaClient } from '@prisma/client';
const db=new PrismaClient();
try {
  for (const collection of ['OcrDraft','OcrQuota']) await db.$runCommandRaw({createIndexes:collection,indexes:[{key:{expiresAt:1},name:'expiresAt_ttl',expireAfterSeconds:0}]});
  await db.$runCommandRaw({createIndexes:'Expense',indexes:[{key:{ocrDocumentKey:1},name:'Expense_ocrDocumentKey_unique',unique:true,partialFilterExpression:{ocrDocumentKey:{$type:'string'}}}]});
  // Historical expenses may have several possible companies: never guess attribution.
  const result=await db.expense.count({where:{companyId:{isSet:false}}});
  console.log(`OCR migration complete. Historical costs requiring company attribution: ${result}`);
}finally{await db.$disconnect();}
