import { PrismaClient } from "@prisma/client";

/**
 * Globalny klient Prisma zoptymalizowany pod kątem PostgreSQL / Supabase / Neon
 * oraz środowisk Serverless (Netlify Functions, Vercel, AWS Lambda, Node.js).
 */

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
