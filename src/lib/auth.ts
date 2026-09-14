/**
 * Moduł Auth: Bezpieczne haszowanie haseł (bcryptjs, 12 rund), trwałe tokeny JWT i sesje DB (30 dni),
 * bezpieczne ciasteczka HttpOnly/Secure/SameSite=Lax (auth_session) zgodne z Netlify i Next.js.
 */

import "server-only";

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { cache } from "react";
import type { CompanyProfile, CompanySettings, KsefSettings, User } from "@prisma/client";
import { prisma } from "./db";

/** 30 dni w sekundach (30 * 24 * 3600) = 2592000s */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_TTL_MS = SESSION_MAX_AGE_SECONDS * 1000;

export const AUTH_SESSION_COOKIE = "auth_session";
export const PROD_COOKIE_NAME = "__Secure-next-auth.session-token";
export const DEV_COOKIE_NAME = "next-auth.session-token";
export const SESSION_COOKIE = "auth_session";

export const LEGACY_COOKIES = [
  "auth_session",
  "fakturo_session",
  DEV_COOKIE_NAME,
  PROD_COOKIE_NAME,
];

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
  role: "owner" | "accountant" | "viewer";
  nip?: string | null;
  companyName?: string | null;
  createdAt: string;
  termsAcceptedAt?: string | null;
  termsAcceptedVersion?: string | null;
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
    name: u.name || "",
    role: (u.role as "owner" | "accountant" | "viewer") || "owner",
    nip: u.nip || defaultProfile?.nip || u.company?.nip || "",
    companyName: u.companyName || defaultProfile?.companyName || u.company?.name || "",
    createdAt: u.createdAt.toISOString(),
    termsAcceptedAt: u.termsAcceptedAt ? u.termsAcceptedAt.toISOString() : null,
    termsAcceptedVersion: u.termsAcceptedVersion || null,
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

/* ── Hasła (Bcrypt 12 rund) ─────────────────────────────────────────────── */

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

export function normalizeEmail(raw: string): string {
  return (typeof raw === "string" ? raw : "").trim().toLowerCase();
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
 * Tworzy nową trwałą sesję JWT (30 dni) oraz rejestruje sesję w bazie danych.
 */
export async function createSession(
  userId: string,
  metadata?: CreateSessionMetadata
): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const token = generateSessionToken();
  const session = await prisma.session.create({
    data: {
      sessionToken: token, userId, expiresAt,
      userAgent: metadata?.userAgent || null,
      ipAddress: metadata?.ipAddress || null,
    },
  });
  return { token, expiresAt, sessionId: session.id };
}

/* ── Cookie Options dla Netlify i Localhost ──────────────────────────────── */

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
    secure: prod,
    sameSite: "lax",
    path: "/",
    maxAge: overrides?.maxAge ?? SESSION_MAX_AGE_SECONDS, // 30 dni (2592000s)
  };
}

export function clearSessionCookieValue(): string {
  const prod = process.env.NODE_ENV === "production";
  return `auth_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${prod ? "; Secure" : ""}`;
}

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
 * Odczyt sesji z ciasteczka (JWT / DB session) + weryfikacja w bazie Prisma.
 * Obsługuje nazwy ciasteczek standardowe: auth_session, fakturo_session, NextAuth.
 */
export const getSession = cache(async (explicitToken?: string): Promise<SessionUser> => {
  let token = explicitToken;

  if (!token) {
    try {
      const store = await cookies();
      for (const cookieName of ["auth_session", "fakturo_session", PROD_COOKIE_NAME, DEV_COOKIE_NAME]) {
        const val = store.get(cookieName)?.value;
        if (val) {
          token = val;
          break;
        }
      }
    } catch {
      token = undefined;
    }
  }

  if (!token) return null;

  // 2. Fallback: wyszukaj w tabeli Session w bazie danych
  try {
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

    if (session) {
      if (session.expiresAt.getTime() <= Date.now()) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
        return null;
      }
      return { user: session.user, sessionId: session.id };
    }
  } catch {
    // ignore db error on transient query
  }

  return null;
});

export const getSessionUser = cache(async (): Promise<FullUserWithRelations | null> => {
  const s = await getSession();
  return s?.user ?? null;
});

export async function requireApiUser(): Promise<SessionUser> {
  return getSession();
}
