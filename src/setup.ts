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
  p.intro("redash-mcp 설치 마법사");

  const targets = await p.multiselect({
    message: "설치 대상을 선택하세요 (스페이스바로 선택, 엔터로 확인)",
    options: [
      { value: "desktop", label: "Claude Desktop" },
      { value: "cli", label: "Claude Code (CLI)" },
    ],
    required: true,
  });

  if (p.isCancel(targets)) {
    p.cancel("설치가 취소되었습니다.");
    process.exit(0);
  }

  const redashUrl = await p.text({
    message: "Redash URL을 입력하세요",
    placeholder: "https://redash.example.com",
    validate(value) {
      if (!value) return "URL을 입력해주세요.";
      if (!value.startsWith("http://") && !value.startsWith("https://"))
        return "http:// 또는 https://로 시작해야 합니다.";
    },
  });

  if (p.isCancel(redashUrl)) {
    p.cancel("설치가 취소되었습니다.");
    process.exit(0);
  }

  const apiKey = await p.text({
    message: "Redash API 키를 입력하세요",
    validate(value) {
      if (!value) return "API 키를 입력해주세요.";
    },
  });

  if (p.isCancel(apiKey)) {
    p.cancel("설치가 취소되었습니다.");
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
    s.start("Claude Desktop 설정 중...");
    setupDesktop(mcpEntry);
    s.stop("Claude Desktop 설정 완료");
  }

  if (targets.includes("cli")) {
    s.start("Claude Code (CLI) 설정 중...");
    setupClaudeCode(mcpEntry);
    s.stop("Claude Code (CLI) 설정 완료");
  }

  p.outro("설치가 완료되었습니다. 재시작 후 사용할 수 있습니다.");
}

function setupDesktop(mcpEntry: any) {
  const configPath = getDesktopConfigPath();
  let config: any = { mcpServers: {} };

  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      config.mcpServers ??= {};
    } catch {
      throw new Error(`claude_desktop_config.json 파일을 읽을 수 없습니다: ${configPath}`);
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
      throw new Error(`Claude Code settings.json 파일을 읽을 수 없습니다: ${configPath}`);
    }
  } else {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
  }

  config.mcpServers ??= {};
  config.mcpServers["redash-mcp"] = mcpEntry;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}
