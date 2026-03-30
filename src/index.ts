#!/usr/bin/env node
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

const server = new McpServer({
  name: "redash-mcp",
  version: "3.0.0",
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
  "Get column names and types for one or more tables (comma-separated). Verify columns before writing SQL.",
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

server.tool(
  "run_query",
  "Execute SQL against a data source and return results. Check schema with list_tables and get_table_columns first.",
  {
    data_source_id: z.number().describe("Data source ID from list_data_sources"),
    query: z.string().describe("SQL query to execute"),
    max_age: z.number().optional().describe("Redash cache TTL in seconds. Defaults to REDASH_DEFAULT_MAX_AGE env var"),
    max_rows: z.number().optional().default(100).describe("Max rows to return (default 100)"),
    format: z.enum(["table", "json"]).optional().default("table").describe("Output format: table (markdown) or json"),
    timeout_secs: z.number().optional().default(30).describe("Query execution timeout in seconds"),
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
  "List saved queries in Redash.",
  {
    search: z.string().optional().describe("Search keyword"),
    page: z.number().optional().default(1),
    page_size: z.number().optional().default(20).describe("Page size (max 100)"),
  },
  { readOnlyHint: true },
  async ({ search, page, page_size }) => {
    try {
      const effectivePageSize = Math.min(page_size, 100);
      const params = new URLSearchParams({
        page: String(page),
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
  "Execute a saved query by ID and return results.",
  {
    query_id: z.number().describe("Saved query ID (from list_queries)"),
    max_rows: z.number().optional().default(100).describe("Max rows to return (default 100)"),
    format: z.enum(["table", "json"]).optional().default("table").describe("Output format: table (markdown) or json"),
  },
  { readOnlyHint: true },
  async ({ query_id, max_rows, format }) => {
    try {
      const res = await redashFetch(`/queries/${query_id}/results`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      let result;
      if (res.job) {
        result = await pollQueryResult(res.job.id);
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
  "Get saved query details (SQL, visualizations, tags).",
  {
    query_id: z.number().describe("Query ID (from list_queries)"),
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
  "Save a new query to Redash.",
  {
    name: z.string().describe("Query name"),
    query: z.string().describe("SQL query"),
    data_source_id: z.number().describe("Data source ID from list_data_sources"),
    description: z.string().optional().describe("Query description"),
    tags: z.array(z.string()).optional().describe("Tags"),
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
  "Update a saved query's name, SQL, description, or tags.",
  {
    query_id: z.number().describe("Query ID to update"),
    name: z.string().optional().describe("New name"),
    query: z.string().optional().describe("New SQL"),
    description: z.string().optional().describe("New description"),
    tags: z.array(z.string()).optional().describe("New tags"),
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
  "Fork (duplicate) an existing query.",
  {
    query_id: z.number().describe("Query ID to fork"),
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
  "Archive (delete) a query. This action is irreversible.",
  {
    query_id: z.number().describe("Query ID to archive"),
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
  "List dashboards in Redash.",
  {
    search: z.string().optional().describe("Search keyword"),
    page: z.number().optional().default(1),
    page_size: z.number().optional().default(20).describe("Page size (max 100)"),
  },
  { readOnlyHint: true },
  async ({ search, page, page_size }) => {
    try {
      const effectivePageSize = Math.min(page_size, 100);
      const params = new URLSearchParams({
        page: String(page),
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
  "Get dashboard details including widgets and visualizations.",
  {
    dashboard_id_or_slug: z.string().describe("Dashboard ID or slug (from list_dashboards)"),
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
  "Create a new dashboard.",
  {
    name: z.string().describe("Dashboard name"),
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
  "Add a visualization widget to a dashboard. Get visualization_id from get_query.",
  {
    dashboard_id: z.number().describe("Dashboard ID"),
    visualization_id: z.number().describe("Visualization ID (from get_query's visualizations)"),
    text: z.string().optional().default("").describe("Widget text"),
    width: z.number().optional().default(1).describe("Widget width (1 or 2)"),
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
  "List alerts in Redash.",
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
  "Get alert details (threshold, linked query, state).",
  {
    alert_id: z.number().describe("Alert ID (from list_alerts)"),
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
  "Create a new alert. Triggers when a query result column crosses a threshold.",
  {
    name: z.string().describe("Alert name"),
    query_id: z.number().describe("Query ID to monitor"),
    column: z.string().describe("Column name to monitor"),
    op: z.enum(["greater than", "less than", "equals"]).describe("Comparison operator"),
    value: z.number().describe("Threshold value"),
    rearm: z.number().optional().default(0).describe("Rearm interval in seconds (0 = fire once)"),
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
