import { ApiError } from "@/lib/api";
import { EU_COUNTRIES } from "@/lib/validation";

const VIES_URL = "https://ec.europa.eu/taxation_customs/vies/services/checkVatService";

export function viesNumber(value: string, selectedCountry: string) {
  const country = selectedCountry.toUpperCase() === "GR" ? "EL" : selectedCountry.toUpperCase();
  if (!(EU_COUNTRIES.has(country) || country === "EL" || country === "XI"))
    throw new ApiError(400, "Wybierz kraj UE lub Irlandię Północną (XI).", "VIES_COUNTRY");
  const compact = value.replace(/\s|-/g, "").toUpperCase();
  const prefix = compact.slice(0, 2);
  const vatNumber = prefix === country || (country === "EL" && prefix === "GR") ? compact.slice(2) : compact;
  if (/^[A-Z]{2}/.test(compact) && (EU_COUNTRIES.has(prefix) || prefix === "EL" || prefix === "XI") && prefix !== country && !(country === "EL" && prefix === "GR"))
    throw new ApiError(400, "Prefiks numeru VAT nie zgadza się z wybranym krajem.", "VIES_COUNTRY_MISMATCH");
  if (!/^[A-Z0-9+*.]{2,12}$/.test(vatNumber))
    throw new ApiError(400, "Nieprawidłowy format numeru VAT UE.", "VIES_NUMBER_FORMAT");
  return { countryCode: country, vatNumber };
}

export function parseViesResponse(xml: string) {
  const response = xml.match(/<(?:[\w.-]+:)?checkVatResponse\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?checkVatResponse\s*>/i)?.[1];
  const valid = response?.match(/<(?:[\w.-]+:)?valid\b[^>]*>\s*(true|false)\s*<\/(?:[\w.-]+:)?valid\s*>/i)?.[1];
  const requestDate = response?.match(/<(?:[\w.-]+:)?requestDate\b[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/(?:[\w.-]+:)?requestDate\s*>/i)?.[1];
  if (!valid || !requestDate) throw new ApiError(503, "VIES nie zwrócił wyniku. Spróbuj ponownie później.", "VIES_UNAVAILABLE");
  return { valid: valid.toLowerCase() === "true", requestDate };
}

export async function checkVies(value: string, selectedCountry: string, transport: typeof fetch = fetch) {
  const { countryCode, vatNumber } = viesNumber(value, selectedCountry);
  const body = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="urn:ec.europa.eu:taxud:vies:services:checkVat:types"><soap:Body><tns:checkVat><tns:countryCode>${countryCode}</tns:countryCode><tns:vatNumber>${vatNumber}</tns:vatNumber></tns:checkVat></soap:Body></soap:Envelope>`;
  let response: Response;
  try {
    response = await transport(VIES_URL, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' }, body, signal: AbortSignal.timeout(9000), redirect: "error", cache: "no-store" });
  } catch {
    throw new ApiError(503, "Połączenie z VIES jest niedostępne. Spróbuj ponownie później.", "VIES_UNAVAILABLE");
  }
  if (!response.ok) throw new ApiError(503, "VIES jest chwilowo niedostępny. Spróbuj ponownie później.", "VIES_UNAVAILABLE");
  const xml = await response.text();
  if (xml.length > 64_000) throw new ApiError(503, "VIES zwrócił nieprawidłową odpowiedź.", "VIES_UNAVAILABLE");
  return { ...parseViesResponse(xml), countryCode, vatNumber };
}
