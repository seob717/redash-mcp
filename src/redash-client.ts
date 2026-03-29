const REDASH_URL = process.env.REDASH_URL?.replace(/\/$/, "");
const REDASH_API_KEY = process.env.REDASH_API_KEY;

export { REDASH_URL, REDASH_API_KEY };

export async function redashFetch(path: string, options?: RequestInit) {
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
    if (res.status === 401) hint = " (Check your REDASH_API_KEY)";
    else if (res.status === 403) hint = " (Access denied for this resource)";
    else if (res.status === 404) hint = " (Resource not found. Check the ID)";
    throw new Error(`Redash API error: ${res.status} ${res.statusText}${hint}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null;
  }
  return res.json();
}

export async function pollQueryResult(jobId: string, timeoutSecs = 30): Promise<any> {
  for (let i = 0; i < timeoutSecs; i++) {
    const job = await redashFetch(`/jobs/${jobId}`);
    if (job.job.status === 3) {
      return await redashFetch(`/query_results/${job.job.query_result_id}`);
    }
    if (job.job.status === 4) {
      throw new Error(`Query failed: ${job.job.error}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Query timed out after ${timeoutSecs}s`);
}

export function formatAsMarkdownTable(columns: string[], rows: any[]): string {
  const escape = (s: string) => s.replace(/\|/g, "\\|");
  const header = `| ${columns.map(escape).join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((row) => `| ${columns.map((c) => escape(String(row[c] ?? ""))).join(" | ")} |`)
    .join("\n");
  return `${header}\n${separator}\n${body}`;
}

const schemaCache = new Map<number, { schema: any[]; ts: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function fetchSchema(dataSourceId: number): Promise<any[]> {
  const cached = schemaCache.get(dataSourceId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.schema;
  }
  const result = await redashFetch(`/data_sources/${dataSourceId}/schema`);
  const schema = (result.schema ?? []).map((table: any) => ({
    ...table,
    columns: (table.columns ?? []).map((c: any) =>
      typeof c === "string" ? { name: c, type: "unknown" } : c
    ),
  }));
  schemaCache.set(dataSourceId, { schema, ts: Date.now() });
  return schema;
}
