import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma Client zoptymalizowany pod kątem środowisk Serverless (Netlify Functions, Vercel, AWS Lambda).
 * Wykorzystuje globalThis.prisma, aby zapobiec tworzeniu nadmiernej liczby połączeń do bazy PostgreSQL przy każdym wywołaniu funkcji.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
