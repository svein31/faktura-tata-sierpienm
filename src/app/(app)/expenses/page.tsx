"use client";

import { useAppStore } from "@/lib/store";
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Receipt,
  Plus,
  Search,
  Trash2,
  CheckCircle2,
  Clock,
  Send,
  Download,
  AlertCircle,
  Tag,
  DollarSign,
  FileText,
  Calendar,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/page-header";
import { formatDate, formatMoney } from "@/lib/format";
import type { Expense, Currency } from "@/lib/types";

type WorkflowStatus = Expense["workflowStatus"];
type ExpenseCategory = Expense["category"];

const WORKFLOW_MAP: Record<WorkflowStatus, { label: string; tone: "warning" | "success" | "neutral" }> = {
  to_verify: { label: "Do sprawdzenia", tone: "warning" },
  verified: { label: "Sprawdzone", tone: "success" },
  sent_to_accountant: { label: "Przekazane księgowej", tone: "neutral" },
};

const CATEGORIES: { id: ExpenseCategory; label: string }[] = [
  { id: "biuro", label: "Biuro & Media" },
  { id: "sprzęt", label: "Sprzęt & Elektronika" },
  { id: "paliwo", label: "Paliwo & Pojazdy" },
  { id: "oprogramowanie", label: "Oprogramowanie & SaaS" },
  { id: "marketing", label: "Marketing & Reklama" },
  { id: "usługi", label: "Usługi obce & B2B" },
  { id: "podatki", label: "Podatki & ZUS" },
  { id: "inne", label: "Inne wydatki" },
];

export default function ExpensesPage() {
  const toast = useToast();
  const selectedCompanyId = useAppStore(s => s.selectedCompanyId);
  const [legacy, setLegacy] = React.useState(false);
  React.useEffect(() => { setLegacy(false); }, [selectedCompanyId]);
  const scope = legacy ? "legacy" : selectedCompanyId || "legacy";
  const scopeRef = React.useRef(scope);
  scopeRef.current = scope;
  React.useEffect(() => { setModalOpen(false); setToDelete(null); }, [scope]);

  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [workflowFilter, setWorkflowFilter] = React.useState<"all" | WorkflowStatus>("all");
  const [categoryFilter, setCategoryFilter] = React.useState<"all" | ExpenseCategory>("all");
  const [paymentFilter, setPaymentFilter] = React.useState<"all" | "paid" | "unpaid">("all");

  const [modalOpen, setModalOpen] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<string | null>(null);

  // Formularz nowego kosztu
  const [formNumber, setFormNumber] = React.useState("");
  const [formContractor, setFormContractor] = React.useState("");
  const [formNip, setFormNip] = React.useState("");
  const [formIssueDate, setFormIssueDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [formDueDate, setFormDueDate] = React.useState("");
  const [formCategory, setFormCategory] = React.useState<ExpenseCategory>("inne");
  const [formDescription, setFormDescription] = React.useState("");
  const [formTotalGross, setFormTotalGross] = React.useState<number>(0);
  const [formVatRate, setFormVatRate] = React.useState<number>(23);
  const [formCurrency, setFormCurrency] = React.useState<Currency>("PLN");
  const [formPaymentStatus, setFormPaymentStatus] = React.useState<"paid" | "unpaid">("unpaid");
  const [formSaving, setFormSaving] = React.useState(false);

  const fetchExpenses = React.useCallback(async () => {
    try {
      setExpenses([]);
      setLoading(true);
      const res = await fetch(`/api/expenses?companyId=${scope}`);
      if (!res.ok) throw new Error("Błąd pobierania kosztów");
      const data = await res.json();
      if (scopeRef.current !== scope) return;
      setExpenses(data.expenses || []);
    } catch {
      toast("error", "Błąd", "Nie udało się załadować listy wydatków.");
    } finally {
      setLoading(false);
    }
  }, [toast, scope]);

  React.useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  // Obliczenia netto / VAT
  const calculatedNet = React.useMemo(() => {
    if (!formTotalGross) return 0;
    const rateFactor = 1 + formVatRate / 100;
    return Math.round((formTotalGross / rateFactor) * 100) / 100;
  }, [formTotalGross, formVatRate]);

  const calculatedVat = React.useMemo(() => {
    return Math.round((formTotalGross - calculatedNet) * 100) / 100;
  }, [formTotalGross, calculatedNet]);

  // Metryki
  const metrics = React.useMemo(() => {
    let totalGross = 0;
    let totalNet = 0;
    let totalVat = 0;
    let unpaidGross = 0;
    let toVerifyCount = 0;

    expenses.forEach((e) => {
      totalGross += e.totalGross;
      totalNet += e.totalNet;
      totalVat += e.totalVat;
      if (e.paymentStatus === "unpaid") {
        unpaidGross += e.totalGross;
      }
      if (e.workflowStatus === "to_verify") {
        toVerifyCount++;
      }
    });

    return { totalGross, totalNet, totalVat, unpaidGross, toVerifyCount, count: expenses.length };
  }, [expenses]);

  // Filtrowanie
  const filteredExpenses = React.useMemo(() => {
    return expenses.filter((e) => {
      if (workflowFilter !== "all" && e.workflowStatus !== workflowFilter) return false;
      if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
      if (paymentFilter !== "all" && e.paymentStatus !== paymentFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchNum = e.number.toLowerCase().includes(q);
        const matchName = e.contractorName.toLowerCase().includes(q);
        const matchNip = e.nip ? e.nip.includes(q) : false;
        const matchDesc = e.description ? e.description.toLowerCase().includes(q) : false;
        if (!matchNum && !matchName && !matchNip && !matchDesc) return false;
      }
      return true;
    });
  }, [expenses, workflowFilter, categoryFilter, paymentFilter, search]);

  const resetForm = () => {
    setFormNumber("");
    setFormContractor("");
    setFormNip("");
    setFormIssueDate(new Date().toISOString().slice(0, 10));
    setFormDueDate("");
    setFormCategory("inne");
    setFormDescription("");
    setFormTotalGross(0);
    setFormVatRate(23);
    setFormCurrency("PLN");
    setFormPaymentStatus("unpaid");
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formContractor.trim()) {
      toast("error", "Błąd walidacji", "Wpisz nazwę wystawcy faktury / kontrahenta.");
      return;
    }
    if (!formTotalGross || formTotalGross <= 0) {
      toast("error", "Błąd walidacji", "Wpisz kwotę brutto kosztu.");
      return;
    }

    try {
      setFormSaving(true);
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: scope === "legacy" ? null : scope,
          number: formNumber.trim() || `FV-KOSZT/${formIssueDate}`,
          contractorName: formContractor.trim(),
          nip: formNip.trim() || null,
          issueDate: formIssueDate,
          dueDate: formDueDate || null,
          category: formCategory,
          description: formDescription.trim() || null,
          totalGross: formTotalGross,
          totalNet: calculatedNet,
          totalVat: calculatedVat,
          currency: formCurrency,
          paymentStatus: formPaymentStatus,
          workflowStatus: "to_verify",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Błąd zapisu kosztu");
      }

      toast("success", "Dodano dokument kosztowy");
      setModalOpen(false);
      resetForm();
      fetchExpenses();
    } catch (err: unknown) {
      toast("error", "Błąd", err instanceof Error ? err.message : "Błąd dodawania kosztu.");
    } finally {
      setFormSaving(false);
    }
  };

  const handleUpdateWorkflow = async (id: string, newWorkflow: WorkflowStatus) => {
    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowStatus: newWorkflow }),
      });
      if (!res.ok) throw new Error("Błąd aktualizacji statusu");
      toast("success", "Zaktualizowano status weryfikacji");
      setExpenses((prev) =>
        prev.map((e) => (e.id === id ? { ...e, workflowStatus: newWorkflow } : e))
      );
    } catch {
      toast("error", "Błąd", "Nie udało się zmienić statusu.");
    }
  };

  const handleTogglePayment = async (id: string, currentStatus: "paid" | "unpaid") => {
    const nextStatus = currentStatus === "paid" ? "unpaid" : "paid";
    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: nextStatus }),
      });
      if (!res.ok) throw new Error("Błąd aktualizacji płatności");
      toast("success", nextStatus === "paid" ? "Oznaczono jako opłacone" : "Oznaczono jako nieopłacone");
      setExpenses((prev) =>
        prev.map((e) =>
          e.id === id
            ? { ...e, paymentStatus: nextStatus, paidAt: nextStatus === "paid" ? new Date().toISOString() : null }
            : e
        )
      );
    } catch {
      toast("error", "Błąd", "Nie udało się zmienić statusu płatności.");
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      const res = await fetch(`/api/expenses/${toDelete}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Błąd usuwania");
      toast("success", "Usunięto koszt");
      setExpenses((prev) => prev.filter((e) => e.id !== toDelete));
    } catch {
      toast("error", "Błąd", "Nie udało się usunąć kosztu.");
    } finally {
      setToDelete(null);
    }
  };

  const exportCsv = () => {
    if (!expenses.length) {
      toast("info", "Brak danych", "Brak kosztów do eksportu.");
      return;
    }
    const headers = ["Nr dokumentu", "Wystawca", "NIP", "Data wystawienia", "Termin płatności", "Kategoria", "Netto PLN", "VAT PLN", "Brutto PLN", "Status płatności", "Workflow"];
    const rows = filteredExpenses.map((e) => [
      `"${e.number.replace(/"/g, '""')}"`,
      `"${e.contractorName.replace(/"/g, '""')}"`,
      `"${e.nip || ""}"`,
      e.issueDate,
      e.dueDate || "",
      `"${e.category}"`,
      e.totalNet.toFixed(2),
      e.totalVat.toFixed(2),
      e.totalGross.toFixed(2),
      e.paymentStatus === "paid" ? "Opłacone" : "Nieopłacone",
      WORKFLOW_MAP[e.workflowStatus]?.label || e.workflowStatus,
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Koszty_FakturaProsto_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("success", "Pobrano plik", "Wygenerowano zestawienie kosztów CSV dla księgowości.");
  };

  return (
    <div className="page">
      <label className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={legacy} onChange={e => setLegacy(e.target.checked)} />Dokumenty bez przypisanej firmy (archiwum)</label>
      <PageHeader
        title="Koszty i wydatki"
        description="Ewidencja faktur kosztowych, paliwa, sprzętu i subskrypcji. Gotowe zestawienia dla księgowej bez żadnych opłat."
        actions={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Button variant="outline" onClick={exportCsv}>
              <Download size={16} />
              Eksportuj CSV
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                resetForm();
                setModalOpen(true);
              }}
            >
              <Plus size={16} />
              Dodaj koszt
            </Button>
          </div>
        }
      />

      {/* Karty podsumowania */}
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
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", fontWeight: 500 }}>Suma kosztów brutto</span>
            <DollarSign size={18} color="var(--primary)" />
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--foreground)" }}>
            {formatMoney(metrics.totalGross, "PLN")}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            Netto: {formatMoney(metrics.totalNet, "PLN")} • VAT: {formatMoney(metrics.totalVat, "PLN")}
          </div>
        </Card>

        <Card style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", fontWeight: 500 }}>Do opłacenia</span>
            <Clock size={18} color="var(--warning)" />
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: metrics.unpaidGross > 0 ? "var(--warning)" : "var(--foreground)" }}>
            {formatMoney(metrics.unpaidGross, "PLN")}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            Nierozliczone zobowiązania
          </div>
        </Card>

        <Card style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", fontWeight: 500 }}>Do weryfikacji</span>
            <AlertCircle size={18} color="var(--danger)" />
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--foreground)" }}>
            {metrics.toVerifyCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            Wymagają sprawdzenia lub opisu
          </div>
        </Card>

        <Card style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", fontWeight: 500 }}>Liczba dokumentów</span>
            <Receipt size={18} color="var(--accent)" />
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--foreground)" }}>
            {metrics.count}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            Zarejestrowane faktury i rachunki
          </div>
        </Card>
      </div>

      {/* Pasek filtrów */}
      <Card style={{ padding: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", justifyContent: "space-between" }}>
            {/* Wyszukiwarka */}
            <div style={{ position: "relative", minWidth: "260px", flex: 1 }}>
              <Search size={16} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
              <Input
                placeholder="Szukaj po numerze, sprzedawcy, NIP lub opisie..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: "2.25rem", width: "100%" }}
              />
            </div>

            {/* Filtr kategorii */}
            <div style={{ minWidth: "180px" }}>
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as "all" | ExpenseCategory)}
              >
                <option value="all">Wszystkie kategorie</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>

            {/* Filtr płatności */}
            <div style={{ minWidth: "150px" }}>
              <Select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value as "all" | "paid" | "unpaid")}
              >
                <option value="all">Płatność: Wszystkie</option>
                <option value="paid">Tylko opłacone</option>
                <option value="unpaid">Tylko nieopłacone</option>
              </Select>
            </div>
          </div>

          {/* Zakładki Workflow Status */}
          <div style={{ display: "flex", gap: "0.5rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem", overflowX: "auto" }}>
            {[
              { id: "all", label: "Wszystkie statusy" },
              { id: "to_verify", label: "Do sprawdzenia" },
              { id: "verified", label: "Sprawdzone" },
              { id: "sent_to_accountant", label: "Przekazane księgowej" },
            ].map((tab) => {
              const active = workflowFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setWorkflowFilter(tab.id as "all" | WorkflowStatus)}
                  style={{
                    padding: "0.4rem 0.85rem",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.8125rem",
                    fontWeight: active ? 600 : 500,
                    border: "none",
                    cursor: "pointer",
                    background: active ? "var(--primary)" : "transparent",
                    color: active ? "#ffffff" : "var(--muted)",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s ease",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Tabela kosztów */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}>
            Ładowanie dokumentów kosztowych...
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div style={{ padding: "3.5rem 1rem", textAlign: "center" }}>
            <Receipt size={40} color="var(--muted)" style={{ margin: "0 auto 1rem" }} />
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Brak dokumentów kosztowych
            </h3>
            <p style={{ color: "var(--muted)", fontSize: "0.875rem", maxWidth: "420px", margin: "0 auto 1.5rem" }}>
              Dodaj swoje wydatki firmowe, aby mieć pełną kontrolę nad podatkami, zyskiem i płynnością bez limitów.
            </p>
            <Button
              variant="primary"
              onClick={() => {
                resetForm();
                setModalOpen(true);
              }}
            >
              <Plus size={16} />
              Dodaj pierwszy koszt
            </Button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--muted)", textAlign: "left" }}>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Dokument</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Sprzedawca</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Kategoria</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Data</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 600, textAlign: "right" }}>Kwota brutto</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 600, textAlign: "center" }}>Płatność</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 600, textAlign: "center" }}>Status dla księgowości</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 600, textAlign: "right" }}>Akcje</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filteredExpenses.map((item) => {
                    const wf = WORKFLOW_MAP[item.workflowStatus] || { label: item.workflowStatus, tone: "neutral" };
                    return (
                      <motion.tr
                        key={item.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ borderBottom: "1px solid var(--border)" }}
                      >
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <div style={{ fontWeight: 600, color: "var(--foreground)" }}>{item.number}</div>
                          {item.description && (
                            <div style={{ fontSize: "0.75rem", color: "var(--muted)", maxWidth: "220px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {item.description}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <div style={{ fontWeight: 500 }}>{item.contractorName}</div>
                          {item.nip && <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>NIP: {item.nip}</div>}
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem",
                              fontSize: "0.75rem",
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              background: "var(--surface-sunken)",
                              color: "var(--foreground)",
                            }}
                          >
                            <Tag size={12} />
                            {CATEGORIES.find((c) => c.id === item.category)?.label || item.category}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <div>{formatDate(item.issueDate)}</div>
                          {item.dueDate && (
                            <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                              Termin: {formatDate(item.dueDate)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                          <div style={{ fontWeight: 700, color: "var(--foreground)" }}>
                            {formatMoney(item.totalGross, item.currency)}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                            Netto: {formatMoney(item.totalNet, item.currency)}
                          </div>
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                          <button
                            onClick={() => handleTogglePayment(item.id, item.paymentStatus)}
                            title="Kliknij, aby przełączyć status płatności"
                            style={{
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            <Badge tone={item.paymentStatus === "paid" ? "success" : "warning"}>
                              {item.paymentStatus === "paid" ? "Opłacone" : "Do zapłaty"}
                            </Badge>
                          </button>
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                          <Select
                            value={item.workflowStatus}
                            onChange={(e) => handleUpdateWorkflow(item.id, e.target.value as WorkflowStatus)}
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.2rem 0.5rem",
                              height: "auto",
                              display: "inline-block",
                              width: "auto",
                            }}
                          >
                            <option value="to_verify">Do sprawdzenia</option>
                            <option value="verified">Sprawdzone</option>
                            <option value="sent_to_accountant">Przekazane księgowej</option>
                          </Select>
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setToDelete(item.id)}
                            style={{ color: "var(--danger)" }}
                            title="Usuń wydatek"
                          >
                            <Trash2 size={15} />
                          </Button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal dodawania kosztu */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Dodaj dokument kosztowy"
      >
        <form onSubmit={handleCreateExpense} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <Label>Nazwa sprzedawcy / wystawcy *</Label>
              <Input
                placeholder="np. Adobe Systems, PKN Orlen"
                value={formContractor}
                onChange={(e) => setFormContractor(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>NIP sprzedawcy (opcjonalnie)</Label>
              <Input
                placeholder="np. 5260211577"
                value={formNip}
                onChange={(e) => setFormNip(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <Label>Numer dokumentu</Label>
              <Input
                placeholder="np. FV/2026/03/4821"
                value={formNumber}
                onChange={(e) => setFormNumber(e.target.value)}
              />
            </div>
            <div>
              <Label>Kategoria wydatku</Label>
              <Select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as ExpenseCategory)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <Label>Data wystawienia *</Label>
              <Input
                type="date"
                value={formIssueDate}
                onChange={(e) => setFormIssueDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Termin płatności (opcjonalnie)</Label>
              <Input
                type="date"
                value={formDueDate}
                onChange={(e) => setFormDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Kwoty i stawka VAT */}
          <div
            style={{
              background: "var(--surface-sunken)",
              padding: "1rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: "0.75rem" }}>
              <div>
                <Label>Kwota brutto *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={formTotalGross || ""}
                  onChange={(e) => setFormTotalGross(parseFloat(e.target.value) || 0)}
                  required
                />
              </div>
              <div>
                <Label>Stawka VAT</Label>
                <Select
                  value={formVatRate}
                  onChange={(e) => setFormVatRate(Number(e.target.value))}
                >
                  <option value={23}>23%</option>
                  <option value={8}>8%</option>
                  <option value={5}>5%</option>
                  <option value={0}>0% / ZW</option>
                </Select>
              </div>
              <div>
                <Label>Waluta</Label>
                <Select
                  value={formCurrency}
                  onChange={(e) => setFormCurrency(e.target.value as Currency)}
                >
                  <option value="PLN">PLN</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </Select>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "var(--muted)", paddingTop: "0.25rem" }}>
              <span>Obliczone netto: <strong>{formatMoney(calculatedNet, formCurrency)}</strong></span>
              <span>Obliczony VAT: <strong>{formatMoney(calculatedVat, formCurrency)}</strong></span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <Label>Status płatności</Label>
              <Select
                value={formPaymentStatus}
                onChange={(e) => setFormPaymentStatus(e.target.value as "paid" | "unpaid")}
              >
                <option value="unpaid">Do zapłaty (nieopłacone)</option>
                <option value="paid">Opłacone</option>
              </Select>
            </div>
            <div>
              <Label>Opis / cel wydatku (dla księgowej)</Label>
              <Input
                placeholder="np. Licencja Figma, paliwo na spotkanie z klientem"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Anuluj
            </Button>
            <Button type="submit" variant="primary" disabled={formSaving}>
              {formSaving ? "Zapisywanie..." : "Zapisz koszt"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Dialog potwierdzenia usunięcia */}
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        title="Usuń dokument kosztowy"
        description="Czy na pewno chcesz usunąć ten wydatek? Operacja jest nieodwracalna."
        confirmLabel="Usuń"
        danger
      />
    </div>
  );
}

