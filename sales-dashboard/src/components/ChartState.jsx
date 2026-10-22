export default function ChartState({ loading }) {
  return (
    <div className={`chart-state ${loading ? "skeleton" : ""}`}>
      {loading ? "" : "No data for these filters"}
    </div>
  );
}
