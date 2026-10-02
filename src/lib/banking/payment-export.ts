import { validateAccountNumber } from "./validation";
import { csvCell } from "../accountant-summary";
export type Transfer = { id: string; recipient: string; iban: string; amount: number; currency: string; title: string };
const xml = (v: unknown) => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
function iban(raw: string) {
  const result = validateAccountNumber(raw);
  if (!result.isValid || !result.isIban) throw new Error("Podaj rachunek z poprawną sumą kontrolną IBAN.");
  return result.normalized;
}
export function paymentExport(input: { debtor: string; debtorIban: string; executionDate: string; transfers: Transfer[]; format: "pain001" | "csv" | "elixir"; messageId: string }) {
  const account = iban(input.debtorIban), transfers = input.transfers.map(t => ({ ...t, iban: iban(t.iban) }));
  const parsedDate = new Date(input.executionDate + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.executionDate) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.executionDate) throw new Error("Podaj poprawną datę realizacji.");
  if (!transfers.length || transfers.length > 100 || !input.debtor.trim()) throw new Error("Wybierz od 1 do 100 przelewów i nazwę płatnika.");
  if (new Set(transfers.map(t => t.id)).size !== transfers.length) throw new Error("Dokument występuje więcej niż raz.");
  const currencies = new Set(transfers.map(t => t.currency));
  if (currencies.size !== 1) throw new Error("Jedna paczka musi zawierać jedną walutę.");
  for (const t of transfers) {
    if (!t.recipient.trim() || !t.title.trim() || t.title.length > 140 || !/^[A-Z]{3}$/.test(t.currency) || !Number.isFinite(t.amount) || t.amount <= 0 || !Number.isSafeInteger(Math.round(t.amount * 100)) || Math.abs(t.amount * 100 - Math.round(t.amount * 100)) > 0.00001) throw new Error("Nieprawidłowe dane odbiorcy, tytułu lub kwoty.");
  }
  if (input.format === "csv") return { extension: "csv", mime: "text/csv; charset=utf-8", content: "\uFEFF" + [["Data", "Odbiorca", "IBAN", "Kwota", "Waluta", "Tytuł"], ...transfers.map(t => [input.executionDate, t.recipient, t.iban, t.amount.toFixed(2), t.currency, t.title])].map(row => row.map(csvCell).join(";")).join("\r\n") };
  if (input.format === "elixir") {
    if (!account.startsWith("PL") || transfers.some(t => t.currency !== "PLN" || !t.iban.startsWith("PL"))) throw new Error("Elixir-O obsługuje w tej aplikacji wyłącznie krajowe przelewy PLN.");
    const quoted = (v: string) => '"' + v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").replace(/[\r\n"|]/g, " ").slice(0, 140) + '"';
    const fields = transfers.map(t => [110, input.executionDate.replace(/-/g, ""), Math.round(t.amount * 100), account.slice(4, 12), t.iban.slice(4, 12), quoted(account.slice(2)), quoted(t.iban.slice(2)), quoted(input.debtor), quoted(t.recipient), 0, t.iban.slice(4, 12), quoted(t.title), quoted(""), quoted(""), quoted("51")].join(","));
    return { extension: "txt", mime: "text/plain; charset=utf-8", content: fields.join("\r\n") };
  }
  const total = transfers.reduce((sum, t) => sum + Math.round(t.amount * 100), 0);
  const payments = transfers.map(t => `<CdtTrfTxInf><PmtId><EndToEndId>${xml(t.id.slice(0, 35))}</EndToEndId></PmtId><Amt><InstdAmt Ccy="${xml(t.currency)}">${t.amount.toFixed(2)}</InstdAmt></Amt><Cdtr><Nm>${xml(t.recipient.slice(0, 70))}</Nm></Cdtr><CdtrAcct><Id><IBAN>${xml(t.iban)}</IBAN></Id></CdtrAcct><RmtInf><Ustrd>${xml(t.title)}</Ustrd></RmtInf></CdtTrfTxInf>`).join("");
  return { extension: "xml", mime: "application/xml; charset=utf-8", content: `<?xml version="1.0" encoding="UTF-8"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"><CstmrCdtTrfInitn><GrpHdr><MsgId>${xml(input.messageId.slice(0, 35))}</MsgId><CreDtTm>${new Date().toISOString()}</CreDtTm><NbOfTxs>${transfers.length}</NbOfTxs><CtrlSum>${(total / 100).toFixed(2)}</CtrlSum><InitgPty><Nm>${xml(input.debtor.slice(0, 70))}</Nm></InitgPty></GrpHdr><PmtInf><PmtInfId>${xml(input.messageId.slice(0, 35))}</PmtInfId><PmtMtd>TRF</PmtMtd><BtchBookg>true</BtchBookg><NbOfTxs>${transfers.length}</NbOfTxs><CtrlSum>${(total / 100).toFixed(2)}</CtrlSum><ReqdExctnDt>${input.executionDate}</ReqdExctnDt><Dbtr><Nm>${xml(input.debtor.slice(0, 70))}</Nm></Dbtr><DbtrAcct><Id><IBAN>${account}</IBAN></Id></DbtrAcct><DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>${payments}</PmtInf></CstmrCdtTrfInitn></Document>` };
}
