import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { getDataSourcePath } from "../src/bird/config.js";

describe("getDataSourcePath", () => {
  let tmp: string;
  let prevDir: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "bird-config-"));
    prevDir = process.env.REDASH_MCP_CONFIG_DIR;
    process.env.REDASH_MCP_CONFIG_DIR = tmp;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    if (prevDir === undefined) delete process.env.REDASH_MCP_CONFIG_DIR;
    else process.env.REDASH_MCP_CONFIG_DIR = prevDir;
  });

  it("returns a path inside the config dir for valid input", () => {
    const p = getDataSourcePath("few-shot", 42);
    expect(p).toBe(path.join(tmp, "few-shot", "42.json"));
  });

  it("rejects an unknown subdir", () => {
    expect(() => getDataSourcePath("../etc" as any, 1)).toThrow(/Invalid config subdir/);
    expect(() => getDataSourcePath("arbitrary" as any, 1)).toThrow(/Invalid config subdir/);
  });

  it("rejects non-integer or negative dataSourceId", () => {
    expect(() => getDataSourcePath("few-shot", -1)).toThrow(/Invalid dataSourceId/);
    expect(() => getDataSourcePath("few-shot", 1.5)).toThrow(/Invalid dataSourceId/);
    expect(() => getDataSourcePath("few-shot", Number.NaN)).toThrow(/Invalid dataSourceId/);
    expect(() => getDataSourcePath("few-shot", Number.POSITIVE_INFINITY)).toThrow(/Invalid dataSourceId/);
  });

  it("rejects string ids that would traverse out of the config dir", () => {
    expect(() => getDataSourcePath("few-shot", "../../etc/passwd" as unknown as number)).toThrow();
  });
});
