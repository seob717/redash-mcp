#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as readline from "readline";
import { execSync } from "child_process";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> => new Promise((res) => rl.question(q, res));

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
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
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
  console.log("\n🔧 redash-mcp 설치 마법사\n");

  console.log("설치 대상을 선택하세요:");
  console.log("  1) Claude Desktop");
  console.log("  2) Claude Code (CLI)");
  console.log("  3) 둘 다");
  const target = (await ask("\n선택 (1/2/3) [1]: ")).trim() || "1";

  const redashUrl = (await ask("Redash URL을 입력하세요 (예: https://redash.example.com): ")).trim().replace(/\/$/, "");
  const apiKey = (await ask("Redash API 키를 입력하세요: ")).trim();
  rl.close();

  if (!redashUrl || !apiKey) {
    console.error("\n❌ URL과 API 키를 모두 입력해야 합니다.");
    process.exit(1);
  }

  const npxPath = findNpxPath();

  const mcpEntry = {
    command: npxPath,
    args: ["-y", "redash-mcp"],
    env: {
      REDASH_URL: redashUrl,
      REDASH_API_KEY: apiKey,
    },
  };

  if (target === "1" || target === "3") {
    setupDesktop(mcpEntry);
  }

  if (target === "2" || target === "3") {
    setupClaudeCode(mcpEntry);
  }

  if (!["1", "2", "3"].includes(target)) {
    console.error("\n❌ 잘못된 선택입니다. 1, 2, 3 중 하나를 입력하세요.");
    process.exit(1);
  }
}

function setupDesktop(mcpEntry: any) {
  const configPath = getDesktopConfigPath();
  let config: any = { mcpServers: {} };

  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      config.mcpServers ??= {};
    } catch {
      console.error("\n❌ claude_desktop_config.json 파일을 읽을 수 없습니다.");
      process.exit(1);
    }
  } else {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
  }

  config.mcpServers["redash-mcp"] = mcpEntry;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");

  console.log("\n✅ Claude Desktop 설정 완료!");
  console.log(`   설정 파일: ${configPath}`);
  console.log("   👉 Claude Desktop을 재시작하면 활성화됩니다.");
}

function setupClaudeCode(mcpEntry: any) {
  const configPath = getClaudeCodeConfigPath();
  let config: any = {};

  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {
      console.error("\n❌ Claude Code settings.json 파일을 읽을 수 없습니다.");
      process.exit(1);
    }
  } else {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
  }

  config.mcpServers ??= {};
  config.mcpServers["redash-mcp"] = mcpEntry;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");

  console.log("\n✅ Claude Code (CLI) 설정 완료!");
  console.log(`   설정 파일: ${configPath}`);
  console.log("   👉 새 Claude Code 세션에서 바로 사용할 수 있습니다.");
}

