"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  TrendingUp,
  TrendingDown,
  Scale,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  Receipt,
  FileText,
  Landmark,
  ExternalLink,
  Filter,
  Info,
  X,
  Plus,
} from "lucide-react";
import { useCompanyInvoices } from "@/lib/use-company-invoices";
import { useAppStore } from "@/lib/store";
import { formatMoney, formatDate, invoiceTotals } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { nextPolishBusinessDay } from "@/lib/pl-tax-deadlines";
import type { Expense, Invoice } from "@/lib/types";

interface TaxEvent {
  id: string;
  day: number;
  title: string;
  category: "zus" | "vat" | "pit";
  description: string;
  deadlineText: string;
}

const invoiceGross = (invoice: Invoice) => invoice.totalGross || invoiceTotals(invoice).gross;

export function PaymentCalendar() {
  const { selectedCompanyId, contractors } = useAppStore();
  const invoices = useCompanyInvoices();
  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = React.useState(false);
  const [expensesError, setExpensesError] = React.useState(false);

  // Aktualnie przeglądany miesiąc/rok
  const [currentDate, setCurrentDate] = React.useState(() => new Date());
  const [selectedDay, setSelectedDay] = React.useState<number | null>(() => new Date().getDate());
  const [filterType, setFilterType] = React.useState<"all" | "incomes" | "expenses" | "taxes" | "unpaid">("all");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-11

  // Pobranie kosztów
  React.useEffect(() => {
    let isMounted = true;
    setExpenses([]);
    setExpensesError(false);
    if (!selectedCompanyId) { setLoadingExpenses(false); return; }
    async function loadExpenses() {
      try {
        setLoadingExpenses(true);
        const res = await fetch(`/api/expenses?companyId=${encodeURIComponent(selectedCompanyId!)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (isMounted) {
          setExpenses(data.expenses || []);
        }
      } catch (err) {
        if (isMounted) setExpensesError(true);
        console.error("Nie udało się pobrać kosztów do kalendarza", err);
      } finally {
        if (isMounted) setLoadingExpenses(false);
      }
    }
    loadExpenses();
    return () => {
      isMounted = false;
    };
  }, [selectedCompanyId]);

  // Nazwy miesięcy i dni tygodnia po polsku
  const monthNames = [
    "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
    "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"
  ];
  const weekDays = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

  // Dni w danym miesiącu
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Dzień tygodnia pierwszego dnia (0 = niedziela w JS, zamieniamy na 0 = poniedziałek)
  const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;

  // Poprzedni / Następny miesiąc
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDay(null);
  };
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDay(null);
  };
  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDay(today.getDate());
  };

  const isCurrentMonth = () => {
    const today = new Date();
    return today.getFullYear() === year && today.getMonth() === month;
  };

  // Ogólne terminy; zakres obowiązków zależy od firmy i sposobu rozliczania.
  const taxEvents: TaxEvent[] = React.useMemo(() => {
    const events: TaxEvent[] = [
      {
        id: `zus-15-${year}-${month}`,
        day: 15,
        title: "ZUS (Spółki kapitałowe)",
        category: "zus",
        description: "Termin opłacenia składek ZUS dla jednostek posiadających osobowość prawną (sp. z o.o., S.A.).",
        deadlineText: "15. dzień miesiąca",
      },
      {
        id: `zus-20-${year}-${month}`,
        day: 20,
        title: "ZUS (JDG & Wspólnicy)",
        category: "zus",
        description: "Termin zapłaty składek ZUS (społeczne, zdrowotne, FP/FS) dla osób fizycznych prowadzących działalność gospodarczą.",
        deadlineText: "20. dzień miesiąca",
      },
      {
        id: `vat-pit-25-${year}-${month}`,
        day: 25,
        title: "VAT (JPK_V7)",
        category: "vat",
        description: "Zwykły termin złożenia JPK_V7 i rozliczenia VAT za poprzedni miesiąc, jeśli dotyczy firmy.",
        deadlineText: "25. dzień miesiąca",
      },
      {
        id: `pit-cit-20-${year}-${month}`,
        day: 20,
        title: "Zaliczka PIT / CIT",
        category: "pit",
        description: "Zwykły termin wpłaty zaliczki na podatek dochodowy za poprzedni miesiąc lub kwartał, jeśli jest należna.",
        deadlineText: "20. dzień miesiąca",
      },
    ];
    return events.map((event) => {
      const actual = nextPolishBusinessDay(year, month, event.day);
      return { ...event, day: actual.getDate(), deadlineText: event.day === actual.getDate() ? event.deadlineText : `${event.deadlineText} → ${actual.getDate()}. dzień (dzień roboczy)` };
    }).sort((a, b) => a.day - b.day);
  }, [year, month]);

  // Parsowanie i kategoryzacja pozycji dla danego miesiąca
  const monthItems = React.useMemo(() => {
    const map = new Map<number, {
      invoices: Invoice[];
      expenses: Expense[];
      taxes: TaxEvent[];
    }>();

    for (let d = 1; d <= daysInMonth; d++) {
      map.set(d, { invoices: [], expenses: [], taxes: [] });
    }

    // Dodanie podatków
    taxEvents.forEach((t) => {
      if (t.day <= daysInMonth) {
        map.get(t.day)?.taxes.push(t);
      }
    });

    // Dodanie faktur przychodowych
    invoices.forEach((inv) => {
      if (inv.type !== "sale" || inv.status === "draft" || invoiceGross(inv) <= 0) return;
      const targetDateStr = inv.dueDate || inv.issueDate;
      if (!targetDateStr) return;
      const [invoiceYear, invoiceMonth, invoiceDay] = targetDateStr.slice(0, 10).split("-").map(Number);
      const d = new Date(invoiceYear, invoiceMonth - 1, invoiceDay);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const dayNum = d.getDate();
        if (map.has(dayNum)) {
          map.get(dayNum)!.invoices.push(inv);
        }
      }
    });

    // Dodanie kosztów
    expenses.forEach((exp) => {
      if ((exp.totalGross || 0) <= 0) return;
      const targetDateStr = exp.dueDate || exp.issueDate;
      if (!targetDateStr) return;
      const [expenseYear, expenseMonth, expenseDay] = targetDateStr.slice(0, 10).split("-").map(Number);
      const d = new Date(expenseYear, expenseMonth - 1, expenseDay);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const dayNum = d.getDate();
        if (map.has(dayNum)) {
          map.get(dayNum)!.expenses.push(exp);
        }
      }
    });

    return map;
  }, [invoices, expenses, taxEvents, daysInMonth, year, month]);

  // Statystyki całego miesiąca
  const monthStats = React.useMemo(() => {
    let totalIncomes = 0;
    let totalExpenses = 0;
    let unpaidIncomes = 0;
    let unpaidExpenses = 0;

    monthItems.forEach(({ invoices: dayInvs, expenses: dayExps }) => {
      dayInvs.forEach((inv) => {
        if (inv.currency !== "PLN") return;
        totalIncomes += invoiceGross(inv);
        if (inv.paymentStatus !== "paid" && inv.status !== "paid") {
          unpaidIncomes += Math.max(0, invoiceGross(inv) - (inv.paidAmount || 0));
        }
      });
      dayExps.forEach((exp) => {
        if (exp.currency !== "PLN") return;
        totalExpenses += exp.totalGross || 0;
        if (exp.paymentStatus !== "paid") {
          unpaidExpenses += exp.totalGross || 0;
        }
      });
    });

    return {
      totalIncomes,
      totalExpenses,
      balance: totalIncomes - totalExpenses,
      unpaidIncomes,
      unpaidExpenses,
    };
  }, [monthItems]);

  // Obliczenie najbliższego terminu podatkowego
  const nextTaxDeadline = React.useMemo(() => {
    const today = new Date();
    if (!isCurrentMonth()) return null;
    const currentDay = today.getDate();
    const upcoming = taxEvents.filter((t) => t.day >= currentDay);
    if (upcoming.length === 0) return null;
    const next = upcoming[0];
    const diffDays = next.day - currentDay;
    return {
      title: next.title,
      day: next.day,
      diffDays,
    };
  }, [isCurrentMonth, taxEvents]);

  // Dane dla wybranego dnia
  const selectedDayData = selectedDay ? monthItems.get(selectedDay) : null;

  const filteredDayInvoices = (selectedDayData?.invoices || []).filter((inv) => {
    if (filterType === "expenses" || filterType === "taxes") return false;
    if (filterType === "unpaid") return inv.paymentStatus !== "paid" && inv.status !== "paid";
    return true;
  });

  const filteredDayExpenses = (selectedDayData?.expenses || []).filter((exp) => {
    if (filterType === "incomes" || filterType === "taxes") return false;
    if (filterType === "unpaid") return exp.paymentStatus !== "paid";
    return true;
  });

  const filteredDayTaxes = (selectedDayData?.taxes || []).filter(() => {
    if (filterType === "incomes" || filterType === "expenses" || filterType === "unpaid") return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {expensesError && <p role="alert" className="rounded-lg border border-rose-500/40 p-3 text-sm text-rose-400">Nie udało się wczytać kosztów. Odśwież stronę, aby ponowić próbę.</p>}
      <p className="text-xs text-muted-foreground">Podsumowanie obejmuje tylko PLN. Daty podatkowe są ogólne; obowiązki zależą od sposobu rozliczania firmy.</p>
      {/* Pasek podsumowania finansowego */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border border-border/70 bg-card/75 p-4.5 backdrop-blur-md rounded-2xl shadow-apple-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-apple-md">
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Planowane wpływy</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-emerald-400">
            <AnimatedCounter value={monthStats.totalIncomes} format={(v: number) => `+${formatMoney(v, "PLN")}`} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Do zapłaty przez klientów (PLN): <span className="font-semibold text-foreground">{formatMoney(monthStats.unpaidIncomes, "PLN")}</span>
          </p>
        </Card>

        <Card className="border border-border/70 bg-card/75 p-4.5 backdrop-blur-md rounded-2xl shadow-apple-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-apple-md">
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Planowane wydatki</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/20">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-rose-400">
            <AnimatedCounter value={monthStats.totalExpenses} format={(v: number) => `-${formatMoney(v, "PLN")}`} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pozostało do uregulowania (PLN): <span className="font-semibold text-foreground">{formatMoney(monthStats.unpaidExpenses, "PLN")}</span>
          </p>
        </Card>

        <Card className="border border-border/70 bg-card/75 p-4.5 backdrop-blur-md rounded-2xl shadow-apple-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-apple-md">
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Bilans miesiąca</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
              <Scale className="h-4 w-4" />
            </div>
          </div>
          <p className={cn(
            "text-2xl font-bold tracking-tight",
            monthStats.balance >= 0 ? "text-primary" : "text-amber-400"
          )}>
            <AnimatedCounter
              value={monthStats.balance}
              format={(v: number) => `${v >= 0 ? "+" : ""}${formatMoney(v, "PLN")}`}
            />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Różnica wpływów i kosztów w PLN
          </p>
        </Card>

        <Card className="border border-border/70 bg-card/75 p-4.5 backdrop-blur-md rounded-2xl shadow-apple-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-apple-md">
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Termin urzędowy</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
              <Landmark className="h-4 w-4" />
            </div>
          </div>
          {nextTaxDeadline ? (
            <div>
              <p className="text-lg font-bold tracking-tight text-indigo-400 truncate">
                {nextTaxDeadline.title}
              </p>
              <p className="mt-1 text-xs font-medium text-amber-300">
                {nextTaxDeadline.diffDays === 0
                  ? "Dzisiaj jest ostateczny termin!"
                  : nextTaxDeadline.diffDays === 1
                  ? "Jutro (ostatni dzień)!"
                  : `Termin za ${nextTaxDeadline.diffDays} dni (${nextTaxDeadline.day}. ${monthNames[month].toLowerCase()})`}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-lg font-bold tracking-tight text-muted-foreground">Brak w tym miesiącu</p>
              <p className="mt-1 text-xs text-muted-foreground">Wszystkie terminy zrealizowane</p>
            </div>
          )}
        </Card>
      </div>

      {/* Pasek sterowania kalendarza i filtry */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Nawigacja miesiąca */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-border/70 bg-card p-1 shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={prevMonth}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              title="Poprzedni miesiąc"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[140px] text-center font-semibold text-sm">
              {monthNames[month]} {year}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={nextMonth}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              title="Następny miesiąc"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            className="h-9 gap-1.5 text-xs font-medium border-border/70"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>Dzisiaj</span>
          </Button>
        </div>

        {/* Przyciski filtrów */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-muted-foreground hidden md:inline">Widok:</span>
          {[
            { id: "all", label: "Wszystko" },
            { id: "incomes", label: "Wpływy" },
            { id: "expenses", label: "Koszty" },
            { id: "taxes", label: "Podatki / ZUS" },
            { id: "unpaid", label: "Nieopłacone" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id as any)}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                filterType === f.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Główna siatka kalendarza + Panel szczegółów */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Siatka kalendarza (8 kolumn w LG) */}
        <Card className="border border-border/70 bg-card/75 p-4 lg:col-span-8 backdrop-blur-md rounded-2xl shadow-apple-sm">
          {/* Dni tygodnia */}
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-muted-foreground mb-2">
            {weekDays.map((w, idx) => (
              <div key={w} className={cn("py-1", idx >= 5 && "text-muted-foreground/60")}>
                {w}
              </div>
            ))}
          </div>

          {/* Dni miesiąca */}
          <div className="grid grid-cols-7 gap-1.5">
            {/* Puste pola przed pierwszym dniem */}
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="min-h-[88px] rounded-xl border border-transparent p-1.5 opacity-20 bg-muted/10"
              />
            ))}

            {/* Dni właściwe */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const isToday =
                isCurrentMonth() && dayNum === new Date().getDate();
              const isSelected = selectedDay === dayNum;
              const data = monthItems.get(dayNum);
              const dayInvoices = filterType === "unpaid" ? data?.invoices.filter((inv) => inv.paymentStatus !== "paid" && inv.status !== "paid") : data?.invoices;
              const dayExpenses = filterType === "unpaid" ? data?.expenses.filter((exp) => exp.paymentStatus !== "paid") : data?.expenses;
              const hasIncomes = (dayInvoices?.length || 0) > 0;
              const hasExpenses = (dayExpenses?.length || 0) > 0;
              const hasTaxes = (data?.taxes.length || 0) > 0;

              let dayIncomeTotal = 0;
              let dayExpenseTotal = 0;
              dayInvoices?.forEach((inv) => { if (inv.currency === "PLN") dayIncomeTotal += filterType === "unpaid" ? Math.max(0, invoiceGross(inv) - (inv.paidAmount || 0)) : invoiceGross(inv); });
              dayExpenses?.forEach((exp) => { if (exp.currency === "PLN") dayExpenseTotal += exp.totalGross || 0; });
              const hasOtherIncomeCurrency = dayInvoices?.some((inv) => inv.currency !== "PLN");
              const hasOtherExpenseCurrency = dayExpenses?.some((exp) => exp.currency !== "PLN");

              return (
                <button
                  key={`day-${dayNum}`}
                  onClick={() => setSelectedDay(dayNum)}
                  className={cn(
                    "group relative flex min-h-[92px] flex-col justify-between rounded-xl border p-2 text-left transition-all",
                    isSelected
                      ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                      : "border-border/40 bg-card/40 hover:border-border hover:bg-muted/30",
                    isToday && !isSelected && "border-indigo-500/50 bg-indigo-500/5"
                  )}
                >
                  {/* Nagłówek komórki: numer dnia + kropka dzisiejsza */}
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                        isToday
                          ? "bg-primary text-primary-foreground font-bold"
                          : isSelected
                          ? "text-primary font-bold"
                          : "text-foreground"
                      )}
                    >
                      {dayNum}
                    </span>

                    {/* Mini wskaźnik zdarzeń */}
                    <div className="flex items-center gap-1">
                      {hasTaxes && (
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" title="Termin urzędowy" />
                      )}
                      {hasIncomes && (
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Wpływ" />
                      )}
                      {hasExpenses && (
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-400" title="Wydatek" />
                      )}
                    </div>
                  </div>

                  {/* Zawartość dnia */}
                  <div className="mt-1.5 space-y-1 overflow-hidden">
                    {/* Urzędy */}
                    {hasTaxes && (filterType === "all" || filterType === "taxes") && (
                      <div className="truncate rounded px-1 py-0.5 text-[10px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {data?.taxes.map((tax) => tax.title).join(" · ")}
                      </div>
                    )}

                    {/* Wpływy */}
                    {hasIncomes && (filterType === "all" || filterType === "incomes" || filterType === "unpaid") && (
                      <div className="truncate rounded px-1 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-400">
                        {dayIncomeTotal ? `+${formatMoney(dayIncomeTotal, "PLN")}` : "Wpływ"}{hasOtherIncomeCurrency ? " + inne waluty" : ""}
                      </div>
                    )}

                    {/* Wydatki */}
                    {hasExpenses && (filterType === "all" || filterType === "expenses" || filterType === "unpaid") && (
                      <div className="truncate rounded px-1 py-0.5 text-[10px] font-semibold bg-rose-500/15 text-rose-400">
                        {dayExpenseTotal ? `-${formatMoney(dayExpenseTotal, "PLN")}` : "Wydatek"}{hasOtherExpenseCurrency ? " + inne waluty" : ""}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Panel boczny szczegółów dnia (4 kolumny w LG) */}
        <div className="lg:col-span-4">
          <Card className="h-full border border-border/70 bg-card/75 p-5 backdrop-blur-md shadow-apple-sm rounded-2xl flex flex-col justify-between">
            {selectedDay ? (
              <div className="space-y-4">
                {/* Tytuł wybranego dnia */}
                <div className="flex items-center justify-between border-b border-border/50 pb-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {selectedDay} {monthNames[month]} {year}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Szczegółowy wykaz operacji i terminów
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDay(null)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground lg:hidden"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Lista terminów urzędowych */}
                {filteredDayTaxes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <Landmark className="h-3.5 w-3.5" />
                      <span>Terminy ustawowe</span>
                    </p>
                    {filteredDayTaxes.map((tax) => (
                      <div
                        key={tax.id}
                        className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between font-semibold text-indigo-300">
                          <span>{tax.title}</span>
                          <Badge tone="outline" className="border-indigo-400/40 text-indigo-300 text-[10px]">
                            {tax.deadlineText}
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground text-[11px] leading-relaxed">
                          {tax.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Lista faktur przychodowych */}
                {filteredDayInvoices.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5" />
                      <span>Wpływy ze sprzedaży ({filteredDayInvoices.length})</span>
                    </p>
                    <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                      {filteredDayInvoices.map((inv) => (
                        <div
                          key={inv.id}
                          className="rounded-xl border border-border/50 bg-card p-3 text-xs transition-colors hover:border-border"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">{inv.number}</span>
                            <span className="font-bold text-emerald-400">
                              +{formatMoney(invoiceGross(inv), inv.currency || "PLN")}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            Klient: {contractors.find((c) => c.id === inv.contractorId)?.name || "Brak danych"}
                          </p>
                          <div className="mt-2 flex items-center justify-between">
                            <span className={cn(
                              "text-[10px] font-medium px-1.5 py-0.5 rounded",
                              inv.paymentStatus === "paid" || inv.status === "paid"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-amber-500/10 text-amber-400"
                            )}>
                              {inv.paymentStatus === "paid" || inv.status === "paid" ? "Opłacona" : "Do zapłaty"}
                            </span>
                            <Link
                              href={`/invoices/${inv.id}`}
                              className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1"
                            >
                              <span>Otwórz</span>
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lista wydatków / kosztów */}
                {filteredDayExpenses.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                      <TrendingDown className="h-3.5 w-3.5" />
                      <span>Wydatki i koszty ({filteredDayExpenses.length})</span>
                    </p>
                    <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                      {filteredDayExpenses.map((exp) => (
                        <div
                          key={exp.id}
                          className="rounded-xl border border-border/50 bg-card p-3 text-xs transition-colors hover:border-border"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">{exp.number}</span>
                            <span className="font-bold text-rose-400">
                              -{formatMoney(exp.totalGross, (exp.currency as any) || "PLN")}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            Dostawca: {exp.contractorName} ({exp.category})
                          </p>
                          <div className="mt-2 flex items-center justify-between">
                            <span className={cn(
                              "text-[10px] font-medium px-1.5 py-0.5 rounded",
                              exp.paymentStatus === "paid"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-rose-500/10 text-rose-400"
                            )}>
                              {exp.paymentStatus === "paid" ? "Opłacone" : "Do zapłaty"}
                            </span>
                            <Link
                              href="/expenses"
                              className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1"
                            >
                              <span>Wydatki</span>
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pusty stan dla dnia */}
                {filteredDayTaxes.length === 0 &&
                  filteredDayInvoices.length === 0 &&
                  filteredDayExpenses.length === 0 && (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-10 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground mb-2">
                        <CheckCircle2 className="h-5 w-5 text-muted-foreground/70" />
                      </div>
                      <p className="text-xs font-semibold text-foreground">Brak zaplanowanych płatności</p>
                      <p className="mt-1 text-[11px] text-muted-foreground max-w-[200px]">
                        Na dzień {selectedDay} {monthNames[month]} nie przypadają żadne terminy płatności ani urzędowe.
                      </p>
                    </div>
                  )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <CalendarIcon className="h-8 w-8 stroke-[1.5] mb-2 opacity-50" />
                <p className="text-sm font-medium">Wybierz dzień z kalendarza</p>
                <p className="text-xs text-muted-foreground/80 mt-0.5">
                  Kliknij w dowolny dzień, aby zobaczyć szczegóły wpływów, wydatków i terminów podatkowych.
                </p>
              </div>
            )}

            {/* Szybkie akcje na dole panelu */}
            <div className="border-t border-border/50 pt-4 mt-4 flex items-center gap-2">
              <Link href="/invoices/new" className="flex-1">
                <Button variant="outline" size="sm" className="w-full gap-1 text-xs border-border/60">
                  <Plus className="h-3.5 w-3.5" />
                  <span>Wystaw fakturę</span>
                </Button>
              </Link>
              <Link href="/expenses" className="flex-1">
                <Button variant="outline" size="sm" className="w-full gap-1 text-xs border-border/60">
                  <Receipt className="h-3.5 w-3.5" />
                  <span>Dodaj koszt</span>
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
