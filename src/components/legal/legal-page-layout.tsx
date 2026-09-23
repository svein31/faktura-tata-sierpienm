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
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index} className="font-semibold text-slate-800 dark:text-slate-200">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-slate-100 px-1 dark:bg-slate-800">{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  });

  return (
    <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed print:text-xs print:text-slate-800">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("|")) {
          if (i > 0 && lines[i - 1].trim().startsWith("|")) return null;
          const tableLines: string[] = [];
          for (let j = i; j < lines.length && lines[j].trim().startsWith("|"); j++) tableLines.push(lines[j]);
          const parseCells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
          const [header, divider, ...body] = tableLines;
          if (divider && parseCells(divider).every(cell => /^:?-{3,}:?$/.test(cell))) {
            return <div key={i} className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700"><table className="w-full min-w-[640px] border-collapse text-left text-xs"><thead className="bg-slate-100 dark:bg-slate-800"><tr>{parseCells(header).map((cell, index) => <th key={index} scope="col" className="border-b p-2 font-semibold">{inline(cell)}</th>)}</tr></thead><tbody>{body.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-slate-200 dark:border-slate-700">{parseCells(row).map((cell, cellIndex) => <td key={cellIndex} className="p-2 align-top">{inline(cell)}</td>)}</tr>)}</tbody></table></div>;
          }
          return <p key={i}>{inline(trimmed)}</p>;
        }
        if (/^---+$/.test(trimmed)) return <hr key={i} className="my-4 border-slate-200 dark:border-slate-800" />;
        if (/^#{1,6}\s/.test(trimmed)) return <h3 key={i} className="pt-3 font-semibold text-slate-900 dark:text-slate-100">{inline(trimmed.replace(/^#{1,6}\s+/, ""))}</h3>;
        const isNumbered = /^\d+\./.test(trimmed);
        const isSubpoint = /^[a-z]\)/.test(trimmed);
        const isBullet = trimmed.startsWith("- ");

        return (
          <p
            key={i}
            className={`${isSubpoint || (isBullet && line.startsWith("  ")) ? "pl-6" : isNumbered || isBullet ? "pl-2" : ""} ${trimmed.startsWith("**") ? "font-medium text-slate-800 dark:text-slate-200" : ""}`}
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col selection:bg-blue-500 selection:text-white">
      {/* ── TOP HEADER (Ukryty przy drukowaniu) ── */}
      <header className="print:hidden sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Powrót do serwisu</span>
            </Link>
            <span className="hidden sm:inline-block text-slate-300 dark:text-slate-700">|</span>
            <div className="flex items-center gap-2">
              <span className="font-black tracking-tight text-blue-600 dark:text-blue-400">FakturaProsto</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium border border-slate-200 dark:border-slate-700">
                Centrum Prawne
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenCookieSettings}
              className="hidden md:inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"
            >
              <Sliders className="w-3.5 h-3.5 text-blue-600" />
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
              className="bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center gap-1.5 text-xs shadow-sm"
              title="Drukuj lub zapisz jako PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              Drukuj / PDF
            </Button>
          </div>
        </div>

        {/* ── SUB-NAV: 5 DOKUMENTÓW PRAWNYCH ── */}
        <div className="border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/70 dark:bg-slate-900/50 overflow-x-auto scrollbar-thin">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 py-1.5 min-w-max">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-slate-500"}`} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── BANER TYTUŁOWY DOKUMENTU ── */}
      <section className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-8 sm:py-12 print:py-4 print:border-b-2 print:border-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2">
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" />
                Oficjalny Dokument Serwisu
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400 normal-case font-mono">
                Wersja: {doc.version}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400 normal-case">
                <Calendar className="w-3.5 h-3.5" />
                Obowiązuje od: {doc.effectiveDate}
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white mb-3 print:text-2xl print:text-black">
              {doc.title}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed print:text-xs print:text-slate-800">
              {doc.description}
            </p>
          </div>
        </div>
      </section>

      {/* ── GŁÓWNA ZAWARTOŚĆ + SPIS TREŚCI ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex-1 w-full print:p-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* SPIS TREŚCI (TOC) - Lewa kolumna (desktop) */}
          <aside className="lg:col-span-4 print:hidden sticky top-36 hidden lg:block bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm max-h-[calc(100vh-10rem)] overflow-y-auto scrollbar-thin">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              <Layers className="w-4 h-4 text-blue-600" />
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
                        ? "bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-semibold"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    {sec.title}
                  </a>
                );
              })}
            </nav>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-2">
              <div className="font-semibold text-slate-700 dark:text-slate-300">Operator serwisu:</div>
              <div>{OPERATOR_CONFIG.companyName}</div>
              <div className="text-slate-400">Kontakt: {OPERATOR_CONFIG.emailContact}</div>
            </div>
          </aside>

          {/* TREŚĆ DOKUMENTU - Prawa kolumna */}
          <article className="lg:col-span-8 space-y-8 bg-white dark:bg-slate-900 p-6 sm:p-10 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm print:shadow-none print:border-none print:p-0 print:space-y-6">
            {doc.sections.map((sec, index) => (
              <section
                key={index}
                id={sectionIds[index]}
                className="scroll-mt-36 border-b border-slate-100 dark:border-slate-800 pb-8 last:border-b-0 print:border-b print:pb-4"
              >
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 print:text-base print:text-black">
                  {sec.title}
                </h2>
                <LegalContent content={sec.content} />
              </section>
            ))}
          </article>
        </div>
      </main>

      {/* ── STOPKA STRONY PRAWNEJ ── */}
      <footer className="print:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-8 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <span className="font-semibold text-slate-700 dark:text-slate-300">{OPERATOR_CONFIG.serviceName}</span> — oficjalny system dokumentacji prawnej i ochrony prywatności.
            <p className="text-[11px] text-slate-400 mt-1">
              Dokumenty sporządzone zgodnie z RODO (UE 2016/679), Prawem komunikacji elektronicznej (PKE) oraz Ustawą o prawach konsumenta.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <button
              onClick={handleOpenCookieSettings}
              className="text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              <Sliders className="w-3 h-3" /> Zmień zgody cookies
            </button>
            <span>•</span>
            <a
              href={`mailto:${OPERATOR_CONFIG.emailPrivacy}`}
              className="text-blue-600 hover:underline"
            >
              Kontakt IOD / Prywatność
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
