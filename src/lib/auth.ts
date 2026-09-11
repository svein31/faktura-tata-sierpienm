/**
 * Moduł Auth: Bezpieczne haszowanie haseł (bcryptjs, 12 rund), trwałe tokeny JWT i sesje DB (30 dni),
 * bezpieczne ciasteczka HttpOnly/Secure/SameSite=Lax (auth_session) zgodne z Netlify i Next.js.
 */

import "server-only";

import { createHmac, randomBytes } from "crypto";
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

export function getAuthSecret(): string {
  return process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || "fakturo-ksef-jwt-secret-key-30d-session";
}

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
  return (raw || "").trim().toLowerCase();
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

/* ── JWT Token Signature & Verification ─────────────────────────────────── */

interface JwtPayload {
  userId: string;
  email: string;
  name?: string | null;
  iat: number;
  exp: number;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

export function signJwt(payload: Omit<JwtPayload, "iat" | "exp">, expiresInSeconds = SESSION_MAX_AGE_SECONDS): string {
  const secret = getAuthSecret();
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signature = createHmac("sha256", secret).update(dataToSign).digest("base64url");
  return `${dataToSign}.${signature}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const secret = getAuthSecret();
    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = createHmac("sha256", secret).update(dataToSign).digest("base64url");

    if (signature !== expectedSignature) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JwtPayload;
    if (!payload.userId || !payload.exp) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });

  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const token = signJwt({
    userId,
    email: user?.email || "",
    name: user?.name,
  });

  let sessionId = token;
  try {
    const session = await prisma.session.create({
      data: {
        sessionToken: token,
        userId,
        expiresAt,
        userAgent: metadata?.userAgent || null,
        ipAddress: metadata?.ipAddress || null,
      },
    });
    sessionId = session.id;
  } catch {
    // Jeśli zapis w tabeli sesji z jakiegoś powodu się nie powiedzie, token JWT i tak zapewnia autoryzację
  }

  return { token, expiresAt, sessionId };
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
      const store = cookies();
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

  // 1. Sprawdź czy to podpisany token JWT
  const jwtPayload = verifyJwt(token);
  if (jwtPayload?.userId) {
    const user = await prisma.user.findUnique({
      where: { id: jwtPayload.userId },
      include: {
        company: true,
        companyProfiles: true,
        ksef: true,
      },
    });

    if (user) {
      return { user, sessionId: token };
    }
  }

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
      if (session.expiresAt.getTime() < Date.now()) {
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
