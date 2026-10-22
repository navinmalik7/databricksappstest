import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { fmtMoney, fmtMoneyFull } from "../api.js";
import ChartState from "./ChartState.jsx";

export default function SegmentChart({ data, loading }) {
  if (loading || !data.length) return <ChartState loading={loading} />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <XAxis type="number" tickFormatter={fmtMoney} tick={{ fontSize: 12, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="segment" tick={{ fontSize: 12, fill: "var(--muted)" }} tickLine={false} axisLine={false} width={90} />
        <Tooltip formatter={(v) => fmtMoneyFull(v)} cursor={{ fill: "var(--hover)" }} contentStyle={{ borderRadius: 8, fontSize: 13 }} />
        <Bar dataKey="revenue" name="Revenue" fill="var(--accent)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
