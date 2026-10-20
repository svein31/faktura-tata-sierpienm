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
  success: <CheckCircle2 className="ui-save-confirmed h-4 w-4 text-success dark:text-success" aria-hidden="true" />,
  error: <XCircle className="h-4 w-4 text-destructive" />,
  info: <Info className="h-4 w-4 text-info" />,
  warning: <AlertTriangle className="h-4 w-4 text-warning" />,
};

const kindStyles: Record<ToastKind, string> = {
  success: "border-success/30 bg-card ",
  error: "border-destructive/30 bg-card ",
  info: "border-info/30 bg-card ",
  warning: "border-warning/30 bg-card ",
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
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-lg motion-safe:animate-toast-enter ${kindStyles[t.kind]}`}
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
