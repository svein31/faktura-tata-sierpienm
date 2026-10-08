/**
 * Klient KSeF API v2.0 dla środowisk Next.js Serverless
 * Zgodny z oficjalną specyfikacją Ministerstwa Finansów (CIRFMF/ksef-api)
 */

import {
  KSEF_PROCESSING_STATUS,
  KSEF_V2_URLS,
  type KsefEnvironment,
  type KsefKeyInfo,
} from "./constants";
import {
  encryptInvoicePayload,
  encryptKsefToken,
  encryptRsaOaep,
  generateAesKey,
  generateIv,
  getStaticKsefKey,
  normalizePublicKeyPem,
  type EncryptedInvoicePackage,
} from "./crypto";
import * as crypto from "crypto";

export interface KsefChallengeResponse {
  challenge: string;
  timestamp: string;
  timestampMs: number;
  clientIp?: string;
}

export interface KsefSessionInitResult {
  referenceNumber: string;
  authenticationToken: string;
  accessToken: string;
  refreshToken?: string;
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

export interface KsefInvoiceHeader {
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
  /** Optional total deadline across authentication, status/UPO and transmission requests. */
  deadlineAtMs?: number;
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

/** Prosta pamięć podręczna certyfikatów MF w pamięci procesu */
const certCache = new Map<
  string,
  {
    fetchedAt: number;
    keys: {
      tokenEncryption: KsefKeyInfo;
      symmetricKeyEncryption: KsefKeyInfo;
    };
  }
>();

/** Pamięć podręczna otwartych sesji interaktywnych dla faktur */
const onlineSessionCache = new Map<
  string,
  {
    referenceNumber: string;
    symmetricKey: Buffer;
    iv: Buffer;
    validUntil: Date;
  }
>();

export class KsefClient {
  public readonly environment: KsefEnvironment;
  public readonly baseUrl: string;
  public readonly timeoutMs: number;
  private readonly deadlineAtMs?: number;

  constructor(options: KsefClientOptions = {}) {
    const envVar = (process.env.KSEF_ENV || process.env.KSEF_ENVIRONMENT || "test").toLowerCase();
    this.environment = options.environment || (envVar === "production" ? "production" : envVar === "demo" ? "demo" : "test");
    this.baseUrl = options.baseUrl || KSEF_V2_URLS[this.environment] || KSEF_V2_URLS.test;
    this.timeoutMs = options.timeoutMs || 25000;
    this.deadlineAtMs = options.deadlineAtMs;
  }

  /**
   * Pomocnicza metoda HTTP fetch z obsługą timeoutu i ujednoliconych błędów KSeF
   */
  public async request<T>(
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

    const remainingMs = this.deadlineAtMs === undefined ? this.timeoutMs : Math.min(this.timeoutMs, this.deadlineAtMs - Date.now());
    if (remainingMs <= 0) throw new KsefApiError("Wykorzystano budżet czasu workera KSeF.", 504, "WORKER_DEADLINE");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), remainingMs);

    try {
      const isOctetStream = (headers["Content-Type"] || "") === "application/octet-stream";
      const isXml = (headers["Content-Type"] || "") === "application/xml";

      let requestBody: BodyInit | undefined;
      if (body !== undefined) {
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
          throw new KsefApiError(`Błąd API KSeF (HTTP ${res.status}): ${text.slice(0, 300)}`, res.status, undefined, text);
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
          data?.exception?.exceptionDescription ||
          data?.message ||
          data?.status?.description ||
          data?.title ||
          (typeof data === "string" ? data.slice(0, 200) : `Błąd API KSeF (HTTP ${res.status})`);

        const code = data?.exception?.exceptionCode || data?.status?.code || data?.code || String(res.status);
        throw new KsefApiError(errorMsg, res.status, code, data);
      }

      return data as T;
    } catch (e) {
      if (e instanceof KsefApiError) throw e;
      if ((e as any)?.name === "AbortError") {
        throw new KsefApiError(`Przekroczono limit czasu połączenia z KSeF (${Math.ceil(remainingMs)}ms)`, 504, "TIMEOUT");
      }
      throw new KsefApiError(`Nie udało się połączyć z bramką KSeF: ${e instanceof Error ? e.message : String(e)}`, 502, "NETWORK_ERROR");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Sprawdza stan bramki KSeF (dostępność, certyfikaty, challenge, latency)
   */
  public async testConnectivity(): Promise<{
    success: boolean;
    pingMs: number;
    environment: KsefEnvironment;
    gatewayUrl: string;
    challenge?: string;
    certificatesCount?: number;
    error?: string;
  }> {
    if (this.environment === "demo") {
      return {
        success: true,
        pingMs: 15,
        environment: "demo",
        gatewayUrl: this.baseUrl,
        challenge: "DEMO-CHALLENGE-" + Date.now(),
        certificatesCount: 2,
      };
    }

    const start = Date.now();
    try {
      const [challengeRes, certs] = await Promise.all([
        this.getAuthorisationChallenge(),
        this.fetchPublicKeyCertificates(),
      ]);

      const pingMs = Date.now() - start;
      return {
        success: true,
        pingMs,
        environment: this.environment,
        gatewayUrl: this.baseUrl,
        challenge: challengeRes.challenge,
        certificatesCount: certs ? 2 : 0,
      };
    } catch (err) {
      return {
        success: false,
        pingMs: Date.now() - start,
        environment: this.environment,
        gatewayUrl: this.baseUrl,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Pobiera certyfikaty kluczy publicznych z KSeF 2.0:
   * GET /security/public-key-certificates
   */
  public async fetchPublicKeyCertificates(): Promise<{
    tokenEncryption: KsefKeyInfo;
    symmetricKeyEncryption: KsefKeyInfo;
  }> {
    const cacheKey = this.environment;
    const cached = certCache.get(cacheKey);
    // Cache ważny przez 1 godzinę
    if (cached && Date.now() - cached.fetchedAt < 3600_000) {
      return cached.keys;
    }

    // Fallback ze stałych
    const fallbackStatic = {
      tokenEncryption: getStaticKsefKey(this.environment, "tokenEncryption"),
      symmetricKeyEncryption: getStaticKsefKey(this.environment, "symmetricKeyEncryption"),
    };

    if (this.environment === "demo") {
      return fallbackStatic;
    }

    try {
      const certs = await this.request<any[]>("/security/public-key-certificates", {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!Array.isArray(certs) || certs.length === 0) {
        return fallbackStatic;
      }

      let tokenKey: KsefKeyInfo | null = null;
      let symKey: KsefKeyInfo | null = null;

      for (const item of certs) {
        if (!item.certificate) continue;
        const derBuf = Buffer.from(item.certificate, "base64");
        const x509 = new crypto.X509Certificate(derBuf);
        const pem = x509.publicKey.export({ type: "spki", format: "pem" }).toString();
        const normalizedPem = normalizePublicKeyPem(pem);
        const keyId = item.publicKeyId || item.certificateId || "";

        const usages: string[] = Array.isArray(item.usage) ? item.usage : [];
        if (usages.includes("KsefTokenEncryption") && !tokenKey) {
          tokenKey = { publicKeyPem: normalizedPem, publicKeyId: keyId };
        }
        if (usages.includes("SymmetricKeyEncryption") && !symKey) {
          symKey = { publicKeyPem: normalizedPem, publicKeyId: keyId };
        }
      }

      const resolved = {
        tokenEncryption: tokenKey || fallbackStatic.tokenEncryption,
        symmetricKeyEncryption: symKey || fallbackStatic.symmetricKeyEncryption,
      };

      certCache.set(cacheKey, { fetchedAt: Date.now(), keys: resolved });
      return resolved;
    } catch {
      return fallbackStatic;
    }
  }

  /**
   * KROK 1: Inicjalizacja uwierzytelnienia (POST /auth/challenge)
   */
  public async getAuthorisationChallenge(nip?: string): Promise<KsefChallengeResponse> {
    if (this.environment === "demo") {
      const timestampMs = Date.now();
      return {
        challenge: `DEMO-CHALLENGE-${crypto.randomBytes(16).toString("hex")}`,
        timestamp: new Date(timestampMs).toISOString(),
        timestampMs,
      };
    }
    const res = await this.request<any>("/auth/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {},
    });

    const timestampStr = res.timestamp || new Date().toISOString();
    const timestampMs = res.timestampMs ?? new Date(timestampStr).getTime();

    return {
      challenge: res.challenge,
      timestamp: timestampStr,
      timestampMs,
      clientIp: res.clientIp,
    };
  }

  /**
   * KROK 2-5: Pełny proces logowania KSeF 2.0 tokenem podatnika:
   * 1. POST /auth/challenge
   * 2. RSA-OAEP encrypt `${token}|${timestampMs}`
   * 3. POST /auth/ksef-token
   * 4. Polling GET /auth/{ref} do statusu 200
   * 5. POST /auth/token/redeem -> accessToken (JWT)
   */
  public async loginWithKsefToken(
    nip: string,
    ksefToken: string
  ): Promise<KsefSessionInitResult> {
    const cleanNip = nip.replace(/\D/g, "").trim();
    if (!cleanNip || cleanNip.length !== 10) {
      throw new KsefApiError("Wymagany jest poprawny 10-cyfrowy NIP podmiotu.", 400);
    }

    if (this.environment === "demo") {
      const ref = `REF-DEMO-${Date.now()}`;
      return {
        referenceNumber: ref,
        authenticationToken: `jwt-demo-auth-${ref}`,
        accessToken: `jwt-demo-access-${ref}`,
        validUntil: new Date(Date.now() + 8 * 3600_000).toISOString(),
      };
    }

    // 1. Challenge
    const challengeRes = await this.getAuthorisationChallenge(cleanNip);

    // 2. Certyfikat KsefTokenEncryption i szyfrowanie tokena
    const { tokenEncryption } = await this.fetchPublicKeyCertificates();
    const encryptedToken = encryptKsefToken(
      ksefToken,
      challengeRes.timestampMs,
      tokenEncryption.publicKeyPem
    );

    // 3. Rozpoczęcie uwierzytelnienia tokenem KSeF
    const initRes = await this.request<any>("/auth/ksef-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: {
        challenge: challengeRes.challenge,
        contextIdentifier: { type: "Nip", value: cleanNip },
        encryptedToken,
        ...(tokenEncryption.publicKeyId ? { publicKeyId: tokenEncryption.publicKeyId } : {}),
      },
    });

    const referenceNumber: string = initRes.referenceNumber;
    const opToken: string = initRes.authenticationToken?.token ?? initRes.authenticationToken ?? "";
    const opValidUntil: string = initRes.authenticationToken?.validUntil ?? new Date(Date.now() + 10 * 60_000).toISOString();

    if (!referenceNumber || !opToken) {
      throw new KsefApiError("KSeF nie zwrócił numeru referencyjnego sesji autoryzacyjnej.", 502);
    }

    // 4. Polling statusu operacji uwierzytelniania (max ~24 s)
    let statusCode = 100;
    const pollStart = Date.now();
    while (statusCode === 100 || statusCode === 150) {
      if (Date.now() - pollStart > 25_000) {
        throw new KsefApiError("Przekroczono limit czasu oczekiwania na potwierdzenie autoryzacji KSeF (timeout).", 504, "AUTH_TIMEOUT");
      }
      const pollWaitMs = this.deadlineAtMs === undefined ? 1800 : Math.min(1800, this.deadlineAtMs - Date.now());
      if (pollWaitMs <= 0) throw new KsefApiError("Wykorzystano budżet czasu uwierzytelnienia workera KSeF.", 504, "WORKER_DEADLINE");
      await new Promise((r) => setTimeout(r, pollWaitMs));

      const statusRes = await this.request<any>(`/auth/${encodeURIComponent(referenceNumber)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${opToken}`,
          Accept: "application/json",
        },
      });
      statusCode = Number(statusRes.status?.code ?? statusRes.statusCode ?? 0);
    }

    if (statusCode !== 200) {
      throw new KsefApiError(
        `Uwierzytelnianie KSeF nie powiodło się (kod odpowiedzi KSeF: ${statusCode}). Sprawdź poprawność tokena i uprawnienia dla NIP ${cleanNip}.`,
        401,
        "AUTH_FAILED"
      );
    }

    // 5. Odebranie docelowego JWT accessToken
    const redeemRes = await this.request<any>("/auth/token/redeem", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: {},
    });

    const accessToken: string = redeemRes.accessToken?.token ?? redeemRes.accessToken ?? "";
    const refreshToken: string = redeemRes.refreshToken?.token ?? redeemRes.refreshToken ?? "";
    const validUntil: string = redeemRes.accessToken?.validUntil ?? opValidUntil;

    if (!accessToken) {
      throw new KsefApiError("Nie udało się pobrać tokena dostępowego KSeF (token/redeem).", 502);
    }

    return {
      referenceNumber,
      authenticationToken: opToken,
      accessToken,
      refreshToken,
      validUntil,
    };
  }

  /**
   * Alias dla wstecznej kompatybilności
   */
  public async loginWithKsefTokenV2(nip: string, token: string): Promise<KsefSessionInitResult> {
    return this.loginWithKsefToken(nip, token);
  }

  /**
   * Otwiera sesję interaktywną KSeF 2.0 (POST /sessions/online) dla wysyłki faktur FA(3).
   * Generuje klucz AES-256 i IV, szyfruje klucz kluczem publicznym MF.
   */
  public async openOnlineSession(
    accessToken: string,
    existingKey?: { symmetricKey: Buffer; iv: Buffer }
  ): Promise<{
    referenceNumber: string;
    symmetricKey: Buffer;
    iv: Buffer;
    validUntil: Date;
  }> {
    if (this.environment === "demo") {
      const demoRef = `20260909-SO-DEMO-${Date.now().toString(16).toUpperCase()}`;
      return {
        referenceNumber: demoRef,
        symmetricKey: generateAesKey(),
        iv: generateIv(),
        validUntil: new Date(Date.now() + 12 * 3600_000),
      };
    }

    const symmetricKey = existingKey?.symmetricKey || generateAesKey();
    const iv = existingKey?.iv || generateIv();

    const { symmetricKeyEncryption } = await this.fetchPublicKeyCertificates();
    const encryptedSymmetricKey = encryptRsaOaep(symmetricKey, symmetricKeyEncryption.publicKeyPem);

    const body = {
      formCode: {
        systemCode: "FA (3)",
        schemaVersion: "1-0E",
        value: "FA",
      },
      encryption: {
        encryptedSymmetricKey,
        initializationVector: iv.toString("base64"),
        publicKeyId: symmetricKeyEncryption.publicKeyId,
      },
    };

    const res = await this.request<any>("/sessions/online", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
    });

    const ref = res.referenceNumber;
    const validUntil = res.validUntil ? new Date(res.validUntil) : new Date(Date.now() + 12 * 3600_000);

    const sessionInfo = {
      referenceNumber: ref,
      symmetricKey,
      iv,
      validUntil,
    };

    onlineSessionCache.set(ref, sessionInfo);
    return sessionInfo;
  }

  /**
   * Wysyła zaszyfrowaną e-Fakturę w ramach sesji interaktywnej:
   * POST /sessions/online/{sessionReferenceNumber}/invoices
   */
  public async sendInvoiceEncrypted(
    accessToken: string,
    sessionRef: string,
    xmlContent: string,
    symmetricKey: Buffer,
    iv: Buffer,
    offlineMode = false
  ): Promise<KsefInvoiceSendResult> {
    if (this.environment === "demo") {
      const now = new Date();
      const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const elemRef = `${ymd}-EE-${Date.now().toString(16).toUpperCase().slice(-10)}`;
      return {
        referenceNumber: sessionRef,
        elementReferenceNumber: elemRef,
        timestamp: now.toISOString(),
        status: "PENDING",
      };
    }

    const encPackage: EncryptedInvoicePackage = encryptInvoicePayload(xmlContent, symmetricKey, iv);

    const sendPayload = {
      invoiceHash: encPackage.plainDigestBase64,
      invoiceSize: encPackage.plainFileSize,
      encryptedInvoiceHash: encPackage.encryptedDigestBase64,
      encryptedInvoiceSize: encPackage.encryptedFileSize,
      encryptedInvoiceContent: encPackage.encryptedDataBase64,
      offlineMode,
    };

    const sendRes = await this.request<any>(`/sessions/online/${encodeURIComponent(sessionRef)}/invoices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: sendPayload,
    });

    const invoiceRefNumber = sendRes.referenceNumber || "";

    return {
      referenceNumber: sessionRef,
      elementReferenceNumber: invoiceRefNumber,
      timestamp: new Date().toISOString(),
      status: "PENDING",
    };
  }

  /**
   * Sprawdza status faktury w sesji KSeF 2.0 i pobiera UPO w razie sukcesu:
   * GET /sessions/{sessionRef}/invoices/{invoiceRef}
   */
  public async getInvoiceStatus(
    accessToken: string,
    sessionRef: string,
    invoiceRef: string
  ): Promise<KsefInvoiceStatusResult> {
    if (this.environment === "demo") {
      const demoKsefNum = `5260301706-20260909-${Date.now().toString(16).slice(-12).toUpperCase()}-11`;
      return {
        processingCode: 200,
        processingDescription: "Dokument zarejestrowany poprawnie w KSeF (demo)",
        ksefReferenceNumber: demoKsefNum,
        acquisitionTimestamp: new Date().toISOString(),
        status: "ACCEPTED",
        upoXml: generateDemoUpoXml(invoiceRef, demoKsefNum),
      };
    }

    const statusRes = await this.request<any>(
      `/sessions/${encodeURIComponent(sessionRef)}/invoices/${encodeURIComponent(invoiceRef)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );

    const code = Number(statusRes.status?.code ?? 100);
    const desc = statusRes.status?.description || KSEF_PROCESSING_STATUS[code] || "W trakcie przetwarzania";
    const ksefNum = statusRes.ksefNumber;

    let status: "PENDING" | "ACCEPTED" | "REJECTED" = "PENDING";
    let upoXml: string | undefined = undefined;

    if (code === 200) {
      status = "ACCEPTED";
      // Pobranie UPO faktury
      try {
        upoXml = await this.downloadInvoiceUpo(accessToken, sessionRef, invoiceRef, ksefNum);
      } catch {
        // UPO może być jeszcze generowane
      }
    } else if (code >= 300) {
      status = "REJECTED";
    }

    return {
      processingCode: code,
      processingDescription: desc,
      ksefReferenceNumber: ksefNum,
      acquisitionTimestamp: statusRes.invoicingDate || new Date().toISOString(),
      upoXml,
      status,
      raw: statusRes,
    };
  }

  /**
   * Pobiera urzędowe poświadczenie odbioru (UPO) z sesji
   */
  public async downloadInvoiceUpo(
    accessToken: string,
    sessionRef: string,
    invoiceRef: string,
    ksefNumber?: string
  ): Promise<string> {
    if (this.environment === "demo") {
      return generateDemoUpoXml(invoiceRef, ksefNumber || "DEMO-KSEF-NUM");
    }

    // Najpierw spróbuj po numerze KSeF jeśli istnieje
    if (ksefNumber) {
      try {
        return await this.request<string>(
          `/sessions/${encodeURIComponent(sessionRef)}/invoices/ksef/${encodeURIComponent(ksefNumber)}/upo`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/xml, text/xml",
            },
            rawResponse: true,
          }
        );
      } catch {
        // kontynuuj do invoiceRef
      }
    }

    return await this.request<string>(
      `/sessions/${encodeURIComponent(sessionRef)}/invoices/${encodeURIComponent(invoiceRef)}/upo`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/xml, text/xml",
        },
        rawResponse: true,
      }
    );
  }

  /**
   * Pobiera metadane faktur zakupowych (nabywca = Subject2):
   * POST /invoices/query/metadata
   */
  public async queryIncomingInvoices(
    accessToken: string,
    from: Date,
    to: Date,
    pageOffset = 0,
    pageSize = 100
  ): Promise<KsefInvoiceQueryResult> {
    if (this.environment === "demo") {
      return {
        invoiceHeaders: [],
        hasMore: false,
        isTruncated: false,
        numberOfElements: 0,
        pageOffset,
        pageSize,
        raw: {},
      };
    }

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
      }
    );

    const rawInvoices: unknown[] = Array.isArray(result?.invoices)
      ? result.invoices
      : Array.isArray(result?.invoiceHeaderList)
        ? result.invoiceHeaderList
        : [];

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
   * Pobiera dokument XML faktury z KSeF (GET /invoices/ksef/{ksefNumber})
   */
  public async downloadInvoiceXml(accessToken: string, ksefNumber: string): Promise<string> {
    if (this.environment === "demo") {
      return `<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"><Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza></Naglowek></Faktura>`;
    }

    return await this.request<string>(`/invoices/ksef/${encodeURIComponent(ksefNumber)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/xml, text/xml, application/octet-stream",
      },
      rawResponse: true,
    });
  }
}

/**
 * Generator Urzędowego Poświadczenia Odbioru (UPO) zgodnego ze strukturą MF
 */
export function generateDemoUpoXml(elementReferenceNumber: string, ksefReferenceNumber: string): string {
  const date = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<Potwierdzenie xmlns="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2024/01/17/eD/DefinicjeTypy/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <NazwaStrukturyLogicznej>FA(3)</NazwaStrukturyLogicznej>
  <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
  <WariantFormularza>3</WariantFormularza>
  <NumerKSeF>${ksefReferenceNumber}</NumerKSeF>
  <NumerReferencyjnySesji>${elementReferenceNumber}</NumerReferencyjnySesji>
  <DataICzasDoreczenia>${date}</DataICzasDoreczenia>
  <Status>200</Status>
  <OpisStatusu>SYMULACJA DEMO: dokument nie został wysłany do Ministerstwa Finansów; to potwierdzenie nie jest urzędowym UPO.</OpisStatusu>
</Potwierdzenie>`;
}
