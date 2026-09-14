"use client";
import { useCompanyInvoices } from "@/lib/use-company-invoices";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
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
  X,
  type LucideIcon,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { formatMoney } from "@/lib/format";

interface CommandAction {
  id: string;
  category: "Nawigacja" | "Szybkie akcje" | "Faktury" | "Kontrahenci" | "Produkty";
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  onSelect: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const { contractors, products } = useAppStore();
  const invoices = useCompanyInvoices();

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

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

  // Focus po otwarciu
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Zbudowanie listy dostępnych elementów
  const actions: CommandAction[] = React.useMemo(() => {
    const list: CommandAction[] = [
      // Szybkie akcje
      {
        id: "act-new-invoice",
        category: "Szybkie akcje",
        title: "Wystaw nową fakturę",
        subtitle: "Przejdź do kreatora faktury VAT lub Proformy",
        icon: Plus,
        onSelect: () => {
          router.push("/invoices/new");
          setOpen(false);
        },
      },
      {
        id: "act-new-offer",
        category: "Szybkie akcje",
        title: "Utwórz ofertę handlową",
        subtitle: "Wycena z pozycjami i 1-click konwersją",
        icon: FileCheck2,
        onSelect: () => {
          router.push("/offers");
          setOpen(false);
        },
      },
      {
        id: "act-new-order",
        category: "Szybkie akcje",
        title: "Dodaj zlecenie / projekt",
        subtitle: "Kanban zleceń, etapy i licznik czasu pracy",
        icon: Briefcase,
        onSelect: () => {
          router.push("/orders");
          setOpen(false);
        },
      },
      {
        id: "act-new-expense",
        category: "Szybkie akcje",
        title: "Zarejestruj koszt / wydatek",
        subtitle: "Faktura kosztowa, paragon, opis dla księgowości",
        icon: Receipt,
        onSelect: () => {
          router.push("/expenses");
          setOpen(false);
        },
      },
      {
        id: "act-import-bank",
        category: "Szybkie akcje",
        title: "Import wyciągu bankowego CSV",
        subtitle: "Automatyczne parowanie wpłat mBank, ING, PKO, Santander",
        icon: DollarSign,
        onSelect: () => {
          router.push("/finances");
          setOpen(false);
        },
      },
      {
        id: "act-accountant-pack",
        category: "Szybkie akcje",
        title: "Paczka dla biura rachunkowego & Zespół",
        subtitle: "Miesięczny bilans VAT i dochodu, darmowe zaproszenia",
        icon: Users2,
        onSelect: () => {
          router.push("/accountant");
          setOpen(false);
        },
      },
      // Główne moduły
      {
        id: "nav-invoices",
        category: "Nawigacja",
        title: "Lista faktur",
        subtitle: "/invoices",
        icon: FileText,
        onSelect: () => {
          router.push("/invoices");
          setOpen(false);
        },
      },
      {
        id: "nav-contractors",
        category: "Nawigacja",
        title: "Baza kontrahentów",
        subtitle: "/contractors",
        icon: Users,
        onSelect: () => {
          router.push("/contractors");
          setOpen(false);
        },
      },
      {
        id: "nav-products",
        category: "Nawigacja",
        title: "Katalog produktów i usług",
        subtitle: "/products",
        icon: Package,
        onSelect: () => {
          router.push("/products");
          setOpen(false);
        },
      },
      {
        id: "nav-ksef",
        category: "Nawigacja",
        title: "Centrum KSeF",
        subtitle: "Wysyłka, pobieranie z KSeF, tokeny i UPO",
        icon: ShieldCheck,
        onSelect: () => {
          router.push("/ksef");
          setOpen(false);
        },
      },
      {
        id: "nav-companies",
        category: "Nawigacja",
        title: "Moje Firmy / NIP",
        subtitle: "/settings/companies",
        icon: Building2,
        onSelect: () => {
          router.push("/settings/companies");
          setOpen(false);
        },
      },
    ];

    // Ostatnie faktury
    invoices.slice(0, 8).forEach((inv) => {
      const contractor = contractors.find((c) => c.id === inv.contractorId);
      list.push({
        id: `inv-${inv.id}`,
        category: "Faktury",
        title: `${inv.isProforma ? "Proforma " : "Faktura "}${inv.number}`,
        subtitle: `${contractor?.name || "Kontrahent"} • ${formatMoney(inv.totalGross || 0, inv.currency)}`,
        icon: FileText,
        onSelect: () => {
          router.push(`/invoices/${inv.id}`);
          setOpen(false);
        },
      });
    });

    // Kontrahenci
    contractors.slice(0, 6).forEach((c) => {
      list.push({
        id: `cont-${c.id}`,
        category: "Kontrahenci",
        title: c.name,
        subtitle: `NIP: ${c.nip} • ${c.email || ""}`,
        icon: Users,
        onSelect: () => {
          router.push(`/contractors`);
          setOpen(false);
        },
      });
    });

    // Produkty
    products.slice(0, 6).forEach((p) => {
      list.push({
        id: `prod-${p.id}`,
        category: "Produkty",
        title: p.name,
        subtitle: `${formatMoney(p.netPrice, "PLN")} netto / ${p.unit}`,
        icon: Package,
        onSelect: () => {
          router.push(`/products`);
          setOpen(false);
        },
      });
    });

    return list;
  }, [invoices, contractors, products, router]);

  // Filtrowanie po wpisanej frazie
  const filtered = React.useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    return actions.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.subtitle && a.subtitle.toLowerCase().includes(q)) ||
        a.category.toLowerCase().includes(q)
    );
  }, [actions, query]);

  // Obsługa klawiatury
  const handleKeyNavigation = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < filtered.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].onSelect();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "12vh",
            paddingLeft: "1rem",
            paddingRight: "1rem",
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(6px)",
          }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.15 }}
            style={{
              width: "100%",
              maxWidth: "600px",
              background: "var(--card)",
              borderRadius: "14px",
              border: "1px solid var(--border)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pole wyszukiwania */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0.85rem 1.15rem",
                borderBottom: "1px solid var(--border)",
                gap: "0.75rem",
              }}
            >
              <Search size={18} style={{ color: "var(--muted)" }} />
              <input
                ref={inputRef}
                type="text"
                placeholder="Szukaj faktury, kontrahenta, usługi lub wpisz polecenie..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyNavigation}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: "0.9375rem",
                  color: "var(--foreground)",
                }}
              />
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--muted)",
                  background: "var(--surface-sunken)",
                  padding: "0.2rem 0.45rem",
                  borderRadius: "4px",
                  fontWeight: 600,
                }}
              >
                ESC
              </span>
            </div>

            {/* Wyniki */}
            <div
              style={{
                maxHeight: "380px",
                overflowY: "auto",
                padding: "0.5rem",
              }}
            >
              {filtered.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)", fontSize: "0.875rem" }}>
                  Brak wyników dla frazy &bdquo;{query}&rdquo;
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
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.65rem 0.85rem",
                        borderRadius: "8px",
                        cursor: "pointer",
                        background: isSelected ? "var(--surface-sunken)" : "transparent",
                        transition: "background 0.1s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                        <div
                          style={{
                            padding: "0.4rem",
                            borderRadius: "6px",
                            background: isSelected ? "var(--primary)" : "var(--surface-sunken)",
                            color: isSelected ? "#ffffff" : "var(--foreground)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Icon size={16} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: "0.875rem",
                              fontWeight: 600,
                              color: "var(--foreground)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {item.title}
                          </div>
                          {item.subtitle && (
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: "var(--muted)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {item.subtitle}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span
                          style={{
                            fontSize: "0.6875rem",
                            color: "var(--muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {item.category}
                        </span>
                        {isSelected && <ArrowRight size={14} color="var(--primary)" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Stopka */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.5rem 1rem",
                borderTop: "1px solid var(--border)",
                fontSize: "0.75rem",
                color: "var(--muted)",
                background: "var(--surface-sunken)",
              }}
            >
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <span>↑↓ Wybierz</span>
                <span>↵ Przejdź</span>
              </div>
              <div>Fakturo • Szybka nawigacja</div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
