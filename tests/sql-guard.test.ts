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
    expect(r.modifiedQuery).toBe("SELECT id FROM users WHERE id > 0\nLIMIT 100");
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

describe("analyzeQuery (leading comments)", () => {
  it("applies COST checks to a SELECT preceded by a comment", () => {
    process.env.REDASH_AUTO_LIMIT = "1000";
    const r = analyzeQuery("-- monthly report\nSELECT * FROM events");
    expect(r.warnings.some((w) => w.includes("SELECT *"))).toBe(true);
    expect(r.modifiedQuery).toContain("LIMIT 1000");
  });

  it("blocks a SELECT preceded by a comment in strict mode", () => {
    process.env.REDASH_SAFETY_MODE = "strict";
    const r = analyzeQuery("-- monthly report\nSELECT * FROM events");
    expect(r.blocked).toBe(true);
  });
});

describe("injectLimit correctness", () => {
  it("strips a trailing semicolon before appending LIMIT", () => {
    process.env.REDASH_AUTO_LIMIT = "1000";
    const r = analyzeQuery("SELECT id FROM orders;");
    expect(r.modifiedQuery).toMatch(/orders\s*\nLIMIT 1000$/);
    expect(r.modifiedQuery).not.toContain(";");
  });

  it("does not bury the LIMIT inside a trailing line comment", () => {
    process.env.REDASH_AUTO_LIMIT = "1000";
    const r = analyzeQuery("SELECT id FROM orders WHERE id > 0 -- all rows");
    expect(r.modifiedQuery).toMatch(/\nLIMIT 1000$/);
  });

  it("still injects LIMIT when the word LIMIT only appears in a comment", () => {
    process.env.REDASH_AUTO_LIMIT = "1000";
    const r = analyzeQuery("SELECT id FROM orders WHERE id = 1 /* no LIMIT yet */");
    expect(r.modifiedQuery).toContain("LIMIT 1000");
  });
});

describe("string literal handling", () => {
  it("does not flag PII keywords inside string literals", () => {
    const r = analyzeQuery("SELECT id FROM t WHERE channel = 'EMAIL' LIMIT 10");
    expect(r.warnings.some((w) => w.startsWith("[PII]"))).toBe(false);
  });

  it("does not block destructive keywords inside string literals", () => {
    const r = analyzeQuery("SELECT id FROM logs WHERE msg = 'DROP TABLE users' LIMIT 5");
    expect(r.blocked).toBe(false);
  });
});

describe("blocked messages", () => {
  it("every blocked message tells how to disable the check", () => {
    const destructive = [
      "DROP TABLE users",
      "TRUNCATE orders",
      "ALTER TABLE users ADD COLUMN x INT",
      "GRANT SELECT ON users TO bob",
      "DELETE FROM users",
      "UPDATE users SET active = false",
    ];
    for (const sql of destructive) {
      const r = analyzeQuery(sql);
      expect(r.blocked).toBe(true);
      expect(r.message).toContain("REDASH_SAFETY_MODE=off");
    }
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
