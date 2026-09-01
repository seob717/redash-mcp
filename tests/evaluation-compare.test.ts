import { describe, it, expect } from "vitest";
import { compareResults, formatEvalResults } from "../src/bird/evaluation.js";

describe("compareResults", () => {
  it("treats a different SELECT column order as a match", () => {
    const gt = { columns: ["id", "name"], rows: [{ id: 1, name: "alice" }] };
    const gen = { columns: ["name", "id"], rows: [{ id: 1, name: "alice" }] };
    expect(compareResults(gt, gen).isMatch).toBe(true);
  });

  it("reports mismatched data", () => {
    const gt = { columns: ["id"], rows: [{ id: 1 }] };
    const gen = { columns: ["id"], rows: [{ id: 2 }] };
    expect(compareResults(gt, gen).isMatch).toBe(false);
  });

  it("reports mismatched column sets", () => {
    const gt = { columns: ["id"], rows: [] };
    const gen = { columns: ["name"], rows: [] };
    const r = compareResults(gt, gen);
    expect(r.isMatch).toBe(false);
    expect(r.details).toContain("Column mismatch");
  });
});

describe("formatEvalResults", () => {
  it("renders N/A for difficulty buckets with no test cases", () => {
    const run = {
      runId: "r1",
      timestamp: "2026-01-01",
      results: [{ testCaseId: "tc1", generatedSql: "SELECT 1", match: true }],
      accuracy: { overall: 1, simple: 1, medium: null, complex: null },
    };
    const text = formatEvalResults(run as any);
    expect(text).toContain("Simple: 100.0%");
    expect(text).toMatch(/Medium: N\/A/);
  });
});
