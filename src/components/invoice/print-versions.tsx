"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
type Version = { id: string; sourceVersion: number; createdAt: string; pdfSha256: string | null };
export function PrintVersions({ invoiceId }: { invoiceId: string }) {
  const [versions, setVersions] = React.useState<Version[]>([]), [next, setNext] = React.useState<string | null>(null), [error, setError] = React.useState(""), [busy, setBusy] = React.useState(false);
  const [legacy, setLegacy] = React.useState(false);
  const alive = React.useRef(true);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = async (cursor?: string) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pdf?history=1${cursor ? `&cursor=${cursor}` : ""}`), data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (alive.current) { setVersions(prev => cursor ? [...prev, ...data.versions] : data.versions); setNext(data.nextCursor); setLegacy(data.context?.captureReason === "legacy-first-render" || data.context?.captureReason === "before-edit"); }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Nie udało się pobrać historii."); }
    finally { if (alive.current) setBusy(false); }
  };
  return <details className="no-print rounded-xl border p-4" onToggle={e => { if (e.currentTarget.open) void load(); }}>
    <summary className="font-semibold">Zapisane wersje PDF</summary>
    <p className="text-sm my-2">Zmiana danych firmy lub szablonu nie przepisuje wcześniejszych wersji PDF. Podgląd HTML pozostaje podglądem roboczym; zapisany PDF otworzysz poniżej.</p>
    <a className="text-primary underline text-sm" href={`/api/invoices/${invoiceId}/pdf`} target="_blank" rel="noreferrer">Otwórz aktualny PDF / drukuj</a>
    {legacy && <p className="text-xs my-2">Ten starszy dokument otrzymał zapis danych przy pierwszym wydruku lub edycji. Wcześniejszy wygląd nie był przechowywany.</p>}
    {error && <p role="alert">{error}</p>}
    {versions.map(version => <div key={version.id} className="border-t py-3 mt-2 text-sm"><a className="text-primary underline" href={`/api/invoices/${invoiceId}/pdf?version=${version.id}`} target="_blank" rel="noreferrer">Dane dokumentu v{version.sourceVersion} · {new Date(version.createdAt).toLocaleString("pl-PL")}</a>{version.pdfSha256 && <p className="text-xs break-all mt-1">SHA-256: {version.pdfSha256}</p>}</div>)}
    {!versions.length && !busy && <p className="text-sm mt-2">Brak zapisanych wersji. PDF szkicu jest podglądem; starszy wystawiony dokument zostanie zapisany przy pobraniu.</p>}
    <div className="flex gap-2 mt-3"><Button disabled={busy} variant="ghost" onClick={() => load()}>Odśwież historię</Button>{next && <Button disabled={busy} variant="ghost" onClick={() => load(next)}>Starsze wersje</Button>}</div>
  </details>;
}
