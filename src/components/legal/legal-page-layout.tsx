"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  FileText, 
  Shield, 
  Cookie, 
  FileCheck, 
  Server, 
  Printer, 
  Download, 
  ArrowLeft,
  Calendar,
  Layers,
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LEGAL_VERSIONS, EFFECTIVE_DATE, OPERATOR_CONFIG } from "@/lib/legal/config";
import type { LegalDocument } from "@/lib/legal/content";

const NAV_ITEMS = [
  { href: "/regulamin", label: "Regulamin serwisu", icon: FileText, docType: "terms" },
  { href: "/polityka-prywatnosci", label: "Polityka prywatności", icon: Shield, docType: "privacy" },
  { href: "/polityka-cookies", label: "Polityka cookies", icon: Cookie, docType: "cookies" },
  { href: "/powierzenie-danych", label: "Umowa DPA (art. 28)", icon: FileCheck, docType: "dpa" },
  { href: "/podwykonawcy", label: "Wykaz podwykonawców", icon: Server, docType: "subprocessors" },
];

/**
 * Zamienia wieloliniowy tekst prawny (z numerowanymi ustępami, gwiazdkami, myślnikami)
 * na czytelne bloki <p> z odpowiednim formatowaniem.
 */
function LegalContent({ content }: { content: string }) {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const inline = (value: string) => value.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index} className="font-semibold text-foreground dark:text-foreground">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-muted px-1 dark:bg-muted">{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  });

  return (
    <div className="space-y-2 text-sm text-muted-foreground dark:text-muted-foreground leading-relaxed print:text-xs print:text-foreground">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("|")) {
          if (i > 0 && lines[i - 1].trim().startsWith("|")) return null;
          const tableLines: string[] = [];
          for (let j = i; j < lines.length && lines[j].trim().startsWith("|"); j++) tableLines.push(lines[j]);
          const parseCells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
          const [header, divider, ...body] = tableLines;
          if (divider && parseCells(divider).every(cell => /^:?-{3,}:?$/.test(cell))) {
            return <div key={i} className="overflow-x-auto rounded-lg border border-border dark:border-border"><table className="w-full min-w-[640px] border-collapse text-left text-xs"><thead className="bg-muted dark:bg-muted"><tr>{parseCells(header).map((cell, index) => <th key={index} scope="col" className="border-b p-2 font-semibold">{inline(cell)}</th>)}</tr></thead><tbody>{body.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-border dark:border-border">{parseCells(row).map((cell, cellIndex) => <td key={cellIndex} className="p-2 align-top">{inline(cell)}</td>)}</tr>)}</tbody></table></div>;
          }
          return <p key={i}>{inline(trimmed)}</p>;
        }
        if (/^---+$/.test(trimmed)) return <hr key={i} className="my-4 border-border dark:border-border" />;
        if (/^#{1,6}\s/.test(trimmed)) return <h3 key={i} className="pt-3 font-semibold text-foreground dark:text-foreground">{inline(trimmed.replace(/^#{1,6}\s+/, ""))}</h3>;
        const isNumbered = /^\d+\./.test(trimmed);
        const isSubpoint = /^[a-z]\)/.test(trimmed);
        const isBullet = trimmed.startsWith("- ");

        return (
          <p
            key={i}
            className={`${isSubpoint || (isBullet && line.startsWith("  ")) ? "pl-6" : isNumbered || isBullet ? "pl-2" : ""} ${trimmed.startsWith("**") ? "font-medium text-foreground dark:text-foreground" : ""}`}
          >{isBullet ? <>• {inline(trimmed.slice(2))}</> : inline(trimmed)}</p>
        );
      })}
    </div>
  );
}

interface LegalPageLayoutProps {
  document: LegalDocument;
}

export function LegalPageLayout({ document: doc }: LegalPageLayoutProps) {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = React.useState(0);

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const handleDownloadTxt = () => {
    let fullText = `${doc.title}\n${doc.description}\nWersja: ${doc.version} | Obowiązuje od: ${doc.effectiveDate}\nSerwis: ${OPERATOR_CONFIG.serviceUrl}\nOperator: ${OPERATOR_CONFIG.companyName}\n\n${"=".repeat(60)}\n\n`;

    doc.sections.forEach((sec, idx) => {
      fullText += `\n${sec.title}\n${"-".repeat(sec.title.length)}\n`;
      fullText += `${sec.content}\n\n`;
    });

    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${doc.slug}-${doc.version}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenCookieSettings = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open-cookie-preferences"));
    }
  };

  const sectionIds = doc.sections.map((sec, idx) =>
    sec.title.toLowerCase().replace(/[^a-ząćęłńóśźż0-9]+/g, "-").replace(/(^-|-$)/g, "") || `section-${idx}`
  );

  return (
    <div className="legal-document min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20">
      {/* ── TOP HEADER (Ukryty przy drukowaniu) ── */}
      <header className="print:hidden sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <Link prefetch={false}
              href="/"
              className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Powrót do serwisu</span>
            </Link>
            <span className="hidden sm:inline-block text-muted-foreground dark:text-foreground">|</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-tight text-primary dark:text-primary">FakturaProsto</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted dark:bg-muted text-muted-foreground dark:text-muted-foreground font-medium border border-border dark:border-border">
                Centrum Prawne
              </span>
            </div>
          </div>

          <div className="flex max-w-full flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenCookieSettings}
              className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted-foreground dark:text-muted-foreground"
            >
              <Sliders className="w-3.5 h-3.5 text-primary" />
              Preferencje cookies
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadTxt}
              className="inline-flex items-center gap-1.5 text-xs"
              title="Pobierz treść jako plik tekstowy"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Pobierz</span> .txt
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 text-xs"
              title="Drukuj lub zapisz jako PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              Drukuj / PDF
            </Button>
          </div>
        </div>

        {/* ── SUB-NAV: 5 DOKUMENTÓW PRAWNYCH ── */}
        <div className="border-t border-border dark:border-border/60 bg-background/70 dark:bg-card/50 overflow-x-auto scrollbar-thin">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 py-1.5 min-w-max">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link prefetch={false}
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground hover:bg-muted/60 dark:hover:bg-muted"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── BANER TYTUŁOWY DOKUMENTU ── */}
      <section className="border-b border-border dark:border-border bg-card dark:bg-card py-8 sm:py-12 print:py-4 print:border-b-2 print:border-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-wider text-primary dark:text-primary mb-2">
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" />
                Oficjalny Dokument Serwisu
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-muted-foreground dark:text-muted-foreground normal-case font-mono">
                Wersja: {doc.version}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-muted-foreground dark:text-muted-foreground normal-case">
                <Calendar className="w-3.5 h-3.5" />
                Obowiązuje od: {doc.effectiveDate}
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-slate-950 dark:text-white mb-3 print:text-2xl print:text-black">
              {doc.title}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground dark:text-muted-foreground leading-relaxed print:text-xs print:text-foreground">
              {doc.description}
            </p>
          </div>
        </div>
      </section>

      {/* ── GŁÓWNA ZAWARTOŚĆ + SPIS TREŚCI ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex-1 w-full print:p-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* SPIS TREŚCI (TOC) - Lewa kolumna (desktop) */}
          <aside className="lg:col-span-4 print:hidden sticky top-36 hidden lg:block bg-card dark:bg-card p-5 rounded-xl border border-border/80 dark:border-border shadow-sm max-h-[calc(100vh-10rem)] overflow-y-auto scrollbar-thin">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground mb-4 pb-2 border-b border-border dark:border-border">
              <Layers className="w-4 h-4 text-primary" />
              Spis treści dokumentu
            </div>
            <nav className="space-y-1 text-xs">
              {doc.sections.map((sec, idx) => {
                const isActive = activeSection === idx;
                return (
                  <a
                    key={idx}
                    href={`#${sectionIds[idx]}`}
                    onClick={() => setActiveSection(idx)}
                    className={`block py-1.5 px-2.5 rounded-lg transition-colors leading-tight ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground hover:bg-background dark:hover:bg-muted/50"
                    }`}
                  >
                    {sec.title}
                  </a>
                );
              })}
            </nav>

            <div className="mt-6 pt-4 border-t border-border dark:border-border text-xs text-muted-foreground dark:text-muted-foreground space-y-2">
              <div className="font-semibold text-foreground dark:text-muted-foreground">Operator serwisu:</div>
              <div>{OPERATOR_CONFIG.companyName}</div>
              <div className="text-muted-foreground dark:text-muted-foreground">Kontakt: {OPERATOR_CONFIG.emailContact}</div>
            </div>
          </aside>

          {/* TREŚĆ DOKUMENTU - Prawa kolumna */}
          <article className="min-w-0 break-words lg:col-span-8 space-y-8 bg-card dark:bg-card p-6 sm:p-10 rounded-xl border border-border/80 dark:border-border shadow-sm print:shadow-none print:border-none print:p-0 print:space-y-6">
            {doc.sections.map((sec, index) => (
              <section
                key={index}
                id={sectionIds[index]}
                className="scroll-mt-36 border-b border-border dark:border-border pb-8 last:border-b-0 print:border-b print:pb-4"
              >
                <h2 className="text-lg sm:text-xl font-bold text-foreground dark:text-foreground mb-4 print:text-base print:text-black">
                  {sec.title}
                </h2>
                <LegalContent content={sec.content} />
              </section>
            ))}
          </article>
        </div>
      </main>

      {/* ── STOPKA STRONY PRAWNEJ ── */}
      <footer className="print:hidden border-t border-border dark:border-border bg-card dark:bg-card py-8 text-xs text-muted-foreground dark:text-muted-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <span className="font-semibold text-foreground dark:text-muted-foreground">{OPERATOR_CONFIG.serviceName}</span> — oficjalny system dokumentacji prawnej i ochrony prywatności.
            <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-1">
              Dokumenty sporządzone zgodnie z RODO (UE 2016/679), Prawem komunikacji elektronicznej (PKE) oraz Ustawą o prawach konsumenta.
            </p>
          </div>
          <div className="flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
            <button
              onClick={handleOpenCookieSettings}
              className="text-primary dark:text-primary hover:underline inline-flex items-center gap-1"
            >
              <Sliders className="w-3 h-3" /> Zmień zgody cookies
            </button>
            <span>•</span>
            <a
              href={`mailto:${OPERATOR_CONFIG.emailPrivacy}`}
              className="text-primary dark:text-primary hover:underline"
            >
              Kontakt IOD / Prywatność
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
