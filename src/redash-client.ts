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
    throw new Error(`Redash API error: ${res.status} ${res.statusText}${hint}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null;
  }
  return res.json();
}

export async function pollQueryResult(jobId: string, timeoutSecs = 30): Promise<any> {
  const deadline = Date.now() + timeoutSecs * 1000;
  let delayMs = 250;
  while (Date.now() < deadline) {
    const job = await redashFetch(`/jobs/${jobId}`);
    if (job.job.status === 3) {
      return await redashFetch(`/query_results/${job.job.query_result_id}`);
    }
    if (job.job.status === 4) {
      throw new Error(`Query failed: ${job.job.error}`);
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(delayMs, remaining)));
    delayMs = Math.min(delayMs * 2, 2000);
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
  const schema = (result.schema ?? []).map((table: any) => ({
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
