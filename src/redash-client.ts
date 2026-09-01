function validateRedashUrl(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  if (/[\n\r]/.test(raw)) {
    throw new Error("REDASH_URL must not contain newlines");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`REDASH_URL is not a valid URL: ${raw}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("REDASH_URL must not contain credentials");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `REDASH_URL must use http or https scheme, got: ${parsed.protocol}`
    );
  }
  return trimmed.replace(/\/$/, "");
}

const REDASH_URL = validateRedashUrl(process.env.REDASH_URL);
const REDASH_API_KEY = process.env.REDASH_API_KEY;

const HTTP_TIMEOUT_MS = (() => {
  const MAX_TIMEOUT_SECS = 600;
  const raw = parseInt(process.env.REDASH_HTTP_TIMEOUT_SECS ?? "30", 10);
  const clamped = !Number.isFinite(raw) || raw <= 0 ? 30 : Math.min(raw, MAX_TIMEOUT_SECS);
  return clamped * 1000;
})();

export { REDASH_URL, REDASH_API_KEY };

export class RedashApiError extends Error {
  constructor(
    public readonly status: number,
    statusText: string,
    hint = "",
  ) {
    super(`Redash API error: ${status} ${statusText}${hint}`);
    this.name = "RedashApiError";
  }
}

export async function redashFetch(path: string, options?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${REDASH_URL}/api${path}`, {
      ...options,
      signal: options?.signal ?? controller.signal,
      headers: {
        "Authorization": `Key ${REDASH_API_KEY}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`Redash request timed out after ${HTTP_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let hint = "";
    if (res.status === 401) hint = " (Check your REDASH_API_KEY)";
    else if (res.status === 403) hint = " (Access denied for this resource)";
    else if (res.status === 404) hint = " (Resource not found. Check the ID)";
    throw new RedashApiError(res.status, res.statusText, hint);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null;
  }
  return res.json();
}

// Redash job statuses: 1 pending, 2 started, 3 finished, 4 failed, 5 cancelled.
export async function pollQueryResult(jobId: string, timeoutSecs = 30): Promise<any> {
  const deadline = Date.now() + timeoutSecs * 1000;
  let delayMs = 250;
  while (Date.now() < deadline) {
    const res = await redashFetch(`/jobs/${jobId}`);
    const job = res?.job;
    if (!job) {
      throw new Error(`Unexpected job status response for job ${jobId}`);
    }
    if (job.status === 3) {
      return await redashFetch(`/query_results/${job.query_result_id}`);
    }
    if (job.status === 4) {
      throw new Error(`Query failed: ${job.error}`);
    }
    if (job.status === 5) {
      throw new Error("Query was cancelled on the Redash server");
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(delayMs, remaining)));
    delayMs = Math.min(delayMs * 2, 2000);
  }
  throw new Error(`Query timed out after ${timeoutSecs}s`);
}

/**
 * Resolves a POSTed query-execution response: polls the job if Redash queued
 * one, then unwraps the rows and column names.
 */
export async function resolveQueryResult(
  res: any,
  timeoutSecs: number,
): Promise<{ columns: string[]; rows: any[] }> {
  const result = res?.job ? await pollQueryResult(res.job.id, timeoutSecs) : res;
  const qr = result?.query_result;
  if (!qr?.data) {
    throw new Error("Unexpected query result response from Redash");
  }
  return {
    columns: qr.data.columns.map((c: any) => c.name),
    rows: qr.data.rows,
  };
}

/** Executes ad-hoc SQL against a data source and returns its rows. */
export async function executeSql(
  dataSourceId: number,
  query: string,
  opts: { maxAge: number; timeoutSecs: number },
): Promise<{ columns: string[]; rows: any[] }> {
  const res = await redashFetch("/query_results", {
    method: "POST",
    body: JSON.stringify({ data_source_id: dataSourceId, query, max_age: opts.maxAge }),
  });
  return resolveQueryResult(res, opts.timeoutSecs);
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

/** Shared row rendering for query-result tools: header, truncation note, body. */
export function formatQueryResult(
  columns: string[],
  rows: any[],
  maxRows: number,
  format: "table" | "json",
): string {
  const displayRows = rows.slice(0, maxRows);
  const truncated = rows.length > maxRows
    ? `\n⚠️ Showing ${maxRows} of ${rows.length} rows.`
    : "";
  const body = format === "json"
    ? JSON.stringify(displayRows, null, 2)
    : formatAsMarkdownTable(columns, displayRows);
  return `${rows.length} rows | Columns: ${columns.join(", ")}${truncated}\n\n${body}`;
}

const schemaCache = new Map<number, { schema: any[]; ts: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const SCHEMA_CACHE_MAX_ENTRIES = 32;

export async function fetchSchema(dataSourceId: number): Promise<any[]> {
  const cached = schemaCache.get(dataSourceId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    schemaCache.delete(dataSourceId);
    schemaCache.set(dataSourceId, cached);
    return cached.schema;
  }
  if (cached) schemaCache.delete(dataSourceId);
  const result = await redashFetch(`/data_sources/${dataSourceId}/schema`);
  if (!result || !Array.isArray(result.schema)) {
    // e.g. a {job: ...} payload while Redash refreshes the schema — never
    // cache that as "zero tables".
    throw new Error("Unexpected schema response from Redash (the schema may still be refreshing — try again shortly)");
  }
  const schema = result.schema.map((table: any) => ({
    ...table,
    columns: (table.columns ?? []).map((c: any) =>
      typeof c === "string" ? { name: c, type: "unknown" } : c
    ),
  }));
  while (schemaCache.size >= SCHEMA_CACHE_MAX_ENTRIES) {
    const oldest = schemaCache.keys().next().value;
    if (oldest === undefined) break;
    schemaCache.delete(oldest);
  }
  schemaCache.set(dataSourceId, { schema, ts: Date.now() });
  return schema;
}
