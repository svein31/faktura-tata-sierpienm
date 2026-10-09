"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  FileText,
  Copy,
  Check,
  Printer,
  Calendar,
  CreditCard,
  Building2,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { formatDate, formatMoney } from "@/lib/format";
import type { Invoice, Offer, InvoiceLine, OfferLine, Currency } from "@/lib/types";

interface PartyInfo {
  name: string;
  nip: string;
  street: string;
  city: string;
  postal: string;
  iban?: string;
  bankName?: string;
}

export default function PortalDocumentPage() {
  const params = useParams();
  const token = params?.token as string;

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [docType, setDocType] = React.useState<"invoice" | "offer" | null>(null);
  const [invoice, setInvoice] = React.useState<Invoice | null>(null);
  const [offer, setOffer] = React.useState<Offer | null>(null);
  const [seller, setSeller] = React.useState<PartyInfo | null>(null);
  const [buyer, setBuyer] = React.useState<PartyInfo | null>(null);

  const [decisionName, setDecisionName] = React.useState("");
  const [decisionNote, setDecisionNote] = React.useState("");
  const [decisionBusy, setDecisionBusy] = React.useState(false);
  const [decisionMessage, setDecisionMessage] = React.useState("");
  const decide = async (decision: "accepted" | "rejected") => {
    if (!offer || decisionBusy) return;
    setDecisionBusy(true); setDecisionMessage("");
    try {
      const res = await fetch(`/api/portal/${token}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, version: offer.version, name: decisionName, note: decisionNote }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Nie udało się zapisać decyzji.");
      setOffer(data.offer); setDecisionMessage("Decyzja została zapisana.");
    } catch (e) { setDecisionMessage(e instanceof Error ? e.message : "Błąd zapisu decyzji."); }
    finally { setDecisionBusy(false); }
  };
  // Kopiowanie
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  // Deklaracja płatności
  const [declareOpen, setDeclareOpen] = React.useState(false);
  const [declaredDate, setDeclaredDate] = React.useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [declaredNote, setDeclaredNote] = React.useState("");
  const [declaring, setDeclaring] = React.useState(false);
  const [declaredSuccess, setDeclaredSuccess] = React.useState(false);

  React.useEffect(() => {
    if (!token) return;
    async function loadDoc() {
      try {
        setLoading(true);
        const res = await fetch(`/api/portal/${token}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Dokument nie został odnaleziony.");
        }
        const data = await res.json();
        setDocType(data.type);
        if (data.type === "invoice") {
          setInvoice(data.document);
        } else if (data.type === "offer") {
          setOffer(data.document);
        }
        setSeller(data.seller || null);
        setBuyer(data.buyer || null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Błąd ładowania dokumentu");
      } finally {
        setLoading(false);
      }
    }
    loadDoc();
  }, [token]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDeclarePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!declaredDate) return;
    try {
      setDeclaring(true);
      const res = await fetch(`/api/portal/${token}/declare-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          declaredDate,
          note: declaredNote,
        }),
      });
      if (!res.ok) throw new Error("Błąd zapisu deklaracji");
      setDeclaredSuccess(true);
      setDeclareOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Błąd zapisu");
    } finally {
      setDeclaring(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
        <div style={{ textAlign: "center", color: "#64748b" }}>
          <Clock size={32} style={{ animation: "spin 1s linear infinite", margin: "0 auto 1rem" }} />
          <p>Ładowanie dokumentu...</p>
        </div>
      </div>
    );
  }

  if (error || (!invoice && !offer)) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", padding: "1rem" }}>
        <div style={{ maxWidth: "420px", textAlign: "center", background: "#ffffff", padding: "2.5rem", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
          <AlertCircle size={48} color="#ef4444" style={{ margin: "0 auto 1rem" }} />
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginBottom: "0.5rem" }}>Nie znaleziono dokumentu</h2>
          <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            {error || "Link do dokumentu może być nieprawidłowy lub dokument został usunięty."}
          </p>
        </div>
      </div>
    );
  }

  // Dane dokumentu
  const isInvoice = docType === "invoice" && invoice;
  const docNumber = isInvoice ? invoice.number : offer?.number;
  const docTitle = isInvoice
    ? (invoice.isProforma ? "Faktura Proforma" : "Faktura VAT")
    : "Oferta handlowa";
  const issueDate = isInvoice ? invoice.issueDate : offer?.issueDate;
  const dueDate = isInvoice ? invoice.dueDate : offer?.validUntil;
  const totalGross = (isInvoice ? invoice.totalGross : offer?.totalGross) || 0;
  const totalNet = (isInvoice ? invoice.totalNet : offer?.totalNet) || 0;
  const totalVat = (isInvoice ? invoice.totalVat : offer?.totalVat) || 0;
  const currency: Currency = (isInvoice ? invoice.currency : offer?.currency) || "PLN";
  const lines: (InvoiceLine | OfferLine)[] = isInvoice ? (invoice.lines || []) : (offer?.lines || []);

  const paymentStatus = isInvoice ? invoice.paymentStatus : undefined;
  const bankAccount = seller?.iban;
  const bankName = seller?.bankName;

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "2rem 1rem", fontFamily: "system-ui, -apple-system, sans-serif", overflowWrap: "anywhere" }}>
      <div style={{ minWidth: 0, maxWidth: "860px", margin: "0 auto" }}>
        
        {offer && <section className="no-print" style={{ background: "white", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h2 style={{ fontWeight: 700 }}>Decyzja dotycząca oferty · wersja {offer.version}</h2>
          {offer.status === "sent" ? <>
            <p style={{ fontSize: 14 }}>Sprawdź dokument przed podjęciem decyzji. Akceptacja dotyczy przedstawionej wersji oferty.</p>
            <label style={{ display: "block", marginTop: 12 }}>Imię i nazwisko<input style={{ display: "block", border: "1px solid #cbd5e1", padding: 8, width: "100%" }} maxLength={120} value={decisionName} onChange={e => setDecisionName(e.target.value)} /></label>
            <label style={{ display: "block", marginTop: 12 }}>Uwagi<textarea style={{ display: "block", border: "1px solid #cbd5e1", padding: 8, width: "100%" }} maxLength={2000} value={decisionNote} onChange={e => setDecisionNote(e.target.value)} /></label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}><button disabled={decisionBusy || !decisionName.trim()} onClick={() => decide("accepted")} style={{ background: "#065f46", color: "white", borderRadius: 8, padding: "10px 16px" }}>Akceptuję ofertę</button><button disabled={decisionBusy || !decisionName.trim()} onClick={() => decide("rejected")} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "10px 16px" }}>Odrzucam ofertę</button></div>
          </> : <p>{offer.status === "accepted" ? "Oferta zaakceptowana" : offer.status === "rejected" ? "Oferta odrzucona" : "Oferta przekazana do realizacji"}</p>}
          <p role="status">{decisionMessage}</p>
        </section>}
        {/* Pasek akcji u góry */}
        <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <span style={{ fontSize: "0.8125rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
              Portal Kontrahenta • FakturaProsto
            </span>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0f172a" }}>
              {docTitle} {docNumber}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <button
              onClick={() => window.print()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#1e293b",
                fontWeight: 500,
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              <Printer size={16} />
              Drukuj / Pobierz PDF
            </button>
            {isInvoice && paymentStatus !== "paid" && (
              <button
                onClick={() => setDeclareOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.5rem 1rem",
                  borderRadius: "6px",
                  border: "none",
                  background: "#0369a1",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                <Calendar size={16} />
                Zgłoś termin płatności
              </button>
            )}
          </div>
        </div>

        {declaredSuccess && (
          <div style={{ background: "#ecfdf5", border: "1px solid #10b981", borderRadius: "8px", padding: "1rem", marginBottom: "1.5rem", color: "#065f46", fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <CheckCircle2 size={18} />
            Dziękujemy! Pomyślnie zadeklarowano termin płatności. Wystawca został poinformowany.
          </div>
        )}

        {/* Szybkie kopiowanie danych do przelewu */}
        {isInvoice && bankAccount && paymentStatus !== "paid" && (
          <div className="no-print" style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "1.25rem", marginBottom: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1e293b", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <CreditCard size={18} color="#0284c7" />
              Szybkie dane do przelewu bankowego
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: "1rem" }}>
              
              {/* Numer konta */}
              <div style={{ background: "#f8fafc", padding: "0.75rem", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.25rem" }}>Numer rachunku (IBAN)</div>
                <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "#0f172a", wordBreak: "break-all" }}>{bankAccount}</div>
                <button
                  onClick={() => copyToClipboard(bankAccount.replace(/\s+/g, ""), "iban")}
                  style={{ marginTop: "0.5rem", border: "none", background: "transparent", color: "#0369a1", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: 0 }}
                >
                  {copiedField === "iban" ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  {copiedField === "iban" ? "Skopiowano!" : "Kopiuj IBAN"}
                </button>
              </div>

              {/* Tytuł przelewu */}
              <div style={{ background: "#f8fafc", padding: "0.75rem", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.25rem" }}>Tytuł przelewu</div>
                <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "#0f172a" }}>{docNumber}</div>
                <button
                  onClick={() => copyToClipboard(docNumber || "", "title")}
                  style={{ marginTop: "0.5rem", border: "none", background: "transparent", color: "#0369a1", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: 0 }}
                >
                  {copiedField === "title" ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  {copiedField === "title" ? "Skopiowano!" : "Kopiuj tytuł"}
                </button>
              </div>

              {/* Kwota do zapłaty */}
              <div style={{ background: "#f8fafc", padding: "0.75rem", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.25rem" }}>Kwota do zapłaty</div>
                <div style={{ fontWeight: 700, fontSize: "1.125rem", color: "#0369a1" }}>{formatMoney(totalGross, currency)}</div>
                <button
                  onClick={() => copyToClipboard(totalGross.toFixed(2), "amount")}
                  style={{ marginTop: "0.5rem", border: "none", background: "transparent", color: "#0369a1", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: 0 }}
                >
                  {copiedField === "amount" ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  {copiedField === "amount" ? "Skopiowano!" : "Kopiuj kwotę"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Karta dokumentu (styl faktury do druku i podglądu) */}
        <div className="p-5 sm:p-10 print:p-10" style={{ minWidth: 0, background: "#ffffff", color: "#0f172a", border: "1px solid #e2e8f0", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
          
          {/* Nagłówek dokumentu */}
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #e2e8f0", paddingBottom: "1.5rem", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                {docTitle}
              </h1>
              <div style={{ fontSize: "1.125rem", fontWeight: 600, color: "#64748b", marginTop: "0.25rem" }}>
                Nr: {docNumber}
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: "0.875rem", color: "#475569" }}>
              <div>Data wystawienia: <strong>{formatDate(issueDate || "")}</strong></div>
              {dueDate && (
                <div style={{ marginTop: "0.25rem" }}>
                  {isInvoice ? "Termin płatności" : "Oferta ważna do"}: <strong style={{ color: "#0369a1" }}>{formatDate(dueDate)}</strong>
                </div>
              )}
              <div style={{ marginTop: "0.5rem" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "0.25rem 0.65rem",
                    borderRadius: "999px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    background: paymentStatus === "paid" ? "#dcfce7" : "#fef3c7",
                    color: paymentStatus === "paid" ? "#15803d" : "#b45309",
                  }}
                >
                  {isInvoice ? (paymentStatus === "paid" ? "OPŁACONA" : "DO ZAPŁATY") : offer?.status === "accepted" ? "ZAAKCEPTOWANA" : offer?.status === "rejected" ? "ODRZUCONA" : offer?.status === "converted" ? "W REALIZACJI" : "DO DECYZJI"}
                </span>
              </div>
            </div>
          </div>

          {/* Strony: Sprzedawca i Nabywca */}
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 print:grid-cols-2" style={{ marginBottom: "2rem" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                Sprzedawca / Wystawca
              </div>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "#0f172a" }}>
                {seller?.name || "Wystawca"}
              </div>
              {seller?.nip && <div style={{ fontSize: "0.875rem", color: "#475569" }}>NIP: {seller.nip}</div>}
              {seller?.street && (
                <div style={{ fontSize: "0.875rem", color: "#475569" }}>
                  {seller.street}, {seller.postal} {seller.city}
                </div>
              )}
              {bankAccount && (
                <div style={{ fontSize: "0.8125rem", color: "#475569", marginTop: "0.5rem" }}>
                  Bank: {bankName || ""}<br />
                  Konto: <strong>{bankAccount}</strong>
                </div>
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                Nabywca / Kontrahent
              </div>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "#0f172a" }}>
                {buyer?.name || "Kontrahent"}
              </div>
              {buyer?.nip && <div style={{ fontSize: "0.875rem", color: "#475569" }}>NIP: {buyer.nip}</div>}
              {buyer?.street && (
                <div style={{ fontSize: "0.875rem", color: "#475569" }}>
                  {buyer.street}, {buyer.postal} {buyer.city}
                </div>
              )}
            </div>
          </div>

          {/* Pozycje */}
          <div style={{ overflowX: "auto", marginBottom: "2rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #cbd5e1", textAlign: "left", color: "#475569" }}>
                  <th style={{ padding: "0.75rem 0.5rem", width: "40px" }}>Lp.</th>
                  <th style={{ padding: "0.75rem 0.5rem" }}>Nazwa towaru lub usługi</th>
                  <th style={{ padding: "0.75rem 0.5rem", textAlign: "center" }}>Ilość</th>
                  <th style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>Cena netto</th>
                  <th style={{ padding: "0.75rem 0.5rem", textAlign: "center" }}>VAT</th>
                  <th style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>Wartość brutto</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((item: InvoiceLine | OfferLine, idx: number) => {
                  const vatPct = parseFloat(String(item.vatRate)) || 0;
                  const lineNet = Math.round(item.quantity * item.netPrice * 100) / 100;
                  const lineGross = Math.round(lineNet * (1 + vatPct / 100) * 100) / 100;
                  return (
                    <tr key={item.id || idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "0.75rem 0.5rem", color: "#94a3b8" }}>{idx + 1}</td>
                      <td style={{ padding: "0.75rem 0.5rem", fontWeight: 500, color: "#0f172a" }}>{item.name}</td>
                      <td style={{ padding: "0.75rem 0.5rem", textAlign: "center" }}>{item.quantity} {item.unit}</td>
                      <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>{formatMoney(item.netPrice, currency)}</td>
                      <td style={{ padding: "0.75rem 0.5rem", textAlign: "center" }}>{item.vatRate}%</td>
                      <td style={{ padding: "0.75rem 0.5rem", textAlign: "right", fontWeight: 600 }}>{formatMoney(lineGross, currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Podsumowanie kwot */}
          <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "2px solid #e2e8f0", paddingTop: "1rem" }}>
            <div style={{ minWidth: 0, width: "280px", maxWidth: "100%" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem 0.5rem", justifyContent: "space-between", fontSize: "0.875rem", color: "#64748b", marginBottom: "0.35rem" }}>
                <span>Wartość netto:</span>
                <span>{formatMoney(totalNet, currency)}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem 0.5rem", justifyContent: "space-between", fontSize: "0.875rem", color: "#64748b", marginBottom: "0.35rem" }}>
                <span>Kwota VAT:</span>
                <span>{formatMoney(totalVat, currency)}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem 0.5rem", justifyContent: "space-between", fontSize: "1.25rem", fontWeight: 800, color: "#0f172a", borderTop: "1px solid #cbd5e1", paddingTop: "0.5rem", marginTop: "0.5rem" }}>
                <span>Razem brutto:</span>
                <span>{formatMoney(totalGross, currency)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal deklaracji płatności */}
        {declareOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem" }}>
            <div style={{ background: "#ffffff", borderRadius: "12px", width: "100%", maxWidth: "440px", padding: "1.75rem", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
              <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#0f172a", marginBottom: "0.5rem" }}>
                Zadeklaruj termin płatności
              </h3>
              <p style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "1.25rem" }}>
                Poinformuj wystawcę o planowanym terminie realizacji przelewu.
              </p>
              <form onSubmit={handleDeclarePayment} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#334155", marginBottom: "0.25rem" }}>
                    Planowana data przelewu *
                  </label>
                  <input
                    type="date"
                    value={declaredDate}
                    onChange={(e) => setDeclaredDate(e.target.value)}
                    required
                    style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.875rem" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#334155", marginBottom: "0.25rem" }}>
                    Wiadomość lub powód (opcjonalnie)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="np. Przelew zlecony w piątkowej sesji elixir..."
                    value={declaredNote}
                    onChange={(e) => setDeclaredNote(e.target.value)}
                    style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.875rem", fontFamily: "inherit" }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() => setDeclareOpen(false)}
                    style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#475569", fontWeight: 500, fontSize: "0.875rem", cursor: "pointer" }}
                  >
                    Anuluj
                  </button>
                  <button
                    type="submit"
                    disabled={declaring}
                    style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "none", background: "#0369a1", color: "#ffffff", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer" }}
                  >
                    {declaring ? "Zapisywanie..." : "Wyślij deklarację"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

