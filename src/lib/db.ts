import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "fs";
import path from "path";

/**
 * Singleton PrismaClient (Next.js dev hot-reload safe).
 *
 * Uwaga: ścieżka względna w DATABASE_URL (file:./data/prod.db) jest przez Prisma
 * rozwiązywana względem katalogu prisma/ → ostatecznie <app>/prisma/data/prod.db.
 * Katalog data/ tworzymy tutaj, aby cyber_Folks nie musiał go zakładać ręcznie.
 */
function ensureDataDir(): void {
  const url = process.env.DATABASE_URL ?? "file:./data/prod.db";
  if (url.startsWith("file:")) {
    const filePath = url.slice("file:".length);
    if (!path.isAbsolute(filePath)) {
      const dir = path.join(process.cwd(), "prisma", path.dirname(filePath));
      try {
        mkdirSync(dir, { recursive: true });
      } catch {
        // Jeśli katalogu nie da się utworzyć, Prisma zgłosi czytelny błąd przy starcie.
      }
    }
  }
}

ensureDataDir();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
