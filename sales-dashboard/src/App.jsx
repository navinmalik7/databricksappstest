import { useCallback, useEffect, useState } from "react";
import { getJSON } from "./api.js";
import FilterBar from "./components/FilterBar.jsx";
import KpiCards from "./components/KpiCards.jsx";
import RevenueTrend from "./components/RevenueTrend.jsx";
import SegmentChart from "./components/SegmentChart.jsx";
import NationTable from "./components/NationTable.jsx";
import OrdersTable from "./components/OrdersTable.jsx";

// Filters live in the URL so a filtered report can be bookmarked and shared
function filtersFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return {
    start: p.get("start") || "1996-01-01",
    end: p.get("end") || "1998-08-02",
    segment: p.get("segment") || "ALL",
  };
}

export default function App() {
  const [filters, setFilters] = useState(filtersFromUrl);
  const [options, setOptions] = useState({ segments: ["ALL"], min_date: "", max_date: "" });
  const [data, setData] = useState({ kpis: null, monthly: [], segments: [], nations: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getJSON("/api/filters").then(setOptions).catch(() => {});
  }, []);

  const load = useCallback(async (f) => {
    setLoading(true);
    setError("");
    try {
      const [kpis, monthly, segments, nations] = await Promise.all([
        getJSON("/api/kpis", f),
        getJSON("/api/revenue-by-month", f),
        getJSON("/api/revenue-by-segment", f),
        getJSON("/api/top-nations", f),
      ]);
      setData({ kpis, monthly, segments, nations });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filters);
    const qs = new URLSearchParams(filters).toString();
    window.history.replaceState(null, "", `?${qs}`);
  }, [filters, load]);

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>Sales dashboard</h1>
          <p className="muted">Source: samples.tpch · Databricks SQL Warehouse</p>
        </div>
        <FilterBar filters={filters} options={options} onApply={setFilters} disabled={loading} />
      </header>

      {error && (
        <div className="error">
          <strong>Could not load data.</strong> {error}
          <button className="btn" onClick={() => load(filters)}>Retry</button>
        </div>
      )}

      <KpiCards kpis={data.kpis} loading={loading} />

      <section className="grid two">
        <div className="card wide">
          <h2>Revenue by month</h2>
          <RevenueTrend data={data.monthly} loading={loading} />
        </div>
        <div className="card">
          <h2>Revenue by market segment</h2>
          <SegmentChart data={data.segments} loading={loading} />
        </div>
      </section>

      <section className="grid two reverse">
        <div className="card">
          <h2>Top 10 nations</h2>
          <NationTable data={data.nations} loading={loading} />
        </div>
        <div className="card wide">
          <h2>Orders</h2>
          <OrdersTable filters={filters} />
        </div>
      </section>
    </div>
  );
}
