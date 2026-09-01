import { describe, it, expect, vi, afterEach } from "vitest";
import { formatQueryResult } from "../src/redash-client.js";

const ORIGINAL_ENV = { ...process.env };

function jsonResponse(body: any, status = 200, statusText = "OK") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => null },
    json: async () => body,
  } as any;
}

async function loadClient(responses: any[]) {
  process.env.REDASH_URL = "https://redash.example.com";
  process.env.REDASH_API_KEY = "key";
  const fetchMock = vi.fn();
  for (const r of responses) fetchMock.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fetchMock);
  vi.resetModules();
  const mod = await import("../src/redash-client.js");
  return { mod, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("pollQueryResult", () => {
  it("throws a cancellation error for a cancelled job instead of polling to timeout", async () => {
    const { mod } = await loadClient([jsonResponse({ job: { status: 5 } })]);
    await expect(mod.pollQueryResult("j1", 5)).rejects.toThrow(/cancel/i);
  });

  it("throws a clear error when the job response has no job payload", async () => {
    const { mod } = await loadClient([jsonResponse(null)]);
    await expect(mod.pollQueryResult("j1", 5)).rejects.toThrow(/job/i);
  });
});

describe("fetchSchema", () => {
  it("throws instead of caching an empty schema when the response is not a schema", async () => {
    const { mod } = await loadClient([jsonResponse({ job: { status: 1 } })]);
    await expect(mod.fetchSchema(5)).rejects.toThrow(/schema/i);
  });

  it("normalizes string columns into objects", async () => {
    const { mod } = await loadClient([jsonResponse({ schema: [{ name: "t", columns: ["a"] }] })]);
    const schema = await mod.fetchSchema(5);
    expect(schema[0].columns).toEqual([{ name: "a", type: "unknown" }]);
  });
});

describe("executeSql", () => {
  it("unwraps an immediate query result", async () => {
    const { mod } = await loadClient([
      jsonResponse({ query_result: { data: { columns: [{ name: "a" }], rows: [{ a: 1 }] } } }),
    ]);
    const result = await mod.executeSql(1, "SELECT 1", { maxAge: 0, timeoutSecs: 5 });
    expect(result).toEqual({ columns: ["a"], rows: [{ a: 1 }] });
  });
});

describe("RedashApiError", () => {
  it("is thrown with the HTTP status for API failures", async () => {
    const { mod } = await loadClient([jsonResponse({}, 404, "Not Found")]);
    try {
      await mod.redashFetch("/queries/999");
      expect.unreachable("should have thrown");
    } catch (e: any) {
      expect(e).toBeInstanceOf(mod.RedashApiError);
      expect(e.status).toBe(404);
    }
  });
});

describe("formatQueryResult", () => {
  it("renders a markdown table with a truncation note", () => {
    const text = formatQueryResult(["a"], [{ a: 1 }, { a: 2 }], 1, "table");
    expect(text).toContain("2 rows | Columns: a");
    expect(text).toContain("Showing 1 of 2 rows");
    expect(text).toContain("| a |");
  });

  it("renders JSON without a truncation note when all rows fit", () => {
    const text = formatQueryResult(["a"], [{ a: 1 }], 10, "json");
    expect(text).not.toContain("Showing");
    expect(text).toContain('"a": 1');
  });
});
