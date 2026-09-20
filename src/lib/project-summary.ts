import { round2 } from "@/lib/format";
export type ProjectAmount = { category: "revenue" | "cost" | "materials" | "time"; currency: string; amount: number; materialPurchase?: boolean; minutes?: number };
export function projectSummary(rows: ProjectAmount[], materialBasis: "documents" | "consumption") {
  const currencies = new Map<string, { currency: string; revenue: number; costs: number; materialPurchases: number; materials: number; time: number; minutes: number }>();
  for (const row of rows) {
    if (!/^[A-Z]{3}$/.test(row.currency) || !Number.isFinite(row.amount)) throw new Error("Invalid project monetary data");
    const bucket = currencies.get(row.currency) || { currency: row.currency, revenue: 0, costs: 0, materialPurchases: 0, materials: 0, time: 0, minutes: 0 };
    if (row.category === "revenue") bucket.revenue = round2(bucket.revenue + row.amount);
    if (row.category === "cost") {
      if (row.materialPurchase) bucket.materialPurchases = round2(bucket.materialPurchases + row.amount);
      else bucket.costs = round2(bucket.costs + row.amount);
    }
    if (row.category === "materials") bucket.materials = round2(bucket.materials + row.amount);
    if (row.category === "time") { bucket.time = round2(bucket.time + row.amount); bucket.minutes += row.minutes || 0; }
    currencies.set(row.currency, bucket);
  }
  return [...currencies.values()].sort((a, b) => a.currency.localeCompare(b.currency)).map(row => {
    const deductedMaterials = materialBasis === "documents" ? row.materialPurchases : row.materials;
    const totalCost = round2(row.costs + deductedMaterials + row.time);
    const profit = round2(row.revenue - totalCost);
    return { ...row, deductedMaterials, totalCost, profit, marginPercent: row.revenue > 0 ? round2(profit / row.revenue * 100) : null };
  });
}
