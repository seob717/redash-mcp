import { describe, it, expect } from "vitest";
import { buildClaudeMcpAddArgs } from "../src/setup.js";

describe("buildClaudeMcpAddArgs", () => {
  const entry = {
    command: "/usr/local/bin/npx",
    args: ["-y", "redash-mcp"],
    env: {
      REDASH_URL: "https://redash.example.com",
      REDASH_API_KEY: "secret-key",
    },
  };

  it("registers to user scope via claude mcp add", () => {
    const args = buildClaudeMcpAddArgs(entry);
    expect(args).toEqual([
      "mcp",
      "add",
      "--scope",
      "user",
      "redash-mcp",
      "-e",
      "REDASH_URL=https://redash.example.com",
      "-e",
      "REDASH_API_KEY=secret-key",
      "--",
      "/usr/local/bin/npx",
      "-y",
      "redash-mcp",
    ]);
  });

  // claude mcp add의 -e는 variadic 옵션이라 서버 이름이 -e 뒤에 오면 env 값으로 파싱된다
  it("places the server name before -e flags", () => {
    const args = buildClaudeMcpAddArgs(entry);
    expect(args.indexOf("redash-mcp")).toBeLessThan(args.indexOf("-e"));
  });
});
