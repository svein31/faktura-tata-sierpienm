/**
 * Klient KSeF API v2.0 dla środowisk Next.js Serverless (Netlify Functions)
 */

import { KSEF_PROCESSING_STATUS, KSEF_URLS, KSEF_V2_URLS, type KsefEnvironment } from "./constants";
import { encryptInvoicePayload, encryptKsefToken, getKsefPublicKey, normalizePublicKeyPem, type EncryptedInvoicePackage } from "./crypto";
import * as crypto from "crypto";

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

/**
 * Metadane faktury w formacie zwracanym przez KSeF v2
 * (POST /invoices/query/metadata → InvoiceMetadata).
 */
export interface KsefInvoiceHeader {
  /** Numer KSeF (v2: `ksefNumber`; v1 fallback: `ksefReferenceNumber`). */
  ksefNumber: string;
  ksefReferenceNumber?: string;
  invoiceNumber?: string;
  invoiceReferenceNumber?: string;
  issueDate?: string;
  invoicingDate?: string;
  acquisitionDate?: string;
  acquisitionTimestamp?: string;
  permanentStorageDate?: string;
  seller?: { nip?: string; name?: string };
  buyer?: { identifier?: { type?: string; value?: string }; name?: string };
  netAmount?: number;
  grossAmount?: number;
  vatAmount?: number;
  currency?: string;
  upo?: string;
  [key: string]: unknown;
}

export interface KsefInvoiceQueryResult {
  invoiceHeaders: KsefInvoiceHeader[];
  hasMore: boolean;
  isTruncated: boolean;
  permanentStorageHwmDate?: string;
  numberOfElements: number;
  pageOffset: number;
  pageSize: number;
  raw: unknown;
}

export interface KsefClientOptions {
  environment?: KsefEnvironment;
  timeoutMs?: number;
  /** Nadpisuje adres bazowy KSeF 1.x (legacy, wyssyłka faktur). */
  baseUrl?: string;
  /** Nadpisuje adres bazowy KSeF 2.0 (pobieranie faktur, uwierzytelnianie JWT). */
  baseUrlV2?: string;
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
  public readonly baseUrlV2: string;
  public readonly timeoutMs: number;

  constructor(options: KsefClientOptions = {}) {
    const envVar = (process.env.KSEF_ENV || process.env.KSEF_ENVIRONMENT || "test").toLowerCase();
    this.environment = options.environment || (envVar === "production" ? "production" : envVar === "demo" ? "demo" : "test");
    this.baseUrl = options.baseUrl || KSEF_URLS[this.environment] || KSEF_URLS.test;
    this.baseUrlV2 = options.baseUrlV2 || KSEF_V2_URLS[this.environment] || KSEF_V2_URLS.test;
    this.timeoutMs = options.timeoutMs || 12000;
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
      /** Nadpisuje bazę URL dla tego konkretnego wywołania. */
      baseUrl?: string;
    } = {}
  ): Promise<T> {
    const { method = "GET", body, headers = {}, rawResponse = false, baseUrl } = options;
    const effectiveBaseUrl = baseUrl || this.baseUrl;
    const url = `${effectiveBaseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const isOctetStream = (headers["Content-Type"] || "") === "application/octet-stream";
      const isXml = (headers["Content-Type"] || "") === "application/xml";

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
        if (!res.ok) {
          throw new KsefApiError(`Błąd API KSeF (HTTP ${res.status})`, res.status, undefined, text);
        }
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

  // ────────────────────────────────────────────────────────────────────────────
  // KSeF 2.0 – uwierzytelnianie JWT
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Pobiera certyfikat klucza publicznego do szyfrowania tokena KSeF
   * z endpointu KSeF v2: GET /security/public-key-certificates
   *
   * Zwraca `{ pem: string; publicKeyId: string }` dla klucza `KsefTokenEncryption`.
   */
  public async fetchPublicKeyCertificate(): Promise<{ pem: string; publicKeyId: string }> {
    let certs: any[];
    try {
      certs = await this.request<any[]>("/security/public-key-certificates", {
        method: "GET",
        headers: { Accept: "application/json" },
        baseUrl: this.baseUrlV2,
      });
    } catch {
      // Fallback: użyj wbudowanego klucza środowiskowego
      return { pem: getKsefPublicKey(this.environment), publicKeyId: "" };
    }

    const encCert = (Array.isArray(certs) ? certs : []).find(
      (c: any) => Array.isArray(c.usage) && c.usage.includes("KsefTokenEncryption")
    );
    if (!encCert?.certificate) {
      return { pem: getKsefPublicKey(this.environment), publicKeyId: "" };
    }

    try {
      const derBuf = Buffer.from(encCert.certificate, "base64");
      const x509 = new crypto.X509Certificate(derBuf);
      const pem = x509.publicKey.export({ type: "spki", format: "pem" }).toString();
      return { pem: normalizePublicKeyPem(pem), publicKeyId: encCert.publicKeyId ?? "" };
    } catch {
      return { pem: getKsefPublicKey(this.environment), publicKeyId: encCert.publicKeyId ?? "" };
    }
  }

  /**
   * Pełny flow uwierzytelniania KSeF 2.0 tokenem KSeF:
   *  1. POST /auth/challenge – pobierz challenge
   *  2. Zaszyfruj `token|timestampMs` kluczem publicznym MF
   *  3. POST /auth/ksef-token – zainicjuj uwierzytelnianie, odbierz authenticationToken
   *  4. GET /auth/{referenceNumber} (poll) – czekaj na status 200
   *  5. POST /auth/token/redeem – odbierz accessToken + refreshToken
   *
   * Zwraca accessToken (JWT) używany jako Bearer w dalszych wywołaniach.
   */
  public async loginWithKsefTokenV2(
    nip: string,
    ksefToken: string
  ): Promise<KsefSessionInitResult> {
    const cleanNip = nip.replace(/\D/g, "").trim();

    // 1. Challenge
    const challengeRes = await this.request<any>("/auth/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: {},
      baseUrl: this.baseUrlV2,
    });
    const challenge: string = challengeRes.challenge;
    const timestampMs: number = challengeRes.timestampMs ?? new Date(challengeRes.timestamp ?? Date.now()).getTime();

    // 2. Klucz publiczny + szyfrowanie
    const { pem, publicKeyId } = await this.fetchPublicKeyCertificate();
    const encryptedToken = encryptKsefToken(ksefToken, timestampMs, pem);

    // 3. Inicjalizacja sesji tokenem
    const initRes = await this.request<any>("/auth/ksef-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: {
        challenge,
        contextIdentifier: { type: "Nip", value: cleanNip },
        encryptedToken,
        ...(publicKeyId ? { publicKeyId } : {}),
      },
      baseUrl: this.baseUrlV2,
    });
    const referenceNumber: string = initRes.referenceNumber;
    const operationToken: string = initRes.authenticationToken?.token ?? initRes.authenticationToken ?? "";
    const operationTokenValidUntil: string = initRes.authenticationToken?.validUntil ?? new Date(Date.now() + 5 * 60_000).toISOString();

    // 4. Polling statusu uwierzytelniania (max ~24 s)
    let statusCode = 100;
    const pollStart = Date.now();
    while (statusCode === 100 || statusCode === 150) {
      if (Date.now() - pollStart > 24_000) {
        throw new KsefApiError("Przekroczono czas oczekiwania na uwierzytelnianie KSeF (timeout 24 s).", 504, "AUTH_TIMEOUT");
      }
      await new Promise((r) => setTimeout(r, 2_000));
      const statusRes = await this.request<any>(`/auth/${encodeURIComponent(referenceNumber)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${operationToken}`,
          Accept: "application/json",
        },
        baseUrl: this.baseUrlV2,
      });
      statusCode = Number(statusRes.status?.code ?? statusRes.statusCode ?? 0);
    }

    if (statusCode !== 200) {
      throw new KsefApiError(
        `Uwierzytelnianie KSeF nie powiodło się (kod statusu: ${statusCode}).`,
        401,
        "AUTH_FAILED"
      );
    }

    // 5. Pobranie tokenów dostępowych
    const redeemRes = await this.request<any>("/auth/token/redeem", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${operationToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: {},
      baseUrl: this.baseUrlV2,
    });
    const accessToken: string = redeemRes.accessToken?.token ?? redeemRes.accessToken ?? "";
    const refreshToken: string = redeemRes.refreshToken?.token ?? redeemRes.refreshToken ?? "";
    const validUntil: string = redeemRes.accessToken?.validUntil ?? operationTokenValidUntil;

    return {
      referenceNumber,
      authenticationToken: refreshToken || operationToken,
      accessToken,
      validUntil,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // KSeF 2.0 – pobieranie faktur
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Pobiera stronę metadanych faktur, w których zalogowany podmiot jest nabywcą,
   * używając KSeF API v2.0 (POST /invoices/query/metadata, Subject2, PermanentStorage).
   */
  public async queryIncomingInvoices(
    accessToken: string,
    from: Date,
    to: Date,
    pageOffset = 0,
    pageSize = 100
  ): Promise<KsefInvoiceQueryResult> {
    const result = await this.request<any>(
      `/invoices/query/metadata?pageOffset=${pageOffset}&pageSize=${Math.min(pageSize, 250)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: {
          subjectType: "Subject2",
          dateRange: {
            dateType: "PermanentStorage",
            from: from.toISOString(),
            to: to.toISOString(),
          },
        },
        baseUrl: this.baseUrlV2,
      }
    );

    const rawInvoices: unknown[] = Array.isArray(result?.invoices)
      ? result.invoices
      : Array.isArray(result?.invoiceHeaderList)
        ? result.invoiceHeaderList
        : [];

    // Normalizuj do wspólnego interfejsu KsefInvoiceHeader
    const invoiceHeaders: KsefInvoiceHeader[] = rawInvoices.map((inv: any) => ({
      ksefNumber: inv.ksefNumber ?? inv.ksefReferenceNumber ?? "",
      ksefReferenceNumber: inv.ksefReferenceNumber ?? inv.ksefNumber ?? "",
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate,
      invoicingDate: inv.invoicingDate,
      acquisitionDate: inv.acquisitionDate,
      acquisitionTimestamp: inv.acquisitionDate ?? inv.acquisitionTimestamp,
      permanentStorageDate: inv.permanentStorageDate,
      seller: inv.seller,
      buyer: inv.buyer,
      netAmount: inv.netAmount,
      grossAmount: inv.grossAmount,
      vatAmount: inv.vatAmount,
      currency: inv.currency,
    }));

    return {
      invoiceHeaders,
      hasMore: Boolean(result?.hasMore),
      isTruncated: Boolean(result?.isTruncated),
      permanentStorageHwmDate: result?.permanentStorageHwmDate,
      numberOfElements: Number(result?.numberOfElements ?? invoiceHeaders.length),
      pageOffset,
      pageSize,
      raw: result,
    };
  }

  /**
   * Pobiera dokument XML faktury z KSeF.
   *
   * Próbuje najpierw KSeF v2 (GET /invoices/ksef/{ksefNumber}),
   * a przy błędzie spada na KSeF v1 (GET /online/Invoice/Get/{id}).
   */
  public async downloadInvoiceXml(
    accessToken: string,
    ksefNumber: string
  ): Promise<string> {
    // KSeF v2 – primary
    try {
      const xml = await this.request<string>(`/invoices/ksef/${encodeURIComponent(ksefNumber)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/xml, text/xml, application/octet-stream",
        },
        rawResponse: true,
        baseUrl: this.baseUrlV2,
      });
      return xml;
    } catch (v2err) {
      if (v2err instanceof KsefApiError && (v2err.statusCode === 404 || v2err.statusCode === 401)) {
        // fallback do KSeF v1 (legacy środowiska testowe)
        const xml = await this.request<string>(`/online/Invoice/Get/${encodeURIComponent(ksefNumber)}`, {
          method: "GET",
          headers: {
            SessionToken: accessToken,
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/octet-stream, application/xml",
          },
          rawResponse: true,
        });
        return xml;
      }
      throw v2err;
    }
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
