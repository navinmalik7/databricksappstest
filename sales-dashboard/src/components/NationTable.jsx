import { fmtMoney, fmtNum } from "../api.js";
import ChartState from "./ChartState.jsx";

export default function NationTable({ data, loading }) {
  if (loading || !data.length) return <ChartState loading={loading} />;
  const max = Math.max(...data.map((d) => d.revenue));
  return (
    <table className="table">
      <thead>
        <tr><th>Nation</th><th className="num">Orders</th><th className="num">Revenue</th></tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.nation}>
            <td>
              {d.nation}
              <div className="bar"><span style={{ width: `${(d.revenue / max) * 100}%` }} /></div>
            </td>
            <td className="num">{fmtNum(d.orders)}</td>
            <td className="num">{fmtMoney(d.revenue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
