/**
 * Auth: bcryptjs (>=12 rounds), losowe nieprzezroczyste tokeny sesji,
 * w bazie wyłącznie hash SHA-256 tokena, cookie HttpOnly Secure SameSite=Lax.
 *
 * Brak SESSION_SECRET: przy opaque tokenach nie jest potrzebny — token to
 * 32 losowe bajty, weryfikowany przez porównanie hashy w bazie.
 */

import "server-only";

import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { cache } from "react";
import type { User } from "@prisma/client";
import { prisma } from "./db";

export const SESSION_COOKIE = "fakturo_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 dni
const BCRYPT_ROUNDS = 12;
export const MIN_PASSWORD_LENGTH = 8;

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

export function toPublicUser(u: User): PublicUser {
  return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt.toISOString() };
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

/** Walidacja formatu e-mail + minimalnej długości hasła (bez zdradzania szczegółów). */
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

/* ── Tokeny sesji ───────────────────────────────────────────────────────── */

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { tokenHash: sha256Hex(token), userId, expiresAt },
  });
  return { token, expiresAt };
}

/* ── Cookie ─────────────────────────────────────────────────────────────── */

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
    maxAge: overrides?.maxAge ?? SESSION_TTL_MS / 1000,
  };
}

export function clearSessionCookieValue(): string {
  return `fakturo_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/* ── Bieżący użytkownik ─────────────────────────────────────────────────── */

type SessionUser = { user: User; sessionId: string } | null;

/**
 * Odczyt sesji z cookie + weryfikacja w bazie (hash tokena, expiry).
 * Użycie React `cache()` — jedna weryfikacja na request (page + komponenty).
 */
export const getSession = cache(async (): Promise<SessionUser> => {
  const store = cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = sha256Hex(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    // Wygasła sesja — posprzątaj.
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return { user: session.user, sessionId: session.id };
});

export const getSessionUser = cache(async (): Promise<User | null> => {
  const s = await getSession();
  return s?.user ?? null;
});

/** Dla API routes: zwraca user lub null — caller decyduje o statusie 401. */
export async function requireApiUser(): Promise<{ user: User; sessionId: string } | null> {
  return getSession();
}
