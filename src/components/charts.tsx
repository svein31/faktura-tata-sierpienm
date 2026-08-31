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
  slate: "#71717a",
  violet: "#8b5cf6",
};

const axisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const tooltipStyle = {
  borderRadius: 14,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  color: "hsl(var(--foreground))",
  fontSize: 12.5,
  boxShadow: "0 10px 30px -10px hsl(var(--foreground) / 0.15)",
  padding: "8px 14px",
};

export function RevenueAreaChart({
  data,
}: {
  data: Array<{ label: string; netto: number; brutto: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.indigo} stopOpacity={0.35} />
            <stop offset="100%" stopColor={CHART_COLORS.indigo} stopOpacity={0.0} />
          </linearGradient>
          <linearGradient id="gradGross" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.emerald} stopOpacity={0.3} />
            <stop offset="100%" stopColor={CHART_COLORS.emerald} stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.6)" vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} dy={6} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={64} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={7} />
        <Area
          type="monotone"
          dataKey="netto"
          name="Netto"
          stroke={CHART_COLORS.indigo}
          strokeWidth={2.2}
          fill="url(#gradNet)"
        />
        <Area
          type="monotone"
          dataKey="brutto"
          name="Brutto"
          stroke={CHART_COLORS.emerald}
          strokeWidth={2.2}
          fill="url(#gradGross)"
        />
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
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={54}
          outerRadius={82}
          paddingAngle={3}
          strokeWidth={0}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 4 }} iconType="circle" iconSize={7} />
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
      <BarChart data={data} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.6)" vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} dy={6} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={64} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={7} />
        <Bar dataKey="23" name="23%" stackId="vat" fill={CHART_COLORS.indigo} radius={[0, 0, 0, 0]} />
        <Bar dataKey="8" name="8%" stackId="vat" fill={CHART_COLORS.sky} radius={[0, 0, 0, 0]} />
        <Bar dataKey="5" name="5%" stackId="vat" fill={CHART_COLORS.emerald} radius={[0, 0, 0, 0]} />
        <Bar dataKey="0" name="0%" stackId="vat" fill={CHART_COLORS.slate} radius={[0, 0, 0, 0]} />
        <Bar dataKey="zw" name="zw./np." stackId="vat" fill={CHART_COLORS.amber} radius={[4, 4, 0, 0]} />
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
    <ResponsiveContainer width="100%" height={data.length * 46 + 20}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
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
            <Cell
              key={i}
              fill={i === 0 ? CHART_COLORS.indigo : i === 1 ? CHART_COLORS.emerald : CHART_COLORS.slate}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
