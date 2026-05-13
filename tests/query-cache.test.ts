import { describe, it, expect, beforeEach, vi } from "vitest";

async function freshModule(ttl = "300") {
  process.env.REDASH_MCP_CACHE_TTL = ttl;
  process.env.REDASH_MCP_CACHE_MAX_MB = "50";
  vi.resetModules();
  return await import("../src/query-cache.js");
}

describe("query-cache", () => {
  let mod: typeof import("../src/query-cache.js");

  beforeEach(async () => {
    mod = await freshModule();
  });

  it("returns null on miss", () => {
    expect(mod.getCached(1, "select 1")).toBeNull();
  });

  it("returns stored entry on hit", () => {
    const payload = { rows: [{ a: 1 }], columns: ["a"], warningPrefix: "" };
    mod.setCached(1, "select 1", payload);
    expect(mod.getCached(1, "select 1")).toEqual(payload);
  });

  it("normalizes SQL whitespace and case for key", () => {
    mod.setCached(1, "SELECT id FROM users", { rows: [], columns: [], warningPrefix: "" });
    expect(mod.getCached(1, "select  id  from users")).not.toBeNull();
    expect(mod.getCached(1, "select id from users\n")).not.toBeNull();
  });

  it("keys on data source id", () => {
    mod.setCached(1, "select 1", { rows: [{ a: 1 }], columns: ["a"], warningPrefix: "" });
    expect(mod.getCached(2, "select 1")).toBeNull();
  });

  it("expires entries older than TTL", async () => {
    const m = await freshModule("1");
    m.setCached(1, "select 1", { rows: [], columns: [], warningPrefix: "" });
    await new Promise((r) => setTimeout(r, 1100));
    expect(m.getCached(1, "select 1")).toBeNull();
  });

  it("does not cache when TTL is 0", async () => {
    const m = await freshModule("0");
    m.setCached(1, "select 1", { rows: [], columns: [], warningPrefix: "" });
    expect(m.getCached(1, "select 1")).toBeNull();
  });

  it("reports stats", () => {
    mod.setCached(1, "select 1", { rows: [{ a: 1 }], columns: ["a"], warningPrefix: "" });
    const s = mod.getCacheStats();
    expect(s.entries).toBeGreaterThan(0);
    expect(s.ttlSecs).toBe(300);
  });
});
