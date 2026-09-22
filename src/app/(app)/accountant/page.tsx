"use client";

import * as React from "react";
import {
  Users,
  Briefcase,
  Download,
  CheckCircle2,
  Calendar,
  DollarSign,
  TrendingUp,
  FileSpreadsheet,
  Mail,
  Trash2,
  Copy,
  Check,
  ShieldCheck,
  Clock,
  ArrowRight,
  Receipt,
  FileCheck2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";
import { useAppStore } from "@/lib/store";
import { formatMoney } from "@/lib/format";
import { JpkExportCard } from "@/components/accountant/jpk-export-card";
import { SharedAccountingWorkspace } from "@/components/accountant/shared-workspace";
import { useWorkspacePreference } from "@/lib/use-workspace-preference";
import { csvCell } from "@/lib/accountant-summary";
import type { Invoice, Expense } from "@/lib/types";

interface MonthSummary {
  salesCount: number;
  salesNet: number;
  salesVat: number;
  salesGross: number;
  expenseCount: number;
  expenseNet: number;
  expenseVat: number;
  expenseGross: number;
  vatBalance: number;
  incomeBeforeTax: number;
}

interface TeamInvite {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: string;
  status: string;
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  accountant: "Księgowa / Biuro rachunkowe",
  employee: "Pracownik (Wystawianie i zlecenia)",
  viewer: "Przeglądający (Tylko wgląd)",
};

export default function AccountantPage() {
  const toast = useToast();
  const { contractors, company, selectedCompanyId } = useAppStore();
  const [currency, setCurrency] = React.useState("PLN");
  const [loadError, setLoadError] = React.useState("");
  const [purchases, setPurchases] = React.useState<Invoice[]>([]);
  const requestGeneration = React.useRef(0);

  const [currentMonth, setCurrentMonth] = React.useState(
    new Date().toISOString().slice(0, 7) // "YYYY-MM"
  );
  const [loading, setLoading] = React.useState(true);
  const [summary, setSummary] = React.useState<MonthSummary | null>(null);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [expenses, setExpenses] = React.useState<Expense[]>([]);

  // Checklist state
  const checklist = useWorkspacePreference<Record<string, boolean>>(`accountant:${currentMonth}`, selectedCompanyId);
  const checkedItems = checklist.value || {};

  // Team invitations
  const [invitations, setInvitations] = React.useState<TeamInvite[]>([]);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState("accountant");
  const [inviting, setInviting] = React.useState(false);
  const [copiedToken, setCopiedToken] = React.useState<string | null>(null);

  const fetchMonthData = React.useCallback(async () => {
    const generation = ++requestGeneration.current;
    setSummary(null); setInvoices([]); setExpenses([]); setPurchases([]); setLoadError("");
    if (!selectedCompanyId) { setLoading(false); setLoadError("Wybierz firmę."); return; }
    try {
      setLoading(true);
      const res = await fetch(`/api/accountant/export-pack?month=${currentMonth}&companyId=${selectedCompanyId}&currency=${currency}`);
      if (!res.ok) throw new Error("Błąd pobierania danych");
      const data = await res.json();
      if (generation !== requestGeneration.current) return;
      setPurchases(data.purchases || []);
      setSummary(data.summary);
      setInvoices(data.invoices || []);
      setExpenses(data.expenses || []);
    } catch {
      if (generation !== requestGeneration.current) return;
      setLoadError("Nie udało się pobrać zestawienia. Sprawdź uprawnienia do eksportu.");
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [currentMonth, selectedCompanyId, currency]);

  const fetchInvitations = React.useCallback(async () => {
    setInvitations([]);
    if (!selectedCompanyId) return;
    try {
      const res = await fetch(`/api/team?companyId=${selectedCompanyId || ""}`);
      if (!res.ok) return;
      const data = await res.json();
      if (useAppStore.getState().selectedCompanyId === selectedCompanyId) setInvitations(data.invitations || []);
    } catch {
      // ignore
    }
  }, [selectedCompanyId]);

  React.useEffect(() => {
    fetchMonthData();
  }, [fetchMonthData]);

  React.useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const toggleChecklist = (key: string) => {
    void checklist.save({ ...checkedItems, [key]: !checkedItems[key] });
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      toast("error", "Błąd", "Wpisz adres e-mail.");
      return;
    }
    try {
      setInviting(true);
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: selectedCompanyId, email: inviteEmail.trim(), role: inviteRole }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Błąd zapraszania");
      }
      toast("success", "Wysłano zaproszenie", `Wygenerowano dostęp dla ${inviteEmail}`);
      setInviteEmail("");
      fetchInvitations();
    } catch (err: unknown) {
      toast("error", "Błąd", err instanceof Error ? err.message : "Błąd zapraszania");
    } finally {
      setInviting(false);
    }
  };

  const handleDeleteInvite = async (id: string) => {
    try {
      const res = await fetch(`/api/team/invitations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Błąd usuwania");
      toast("success", "Odwołano zaproszenie");
      setInvitations((prev) => prev.filter((i) => i.id !== id));
    } catch {
      toast("error", "Błąd", "Nie udało się cofnąć zaproszenia.");
    }
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
    toast("success", "Skopiowano link", "Link zaproszenia skopiowany do schowka.");
  };

  const exportMonthlyCsv = () => {
    if (!invoices.length && !expenses.length && !purchases.length) {
      toast("info", "Brak danych", "Brak dokumentów w wybranym miesiącu.");
      return;
    }

    const rows: unknown[][] = [["TYP", "NUMER", "KONTRAHENT", "NIP", "DATA", "WALUTA", "NETTO", "VAT", "BRUTTO", "KSEF", "STATUS PLATNOSCI"]];
    for (const i of [...invoices, ...purchases]) {
      const contractor = contractors.find(c => c.id === i.contractorId);
      rows.push([i.type === "purchase" ? "ZAKUP" : "SPRZEDAZ", i.number, contractor?.name || "", contractor?.nip || "", i.issueDate, i.currency, i.totalNet || 0, i.totalVat || 0, i.totalGross || 0, i.ksefNumber || "", i.paymentStatus || "unpaid"]);
    }
    for (const e of expenses) rows.push(["KOSZT", e.number, e.contractorName, e.nip, e.issueDate, e.currency, e.totalNet, e.totalVat, e.totalGross, e.ksefRefNumber, e.paymentStatus]);
    const content = "\uFEFF" + rows.map(row => row.map(csvCell).join(";")).join("\r\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Zestawienie_${company?.nip || selectedCompanyId}_${currentMonth}_${currency}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    void checklist.save({ ...checkedItems, packExported: true });
    toast("success", "Pobrano paczkę", `Paczka księgowa za okres ${currentMonth} pobrana pomyślnie.`);
  };

  return (
    <div className="page">
      <PageHeader
        title="Księgowość & Współpraca"
        description="Miesięczne podsumowania dla biura rachunkowego, bilans podatkowy VAT i dochodu oraz darmowy dostęp dla Twojego zespołu."
        actions={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <Input
              type="month"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(e.target.value)}
              style={{ width: "auto", fontSize: "0.875rem" }}
            />
            <Select aria-label="Waluta zestawienia" value={currency} onChange={e => setCurrency(e.target.value)}>{["PLN", "EUR", "USD", "GBP", "CHF", "CZK"].map(c => <option key={c}>{c}</option>)}</Select>
            <Button variant="primary" onClick={exportMonthlyCsv} disabled={loading || Boolean(loadError)}>
              <Download size={16} />
              Pobierz zestawienie CSV
            </Button>
          </div>
        }
      />

      {loadError && <div role="alert" className="mb-4 rounded-xl border p-4">{loadError} <Button onClick={fetchMonthData}>Spróbuj ponownie</Button></div>}
      <p className="mb-4 text-sm text-muted-foreground">Kwoty w walucie dokumentów: {currency}. Zestawienie nie stanowi wyliczenia zobowiązania podatkowego. Dokumenty bez przypisanej firmy są dostępne w archiwum kosztów.</p>
      {/* Karty bilansu miesięcznego */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <Card style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", fontWeight: 500 }}>Przychody ze sprzedaży</span>
            <TrendingUp size={18} color="var(--primary)" />
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--foreground)" }}>
            {formatMoney(summary?.salesNet || 0, currency)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            Brutto: {formatMoney(summary?.salesGross || 0, currency)} • Dok: {summary?.salesCount || 0}
          </div>
        </Card>

        <Card style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", fontWeight: 500 }}>Koszty operacyjne</span>
            <Receipt size={18} color="var(--warning)" />
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--foreground)" }}>
            {formatMoney(summary?.expenseNet || 0, currency)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            Brutto: {formatMoney(summary?.expenseGross || 0, currency)} • Dok: {summary?.expenseCount || 0}
          </div>
        </Card>

        <Card style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", fontWeight: 500 }}>Bilans podatku VAT</span>
            <DollarSign size={18} color={summary && summary.vatBalance > 0 ? "var(--danger)" : "var(--primary)"} />
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--foreground)" }}>
            {formatMoney(summary?.vatBalance || 0, currency)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            {summary && summary.vatBalance >= 0 ? "Różnica VAT sprzedaży i zakupów" : "VAT zakupów przewyższa VAT sprzedaży"}
          </div>
        </Card>

        <Card style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", fontWeight: 500 }}>Szacowany dochód</span>
            <CheckCircle2 size={18} color="var(--accent)" />
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--foreground)" }}>
            {formatMoney(summary?.incomeBeforeTax || 0, currency)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            Różnica wartości netto dokumentów
          </div>
        </Card>
      </div>

      {/* Generator Jednolitego Pliku Kontrolnego JPK */}
      <div style={{ marginBottom: "1.5rem" }}>
        <JpkExportCard
          currentMonth={currentMonth}
          invoices={invoices}
          expenses={expenses}
          company={company}
          contractors={contractors}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "1.5rem", marginBottom: "1.5rem" }}>
        
        {/* Lista kontrolna zamknięcia miesiąca */}
        <Card style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <FileCheck2 size={20} color="var(--primary)" />
            <h3 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>Moja lista kontrolna miesiąca</h3>
          </div>
          <p style={{ fontSize: "0.8125rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
            Kroki przygotowania dokumentów przed wysyłką do biura rachunkowego za okres {currentMonth}:
          </p>

          {selectedCompanyId && <SharedAccountingWorkspace key={`${selectedCompanyId}:${currentMonth}`} companyId={selectedCompanyId} month={currentMonth} />}
          <p className="text-xs text-muted-foreground mt-3">Poniższe wcześniejsze zaznaczenia są Twoją osobistą listą.</p>
          {checklist.error && <p role="alert" className="text-sm text-rose-500">{checklist.error}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {[
              {
                id: "invoicesIssued",
                title: "Wystawiono wszystkie faktury sprzedaży",
                desc: `Zarejestrowano ${summary?.salesCount || 0} faktur sprzedaży.`,
              },
              {
                id: "expensesVerified",
                title: "Sprawdzono i opisano faktury kosztowe",
                desc: `Wprowadzono ${summary?.expenseCount || 0} wydatków w zakładce Koszty.`,
              },
              {
                id: "bankReconciled",
                title: "Zaimportowano wyciąg bankowy z banku",
                desc: "Sprawdzenie wpłat od klientów i zgodności salda.",
              },
              {
                id: "packExported",
                title: "Pobrano lub wysłano paczkę dokumentów",
                desc: "Zestawienie CSV/JPK gotowe dla księgowej.",
              },
            ].map((step) => {
              const checked = checkedItems[step.id];
              return (
                <div
                  key={step.id}
                  role="checkbox" aria-checked={Boolean(checked)} tabIndex={0}
                  onKeyDown={e => { if ((e.key === " " || e.key === "Enter") && checklist.ready && !checklist.saving) { e.preventDefault(); toggleChecklist(step.id); } }}
                  onClick={() => { if (checklist.ready && !checklist.saving) toggleChecklist(step.id); }}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                    padding: "0.75rem",
                    borderRadius: "var(--radius-sm)",
                    background: checked ? "rgba(16, 185, 129, 0.08)" : "var(--surface-sunken)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ marginTop: "0.15rem" }}>
                    <CheckCircle2 size={18} color={checked ? "#10b981" : "var(--muted)"} />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--foreground)", textDecoration: checked ? "line-through" : "none" }}>
                      {step.title}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.15rem" }}>
                      {step.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Współpraca i zapraszanie zespołu / księgowej */}
        <Card style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <Users size={20} color="var(--primary)" />
            <h3 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>Dostęp dla biura rachunkowego & zespołu</h3>
          </div>
          <p style={{ fontSize: "0.8125rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
            Zaproś swoją księgową lub współpracowników. 100% za darmo, bez ograniczeń kont i bez abonamentu.
          </p>

          <form onSubmit={handleInvite} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.25rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: "0.5rem" }}>
              <Input
                type="email"
                placeholder="ksiegowa@biuro-podatkowe.pl"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
              <Select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="accountant">Księgowa</option>
                <option value="employee">Pracownik</option>
                <option value="viewer">Wgląd (tylko odczyt)</option>
              </Select>
            </div>
            <Button type="submit" variant="primary" disabled={inviting}>
              {inviting ? "Wysyłanie..." : "Wyślij zaproszenie"}
            </Button>
          </form>

          {/* Lista aktywnych zaproszeń */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
            <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--muted)", marginBottom: "0.5rem" }}>
              Aktywne zaproszenia ({invitations.length})
            </div>
            {invitations.length === 0 ? (
              <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontStyle: "italic" }}>
                Brak zaproszonych osób. Dodaj swoją księgową, aby ułatwić miesięczne rozliczenia.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "6px",
                      background: "var(--surface-sunken)",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--foreground)" }}>{inv.email}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                        {ROLE_LABELS[inv.role] || inv.role} • Status: {inv.status}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.35rem" }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyInviteLink(inv.token)}
                        title="Kopiuj bezpośredni link zaproszenia"
                      >
                        {copiedToken === inv.token ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteInvite(inv.id)}
                        style={{ color: "var(--danger)" }}
                        title="Cofnij zaproszenie"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
