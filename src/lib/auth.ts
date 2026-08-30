/**
 * Moduł Auth: Bezpieczne haszowanie haseł (bcryptjs), losowe tokeny sesji,
 * trwała sesja (10 lat / 315360000 sekund), bezpieczne ciasteczka HttpOnly/Secure/SameSite=Lax.
 * Każda weryfikacja odbywa się bezpośrednio przez zapytanie do bazy danych (Prisma).
 */

import "server-only";

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { cache } from "react";
import type { CompanyProfile, CompanySettings, KsefSettings, User } from "@prisma/client";
import { prisma } from "./db";

export const SESSION_COOKIE = "fakturo_session";
export const ALT_SESSION_COOKIE = "auth_session";

/** Domyślny czas trwania sesji: 10 lat (trwała sesja do ręcznego wylogowania) */
export const SESSION_MAX_AGE_SECONDS = 315360000; // 10 lat w sekundach (10 * 365 * 24 * 3600)
export const SESSION_TTL_MS = SESSION_MAX_AGE_SECONDS * 1000; // 10 lat w milisekundach

const BCRYPT_ROUNDS = 12;
export const MIN_PASSWORD_LENGTH = 8;

export interface FullUserWithRelations extends User {
  company?: CompanySettings | null;
  companyProfiles?: CompanyProfile[];
  ksef?: KsefSettings | null;
}

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  nip?: string | null;
  companyName?: string | null;
  createdAt: string;
  company?: {
    name: string;
    nip: string;
    regon: string;
    street: string;
    city: string;
    postal: string;
    country: string;
    iban: string;
    bankName: string;
    email: string;
    phone: string;
  } | null;
  ksef?: {
    environment: string;
    tokenSet: boolean;
    tokenMask: string;
    certName: string;
    autoValidate: boolean;
  } | null;
};

export function toPublicUser(u: FullUserWithRelations): PublicUser {
  const defaultProfile = u.companyProfiles?.find((p) => p.isDefault) || u.companyProfiles?.[0];

  return {
    id: u.id,
    email: u.email,
    name: u.name,
    nip: u.nip || defaultProfile?.nip || u.company?.nip || "",
    companyName: u.companyName || defaultProfile?.companyName || u.company?.name || "",
    createdAt: u.createdAt.toISOString(),
    company: u.company
      ? {
          name: u.company.name,
          nip: u.company.nip,
          regon: u.company.regon,
          street: u.company.street,
          city: u.company.city,
          postal: u.company.postal,
          country: u.company.country,
          iban: u.company.iban,
          bankName: u.company.bankName,
          email: u.company.email,
          phone: u.company.phone,
        }
      : null,
    ksef: u.ksef
      ? {
          environment: u.ksef.environment,
          tokenSet: u.ksef.tokenSet,
          tokenMask: u.ksef.tokenMask,
          certName: u.ksef.certName,
          autoValidate: u.ksef.autoValidate,
        }
      : null,
  };
}

/* ── Hasła ─────────────────────────────────────────────────────────────── */

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Walidacja formatu e-mail + minimalnej długości hasła */
export function validateCredentials(email: string, password: string): { ok: boolean; reason?: string } {
  const e = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 254) {
    return { ok: false, reason: "invalid_email" };
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH || password.length > 128) {
    return { ok: false, reason: "weak_password" };
  }
  return { ok: true };
}

/* ── Tokeny i Sesje ─────────────────────────────────────────────────────── */

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface CreateSessionMetadata {
  userAgent?: string | null;
  ipAddress?: string | null;
}

/**
 * Tworzy nową trwałą sesję bezpośrednio w bazie danych Prisma.
 */
export async function createSession(
  userId: string,
  metadata?: CreateSessionMetadata
): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const session = await prisma.session.create({
    data: {
      sessionToken: token,
      userId,
      expiresAt,
      userAgent: metadata?.userAgent || null,
      ipAddress: metadata?.ipAddress || null,
    },
  });

  return { token, expiresAt, sessionId: session.id };
}

/* ── Cookie Options ─────────────────────────────────────────────────────── */

export interface SessionCookieOptions {
  maxAge?: number;
  secure?: boolean;
}

export function sessionCookieOptions(overrides?: SessionCookieOptions): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  const prod = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: prod && (overrides?.secure ?? true),
    sameSite: "lax",
    path: "/",
    maxAge: overrides?.maxAge ?? SESSION_MAX_AGE_SECONDS,
  };
}

export function clearSessionCookieValue(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/**
 * Pomocnicza funkcja wyciągająca User-Agent oraz adres IP z obiektu Request
 */
export function extractRequestMetadata(req: Request): CreateSessionMetadata {
  const userAgent = req.headers.get("user-agent");
  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    null;

  return { userAgent, ipAddress };
}

/* ── Bieżący użytkownik ─────────────────────────────────────────────────── */

export type SessionUser = { user: FullUserWithRelations; sessionId: string } | null;

/**
 * Odczyt sesji z cookie + weryfikacja w bazie Prisma.
 * React cache() zapewnia wykonanie tylko jednego zapytania DB na cykl żądania.
 */
export const getSession = cache(async (explicitToken?: string): Promise<SessionUser> => {
  let token = explicitToken;

  if (!token) {
    try {
      const store = cookies();
      token = store.get(SESSION_COOKIE)?.value || store.get(ALT_SESSION_COOKIE)?.value;
    } catch {
      token = undefined;
    }
  }

  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { sessionToken: token },
    include: {
      user: {
        include: {
          company: true,
          companyProfiles: true,
          ksef: true,
        },
      },
    },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    // Wygasła sesja — posprzątaj w bazie
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  return { user: session.user, sessionId: session.id };
});

export const getSessionUser = cache(async (): Promise<FullUserWithRelations | null> => {
  const s = await getSession();
  return s?.user ?? null;
});

/** Dla API routes: zwraca user lub null */
export async function requireApiUser(): Promise<SessionUser> {
  return getSession();
}
