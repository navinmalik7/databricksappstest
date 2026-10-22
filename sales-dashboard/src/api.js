// Small helper for calling the Node API with the current filters
export async function getJSON(path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  ).toString();
  const res = await fetch(qs ? `${path}?${qs}` : path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const fmtMoney = (n) =>
  n == null ? "–" : "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const fmtMoneyFull = (n) =>
  n == null ? "–" : Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export const fmtNum = (n) => (n == null ? "–" : Intl.NumberFormat("en-US").format(n));
