"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

type ToastKind = "success" | "error" | "info" | "warning";
interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
}

const ToastContext = React.createContext<{
  toast: (kind: ToastKind, title: string, description?: string) => void;
} | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.toast;
}

const icons: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  error: <XCircle className="h-4 w-4 text-rose-500" />,
  info: <Info className="h-4 w-4 text-sky-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
};

const kindStyles: Record<ToastKind, string> = {
  success: "border-emerald-500/30 bg-card/90 shadow-emerald-500/5",
  error: "border-rose-500/30 bg-card/90 shadow-rose-500/5",
  info: "border-sky-500/30 bg-card/90 shadow-sky-500/5",
  warning: "border-amber-500/30 bg-card/90 shadow-amber-500/5",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback((kind: ToastKind, title: string, description?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((t) => [...t.slice(-3), { id, kind, title, description }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="no-print pointer-events-none fixed bottom-5 right-5 z-[70] flex w-[min(92vw,360px)] flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-3.5 shadow-xl motion-safe:animate-toast-enter ${kindStyles[t.kind]}`}
            >
              <div className="mt-0.5 shrink-0 rounded-lg p-1 bg-muted/50">{icons[t.kind]}</div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-tight text-foreground">{t.title}</p>
                {t.description && (
                  <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                    {t.description}
                  </p>
                )}
              </div>
            </div>
          ))}
      </div>
    </ToastContext.Provider>
  );
}
