import { useEffect, useState } from "react";

export default function FilterBar({ filters, options, onApply, disabled }) {
  const [draft, setDraft] = useState(filters);
  const [err, setErr] = useState("");

  useEffect(() => setDraft(filters), [filters]);

  const set = (key) => (e) => {
    setErr("");
    setDraft({ ...draft, [key]: e.target.value });
  };

  const apply = (e) => {
    e.preventDefault();
    if (!draft.start || !draft.end) return setErr("Pick both dates");
    if (draft.start > draft.end) return setErr("Start date must be before end date");
    onApply(draft);
  };

  return (
    <form className="filters" onSubmit={apply}>
      <label>
        From
        <input type="date" value={draft.start} min={options.min_date} max={options.max_date} onChange={set("start")} />
      </label>
      <label>
        To
        <input type="date" value={draft.end} min={options.min_date} max={options.max_date} onChange={set("end")} />
      </label>
      <label>
        Segment
        <select value={draft.segment} onChange={set("segment")}>
          {options.segments.map((s) => (
            <option key={s} value={s}>{s === "ALL" ? "All segments" : s}</option>
          ))}
        </select>
      </label>
      <button className="btn primary" type="submit" disabled={disabled}>
        {disabled ? "Loading…" : "Apply"}
      </button>
      {err && <span className="field-error">{err}</span>}
    </form>
  );
}
