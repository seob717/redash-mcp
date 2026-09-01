import { describe, it, expect } from "vitest";
import { detectVagueness } from "../src/bird/smart-query.js";

const tables = (scores: number[]) =>
  scores.map((score, i) => ({ name: `table_${i}`, score }));

describe("detectVagueness", () => {
  const question = "show me all completed payments with refunds";

  it("does not ask about tables when scoring was not performed", () => {
    expect(detectVagueness(question, tables([0, 0, 0, 0, 0]), false)).toEqual([]);
  });

  it("asks about tables when scoring ran and nothing matched", () => {
    const r = detectVagueness(question, tables([0, 0]), true);
    expect(r.some((c) => c.includes("tables"))).toBe(true);
  });

  it("asks for disambiguation when more than 3 tables tie at the top score", () => {
    const r = detectVagueness(question, tables([2, 2, 2, 2, 1]), true);
    expect(r.some((c) => c.includes("Multiple tables"))).toBe(true);
  });

  it("does not ask for disambiguation when scores are ranked", () => {
    expect(detectVagueness(question, tables([5, 4, 3, 2, 1]), true)).toEqual([]);
  });
});
