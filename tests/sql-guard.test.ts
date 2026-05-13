import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { analyzeQuery } from "../src/sql-guard.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.REDASH_SAFETY_MODE;
  delete process.env.REDASH_SAFETY_DISABLE_PII;
  delete process.env.REDASH_SAFETY_DISABLE_COST;
  delete process.env.REDASH_AUTO_LIMIT;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("analyzeQuery (warn mode, default)", () => {
  it("blocks DROP TABLE", () => {
    const r = analyzeQuery("DROP TABLE users");
    expect(r.blocked).toBe(true);
    expect(r.message).toContain("DROP");
  });

  it("blocks TRUNCATE", () => {
    const r = analyzeQuery("TRUNCATE orders");
    expect(r.blocked).toBe(true);
  });

  it("blocks ALTER TABLE", () => {
    const r = analyzeQuery("ALTER TABLE users ADD COLUMN x INT");
    expect(r.blocked).toBe(true);
  });

  it("blocks GRANT/REVOKE", () => {
    expect(analyzeQuery("GRANT SELECT ON users TO bob").blocked).toBe(true);
    expect(analyzeQuery("REVOKE SELECT ON users FROM bob").blocked).toBe(true);
  });

  it("blocks DELETE without WHERE", () => {
    const r = analyzeQuery("DELETE FROM users");
    expect(r.blocked).toBe(true);
    expect(r.message).toContain("WHERE");
  });

  it("blocks UPDATE without WHERE", () => {
    const r = analyzeQuery("UPDATE users SET active = false");
    expect(r.blocked).toBe(true);
  });

  it("warns but does not block DELETE with WHERE", () => {
    const r = analyzeQuery("DELETE FROM users WHERE id = 1");
    expect(r.blocked).toBe(false);
    expect(r.warnings.some((w) => w.includes("DESTRUCTIVE"))).toBe(true);
  });

  it("ignores keywords inside comments", () => {
    const r = analyzeQuery("-- DROP TABLE users\nSELECT 1");
    expect(r.blocked).toBe(false);
  });

  it("warns on SELECT *", () => {
    const r = analyzeQuery("SELECT * FROM users WHERE id = 1 LIMIT 10");
    expect(r.warnings.some((w) => w.includes("SELECT *"))).toBe(true);
  });

  it("warns when WHERE/LIMIT missing on SELECT", () => {
    const r = analyzeQuery("SELECT id FROM users");
    expect(r.warnings.some((w) => w.includes("WHERE"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("LIMIT"))).toBe(true);
  });

  it("auto-injects LIMIT when REDASH_AUTO_LIMIT is set", () => {
    process.env.REDASH_AUTO_LIMIT = "100";
    const r = analyzeQuery("SELECT id FROM users WHERE id > 0");
    expect(r.modifiedQuery).toBe("SELECT id FROM users WHERE id > 0 LIMIT 100");
  });

  it("does not inject LIMIT when one already exists", () => {
    process.env.REDASH_AUTO_LIMIT = "100";
    const r = analyzeQuery("SELECT id FROM users LIMIT 5");
    expect(r.modifiedQuery).toBeUndefined();
  });

  it("flags PII column names", () => {
    const r = analyzeQuery("SELECT email FROM users WHERE id = 1");
    expect(r.warnings.some((w) => w.startsWith("[PII]"))).toBe(true);
  });
});

describe("analyzeQuery (off mode)", () => {
  it("returns empty result", () => {
    process.env.REDASH_SAFETY_MODE = "off";
    const r = analyzeQuery("DROP TABLE users");
    expect(r.blocked).toBe(false);
    expect(r.warnings).toEqual([]);
  });
});

describe("analyzeQuery (strict mode)", () => {
  it("blocks SELECT * without WHERE/LIMIT", () => {
    process.env.REDASH_SAFETY_MODE = "strict";
    const r = analyzeQuery("SELECT * FROM users");
    expect(r.blocked).toBe(true);
  });

  it("blocks PII access", () => {
    process.env.REDASH_SAFETY_MODE = "strict";
    const r = analyzeQuery("SELECT email FROM users WHERE id = 1 LIMIT 10");
    expect(r.blocked).toBe(true);
  });
});
