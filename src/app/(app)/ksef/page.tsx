"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  FileCode2,
  FlaskConical,
  KeyRound,
  Loader2,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { useAppStore, getContractor } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label, Select, Textarea, Checkbox } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/page-header";
import { validateFa2, FA2_TEMPLATE } from "@/lib/ksef";
import { buildFaVatXml } from "@/lib/xml";
import { formatDateTime, formatMoney, invoiceTotals } from "@/lib/format";
import { EMPTY_COMPANY } from "@/lib/types";
import type { Fa2Issue, Invoice, KsefEnv, KsefSendResult } from "@/lib/types";

const ENV_INFO: Record<KsefEnv, { label: string; desc: string; tone: "accent" | "warning" | "danger" }> = {
  demo: {
    label: "Demo",
    desc: "Symulacja wysyłki bez certyfikatu i tokena — do testów interfejsu.",
    tone: "accent",
  },
  test: {
    label: "Test (MF)",
    desc: "Środowisko testowe KSeF (ksef-test.mf.gov.pl) — wymaga tokena KSeF.",
    tone: "warning",
  },
  production: {
    label: "Produkcja",
    desc: "Krajowy System e-Faktur (ksef.mf.gov.pl) — wymaga tokena produkcyjnego MF.",
    tone: "danger",
  },
};

function KsefPageInner() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const store = useAppStore();
  const { ksef, updateKsef, company, updateCompany, invoices, contractors } = store;
  const companySafe = company ?? EMPTY_COMPANY;
  const ksefSafe = ksef ?? {
    environment: "demo" as KsefEnv,
    tokenSet: false,
    tokenMask: "",
    certName: "",
    autoValidate: true,
  };

  const [tab, setTab] = React.useState(searchParams.get("tab") === "settings" ? "settings" : "settings");

  // Lokalne pola ustawień KSeF (zapis przez API tylko po kliknięciu „Zapisz").
  const [envDraft, setEnvDraft] = React.useState<KsefEnv>(ksefSafe.environment);
  const [certDraft, setCertDraft] = React.useState(ksefSafe.certName);
  const [autoDraft, setAutoDraft] = React.useState(ksefSafe.autoValidate);
  const [tokenDraft, setTokenDraft] = React.useState("");
  const [savingKsef, setSavingKsef] = React.useState(false);

  const [companyDraft, setCompanyDraft] = React.useState(companySafe);
  const [companySaved, setCompanySaved] = React.useState(false);

  // FA(2)
  const [selectedInvoiceId, setSelectedInvoiceId] = React.useState("");
  const [xml, setXml] = React.useState("");
  const [issues, setIssues] = React.useState<Fa2Issue[] | null>(null);
  const [valid, setValid] = React.useState<boolean | null>(null);
  const [sending, setSending] = React.useState(false);
  const [sendResult, setSendResult] = React.useState<KsefSendResult | null>(null);

  const salesWithoutKsef = invoices.filter((i) => i.type === "sale" && !i.ksef && i.status !== "draft");
  const ksefInvoices = invoices.filter((i) => i.ksef);
  const purchaseInvoices = invoices.filter((i) => i.type === "purchase");

  const saveKsefSettings = async () => {
    setSavingKsef(true);
    try {
      const patch: {
        environment: KsefEnv;
        certName: string;
        autoValidate: boolean;
        token?: string;
      } = {
        environment: envDraft,
        certName: certDraft,
        autoValidate: autoDraft,
      };
      if (tokenDraft.trim().length > 0) patch.token = tokenDraft.trim();
      await updateKsef(patch);
      setTokenDraft("");
      toast("success", "Zapisano ustawienia KSeF");
    } catch (e) {
      toast("error", "Nie udało się zapisać", e instanceof Error ? e.message : undefined);
    } finally {
      setSavingKsef(false);
    }
  };

  const saveCompany = async () => {
    try {
      await updateCompany(companyDraft);
      setCompanySaved(true);
      toast("success", "Zapisano profil firmy (sprzedawcy)");
      window.setTimeout(() => setCompanySaved(false), 2500);
    } catch (e) {
      toast("error", "Nie udało się zapisać profilu", e instanceof Error ? e.message : undefined);
    }
  };

  const generateXml = (invoiceId: string) => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;
    setXml(buildFaVatXml(inv, companySafe));
    setIssues(null);
    setValid(null);
    setSendResult(null);
  };

  const runValidation = () => {
    const res = validateFa2(xml);
    setIssues(res.issues);
    setValid(res.ok);
    if (res.ok) {
      toast("success", "Dokument przeszedł walidację FA(2)", `${res.issues.length} uwag (warnings)`);
    } else {
      toast("error", "Walidacja FA(2): błędy", `${res.issues.filter((i) => i.severity === "error").length} błędów`);
    }
  };

  const runSend = async () => {
    const res = validateFa2(xml);
    setIssues(res.issues);
    setValid(res.ok);
    if (!res.ok) {
      toast("error", "Najpierw popraw błędy walidacji FA(2)");
      return;
    }
    setSending(true);
    setSendResult(null);
    try {
      const r = await fetch("/api/ksef/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          xml,
          environment: ksefSafe.environment,
          invoiceId: selectedInvoiceId,
          invoiceNumber: selectedInvoiceId ? undefined : undefined,
        }),
      });
      const data: KsefSendResult & { invoice?: Invoice } = await r.json();
      setSendResult(data);
      if (r.ok && data.success && data.ksefNumber) {
        if (data.invoice) {
          store.applyInvoice(data.invoice);
        } else if (selectedInvoiceId) {
          store.setInvoiceKsef(selectedInvoiceId, {
            number: data.ksefNumber,
            status: data.status ?? "SENT",
            sentAt: data.timestamp ?? new Date().toISOString(),
            environment: ksefSafe.environment,
          });
        }
      }
      if (r.ok) toast("success", "Wysłano do KSeF", data.ksefNumber);
      else toast("error", "KSeF: odrzucono", data.message);
    } catch {
      setSendResult({
        success: false,
        demo: false,
        message: "Błąd sieci podczas wysyłki do KSeF.",
      });
      toast("error", "Błąd sieci", "Nie udało się wysłać dokumentu.");
    } finally {
      setSending(false);
    }
  };

  const ksefStatusBadge = (s: string) => {
    const map: Record<string, "success" | "info" | "warning" | "danger"> = {
      ACTIVE: "success",
      SENT: "info",
      QUEUED: "warning",
      REJECTED: "danger",
    };
    const labels: Record<string, string> = {
      ACTIVE: "Aktywny",
      SENT: "Wysłano",
      QUEUED: "W kolejce",
      REJECTED: "Odrzucony",
    };
    return <Badge tone={map[s] ?? "outline"}>{labels[s] ?? s}</Badge>;
  };

  return (
    <div>
      <PageHeader
        title="Ustawienia KSeF"
        description="Krajowy System e-Faktur: środowisko, token, walidacja FA(2) oraz wysyłka faktur."
        actions={
          <Badge tone={ENV_INFO[ksefSafe.environment].tone}>
            <FlaskConical className="h-3 w-3" /> środowisko: {ksefSafe.environment}
          </Badge>
        }
      />

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        items={[
          { value: "settings", label: "Ustawienia", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
          { value: "fa2", label: "Walidacja FA(2) i wysyłka", icon: <FileCode2 className="h-3.5 w-3.5" /> },
          { value: "statusy", label: "Statusy i zakupy", icon: <BadgeCheck className="h-3.5 w-3.5" /> },
        ]}
      />

      <AnimatePresence mode="wait">
        {/* ── Ustawienia ── */}
        {tab === "settings" && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="grid gap-6 xl:grid-cols-2"
          >
            {/* Środowisko + poświadczenia */}
            <Card>
              <CardHeader>
                <CardTitle>Środowisko i poświadczenia</CardTitle>
                <CardDescription>
                  Wybierz środowisko KSeF i podaj token autoryzacyjny.
                  W trybie Test/Produkcja wysyłka trafia bezpośrednio do API MF.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Środowisko</Label>
                  <Select
                    value={envDraft}
                    onChange={(e) => setEnvDraft(e.target.value as KsefEnv)}
                  >
                    {(Object.keys(ENV_INFO) as KsefEnv[]).map((env) => (
                      <option key={env} value={env}>
                        {ENV_INFO[env].label}
                      </option>
                    ))}
                  </Select>
                  <p className="text-[11.5px] text-muted-foreground">{ENV_INFO[envDraft].desc}</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-muted-foreground" /> Token sesji KSeF
                  </Label>
                  <Input
                    type="password"
                    value={tokenDraft}
                    onChange={(e) => setTokenDraft(e.target.value)}
                    placeholder={
                      ksefSafe.tokenSet
                        ? `Ustawiono (maska: ${ksefSafe.tokenMask}) — wpisz nowy, aby zmienić`
                        : envDraft === "demo"
                          ? "Token nie jest wymagany w trybie demo"
                          : "Wklej token z sesji KSeF"
                    }
                    className="font-mono"
                    autoComplete="off"
                  />
                  <p className="text-[11.5px] text-muted-foreground">
                    Pełny token nigdy nie jest wysyłany z powrotem do przeglądarki — API zwraca
                    wyłącznie maskę. Produkcyjny token powinien pochodzić ze zmiennej środowiskowej
                    serwera (KSEF_TOKEN), patrz README.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <UploadCloud className="h-3.5 w-3.5 text-muted-foreground" /> Certyfikat (.p12)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={certDraft}
                      onChange={(e) => setCertDraft(e.target.value)}
                      placeholder="nazwa pliku certyfikatu…"
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        const el = document.createElement("input");
                        el.type = "file";
                        el.accept = ".p12,.pfx";
                        el.onchange = () => {
                          const f = el.files?.[0];
                          if (f) {
                            setCertDraft(f.name);
                            toast("info", "Wybrano certyfikat (demo)", f.name);
                          }
                        };
                        el.click();
                      }}
                    >
                      Wybierz…
                    </Button>
                  </div>
                  <p className="text-[11.5px] text-muted-foreground">
                    Zapisujemy wyłącznie nazwę pliku — prawdziwe podpisywanie XML wymaga backendu
                    (klucz prywatny nigdy nie powinien trafiać do frontendu).
                  </p>
                </div>

                <label className="flex items-center gap-2 text-[13px]">
                  <Checkbox
                    checked={autoDraft}
                    onChange={(e) => setAutoDraft(e.target.checked)}
                  />
                  Automatycznie waliduj FA(2) przed wysyłką
                </label>

                <Button onClick={saveKsefSettings} loading={savingKsef} className="w-full">
                  {savingKsef ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Zapisz ustawienia KSeF
                </Button>

                {envDraft === "production" && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-[12.5px] text-red-700 dark:text-red-400">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Wybrano środowisko <b>Produkcja</b>. Faktury będą wysyłane bezpośrednio do
                      oficjalnego API KSeF Ministerstwa Finansów (<b>ksef.mf.gov.pl</b>).
                      Upewnij się, że token jest poprawny i NIP sprzedawcy jest prawidłowy.
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Profil firmy (sprzedawca) */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Profil firmy (sprzedawca)</CardTitle>
                  <CardDescription>
                    Główne dane firmy. Aby zarządzać wieloma spółkami i NIP-ami, przejdź do{" "}
                    <a href="/settings/companies" className="font-semibold text-primary underline underline-offset-2">
                      Moje Firmy / NIP
                    </a>.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Nazwa firmy</Label>
                    <Input value={companyDraft.name ?? companyDraft.companyName ?? ""} onChange={(e) => setCompanyDraft({ ...companyDraft, name: e.target.value, companyName: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>NIP</Label>
                    <Input value={companyDraft.nip ?? ""} onChange={(e) => setCompanyDraft({ ...companyDraft, nip: e.target.value })} className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>REGON</Label>
                    <Input value={companyDraft.regon ?? ""} onChange={(e) => setCompanyDraft({ ...companyDraft, regon: e.target.value })} className="font-mono" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Ulica i numer</Label>
                    <Input value={companyDraft.street ?? ""} onChange={(e) => setCompanyDraft({ ...companyDraft, street: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Kod pocztowy</Label>
                    <Input value={companyDraft.postal ?? companyDraft.postalCode ?? ""} onChange={(e) => setCompanyDraft({ ...companyDraft, postal: e.target.value, postalCode: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Miasto</Label>
                    <Input value={companyDraft.city ?? ""} onChange={(e) => setCompanyDraft({ ...companyDraft, city: e.target.value })} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Nr konta (IBAN) — do QR płatności</Label>
                    <Input value={companyDraft.iban ?? companyDraft.bankAccount ?? ""} onChange={(e) => setCompanyDraft({ ...companyDraft, iban: e.target.value, bankAccount: e.target.value })} className="font-mono text-[12px]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Bank</Label>
                    <Input value={companyDraft.bankName ?? ""} onChange={(e) => setCompanyDraft({ ...companyDraft, bankName: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>E-mail</Label>
                    <Input value={companyDraft.email ?? ""} onChange={(e) => setCompanyDraft({ ...companyDraft, email: e.target.value })} />
                  </div>
                </div>
                <Button onClick={saveCompany} className="w-full">
                  {companySaved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  {companySaved ? "Zapisano" : "Zapisz profil firmy"}
                </Button>
              </CardContent>
            </Card>

            {/* Status integracji */}
            <Card className="xl:col-span-2 border-dashed">
              <CardHeader>
                <CardTitle>Status integracji KSeF</CardTitle>
                <CardDescription>Backend podłączony do oficjalnego API Ministerstwa Finansów</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3.5">
                  <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" /> Produkcyjny backend
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-[12px] text-muted-foreground">
                    <li>Wysyłka e-Faktur do KSeF (AES-256-CBC + RSA)</li>
                    <li>Autoryzacja tokenem (Challenge → InitSession)</li>
                    <li>Sprawdzanie statusu i pobieranie UPO</li>
                    <li>Lookup NIP (Biała Lista MF + GUS)</li>
                  </ul>
                </div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3.5">
                  <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" /> Walidacja i szyfrowanie
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-[12px] text-muted-foreground">
                    <li>Walidacja strukturalna FA(3)</li>
                    <li>Generowanie XML FA(3)</li>
                    <li>SHA-256 + AES-256-CBC + RSA-OAEP</li>
                    <li>QR do płatności (SPL)</li>
                  </ul>
                </div>
                <div className="rounded-lg border border-accent/30 bg-accent/5 p-3.5">
                  <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-accent">
                    <ShieldCheck className="h-4 w-4" /> Środowiska
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-[12px] text-muted-foreground">
                    <li><b>Demo</b> — symulacja lokalna (bez API)</li>
                    <li><b>Test</b> → ksef-test.mf.gov.pl</li>
                    <li><b>Produkcja</b> → ksef.mf.gov.pl</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── Walidacja FA(2) i wysyłka ── */}
        {tab === "fa2" && (
          <motion.div
            key="fa2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]"
          >
            <Card>
              <CardHeader>
                <CardTitle>Dokument FA(2)</CardTitle>
                <CardDescription>
                  Wygeneruj XML z faktury, wklej własny lub użyj szablonu. Następnie zwaliduj i
                  wyślij do KSeF.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={selectedInvoiceId}
                    onChange={(e) => {
                      setSelectedInvoiceId(e.target.value);
                      if (e.target.value) generateXml(e.target.value);
                    }}
                    className="min-w-[260px] flex-1"
                  >
                    <option value="">— wybierz fakturę do XML —</option>
                    {salesWithoutKsef.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.number} · {getContractor(contractors, i.contractorId)?.name ?? "—"}
                      </option>
                    ))}
                  </Select>
                  <Button variant="outline" onClick={() => setXml(FA2_TEMPLATE)}>
                    <FileCode2 className="h-4 w-4" /> Wstaw szablon
                  </Button>
                </div>
                <Textarea
                  value={xml}
                  onChange={(e) => {
                    setXml(e.target.value);
                    setValid(null);
                    setIssues(null);
                  }}
                  rows={18}
                  className="font-mono text-[11.5px] leading-relaxed"
                  placeholder="Paste XML FA(2)…"
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={runValidation}>
                    <BadgeCheck className="h-4 w-4" /> Zwaliduj FA(2)
                  </Button>
                  <Button onClick={runSend} loading={sending} disabled={!xml.trim()}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Wyślij do KSeF
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {valid !== null && issues && (
                <Card className={valid ? "border-emerald-500/40" : "border-red-500/40"}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {valid ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      Wynik walidacji FA(2)
                    </CardTitle>
                    <CardDescription>
                      {valid
                        ? `Dokument poprawny strukturalnie (${issues.length} uwag).`
                        : `Znaleziono ${issues.filter((i) => i.severity === "error").length} błędów i ${issues.filter((i) => i.severity === "warning").length} uwag.`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="max-h-[320px] space-y-1.5 overflow-y-auto">
                    {issues.map((iss, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start gap-2 rounded-md border p-2.5 text-[12px] ${
                          iss.severity === "error"
                            ? "border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400"
                            : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <div>
                          <code className="font-mono text-[10.5px] opacity-80">{iss.path}</code>
                          <p>{iss.message}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {sendResult && (
                <Card className={sendResult.success ? "border-accent/40" : "border-red-500/40"}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-accent" /> Odpowiedź API KSeF
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-[12.5px]">
                    {sendResult.success ? (
                      <>
                        <p className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" /> Zaakceptowano
                        </p>
                        <div className="rounded-lg bg-muted/50 p-3">
                          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            Numer KSeF
                          </p>
                          <p className="font-mono text-[13px] font-semibold">{sendResult.ksefNumber}</p>
                          <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                            Status / czas
                          </p>
                          <p className="text-[12.5px]">
                            {sendResult.status} · {formatDateTime(sendResult.timestamp ?? "")}
                          </p>
                        </div>
                        <p className="text-[11.5px] text-muted-foreground">{sendResult.message}</p>
                      </>
                    ) : (
                      <p className="flex items-start gap-1.5 text-red-600 dark:text-red-400">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {sendResult.message}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="text-[13.5px]">Środowisko wysyłki</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-[12.5px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Aktualne środowisko</span>
                    <Badge tone={ENV_INFO[ksefSafe.environment].tone}>{ksefSafe.environment}</Badge>
                  </div>
                  <p className="text-[11.5px] text-muted-foreground">
                    {ksefSafe.environment === "demo" 
                      ? "Tryb demo — wysyłka symulowana lokalnie."
                      : ksefSafe.environment === "test"
                        ? "Wysyłka trafia bezpośrednio do ksef-test.mf.gov.pl (środowisko testowe MF)."
                        : "Wysyłka trafia bezpośrednio do ksef.mf.gov.pl (produkcja MF)."}
                  </p>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}

        {/* ── Statusy i zakupy ── */}
        {tab === "statusy" && (
          <motion.div
            key="statusy"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="grid gap-6 xl:grid-cols-2"
          >
            <Card>
              <CardHeader>
                <CardTitle>Dokumenty wysłane do KSeF</CardTitle>
                <CardDescription>Numery KSeF i statusy dokumentów</CardDescription>
              </CardHeader>
              <CardContent>
                {ksefInvoices.length === 0 ? (
                  <p className="py-10 text-center text-[13px] text-muted-foreground">
                    Brak dokumentów w KSeF. Wyślij pierwszą fakturę (zakładka „Walidacja FA(2) i wysyłka”).
                  </p>
                ) : (
                  <div className="divide-y divide-border/70">
                    {ksefInvoices.map((i) => (
                      <div key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold">
                            {i.number}
                            <span className="ml-2 font-normal text-muted-foreground">
                              {getContractor(contractors, i.contractorId)?.name ?? "—"}
                            </span>
                          </p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            {i.ksef?.number}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-[12px] text-muted-foreground">
                            {formatMoney(invoiceTotals(i).gross, i.currency)}
                          </span>
                          {i.ksef && ksefStatusBadge(i.ksef.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Faktury zakupowe (FZ)</CardTitle>
                <CardDescription>
                  Zakupy od kontrahentów — w KSeF rejestrowane jako e-Faktury zakupowe
                </CardDescription>
              </CardHeader>
              <CardContent>
                {purchaseInvoices.length === 0 ? (
                  <p className="py-10 text-center text-[13px] text-muted-foreground">
                    Brak faktur zakupowych. Utwórz FZ w kreatorze faktury (typ „Zakup”) lub użyj
                    przycisku „Symuluj nową fakturę z KSeF” na liście faktur.
                  </p>
                ) : (
                  <div className="divide-y divide-border/70">
                    {purchaseInvoices.map((i: Invoice) => (
                      <div key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold">{i.number}</p>
                          <p className="truncate text-[11.5px] text-muted-foreground">
                            {getContractor(contractors, i.contractorId)?.name ?? "—"} ·{" "}
                            {getContractor(contractors, i.contractorId)?.nip ?? ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-[12px] text-muted-foreground">
                            {formatMoney(invoiceTotals(i).gross, i.currency)}
                          </span>
                          {i.ksef ? (
                            ksefStatusBadge(i.ksef.status)
                          ) : (
                            <Badge tone="outline">bez KSeF</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-[11.5px] text-muted-foreground">
                  <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Zakupy można odliczać od VAT — w pełnej integracji dokumenty FZ trafiają do KSeF
                    jako faktury zakupowe po stronie nabywcy.
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function KsefPage() {
  return (
    <Suspense fallback={null}>
      <KsefPageInner />
    </Suspense>
  );
}
