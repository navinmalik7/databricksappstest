# Sales Dashboard — React + Node.js on Databricks Apps

A reporting app built as a **Databricks custom app**:

- **Frontend:** React 18 + Vite + Recharts (KPI cards, trend chart, segment chart, nation table, paginated orders table with sorting and CSV export, shareable URL filters)
- **Backend:** Node.js + Express, querying a **SQL Warehouse** with `@databricks/sql`
- **Data:** built-in `samples.tpch` catalog (orders, customer, nation) — no ingestion needed

```
Browser (React) ──fetch /api/*──► Express (server.js) ──SQL──► SQL Warehouse ──► samples.tpch
```

## Project structure

```
sales-dashboard/
├── app.yaml               How Databricks starts the app + WAREHOUSE_ID binding
├── package.json           build = vite build, start = node server.js
├── server.js              Express API (all SQL lives here)
├── vite.config.js         Dev proxy /api -> localhost:8000
├── index.html
└── src/
    ├── main.jsx, App.jsx, api.js, styles.css
    └── components/        FilterBar, KpiCards, RevenueTrend, SegmentChart,
                           NationTable, OrdersTable, ChartState
```

## API endpoints

All accept `start`, `end` (YYYY-MM-DD) and `segment` (ALL, AUTOMOBILE, BUILDING, FURNITURE, HOUSEHOLD, MACHINERY).

| Endpoint | Returns |
|---|---|
| `GET /api/filters` | Segment list and min/max order dates |
| `GET /api/kpis` | Revenue, orders, customers, avg order value |
| `GET /api/revenue-by-month` | Monthly revenue trend |
| `GET /api/revenue-by-segment` | Revenue per market segment |
| `GET /api/top-nations` | Top 10 nations by revenue |
| `GET /api/orders` | Paginated orders (`page`, `pageSize`, `sort`=date/amount/customer/status, `dir`=asc/desc) |

Filters are validated and sent to the warehouse as **named parameters**, never pasted into SQL. Results are cached in memory for 5 minutes.

---

## Prerequisites

- Databricks workspace with **Apps** and **Unity Catalog** enabled
- A **SQL warehouse** (serverless recommended) that you have *Can manage* on
- **Databricks CLI** installed on your laptop (`databricks --version`)
- **Node.js 20+** (only needed to run locally; Databricks builds it on deploy)

## Step 1 — Create the app in the Databricks UI

1. Go to **Compute → Apps → Create app → Create a custom app**.
2. Name it `sales-dashboard`.
3. Under **App resources**, click **Add resource → SQL warehouse**:
   - Select your warehouse
   - Permission: **Can use**
   - Resource key: **`sql-warehouse`** (must match `app.yaml`)
4. Click **Create**. Wait until compute shows **Active**.

## Step 2 — Log in with the CLI

```bash
databricks auth login --host https://<your-workspace-url>
```

## Step 3 — Upload the code

From inside the `sales-dashboard` folder:

```bash
databricks sync . /Workspace/Users/<your-email>/sales-dashboard
```

`node_modules/` and `dist/` are skipped automatically (they are in `.gitignore`).

## Step 4 — Deploy

```bash
databricks apps deploy sales-dashboard \
  --source-code-path /Workspace/Users/<your-email>/sales-dashboard
```

On deploy, Databricks sees `package.json`, runs `npm install`, then `npm run build` (builds React into `dist/`), then starts the app with `npm run start` from `app.yaml`.

Open the app URL from the Apps page. 

## Step 5 — Share

App page → **Permissions** → give users or groups **Can use**. They sign in with their normal Databricks login.

## Redeploying after changes

```bash
databricks sync . /Workspace/Users/<your-email>/sales-dashboard
databricks apps deploy sales-dashboard --source-code-path /Workspace/Users/<your-email>/sales-dashboard
```

Tip: run `databricks sync --watch . /Workspace/Users/<your-email>/sales-dashboard` in a terminal to upload on every save.

---

## Run locally (optional)

```bash
npm install
export DATABRICKS_HOST=https://<your-workspace-url>
export WAREHOUSE_ID=<warehouse-id>        # from SQL Warehouses → your warehouse → Connection details
export DATABRICKS_TOKEN=<personal-access-token>
npm run dev
```

Open http://localhost:5173. Vite serves React with hot reload and forwards `/api` to the Node server on port 8000.

## Authentication

| Where | How the server authenticates |
|---|---|
| Deployed in Databricks Apps | The app's own **service principal** (OAuth). `DATABRICKS_CLIENT_ID` / `DATABRICKS_CLIENT_SECRET` are injected automatically. |
| Locally | Your personal access token (`DATABRICKS_TOKEN`). |

Every viewer sees the same data (queries run as the app's service principal). For per-user, row-level security later, enable user authorization and use the `x-forwarded-access-token` header.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Missing DATABRICKS_HOST or WAREHOUSE_ID" in logs | The resource key in the UI must be exactly `sql-warehouse`. |
| `PERMISSION_DENIED` on the warehouse | Give the app's service principal **Can use** on the warehouse. |
| `TABLE_OR_VIEW_NOT_FOUND samples.tpch...` | Check the `samples` catalog is visible in Catalog Explorer; grant the service principal `USE CATALOG`/`SELECT` if your admin restricted it. |
| App shows "Crashed" | Open the app → **Logs** tab to see the Node error. |
| First load is slow | Serverless warehouses take a few seconds to start; later loads are cached. |

## Switching to your own data

1. Change `const CATALOG = "samples.tpch"` in `server.js` to your `catalog.schema`.
2. Adjust the column names in the SQL in `server.js`.
3. Grant the app's service principal `USE CATALOG`, `USE SCHEMA` and `SELECT` on your tables.

The React code stays the same as long as the API returns the same field names.
