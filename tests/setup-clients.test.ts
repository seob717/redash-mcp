import { describe, it, expect } from "vitest";
import {
  buildGeminiMcpAddArgs,
  buildGeminiMcpRemoveArgs,
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
