#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { analyzeQuery } from "./sql-guard.js";
import { getCached, setCached } from "./query-cache.js";
import { REDASH_URL, REDASH_API_KEY, redashFetch, pollQueryResult, formatAsMarkdownTable, fetchSchema } from "./redash-client.js";
import { registerBirdTools } from "./bird/tools.js";
import { handleToolError } from "./tool-error.js";

if (process.argv[2] === "setup") {
  const { main } = await import("./setup.js");
  await main();
  process.exit(0);
}

if (!REDASH_URL || !REDASH_API_KEY) {
  console.error("REDASH_URL and REDASH_API_KEY environment variables are required");
  process.exit(1);
}

function readPackageVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(here, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const server = new McpServer({
  name: "redash-mcp",
  version: readPackageVersion(),
});

server.tool(
  "list_data_sources",
  "List connected data sources (id, name, type). Call this first to get data_source_id.",
  {},
  { readOnlyHint: true },
  async () => {
    try {
      const data = await redashFetch("/data_sources");
      const sources = data.map((ds: any) => ({
        id: ds.id,
        name: ds.name,
        type: ds.type,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(sources, null, 2) }],
      };
    } catch (error) {
      return handleToolError("list_data_sources", error);
    }
  }
);

server.tool(
  "list_tables",
  "List tables in a data source. Use keyword to filter by name. Verify table names here before writing SQL.",
  {
    data_source_id: z.number().describe("Data source ID from list_data_sources"),
    keyword: z.string().optional().describe("Filter keyword for table names (e.g., 'user', 'order')"),
  },
  { readOnlyHint: true },
  async ({ data_source_id, keyword }) => {
    try {
      const schema = await fetchSchema(data_source_id);
      let tables = schema.map((t: any) => t.name);
      if (keyword) {
        tables = tables.filter((name: string) => name.toLowerCase().includes(keyword.toLowerCase()));
      }
      const total = tables.length;
      const MAX_TABLES = 200;
      const truncated = tables.length > MAX_TABLES;
      if (truncated) tables = tables.slice(0, MAX_TABLES);
      const summary = `${total} tables${keyword ? ` (matching '${keyword}')` : ""}${truncated ? ` (showing first ${MAX_TABLES}, use keyword to filter)` : ""}\n\n${tables.join("\n")}`;
      return {
        content: [{ type: "text", text: summary }],
      };
    } catch (error) {
      return handleToolError("list_tables", error);
    }
  }
);

server.tool(
  "get_table_columns",
  "Get the column names and data types for one or more tables in a data source. Accepts a single table or a comma-separated list of tables. Use this to confirm exact column names and types before writing SQL with run_query or smart_query. Returns each table's columns; if a table name is not found, it suggests verifying it with list_tables.",
  {
    data_source_id: z.number().describe("Data source ID from list_data_sources"),
    table_name: z.string().describe("Table name(s), comma-separated (e.g., 'users' or 'users,orders')"),
  },
  { readOnlyHint: true },
  async ({ data_source_id, table_name }) => {
    try {
      const schema = await fetchSchema(data_source_id);
      const tableNames = table_name.split(",").map((n) => n.trim()).filter(Boolean);
      const results: string[] = [];

      for (const name of tableNames) {
        let table = schema.find((t: any) => t.name.toLowerCase() === name.toLowerCase());
        if (!table) {
          table = schema.find((t: any) => t.name.toLowerCase().includes(name.toLowerCase()));
        }
        if (!table) {
          results.push(`Table '${name}' not found. Use list_tables to verify the table name.`);
          continue;
        }
        const cols = (table.columns ?? []).map((c: any) =>
          typeof c === "string" ? c : `${c.name} (${c.type ?? "unknown"})`
        ).join("\n");
        results.push(`[${table.name}]\n${cols}`);
      }

      return {
        content: [{ type: "text", text: results.join("\n\n") }],
      };
    } catch (error) {
      return handleToolError("get_table_columns", error);
    }
  }
);

const DEFAULT_MAX_AGE = parseInt(process.env.REDASH_DEFAULT_MAX_AGE ?? "0", 10) || 0;

const MAX_ROWS_LIMIT = 10000;
const MAX_TIMEOUT_SECS = 300;
const MAX_CACHE_AGE_SECS = 86400 * 7;

server.tool(
  "run_query",
  "Execute an ad-hoc SQL query against a data source and return the resulting rows. Every query passes through the SQL safety guard, which blocks destructive statements (DROP/TRUNCATE/ALTER, DELETE/UPDATE without WHERE) and flags PII columns and expensive full scans; results are cached in memory. Behavior: returns up to max_rows rows as a markdown table or JSON, with the column list and a truncation note when there are more rows. Usage: confirm table and column names with list_tables and get_table_columns first; for natural-language questions, plan the SQL with smart_query before calling this. To run an already-saved query instead, use get_query_result.",
  {
    data_source_id: z.number().int().nonnegative().describe("Data source ID from list_data_sources"),
    query: z.string().describe("SQL query to execute"),
    max_age: z.number().int().min(0).max(MAX_CACHE_AGE_SECS).optional().describe("Redash cache TTL in seconds (0 to 604800). Defaults to REDASH_DEFAULT_MAX_AGE env var"),
    max_rows: z.number().int().min(1).max(MAX_ROWS_LIMIT).optional().default(100).describe(`Max rows to return (1 to ${MAX_ROWS_LIMIT}, default 100)`),
    format: z.enum(["table", "json"]).optional().default("table").describe("Output format: table (markdown) or json"),
    timeout_secs: z.number().int().min(1).max(MAX_TIMEOUT_SECS).optional().default(30).describe(`Query execution timeout in seconds (1 to ${MAX_TIMEOUT_SECS}, default 30)`),
  },
  { readOnlyHint: true },
  async ({ data_source_id, query, max_age, max_rows, format, timeout_secs }) => {
    try {
      const guard = analyzeQuery(query);
      if (guard.blocked) {
        return { content: [{ type: "text", text: guard.message }] };
      }

      const effectiveQuery = guard.modifiedQuery ?? query;
      const effectiveMaxAge = max_age ?? DEFAULT_MAX_AGE;

      const cached = getCached(data_source_id, effectiveQuery);
      if (cached) {
        const { rows, columns, warningPrefix } = cached;
        const displayRows = rows.slice(0, max_rows);
        const truncated = rows.length > max_rows
          ? `\n⚠️ Showing ${max_rows} of ${rows.length} rows.`
          : "";
        let body: string;
        if (format === "json") {
          body = JSON.stringify(displayRows, null, 2);
        } else {
          body = formatAsMarkdownTable(columns, displayRows);
        }
        const cacheNote = "Returned from MCP cache.\n\n";
        return {
          content: [
            {
              type: "text",
              text: `${warningPrefix}${cacheNote}${rows.length} rows | Columns: ${columns.join(", ")}${truncated}\n\n${body}`,
            },
          ],
        };
      }

      const res = await redashFetch("/query_results", {
        method: "POST",
        body: JSON.stringify({ data_source_id, query: effectiveQuery, max_age: effectiveMaxAge }),
      });

      let result;
      if (res.job) {
        result = await pollQueryResult(res.job.id, timeout_secs);
      } else {
        result = res;
      }

      const qr = result.query_result;
      const rows = qr.data.rows;
      const columns = qr.data.columns.map((c: any) => c.name);

      const warningPrefix = guard.message ? `${guard.message}\n\n` : "";
      setCached(data_source_id, effectiveQuery, { rows, columns, warningPrefix });

      const displayRows = rows.slice(0, max_rows);
      const truncated = rows.length > max_rows
        ? `\n⚠️ Showing ${max_rows} of ${rows.length} rows.`
        : "";

      let body: string;
      if (format === "json") {
        body = JSON.stringify(displayRows, null, 2);
      } else {
        body = formatAsMarkdownTable(columns, displayRows);
      }

      return {
        content: [
          {
            type: "text",
            text: `${warningPrefix}${rows.length} rows | Columns: ${columns.join(", ")}${truncated}\n\n${body}`,
          },
        ],
      };
    } catch (error) {
      return handleToolError("run_query", error);
    }
  }
);

server.tool(
  "list_queries",
  "List saved (named) queries in Redash, most recently updated first. Behavior: returns a paginated array where each item has id, name, description, data_source_id, and updated_at. Usage: use this to discover query_ids, then call get_query for a query's full SQL and visualizations, or get_query_result to run it. Supports keyword search and pagination; for ad-hoc SQL that isn't saved, use run_query instead.",
  {
    search: z.string().optional().describe("Optional keyword to filter queries by name/description"),
    page: z.number().optional().default(1).describe("Page number to fetch, 1-based (default 1)"),
    page_size: z.number().optional().default(20).describe("Number of queries per page, 1-100 (default 20)"),
  },
  { readOnlyHint: true },
  async ({ search, page, page_size }) => {
    try {
      const effectivePageSize = Math.max(1, Math.min(page_size, 100));
      const effectivePage = Math.max(1, page);
      const params = new URLSearchParams({
        page: String(effectivePage),
        page_size: String(effectivePageSize),
        ...(search ? { q: search } : {}),
      });
      const data = await redashFetch(`/queries?${params}`);
      const queries = data.results.map((q: any) => ({
        id: q.id,
        name: q.name,
        description: q.description,
        data_source_id: q.data_source_id,
        updated_at: q.updated_at,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(queries, null, 2) }],
      };
    } catch (error) {
      return handleToolError("list_queries", error);
    }
  }
);

server.tool(
  "get_query_result",
  "Run an existing saved query by its ID and return the latest results. Behavior: executes the query as stored in Redash and returns up to max_rows rows as a markdown table or JSON, with the column list and a truncation note. Usage: find the query_id with list_queries or get_query. Unlike run_query, this executes already-saved SQL rather than ad-hoc SQL, so the safety guard does not apply.",
  {
    query_id: z.number().int().nonnegative().describe("ID of the saved query to run (from list_queries)"),
    max_rows: z.number().int().min(1).max(MAX_ROWS_LIMIT).optional().default(100).describe(`Max rows to return (1 to ${MAX_ROWS_LIMIT}, default 100)`),
    format: z.enum(["table", "json"]).optional().default("table").describe("Output format: table (markdown) or json"),
    timeout_secs: z.number().int().min(1).max(MAX_TIMEOUT_SECS).optional().default(30).describe(`Query execution timeout in seconds (1 to ${MAX_TIMEOUT_SECS}, default 30)`),
  },
  { readOnlyHint: true },
  async ({ query_id, max_rows, format, timeout_secs }) => {
    try {
      const res = await redashFetch(`/queries/${query_id}/results`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      let result;
      if (res.job) {
        result = await pollQueryResult(res.job.id, timeout_secs);
      } else {
        result = res;
      }

      const qr = result.query_result;
      const rows = qr.data.rows;
      const columns = qr.data.columns.map((c: any) => c.name);
      const displayRows = rows.slice(0, max_rows);
      const truncated = rows.length > max_rows
        ? `\n⚠️ Showing ${max_rows} of ${rows.length} rows.`
        : "";

      let body: string;
      if (format === "json") {
        body = JSON.stringify(displayRows, null, 2);
      } else {
        body = formatAsMarkdownTable(columns, displayRows);
      }

      return {
        content: [
          {
            type: "text",
            text: `Query ID: ${query_id}\n${rows.length} rows | Columns: ${columns.join(", ")}${truncated}\n\n${body}`,
          },
        ],
      };
    } catch (error) {
      return handleToolError("get_query_result", error);
    }
  }
);

server.tool(
  "get_query",
  "Get the full definition of a saved query. Behavior: returns the query's SQL text, data_source_id, tags, owner, update time, and its visualizations (each with id, name, type). Usage: find the query_id with list_queries. The returned visualization ids can be placed on a dashboard with add_widget; to actually run the query use get_query_result.",
  {
    query_id: z.number().describe("ID of the saved query to inspect (from list_queries)"),
  },
  { readOnlyHint: true },
  async ({ query_id }) => {
    try {
      const data = await redashFetch(`/queries/${query_id}`);
      const result = {
        id: data.id,
        name: data.name,
        description: data.description,
        query: data.query,
        data_source_id: data.data_source_id,
        tags: data.tags,
        visualizations_count: Array.isArray(data.visualizations) ? data.visualizations.length : 0,
        visualizations: Array.isArray(data.visualizations)
          ? data.visualizations.map((v: any) => ({ id: v.id, name: v.name, type: v.type }))
          : [],
        updated_at: data.updated_at,
        user: data.user?.name,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return handleToolError("get_query", error);
    }
  }
);

server.tool(
  "create_query",
  "Save a new named SQL query to Redash so it can be reused, scheduled, visualized, or added to a dashboard. Behavior: creates the query and returns its new id, name, and created_at. Usage: get the data_source_id from list_data_sources and verify the SQL runs with run_query first; to change an existing query use update_query instead. Note: this only saves the query — use get_query_result to execute it.",
  {
    name: z.string().describe("Display name for the saved query"),
    query: z.string().describe("The SQL statement to save"),
    data_source_id: z.number().describe("ID of the data source this query runs against (from list_data_sources)"),
    description: z.string().optional().describe("Optional human-readable description of what the query does"),
    tags: z.array(z.string()).optional().describe("Optional tags to categorize the query (e.g., ['finance', 'weekly'])"),
  },
  { destructiveHint: true },
  async ({ name, query, data_source_id, description, tags }) => {
    try {
      const body: Record<string, unknown> = { name, query, data_source_id };
      if (description !== undefined) body.description = description;
      if (tags !== undefined) body.tags = tags;
      const data = await redashFetch("/queries", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ id: data.id, name: data.name, created_at: data.created_at }, null, 2),
          },
        ],
      };
    } catch (error) {
      return handleToolError("create_query", error);
    }
  }
);

server.tool(
  "update_query",
  "Update fields of an existing saved query. Behavior: only the fields you pass are changed (name, SQL, description, or tags); any omitted field is left untouched. Returns the query's id, name, and updated_at. Usage: find the query_id with list_queries or get_query; to create a brand-new query instead, use create_query.",
  {
    query_id: z.number().describe("ID of the saved query to update (from list_queries)"),
    name: z.string().optional().describe("New display name (omit to keep current)"),
    query: z.string().optional().describe("New SQL statement (omit to keep current)"),
    description: z.string().optional().describe("New description (omit to keep current)"),
    tags: z.array(z.string()).optional().describe("New tag list, replacing the existing tags (omit to keep current)"),
  },
  { destructiveHint: true },
  async ({ query_id, name, query, description, tags }) => {
    try {
      const body: Record<string, unknown> = {};
      if (name !== undefined) body.name = name;
      if (query !== undefined) body.query = query;
      if (description !== undefined) body.description = description;
      if (tags !== undefined) body.tags = tags;
      const data = await redashFetch(`/queries/${query_id}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ id: data.id, name: data.name, updated_at: data.updated_at }, null, 2),
          },
        ],
      };
    } catch (error) {
      return handleToolError("update_query", error);
    }
  }
);

server.tool(
  "fork_query",
  "Fork (duplicate) an existing saved query into a new, independently editable copy, leaving the original unchanged. Behavior: creates the copy and returns its new id and name. Usage: find the query_id to fork with list_queries; use this when you want to experiment with or adapt a query without modifying the original.",
  {
    query_id: z.number().describe("ID of the saved query to duplicate (from list_queries)"),
  },
  { destructiveHint: true },
  async ({ query_id }) => {
    try {
      const data = await redashFetch(`/queries/${query_id}/fork`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ id: data.id, name: data.name }, null, 2),
          },
        ],
      };
    } catch (error) {
      return handleToolError("fork_query", error);
    }
  }
);

server.tool(
  "archive_query",
  "Archive a saved query, removing it from active query lists. This is Redash's form of deletion and cannot be undone through the API, so confirm with the user before calling it. Behavior: archives the query and returns a confirmation message. Usage: find the query_id with list_queries.",
  {
    query_id: z.number().describe("ID of the saved query to archive/delete (from list_queries)"),
  },
  { destructiveHint: true },
  async ({ query_id }) => {
    try {
      await redashFetch(`/queries/${query_id}`, { method: "DELETE" });
      return {
        content: [{ type: "text", text: `Query ${query_id} has been archived.` }],
      };
    } catch (error) {
      return handleToolError("archive_query", error);
    }
  }
);

server.tool(
  "list_dashboards",
  "List dashboards in Redash, most recently updated first. Behavior: returns a paginated array where each item has id, name, slug, and created/updated timestamps. Usage: use this to discover a dashboard's id or slug, then call get_dashboard to inspect its widgets and visualizations, or create_dashboard to make a new one. Supports keyword search and pagination.",
  {
    search: z.string().optional().describe("Optional keyword to filter dashboards by name"),
    page: z.number().optional().default(1).describe("Page number to fetch, 1-based (default 1)"),
    page_size: z.number().optional().default(20).describe("Number of dashboards per page, 1-100 (default 20)"),
  },
  { readOnlyHint: true },
  async ({ search, page, page_size }) => {
    try {
      const effectivePageSize = Math.max(1, Math.min(page_size, 100));
      const effectivePage = Math.max(1, page);
      const params = new URLSearchParams({
        page: String(effectivePage),
        page_size: String(effectivePageSize),
        ...(search ? { q: search } : {}),
      });
      const data = await redashFetch(`/dashboards?${params}`);
      const results = (data.results ?? data).map((d: any) => ({
        id: d.id,
        name: d.name,
        slug: d.slug,
        created_at: d.created_at,
        updated_at: d.updated_at,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    } catch (error) {
      return handleToolError("list_dashboards", error);
    }
  }
);

server.tool(
  "get_dashboard",
  "Get a dashboard's full layout. Behavior: returns the dashboard's id, name, slug, and every widget, each with its linked visualization (id, name, type) and the query behind it (id, name). Usage: find the dashboard id or slug with list_dashboards; use the returned visualization/query ids to understand or extend the dashboard with add_widget.",
  {
    dashboard_id_or_slug: z.string().describe("Dashboard ID or slug to fetch (from list_dashboards)"),
  },
  { readOnlyHint: true },
  async ({ dashboard_id_or_slug }) => {
    try {
      const data = await redashFetch(`/dashboards/${dashboard_id_or_slug}`);
      const result = {
        id: data.id,
        name: data.name,
        slug: data.slug,
        widgets: Array.isArray(data.widgets)
          ? data.widgets.map((w: any) => ({
              id: w.id,
              visualization: w.visualization
                ? { id: w.visualization.id, name: w.visualization.name, type: w.visualization.type }
                : null,
              query: w.visualization?.query
                ? { id: w.visualization.query.id, name: w.visualization.query.name }
                : null,
            }))
          : [],
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return handleToolError("get_dashboard", error);
    }
  }
);

server.tool(
  "create_dashboard",
  "Create a new, empty dashboard. Behavior: creates the dashboard and returns its id, name, and slug. Usage: after creating it, populate it with charts using add_widget, passing visualization ids obtained from get_query. To list or inspect existing dashboards instead, use list_dashboards / get_dashboard.",
  {
    name: z.string().describe("Display name for the new dashboard"),
  },
  { destructiveHint: true },
  async ({ name }) => {
    try {
      const data = await redashFetch("/dashboards", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ id: data.id, name: data.name, slug: data.slug }, null, 2),
          },
        ],
      };
    } catch (error) {
      return handleToolError("create_dashboard", error);
    }
  }
);

server.tool(
  "add_widget",
  "Add a saved query's visualization onto a dashboard as a widget. Behavior: places the widget and returns its id and dashboard_id. Usage: get the dashboard_id from list_dashboards or create_dashboard, and the visualization_id from get_query (each saved query exposes its visualizations). This is how you build up a dashboard after creating it.",
  {
    dashboard_id: z.number().describe("ID of the dashboard to add the widget to (from list_dashboards/create_dashboard)"),
    visualization_id: z.number().describe("ID of the visualization to embed (from get_query's visualizations list)"),
    text: z.string().optional().default("").describe("Optional text/markdown caption shown on the widget"),
    width: z.union([z.literal(1), z.literal(2)]).optional().default(1).describe("Widget width: 1 = half row, 2 = full row (default 1)"),
  },
  { destructiveHint: true },
  async ({ dashboard_id, visualization_id, text, width }) => {
    try {
      const data = await redashFetch("/widgets", {
        method: "POST",
        body: JSON.stringify({
          dashboard_id,
          visualization_id,
          text,
          width,
          options: {},
        }),
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ id: data.id, dashboard_id: data.dashboard_id }, null, 2),
          },
        ],
      };
    } catch (error) {
      return handleToolError("add_widget", error);
    }
  }
);

server.tool(
  "list_alerts",
  "List all alerts configured in Redash. Behavior: returns an array where each alert has id, name, current state (ok / triggered / unknown), last_triggered_at, its linked query (id, name), and threshold options. Usage: use this to discover alert_ids, then call get_alert for one alert's full detail, or create_alert to add a new one.",
  {},
  { readOnlyHint: true },
  async () => {
    try {
      const data = await redashFetch("/alerts");
      const alerts = Array.isArray(data) ? data : [];
      const result = alerts.map((alert: any) => ({
        id: alert.id,
        name: alert.name,
        state: alert.state,
        last_triggered_at: alert.last_triggered_at,
        query: alert.query ? { id: alert.query.id, name: alert.query.name } : null,
        options: alert.options,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return handleToolError("list_alerts", error);
    }
  }
);

server.tool(
  "get_alert",
  "Get the full detail of a single alert. Behavior: returns the alert's id, name, current state, last_triggered_at, threshold options (column, operator, value), and the query it monitors (id, name, description, data_source_id). Usage: find the alert_id with list_alerts.",
  {
    alert_id: z.number().describe("ID of the alert to inspect (from list_alerts)"),
  },
  { readOnlyHint: true },
  async ({ alert_id }) => {
    try {
      const alert = await redashFetch(`/alerts/${alert_id}`);
      const result = {
        id: alert.id,
        name: alert.name,
        state: alert.state,
        last_triggered_at: alert.last_triggered_at,
        query: alert.query
          ? {
              id: alert.query.id,
              name: alert.query.name,
              description: alert.query.description,
              data_source_id: alert.query.data_source_id,
            }
          : null,
        options: alert.options,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return handleToolError("get_alert", error);
    }
  }
);

server.tool(
  "create_alert",
  "Create an alert that watches a saved query and fires when a chosen result column crosses a threshold (e.g., daily_signups less than 10). Behavior: creates the alert and returns its id and name. Usage: get the query_id from list_queries and confirm the exact column name with get_query / get_query_result first. The alert evaluates the query's latest result on Redash's schedule.",
  {
    name: z.string().describe("Display name for the alert"),
    query_id: z.number().describe("ID of the saved query whose results are monitored (from list_queries)"),
    column: z.string().describe("Name of the result column to compare against the threshold"),
    op: z.enum(["greater than", "less than", "equals"]).describe("Comparison operator between the column value and the threshold"),
    value: z.number().describe("Threshold value that triggers the alert when the comparison is true"),
    rearm: z.number().optional().default(0).describe("Seconds to wait before the alert can fire again; 0 means fire only once until manually reset (default 0)"),
  },
  { destructiveHint: true },
  async ({ name, query_id, column, op, value, rearm }) => {
    try {
      const data = await redashFetch("/alerts", {
        method: "POST",
        body: JSON.stringify({
          name,
          query_id,
          rearm: rearm ?? 0,
          options: { column, op, value },
        }),
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ id: data.id, name: data.name }, null, 2),
          },
        ],
      };
    } catch (error) {
      return handleToolError("create_alert", error);
    }
  }
);


registerBirdTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
