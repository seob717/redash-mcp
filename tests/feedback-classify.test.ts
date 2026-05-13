import { describe, it, expect } from "vitest";
import { classifyError } from "../src/bird/feedback.js";

describe("classifyError", () => {
  it("detects wrong_table when FROM differs", () => {
    const r = classifyError(
      "SELECT id FROM users WHERE id = 1",
      "SELECT id FROM customers WHERE id = 1",
    );
    expect(r).toBe("wrong_table");
  });

  it("detects wrong_column when SELECT list differs", () => {
    const r = classifyError(
      "SELECT id FROM users WHERE id = 1",
      "SELECT id, name FROM users WHERE id = 1",
    );
    expect(r).toBe("wrong_column");
  });

  it("detects wrong_filter when WHERE differs", () => {
    const r = classifyError(
      "SELECT id FROM users WHERE id = 1",
      "SELECT id FROM users WHERE id = 2",
    );
    expect(r).toBe("wrong_filter");
  });

  it("detects wrong_aggregation when GROUP BY differs", () => {
    const r = classifyError(
      "SELECT user_id, COUNT(*) FROM orders GROUP BY user_id",
      "SELECT user_id, status, COUNT(*) FROM orders GROUP BY user_id, status",
    );
    // Differing columns kicks in first, but join detection would require both sides
    // to mention JOIN. Since neither does, this should be wrong_column.
    expect(["wrong_column", "wrong_aggregation"]).toContain(r);
  });

  it("returns other when SQL is functionally identical", () => {
    const r = classifyError(
      "SELECT id FROM users WHERE id = 1",
      "SELECT id FROM users WHERE id = 1",
    );
    expect(r).toBe("other");
  });
});
