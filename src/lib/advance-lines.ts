import { invoiceTotals, lineNet, lineVat, round2 } from "./format";
import type { InvoiceLine, VatRate } from "./types";
import { ApiError } from "./api";
/** Net-value allocation; displayed gross is the resulting legally invoiced advance. */
export function buildAdvanceLines(order:InvoiceLine[], previous:InvoiceLine[][], amountNet:number):InvoiceLine[] {
 if(!Number.isFinite(amountNet)||amountNet<=0||round2(amountNet)!==amountNet)throw new ApiError(400,"Kwota netto musi być dodatnia, z dokładnością do grosza.");
 const groups=new Map<VatRate,{net:number;vat:number}>();
 for(const l of order){if(!["23","8","5","0"].includes(l.vatRate)||l.quantity<=0||l.netPrice<0)throw new ApiError(400,"Zaliczki obsługują dodatnie pozycje VAT 23/8/5/0.");const g=groups.get(l.vatRate)||{net:0,vat:0};g.net+=Math.round(lineNet(l)*100);g.vat+=Math.round(lineVat(l)*100);groups.set(l.vatRate,g);}
 for(const lines of previous)for(const l of lines){const g=groups.get(l.vatRate);if(!g)throw new ApiError(409,"Nieprawidłowa historia zaliczek.");g.net-=Math.round(lineNet(l)*100);g.vat-=Math.round(lineVat(l)*100);}
 const rows=[...groups].filter(([,g])=>g.net>0),remaining=rows.reduce((s,[,g])=>s+g.net,0),requested=Math.round(amountNet*100);
 if(requested>remaining)throw new ApiError(400,"Zaliczka przekracza pozostałą wartość netto zamówienia.");
 const allocation=rows.map(([rate,g])=>({rate,...g,cents:Math.floor(requested*g.net/remaining),fraction:(requested*g.net)%remaining}));
 let rest=requested-allocation.reduce((s,g)=>s+g.cents,0);
 for(const g of [...allocation].sort((a,b)=>b.fraction-a.fraction)){if(rest>0&&g.cents<g.net){g.cents++;rest--;}}
 return allocation.filter(g=>g.cents>0).map((g,index)=>{
  const net=g.cents/100,vat=g.cents===g.net?g.vat/100:Math.min(g.vat/100,round2(net*Number(g.rate)/100));
  return {id:`advance-${index}`,name:`Zaliczka – VAT ${g.rate}%`,unit:"szt.",quantity:1,netPrice:net,vatRate:g.rate,settlementNet:net,settlementVat:vat};
 });
}
export function buildFinalLines(order:InvoiceLine[],previous:{number:string;lines:InvoiceLine[]}[]):InvoiceLine[]{
 const lines=[...order.map(l=>({...l})),...previous.flatMap((a,i)=>a.lines.map((l,j)=>({id:`settlement-${i}-${j}`,name:`Rozliczenie zaliczki ${a.number} – VAT ${l.vatRate}%`,unit:"szt.",quantity:1,netPrice:-lineNet(l),vatRate:l.vatRate,settlementNet:-lineNet(l),settlementVat:-lineVat(l)})))];
 if(invoiceTotals({lines}).gross<0)throw new ApiError(409,"Zaliczki przekraczają wartość zamówienia.");
 return lines;
}
