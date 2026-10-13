"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  TrendingUp,
  TrendingDown,
  Scale,
  CheckCircle2,
  Receipt,
  Landmark,
  ExternalLink,
  X,
  Plus,
} from "lucide-react";
import { useCompanyInvoices } from "@/lib/use-company-invoices";
import { useAppStore } from "@/lib/store";
import { formatMoney, invoiceTotals } from "@/lib/format";
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
  const calendarGridRef = React.useRef<HTMLDivElement>(null);

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

  const handleDayKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, day: number) => {
    const dayOfWeek = (firstDayIndex + day - 1) % 7;
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -dayOfWeek,
      End: 6 - dayOfWeek,
    };
    if (!(event.key in offsets)) return;
    event.preventDefault();
    const nextDay = Math.max(1, Math.min(daysInMonth, day + offsets[event.key]));
    setSelectedDay(nextDay);
    calendarGridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${nextDay}"]`)?.focus();
  };

  return (
    <div className="space-y-6">
      {expensesError && <p role="alert" className="rounded-xl border border-rose-500/25 bg-rose-500/5 px-4 py-3 text-sm leading-relaxed text-finance-expense">Nie udało się wczytać kosztów. Odśwież stronę, aby ponowić próbę.</p>}
      <p className="max-w-3xl text-[13px] leading-relaxed text-muted-foreground">Podsumowanie obejmuje tylko PLN. Daty podatkowe są ogólne; obowiązki zależą od sposobu rozliczania firmy.</p>
      {/* Pasek podsumowania finansowego */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card data-tone="income" className="surface-card-hover @container min-w-0 p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3 text-muted-foreground">
            <span className="pt-1 text-xs font-semibold uppercase leading-relaxed tracking-[0.08em]">Planowane wpływy</span>
            <div className="finance-icon">
              <TrendingUp className="h-[18px] w-[18px]" aria-hidden="true" />
            </div>
          </div>
          <p className="text-[clamp(1.25rem,11cqi,1.625rem)] font-semibold leading-tight tracking-tight tabular-nums text-finance-income">
            <AnimatedCounter value={monthStats.totalIncomes} format={(v: number) => `+${formatMoney(v, "PLN").replace(/[\u00a0\u202f]/g, " ")}`} />
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Do zapłaty przez klientów (PLN): <span className="font-medium tabular-nums text-foreground">{formatMoney(monthStats.unpaidIncomes, "PLN")}</span>
          </p>
        </Card>

        <Card data-tone="expense" className="surface-card-hover @container min-w-0 p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3 text-muted-foreground">
            <span className="pt-1 text-xs font-semibold uppercase leading-relaxed tracking-[0.08em]">Planowane wydatki</span>
            <div className="finance-icon">
              <TrendingDown className="h-[18px] w-[18px]" aria-hidden="true" />
            </div>
          </div>
          <p className="text-[clamp(1.25rem,11cqi,1.625rem)] font-semibold leading-tight tracking-tight tabular-nums text-finance-expense">
            <AnimatedCounter value={monthStats.totalExpenses} format={(v: number) => `-${formatMoney(v, "PLN").replace(/[\u00a0\u202f]/g, " ")}`} />
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Pozostało do uregulowania (PLN): <span className="font-medium tabular-nums text-foreground">{formatMoney(monthStats.unpaidExpenses, "PLN")}</span>
          </p>
        </Card>

        <Card data-tone="balance" className="surface-card-hover @container min-w-0 p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3 text-muted-foreground">
            <span className="pt-1 text-xs font-semibold uppercase leading-relaxed tracking-[0.08em]">Bilans miesiąca</span>
            <div className="finance-icon">
              <Scale className="h-[18px] w-[18px]" aria-hidden="true" />
            </div>
          </div>
          <p className="text-[clamp(1.25rem,11cqi,1.625rem)] font-semibold leading-tight tracking-tight tabular-nums text-finance-balance">
            <AnimatedCounter
              value={monthStats.balance}
              format={(v: number) => `${v >= 0 ? "+" : ""}${formatMoney(v, "PLN").replace(/[\u00a0\u202f]/g, " ")}`}
            />
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Różnica wpływów i kosztów w PLN
          </p>
        </Card>

        <Card data-tone="office" className="surface-card-hover min-w-0 p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3 text-muted-foreground">
            <span className="pt-1 text-xs font-semibold uppercase leading-relaxed tracking-[0.08em]">Termin urzędowy</span>
            <div className="finance-icon">
              <Landmark className="h-[18px] w-[18px]" aria-hidden="true" />
            </div>
          </div>
          {nextTaxDeadline ? (
            <div>
              <p className="text-lg font-semibold leading-snug tracking-tight text-finance-office">
                {nextTaxDeadline.title}
              </p>
              <p className="mt-2 text-xs font-medium leading-relaxed text-finance-warning">
                {nextTaxDeadline.diffDays === 0
                  ? "Dzisiaj jest ostateczny termin!"
                  : nextTaxDeadline.diffDays === 1
                  ? "Jutro (ostatni dzień)!"
                  : `Termin za ${nextTaxDeadline.diffDays} dni (${nextTaxDeadline.day}. ${monthNames[month].toLowerCase()})`}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-lg font-semibold leading-snug tracking-tight text-muted-foreground">Brak w tym miesiącu</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Wszystkie terminy zrealizowane</p>
            </div>
          )}
        </Card>
      </div>

      {/* Pasek sterowania kalendarza i filtry */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        {/* Nawigacja miesiąca */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-border/60 bg-card/70 p-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={prevMonth}
              className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
              title="Poprzedni miesiąc"
              aria-label="Poprzedni miesiąc"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div aria-live="polite" className="min-w-[112px] px-2 text-center text-xs font-semibold tabular-nums sm:min-w-[140px] sm:text-sm">
              {monthNames[month]} {year}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={nextMonth}
              className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
              title="Następny miesiąc"
              aria-label="Następny miesiąc"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            className="h-10 gap-1.5 border-border/60 text-[13px] font-medium"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>Dzisiaj</span>
          </Button>
        </div>

        {/* Przyciski filtrów */}
        <div role="group" aria-label="Filtr płatności w kalendarzu" className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 hidden text-xs font-medium text-muted-foreground md:inline">Widok:</span>
          {[
            { id: "all", label: "Wszystko" },
            { id: "incomes", label: "Wpływy" },
            { id: "expenses", label: "Koszty" },
            { id: "taxes", label: "Podatki / ZUS" },
            { id: "unpaid", label: "Nieopłacone" },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterType(f.id as any)}
              aria-pressed={filterType === f.id}
              className={cn(
                "min-h-10 rounded-lg border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
                filterType === f.id
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : "border-border/40 bg-card/60 text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Główna siatka kalendarza + Panel szczegółów */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        {/* Siatka kalendarza (8 kolumn w LG) */}
        <Card className="min-w-0 p-3 sm:p-5 xl:col-span-8" aria-label={`Kalendarz: ${monthNames[month]} ${year}`} aria-busy={loadingExpenses}>
          {/* Dni tygodnia */}
          <div className="mb-3 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground sm:gap-1.5">
            {weekDays.map((w, idx) => (
              <div key={w} className={cn("py-1", idx >= 5 && "text-muted-foreground")}>
                {w}
              </div>
            ))}
          </div>

          {/* Dni miesiąca */}
          <div ref={calendarGridRef} className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {/* Puste pola przed pierwszym dniem */}
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="min-h-[84px] rounded-lg bg-muted/15 sm:min-h-[104px] sm:rounded-xl"
                aria-hidden="true"
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
                  type="button"
                  data-day={dayNum}
                  onClick={() => setSelectedDay(dayNum)}
                  onKeyDown={(event) => handleDayKeyDown(event, dayNum)}
                  aria-pressed={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={`${dayNum} ${monthNames[month]} ${year}${isToday ? ", dzisiaj" : ""}, wpływy: ${dayInvoices?.length || 0}, wydatki: ${dayExpenses?.length || 0}, terminy urzędowe: ${data?.taxes.length || 0}`}
                  className={cn(
                    "group relative flex !min-h-[84px] !min-w-0 flex-col justify-between rounded-lg border p-1 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none sm:!min-h-[104px] sm:rounded-xl sm:p-2",
                    isSelected
                      ? "border-primary/60 bg-primary/10 ring-1 ring-inset ring-primary/15"
                      : "border-border/40 bg-muted/10 hover:border-border/80 hover:bg-muted/40",
                    isToday && !isSelected && "border-blue-500/45 bg-blue-500/5"
                  )}
                >
                  {/* Nagłówek komórki: numer dnia + kropka dzisiejsza */}
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold sm:h-6 sm:w-6",
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
                    <div className="flex flex-wrap justify-end gap-0.5 sm:gap-1" aria-hidden="true">
                      {hasTaxes && (
                        <span className="h-1 w-1 rounded-full bg-[hsl(var(--finance-office))] sm:h-1.5 sm:w-1.5" title="Termin urzędowy" />
                      )}
                      {hasIncomes && (
                        <span className="h-1 w-1 rounded-full bg-[hsl(var(--finance-income))] sm:h-1.5 sm:w-1.5" title="Wpływ" />
                      )}
                      {hasExpenses && (
                        <span className="h-1 w-1 rounded-full bg-[hsl(var(--finance-expense))] sm:h-1.5 sm:w-1.5" title="Wydatek" />
                      )}
                    </div>
                  </div>

                  {/* Zawartość dnia */}
                  <div className="mt-1.5 space-y-1 overflow-hidden">
                    {/* Urzędy */}
                    {hasTaxes && (filterType === "all" || filterType === "taxes") && (
                      <div className="truncate rounded border border-blue-500/20 bg-blue-500/10 px-1 py-0.5 text-[10px] font-medium text-finance-office sm:text-[11px]">
                        {data?.taxes.map((tax) => tax.title).join(" · ")}
                      </div>
                    )}

                    {/* Wpływy */}
                    {hasIncomes && (filterType === "all" || filterType === "incomes" || filterType === "unpaid") && (
                      <div className="truncate rounded bg-emerald-500/10 px-1 py-0.5 text-[10px] font-medium tabular-nums text-finance-income sm:text-[11px]">
                        {dayIncomeTotal ? `+${formatMoney(dayIncomeTotal, "PLN")}` : "Wpływ"}{hasOtherIncomeCurrency ? " + inne waluty" : ""}
                      </div>
                    )}

                    {/* Wydatki */}
                    {hasExpenses && (filterType === "all" || filterType === "expenses" || filterType === "unpaid") && (
                      <div className="truncate rounded bg-rose-500/10 px-1 py-0.5 text-[10px] font-medium tabular-nums text-finance-expense sm:text-[11px]">
                        {dayExpenseTotal ? `-${formatMoney(dayExpenseTotal, "PLN")}` : "Wydatek"}{hasOtherExpenseCurrency ? " + inne waluty" : ""}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/40 pt-4 text-xs text-muted-foreground" aria-label="Legenda kalendarza">
            <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--finance-income))]" aria-hidden="true" />Wpływy</span>
            <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--finance-expense))]" aria-hidden="true" />Wydatki</span>
            <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--finance-office))]" aria-hidden="true" />Podatki i ZUS</span>
          </div>
        </Card>

        {/* Panel boczny szczegółów dnia (4 kolumny w LG) */}
        <div className="min-w-0 xl:col-span-4">
          <Card className="flex flex-col p-5 sm:p-6">
            {selectedDay ? (
              <div className="space-y-5">
                {/* Tytuł wybranego dnia */}
                <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-4">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-foreground">
                      {selectedDay} {monthNames[month]} {year}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Szczegółowy wykaz operacji i terminów
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDay(null)}
                    aria-label="Zamknij szczegóły dnia"
                    className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground xl:hidden"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Lista terminów urzędowych */}
                {filteredDayTaxes.length > 0 && (
                  <div className="space-y-2">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase leading-relaxed tracking-[0.06em] text-finance-office">
                      <Landmark className="h-3.5 w-3.5" />
                      <span>Terminy ustawowe</span>
                    </p>
                    {filteredDayTaxes.map((tax) => (
                      <div
                        key={tax.id}
                        className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-3.5 text-[13px]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2 font-medium leading-snug text-finance-office">
                          <span>{tax.title}</span>
                          <Badge tone="outline" className="max-w-full whitespace-normal border-blue-500/25 text-xs leading-relaxed text-finance-office">
                            {tax.deadlineText}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          {tax.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Lista faktur przychodowych */}
                {filteredDayInvoices.length > 0 && (
                  <div className="space-y-2">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase leading-relaxed tracking-[0.06em] text-finance-income">
                      <TrendingUp className="h-3.5 w-3.5" />
                      <span>Wpływy ze sprzedaży ({filteredDayInvoices.length})</span>
                    </p>
                    <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                      {filteredDayInvoices.map((inv) => (
                        <div
                          key={inv.id}
                          className="rounded-xl border border-border/45 bg-muted/10 p-3.5 text-[13px]"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <span className="break-all font-medium text-foreground">{inv.number}</span>
                            <span className="break-words font-semibold tabular-nums text-finance-income">
                              +{formatMoney(invoiceGross(inv), inv.currency || "PLN")}
                            </span>
                          </div>
                          <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                            Klient: {contractors.find((c) => c.id === inv.contractorId)?.name || "Brak danych"}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <span className={cn(
                              "rounded-md px-2 py-1 text-xs font-medium",
                              inv.paymentStatus === "paid" || inv.status === "paid"
                                ? "bg-emerald-500/10 text-finance-income"
                                : "bg-amber-500/10 text-finance-warning"
                            )}>
                              {inv.paymentStatus === "paid" || inv.status === "paid" ? "Opłacona" : "Do zapłaty"}
                            </span>
                            <Link prefetch={false}
                              href={`/invoices/${inv.id}`}
                              aria-label={`Otwórz fakturę ${inv.number}`}
                              className="inline-flex min-h-8 items-center gap-1.5 rounded-sm text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase leading-relaxed tracking-[0.06em] text-finance-expense">
                      <TrendingDown className="h-3.5 w-3.5" />
                      <span>Wydatki i koszty ({filteredDayExpenses.length})</span>
                    </p>
                    <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                      {filteredDayExpenses.map((exp) => (
                        <div
                          key={exp.id}
                          className="rounded-xl border border-border/45 bg-muted/10 p-3.5 text-[13px]"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <span className="break-all font-medium text-foreground">{exp.number}</span>
                            <span className="break-words font-semibold tabular-nums text-finance-expense">
                              -{formatMoney(exp.totalGross, (exp.currency as any) || "PLN")}
                            </span>
                          </div>
                          <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                            Dostawca: {exp.contractorName} ({exp.category})
                          </p>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <span className={cn(
                              "rounded-md px-2 py-1 text-xs font-medium",
                              exp.paymentStatus === "paid"
                                ? "bg-emerald-500/10 text-finance-income"
                                : "bg-rose-500/10 text-finance-expense"
                            )}>
                              {exp.paymentStatus === "paid" ? "Opłacone" : "Do zapłaty"}
                            </span>
                            <Link prefetch={false}
                              href="/expenses"
                              className="inline-flex min-h-8 items-center gap-1.5 rounded-sm text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 px-4 py-10 text-center">
                      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <p className="text-[13px] font-medium text-foreground">Brak zaplanowanych płatności</p>
                      <p className="mt-2 max-w-[240px] text-xs leading-relaxed text-muted-foreground">
                        Na dzień {selectedDay} {monthNames[month]} nie przypadają żadne terminy płatności ani urzędowe.
                      </p>
                    </div>
                  )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <CalendarIcon className="mb-3 h-8 w-8 stroke-[1.5]" />
                <p className="text-sm font-medium">Wybierz dzień z kalendarza</p>
                <p className="mt-2 max-w-[260px] text-xs leading-relaxed text-muted-foreground">
                  Kliknij w dowolny dzień, aby zobaczyć szczegóły wpływów, wydatków i terminów podatkowych.
                </p>
              </div>
            )}

            {/* Szybkie akcje na dole panelu */}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/40 pt-4">
              <Link prefetch={false} href="/invoices/new" onClick={() => useAppStore.getState().setDraft(null, true)} className="inline-flex min-h-11 min-w-[128px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-2 text-center text-xs font-medium transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Plus className="h-3.5 w-3.5" />
                  <span>Wystaw fakturę</span>
              </Link>
              <Link prefetch={false} href="/expenses" className="inline-flex min-h-11 min-w-[128px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-2 text-center text-xs font-medium transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Receipt className="h-3.5 w-3.5" />
                  <span>Dodaj koszt</span>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
