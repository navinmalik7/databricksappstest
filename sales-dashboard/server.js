import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.DATABRICKS_APP_PORT || process.env.PORT || 8000;
const CATALOG = "samples.tpch"; // change to your own catalog.schema later

// ---------------------------------------------------------------------------
// Databricks SQL access via the SQL Statement Execution REST API
// In Databricks Apps: DATABRICKS_HOST, DATABRICKS_CLIENT_ID, DATABRICKS_CLIENT_SECRET
// are injected automatically (the app's service principal). WAREHOUSE_ID comes
// from app.yaml. Locally: set DATABRICKS_HOST, WAREHOUSE_ID and DATABRICKS_TOKEN.
// ---------------------------------------------------------------------------
const rawHost = (process.env.DATABRICKS_HOST || "").trim().replace(/\/+$/, "");
const HOST = rawHost ? (rawHost.startsWith("http") ? rawHost : `https://${rawHost}`) : "";
const WAREHOUSE_ID = (process.env.WAREHOUSE_ID || "").trim();
const CLIENT_ID = process.env.DATABRICKS_CLIENT_ID;
const CLIENT_SECRET = process.env.DATABRICKS_CLIENT_SECRET;
const PAT = process.env.DATABRICKS_TOKEN;

if (!HOST || !WAREHOUSE_ID) {
  console.error("Missing DATABRICKS_HOST or WAREHOUSE_ID environment variable.");
}

// OAuth machine-to-machine token for the app's service principal (cached until near expiry)
let tokenCache = { value: null, expiresAt: 0 };

async function getToken() {
  if (PAT) return PAT;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("No credentials: DATABRICKS_CLIENT_ID/SECRET (in Databricks Apps) or DATABRICKS_TOKEN (locally) must be set.");
  }
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) return tokenCache.value;

  const res = await fetch(`${HOST}/oidc/v1/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
    },
    body: "grant_type=client_credentials&scope=all-apis",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(`OAuth token request failed (${res.status}): ${body.error_description || body.error || "unknown error"}`);
  }
  tokenCache = { value: body.access_token, expiresAt: Date.now() + ((body.expires_in || 3600) - 120) * 1000 };
  return tokenCache.value;
}

async function dbx(method, apiPath, payload) {
  const res = await fetch(`${HOST}${apiPath}`, {
    method,
    headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Databricks API ${res.status} ${body.error_code || ""}: ${body.message || res.statusText}`.trim());
  }
  return body;
}

const NUMERIC = new Set(["BYTE", "SHORT", "INT", "LONG", "FLOAT", "DOUBLE", "DECIMAL"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Convert JSON_ARRAY results (all values arrive as strings) into objects with proper numbers
function toRows(manifest, dataArray = []) {
  const cols = manifest?.schema?.columns || [];
  return dataArray.map((arr) => {
    const row = {};
    cols.forEach((c, i) => {
      const v = arr[i];
      row[c.name] = v == null ? null : NUMERIC.has(c.type_name) ? Number(v) : v;
    });
    return row;
  });
}

async function executeSql(sql, params = {}) {
  if (!WAREHOUSE_ID) {
    throw new Error(
      "WAREHOUSE_ID is empty. Attach a SQL warehouse to the app with resource key 'sql-warehouse' " +
      "(Apps > your app > Edit > App resources), or set the ID directly in app.yaml, then redeploy."
    );
  }
  let st = await dbx("POST", "/api/2.0/sql/statements", {
    warehouse_id: WAREHOUSE_ID,
    statement: sql,
    parameters: Object.entries(params).map(([name, value]) => ({ name, value: String(value), type: "STRING" })),
    wait_timeout: "30s",          // wait up to 30s inline (also covers warehouse start-up)
    on_wait_timeout: "CONTINUE",  // then keep running and we poll
    disposition: "INLINE",
    format: "JSON_ARRAY",
  });

  // Poll while the warehouse is starting or the query is still running
  const deadline = Date.now() + 5 * 60 * 1000;
  while (["PENDING", "RUNNING"].includes(st.status?.state)) {
    if (Date.now() > deadline) throw new Error("Query timed out after 5 minutes");
    await sleep(1500);
    st = await dbx("GET", `/api/2.0/sql/statements/${st.statement_id}`);
  }

  if (st.status?.state !== "SUCCEEDED") {
    const e = st.status?.error;
    throw new Error(`Query ${st.status?.state}: ${e?.message || "unknown error"}`);
  }

  let rows = toRows(st.manifest, st.result?.data_array);
  // Large results come in chunks
  let next = st.result?.next_chunk_internal_link;
  while (next) {
    const chunk = await dbx("GET", next);
    rows = rows.concat(toRows(st.manifest, chunk.data_array));
    next = chunk.next_chunk_internal_link;
  }
  return rows;
}

// Simple in-memory cache so repeated dashboard loads don't hit the warehouse
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function runQuery(sql, params = {}) {
  const key = sql + JSON.stringify(params);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;
  const rows = await executeSql(sql, params);
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

// ---------------------------------------------------------------------------
// Filters (validated, then passed as named parameters — never string-concatenated)
// ---------------------------------------------------------------------------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEGMENTS = ["ALL", "AUTOMOBILE", "BUILDING", "FURNITURE", "HOUSEHOLD", "MACHINERY"];

function readFilters(q) {
  const start = DATE_RE.test(q.start || "") ? q.start : "1996-01-01";
  const end = DATE_RE.test(q.end || "") ? q.end : "1998-08-02";
  const segment = SEGMENTS.includes(q.segment) ? q.segment : "ALL";
  return { start, end, segment };
}

const FILTERED_ORDERS = `
  FROM ${CATALOG}.orders o
  JOIN ${CATALOG}.customer c ON o.o_custkey = c.c_custkey
  WHERE o.o_orderdate BETWEEN CAST(:start AS DATE) AND CAST(:end AS DATE)
    AND (:segment = 'ALL' OR c.c_mktsegment = :segment)
`;

const app = express();

const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Query failed" });
  }
};

// Diagnostics: open /api/health in the browser to see what is configured (no secrets shown)
app.get("/api/health", async (_req, res) => {
  const report = {
    host: HOST || null,
    warehouseIdSet: Boolean(WAREHOUSE_ID),
    auth: PAT ? "personal access token" : CLIENT_ID && CLIENT_SECRET ? "app service principal (OAuth)" : "MISSING",
    token: null,
    query: null,
  };
  try { await getToken(); report.token = "ok"; } catch (e) { report.token = e.message; }
  if (report.token === "ok") {
    try {
      const [r] = await executeSql(`SELECT current_user() AS run_as, COUNT(*) AS orders FROM ${CATALOG}.orders`);
      report.query = r;
    } catch (e) { report.query = e.message; }
  }
  res.status(report.token === "ok" && typeof report.query === "object" ? 200 : 500).json(report);
});

app.get("/api/filters", handle(async () => {
  const [range] = await runQuery(`
    SELECT CAST(MIN(o_orderdate) AS STRING) AS min_date,
           CAST(MAX(o_orderdate) AS STRING) AS max_date
    FROM ${CATALOG}.orders`);
  return { segments: SEGMENTS, ...range };
}));

app.get("/api/kpis", handle(async (req) => {
  const [row] = await runQuery(`
    SELECT CAST(SUM(o.o_totalprice) AS DOUBLE)       AS revenue,
           CAST(COUNT(*) AS INT)                     AS orders,
           CAST(COUNT(DISTINCT o.o_custkey) AS INT)  AS customers,
           CAST(AVG(o.o_totalprice) AS DOUBLE)       AS avg_order_value
    ${FILTERED_ORDERS}`, readFilters(req.query));
  return row;
}));

app.get("/api/revenue-by-month", handle((req) => runQuery(`
    SELECT date_format(o.o_orderdate, 'yyyy-MM')     AS month,
           CAST(SUM(o.o_totalprice) AS DOUBLE)       AS revenue,
           CAST(COUNT(*) AS INT)                     AS orders
    ${FILTERED_ORDERS}
    GROUP BY 1 ORDER BY 1`, readFilters(req.query))));

app.get("/api/revenue-by-segment", handle((req) => runQuery(`
    SELECT c.c_mktsegment                            AS segment,
           CAST(SUM(o.o_totalprice) AS DOUBLE)       AS revenue
    ${FILTERED_ORDERS}
    GROUP BY 1 ORDER BY 2 DESC`, readFilters(req.query))));

app.get("/api/top-nations", handle((req) => runQuery(`
    SELECT n.n_name                                  AS nation,
           CAST(SUM(o.o_totalprice) AS DOUBLE)       AS revenue,
           CAST(COUNT(*) AS INT)                     AS orders
    ${FILTERED_ORDERS.replace(
      "WHERE",
      `JOIN ${CATALOG}.nation n ON c.c_nationkey = n.n_nationkey\n  WHERE`
    )}
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, readFilters(req.query))));

const SORTABLE = {
  date: "o.o_orderdate",
  amount: "o.o_totalprice",
  customer: "c.c_name",
  status: "o.o_orderstatus",
};

app.get("/api/orders", handle(async (req) => {
  const filters = readFilters(req.query);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(5, parseInt(req.query.pageSize, 10) || 20));
  const sortCol = SORTABLE[req.query.sort] || SORTABLE.date;
  const dir = req.query.dir === "asc" ? "ASC" : "DESC";
  const offset = (page - 1) * pageSize;

  const [rows, [count]] = await Promise.all([
    runQuery(`
      SELECT o.o_orderkey                             AS order_id,
             CAST(o.o_orderdate AS STRING)            AS order_date,
             c.c_name                                 AS customer,
             c.c_mktsegment                           AS segment,
             o.o_orderstatus                          AS status,
             o.o_orderpriority                        AS priority,
             CAST(o.o_totalprice AS DOUBLE)           AS amount
      ${FILTERED_ORDERS}
      ORDER BY ${sortCol} ${dir}, o.o_orderkey
      LIMIT ${pageSize} OFFSET ${offset}`, filters),
    runQuery(`SELECT CAST(COUNT(*) AS INT) AS total ${FILTERED_ORDERS}`, filters),
  ]);
  return { rows, total: count.total, page, pageSize };
}));

// ---------------------------------------------------------------------------
// Serve the built React app
// ---------------------------------------------------------------------------
const distDir = path.join(__dirname, "dist");
app.use(express.static(distDir));
app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));

const server = app.listen(PORT, () => console.log(`Sales dashboard listening on port ${PORT}`));

// Databricks Apps sends SIGTERM before stopping the app
process.on("SIGTERM", async () => {
  server.close();
  process.exit(0);
});