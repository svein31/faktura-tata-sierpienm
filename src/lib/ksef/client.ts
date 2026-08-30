/**
 * Klient KSeF API v2.0 dla środowisk Next.js Serverless (Netlify Functions)
 */

import { KSEF_PROCESSING_STATUS, KSEF_URLS, type KsefEnvironment } from "./constants";
import { encryptInvoicePayload, encryptKsefToken, getKsefPublicKey, type EncryptedInvoicePackage } from "./crypto";

export interface KsefChallengeResponse {
  challenge: string;
  timestamp: string;
}

export interface KsefSessionInitResult {
  referenceNumber: string;
  authenticationToken: string;
  accessToken: string;
  validUntil: string;
}

export interface KsefInvoiceSendResult {
  referenceNumber: string;
  elementReferenceNumber: string;
  timestamp: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
}

export interface KsefInvoiceStatusResult {
  processingCode: number;
  processingDescription: string;
  ksefReferenceNumber?: string;
  acquisitionTimestamp?: string;
  upoXml?: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  raw?: unknown;
}

export interface KsefClientOptions {
  environment?: KsefEnvironment;
  timeoutMs?: number;
  baseUrl?: string;
}

export class KsefApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public errorCode?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "KsefApiError";
  }
}

export class KsefClient {
  public readonly environment: KsefEnvironment;
  public readonly baseUrl: string;
  public readonly timeoutMs: number;

  constructor(options: KsefClientOptions = {}) {
    const envVar = (process.env.KSEF_ENV || process.env.KSEF_ENVIRONMENT || "test").toLowerCase();
    this.environment = options.environment || (envVar === "production" ? "production" : envVar === "demo" ? "demo" : "test");
    this.baseUrl = options.baseUrl || KSEF_URLS[this.environment] || KSEF_URLS.test;
    this.timeoutMs = options.timeoutMs || 12000; // Netlify Serverless friendly timeout
  }

  /**
   * Pomocnicza metoda HTTP fetch z obsługą timeoutu i obsługi błędów KSeF
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      body?: unknown;
      headers?: Record<string, string>;
      rawResponse?: boolean;
    } = {}
  ): Promise<T> {
    const { method = "GET", body, headers = {}, rawResponse = false } = options;
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const isOctetStream = headers["Content-Type"] === "application/octet-stream";
      const isXml = headers["Content-Type"] === "application/xml";

      let requestBody: BodyInit | undefined;
      if (body) {
        if (isOctetStream || isXml || typeof body === "string") {
          requestBody = body as BodyInit;
        } else {
          requestBody = JSON.stringify(body);
          if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
        }
      }

      headers["Accept"] = headers["Accept"] || "application/json";

      const res = await fetch(url, {
        method,
        headers,
        body: requestBody,
        signal: controller.signal,
      });

      if (rawResponse) {
        const text = await res.text();
        return text as unknown as T;
      }

      const contentType = res.headers.get("content-type") || "";
      let data: any;
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        data = await res.text();
      }

      if (!res.ok) {
        const errorMsg =
          data?.exception?.exceptionDetailList?.map((e: any) => e.description).join("; ") ||
          data?.message ||
          data?.status?.description ||
          `Błąd API KSeF (HTTP ${res.status})`;

        throw new KsefApiError(errorMsg, res.status, data?.exception?.exceptionCode, data);
      }

      return data as T;
    } catch (e) {
      if (e instanceof KsefApiError) throw e;
      if ((e as any)?.name === "AbortError") {
        throw new KsefApiError(`Przekroczono limit czasu połączenia z KSeF (${this.timeoutMs}ms)`, 504, "TIMEOUT");
      }
      throw new KsefApiError(`Nie udało się połączyć z bramką KSeF: ${e instanceof Error ? e.message : String(e)}`, 502, "NETWORK_ERROR");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * KROK 1: Pobranie wyzwania autoryzacyjnego (AuthorisationChallenge)
   */
  public async getAuthorisationChallenge(nip: string): Promise<KsefChallengeResponse> {
    const cleanNip = nip.replace(/[^0-9]/g, "").trim();

    if (this.environment === "demo") {
      const now = new Date();
      return {
        challenge: `DEMO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${Math.random().toString(36).slice(2, 12)}`,
        timestamp: now.toISOString(),
      };
    }

    try {
      // API v2 endpoint dla wyzwania autoryzacji
      const payload = {
        contextIdentifier: {
          type: "onip",
          identifier: cleanNip,
        },
      };

      const res = await this.request<any>("/online/Session/AuthorisationChallenge", {
        method: "POST",
        body: payload,
      });

      return {
        challenge: res.challenge,
        timestamp: res.timestamp || new Date().toISOString(),
      };
    } catch (err) {
      // Fallback do drugiego wariantu endpointu KSeF 2.0 jeśli pierwszy zwróci 404
      if (err instanceof KsefApiError && err.statusCode === 404) {
        const res = await this.request<any>("/v2/auth/challenge", {
          method: "POST",
          body: { nip: cleanNip },
        });
        return {
          challenge: res.challenge,
          timestamp: res.timestamp || new Date().toISOString(),
        };
      }
      throw err;
    }
  }

  /**
   * KROK 2 & 3: Inicjalizacja sesji z zaszyfrowanym tokenem KSeF i wymiana na JWT Access Token
   */
  public async loginWithKsefToken(
    nip: string,
    token: string,
    publicKeyPem?: string
  ): Promise<KsefSessionInitResult> {
    const cleanNip = nip.replace(/[^0-9]/g, "").trim();
    const pubKey = publicKeyPem || getKsefPublicKey(this.environment);

    if (this.environment === "demo") {
      const now = new Date();
      const validUntil = new Date(now.getTime() + 2 * 3600 * 1000).toISOString();
      const ref = `DEMO-SESSION-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
      const jwtDemo = `demo.jwt.token.${Buffer.from(JSON.stringify({ nip: cleanNip, exp: Math.floor(Date.now() / 1000) + 7200 })).toString("base64")}`;

      return {
        referenceNumber: ref,
        authenticationToken: `auth-${ref}`,
        accessToken: jwtDemo,
        validUntil,
      };
    }

    // 1. Pobieramy Challenge
    const challengeRes = await this.getAuthorisationChallenge(cleanNip);

    // 2. Szyfrujemy token RSA-OAEP SHA-256 z timestampem wyzwania
    const encryptedTokenBase64 = encryptKsefToken(token, challengeRes.timestamp, pubKey);

    // 3. Tworzymy żądanie InitSessionTokenRequest
    const initPayload = `<?xml version="1.0" encoding="utf-8"?>
<InitSessionTokenRequest xmlns="http://ksef.mf.gov.pl/schema/gtw/schematy/2021/10/01/0001/InitSessionTokenRequest" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Context>
    <Challenge>${challengeRes.challenge}</Challenge>
    <Identifier xsi:type="onip">
      <Identifier>${cleanNip}</Identifier>
    </Identifier>
    <DocumentType>
      <Service>KSeF</Service>
      <FormCode>
        <SystemCode>FA (3)</SystemCode>
        <SchemaVersion>1-0E</SchemaVersion>
        <TargetNamespace>http://crd.gov.pl/wzor/2025/06/25/13775/</TargetNamespace>
        <Value>FA</Value>
      </FormCode>
    </DocumentType>
    <Token>${encryptedTokenBase64}</Token>
  </Context>
</InitSessionTokenRequest>`;

    let initRes: any;
    try {
      initRes = await this.request<any>("/online/Session/InitToken", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          Accept: "application/json",
        },
        body: initPayload,
      });
    } catch (err) {
      if (err instanceof KsefApiError && err.statusCode === 404) {
        initRes = await this.request<any>("/v2/auth/ksef-token", {
          method: "POST",
          body: {
            nip: cleanNip,
            challenge: challengeRes.challenge,
            encryptedToken: encryptedTokenBase64,
          },
        });
      } else {
        throw err;
      }
    }

    const sessionToken = initRes.sessionToken?.token || initRes.authenticationToken || initRes.token || "";
    const referenceNumber = initRes.referenceNumber || `REF-${Date.now()}`;
    const validUntil = initRes.validUntil || new Date(Date.now() + 2 * 3600 * 1000).toISOString();

    return {
      referenceNumber,
      authenticationToken: sessionToken,
      accessToken: sessionToken,
      validUntil,
    };
  }

  /**
   * KROK 4: Wysyłka zaszyfrowanej e-Faktury do KSeF API
   */
  public async sendInvoiceEncrypted(
    sessionToken: string,
    xmlContent: string,
    publicKeyPem?: string
  ): Promise<KsefInvoiceSendResult> {
    const pubKey = publicKeyPem || getKsefPublicKey(this.environment);
    const encPackage: EncryptedInvoicePackage = encryptInvoicePayload(xmlContent, pubKey);

    if (this.environment === "demo") {
      const now = new Date();
      const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
      const elRef = `${ymd}-EE-${rand}-01`;
      const ref = `DEMO-SEND-${Date.now()}`;

      return {
        referenceNumber: ref,
        elementReferenceNumber: elRef,
        timestamp: now.toISOString(),
        status: "PENDING",
      };
    }

    const sendPayload = {
      invoiceHash: {
        fileSize: encPackage.plainFileSize,
        hashSHA: {
          algorithm: "SHA-256",
          encoding: "Base64",
          value: encPackage.plainDigestBase64,
        },
      },
      encryptedInvoiceHash: {
        fileSize: encPackage.encryptedFileSize,
        hashSHA: {
          algorithm: "SHA-256",
          encoding: "Base64",
          value: encPackage.encryptedDigestBase64,
        },
      },
      encryptedInvoiceBody: encPackage.encryptedDataBase64,
    };

    let sendRes: any;
    try {
      sendRes = await this.request<any>("/online/Invoice/Send", {
        method: "POST",
        headers: {
          SessionToken: sessionToken,
          "Content-Type": "application/json",
        },
        body: sendPayload,
      });
    } catch (err) {
      if (err instanceof KsefApiError && err.statusCode === 404) {
        sendRes = await this.request<any>("/v2/online/Invoice/Send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            SessionToken: sessionToken,
          },
          body: sendPayload,
        });
      } else {
        throw err;
      }
    }

    return {
      referenceNumber: sendRes.referenceNumber || "",
      elementReferenceNumber: sendRes.elementReferenceNumber || "",
      timestamp: sendRes.timestamp || new Date().toISOString(),
      status: "PENDING",
    };
  }

  /**
   * KROK 5: Sprawdzenie statusu przetwarzania faktury i odbiór UPO
   */
  public async getInvoiceStatus(
    sessionToken: string,
    elementReferenceNumber: string
  ): Promise<KsefInvoiceStatusResult> {
    if (this.environment === "demo") {
      const now = new Date();
      const ksefRef = `5260301706-${now.toISOString().slice(0, 10).replace(/-/g, "")}-DEMO123456-A1`;
      const upoDemoXml = generateDemoUpoXml(elementReferenceNumber, ksefRef);

      return {
        processingCode: 200,
        processingDescription: KSEF_PROCESSING_STATUS[200],
        ksefReferenceNumber: ksefRef,
        acquisitionTimestamp: now.toISOString(),
        upoXml: upoDemoXml,
        status: "ACCEPTED",
        raw: { code: 200, demo: true },
      };
    }

    let statusRes: any;
    try {
      statusRes = await this.request<any>(`/online/Invoice/Status/${encodeURIComponent(elementReferenceNumber)}`, {
        method: "GET",
        headers: {
          SessionToken: sessionToken,
        },
      });
    } catch (err) {
      if (err instanceof KsefApiError && err.statusCode === 404) {
        statusRes = await this.request<any>(`/v2/online/Invoice/Status/${encodeURIComponent(elementReferenceNumber)}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            SessionToken: sessionToken,
          },
        });
      } else {
        throw err;
      }
    }

    const code = Number(statusRes.processingCode) || 100;
    const desc = statusRes.processingDescription || (KSEF_PROCESSING_STATUS as any)[code] || "W trakcie przetwarzania";

    let status: "PENDING" | "ACCEPTED" | "REJECTED" = "PENDING";
    let upoXml: string | undefined = undefined;
    const ksefRef = statusRes.elementStatus?.ksefReferenceNumber || statusRes.ksefReferenceNumber;

    if (code === 200) {
      status = "ACCEPTED";
      // Jeśli KSeF dołączył UPO w Base64 lub XML
      if (statusRes.upo) {
        upoXml = statusRes.upo.startsWith("<") ? statusRes.upo : Buffer.from(statusRes.upo, "base64").toString("utf8");
      }
    } else if (code >= 300) {
      status = "REJECTED";
    }

    return {
      processingCode: code,
      processingDescription: desc,
      ksefReferenceNumber: ksefRef,
      acquisitionTimestamp: statusRes.elementStatus?.acquisitionTimestamp || statusRes.acquisitionTimestamp,
      upoXml,
      status,
      raw: statusRes,
    };
  }

  /**
   * KROK 6: Pobranie faktury XML z KSeF
   */
  public async downloadInvoiceXml(
    sessionToken: string,
    ksefReferenceNumber: string
  ): Promise<string> {
    if (this.environment === "demo") {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <!-- Demo faktura pobrana z KSeF: ${ksefReferenceNumber} -->
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
  </Naglowek>
</Faktura>`;
    }

    const xml = await this.request<string>(`/online/Invoice/Get/${encodeURIComponent(ksefReferenceNumber)}`, {
      method: "GET",
      headers: {
        SessionToken: sessionToken,
        Accept: "application/xml",
      },
      rawResponse: true,
    });

    return xml;
  }
}

/**
 * Generator Urzędowego Poświadczenia Odbioru (UPO) dla środowiska demo / test
 */
export function generateDemoUpoXml(elementReferenceNumber: string, ksefReferenceNumber: string): string {
  const date = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<Potwierdzenie xmlns="http://ksef.mf.gov.pl/schema/gtw/schematy/2021/10/01/0001/Potwierdzenie" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <NazwaStrukturyLogicznej>FA(3)</NazwaStrukturyLogicznej>
  <KodFormularza>FA (3)</KodFormularza>
  <WariantFormularza>3</WariantFormularza>
  <NumerIdentyfikacyjny>${ksefReferenceNumber}</NumerIdentyfikacyjny>
  <NumerReferencyjnyDokumentu>${elementReferenceNumber}</NumerReferencyjnyDokumentu>
  <DataICzasDoreczenia>${date}</DataICzasDoreczenia>
  <DataICzasWystawienia>${date}</DataICzasWystawienia>
  <Status>200</Status>
  <OpisStatusu>Dokument został zarejestrowany w Krajowym Systemie e-Faktur.</OpisStatusu>
</Potwierdzenie>`;
}
