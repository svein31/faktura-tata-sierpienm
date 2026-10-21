"use client";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
export function ReportButton({ compact = false }: { compact?: boolean }) {
  return <Button variant={compact ? "ghost" : "outline"} size={compact ? "icon" : "sm"} aria-label="Zgłoś problem lub pomysł" title="Zgłoś problem lub pomysł" onClick={() => window.dispatchEvent(new CustomEvent("fakturaprosto:open-support"))} className="shrink-0 gap-2"><MessageSquare aria-hidden="true" className="size-4" />{!compact && "Zgłoś problem"}</Button>;
}
