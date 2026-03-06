#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

if (process.argv[2] === "setup") {
  const { main } = await import("./setup.js");
  await main();
  process.exit(0);
}

const REDASH_URL = process.env.REDASH_URL?.replace(/\/$/, "");
const REDASH_API_KEY = process.env.REDASH_API_KEY;

if (!REDASH_URL || !REDASH_API_KEY) {
  console.error("REDASH_URL and REDASH_API_KEY environment variables are required");
  process.exit(1);
}

async function redashFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${REDASH_URL}/api${path}`, {
    ...options,
    headers: {
      "Authorization": `Key ${REDASH_API_KEY}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    let hint = "";
    if (res.status === 401) hint = " (REDASH_API_KEY를 확인하세요)";
    else if (res.status === 403) hint = " (해당 리소스에 대한 접근 권한이 없습니다)";
    else if (res.status === 404) hint = " (리소스를 찾을 수 없습니다. ID를 확인하세요)";
    throw new Error(`Redash API error: ${res.status} ${res.statusText}${hint}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null;
  }
  return res.json();
}

async function pollQueryResult(jobId: string, timeoutSecs = 30): Promise<any> {
  for (let i = 0; i < timeoutSecs; i++) {
    const job = await redashFetch(`/jobs/${jobId}`);
    if (job.job.status === 3) { // 3 = success
      return await redashFetch(`/query_results/${job.job.query_result_id}`);
    }
    if (job.job.status === 4) { // 4 = failure
      throw new Error(`Query failed: ${job.job.error}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Query timed out after ${timeoutSecs}s`);
}

function formatAsMarkdownTable(columns: string[], rows: any[]): string {
  const escape = (s: string) => s.replace(/\|/g, "\\|");
  const header = `| ${columns.map(escape).join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((row) => `| ${columns.map((c) => escape(String(row[c] ?? ""))).join(" | ")} |`)
    .join("\n");
  return `${header}\n${separator}\n${body}`;
}

// Schema cache: data_source_id → { schema, timestamp }
const schemaCache = new Map<number, { schema: any[]; ts: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분

async function fetchSchema(dataSourceId: number): Promise<any[]> {
  const cached = schemaCache.get(dataSourceId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.schema;
  }
  const result = await redashFetch(`/data_sources/${dataSourceId}/schema`);
  const schema = result.schema ?? [];
  schemaCache.set(dataSourceId, { schema, ts: Date.now() });
  return schema;
}

const server = new McpServer({
  name: "redash-mcp",
  version: "2.0.2",
});

// ─── Data Sources ────────────────────────────────────────────────────────────

server.tool(
  "list_data_sources",
  "Redash에 연결된 데이터소스 목록(id, name, type)을 반환합니다. 항상 이 툴을 먼저 호출해 data_source_id를 확인하세요.",
  {},
  async () => {
    const data = await redashFetch("/data_sources");
    const sources = data.map((ds: any) => ({
      id: ds.id,
      name: ds.name,
      type: ds.type,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(sources, null, 2) }],
    };
  }
);

// ─── Schema ───────────────────────────────────────────────────────────────────

server.tool(
  "list_tables",
  "데이터소스의 테이블 목록을 반환합니다. keyword로 관련 테이블을 검색할 수 있습니다. SQL 작성 전 반드시 이 툴로 테이블명을 확인하고, get_table_columns로 컬럼을 확인하세요.",
  {
    data_source_id: z.number().describe("list_data_sources로 확인한 데이터소스 ID"),
    keyword: z.string().optional().describe("테이블명 검색 키워드 (예: 'user', 'order')"),
  },
  async ({ data_source_id, keyword }) => {
    const schema = await fetchSchema(data_source_id);
    let tables = schema.map((t: any) => t.name);
    if (keyword) {
      tables = tables.filter((name: string) => name.toLowerCase().includes(keyword.toLowerCase()));
    }
    const summary = `총 ${tables.length}개 테이블${keyword ? ` ('${keyword}' 포함)` : ""}\n\n${tables.join("\n")}`;
    return {
      content: [{ type: "text", text: summary }],
    };
  }
);

server.tool(
  "get_table_columns",
  "테이블의 컬럼명과 타입을 반환합니다. 쉼표로 여러 테이블을 동시에 조회할 수 있습니다. SQL 작성 전 실제 컬럼명을 반드시 확인하세요.",
  {
    data_source_id: z.number().describe("list_data_sources로 확인한 데이터소스 ID"),
    table_name: z.string().describe("테이블명, 쉼표로 여러 개 가능 (예: 'users' 또는 'users,orders')"),
  },
  async ({ data_source_id, table_name }) => {
    const schema = await fetchSchema(data_source_id);
    const tableNames = table_name.split(",").map((n) => n.trim()).filter(Boolean);
    const results: string[] = [];

    for (const name of tableNames) {
      let table = schema.find((t: any) => t.name.toLowerCase() === name.toLowerCase());
      if (!table) {
        table = schema.find((t: any) => t.name.toLowerCase().includes(name.toLowerCase()));
      }
      if (!table) {
        results.push(`테이블 '${name}'을 찾을 수 없습니다. list_tables로 정확한 테이블명을 확인하세요.`);
        continue;
      }
      const cols = (table.columns ?? []).map((c: any) => `${c.name} (${c.type ?? "unknown"})`).join("\n");
      results.push(`[${table.name}]\n${cols}`);
    }

    return {
      content: [{ type: "text", text: results.join("\n\n") }],
    };
  }
);

// ─── Query Execution ──────────────────────────────────────────────────────────

server.tool(
  "run_query",
  "SQL을 데이터소스에 직접 실행하고 결과를 반환합니다. SQL 작성 전 list_tables → get_table_columns로 스키마를 먼저 확인하세요.",
  {
    data_source_id: z.number().describe("list_data_sources로 확인한 데이터소스 ID"),
    query: z.string().describe("실행할 SQL 쿼리"),
    max_age: z.number().optional().default(0).describe("캐시 유지 시간(초), 0이면 항상 새로 실행"),
    max_rows: z.number().optional().default(100).describe("반환할 최대 행 수 (기본 100)"),
    format: z.enum(["table", "json"]).optional().default("table").describe("결과 포맷: table(마크다운) 또는 json"),
    timeout_secs: z.number().optional().default(30).describe("쿼리 실행 타임아웃(초)"),
  },
  async ({ data_source_id, query, max_age, max_rows, format, timeout_secs }) => {
    const res = await redashFetch("/query_results", {
      method: "POST",
      body: JSON.stringify({ data_source_id, query, max_age }),
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
      ? `\n⚠️ 전체 ${rows.length}행 중 ${max_rows}행만 표시합니다.`
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
          text: `총 ${rows.length}행 | 컬럼: ${columns.join(", ")}${truncated}\n\n${body}`,
        },
      ],
    };
  }
);

// ─── Saved Queries ────────────────────────────────────────────────────────────

server.tool(
  "list_queries",
  "Redash에 저장된 쿼리 목록을 조회합니다.",
  {
    search: z.string().optional().describe("검색어"),
    page: z.number().optional().default(1),
    page_size: z.number().optional().default(20),
  },
  async ({ search, page, page_size }) => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(page_size),
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
  }
);

server.tool(
  "get_query_result",
  "저장된 Redash 쿼리를 ID로 실행하고 결과를 반환합니다.",
  {
    query_id: z.number().describe("저장된 쿼리 ID (list_queries로 확인)"),
    max_rows: z.number().optional().default(100).describe("반환할 최대 행 수 (기본 100)"),
    format: z.enum(["table", "json"]).optional().default("table").describe("결과 포맷: table(마크다운) 또는 json"),
  },
  async ({ query_id, max_rows, format }) => {
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
      ? `\n⚠️ 전체 ${rows.length}행 중 ${max_rows}행만 표시합니다.`
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
          text: `쿼리 ID: ${query_id}\n총 ${rows.length}행 | 컬럼: ${columns.join(", ")}${truncated}\n\n${body}`,
        },
      ],
    };
  }
);

server.tool(
  "get_query",
  "저장된 쿼리의 상세 정보(SQL, 시각화, 태그 등)를 반환합니다.",
  {
    query_id: z.number().describe("쿼리 ID (list_queries로 확인)"),
  },
  async ({ query_id }) => {
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
  }
);

server.tool(
  "create_query",
  "새 쿼리를 Redash에 저장합니다.",
  {
    name: z.string().describe("쿼리 이름"),
    query: z.string().describe("SQL 쿼리"),
    data_source_id: z.number().describe("데이터소스 ID (list_data_sources로 확인)"),
    description: z.string().optional().describe("쿼리 설명"),
    tags: z.array(z.string()).optional().describe("태그 목록"),
  },
  async ({ name, query, data_source_id, description, tags }) => {
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
  }
);

server.tool(
  "update_query",
  "저장된 쿼리의 이름, SQL, 설명, 태그를 수정합니다.",
  {
    query_id: z.number().describe("수정할 쿼리 ID"),
    name: z.string().optional().describe("새 이름"),
    query: z.string().optional().describe("새 SQL"),
    description: z.string().optional().describe("새 설명"),
    tags: z.array(z.string()).optional().describe("새 태그 목록"),
  },
  async ({ query_id, name, query, description, tags }) => {
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
  }
);

server.tool(
  "fork_query",
  "기존 쿼리를 복제(fork)합니다.",
  {
    query_id: z.number().describe("복제할 쿼리 ID"),
  },
  async ({ query_id }) => {
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
  }
);

server.tool(
  "archive_query",
  "쿼리를 아카이브(삭제)합니다. 복구 불가합니다.",
  {
    query_id: z.number().describe("아카이브할 쿼리 ID"),
  },
  async ({ query_id }) => {
    await redashFetch(`/queries/${query_id}`, { method: "DELETE" });
    return {
      content: [{ type: "text", text: `쿼리 ${query_id}가 아카이브되었습니다.` }],
    };
  }
);

// ─── Dashboards ───────────────────────────────────────────────────────────────

server.tool(
  "list_dashboards",
  "Redash 대시보드 목록을 조회합니다.",
  {
    search: z.string().optional().describe("검색어"),
    page: z.number().optional().default(1),
    page_size: z.number().optional().default(20),
  },
  async ({ search, page, page_size }) => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(page_size),
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
  }
);

server.tool(
  "get_dashboard",
  "대시보드 상세 정보와 위젯(시각화) 목록을 반환합니다.",
  {
    dashboard_id_or_slug: z.string().describe("대시보드 ID 또는 slug (list_dashboards로 확인)"),
  },
  async ({ dashboard_id_or_slug }) => {
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
  }
);

server.tool(
  "create_dashboard",
  "새 대시보드를 생성합니다.",
  {
    name: z.string().describe("대시보드 이름"),
  },
  async ({ name }) => {
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
  }
);

server.tool(
  "add_widget",
  "대시보드에 시각화 위젯을 추가합니다. visualization_id는 get_query로 확인하세요.",
  {
    dashboard_id: z.number().describe("대시보드 ID"),
    visualization_id: z.number().describe("추가할 시각화 ID (get_query의 visualizations에서 확인)"),
    text: z.string().optional().default("").describe("위젯 텍스트"),
    width: z.number().optional().default(1).describe("위젯 너비 (1 또는 2)"),
  },
  async ({ dashboard_id, visualization_id, text, width }) => {
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
  }
);

// ─── Alerts ───────────────────────────────────────────────────────────────────

server.tool(
  "list_alerts",
  "Redash 알림(Alert) 목록을 조회합니다.",
  {},
  async () => {
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
  }
);

server.tool(
  "get_alert",
  "특정 알림의 상세 정보(임계값, 대상 쿼리, 상태)를 반환합니다.",
  {
    alert_id: z.number().describe("알림 ID (list_alerts로 확인)"),
  },
  async ({ alert_id }) => {
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
  }
);

server.tool(
  "create_alert",
  "새 알림을 생성합니다. 쿼리 결과의 특정 컬럼값이 임계값을 초과하면 알림을 발생시킵니다.",
  {
    name: z.string().describe("알림 이름"),
    query_id: z.number().describe("모니터링할 쿼리 ID"),
    column: z.string().describe("모니터링할 컬럼명"),
    op: z.enum(["greater than", "less than", "equals"]).describe("비교 연산자"),
    value: z.number().describe("임계값"),
    rearm: z.number().optional().default(0).describe("재알림 간격(초), 0은 한번만"),
  },
  async ({ name, query_id, column, op, value, rearm }) => {
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
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
