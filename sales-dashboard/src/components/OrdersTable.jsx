import { useEffect, useState } from "react";
import { getJSON, fmtMoneyFull, fmtNum } from "../api.js";

const COLUMNS = [
  { key: "order_id", label: "Order" },
  { key: "order_date", label: "Date", sort: "date" },
  { key: "customer", label: "Customer", sort: "customer" },
  { key: "segment", label: "Segment" },
  { key: "status", label: "Status", sort: "status" },
  { key: "amount", label: "Amount", sort: "amount", num: true },
];

const STATUS = { F: "Fulfilled", O: "Open", P: "Partial" };

function toCsv(rows) {
  const head = COLUMNS.map((c) => c.label).join(",");
  const body = rows.map((r) =>
    COLUMNS.map((c) => `"${String(r[c.key] ?? "").replace(/"/g, '""')}"`).join(",")
  );
  return [head, ...body].join("\n");
}

export default function OrdersTable({ filters }) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [result, setResult] = useState({ rows: [], total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => setPage(1), [filters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getJSON("/api/orders", { ...filters, page, pageSize: 20, sort: sort.key, dir: sort.dir })
      .then((r) => !cancelled && setResult(r))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [filters, page, sort]);

  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const toggleSort = (key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  const exportCsv = () => {
    const blob = new Blob([toCsv(result.rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `orders_page${page}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="table-toolbar">
        <span className="muted">{fmtNum(result.total)} orders</span>
        <button className="btn" onClick={exportCsv} disabled={!result.rows.length}>Export CSV</button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className={`table-wrap ${loading ? "dim" : ""}`}>
        <table className="table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={c.num ? "num" : ""}>
                  {c.sort ? (
                    <button className="th-sort" onClick={() => toggleSort(c.sort)}>
                      {c.label}{sort.key === c.sort ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
                    </button>
                  ) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.order_id}>
                <td>{r.order_id}</td>
                <td>{r.order_date}</td>
                <td>{r.customer}</td>
                <td>{r.segment}</td>
                <td><span className={`pill s-${r.status}`}>{STATUS[r.status] || r.status}</span></td>
                <td className="num">{fmtMoneyFull(r.amount)}</td>
              </tr>
            ))}
            {!loading && !result.rows.length && (
              <tr><td colSpan={COLUMNS.length} className="muted center">No orders for these filters</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button className="btn" onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || loading}>Previous</button>
        <span className="muted">Page {page} of {fmtNum(pages)}</span>
        <button className="btn" onClick={() => setPage((p) => p + 1)} disabled={page >= pages || loading}>Next</button>
      </div>
    </div>
  );
}
