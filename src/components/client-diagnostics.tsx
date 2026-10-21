"use client";
import { useEffect } from "react";
export function ClientDiagnostics() {
  useEffect(() => {
    let stopped = false, cleanup: (() => void) | undefined;
    void import("@/lib/browser-diagnostics").then(({ installBrowserDiagnostics }) => { if (!stopped) cleanup = installBrowserDiagnostics(); }).catch(() => {});
    return () => { stopped = true; cleanup?.(); };
  }, []);
  return null;
}
