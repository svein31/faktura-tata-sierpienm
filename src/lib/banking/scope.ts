import "server-only";
import type { Prisma } from "@prisma/client";

/** Resolve authorized company's connection IDs once; avoid a transaction-wide join. */
export async function bankTransactionScope(client: Pick<Prisma.TransactionClient, "bankConnection">, companyId: string): Promise<Prisma.BankTransactionWhereInput> {
  const connections = await client.bankConnection.findMany({ where: { companyId }, select: { id: true } });
  return { OR: [{ accountId: companyId }, ...(connections.length ? [{ connectionId: { in: connections.map(connection => connection.id) } }] : [])] };
}
