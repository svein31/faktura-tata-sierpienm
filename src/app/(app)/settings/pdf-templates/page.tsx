"use client";
import * as React from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { DEFAULT_PRINT_CONFIG, type PrintConfig } from "@/lib/pdf/print-config";
type Version = { id: string; version: number; name: string; config: PrintConfig; createdAt: string };
type Data = { setting: { version: number }; active: { name: string; config: PrintConfig }; versions: Version[]; nextCursor: string | null; canManage: boolean };
export default function PdfTemplatesPage() {
  const companyId = useAppStore(s => s.selectedCompanyId);
  return <div className="page space-y-4"><PageHeader title="Szablony PDF" description="Nowa wersja szablonu dotyczy nowych dokumentów. Wcześniejsze wydruki zachowują przypisany wygląd." />{companyId ? <Editor key={companyId} companyId={companyId} /> : <p>Wybierz firmę.</p>}</div>;
}
function Editor({ companyId }: { companyId: string }) {
  const [data, setData] = React.useState<Data | null>(null), [config, setConfig] = React.useState<PrintConfig>(DEFAULT_PRINT_CONFIG), [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(""), [message, setMessage] = React.useState("");
  const alive = React.useRef(true);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = React.useCallback(async (cursor?: string) => {
    const res = await fetch(`/api/pdf-templates?${new URLSearchParams({ companyId, ...(cursor ? { cursor } : {}) })}`), result = await res.json();
    if (!res.ok) throw new Error(result.error);
    if (!alive.current) return;
    setData(prev => cursor && prev ? { ...result, versions: [...prev.versions, ...result.versions] } : result);
    if (!cursor) { setName(result.active.name); setConfig(result.active.config); }
  }, [companyId]);
  React.useEffect(() => { void load().catch(e => { if (alive.current) setError(e.message); }); }, [load]);
  const save = async () => {
    if (!data || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/pdf-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, version: data.setting.version, name, ...config }) }), result = await res.json();
      if (!res.ok) throw new Error(result.error);
      if (alive.current) { await load(); setMessage(`Zapisano wersję ${result.version} dla nowych dokumentów.`); }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Błąd zapisu."); }
    finally { if (alive.current) setBusy(false); }
  };
  return <div className="space-y-4 max-w-4xl">
    {error && <p role="alert" className="border border-rose-500 rounded-lg p-3">{error}<Button variant="ghost" onClick={() => { void load().catch(e => setError(e.message)); }}>Odśwież</Button></p>}
    {message && <p role="status">{message}</p>}
    <fieldset disabled={busy || !data?.canManage} className="border rounded-xl p-4 grid gap-3 sm:grid-cols-2">
      <legend>Nowa wersja szablonu</legend>
      <label>Nazwa<Input value={name} maxLength={100} onChange={e => setName(e.target.value)} /></label>
      <label>Kolor akcentu<Input type="color" value={config.accentColor} onChange={e => setConfig(prev => ({ ...prev, accentColor: e.target.value }))} /></label>
      <label>Układ<Select value={config.layout} onChange={e => setConfig(prev => ({ ...prev, layout: e.target.value as PrintConfig["layout"] }))}><option value="classic">Klasyczny</option><option value="compact">Kompaktowy</option></Select></label>
      <label>Stopka<Input value={config.footerText} maxLength={150} onChange={e => setConfig(prev => ({ ...prev, footerText: e.target.value }))} /></label>
      <Button disabled={!name.trim()} onClick={save}>Zapisz nową wersję</Button>
    </fieldset>
    <p className="text-sm">Dane firmy i nabywcy są zapisywane przy wystawieniu dokumentu. Starsze dokumenty bez zapisanego wydruku otrzymają dane dostępne przy pierwszym pobraniu — nie odtwarzamy nieznanej historii.</p>
    <div className="border rounded-xl p-4"><h2 className="font-semibold">Historia szablonów</h2>{data?.versions.map(version => <div key={version.id} className="py-3 border-b text-sm flex flex-wrap justify-between gap-2"><span>Wersja {version.version}: {version.name} · {new Date(version.createdAt).toLocaleString("pl-PL")}</span>{data.canManage && <Button disabled={busy} variant="ghost" onClick={() => { setName(version.name); setConfig(version.config); }}>Skopiuj do formularza</Button>}</div>)}{data?.nextCursor && <Button disabled={busy} onClick={() => { void load(data.nextCursor!).catch(e => setError(e.message)); }}>Starsze wersje</Button>}</div>
  </div>;
}
