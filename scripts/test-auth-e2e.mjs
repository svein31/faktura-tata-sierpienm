/**
 * Test weryfikacyjny trwałej sesji i integracji auth w Prisma
 */
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db.ts";
import { strict as assert } from "node:assert";

const SESSION_MAX_AGE_SECONDS = 315360000; // 10 lat
const BCRYPT_ROUNDS = 12;

function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function generateSessionToken() {
  return randomBytes(32).toString("base64url");
}

console.log("=========================================================");
console.log("1. TEST HASŁA I KRYPTOGRAFII (BCRYPT 12 ROUNDS + SHA-256)");
console.log("=========================================================");

const testPassword = "SuperTajneHaslo123!";
const hash = await hashPassword(testPassword);
console.log(`✓ Wygenerowano hash bcrypt: ${hash.slice(0, 30)}...`);

const isValid = await verifyPassword(testPassword, hash);
assert.equal(isValid, true, "Hasło powinno zostać zweryfikowane pozytywnie");

const isWrong = await verifyPassword("ZleHaslo123", hash);
assert.equal(isWrong, false, "Błędne hasło powinno zostać odrzucone");
console.log("✓ Weryfikacja hasła działa prawidłowo.");

console.log("\n=========================================================");
console.log("2. TEST GENEROWANIA TRWAŁEJ SESJI (10 LAT / 315360000s)");
console.log("=========================================================");

const token = generateSessionToken();
const tokenHash = sha256Hex(token);
console.log(`✓ Wygenerowano token sesji (32 bajty): ${token.slice(0, 20)}...`);
console.log(`✓ Hash SHA-256 do bazy: ${tokenHash.slice(0, 20)}...`);
console.log(`✓ Czas trwania sesji: ${SESSION_MAX_AGE_SECONDS} sekund (${SESSION_MAX_AGE_SECONDS / (365 * 24 * 3600)} lat)`);

console.log("\n=========================================================");
console.log("3. TEST INTEGRACJI Z BAZĄ DANYCH PRISMA");
console.log("=========================================================");

const testEmail = `test.user.${Date.now()}@fakturo-demo.pl`;
const user = await prisma.user.create({
  data: {
    email: testEmail,
    passwordHash: hash,
    name: "Jan Kowalski",
    nip: "5260301706",
    companyName: "Kowalski IT Sp. z o.o.",
    company: {
      create: {
        name: "Kowalski IT Sp. z o.o.",
        nip: "5260301706",
        street: "ul. Marszałkowska 1",
        city: "Warszawa",
        postal: "00-001",
      },
    },
    ksef: {
      create: {
        environment: "test",
      },
    },
  },
  include: {
    company: true,
    ksef: true,
  },
});

console.log(`✓ Utworzono użytkownika: ${user.email} (ID: ${user.id})`);
assert.equal(user.nip, "5260301706");
assert.equal(user.companyName, "Kowalski IT Sp. z o.o.");

// Tworzymy trwałą sesję
const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
const session = await prisma.session.create({
  data: {
    tokenHash,
    userId: user.id,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    ipAddress: "127.0.0.1",
    expiresAt,
  },
});

console.log(`✓ Utworzono sesję w bazie: ID=${session.id}, Ważna do=${session.expiresAt.toISOString()}`);

// Weryfikujemy odczyt sesji po hashu
const foundSession = await prisma.session.findUnique({
  where: { tokenHash },
  include: { user: { include: { company: true, ksef: true } } },
});

assert.ok(foundSession, "Sesja powinna zostać odnaleziona w bazie");
assert.equal(foundSession.userId, user.id);
assert.equal(foundSession.user.company?.nip, "5260301706");
assert.equal(foundSession.user.ksef?.environment, "test");
console.log("✓ Odczytano sesję z bazy, powiązania User -> Company -> KSeF są w 100% poprawne");

// Sprzątanie po teście
await prisma.session.delete({ where: { id: session.id } });
await prisma.user.delete({ where: { id: user.id } });
console.log("✓ Pomyślnie usunięto dane testowe.");

console.log("\n=========================================================");
console.log("🎉 WSZYSTKIE TESTY TRWAŁEJ SESJI PRZESZŁY W 100% SUKCESEM!");
console.log("=========================================================");
