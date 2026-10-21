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
  indigo: "hsl(var(--chart-1))",
  emerald: "hsl(var(--success))",
  sky: "hsl(var(--chart-3))",
  amber: "hsl(var(--warning))",
  rose: "hsl(var(--destructive))",
  slate: "hsl(var(--chart-2))",
  violet: "hsl(var(--chart-4))",
};

const axisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  color: "hsl(var(--foreground))",
  fontSize: 12.5,
  boxShadow: "0 10px 30px -10px hsl(var(--foreground) / 0.15)",
  padding: "8px 14px",
};

export function RevenueAreaChart({
  data,
  height = 280,
}: {
  data: Array<{ label: string; netto: number; brutto: number }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
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
          fill={CHART_COLORS.indigo}
          fillOpacity={0.06}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="brutto"
          name="Brutto"
          stroke={CHART_COLORS.slate}
          strokeWidth={2.2}
          fill={CHART_COLORS.slate}
          fillOpacity={0.04}
          isAnimationActive={false}
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
          isAnimationActive={false}
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
        <Bar dataKey="23" name="23%" stackId="vat" fill="hsl(var(--chart-1))" isAnimationActive={false} />
        <Bar dataKey="8" name="8%" stackId="vat" fill="hsl(var(--chart-2))" isAnimationActive={false} />
        <Bar dataKey="5" name="5%" stackId="vat" fill="hsl(var(--chart-3))" isAnimationActive={false} />
        <Bar dataKey="0" name="0%" stackId="vat" fill="hsl(var(--chart-4))" isAnimationActive={false} />
        <Bar dataKey="zw" name="zw./np." stackId="vat" fill="hsl(var(--chart-5))" isAnimationActive={false} radius={[3, 3, 0, 0]} />
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
        <Bar dataKey="value" name="Brutto" radius={[0, 3, 3, 0]} barSize={18} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={i === 0 ? CHART_COLORS.indigo : CHART_COLORS.slate}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
