import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { fmtMoney, fmtMoneyFull } from "../api.js";
import ChartState from "./ChartState.jsx";

export default function RevenueTrend({ data, loading }) {
  if (loading || !data.length) return <ChartState loading={loading} />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickFormatter={fmtMoney} tick={{ fontSize: 12, fill: "var(--muted)" }} tickLine={false} axisLine={false} width={60} />
        <Tooltip formatter={(v) => fmtMoneyFull(v)} contentStyle={{ borderRadius: 8, fontSize: 13 }} />
        <Area type="monotone" dataKey="revenue" name="Revenue" stroke="var(--accent)" strokeWidth={2} fill="var(--accent-soft)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
