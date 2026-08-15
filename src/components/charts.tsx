"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const CHART_COLORS = {
  indigo: "#6366f1",
  emerald: "#10b981",
  sky: "#0ea5e9",
  amber: "#f59e0b",
  rose: "#f43f5e",
  slate: "#94a3b8",
  violet: "#8b5cf6",
};

const axisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground) / 0.85)" };
const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  color: "hsl(var(--foreground))",
  fontSize: 12.5,
  boxShadow: "0 8px 24px -8px hsl(224 47% 6% / 0.25)",
};

export function RevenueAreaChart({
  data,
}: {
  data: Array<{ label: string; netto: number; brutto: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.indigo} stopOpacity={0.35} />
            <stop offset="100%" stopColor={CHART_COLORS.indigo} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradGross" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.emerald} stopOpacity={0.28} />
            <stop offset="100%" stopColor={CHART_COLORS.emerald} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={64} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        <Area type="monotone" dataKey="netto" name="Netto" stroke={CHART_COLORS.indigo} strokeWidth={2} fill="url(#gradNet)" />
        <Area type="monotone" dataKey="brutto" name="Brutto" stroke={CHART_COLORS.emerald} strokeWidth={2} fill="url(#gradGross)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StatusPieChart({
  data,
}: {
  data: Array<{ name: string; value: number; color: string }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={3} strokeWidth={0}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11.5 }} iconType="circle" iconSize={8} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function VatStackedBarChart({
  data,
}: {
  data: Array<{ label: string; "23": number; "8": number; "5": number; "0": number; zw: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={64} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted) / 0.3)" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        <Bar dataKey="23" name="23%" stackId="vat" fill={CHART_COLORS.indigo} />
        <Bar dataKey="8" name="8%" stackId="vat" fill={CHART_COLORS.sky} />
        <Bar dataKey="5" name="5%" stackId="vat" fill={CHART_COLORS.emerald} />
        <Bar dataKey="0" name="0%" stackId="vat" fill={CHART_COLORS.slate} />
        <Bar dataKey="zw" name="zw./np." stackId="vat" fill={CHART_COLORS.amber} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopContractorsBar({
  data,
}: {
  data: Array<{ name: string; value: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={data.length * 44 + 20}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11.5, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={150}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted) / 0.3)" }} />
        <Bar dataKey="value" name="Brutto" radius={[0, 6, 6, 0]} barSize={18}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === 0 ? CHART_COLORS.indigo : i === 1 ? CHART_COLORS.emerald : CHART_COLORS.slate} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
