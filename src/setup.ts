#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
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

function getClaudeCodeConfigPath(): string {
  return path.join(os.homedir(), ".claude", "settings.json");
}

export async function main() {
  p.intro("redash-mcp setup wizard");

  const targets = await p.multiselect({
    message: "Select installation targets (space to select, enter to confirm)",
    options: [
      { value: "desktop", label: "Claude Desktop" },
      { value: "cli", label: "Claude Code (CLI)" },
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

  const mcpEntry = {
    command: npxPath,
    args: ["-y", "redash-mcp"],
    env: {
      REDASH_URL: url,
      REDASH_API_KEY: apiKey,
    },
  };

  const s = p.spinner();

  if (targets.includes("desktop")) {
    s.start("Configuring Claude Desktop...");
    setupDesktop(mcpEntry);
    s.stop("Claude Desktop configured");
  }

  if (targets.includes("cli")) {
    s.start("Configuring Claude Code (CLI)...");
    setupClaudeCode(mcpEntry);
    s.stop("Claude Code (CLI) configured");
  }

  p.outro("Setup complete. Restart to start using redash-mcp.");
}

function setupDesktop(mcpEntry: any) {
  const configPath = getDesktopConfigPath();
  let config: any = { mcpServers: {} };

  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      config.mcpServers ??= {};
    } catch {
      throw new Error(`Failed to read claude_desktop_config.json: ${configPath}`);
    }
  } else {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
  }

  config.mcpServers["redash-mcp"] = mcpEntry;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

function setupClaudeCode(mcpEntry: any) {
  const configPath = getClaudeCodeConfigPath();
  let config: any = {};

  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {
      throw new Error(`Failed to read Claude Code settings.json: ${configPath}`);
    }
  } else {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
  }

  config.mcpServers ??= {};
  config.mcpServers["redash-mcp"] = mcpEntry;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}
