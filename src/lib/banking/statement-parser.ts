import { XMLParser, XMLValidator } from "fast-xml-parser";
export type StatementTransaction = {
  date: string; amount: number; currency: string; title: string; senderName: string;
  senderAccount?: string; accountIban?: string; externalReference?: string; raw: string;
};
export type StatementFormat = "csv" | "mt940" | "camt053";
function date(value: string) {
  let result = value.trim().slice(0, 10);
  const dmy = result.match(/^(\d{2})[.\/-](\d{2})[.\/-](\d{4})$/);
  if (dmy) result = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  result = result.replace(/\./g, "-");
  const parsed = new Date(result + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result)
    throw new Error("Nieprawidłowa data operacji: " + value);
  return result;
}
export function statementAmount(value: string) {
  let text = value.trim().replace(/\s|\u00a0/g, "").replace(/(?:PLN|EUR|USD|GBP|CHF)$/i, "");
  if (text.includes(",") && text.includes(".")) text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  else text = text.replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("Nieprawidłowa kwota: " + value);
  const amount = Number(text);
  if (!Number.isSafeInteger(Math.round(amount * 100))) throw new Error("Kwota przekracza dozwolony zakres.");
  return Math.round(amount * 100) / 100;
}
function currency(value: string) {
  const result = (value || "PLN").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(result)) throw new Error("Nieprawidłowa waluta operacji.");
  return result;
}
function csvRows(text: string, delimiter: string) {
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (char === delimiter && !quoted) { row.push(field.trim()); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (quoted) throw new Error("Niezamknięty cudzysłów w CSV.");
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}
const normal = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");
export function parseStatementCsv(text: string): StatementTransaction[] {
  let rows: string[][] = [], headerIndex = -1;
  for (const separator of [";", "\t", ","]) {
    const candidate = csvRows(text.replace(/^\uFEFF/, ""), separator);
    const index = candidate.slice(0, 30).findIndex(row => row.some(v => /data|date/.test(normal(v))) && row.some(v => /kwota|wartosc|amount|credit|debit|uznani|obciaz/.test(normal(v))));
    if (index >= 0) { rows = candidate; headerIndex = index; break; }
  }
  if (headerIndex < 0) throw new Error("Brak kolumn daty i kwoty. Użyj CSV z nagłówkiem.");
  const headers = rows[headerIndex].map(normal), find = (pattern: RegExp) => headers.findIndex(h => pattern.test(h));
  const di = find(/data operacji|data transakcji|booking date|data ksieg|^data$|^date$/), ai = find(/kwota operacji|kwota transakcji|^kwota$|^amount$|wartosc/),
    ci = find(/waluta|currency/), ti = find(/tytul|opis|szczegoly|title|description/), ni = find(/nadawca|kontrahent|odbiorca|nazwa|name/),
    ii = find(/rachunek kontrahenta|rachunek nadawcy|rachunek odbiorcy|konto|iban|account/), ri = find(/referenc|reference|transaction id/),
    credit = find(/credit|uznani/), debit = find(/debit|obciaz/);
  const dateIndex = di < 0 ? find(/data|date/) : di;
  if (dateIndex < 0 || (ai < 0 && credit < 0 && debit < 0)) throw new Error("Nieobsługiwany układ kolumn CSV.");
  return rows.slice(headerIndex + 1).map((row, index) => {
    if (row.length !== headers.length) throw new Error("Nieprawidłowa liczba kolumn w wierszu " + (headerIndex + index + 2));
    const get = (i: number) => i < 0 ? "" : row[i] || "";
    const amount = ai >= 0 ? statementAmount(get(ai)) : (get(credit) ? statementAmount(get(credit)) : 0) - (get(debit) ? statementAmount(get(debit)) : 0);
    return { date: date(get(dateIndex)), amount, currency: currency(get(ci)), title: get(ti), senderName: get(ni), senderAccount: get(ii).replace(/\s/g, "") || undefined, externalReference: get(ri) || undefined, raw: JSON.stringify(row) };
  }).filter(tx => tx.amount !== 0);
}
export function parseMt940(text: string): StatementTransaction[] {
  const tags = [...text.replace(/\r/g, "").matchAll(/^:(\d{2}[A-Z]?):([\s\S]*?)(?=^:\d{2}[A-Z]?:|$)/gm)];
  const transactions: StatementTransaction[] = []; let accountIban = "", ccy = "", last: StatementTransaction | undefined;
  for (const [, tag, value] of tags) {
    if (tag === "25") accountIban = value.trim().split("\n")[0].replace(/\s/g, "");
    if (tag === "60F" || tag === "60M") { const m = value.match(/^[CD]\d{6}([A-Z]{3})/); if (m) ccy = m[1]; }
    if (tag === "61") {
      const m = value.trim().match(/^(\d{6})(?:\d{4})?(R?[CD])(?:[A-Z])?(\d+,\d{0,2})([\s\S]*)$/);
      if (!m || !ccy) throw new Error("Nieobsługiwana operacja MT940 lub brak waluty salda.");
      const sign = m[2] === "C" || m[2] === "RD" ? 1 : -1;
      const y = Number(m[1].slice(0, 2)), reference = m[4].split("//")[1]?.trim().split("\n")[0];
      last = { date: date(`${y < 70 ? 2000 + y : 1900 + y}-${m[1].slice(2, 4)}-${m[1].slice(4, 6)}`), amount: sign * statementAmount(m[3].replace(/,$/, ",00")), currency: ccy, title: m[4].trim(), senderName: "", accountIban, externalReference: reference && reference !== "NONREF" ? reference : undefined, raw: value };
      transactions.push(last);
    }
    if (tag === "86" && last) {
      last.title = value.replace(/\?\d{2}/g, " ").replace(/\n/g, " ").trim();
      last.senderAccount = value.match(/(?:\?31|\/ACC\/)([A-Z]{2}\d{2}[A-Z0-9]{10,30}|\d{26})/)?.[1];
      last.senderName = value.match(/\?32([^?]*)(?:\?33([^?]*))?/)?.slice(1).filter(Boolean).join(" ").trim() || "";
    }
  }
  return transactions;
}
const list = <T,>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
export function parseCamt053(text: string): StatementTransaction[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("Deklaracje DTD i encji XML są niedozwolone.");
  if (XMLValidator.validate(text) !== true) throw new Error("Nieprawidłowy XML wyciągu.");
  const parsed = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, processEntities: false }).parse(text);
  const statements = list<any>(parsed.Document?.BkToCstmrStmt?.Stmt);
  if (!statements.length) throw new Error("Oczekiwano wyciągu ISO 20022 camt.053.");
  const result: StatementTransaction[] = [];
  for (const statement of statements) for (const entry of list<any>(statement.Ntry)) {
    const status = typeof entry.Sts === "string" ? entry.Sts : entry.Sts?.Cd;
    if (status && status !== "BOOK") continue;
    const details = list<any>(entry.NtryDtls).flatMap(d => list<any>(d.TxDtls));
    const operations = details.length ? details : [{}]; let sum = 0;
    for (const detail of operations) {
      const amountNode = operations.length === 1 ? entry.Amt : detail.AmtDtls?.TxAmt?.Amt || detail.Amt;
      if (!amountNode) throw new Error("Brak kwot pojedynczych operacji w zbiorczym wpisie camt.053.");
      const indicator = detail.CdtDbtInd || entry.CdtDbtInd;
      if (!["CRDT", "DBIT"].includes(indicator)) throw new Error("Brak kierunku operacji camt.053.");
      const amount = statementAmount(String(typeof amountNode === "object" ? amountNode["#text"] : amountNode));
      const ccy = currency(amountNode["@_Ccy"] || entry.Amt?.["@_Ccy"] || statement.Acct?.Ccy);
      if (ccy !== currency(entry.Amt?.["@_Ccy"] || statement.Acct?.Ccy)) throw new Error("Zbiorczy wpis camt.053 zawiera różne waluty; wymagany jest profil banku.");
      if (amount < 0) throw new Error("Kwota camt.053 musi być dodatnia.");
      sum += amount;
      const party = indicator === "CRDT" ? "Dbtr" : "Cdtr";
      const remittance = list<string>(detail.RmtInf?.Ustrd).join(" ") || detail.RmtInf?.Strd?.CdtrRefInf?.Ref || entry.AddtlNtryInf || "";
      const reference = detail.Refs?.AcctSvcrRef || detail.Refs?.TxId || (operations.length === 1 ? entry.AcctSvcrRef : undefined);
      result.push({ date: date(entry.BookgDt?.Dt || entry.BookgDt?.DtTm || ""), amount: indicator === "CRDT" ? amount : -amount, currency: ccy, title: remittance, senderName: detail.RltdPties?.[party]?.Nm || detail.RltdPties?.[party]?.Pty?.Nm || "", senderAccount: detail.RltdPties?.[party + "Acct"]?.Id?.IBAN, accountIban: statement.Acct?.Id?.IBAN, externalReference: reference && reference !== "NOTPROVIDED" ? reference : undefined, raw: JSON.stringify(detail) });
    }
    if (operations.length > 1 && Math.round(sum * 100) !== Math.round(statementAmount(String(entry.Amt?.["#text"] ?? entry.Amt)) * 100)) throw new Error("Suma operacji nie zgadza się z kwotą wpisu camt.053.");
  }
  return result;
}
export function parseStatement(content: string, format?: string) {
  if (content.length > 2_000_000) throw new Error("Wyciąg przekracza limit 2 MB.");
  const detected: StatementFormat = format === "mt940" || /^:20:/m.test(content) ? "mt940" : format === "camt053" || format === "xml" || content.trimStart().startsWith("<") ? "camt053" : "csv";
  const transactions = detected === "mt940" ? parseMt940(content) : detected === "camt053" ? parseCamt053(content) : parseStatementCsv(content);
  if (!transactions.length || transactions.length > 1000) throw new Error("Wyciąg musi zawierać od 1 do 1000 operacji.");
  return { format: detected, transactions };
}
