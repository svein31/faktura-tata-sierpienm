import { ApiError } from '@/lib/api';
import { amount, date, ibanValid, nipValid, object, text } from '@/lib/business/validation';
export type OcrLine = { name: string; quantity: number|null; unit: string|null; net: number|null; vat: number|null; gross: number|null; vatRate: string|null; productId?: string };
export type OcrInvoice = { contractorName: string|null; nip: string|null; number: string|null; issueDate: string|null; saleDate: string|null; dueDate: string|null; totalNet: number|null; totalVat: number|null; totalGross: number|null; currency: string|null; iban: string|null; lines: OcrLine[] };
export const MAX_UPLOAD = 10 * 1024 * 1024;
export function fileMime(bytes: Buffer, declared: string) {
  let mime = '';
  if (bytes.subarray(0,5).toString() === '%PDF-') mime = 'application/pdf';
  else if (bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) mime = 'image/jpeg';
  else if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = 'image/png';
  else if (bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP') mime='image/webp';
  if (!mime || (declared && declared !== mime)) throw new ApiError(415, 'Wybierz PDF, JPG, PNG lub WebP. Format pliku musi zgadzać się z zawartością.');
  if (bytes.length===0 || bytes.length>MAX_UPLOAD) throw new ApiError(413, 'Maksymalny rozmiar dokumentu to 10 MB.');
  return mime;
}
export function normalizeInvoice(value: unknown, confirm = false): { data: OcrInvoice; warnings: string[] } {
  const o = object(value), warnings: string[] = [];
  const s = (key: string, max=200) => o[key] == null || o[key] === '' ? null : text(o[key],key,true,max);
  const d = (key: string) => { try { return o[key] ? date(o[key],key) : null; } catch { if(confirm) throw new ApiError(400, `Popraw datę ${key}.`); warnings.push(`Nieprawidłowa data: ${key}`); return null; } };
  const n = (key: string) => o[key] == null || o[key] === '' ? null : amount(o[key],key,true);
  const nip = s('nip')?.replace(/[\s-]/g,'').replace(/^PL/i,'') || null;
  const iban = s('iban')?.replace(/\s/g,'').toUpperCase() || null;
  const currency = s('currency')?.toUpperCase() || null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new ApiError(400, 'Waluta musi mieć kod ISO, np. PLN.');
  if (nip && !nipValid(nip)) { if(confirm) throw new ApiError(400,'Popraw NIP sprzedawcy.'); warnings.push('Sprawdź NIP sprzedawcy.'); }
  if (iban && !ibanValid(iban)) { if(confirm) throw new ApiError(400,'Popraw IBAN.'); warnings.push('Sprawdź IBAN.'); }
  if (!Array.isArray(o.lines) || o.lines.length > 500) throw new ApiError(400,'Pozycje muszą być tablicą do 500 elementów.');
  const lines = o.lines.map((v): OcrLine => { const l=object(v); const money=(k:string)=>l[k]==null?null:amount(l[k],k,true); const quantity=l.quantity==null?null:Number(l.quantity); if(quantity!==null&&(!Number.isFinite(quantity)||Math.abs(quantity)>1e9)) throw new ApiError(400,'Nieprawidłowa ilość.'); return { name:text(l.name,'nazwa pozycji',false,500),quantity,unit:l.unit==null?null:text(l.unit,'jednostka',false,20),net:money('net'),vat:money('vat'),gross:money('gross'),vatRate:l.vatRate==null?null:text(l.vatRate,'VAT',false,20) }; });
  const data: OcrInvoice = {contractorName:s('contractorName'),nip,iban,currency,number:s('number'),issueDate:d('issueDate'),saleDate:d('saleDate'),dueDate:d('dueDate'),totalNet:n('totalNet'),totalVat:n('totalVat'),totalGross:n('totalGross'),lines};
  for(const key of ['contractorName','number','issueDate','currency','totalNet','totalVat','totalGross'] as const) if(data[key]===null) { if(confirm) throw new ApiError(400,`Uzupełnij pole ${key}.`); warnings.push(`Brak pola: ${key}`); }
  if(data.totalNet!==null&&data.totalVat!==null&&data.totalGross!==null&&Math.abs(Math.round(data.totalNet*100)+Math.round(data.totalVat*100)-Math.round(data.totalGross*100))>1) { if(confirm) throw new ApiError(400,'Netto + VAT musi być równe brutto.'); warnings.push('Netto + VAT nie zgadza się z brutto.'); }
  const issue = (message:string) => { if(confirm) throw new ApiError(400,message); warnings.push(message); };
  lines.forEach((line,index)=>{if(line.net!==null&&line.vat!==null&&line.gross!==null&&Math.abs(Math.round(line.net*100)+Math.round(line.vat*100)-Math.round(line.gross*100))>1)issue(`Pozycja ${index+1}: netto + VAT nie zgadza się z brutto.`);});
  for(const [lineKey,totalKey] of [['net','totalNet'],['vat','totalVat'],['gross','totalGross']] as const){
    if(lines.length&&lines.every(l=>l[lineKey]!==null)&&data[totalKey]!==null&&Math.abs(lines.reduce((sum,l)=>sum+Math.round(l[lineKey]!*100),0)-Math.round(data[totalKey]!*100))>1)issue(`Suma pozycji nie zgadza się z ${totalKey}.`);
  }
  if(!lines.length) warnings.push('Brak odczytanych pozycji.');
  return {data,warnings};
}
