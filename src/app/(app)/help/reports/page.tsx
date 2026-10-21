import { notFound } from "next/navigation";
import { isSupportOperator } from "@/lib/server/support-operator";
import { productDb } from "@/lib/server/product-observability";
import { PageHeader } from "@/components/page-header";
export const dynamic = "force-dynamic";
export default async function SupportInboxPage() {
  if (!await isSupportOperator()) notFound();
  const rows = await (await productDb()).collection("SupportReport").find({ expiresAt: { $gt: new Date() } }, { projection: { _id: 0, userId: 0, requestId: 0 }, maxTimeMS: 2000 }).sort({ createdAt: -1 }).limit(50).toArray();
  return <div className="space-y-5"><PageHeader title="Zgłoszenia do obsługi" description="Prywatny widok operatora serwisu. Ostatnie 50 zgłoszeń; bez dostępu do dokumentów i danych finansowych klientów." />{!rows.length && <p className="rounded-lg border p-5 text-sm text-muted-foreground">Nie ma zapisanych zgłoszeń.</p>}<div className="space-y-3">{rows.map(row => <details key={row.reference} className="surface-card px-5"><summary className="cursor-pointer py-4"><span className="font-medium">{row.category === "idea" ? "Pomysł" : row.category === "question" ? "Pytanie" : "Problem"} · {row.screen}</span><span className="mt-1 block text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })} · {row.reference}</span></summary><div className="space-y-3 border-t py-4"><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{row.description}</p><p className="break-all text-xs text-muted-foreground">Wersja: {row.revision} · Powiadomienie: {row.notification === "accepted" ? "przyjęte przez dostawcę poczty" : row.notification === "verify_needed" ? "do sprawdzenia u dostawcy" : row.notification === "pending" ? "oczekuje" : "w trakcie"}{row.incident ? ` · Incydent: ${row.incident}` : ""}</p></div></details>)}</div></div>;
}
