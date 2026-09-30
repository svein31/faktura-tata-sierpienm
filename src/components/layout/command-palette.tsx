"use client";

import * as React from "react";
import { lockBodyScroll } from "@/lib/overlay-scroll";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Search,
  LayoutDashboard,
  FileText,
  Users,
  Package,
  Plus,
  ArrowRight,
  ShieldCheck,
  Briefcase,
  FileCheck2,
  DollarSign,
  Receipt,
  Users2,
  Building2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertOctagon,
  Copy,
  Check,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAppStore, getContractor } from "@/lib/store";
import { useInvoiceSearch } from "@/lib/use-invoice-search";
import { formatDate, formatMoney, invoiceTotals } from "@/lib/format";

type SearchCategory = "all" | "invoices" | "contractors" | "actions" | "nav";

interface CommandItem {
  id: string;
  category: "Faktury" | "Kontrahenci" | "Szybkie akcje" | "Nawigacja" | "Produkty";
  categoryKey: SearchCategory;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: "success" | "warning" | "danger" | "info" | "neutral";
  amount?: string;
  date?: string;
  nip?: string;
  icon: LucideIcon;
  onSelect: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const { contractors, products } = useAppStore();
  const companyId = useAppStore(s => s.selectedCompanyId);

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const { invoices } = useInvoiceSearch({ companyId: companyId || "unassigned", search: query }, open);
  const [activeCategory, setActiveCategory] = React.useState<SearchCategory>("all");
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [visualBounds,setVisualBounds] = React.useState({top:0,height:0});
  const listRef = React.useRef<HTMLDivElement>(null);

  // Otwieranie na Ctrl+K / Cmd+K lub zdarzenie globalne
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };

    const handleCustomOpen = () => setOpen(true);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("open-command-palette", handleCustomOpen);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-command-palette", handleCustomOpen);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const unlock = lockBodyScroll();
    const update = () => setVisualBounds({top:window.visualViewport?.offsetTop || 0,height:window.visualViewport?.height || innerHeight});
    update();
    window.visualViewport?.addEventListener("resize",update);
    window.visualViewport?.addEventListener("scroll",update);
    setQuery(""); setActiveCategory("all"); setSelectedIndex(0);
    const timer = setTimeout(() => inputRef.current?.focus(),50);
    return () => {
      clearTimeout(timer); unlock();
      window.visualViewport?.removeEventListener("resize",update);
      window.visualViewport?.removeEventListener("scroll",update);
      if (previous?.isConnected) previous.focus({preventScroll:true});
    };
  },[open]);

  // Zbudowanie bazy przeszukiwalnych elementów
  const allItems: CommandItem[] = React.useMemo(() => {
    const list: CommandItem[] = [];

    // 1. SZYBKIE AKCJE
    list.push(
      {
        id: "act-new-invoice",
        category: "Szybkie akcje",
        categoryKey: "actions",
        title: "Wystaw nową fakturę VAT",
        subtitle: "Otwórz kreator faktury ze schematem KSeF FA(3)",
        icon: Plus,
        onSelect: () => {
          router.push("/invoices/new");
          setOpen(false);
        },
      },
      {
        id: "act-calendar",
        category: "Szybkie akcje",
        categoryKey: "actions",
        title: "Terminarz i kalendarz płatności",
        subtitle: "Nadchodzące należności, wydatki i terminy ZUS/VAT",
        icon: Calendar,
        onSelect: () => {
          router.push("/calendar");
          setOpen(false);
        },
      },
      {
        id: "act-new-offer",
        category: "Szybkie akcje",
        categoryKey: "actions",
        title: "Utwórz ofertę handlową",
        subtitle: "Wycena z pozycjami i 1-click konwersją do faktury",
        icon: FileCheck2,
        onSelect: () => {
          router.push("/offers");
          setOpen(false);
        },
      },
      {
        id: "act-new-expense",
        category: "Szybkie akcje",
        categoryKey: "actions",
        title: "Dodaj koszt / wydatek (FZ)",
        subtitle: "Faktura zakupowa, OCR, akceptacja księgowa",
        icon: Receipt,
        onSelect: () => {
          router.push("/expenses");
          setOpen(false);
        },
      },
      {
        id: "act-bank-import",
        category: "Szybkie akcje",
        categoryKey: "actions",
        title: "Import wyciągu bankowego CSV",
        subtitle: "Parowanie wpłat z fakturami",
        icon: DollarSign,
        onSelect: () => {
          router.push("/finances");
          setOpen(false);
        },
      },
      {
        id: "act-accountant-pack",
        category: "Szybkie akcje",
        categoryKey: "actions",
        title: "Paczka dla księgowej & JPK",
        subtitle: "Eksport ewidencji, deklaracje i JPK_V7",
        icon: Users2,
        onSelect: () => {
          router.push("/accountant");
          setOpen(false);
        },
      }
    );

    // 2. GŁÓWNA NAWIGACJA
    list.push(
      {
        id: "nav-dashboard",
        category: "Nawigacja",
        categoryKey: "nav",
        title: "Pulpit główny (Dashboard)",
        subtitle: "/dashboard — podsumowanie finansowe, KSeF i powiadomienia",
        icon: LayoutDashboard,
        onSelect: () => {
          router.push("/dashboard");
          setOpen(false);
        },
      },
      {
        id: "nav-invoices",
        category: "Nawigacja",
        categoryKey: "nav",
        title: "Lista faktur",
        subtitle: "/invoices — wszystkie dokumenty sprzedaży i zakupów",
        icon: FileText,
        onSelect: () => {
          router.push("/invoices");
          setOpen(false);
        },
      },
      {
        id: "nav-contractors",
        category: "Nawigacja",
        categoryKey: "nav",
        title: "Baza kontrahentów (CRM)",
        subtitle: "/contractors — kartoteki, scoring, limity kupieckie",
        icon: Users,
        onSelect: () => {
          router.push("/contractors");
          setOpen(false);
        },
      },
      {
        id: "nav-products",
        category: "Nawigacja",
        categoryKey: "nav",
        title: "Katalog produktów i usług",
        subtitle: "/products — stawki VAT, GTU, stany magazynowe",
        icon: Package,
        onSelect: () => {
          router.push("/products");
          setOpen(false);
        },
      },
      {
        id: "nav-ksef",
        category: "Nawigacja",
        categoryKey: "nav",
        title: "Centrum KSeF 2.0",
        subtitle: "/ksef — bramka MF, tokeny, certyfikaty i UPO",
        icon: ShieldCheck,
        onSelect: () => {
          router.push("/ksef");
          setOpen(false);
        },
      },
      {
        id: "nav-companies",
        category: "Nawigacja",
        categoryKey: "nav",
        title: "Moje Firmy / Spółki (Multi-firma)",
        subtitle: "/settings/companies — zarządzanie podmiotami i NIP",
        icon: Building2,
        onSelect: () => {
          router.push("/settings/companies");
          setOpen(false);
        },
      }
    );

    // 3. WSZYSTKIE FAKTURY (BEZ SZTUCZNEGO LIMITU!)
    for (const inv of invoices) {
      const contractor = getContractor(contractors, inv.contractorId);
      const totals = invoiceTotals(inv);
      const isPaid = inv.paymentStatus === "paid" || inv.status === "paid";
      const isKsefAccepted = inv.ksefStatus === "accepted" || Boolean(inv.ksefNumber);
      const isKsefRejected = inv.ksefStatus === "rejected";

      let badge = "Wystawiona";
      let badgeTone: CommandItem["badgeTone"] = "neutral";

      if (inv.isProforma) {
        badge = "Proforma";
        badgeTone = "info";
      } else if (isKsefAccepted) {
        badge = "KSeF OK";
        badgeTone = "success";
      } else if (isKsefRejected) {
        badge = "KSeF Błąd";
        badgeTone = "danger";
      } else if (isPaid) {
        badge = "Opłacona";
        badgeTone = "success";
      } else if (inv.dueDate && inv.dueDate < new Date().toISOString().slice(0, 10)) {
        badge = "Zaległa";
        badgeTone = "danger";
      }

      list.push({
        id: `inv-${inv.id}`,
        category: "Faktury",
        categoryKey: "invoices",
        title: `${inv.isProforma ? "Proforma " : inv.type === "purchase" ? "Zakup " : "Faktura "}${inv.number || "bez numeru"}`,
        subtitle: `${contractor?.name || "Kontrahent nieokreślony"}${contractor?.nip ? ` • NIP: ${contractor.nip}` : ""}`,
        badge,
        badgeTone,
        amount: formatMoney(inv.totalGross ?? totals.gross, inv.currency),
        date: formatDate(inv.issueDate),
        nip: contractor?.nip || "",
        icon: inv.type === "purchase" ? Receipt : FileText,
        onSelect: () => {
          router.push(`/invoices/${inv.id}`);
          setOpen(false);
        },
      });
    }

    // 4. WSZYSCY KONTRAHENCI (BEZ LIMITU!)
    for (const c of contractors) {
      const address = typeof c.address === "object" && c.address !== null ? (c.address as any) : {};
      const city = address.city ? ` • ${address.city}` : "";

      list.push({
        id: `cont-${c.id}`,
        category: "Kontrahenci",
        categoryKey: "contractors",
        title: c.name,
        subtitle: `NIP: ${c.nip}${city}${c.email ? ` • ${c.email}` : ""}`,
        badge: c.isVatPayer ? "VAT czynny" : "Zwolniony",
        badgeTone: c.isVatPayer ? "success" : "neutral",
        nip: c.nip,
        icon: Users,
        onSelect: () => {
          router.push(`/contractors`);
          setOpen(false);
        },
      });
    }

    // 5. PRODUKTY I USŁUGI
    for (const p of products) {
      list.push({
        id: `prod-${p.id}`,
        category: "Produkty",
        categoryKey: "all",
        title: p.name,
        subtitle: `${formatMoney(p.netPrice, "PLN")} netto / ${p.unit} • VAT ${p.vatRate}%`,
        amount: formatMoney(p.netPrice, "PLN"),
        icon: Package,
        onSelect: () => {
          router.push(`/products`);
          setOpen(false);
        },
      });
    }

    return list;
  }, [invoices, contractors, products, router]);

  // Filtrowanie po zapytaniu i wybranej kategorii
  const filtered = React.useMemo(() => {
    let result = allItems;

    if (activeCategory !== "all") {
      result = result.filter((item) => item.categoryKey === activeCategory);
    }

    if (!query.trim()) {
      // Domyślny widok: najpierw akcje, potem najnowsze faktury i kontrahenci
      return result.slice(0, 30);
    }

    const q = query.trim().toLowerCase();
    const cleanQ = q.replace(/[^0-9a-z]/gi, "");

    return result.filter((item) => {
      if (item.title.toLowerCase().includes(q)) return true;
      if (item.subtitle && item.subtitle.toLowerCase().includes(q)) return true;
      if (item.nip && cleanQ && item.nip.replace(/[^0-9]/g, "").includes(cleanQ)) return true;
      if (item.amount && item.amount.toLowerCase().includes(q)) return true;
      if (item.badge && item.badge.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [allItems, activeCategory, query]);

  // Reset wybranego indeksu przy zmianie wyników
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length, query, activeCategory]);

  // Obsługa klawiatury
  const handleKeyNavigation = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < filtered.length ? prev + 1 : 0));
      scrollSelectedIntoView((selectedIndex + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filtered.length - 1));
      scrollSelectedIntoView((selectedIndex - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].onSelect();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const categories: SearchCategory[] = ["all", "invoices", "contractors", "actions"];
      const nextIdx = (categories.indexOf(activeCategory) + (e.shiftKey ? -1 : 1) + categories.length) % categories.length;
      setActiveCategory(categories[nextIdx]);
    }
  };

  const scrollSelectedIntoView = (index: number) => {
    if (!listRef.current) return;
    const el = listRef.current.children[index] as HTMLElement | undefined;
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  };

  const copyNip = (e: React.MouseEvent, nip: string, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(nip);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const prefersReducedMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-x-0 z-[9999] flex items-start justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm"
          style={{top:visualBounds.top,height:visualBounds.height || "100dvh"}}
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Wyszukiwanie i polecenia"
            className="w-full min-w-0 max-w-2xl max-h-full rounded-2xl border border-border/70 bg-card/95 backdrop-blur-2xl shadow-apple-lg overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pasek Wyszukiwania */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/60 bg-muted/20">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyNavigation}
                placeholder="Szukaj faktury (numer, kwota), kontrahenta (NIP, nazwa), polecenia…"
                className="min-w-0 flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground/70"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                ESC
              </kbd>
            </div>

            {/* Zakładki / Filtry kategorii */}
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/50 bg-card/40 text-xs overflow-x-auto">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mr-1 hidden sm:inline">
                Filtr:
              </span>
              {[
                { key: "all", label: "Wszystko" },
                { key: "invoices", label: `Faktury (${invoices.length})` },
                { key: "contractors", label: `Kontrahenci (${contractors.length})` },
                { key: "actions", label: "Szybkie akcje" },
                { key: "nav", label: "Nawigacja" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveCategory(tab.key as SearchCategory)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    activeCategory === tab.key
                      ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Lista Wyników */}
            <div
              ref={listRef}
              className="min-h-0 max-h-[380px] flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-border/20"
            >
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Nie znaleziono wyników dla &bdquo;<strong className="text-foreground">{query}</strong>&rdquo;.
                  <p className="mt-1 text-[11px] text-muted-foreground/80">
                    Sprawdź numer faktury, fragment NIP lub nazwę kontrahenta.
                  </p>
                </div>
              ) : (
                filtered.map((item, idx) => {
                  const Icon = item.icon;
                  const isSelected = idx === selectedIndex;

                  return (
                    <div
                      key={item.id}
                      onClick={() => item.onSelect()}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${
                        isSelected
                          ? "bg-primary/10 border border-primary/25 shadow-2xs"
                          : "hover:bg-muted/40 border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                            isSelected
                              ? "bg-primary text-primary-foreground shadow-2xs"
                              : "bg-muted/60 text-muted-foreground border border-border/50"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-foreground truncate">
                              {item.title}
                            </span>
                            {item.badge && (
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${
                                  item.badgeTone === "success"
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                                    : item.badgeTone === "danger"
                                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25"
                                    : item.badgeTone === "info"
                                    ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25"
                                    : "bg-muted text-muted-foreground border-border/70"
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                            <span className="text-[10px] uppercase font-semibold text-muted-foreground/60 tracking-wider">
                              {item.category}
                            </span>
                          </div>

                          {item.subtitle && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Prawa strona: kwota, data, akcja */}
                      <div className="flex items-center gap-2 shrink-0">
                        {item.amount && (
                          <span className="text-xs font-bold text-foreground tabular-nums">
                            {item.amount}
                          </span>
                        )}

                        {item.nip && (
                          <button
                            type="button"
                            onClick={(e) => copyNip(e, item.nip!, item.id)}
                            title="Kopiuj NIP"
                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                          >
                            {copiedId === item.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}

                        {isSelected && (
                          <ArrowRight className="h-3.5 w-3.5 text-primary ml-1" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Stopka z podpowiedziami klawiatury */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-t border-border/60 bg-muted/20 text-[11px] text-muted-foreground">
              <div className="flex flex-wrap items-center gap-3">
                <span><kbd className="px-1 py-0.5 rounded bg-muted border text-[10px]">↑↓</kbd> Nawiguj</span>
                <span><kbd className="px-1 py-0.5 rounded bg-muted border text-[10px]">↵</kbd> Otwórz</span>
                <span><kbd className="px-1 py-0.5 rounded bg-muted border text-[10px]">Tab</kbd> Zmień filtr</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>FakturaProsto Global Search</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
