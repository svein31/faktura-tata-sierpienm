"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileCode2,
  FileDown,
  FileText,
  Play,
  Plus,
  QrCode,
  Receipt,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { formatMoney, round2 } from "@/lib/format";
import { buildFa3Xml, validateFa3Xml, generateDemoUpoXml } from "@/lib/ksef/index";
import type { CompanyProfile, Contractor, Invoice, InvoiceLine, VatRate } from "@/lib/types";

const DEMO_SELLER: CompanyProfile = {
  id: "demo-seller",
  userId: "demo-user",
  nip: "5260301706",
  companyName: "Alfa Tech Sp. z o.o.",
  street: "ul. Prosta 15",
  buildingNumber: "15",
  city: "Warszawa",
  postalCode: "00-850",
  bankAccount: "12 1050 0099 6711 0000 0000 0001",
  isDefault: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  country: "PL",
  bankName: "ING Bank Śląski",
  email: "faktury@alfatech-demo.pl",
  phone: "+48 22 123 45 67",
};

const DEMO_BUYER: Contractor = {
  id: "demo-buyer",
  name: "Beta Solutions S.A.",
  nip: "5270000024",
  address: {
    street: "ul. Domaniewska 32",
    city: "Warszawa",
    postal: "02-672",
    country: "PL",
  },
  email: "ksiegowosc@betasolutions.pl",
  phone: "+48 22 987 65 43",
  isVatPayer: true,
  createdAt: new Date().toISOString(),
};

interface DemoLineItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  netPrice: number;
  vatRate: VatRate;
}

export default function DemoPage() {
  const [buyerName, setBuyerName] = React.useState(DEMO_BUYER.name);
  const [buyerNip, setBuyerNip] = React.useState(DEMO_BUYER.nip);
  const [buyerStreet, setBuyerStreet] = React.useState(DEMO_BUYER.address.street);
  const [buyerCity, setBuyerCity] = React.useState(DEMO_BUYER.address.city);
  const [buyerPostal, setBuyerPostal] = React.useState(DEMO_BUYER.address.postal);

  const [invoiceNumber, setInvoiceNumber] = React.useState("FV/2026/09/DEMO1");
  const [paymentMethod, setPaymentMethod] = React.useState("transfer");
  const [lines, setLines] = React.useState<DemoLineItem[]>([
    {
      id: "1",
      name: "Dedykowana integracja KSeF 2.0 (API v2.0 / FA(3))",
      quantity: 1,
      unit: "usł.",
      netPrice: 3500,
      vatRate: "23",
    },
    {
      id: "2",
      name: "Szkolenie zespołu księgowego z obsługi e-Faktur",
      quantity: 4,
      unit: "godz.",
      netPrice: 250,
      vatRate: "23",
    },
  ]);

  const [activeTab, setActiveTab] = React.useState<"form" | "xml" | "ksef">("form");
  const [ksefStatus, setKsefStatus] = React.useState<"idle" | "sending" | "accepted">("idle");
  const [ksefNumber, setKsefNumber] = React.useState<string | null>(null);
  const [upoXml, setUpoXml] = React.useState<string | null>(null);

  // Wyliczenia
  const calculateTotals = () => {
    let totalNet = 0;
    let totalVat = 0;
    for (const l of lines) {
      const net = round2(l.quantity * l.netPrice);
      const rate = Number(l.vatRate) || 0;
      const vat = round2((net * rate) / 100);
      totalNet = round2(totalNet + net);
      totalVat = round2(totalVat + vat);
    }
    const totalGross = round2(totalNet + totalVat);
    return { totalNet, totalVat, totalGross };
  };

  const totals = calculateTotals();

  // Konstrukcja DTO dla XML
  const currentBuyer: Contractor = {
    id: "demo-buyer",
    name: buyerName,
    nip: buyerNip,
    address: {
      street: buyerStreet,
      city: buyerCity,
      postal: buyerPostal,
      country: "PL",
    },
    isVatPayer: true,
    createdAt: new Date().toISOString(),
  };

  const invoiceDto: Invoice = {
    id: "demo-inv-1",
    number: invoiceNumber,
    type: "sale",
    status: "draft",
    contractorId: "demo-buyer",
    issueDate: new Date().toISOString().slice(0, 10),
    saleDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    currency: "PLN",
    language: "PL",
    paymentMethod: paymentMethod as any,
    paymentTermDays: 14,
    lines: lines.map((l) => ({
      id: l.id,
      name: l.name,
      quantity: l.quantity,
      unit: l.unit,
      netPrice: l.netPrice,
      vatRate: l.vatRate,
    })),
    createdAt: new Date().toISOString(),
  };

  const generatedXml = React.useMemo(() => {
    try {
      return buildFa3Xml({
        invoice: invoiceDto,
        seller: DEMO_SELLER,
        buyer: currentBuyer,
        systemInfo: "FakturaProsto Demo Simulator 2.0",
      });
    } catch {
      return "<!-- Błąd generowania XML -->";
    }
  }, [invoiceDto, currentBuyer]);

  const validationResult = React.useMemo(() => {
    return validateFa3Xml(generatedXml);
  }, [generatedXml]);

  const handleSimulateKsefSend = () => {
    setKsefStatus("sending");
    setTimeout(() => {
      const now = new Date();
      const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const rand = Math.random().toString(16).slice(2, 8).toUpperCase();
      const num = `5260301706-${ymd}-DEMO${rand}-11`;
      const elemRef = `${ymd}-EE-${rand}0000-B67F415CDC-2C`;
      const upo = generateDemoUpoXml(elemRef, num);

      setKsefNumber(num);
      setUpoXml(upo);
      setKsefStatus("accepted");
      setActiveTab("ksef");
    }, 1200);
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        name: "Nowa pozycja towarowa / usługa",
        quantity: 1,
        unit: "szt.",
        netPrice: 100,
        vatRate: "23",
      },
    ]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, patch: Partial<DemoLineItem>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      {/* ── NAWIGACJA DEMO ── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <Logo />
            </Link>
            <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              Piaskownica DEMO
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Strona główna</span>
            </Link>
            <Link
              href="/register"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all"
            >
              <span>Załóż pełne konto</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── BANER INFORMACYJNY ── */}
      <div className="border-b border-sky-500/20 bg-sky-500/5 px-4 py-2.5 text-center text-xs text-sky-700 dark:text-sky-300">
        <span className="font-semibold">Bezpieczny tryb demonstracyjny:</span> Dane są fikcyjne i
        przetwarzane wyłącznie w Twojej przeglądarce. Żadne faktury nie trafiają do produkcyjnego KSeF.
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Nagłówek piaskownicy */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Interaktywny symulator e-Faktur FA(3)
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              Edytuj pozycje, sprawdź XML i zasymuluj wysyłkę do KSeF z przykładowym UPO.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleSimulateKsefSend}
              disabled={ksefStatus === "sending" || !validationResult.ok}
              className="h-10 gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-600/20"
            >
              {ksefStatus === "sending" ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Szyfrowanie i wysyłka…</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Wyślij do KSeF (Symulacja)</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* ── ZAKŁADKI: FORMULARZ / XML / WYNIK KSEF ── */}
        <div className="flex gap-2 border-b border-border/70 pb-3 mb-6 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("form")}
            className={`px-3.5 py-2 rounded-xl transition-all ${
              activeTab === "form"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            1. Formularz faktury
          </button>
          <button
            onClick={() => setActiveTab("xml")}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === "xml"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <FileCode2 className="h-3.5 w-3.5" />
            <span>2. Struktura XML FA(3)</span>
            <span
              className={`h-2 w-2 rounded-full ${validationResult.ok ? "bg-emerald-400" : "bg-rose-400"}`}
            />
          </button>
          <button
            onClick={() => setActiveTab("ksef")}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === "ksef"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>3. Odpowiedź KSeF i UPO</span>
            {ksefStatus === "accepted" && (
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        </div>

        {/* ── TAB 1: FORMULARZ FAKTURY ── */}
        {activeTab === "form" && (
          <div className="space-y-6">
            {/* Sekcja Sprzedawca & Nabywca */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Sprzedawca (stały podmiot demonstracyjny) */}
              <Card className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Sprzedawca (Wystawca)
                  </span>
                  <span className="text-[11px] font-medium text-primary">Profil demo</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <p className="font-bold text-sm text-foreground">{DEMO_SELLER.companyName}</p>
                  <p className="text-muted-foreground">NIP: {DEMO_SELLER.nip} (Czynny podatnik VAT)</p>
                  <p className="text-muted-foreground">
                    Adres: {DEMO_SELLER.street}, {DEMO_SELLER.postalCode} {DEMO_SELLER.city}
                  </p>
                  <p className="text-muted-foreground">IBAN: {DEMO_SELLER.bankAccount}</p>
                </div>
              </Card>

              {/* Nabywca (edytowalny) */}
              <Card className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Nabywca (Kontrahent)
                  </span>
                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    Edytowalny
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <Label className="text-[11px]">Nazwa kontrahenta</Label>
                    <Input
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">NIP</Label>
                    <Input
                      value={buyerNip}
                      onChange={(e) => setBuyerNip(e.target.value)}
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Ulica i numer</Label>
                    <Input
                      value={buyerStreet}
                      onChange={(e) => setBuyerStreet(e.target.value)}
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Kod pocztowy</Label>
                    <Input
                      value={buyerPostal}
                      onChange={(e) => setBuyerPostal(e.target.value)}
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Miasto</Label>
                    <Input
                      value={buyerCity}
                      onChange={(e) => setBuyerCity(e.target.value)}
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                </div>
              </Card>
            </div>

            {/* Pozycje faktury */}
            <Card className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-4">
                <h3 className="text-sm font-bold text-foreground">Pozycje towarów i usług</h3>
                <Button
                  onClick={addLine}
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-primary hover:bg-primary/10"
                >
                  <Plus className="h-3.5 w-3.5" /> Dodaj wiersz
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-[11px]">
                      <th className="py-2 px-2">Nazwa pozycji</th>
                      <th className="py-2 px-2 w-20">Ilość</th>
                      <th className="py-2 px-2 w-20">J.m.</th>
                      <th className="py-2 px-2 w-32">Cena netto</th>
                      <th className="py-2 px-2 w-24">Stawka VAT</th>
                      <th className="py-2 px-2 w-32 text-right">Wartość brutto</th>
                      <th className="py-2 px-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {lines.map((line) => {
                      const net = round2(line.quantity * line.netPrice);
                      const rate = Number(line.vatRate) || 0;
                      const gross = round2(net + (net * rate) / 100);

                      return (
                        <tr key={line.id} className="hover:bg-muted/20">
                          <td className="py-2 px-2">
                            <Input
                              value={line.name}
                              onChange={(e) => updateLine(line.id, { name: e.target.value })}
                              className="h-8 text-xs"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Input
                              type="number"
                              min="1"
                              value={line.quantity}
                              onChange={(e) =>
                                updateLine(line.id, { quantity: Math.max(1, Number(e.target.value)) })
                              }
                              className="h-8 text-xs tabular-nums"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Input
                              value={line.unit}
                              onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                              className="h-8 text-xs"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.netPrice}
                              onChange={(e) =>
                                updateLine(line.id, { netPrice: Math.max(0, Number(e.target.value)) })
                              }
                              className="h-8 text-xs tabular-nums font-mono"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Select
                              value={line.vatRate}
                              onChange={(e) =>
                                updateLine(line.id, { vatRate: e.target.value as VatRate })
                              }
                              className="h-8 text-xs"
                            >
                              <option value="23">23%</option>
                              <option value="8">8%</option>
                              <option value="5">5%</option>
                              <option value="0">0%</option>
                              <option value="zw">zw.</option>
                            </Select>
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-foreground tabular-nums">
                            {formatMoney(gross, "PLN")}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              onClick={() => removeLine(line.id)}
                              disabled={lines.length <= 1}
                              className="p-1 rounded text-muted-foreground hover:text-rose-500 disabled:opacity-30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Podsumowanie finansowe */}
              <div className="mt-6 flex justify-end border-t border-border/60 pt-4">
                <div className="w-full max-w-sm space-y-2 text-xs text-right">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Suma netto:</span>
                    <span className="font-semibold text-foreground">{formatMoney(totals.totalNet, "PLN")}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Kwota podatku VAT:</span>
                    <span className="font-semibold text-foreground">{formatMoney(totals.totalVat, "PLN")}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-foreground border-t border-border pt-2">
                    <span>Razem do zapłaty:</span>
                    <span className="text-primary text-lg">{formatMoney(totals.totalGross, "PLN")}</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ── TAB 2: INSPEKTOR XML FA(3) ── */}
        {activeTab === "xml" && (
          <Card className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Oficjalny schemat e-Faktury FA(3)
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Przestrzeń nazw: http://crd.gov.pl/wzor/2025/06/25/13775/
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    validationResult.ok
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : "bg-rose-500/15 text-rose-600 border border-rose-500/30"
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{validationResult.ok ? "Zgodny ze schematem FA(3)" : "Błędy walidacji"}</span>
                </span>
              </div>
            </div>

            <pre className="p-4 rounded-xl bg-muted/40 font-mono text-xs overflow-x-auto text-foreground max-h-[500px] leading-relaxed border border-border/60">
              {generatedXml}
            </pre>
          </Card>
        )}

        {/* ── TAB 3: SYMULACJA KSEF I UPO ── */}
        {activeTab === "ksef" && (
          <div className="space-y-6">
            <Card className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-3 border-b border-border/60 pb-4 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    {ksefNumber ? "Symulacja zakończona" : "Brak wysyłki"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {ksefNumber
                      ? "To tylko przykład: nie wysłano faktury do KSeF. Numer i UPO są fikcyjne i nie mają skutków prawnych."
                      : "Kliknij przycisk „Wyślij do KSeF”, aby przeprowadzić symulację."}
                  </p>
                </div>
              </div>

              {ksefNumber ? (
                <div className="space-y-4">
                  <p role="status" className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-700 dark:text-sky-300">DEMO — przykładowa odpowiedź, bez rejestracji w KSeF.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-muted/30 border border-border/60 text-xs">
                    <div>
                      <p className="text-muted-foreground">Przykładowy numer (DEMO):</p>
                      <p className="font-mono font-bold text-sm text-foreground mt-0.5">{ksefNumber}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Przykładowy kod odpowiedzi:</p>
                      <p className="font-bold text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">
                        200 — symulacja przyjęcia dokumentu
                      </p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
                      <FileCode2 className="h-4 w-4 text-primary" />
                      <span>Przykładowe UPO XML (DEMO, nieurzędowe):</span>
                    </h4>
                    <pre className="p-4 rounded-xl bg-muted/40 font-mono text-xs overflow-x-auto text-foreground max-h-60 border border-border/60">
                      {upoXml}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center">
                  <Button onClick={handleSimulateKsefSend} className="gap-2">
                    <Send className="h-4 w-4" />
                    <span>Przeprowadź symulację wysyłki</span>
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
