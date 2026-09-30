"use client";
import { KsefOperationsCard } from "@/components/ksef/operations-card";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  CloudDownload,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  FileText,
  FlaskConical,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Mail,
  Radio,
  RefreshCw,
  Save,
  Send,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
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
import { buildFa3Xml, validateFa3Xml, FA3_TEMPLATE, type Fa3ValidationIssue } from "@/lib/ksef/xmlBuilder";
import { InfoTooltip, HelpTooltip } from "@/components/ui/tooltip";
import { formatDateTime, formatMoney, invoiceTotals } from "@/lib/format";
import { downloadFile } from "@/lib/utils";
import { EMPTY_COMPANY } from "@/lib/types";
import type { Invoice, KsefEnv, KsefSendResult } from "@/lib/types";

const ENV_CONFIG: Record<
  KsefEnv,
  {
    label: string;
    gateway: string;
    desc: string;
    badgeTone: "success" | "warning" | "info";
    glowClass: string;
    borderClass: string;
  }
> = {
  production: {
    label: "Produkcja (MF)",
    gateway: "https://api.ksef.mf.gov.pl/v2",
    desc: "Oficjalny, prawnie wiążący system Krajowego Systemu e-Faktur Ministerstwa Finansów.",
    badgeTone: "success",
    glowClass: "shadow-emerald-500/15 ring-emerald-500/30",
    borderClass: "border-emerald-500/40 bg-emerald-500/5",
  },
  test: {
    label: "Środowisko Testowe (MF)",
    gateway: "https://api-test.ksef.mf.gov.pl/v2",
    desc: "Środowisko integracyjne Ministerstwa Finansów do testowania wysyłki i odbioru faktur.",
    badgeTone: "warning",
    glowClass: "shadow-amber-500/15 ring-amber-500/30",
    borderClass: "border-amber-500/40 bg-amber-500/5",
  },
  demo: {
    label: "Tryb Demonstracyjny",
    gateway: "Lokalny symulator e-Faktur FA(3)",
    desc: "Lokalna symulacja FA(3). Potwierdzenie demo nie jest urzędowym UPO i nie pochodzi z MF.",
    badgeTone: "info",
    glowClass: "shadow-sky-500/15 ring-sky-500/30",
    borderClass: "border-sky-500/40 bg-sky-500/5",
  },
};

interface TestConnectionResult {
  ok: boolean;
  environment: KsefEnv;
  gatewayUrl: string;
  pingMs?: number;
  challenge?: string;
  nip?: string;
  hasToken?: boolean;
  tokenMask?: string | null;
  certificates?: {
    tokenKeyId?: string;
    symKeyId?: string;
  };
  authTested?: boolean;
  authSuccess?: boolean;
  authMessage?: string;
  message: string;
}

function KsefPageInner() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const store = useAppStore();
  const { ksef, updateKsef, company, updateCompany, contractors } = store;
  const companyId = useAppStore(s => s.selectedCompanyId);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [listError, setListError] = React.useState("");
  const [listLoading, setListLoading] = React.useState(false);
  const loadInvoices = React.useCallback(async (cursor?: string, signal?: AbortSignal) => {
    if (!companyId) return;
    setListLoading(true);
    try {
      const query = new URLSearchParams({ companyId });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/invoices/search?${query}`, { signal, cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Nie udało się wczytać faktur.");
      if (signal?.aborted) return;
      setInvoices(current => cursor ? [...current, ...body.invoices] : body.invoices);
      setNextCursor(body.nextCursor);
      setListError("");
    } catch (error) {
      if (!signal?.aborted) setListError(error instanceof Error ? error.message : "Błąd wczytywania.");
    } finally { if (!signal?.aborted) setListLoading(false); }
  }, [companyId]);
  React.useEffect(() => {
    const controller = new AbortController();
    setInvoices([]); setNextCursor(null); setListError("");
    void loadInvoices(undefined, controller.signal);
    return () => controller.abort();
  }, [loadInvoices]);
  const companySafe = company ?? EMPTY_COMPANY;
  const ksefSafe = ksef ?? {
    environment: "demo" as KsefEnv,
    tokenSet: false,
    tokenMask: "",
    certName: "",
    autoValidate: true,
  };

  const initialTab = searchParams.get("tab") || "settings";
  const [tab, setTab] = React.useState(initialTab);

  // Ustawienia formularza
  const [envDraft, setEnvDraft] = React.useState<KsefEnv>(ksefSafe.environment);
  const [tokenDraft, setTokenDraft] = React.useState("");
  const [showToken, setShowToken] = React.useState(false);
  const [certDraft, setCertDraft] = React.useState(ksefSafe.certName);
  const [autoDraft, setAutoDraft] = React.useState(ksefSafe.autoValidate);
  const [savingKsef, setSavingKsef] = React.useState(false);

  // Test połączenia
  const [testingConnection, setTestingConnection] = React.useState(false);
  const [connectionResult, setConnectionResult] = React.useState<TestConnectionResult | null>(null);

  // Inspektor FA(3)
  const [selectedInvoiceId, setSelectedInvoiceId] = React.useState("");
  const [xml, setXml] = React.useState(FA3_TEMPLATE);
  const [validationIssues, setValidationIssues] = React.useState<Fa3ValidationIssue[] | null>(null);
  const [isValidXml, setIsValidXml] = React.useState<boolean | null>(null);
  const [sendingInvoice, setSendingInvoice] = React.useState(false);
  const [sendResult, setSendResult] = React.useState<any | null>(null);

  // Synchronizacja zakupów (FZ) i harmonogram w tle
  const [syncingIncoming, setSyncingIncoming] = React.useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = React.useState<boolean>(Boolean(ksefSafe.autoSyncEnabled));
  const [autoSyncIntervalHours, setAutoSyncIntervalHours] = React.useState<number>(ksefSafe.autoSyncIntervalHours || 2);
  const [autoSyncNotifyEmail, setAutoSyncNotifyEmail] = React.useState<string>(ksefSafe.autoSyncNotifyEmail || "");
  const [savingAutoSync, setSavingAutoSync] = React.useState(false);
  const [approvingId, setApprovingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (ksef) {
      setAutoSyncEnabled(Boolean(ksef.autoSyncEnabled));
      if (ksef.autoSyncIntervalHours) setAutoSyncIntervalHours(ksef.autoSyncIntervalHours);
      if (ksef.autoSyncNotifyEmail !== undefined) setAutoSyncNotifyEmail(ksef.autoSyncNotifyEmail);
    }
  }, [ksef]);

  const salesWithoutKsef = invoices.filter((i) => i.type === "sale" && !i.ksef && i.status !== "draft");
  const ksefInvoices = invoices.filter((i) => i.ksef);
  const purchaseInvoices = invoices.filter((i) => i.type === "purchase");

  // Zapisanie ustawień KSeF
  const handleSaveKsefSettings = async () => {
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
      toast("success", "Zapisano ustawienia KSeF 2.0", `Środowisko: ${ENV_CONFIG[envDraft].label}`);
    } catch (e) {
      toast("error", "Nie udało się zapisać ustawień", e instanceof Error ? e.message : undefined);
    } finally {
      setSavingKsef(false);
    }
  };

  // Test połączenia na żywo z bramką KSeF
  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const res = await fetch("/api/ksef/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: useAppStore.getState().selectedCompanyId,
          environment: envDraft,
          token: tokenDraft.trim() || undefined,
          nip: companySafe.nip || undefined,
        }),
      });
      const data: TestConnectionResult = await res.json();
      setConnectionResult(data);

      if (data.ok) {
        if (data.authTested && !data.authSuccess) {
          toast("warning", "Bramka MF dostępna, lecz autoryzacja tokenem nie powiodła się", data.authMessage);
        } else {
          toast("success", "Połączenie z KSeF 2.0 udane!", `${data.environment} · ${data.pingMs}ms`);
        }
      } else {
        toast("error", "Błąd połączenia z KSeF", data.message);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Brak odpowiedzi od serwera.";
      setConnectionResult({
        ok: false,
        environment: envDraft,
        gatewayUrl: ENV_CONFIG[envDraft].gateway,
        message: msg,
      });
      toast("error", "Błąd sieci", msg);
    } finally {
      setTestingConnection(false);
    }
  };

  // Generowanie XML z faktury
  const handleGenerateXmlFromInvoice = (invoiceId: string) => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;
    const ctr = getContractor(contractors, inv.contractorId);
    const generated = buildFa3Xml({
      invoice: inv,
      seller: companySafe,
      buyer: ctr,
    });
    setXml(generated);
    setValidationIssues(null);
    setIsValidXml(null);
    setSendResult(null);
  };

  // Walidacja XML FA(3)
  const handleValidateXml = () => {
    const result = validateFa3Xml(xml);
    setValidationIssues(result.issues);
    setIsValidXml(result.ok);
    if (result.ok) {
      toast("success", "Dokument FA(3) poprawny!", "Zgodny ze schematem Ministerstwa Finansów.");
    } else {
      const errCount = result.issues.filter((i) => i.severity === "error").length;
      toast("error", `Walidacja FA(3): ${errCount} błędów`, "Sprawdź listę uwag poniżej.");
    }
  };

  // Wysyłka faktury do KSeF
  const handleSendInvoice = async () => {
    const val = validateFa3Xml(xml);
    setValidationIssues(val.issues);
    setIsValidXml(val.ok);
    if (!val.ok) {
      toast("error", "Popraw błędy w dokumencie XML przed wysyłką do KSeF");
      return;
    }

    setSendingInvoice(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/ksef/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          xml,
          environment: ksefSafe.environment,
          invoiceId: selectedInvoiceId || undefined,
        }),
      });
      const data = await res.json();
      setSendResult(data);

      if (res.ok && data.success && data.ksefNumber) {
        if (data.invoice) {
          store.applyInvoice(data.invoice);
          setInvoices(current => current.map(item => item.id === data.invoice.id ? data.invoice : item));
        } else if (selectedInvoiceId) {
          store.setInvoiceKsef(selectedInvoiceId, {
            number: data.ksefNumber,
            status: data.status ?? "ACTIVE",
            sentAt: data.timestamp ?? new Date().toISOString(),
            environment: ksefSafe.environment,
          });
        }
        toast("success", "Faktura wysłana do KSeF (FA(3))!", `Identyfikator: ${data.ksefNumber}`);
      } else {
        toast("error", "KSeF: odrzucono dokument", data.message || "Błąd wysyłki.");
      }
    } catch {
      toast("error", "Błąd sieci", "Nie udało się przesłać faktury do KSeF.");
      setSendResult({
        success: false,
        message: "Wystąpił błąd sieci podczas transmisji do KSeF.",
      });
    } finally {
      setSendingInvoice(false);
    }
  };

  // Synchronizacja faktur zakupowych z KSeF
  const handleSyncIncoming = async () => {
    setSyncingIncoming(true);
    try {
      const res = await fetch("/api/ksef/sync-incoming?companyId=" + encodeURIComponent(useAppStore.getState().selectedCompanyId || ""), { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast("error", "Błąd synchronizacji KSeF", data.error || data.message || "Nie udało się pobrać zakupów.");
        return;
      }
      await store.revalidate();
      await loadInvoices();
      toast("success", "Pobrano faktury zakupowe z KSeF", `Zaimportowano: ${data.importedCount ?? 0} dokumentów.`);
    } catch {
      toast("error", "Błąd sieci", "Nie udało się połączyć z usługą synchronizacji.");
    } finally {
      setSyncingIncoming(false);
    }
  };

  const handleSaveAutoSync = async () => {
    setSavingAutoSync(true);
    try {
      const res = await fetch("/api/ksef/auto-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoSyncEnabled,
          autoSyncIntervalHours: Number(autoSyncIntervalHours),
          autoSyncNotifyEmail: autoSyncNotifyEmail.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd zapisu harmonogramu");
      await store.revalidate();
      await loadInvoices();
      toast("success", "Zapisano harmonogram pobierania z KSeF", `Interwał: co ${autoSyncIntervalHours}h`);
    } catch (e: any) {
      toast("error", "Błąd zapisu harmonogramu", e?.message);
    } finally {
      setSavingAutoSync(false);
    }
  };

  const handleToggleApproval = async (invoiceId: string, targetStatus: "approved" | "pending") => {
    setApprovingId(invoiceId);
    try {
      const res = await fetch("/api/invoices/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceIds: [invoiceId],
          status: targetStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd aktualizacji statusu");
      await store.revalidate();
      await loadInvoices();
      toast(
        targetStatus === "approved" ? "success" : "info",
        targetStatus === "approved" ? "Zatwierdzono fakturę dla księgowości" : "Cofnięto zatwierdzenie"
      );
    } catch (e: any) {
      toast("error", "Błąd aktualizacji", e?.message);
    } finally {
      setApprovingId(null);
    }
  };

  // Pobranie UPO faktury
  const handleDownloadUpo = (ksefNumber: string) => {
    if (!ksefNumber || ksefNumber === "—") {
      toast("warning", "Brak numeru KSeF", "Ta faktura nie posiada jeszcze zarejestrowanego numeru KSeF.");
      return;
    }
    window.open(`/api/ksef/invoices/download/${encodeURIComponent(ksefNumber)}?format=upo`, "_blank");
  };

  // Pobranie XML e-Faktury
  const handleDownloadXml = (ksefNumber: string) => {
    if (!ksefNumber || ksefNumber === "—") {
      toast("warning", "Brak numeru KSeF", "Ta faktura nie posiada jeszcze zarejestrowanego numeru KSeF.");
      return;
    }
    window.open(`/api/ksef/invoices/download/${encodeURIComponent(ksefNumber)}?format=xml`, "_blank");
  };

  const currentEnv = ENV_CONFIG[ksefSafe.environment];

  return (
    <div className="space-y-6">
      {/* ── World-Class Live Header ── */}
      <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card/90 to-card/50 p-6 sm:p-8 backdrop-blur-xl shadow-lg">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute right-32 -bottom-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2.5 mb-2">
              <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                KSeF API 2.0 / FA(3)
              </span>
              <Badge tone={currentEnv.badgeTone} className="font-mono uppercase text-[11px] px-2.5 py-0.5">
                {currentEnv.label}
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Centrum Integracji KSeF
            </h1>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground max-w-2xl">
              Bezpośrednia, szyfrowana (AES-256-CBC / RSA-OAEP) komunikacja z bramką Ministerstwa Finansów,
              walidacja schematu FA(3) oraz automatyczny odbiór UPO i e-Faktur zakupowych.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              loading={testingConnection}
              className="gap-2 rounded-xl shadow-xs hover:border-primary/40"
            >
              {!testingConnection && <Activity className="h-4 w-4 text-emerald-500" />}
              {testingConnection ? "Testowanie bramki..." : "Testuj połączenie z KSeF"}
            </Button>
            <Button
              variant="subtle"
              onClick={handleSyncIncoming}
              loading={syncingIncoming}
              className="gap-2 rounded-xl"
            >
              {!syncingIncoming && <CloudDownload className="h-4 w-4" />}
              {syncingIncoming ? "Pobieranie..." : "Pobierz zakupy (FZ)"}
            </Button>
          </div>
        </div>

        {/* Live Diagnostics Bar */}
        {connectionResult && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-6 rounded-2xl border p-4 text-xs ${
              connectionResult.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {connectionResult.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                )}
                <span className="font-semibold text-foreground">
                  {connectionResult.message}
                </span>
              </div>
              {connectionResult.pingMs !== undefined && (
                <span className="font-mono text-muted-foreground">
                  Latency: <b className="text-foreground">{connectionResult.pingMs}ms</b> · Bramka: {connectionResult.gatewayUrl}
                </span>
              )}
            </div>

            {connectionResult.challenge && (
              <div className="mt-2.5 flex flex-wrap items-center gap-4 text-[11.5px] border-t border-border/40 pt-2 text-muted-foreground">
                <span>
                  Challenge ID: <code className="font-mono text-foreground font-semibold">{connectionResult.challenge}</code>
                </span>
                {connectionResult.certificates?.tokenKeyId && (
                  <span>
                    Certyfikat Tokena: <code className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{connectionResult.certificates.tokenKeyId.slice(0, 16)}...</code>
                  </span>
                )}
                {connectionResult.authTested && (
                  <span className={`font-semibold ${connectionResult.authSuccess ? "text-emerald-500" : "text-amber-500"}`}>
                    {connectionResult.authMessage}
                  </span>
                )}
              </div>
            )}
          </motion.div>
        )}
      </div>

      <KsefOperationsCard />
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>Faktury na ekranie: {invoices.length}{nextCursor ? "+" : ""}</span>
        {nextCursor && <button type="button" disabled={listLoading} onClick={() => void loadInvoices(nextCursor)} className="font-medium text-primary disabled:opacity-50">{listLoading ? "Wczytywanie…" : "Pokaż kolejne 30"}</button>}
        {listError && <button type="button" onClick={() => void loadInvoices()} className="text-destructive underline">{listError} · Ponów</button>}
      </div>

      {/* ── Modern Tabs Navigation ── */}
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "settings", label: "Poświadczenia & Bramka", icon: <KeyRound className="h-4 w-4" /> },
          { value: "inspector", label: "Inspektor FA(3) i Wysyłka", icon: <FileCode2 className="h-4 w-4" /> },
          { value: "journal", label: "Dziennik Transmisji & UPO", icon: <BadgeCheck className="h-4 w-4" /> },
          { value: "incoming", label: "Zakupy z KSeF (FZ)", icon: <CloudDownload className="h-4 w-4" /> },
        ]}
      />

      {/* ── TAB 1: Poświadczenia & Bramka ── */}
      {tab === "settings" && (
        <motion.div
          key="tab-settings"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid gap-6 xl:grid-cols-12"
        >
          {/* Kolumna lewa: Konfiguracja KSeF */}
          <div className="space-y-6 xl:col-span-7">
            <Card className="rounded-3xl border-border/70 shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Server className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-[17px]">Środowisko KSeF i Dostęp</CardTitle>
                    <CardDescription>
                      Wybierz środowisko Ministerstwa Finansów oraz podaj token autoryzacyjny.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                {/* Wybór środowiska */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Docelowe Środowisko KSeF
                  </Label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(["production", "test", "demo"] as KsefEnv[]).map((env) => {
                      const cfg = ENV_CONFIG[env];
                      const isSelected = envDraft === env;
                      return (
                        <div
                          key={env}
                          onClick={() => setEnvDraft(env)}
                          className={`cursor-pointer rounded-2xl border p-3.5 transition-all ${
                            isSelected
                              ? `${cfg.borderClass} ${cfg.glowClass} ring-2 ring-primary/40`
                              : "border-border/60 hover:bg-muted/40"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-[13px] text-foreground">{cfg.label}</span>
                            {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                          </div>
                          <p className="text-[11px] text-muted-foreground line-clamp-2">
                            {cfg.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Token autoryzacyjny KSeF */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <KeyRound className="h-3.5 w-3.5 text-primary" />
                      Token Autoryzacyjny Podatnika (KSeF)
                    </Label>
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="flex items-center gap-1 text-[11.5px] text-primary hover:underline"
                    >
                      {showToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {showToken ? "Ukryj" : "Pokaż"}
                    </button>
                  </div>

                  <div className="relative">
                    <Input
                      type={showToken ? "text" : "password"}
                      value={tokenDraft}
                      onChange={(e) => setTokenDraft(e.target.value)}
                      placeholder={
                        ksefSafe.tokenSet
                          ? `Zapisano token (maska: ${ksefSafe.tokenMask}) — wpisz nowy, aby zmienić`
                          : "Wklej wygenerowany token autoryzacyjny KSeF..."
                      }
                      className="font-mono text-xs pr-10 rounded-xl"
                      autoComplete="off"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Lock className="h-3.5 w-3.5" />
                    </div>
                  </div>

                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Token generuje się w <b>Aplikacji Podatnika KSeF</b> (login przez Profil Zaufany / mObywatel).
                    Token jest szyfrowany w sesji kluczem RSA-OAEP SHA-256 z oficjalnym certyfikatem MF.
                  </p>
                </div>

                {/* Opcjonalny opis, nie jest używany do uwierzytelniania. */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Nazwa certyfikatu (opcjonalny opis)
                  </Label>
                  <Input value={certDraft} onChange={(e) => setCertDraft(e.target.value)} placeholder="Nazwa do własnej informacji..." className="rounded-xl text-xs" />
                  <p className="text-[11px] text-muted-foreground">To tylko opis. Daty ważności publicznego certyfikatu dodasz w panelu „Stan KSeF” powyżej.</p>
                </div>

                {/* Automatyczna walidacja XSD */}
                <label className="flex items-center gap-2.5 text-[13px] cursor-pointer">
                  <Checkbox
                    checked={autoDraft}
                    onChange={(e) => setAutoDraft(e.target.checked)}
                  />
                  <span>Automatycznie waliduj e-Fakturę pod kątem schematu FA(3) przed transmisją</span>
                </label>

                {/* Przycisk zapisu */}
                <div className="pt-2 flex items-center gap-3">
                  <Button
                    disabled={company?.currentUserRole!=="owner"&&!company?.currentUserPermissions?.canManageIntegrations}
                    onClick={handleSaveKsefSettings}
                    loading={savingKsef}
                    className="flex-1 rounded-xl gap-2 h-10 font-semibold"
                  >
                    {savingKsef ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Zapisz Ustawienia KSeF 2.0
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleTestConnection}
                    loading={testingConnection}
                    className="rounded-xl h-10 px-4"
                  >
                    Testuj Bramkę
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Kolumna prawa: Status integracji i profil */}
          <div className="space-y-6 xl:col-span-5">
            {/* Dane podmiotu wystawcy */}
            <Card className="rounded-3xl border-border/70 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <CardTitle className="text-[16px]">Podmiot Sprzedawcy (KSeF)</CardTitle>
                  </div>
                  <a href="/settings/companies" className="text-xs font-semibold text-primary hover:underline">
                    Edytuj dane →
                  </a>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-[12.5px]">
                <div className="rounded-2xl bg-muted/40 p-4 space-y-2 border border-border/50">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Firma:</span>
                    <span className="font-semibold text-foreground">{companySafe.companyName || companySafe.name || "Nie podano"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">NIP:</span>
                    <code className="font-mono font-bold text-foreground">{companySafe.nip || "Brak NIP"}</code>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Adres:</span>
                    <span className="text-right text-foreground">{companySafe.street || "—"}, {companySafe.postal || ""} {companySafe.city || ""}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Rachunek bankowy:</span>
                    <code className="font-mono text-[11px] text-foreground">{companySafe.bankAccount || companySafe.iban || "Nie podano"}</code>
                  </div>
                </div>

                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  Zgodnie z wymogami KSeF, sprzedawca w e-Fakturze FA(3) musi posiadać 10-cyfrowy NIP
                  i zarejestrowany rachunek rozliczeniowy.
                </p>
              </CardContent>
            </Card>

            {/* Karta architektury kryptograficznej */}
            <Card className="rounded-3xl border-border/70 shadow-sm bg-gradient-to-b from-card to-muted/20">
              <CardHeader>
                <CardTitle className="text-[16px] flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  Standard Bezpieczeństwa MF
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 text-xs text-muted-foreground">
                <div className="flex items-start gap-2.5">
                  <BadgeCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <b className="text-foreground">Szyfrowanie Sesji KSeF:</b> Klucz symetryczny AES-256 jest generowany
                    dla każdej sesji i szyfrowany asymetrycznie RSA-OAEP SHA-256 certyfikatem MF.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <BadgeCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <b className="text-foreground">Szyfrowanie e-Faktur:</b> Treść XML FA(3) jest szyfrowana algorytmem
                    AES-256-CBC z dopełnieniem PKCS#7 przed wysłaniem przez sieć publiczną.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <BadgeCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <b className="text-foreground">Integralność Skrótów:</b> Wyliczane hashe SHA-256 dla czystego pliku
                    oraz zaszyfrowanej paczki gwarantują niezmienność dokumentu.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <BadgeCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <b className="text-foreground">Potwierdzenia:</b> W środowiskach MF UPO pobierane jest z bramki MF.
                    W trybie demo powstaje wyłącznie lokalny plik symulacyjny, bez mocy urzędowej.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      )}

      {/* ── TAB 2: Inspektor FA(3) i Wysyłka ── */}
      {tab === "inspector" && (
        <motion.div
          key="tab-inspector"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid gap-6 xl:grid-cols-12"
        >
          {/* Edytor / Podgląd XML */}
          <div className="space-y-4 xl:col-span-8">
            <Card className="rounded-3xl border-border/70 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-[17px]">Inspektor e-Faktury FA(3)</CardTitle>
                    <CardDescription>
                      Podgląd struktury XML e-Faktury przygotowanej do przesłania do serwerów KSeF.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(xml);
                        toast("info", "Skopiowano XML do schowka");
                      }}
                      className="rounded-xl text-xs gap-1.5"
                    >
                      <Copy className="h-3.5 w-3.5" /> Kopiuj
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadFile("faktura-FA3.xml", xml, "application/xml;charset=utf-8")}
                      className="rounded-xl text-xs gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5" /> Pobierz XML
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Wybór faktury lub wzorca */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <Select
                    value={selectedInvoiceId}
                    onChange={(e) => {
                      setSelectedInvoiceId(e.target.value);
                      if (e.target.value) handleGenerateXmlFromInvoice(e.target.value);
                    }}
                    className="min-w-[280px] flex-1 rounded-xl text-xs h-10"
                  >
                    <option value="">— Załaduj dane z wystawionej faktury —</option>
                    {salesWithoutKsef.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.number} · {getContractor(contractors, inv.contractorId)?.name || "Brak kontrahenta"} ({formatMoney(invoiceTotals(inv).gross, inv.currency)})
                      </option>
                    ))}
                  </Select>

                  <Button
                    variant="outline"
                    onClick={() => {
                      setXml(FA3_TEMPLATE);
                      setSelectedInvoiceId("");
                      setValidationIssues(null);
                      setIsValidXml(null);
                      toast("info", "Wczytano oficjalny szablon FA(3)");
                    }}
                    className="rounded-xl text-xs gap-1.5 h-10"
                  >
                    <FileCode2 className="h-3.5 w-3.5" /> Wzorzec FA(3)
                  </Button>
                </div>

                {/* Pole edytora XML z fontem mono */}
                <div className="relative rounded-2xl border border-border/80 bg-muted/30 dark:bg-black/40 overflow-hidden">
                  <Textarea
                    value={xml}
                    onChange={(e) => {
                      setXml(e.target.value);
                      setIsValidXml(null);
                      setValidationIssues(null);
                    }}
                    rows={20}
                    className="font-mono text-[11.5px] leading-relaxed border-0 bg-transparent resize-y rounded-none focus-visible:ring-0 p-4"
                    placeholder="Wklej lub wygeneruj kod XML e-Faktury FA(3)..."
                    spellCheck={false}
                  />
                </div>

                {/* Przyciski akcji */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={handleValidateXml}
                    className="rounded-xl gap-2 font-medium"
                  >
                    <BadgeCheck className="h-4 w-4 text-primary" />
                    Waliduj zgodność z FA(3)
                  </Button>

                  <Button
                    onClick={handleSendInvoice}
                    loading={sendingInvoice}
                    disabled={!xml.trim()}
                    className="rounded-xl gap-2 font-semibold shadow-sm"
                  >
                    {sendingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Wyślij e-Fakturę do KSeF ({currentEnv.label})
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Panel wyników walidacji i odpowiedzi */}
          <div className="space-y-6 xl:col-span-4">
            {/* Wynik walidacji XML */}
            {isValidXml !== null && validationIssues && (
              <Card className={`rounded-3xl border ${isValidXml ? "border-emerald-500/40 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/5"}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[15px] flex items-center gap-2">
                    {isValidXml ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-rose-500" />
                    )}
                    Walidator FA(3)
                  </CardTitle>
                  <CardDescription>
                    {isValidXml
                      ? "Struktura dokumentu jest w 100% zgodna z FA(3)."
                      : `Wykryto ${validationIssues.filter((i) => i.severity === "error").length} niezgodności ze schematem.`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="max-h-[300px] overflow-y-auto space-y-2">
                  {validationIssues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl text-xs border ${
                        issue.severity === "error"
                          ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      }`}
                    >
                      <code className="block font-mono text-[10.5px] opacity-80 mb-0.5">{issue.path}</code>
                      <p>{issue.message}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Wynik transmisji KSeF */}
            {sendResult && (
              <Card className={`rounded-3xl border ${sendResult.success ? "border-emerald-500/40 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/5"}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[15px] flex items-center gap-2">
                    {sendResult.success ? (
                      <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-rose-500" />
                    )}
                    Potwierdzenie z KSeF
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  {sendResult.success ? (
                    <>
                      <div className="rounded-xl bg-card/60 p-3 space-y-1.5 border border-border/50">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Numer KSeF / Identyfikator:
                        </span>
                        <code className="block font-mono text-emerald-600 dark:text-emerald-400 font-bold text-[12px] break-all">
                          {sendResult.ksefNumber}
                        </code>
                        <div className="flex justify-between items-center text-[11.5px] text-muted-foreground pt-1">
                          <span>Status: <b>{sendResult.status}</b></span>
                          <span>{formatDateTime(sendResult.timestamp || new Date().toISOString())}</span>
                        </div>
                      </div>

                      <p className="text-[11.5px] text-muted-foreground">
                        {sendResult.message}
                      </p>

                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={() => handleDownloadUpo(sendResult.ksefNumber)}
                        className="w-full rounded-xl gap-2 font-medium"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Pobierz UPO (XML)
                      </Button>
                    </>
                  ) : (
                    <p className="text-rose-600 dark:text-rose-400 font-medium">
                      {sendResult.message}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Karta informacji o środowisku docelowym */}
            <Card className="rounded-3xl border-border/70 shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Środowisko:</span>
                <Badge tone={currentEnv.badgeTone}>{currentEnv.label}</Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Adres API:</span>
                <code className="font-mono text-[10.5px] text-foreground truncate max-w-[170px]">{currentEnv.gateway}</code>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Schemat logiczny:</span>
                <span className="font-semibold text-foreground">FA(3) v1-0E</span>
              </div>
            </Card>
          </div>
        </motion.div>
      )}

      {/* ── TAB 3: Dziennik Transmisji & Magazyn UPO ── */}
      {tab === "journal" && (
        <motion.div
          key="tab-journal"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <Card className="rounded-3xl border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-[17px]">Zarejestrowane e-Faktury w KSeF</CardTitle>
                <CardDescription>
                  Dokumenty i potwierdzenia. W trybie demo numery i pliki UPO są wyłącznie symulacją; nie potwierdzają przyjęcia przez MF.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent>
              {ksefInvoices.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <FileText className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">{nextCursor ? "Brak wysłanych dokumentów na wczytanej stronie" : "Brak wysłanych dokumentów do KSeF"}</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Przejdź do zakładki „Inspektor FA(3) i Wysyłka” lub wyślij fakturę bezpośrednio z listy faktur.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[760px]">
                    <thead>
                      <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <th className="py-3 px-3">Faktura</th>
                        <th className="py-3 px-3">Kontrahent</th>
                        <th className="py-3 px-3">Kwota Brutto</th>
                        <th className="py-3 px-3">Numer KSeF</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Data transmisji</th>
                        <th className="py-3 px-3 text-right">UPO & XML</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {ksefInvoices.map((inv) => {
                        const ctr = getContractor(contractors, inv.contractorId);
                        const ksefNum = inv.ksef?.number || inv.ksefNumber || "—";
                        const isSent = inv.ksef?.status === "SENT" || inv.ksef?.status === "QUEUED";
                        const isAccepted = inv.ksef?.status === "ACTIVE" || inv.status === "ksef_active";

                        return (
                          <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3.5 px-3">
                              <a href={`/invoices/${inv.id}`} className="font-semibold text-foreground hover:underline">
                                {inv.number}
                              </a>
                              <p className="text-[10.5px] text-muted-foreground font-mono">{inv.type === "sale" ? "FV" : "FZ"}</p>
                            </td>
                            <td className="py-3.5 px-3">
                              <p className="font-medium text-foreground">{ctr?.name || "Klient detaliczny"}</p>
                              <p className="text-[10.5px] text-muted-foreground font-mono">{ctr?.nip || ""}</p>
                            </td>
                            <td className="py-3.5 px-3 font-semibold tabular-nums text-foreground">
                              {formatMoney(invoiceTotals(inv).gross, inv.currency)}
                            </td>
                            <td className="py-3.5 px-3">
                              <code className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold break-all">
                                {ksefNum}
                              </code>
                            </td>
                            <td className="py-3.5 px-3">
                              <Badge
                                tone={isAccepted ? "success" : isSent ? "warning" : "danger"}
                                className="text-[10px]"
                              >
                                {isAccepted ? "Zarejestrowana" : isSent ? "W kolejce" : "Odrzucona"}
                              </Badge>
                            </td>
                            <td className="py-3.5 px-3 text-muted-foreground">
                              {formatDateTime(inv.ksef?.sentAt || inv.sentAt || inv.createdAt)}
                            </td>
                            <td className="py-3.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDownloadUpo(ksefNum)}
                                  className="h-8 px-2 text-xs gap-1"
                                  title="Pobierz UPO XML"
                                >
                                  <Download className="h-3 w-3" /> UPO
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDownloadXml(ksefNum)}
                                  className="h-8 px-2 text-xs gap-1"
                                  title="Pobierz e-Fakturę FA(3)"
                                >
                                  <FileCode2 className="h-3 w-3" /> XML
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── TAB 4: Zakupy z KSeF (FZ) ── */}
      {tab === "incoming" && (
        <motion.div
          key="tab-incoming"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Karta harmonogramu automatycznego pobierania */}
          <Card className="rounded-3xl border-border/70 shadow-sm bg-gradient-to-br from-card via-card/90 to-card/50">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-[16px]">Automatyczne Pobieranie Faktur z KSeF (w tle)</CardTitle>
                    <CardDescription>
                      System może cyklicznie odpytywać bramkę KSeF o nowe faktury kosztowe i powiadamiać Cię e-mailem o nowych dokumentach.
                    </CardDescription>
                  </div>
                </div>
                <Badge tone={autoSyncEnabled ? "success" : "muted"} className="text-xs">
                  {autoSyncEnabled ? `Aktywny (co ${autoSyncIntervalHours}h)` : "Wyłączony"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-1">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-1">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tryb automatyczny
                  </Label>
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/60 bg-muted/20 cursor-pointer text-xs">
                    <Checkbox
                      checked={autoSyncEnabled}
                      onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                    />
                    <span className="font-medium text-foreground">Włącz autozakupy w tle</span>
                  </label>
                </div>

                <div className="space-y-1.5 sm:col-span-1">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Częstotliwość sprawdzania
                  </Label>
                  <Select
                    value={String(autoSyncIntervalHours)}
                    onChange={(e) => setAutoSyncIntervalHours(Number(e.target.value))}
                    className="rounded-xl text-xs h-10"
                    disabled={!autoSyncEnabled}
                  >
                    <option value="1">Co 1 godzinę (1h)</option>
                    <option value="2">Co 2 godziny (2h) — zalecane</option>
                    <option value="10">Co 10 godzin (10h)</option>
                    <option value="24">Co 24 godziny (raz na dobę)</option>
                  </Select>
                </div>

                <div className="space-y-1.5 sm:col-span-1">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" /> E-mail do powiadomień
                  </Label>
                  <Input
                    type="email"
                    placeholder="np. ksiegowosc@twojadomena.pl"
                    value={autoSyncNotifyEmail}
                    onChange={(e) => setAutoSyncNotifyEmail(e.target.value)}
                    className="rounded-xl text-xs h-10"
                    disabled={!autoSyncEnabled}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/40 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>Ostatnia automatyczna synchronizacja:</span>
                  <b className="text-foreground">
                    {ksefSafe.lastAutoSyncAt ? formatDateTime(ksefSafe.lastAutoSyncAt) : "Nigdy / brak"}
                  </b>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleSaveAutoSync}
                    loading={savingAutoSync}
                    size="sm"
                    className="rounded-xl gap-1.5 text-xs font-semibold"
                  >
                    <Save className="h-3.5 w-3.5" /> Zapisz harmonogram
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Wykaz faktur zakupowych */}
          <Card className="rounded-3xl border-border/70 shadow-sm">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-[17px]">Faktury Zakupowe (FZ) z KSeF</CardTitle>
                <CardDescription>
                  Automatyczny import dokumentów kosztowych, w których Twoja firma została wskazana jako nabywca (Subject2).
                </CardDescription>
              </div>
              <Button
                onClick={handleSyncIncoming}
                loading={syncingIncoming}
                className="gap-2 rounded-xl font-semibold shrink-0"
              >
                {!syncingIncoming && <CloudDownload className="h-4 w-4" />}
                {syncingIncoming ? "Pobieranie z KSeF..." : "Pobierz Faktury Zakupowe"}
              </Button>
            </CardHeader>

            <CardContent>
              {purchaseInvoices.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <CloudDownload className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">{nextCursor ? "Brak zakupów na wczytanej stronie" : "Brak pobranych faktur zakupowych"}</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Kliknij przycisk „Pobierz Faktury Zakupowe”, aby zaimportować dokumenty wystawione na Twój NIP przez kontrahentów.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[850px]">
                    <thead>
                      <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <th className="py-3 px-3">Faktura</th>
                        <th className="py-3 px-3">Sprzedawca</th>
                        <th className="py-3 px-3">Data wystawienia</th>
                        <th className="py-3 px-3">Wartość brutto</th>
                        <th className="py-3 px-3">Numer KSeF</th>
                        <th className="py-3 px-3">Księgowość</th>
                        <th className="py-3 px-3 text-right">Akcje</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {purchaseInvoices.map((inv) => {
                        const ctr = getContractor(contractors, inv.contractorId);
                        const ksefNum = inv.ksef?.number || inv.ksefNumber || "—";
                        const isApproved = inv.approvalStatus === "approved";

                        return (
                          <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-3 font-semibold text-foreground">
                              <a href={`/invoices/${inv.id}`} className="hover:underline">
                                {inv.number}
                              </a>
                            </td>
                            <td className="py-3 px-3">
                              <p className="font-medium text-foreground">{ctr?.name || "Sprzedawca"}</p>
                              <p className="text-[10.5px] text-muted-foreground font-mono">{ctr?.nip || ""}</p>
                            </td>
                            <td className="py-3 px-3 text-muted-foreground">{inv.issueDate}</td>
                            <td className="py-3 px-3 font-semibold tabular-nums text-foreground">
                              {formatMoney(invoiceTotals(inv).gross, inv.currency)}
                            </td>
                            <td className="py-3 px-3">
                              <code className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                                {ksefNum}
                              </code>
                            </td>
                            <td className="py-3 px-3">
                              {isApproved ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] border border-emerald-500/20">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                  Zatwierdzona
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium text-[11px] border border-amber-500/20">
                                  <Clock className="h-3.5 w-3.5" />
                                  Do akceptacji
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isApproved ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleToggleApproval(inv.id, "pending")}
                                    loading={approvingId === inv.id}
                                    className="h-7 px-2 text-[11px] rounded-lg"
                                  >
                                    Cofnij
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={() => handleToggleApproval(inv.id, "approved")}
                                    loading={approvingId === inv.id}
                                    className="h-7 px-2.5 text-[11px] rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1"
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                    Akceptuj
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDownloadUpo(ksefNum)}
                                  className="h-7 px-2 text-xs gap-1"
                                  title="Pobierz UPO (XML)"
                                >
                                  <Download className="h-3 w-3" /> UPO
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDownloadXml(ksefNum)}
                                  className="h-7 px-2 text-xs gap-1"
                                  title="Pobierz e-Fakturę FA(3)"
                                >
                                  <FileCode2 className="h-3 w-3" /> XML
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
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
