#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execFileSync, execSync } from "child_process";
import * as p from "@clack/prompts";

function findNpxPath(): string {
  try {
    const result = execSync("which npx", { encoding: "utf8" }).trim();
    if (result) return result;
  } catch {}
  const candidates = [
    "/usr/local/bin/npx",
    "/opt/homebrew/bin/npx",
    "/usr/bin/npx",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "npx";
}

function getDesktopConfigPath(): string {
  const platform = os.platform();
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  } else if (platform === "win32") {
    return path.join(process.env.APPDATA ?? "", "Claude", "claude_desktop_config.json");
  } else {
    return path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
  }
}

export type McpEntry = {
  command: string;
  args: string[];
  env: Record<string, string>;
};

export function buildGeminiMcpAddArgs(mcpEntry: McpEntry): string[] {
  return [
    "mcp",
    "add",
    "-s",
    "user",
    ...Object.entries(mcpEntry.env).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
    "redash-mcp",
    mcpEntry.command,
    ...mcpEntry.args,
  ];
}

export function buildGeminiMcpRemoveArgs(): string[] {
  return ["mcp", "remove", "-s", "user", "redash-mcp"];
}

export function buildCodexMcpAddArgs(mcpEntry: McpEntry): string[] {
  return [
    "mcp",
    "add",
    "redash-mcp",
    ...Object.entries(mcpEntry.env).flatMap(([key, value]) => ["--env", `${key}=${value}`]),
    "--",
    mcpEntry.command,
    ...mcpEntry.args,
  ];
}

export function buildCodexMcpRemoveArgs(): string[] {
  return ["mcp", "remove", "redash-mcp"];
}

export function buildClaudeMcpAddArgs(mcpEntry: McpEntry): string[] {
  return [
    "mcp",
    "add",
    "--scope",
    "user",
    "redash-mcp",
    ...Object.entries(mcpEntry.env).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
    "--",
    mcpEntry.command,
    ...mcpEntry.args,
  ];
}

export async function main() {
  p.intro("redash-mcp setup wizard");

  const targets = await p.multiselect({
    message: "Select installation targets (space to select, enter to confirm)",
    options: [
      { value: "desktop", label: "Claude Desktop" },
      { value: "cli", label: "Claude Code (CLI)" },
      { value: "cursor", label: "Cursor" },
      { value: "gemini", label: "Gemini CLI" },
      { value: "codex", label: "Codex CLI" },
    ],
    required: true,
  });

  if (p.isCancel(targets)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const redashUrl = await p.text({
    message: "Enter your Redash URL",
    placeholder: "https://redash.example.com",
    validate(value: string | undefined) {
      if (!value) return "URL is required.";
      if (!value.startsWith("http://") && !value.startsWith("https://"))
        return "Must start with http:// or https://";
    },
  });

  if (p.isCancel(redashUrl)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const apiKey = await p.text({
    message: "Enter your Redash API key",
    validate(value: string | undefined) {
      if (!value) return "API key is required.";
    },
  });

  if (p.isCancel(apiKey)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const url = redashUrl.replace(/\/$/, "");
  const npxPath = findNpxPath();

  const mcpEntry: McpEntry = {
    command: npxPath,
    args: ["-y", "redash-mcp"],
    env: {
      REDASH_URL: url,
      REDASH_API_KEY: apiKey,
    },
  };

  const registrars: Record<string, { label: string; run: (entry: McpEntry) => void }> = {
    desktop: { label: "Claude Desktop", run: (entry) => writeJsonConfig(getDesktopConfigPath(), entry) },
    cli: {
      label: "Claude Code (CLI)",
      run: (entry) => registerViaCli("claude", buildClaudeMcpRemoveArgs(), buildClaudeMcpAddArgs(entry)),
    },
    cursor: { label: "Cursor", run: (entry) => writeJsonConfig(getCursorConfigPath(), entry) },
    gemini: {
      label: "Gemini CLI",
      run: (entry) => registerViaCli("gemini", buildGeminiMcpRemoveArgs(), buildGeminiMcpAddArgs(entry)),
    },
    codex: {
      label: "Codex CLI",
      run: (entry) => registerViaCli("codex", buildCodexMcpRemoveArgs(), buildCodexMcpAddArgs(entry)),
    },
  };

  const failed: string[] = [];
  for (const target of targets) {
    const { label, run } = registrars[target];
    const s = p.spinner();
    s.start(`Configuring ${label}...`);
    try {
      run(mcpEntry);
      s.stop(`${label} configured`);
    } catch (e: any) {
      s.error(`${label} failed`);
      p.log.error(e?.message ?? String(e));
      failed.push(label);
    }
  }

  if (failed.length > 0) {
    process.exitCode = 1;
    p.outro(`Setup finished with errors — failed: ${failed.join(", ")}`);
  } else {
    p.outro("Setup complete. Restart to start using redash-mcp.");
  }
}

export function writeJsonConfig(configPath: string, mcpEntry: McpEntry) {
  let config: any = { mcpServers: {} };

  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      config.mcpServers ??= {};
    } catch {
      throw new Error(`Failed to read config: ${configPath}`);
    }
  } else {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
  }

  config.mcpServers["redash-mcp"] = mcpEntry;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

function getCursorConfigPath(): string {
  return path.join(os.homedir(), ".cursor", "mcp.json");
}

export function buildClaudeMcpRemoveArgs(): string[] {
  return ["mcp", "remove", "--scope", "user", "redash-mcp"];
}

function registerViaCli(bin: string, removeArgs: string[], addArgs: string[]) {
  // add fails if the server name already exists, so remove any previous entry first
  try {
    execFileSync(bin, removeArgs, { stdio: "pipe" });
  } catch {}

  try {
    execFileSync(bin, addArgs, { stdio: "pipe" });
  } catch (e: any) {
    const stderr = e?.stderr?.toString().trim();
    throw new Error(
      `Failed to run "${bin} mcp add".${stderr ? ` (${stderr})` : ""} Make sure the ${bin} CLI is installed, or run manually:\n  ${bin} ${addArgs.join(" ")}`
    );
  }
}
