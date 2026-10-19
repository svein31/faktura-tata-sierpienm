import type { Invoice } from "@/lib/types";
import { ksefProgress } from "./progress";

type StepState = "completed" | "current" | "pending" | "error";
export function ksefPresentation(invoice: Invoice) {
  const progress = ksefProgress(invoice);
  const rejected = progress.rejected || (!progress.accepted && invoice.ksef?.status === "REJECTED");
  const verify = !progress.accepted && !rejected && (invoice.ksefStatus === "verify_needed" || invoice.ksefStatus === "accepted" || invoice.ksef?.status === "ACTIVE");
  const queued = !progress.accepted && !rejected && !verify && (progress.queued || invoice.ksef?.status === "QUEUED");
  const sent = !progress.accepted && !rejected && !queued && (progress.sending || invoice.ksef?.status === "SENT");
  const environment = invoice.ksef?.environmentRecorded === false ? invoice.ksefProcessing?.environment : invoice.ksef?.environment || invoice.ksefProcessing?.environment;
  const simulated = environment === "demo";
  const excluded = Boolean(invoice.isProforma || invoice.documentStatus === "cancelled");
  const label = excluded ? "Nie dotyczy KSeF" : progress.accepted ? "Przyjęta" : rejected ? "Odrzucona" : verify ? "Weryfikacja wyniku" : queued ? "W kolejce" : sent ? "Wysłana" : "Zapisana";
  const detail = excluded ? "Ten dokument nie jest przeznaczony do wysyłki w KSeF." : progress.accepted
    ? progress.hasUpo ? simulated ? "Potwierdzenie demo dostępne." : "Potwierdzenie odbioru dostępne." : "Numer KSeF nadany. Oczekiwanie na UPO."
    : rejected ? "Sprawdź komunikat odrzucenia, popraw wskazane dane i ponów wysyłkę dopiero po ich weryfikacji."
    : verify ? "Wynik wysyłki nie jest jeszcze potwierdzony. Sprawdź status; nie wysyłaj ponownie tego dokumentu."
    : queued ? "Dokument oczekuje na przetworzenie. Status aktualizuje się automatycznie."
    : sent ? "Oczekiwanie na wynik przetwarzania. Wysłanie dokumentu nie oznacza jeszcze jego przyjęcia."
    : invoice.isOffline ? "Dokument w trybie offline. Sprawdź wymagania i termin przesłania przed wysyłką."
    : "Dokument zapisany w aplikacji. Nie ma jeszcze potwierdzenia przyjęcia w KSeF.";
  const transmissionKnown = Boolean(invoice.referenceNumber || invoice.ksef?.referenceNumber || invoice.sentAt || invoice.ksef?.sentAt);
  const steps: { id: string; label: string; description: string; state: StepState; timestamp?: string | null }[] = [
    {id:"saved",label:"Zapisana",description:"Dokument jest w aplikacji",state:"completed",timestamp:invoice.createdAt},
    {id:"queued",label:"W kolejce",description:"Oczekiwanie na przetworzenie",state:progress.accepted || rejected || sent || verify ? "completed" : queued ? "current" : "pending"},
    {id:"sent",label:"Wysłana",description:"Przekazanie do KSeF",state:progress.accepted || rejected && transmissionKnown ? "completed" : sent || verify ? "current" : "pending",timestamp:invoice.sentAt || invoice.ksef?.sentAt},
    {id:"accepted",label:"Przyjęta",description:simulated ? "Symulowane przyjęcie" : "Numer KSeF potwierdzony",state:progress.accepted ? "completed" : rejected ? "error" : "pending",timestamp:progress.accepted ? invoice.ksefAcceptedAt : undefined},
    {id:"upo",label:simulated ? "Potwierdzenie demo" : "UPO",description:simulated ? "Nie jest urzędowym UPO" : "Potwierdzenie odbioru",state:progress.hasUpo ? "completed" : progress.accepted ? "current" : "pending"},
  ];
  return { ...progress, rejected, verify, queued, sent, simulated, environment, excluded, label, detail, steps,
    tone: rejected ? "error" : verify || queued || sent ? "pending" : progress.accepted ? "success" : "neutral",
    rejectionMessage: rejected ? (invoice.ksef?.processingDescription || invoice.ksefProcessing?.error)?.trim().slice(0, 1500) || null : null,
  };
}

/** UI guard only: an uncertain/unfinished transmission must not offer another send. */
export function isKsefUiPending(invoice: Invoice) {
  const state = ksefPresentation(invoice);
  return state.verify || state.queued || state.sent;
}
