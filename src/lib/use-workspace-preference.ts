"use client";
import * as React from "react";

export function useWorkspacePreference<T>(key: string, companyId?: string | null) {
  const url = `/api/workspace/preferences?key=${encodeURIComponent(key)}&companyId=${encodeURIComponent(companyId || "account")}`;
  const [state, setState] = React.useState<{ url: string; value: T | null; revision: string }>({ url: "", value: null, revision: "" });
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const current = React.useRef(url); current.current = url;
  React.useEffect(() => {
    const controller = new AbortController(); setError("");
    fetch(url, { signal: controller.signal }).then(async res => {
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Błąd odczytu ustawień.");
      if (!controller.signal.aborted) setState({ url, ...data });
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [url]);
  const save = async (value: T) => {
    if (state.url !== url || saving) return false;
    setSaving(true); setError("");
    try {
      const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value, revision: state.revision }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Błąd zapisu ustawień.");
      if (current.current === url) setState({ url, ...data });
      return true;
    } catch (e) { if (current.current === url) setError(e instanceof Error ? e.message : "Błąd zapisu ustawień."); return false; }
    finally { setSaving(false); }
  };
  return { value: state.url === url ? state.value : null, ready: state.url === url, saving, error, save };
}
