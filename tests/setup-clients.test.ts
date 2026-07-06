import path from "node:path";
import os from "node:os";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildGeminiMcpAddArgs,
  buildGeminiMcpRemoveArgs,
  buildCodexMcpAddArgs,
  buildCodexMcpRemoveArgs,
  writeJsonConfig,
} from "../src/setup.js";

const entry = {
  command: "/usr/local/bin/npx",
  args: ["-y", "redash-mcp"],
  env: {
    REDASH_URL: "https://redash.example.com",
    REDASH_API_KEY: "secret-key",
  },
};

describe("buildGeminiMcpAddArgs", () => {
  // gemini mcp add는 scope 기본값이 project라 -s user를 명시해야 한다
  it("registers to user scope with env flags before the name", () => {
    expect(buildGeminiMcpAddArgs(entry)).toEqual([
      "mcp",
      "add",
      "-s",
      "user",
      "-e",
      "REDASH_URL=https://redash.example.com",
      "-e",
      "REDASH_API_KEY=secret-key",
      "redash-mcp",
      "/usr/local/bin/npx",
      "-y",
      "redash-mcp",
    ]);
  });
});

describe("buildGeminiMcpRemoveArgs", () => {
  it("removes the user-scope entry", () => {
    expect(buildGeminiMcpRemoveArgs()).toEqual([
      "mcp",
      "remove",
      "-s",
      "user",
      "redash-mcp",
    ]);
  });
});

describe("buildCodexMcpAddArgs", () => {
  // codex는 전역 설정 단일 스코프라 scope 플래그가 없다; 커맨드는 -- 뒤에 온다
  it("registers globally with the command after --", () => {
    expect(buildCodexMcpAddArgs(entry)).toEqual([
      "mcp",
      "add",
      "redash-mcp",
      "--env",
      "REDASH_URL=https://redash.example.com",
      "--env",
      "REDASH_API_KEY=secret-key",
      "--",
      "/usr/local/bin/npx",
      "-y",
      "redash-mcp",
    ]);
  });
});

describe("buildCodexMcpRemoveArgs", () => {
  it("removes the entry", () => {
    expect(buildCodexMcpRemoveArgs()).toEqual(["mcp", "remove", "redash-mcp"]);
  });
});

describe("writeJsonConfig", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "setup-json-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("creates the file and parent dir with the entry", () => {
    const configPath = path.join(tmp, "nested", "mcp.json");
    writeJsonConfig(configPath, entry);
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    expect(config.mcpServers["redash-mcp"]).toEqual(entry);
  });

  it("preserves existing servers and unrelated keys", () => {
    const configPath = path.join(tmp, "mcp.json");
    writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { other: { command: "x" } }, theme: "dark" })
    );
    writeJsonConfig(configPath, entry);
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    expect(config.mcpServers.other).toEqual({ command: "x" });
    expect(config.theme).toBe("dark");
    expect(config.mcpServers["redash-mcp"]).toEqual(entry);
  });

  it("throws on corrupt JSON instead of clobbering it", () => {
    const configPath = path.join(tmp, "mcp.json");
    writeFileSync(configPath, "{not json");
    expect(() => writeJsonConfig(configPath, entry)).toThrow(/Failed to read/);
  });
});
