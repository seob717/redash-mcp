import { describe, it, expect } from "vitest";
import { tokenize } from "../src/bird/tokenize.js";

describe("tokenize", () => {
  it("keeps meaningful tokens and drops stop words from both word lists", () => {
    // "show"/"many" come from the few-shot list, "총" from the schema-pruning list.
    expect(tokenize("show many payments 총 결제")).toEqual(["payments", "결제"]);
  });

  it("strips punctuation and single characters", () => {
    expect(tokenize("users, orders!")).toEqual(["users", "orders"]);
  });
});
