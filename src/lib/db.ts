import { PrismaClient } from "@prisma/client";
import { mkdirSync, accessSync, constants } from "fs";
import path from "path";

const INIT_SQL = [
  `CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nip" TEXT DEFAULT '',
    "companyName" TEXT DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "CompanySettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "nip" TEXT NOT NULL DEFAULT '',
    "regon" TEXT NOT NULL DEFAULT '',
    "street" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "postal" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'PL',
    "iban" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanySettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "CompanyProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "nip" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "street" TEXT,
    "buildingNumber" TEXT,
    "flatNumber" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "bankAccount" TEXT,
    "ksefToken" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "KsefSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'demo',
    "tokenSet" BOOLEAN NOT NULL DEFAULT false,
    "tokenMask" TEXT NOT NULL DEFAULT '',
    "certName" TEXT NOT NULL DEFAULT '',
    "autoValidate" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KsefSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "KsefSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "nip" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'test',
    "referenceNumber" TEXT NOT NULL,
    "authenticationToken" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "validUntil" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KsefSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "Contractor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nip" TEXT NOT NULL,
    "regon" TEXT,
    "address" JSONB NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "iban" TEXT,
    "bankName" TEXT,
    "isVatPayer" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contractor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'szt.',
    "netPrice" REAL NOT NULL DEFAULT 0,
    "vatRate" TEXT NOT NULL DEFAULT '23',
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "contractorId" TEXT NOT NULL,
    "sellerCompanyId" TEXT,
    "issueDate" TEXT NOT NULL,
    "saleDate" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "language" TEXT NOT NULL DEFAULT 'PL',
    "paymentMethod" TEXT NOT NULL DEFAULT 'transfer',
    "paymentTermDays" INTEGER NOT NULL DEFAULT 14,
    "notes" TEXT,
    "lines" JSONB NOT NULL,
    "ksef" JSONB,
    "nip" TEXT DEFAULT '',
    "totalGross" REAL DEFAULT 0,
    "ksefNumber" TEXT,
    "referenceNumber" TEXT,
    "upoXml" TEXT,
    "ksefSessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_sellerCompanyId_fkey" FOREIGN KEY ("sellerCompanyId") REFERENCES "CompanyProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_ksefSessionId_fkey" FOREIGN KEY ("ksefSessionId") REFERENCES "KsefSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'system',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "NotificationPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "browserEnabled" BOOLEAN NOT NULL DEFAULT false,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Session_tokenHash_key" ON "Session"("tokenHash");`,
  `CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CompanySettings_userId_key" ON "CompanySettings"("userId");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CompanyProfile_userId_nip_key" ON "CompanyProfile"("userId", "nip");`,
  `CREATE INDEX IF NOT EXISTS "CompanyProfile_userId_idx" ON "CompanyProfile"("userId");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "KsefSettings_userId_key" ON "KsefSettings"("userId");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "KsefSession_referenceNumber_key" ON "KsefSession"("referenceNumber");`,
  `CREATE INDEX IF NOT EXISTS "KsefSession_nip_idx" ON "KsefSession"("nip");`,
  `CREATE INDEX IF NOT EXISTS "KsefSession_userId_idx" ON "KsefSession"("userId");`,
  `CREATE INDEX IF NOT EXISTS "Contractor_userId_idx" ON "Contractor"("userId");`,
  `CREATE INDEX IF NOT EXISTS "Product_userId_idx" ON "Product"("userId");`,
  `CREATE INDEX IF NOT EXISTS "Invoice_userId_idx" ON "Invoice"("userId");`,
  `CREATE INDEX IF NOT EXISTS "Invoice_sellerCompanyId_idx" ON "Invoice"("sellerCompanyId");`,
  `CREATE INDEX IF NOT EXISTS "Invoice_referenceNumber_idx" ON "Invoice"("referenceNumber");`,
  `CREATE INDEX IF NOT EXISTS "Invoice_ksefNumber_idx" ON "Invoice"("ksefNumber");`,
  `CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification"("userId", "read");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_key" ON "NotificationPreference"("userId");`,
];

function setupDatabaseUrl(): void {
  let url = process.env.DATABASE_URL;

  const isServerless =
    Boolean(process.env.NETLIFY) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.VERCEL);

  if (!url) {
    url = isServerless ? "file:/tmp/prod.db" : "file:./data/prod.db";
  }

  if (url.startsWith("file:")) {
    const filePath = url.slice("file:".length);
    if (!path.isAbsolute(filePath)) {
      const targetDir = path.join(process.cwd(), "prisma", path.dirname(filePath));
      try {
        mkdirSync(targetDir, { recursive: true });
        accessSync(targetDir, constants.W_OK);
      } catch {
        // Fallback do /tmp jeśli bieżący katalog jest tylko do odczytu (np. Netlify AWS Lambda)
        url = "file:/tmp/prod.db";
      }
    }
  }

  process.env.DATABASE_URL = url;
}

setupDatabaseUrl();

const globalForPrisma = globalThis as unknown as {
  prismaRaw?: PrismaClient;
  isInitialized?: boolean;
};

const rawPrisma = globalForPrisma.prismaRaw ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaRaw = rawPrisma;
}

let initPromise: Promise<void> | null = null;

export async function ensureTablesExist(): Promise<void> {
  if (globalForPrisma.isInitialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      for (const statement of INIT_SQL) {
        try {
          await rawPrisma.$executeRawUnsafe(statement);
        } catch {
          // ignore already existing or unsupported statement
        }
      }
      try {
        await rawPrisma.$executeRawUnsafe(
          `ALTER TABLE "Invoice" ADD COLUMN "sellerCompanyId" TEXT`
        );
      } catch {
        // column already exists
      }
      globalForPrisma.isInitialized = true;
    })();
  }
  await initPromise;
}

// Inicjalizacja asynchroniczna w tle
ensureTablesExist().catch((err) => console.error("[db-init-error]", err));

// Obiekt Proxy opakowujący PrismaClient dla pewności istnienia tabel przed zapytaniem
export const prisma = new Proxy(rawPrisma, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === "function") {
      return async function (...args: unknown[]) {
        await ensureTablesExist();
        return value.apply(target, args);
      };
    }
    if (typeof value === "object" && value !== null) {
      return new Proxy(value, {
        get(modelTarget, modelProp, modelReceiver) {
          const modelValue = Reflect.get(modelTarget, modelProp, modelReceiver);
          if (typeof modelValue === "function") {
            return async function (...args: unknown[]) {
              await ensureTablesExist();
              return modelValue.apply(modelTarget, args);
            };
          }
          return modelValue;
        },
      });
    }
    return value;
  },
});
