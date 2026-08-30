/**
 * Klient API GUS BIR 1.1 (SOAP 1.2) z dwuetapowym pobieraniem pełnego raportu
 */

import {
  GUS_ACTIONS,
  GUS_ERROR_CODES,
  GUS_TEST_KEY,
  GUS_URLS,
  type GusEnvironment,
  type GusNormalizedCompany,
  type GusRawEntity,
} from "./constants";
import {
  extractTagContent,
  mergeGusFullData,
  parseRawGusEntities,
  parseRawGusFullReport,
  unescapeXml,
} from "./parser";

export interface GusClientOptions {
  environment?: GusEnvironment;
  apiKey?: string;
  timeoutMs?: number;
  baseUrl?: string;
}

export class GusApiError extends Error {
  public statusCode: number;
  public errorCode?: string;
  public details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    errorCode?: string,
    details?: unknown
  ) {
    super(message);
    this.name = "GusApiError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}

export class GusClient {
  public readonly environment: GusEnvironment;
  public readonly baseUrl: string;
  public readonly apiKey: string;
  public readonly timeoutMs: number;
  private sessionId: string | null = null;

  constructor(options: GusClientOptions = {}) {
    const envVar = (process.env.GUS_ENV || "test").toLowerCase();
    this.environment = options.environment || (envVar === "prod" || envVar === "production" ? "prod" : "test");
    this.baseUrl = options.baseUrl || GUS_URLS[this.environment] || GUS_URLS.test;
    this.apiKey = options.apiKey || process.env.GUS_API_KEY || (this.environment === "test" ? GUS_TEST_KEY : "");
    this.timeoutMs = options.timeoutMs || 10000;
  }

  /**
   * Zwraca nagłówek Content-Type z odpowiednią akcją SOAP 1.2
   */
  private getSoapContentType(action: string): string {
    return `application/soap+xml; charset=utf-8; action="${action}"`;
  }

  /**
   * Wykonuje zapytanie HTTP POST do serwisu GUS z obsługą timeoutu i nagłówków SOAP 1.2
   */
  private async postSoap(action: string, soapBodyContent: string, requireSession: boolean = true): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      "Content-Type": this.getSoapContentType(action),
      Accept: "application/soap+xml, application/xml, text/xml",
    };

    if (requireSession && this.sessionId) {
      headers["sid"] = this.sessionId;
    }

    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07" xmlns:dat="http://CIS/BIR/PUBL/2014/07/DataContract">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:To>${this.baseUrl}</wsa:To>
    <wsa:Action>${action}</wsa:Action>
  </soap:Header>
  <soap:Body>
    ${soapBodyContent}
  </soap:Body>
</soap:Envelope>`;

    try {
      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers,
        body: envelope,
        signal: controller.signal,
      });

      const responseText = await res.text();

      if (!res.ok) {
        throw new GusApiError(
          `Błąd połączenia z serwerem GUS (HTTP ${res.status}): ${responseText.slice(0, 300)}`,
          res.status,
          "HTTP_ERROR"
        );
      }

      if (responseText.includes("<soap:Fault") || responseText.includes("<Fault")) {
        const faultText = extractTagContent(responseText, "Text") || extractTagContent(responseText, "faultstring") || "Błąd SOAP serwisu GUS";
        throw new GusApiError(`GUS SOAP Fault: ${faultText}`, 500, "SOAP_FAULT");
      }

      return responseText;
    } catch (err) {
      if (err instanceof GusApiError) throw err;
      if ((err as any)?.name === "AbortError") {
        throw new GusApiError(`Przekroczono limit czasu oczekiwania na odpowiedź GUS (${this.timeoutMs}ms)`, 504, "TIMEOUT");
      }
      throw new GusApiError(`Błąd komunikacji z API GUS: ${err instanceof Error ? err.message : String(err)}`, 502, "NETWORK_ERROR");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * KROK 1: Logowanie do GUS BIR (metoda Zaloguj)
   */
  public async login(): Promise<string> {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      throw new GusApiError(
        "Brak klucza API GUS (GUS_API_KEY). W trybie testowym użyj klucza 'abcde12345abcde12345'.",
        400,
        "MISSING_API_KEY"
      );
    }

    const bodyContent = `<ns:Zaloguj>
      <ns:pKluczUzytkownika>${this.apiKey.trim()}</ns:pKluczUzytkownika>
    </ns:Zaloguj>`;

    const response = await this.postSoap(GUS_ACTIONS.login, bodyContent, false);
    const sid = extractTagContent(response, "ZalogujResult");

    if (!sid || sid.trim().length === 0 || sid === "0") {
      throw new GusApiError(
        "Nie udało się uzyskać identyfikatora sesji GUS (SID). Sprawdź poprawność klucza API (userKey).",
        401,
        "INVALID_API_KEY"
      );
    }

    this.sessionId = sid.trim();
    return this.sessionId;
  }

  /**
   * Pobiera kod lub treść błędu z bieżącej sesji GUS (metoda GetValue)
   */
  public async getValue(paramName: "KomunikatKod" | "KomunikatTresc" | "StanSesji"): Promise<string> {
    if (!this.sessionId) return "";
    const bodyContent = `<ns:GetValue>
      <ns:pNazwaParametru>${paramName}</ns:pNazwaParametru>
    </ns:GetValue>`;

    try {
      const response = await this.postSoap(GUS_ACTIONS.getValue, bodyContent, true);
      return extractTagContent(response, "GetValueResult") || "";
    } catch {
      return "";
    }
  }

  /**
   * KROK 2: Pobiera pełny raport szczegółowy (metoda DanePobierzPelnyRaport)
   */
  public async getFullReport(regon: string, reportName: string): Promise<Record<string, string>> {
    const cleanRegon = regon.replace(/[^0-9]/g, "").trim();
    if (!cleanRegon) return {};

    if (!this.sessionId) {
      await this.login();
    }

    const bodyContent = `<ns:DanePobierzPelnyRaport>
      <ns:pRegon>${cleanRegon}</ns:pRegon>
      <ns:pNazwaRaportu>${reportName}</ns:pNazwaRaportu>
    </ns:DanePobierzPelnyRaport>`;

    try {
      const response = await this.postSoap(GUS_ACTIONS.fullReport, bodyContent, true);
      const resultXml = extractTagContent(response, "DanePobierzPelnyRaportResult");
      if (!resultXml || resultXml.trim().length === 0) {
        return {};
      }
      return parseRawGusFullReport(resultXml);
    } catch (e) {
      console.warn(`[GUS BIR getFullReport warning for ${reportName}]:`, e);
      return {};
    }
  }

  /**
   * KROK 3: Wyszukiwanie podmiotu po NIP + dwuetapowe pobranie pełnych danych
   */
  public async searchByNip(nip: string): Promise<GusNormalizedCompany | null> {
    const cleanNip = nip.replace(/[^0-9]/g, "").trim();

    if (!cleanNip || cleanNip.length !== 10) {
      throw new GusApiError("Numer NIP musi składać się z dokładnie 10 cyfr.", 400, "INVALID_NIP_FORMAT");
    }

    if (!this.sessionId) {
      await this.login();
    }

    // 1. Etap 1: Wyszukanie podstawowych danych w rejestrze
    const bodyContent = `<ns:DaneSzukajPodmioty>
      <ns:pParametryWyszukiwania>
        <dat:Nip>${cleanNip}</dat:Nip>
      </ns:pParametryWyszukiwania>
    </ns:DaneSzukajPodmioty>`;

    let response = await this.postSoap(GUS_ACTIONS.search, bodyContent, true);
    let searchResultXml = extractTagContent(response, "DaneSzukajPodmiotyResult");

    // Jeśli sesja wygasła (kod 7 lub 5), podejmij próbę ponownego zalogowania
    if (!searchResultXml || searchResultXml.includes("<ErrorCode>7</ErrorCode>") || searchResultXml.includes("<ErrorCode>5</ErrorCode>")) {
      await this.login();
      response = await this.postSoap(GUS_ACTIONS.search, bodyContent, true);
      searchResultXml = extractTagContent(response, "DaneSzukajPodmiotyResult");
    }

    if (!searchResultXml || searchResultXml.trim().length === 0) {
      return null;
    }

    const unescaped = unescapeXml(searchResultXml);
    const errorCode = extractTagContent(unescaped, "ErrorCode");
    if (errorCode) {
      if (errorCode === "4" || errorCode === "1" || errorCode === "3") {
        return null;
      }
      const errorMsg = extractTagContent(unescaped, "ErrorMessagePl") || GUS_ERROR_CODES[errorCode] || `Kod błędu GUS: ${errorCode}`;
      throw new GusApiError(errorMsg, 400, `GUS_ERROR_${errorCode}`);
    }

    const entities = parseRawGusEntities(unescaped);
    if (!entities || entities.length === 0) {
      return null;
    }

    const baseEntity: GusRawEntity = entities[0];
    if (!baseEntity.Nazwa && !baseEntity.Nip && !baseEntity.Regon) {
      return null;
    }

    const regon = baseEntity.Regon || "";
    let combinedReportData: Record<string, string> = {};

    // 2. Etap 2: Pobranie pełnego raportu na podstawie typu podmiotu i SilosID
    if (regon) {
      const isPhysical = baseEntity.Typ === "F" || baseEntity.SilosID === "1" || baseEntity.SilosID === "6";

      if (isPhysical) {
        // Raport działalności CEIDG
        const ceidgReport = await this.getFullReport(regon, "BIR11OsFizycznaDzialalnoscCeidg");
        // Raport danych ogólnych (imię, nazwisko)
        const generalReport = await this.getFullReport(regon, "BIR11OsFizycznaDaneOgolne");

        // Fallback do nazw raportów PUB10 jeśli puste
        let altCeidg: Record<string, string> = {};
        if (Object.keys(ceidgReport).length === 0) {
          altCeidg = await this.getFullReport(regon, "PUB10F_FizycznaDzialalnoscCeidg");
        }
        let altGeneral: Record<string, string> = {};
        if (Object.keys(generalReport).length === 0) {
          altGeneral = await this.getFullReport(regon, "PUB10F_FizycznaDaneOgolne");
        }

        combinedReportData = {
          ...altCeidg,
          ...altGeneral,
          ...ceidgReport,
          ...generalReport,
        };
      } else {
        // Raport osoby prawnej (KRS / Spółka)
        const legalReport = await this.getFullReport(regon, "BIR11OsPrawna");
        let altLegal: Record<string, string> = {};
        if (Object.keys(legalReport).length === 0) {
          altLegal = await this.getFullReport(regon, "PUB10P_UczestnicySpolkiPrawnej");
        }

        combinedReportData = {
          ...altLegal,
          ...legalReport,
        };
      }
    }

    return mergeGusFullData(baseEntity, combinedReportData);
  }

  /**
   * KROK 4: Wylogowanie z GUS BIR (metoda Wyloguj)
   */
  public async logout(): Promise<boolean> {
    if (!this.sessionId) return true;

    const currentSid = this.sessionId;
    this.sessionId = null;

    const bodyContent = `<ns:Wyloguj>
      <ns:pIdentyfikatorSesji>${currentSid}</ns:pIdentyfikatorSesji>
    </ns:Wyloguj>`;

    try {
      const response = await this.postSoap(GUS_ACTIONS.logout, bodyContent, false);
      const result = extractTagContent(response, "WylogujResult");
      return result === "true" || result === "1";
    } catch {
      return false;
    }
  }

  /**
   * Automatyczna pojedyncza operacja: login -> search -> logout w bezpiecznym bloku try...finally
   */
  public static async searchByNipAuto(nip: string, options: GusClientOptions = {}): Promise<GusNormalizedCompany | null> {
    const client = new GusClient(options);
    try {
      await client.login();
      return await client.searchByNip(nip);
    } finally {
      await client.logout().catch(() => {});
    }
  }
}
