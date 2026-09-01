import { describe, it, expect } from "vitest";
import { stripSqlComments, normalizeForAnalysis, normalizeCacheKey } from "../src/sql-text.js";

describe("stripSqlComments", () => {
  it("removes line and block comments", () => {
    expect(stripSqlComments("SELECT 1 -- note").trim()).toBe("SELECT 1");
    expect(stripSqlComments("SELECT /* x */ 1").replace(/\s+/g, " ").trim()).toBe("SELECT 1");
  });

  it("preserves comment markers inside string literals", () => {
    expect(stripSqlComments("SELECT 'a--b'")).toBe("SELECT 'a--b'");
    expect(stripSqlComments("SELECT 'a/*b*/c'")).toBe("SELECT 'a/*b*/c'");
  });

  it("handles escaped quotes inside literals", () => {
    expect(stripSqlComments("SELECT 'it''s -- fine' -- note").trim()).toBe("SELECT 'it''s -- fine'");
  });
});

describe("normalizeForAnalysis", () => {
  it("uppercases and collapses whitespace", () => {
    expect(normalizeForAnalysis("select  id\nfrom users")).toBe("SELECT ID FROM USERS");
  });

  it("blanks string literal contents so they cannot match keywords", () => {
    expect(normalizeForAnalysis("SELECT id FROM t WHERE s = 'DROP TABLE x'")).not.toContain("DROP TABLE X");
  });
});

describe("normalizeCacheKey", () => {
  it("lowercases and collapses whitespace outside literals", () => {
    expect(normalizeCacheKey("SELECT  id  FROM users")).toBe(normalizeCacheKey("select id from users"));
  });

  it("preserves literal content verbatim", () => {
    expect(normalizeCacheKey("select * from t where c = 'A--1'")).not.toBe(
      normalizeCacheKey("select * from t where c = 'A--2'"),
    );
    expect(normalizeCacheKey("select * from t where s = 'Paid'")).not.toBe(
      normalizeCacheKey("select * from t where s = 'paid'"),
    );
  });

  it("still ignores comments outside literals", () => {
    expect(normalizeCacheKey("SELECT 1 -- note")).toBe(normalizeCacheKey("select 1"));
  });
});
