import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { recordFeedback } from "../src/bird/feedback.js";
import { loadExamples } from "../src/bird/few-shot.js";

describe("recordFeedback auto-promotion", () => {
  let tmp: string;
  let prevDir: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "bird-feedback-"));
    prevDir = process.env.REDASH_MCP_CONFIG_DIR;
    process.env.REDASH_MCP_CONFIG_DIR = tmp;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    if (prevDir === undefined) delete process.env.REDASH_MCP_CONFIG_DIR;
    else process.env.REDASH_MCP_CONFIG_DIR = prevDir;
  });

  const downFeedback = {
    question: "count users",
    generatedSql: "SELECT id FROM users",
    correctSql: "SELECT id FROM customers",
    rating: "down" as const,
  };

  it("promotes once when the threshold is reached and resets the counter", async () => {
    await recordFeedback(1, downFeedback);
    await recordFeedback(1, downFeedback);
    const third = await recordFeedback(1, downFeedback);
    expect(third.promotedToFewShot).toBe(true);
    expect((await loadExamples(1)).length).toBe(1);

    const fourth = await recordFeedback(1, downFeedback);
    expect(fourth.promotedToFewShot).toBe(false);
    expect((await loadExamples(1)).length).toBe(1);
  });
});
