import {createHash} from "node:crypto";
import type {ParsedRawTransaction} from "./csv-parser";
export function normalizedBankAccount(value:string){return value.replace(/[^a-z0-9]/gi,"").toUpperCase().replace(/^PL(?=\d{26}$)/,"");}
export function bankEntryFingerprint(companyId:string,account:string,tx:ParsedRawTransaction,ordinal=0){return createHash("sha256").update(JSON.stringify([companyId,normalizedBankAccount(account),tx.date,tx.currency||"PLN",Math.round(tx.amount*100),tx.reference?['reference',tx.reference]:['contents',tx.title.trim(),tx.senderName.trim(),tx.senderAccount||"",ordinal]])).digest("hex");}
