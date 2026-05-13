import { describe, it, expect } from "vitest";
import { pruneSchema, type SchemaTable } from "../src/bird/schema-pruning.js";

const schema: SchemaTable[] = [
  { name: "users", columns: [{ name: "id", type: "int" }, { name: "email", type: "text" }] },
  { name: "orders", columns: [{ name: "id", type: "int" }, { name: "user_id", type: "int" }] },
  { name: "payments", columns: [{ name: "amount", type: "decimal" }] },
  { name: "events", columns: [{ name: "name", type: "text" }] },
];

describe("pruneSchema", () => {
  it("scores tables whose name contains query tokens highly", () => {
    const r = pruneSchema("how many users signed up last week", schema, [], 3);
    expect(r[0].name).toBe("users");
    expect(r[0].score).toBeGreaterThan(0);
  });

  it("scores tables whose columns match the query", () => {
    const r = pruneSchema("payment amount per user", schema, [], 4);
    const names = r.map((t) => t.name);
    expect(names).toContain("payments");
    expect(names).toContain("users");
  });

  it("returns topK results even with no matches", () => {
    const r = pruneSchema("hello world", schema, [], 2);
    expect(r.length).toBeLessThanOrEqual(2);
  });

  it("boosts tables referenced in few-shot examples", () => {
    const fewShot = [
      {
        id: "ex1",
        question: "x",
        sql: "select * from events",
        tables: ["events"],
        tags: [],
        notes: "",
        source: "manual" as const,
        createdAt: "",
      },
    ];
    const r = pruneSchema("show events", schema, fewShot, 4);
    const events = r.find((t) => t.name === "events");
    expect(events).toBeDefined();
    expect(events!.score).toBeGreaterThanOrEqual(3);
  });

  it("expands tokens via keyword map", () => {
    const r = pruneSchema("revenue last month", schema, [], 2, {
      revenue: ["payment"],
    });
    expect(r[0].name).toBe("payments");
  });

  it("handles Korean query tokens", () => {
    const r = pruneSchema("주문 통계 보여줘", schema, [], 4, {
      주문: ["orders"],
    });
    const top = r[0];
    expect(top.name).toBe("orders");
  });
});
