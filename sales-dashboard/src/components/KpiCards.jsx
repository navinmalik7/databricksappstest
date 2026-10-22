import { fmtMoney, fmtMoneyFull, fmtNum } from "../api.js";

export default function KpiCards({ kpis, loading }) {
  const items = [
    { label: "Total revenue", value: fmtMoney(kpis?.revenue), title: fmtMoneyFull(kpis?.revenue) },
    { label: "Orders", value: fmtNum(kpis?.orders) },
    { label: "Active customers", value: fmtNum(kpis?.customers) },
    { label: "Avg order value", value: fmtMoneyFull(kpis?.avg_order_value) },
  ];
  return (
    <section className="kpis">
      {items.map((k) => (
        <div className="card kpi" key={k.label} title={k.title}>
          <div className="kpi-label">{k.label}</div>
          <div className={`kpi-value ${loading ? "skeleton" : ""}`}>{loading ? " " : k.value}</div>
        </div>
      ))}
    </section>
  );
}
