/** Date of KSeF number assignment for one invoice in a possibly multi-invoice UPO. */
export function ksefAcceptanceDateFromUpo(upoXml: string | null | undefined, ksefNumber: string | null | undefined): string | null {
  if (!upoXml || !ksefNumber) return null;
  const documents = upoXml.match(/<(?:[\w.-]+:)?Dokument\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?Dokument\s*>/g) || [];
  const value = (xml: string, tag: string) => {
    const match = xml.match(new RegExp(`<(?:[\\w.-]+:)?${tag}\\s*>([^<]+)<\\/(?:[\\w.-]+:)?${tag}\\s*>`));
    return match?.[1]?.trim() || null;
  };
  const document = documents.find(xml => value(xml, "NumerKSeFDokumentu") === ksefNumber);
  const timestamp = document && value(document, "DataNadaniaNumeruKSeF");
  if (!timestamp || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(timestamp)) return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  // UPO timestamps with an offset must be converted to the Polish calendar day.
  if (/(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
  }
  return timestamp.slice(0, 10);
}
