import {prisma} from "./db";
import {ApiError} from "./api";
const indexes={BankImportEntry:{fingerprint:1},AccountingDocumentReview:{companyId:1,documentType:1,documentId:1}} as const;
export async function requireWorkflowIndex(collection:keyof typeof indexes){let ready=false;try{const result=await prisma.$runCommandRaw({listIndexes:collection}) as any;ready=(result.cursor?.firstBatch||[]).some((i:any)=>i.unique===true&&JSON.stringify(i.key)===JSON.stringify(indexes[collection]));}catch{}
 if(!ready)throw new ApiError(503,"Ten moduł wymaga uruchomienia migracji 016-saas-workflows przez administratora.","WORKFLOW_MIGRATION_REQUIRED");}
