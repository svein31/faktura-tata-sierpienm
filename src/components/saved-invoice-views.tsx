"use client";
import * as React from "react";
import { useWorkspacePreference } from "@/lib/use-workspace-preference";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
type Filters = Record<string, string>;
type View = { name: string; filters: Filters };
export function SavedInvoiceViews({ companyId, filters, apply }: { companyId: string | null; filters: Filters; apply: (value: Filters) => void }) {
  const prefs = useWorkspacePreference<View[]>("invoice-views", companyId);
  const views = Array.isArray(prefs.value) ? prefs.value.filter(v => typeof v?.name === "string" && v.filters && typeof v.filters === "object").slice(0, 20) : [];
  const [name, setName] = React.useState("");
  const [selected, setSelected] = React.useState("");
  React.useEffect(() => { setSelected(""); setName(""); }, [companyId]);
  return <div className="mb-4 rounded-xl border border-border p-3">
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="Zapisane widoki faktur" value={selected} onChange={e => { setSelected(e.target.value); const view = views.find(v => v.name === e.target.value); if (view) apply(view.filters); }}><option value="">Zapisane widoki</option>{views.map(v => <option key={v.name}>{v.name}</option>)}</Select>
      <Input aria-label="Nazwa widoku" placeholder="Nazwa bieżącego widoku" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
      <Button disabled={!prefs.ready || prefs.saving || !name.trim() || views.length >= 20} onClick={async () => { const label = name.trim(); if (await prefs.save([...views.filter(v => v.name !== label), { name: label, filters }])) { setName(""); setSelected(label); } }}>Zapisz filtry</Button>
      {selected && <Button variant="ghost" disabled={prefs.saving} onClick={async () => { if (await prefs.save(views.filter(v => v.name !== selected))) setSelected(""); }}>Usuń widok</Button>}
    </div>
    {prefs.error && <p role="alert" className="mt-2 text-sm text-destructive">{prefs.error}</p>}
  </div>;
}
