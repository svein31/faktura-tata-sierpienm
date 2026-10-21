export const REVENUE_CHART_TYPES = { column: "Kolumnowy", bar: "Słupkowy", line: "Liniowy", pie: "Kołowy" } as const;
export type RevenueChartType = keyof typeof REVENUE_CHART_TYPES;
export type RevenuePoint = { key: string; label: string; net: number; gross: number };
export function revenueChartType(value: unknown): RevenueChartType { return typeof value === "string" && Object.hasOwn(REVENUE_CHART_TYPES, value) ? value as RevenueChartType : "line"; }
export function revenueDomain(points: RevenuePoint[]) {
  const low = Math.min(0, ...points.flatMap(p => [p.net, p.gross]));
  const high = Math.max(0, ...points.flatMap(p => [p.net, p.gross]));
  return { low, high, range: high - low || 1 };
}
export function revenuePie(points: RevenuePoint[], field: "net" | "gross") {
  const values = points.map(point => point[field]);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (values.some(value => value < 0)) return { reason: "negative" as const, total, shares: [] };
  if (total <= 0) return { reason: "empty" as const, total, shares: [] };
  return { reason: null, total, shares: points.map(point => ({ ...point, share: point[field] / total })) };
}
