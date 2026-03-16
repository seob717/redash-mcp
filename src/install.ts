#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync, spawnSync } from "child_process";
import * as p from "@clack/prompts";

// ─── Detection ───────────────────────────────────────────────────────────────

function isClaudeDesktopInstalled(): boolean {
  const platform = os.platform();
  if (platform === "darwin") {
    return (
      fs.existsSync("/Applications/Claude.app") ||
      fs.existsSync(path.join(os.homedir(), "Applications", "Claude.app"))
    );
  }
  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? "";
    return fs.existsSync(path.join(localAppData, "AnthropicClaude"));
  }
  return false;
}

function hasCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { encoding: "utf8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function hasCommandWin(cmd: string): boolean {
  try {
    execSync(`where ${cmd}`, { encoding: "utf8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ─── Installation ────────────────────────────────────────────────────────────

function installClaudeDesktop(): boolean {
  const platform = os.platform();

  if (platform === "darwin") {
    if (!hasCommand("brew")) {
      p.note("https://claude.ai/download", "Homebrew를 찾을 수 없습니다. 직접 설치해주세요.");
      return false;
    }
    p.log.info("Homebrew로 Claude Desktop 설치 중... (관리자 권한이 필요할 수 있습니다)");
    const result = spawnSync("brew", ["install", "--cask", "claude"], { stdio: "inherit" });
    if (result.status === 0) {
      p.log.success("Claude Desktop 설치 완료");
      return true;
    }
    p.log.error("Claude Desktop 설치 실패");
    return false;
  }

  if (platform === "win32") {
    if (!hasCommandWin("winget")) {
      p.note("https://claude.ai/download", "winget을 찾을 수 없습니다. 직접 설치해주세요.");
      return false;
    }
    p.log.info("winget으로 Claude Desktop 설치 중...");
    const result = spawnSync(
      "winget",
      ["install", "-e", "--id", "Anthropic.Claude",
       "--silent", "--accept-package-agreements", "--accept-source-agreements"],
      { stdio: "inherit" }
    );
    if (result.status === 0) {
      p.log.success("Claude Desktop 설치 완료");
      return true;
    }
    p.log.error("Claude Desktop 설치 실패");
    return false;
  }

  return false;
}

// ─── Config writing ───────────────────────────────────────────────────────────

function findNpxPath(): string {
  try {
    const result = execSync("which npx", { encoding: "utf8", stdio: "pipe" }).trim();
    if (result) return result;
  } catch {}
  for (const c of ["/usr/local/bin/npx", "/opt/homebrew/bin/npx", "/usr/bin/npx"]) {
    if (fs.existsSync(c)) return c;
  }
  return "npx";
}

function getDesktopConfigPath(): string {
  const platform = os.platform();
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (platform === "win32") {
    return path.join(process.env.APPDATA ?? "", "Claude", "claude_desktop_config.json");
  }
  return path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
}

function writeDesktopConfig(mcpEntry: object) {
  const configPath = getDesktopConfigPath();
  let config: any = { mcpServers: {} };
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.mcpServers ??= {};
  } else {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
  }
  config.mcpServers["redash-mcp"] = mcpEntry;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

function writeClaudeCodeConfig(mcpEntry: object) {
  const configPath = path.join(os.homedir(), ".claude", "settings.json");
  let config: any = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } else {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
  }
  config.mcpServers ??= {};
  config.mcpServers["redash-mcp"] = mcpEntry;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function main() {
  p.intro("redash-mcp 설치 마법사");

  const platform = os.platform();
  const isLinux = platform === "linux";

  // ── STEP 1: Claude Desktop ───────────────────────────────────────────────
  if (isLinux) {
    p.log.warn("Linux는 Claude Desktop을 공식 지원하지 않습니다. 이 단계를 건너뜁니다.");
  } else {
    if (isClaudeDesktopInstalled()) {
      p.log.success("Claude Desktop이 이미 설치되어 있습니다.");
    } else {
      p.log.warn("Claude Desktop이 설치되어 있지 않습니다.");

      const shouldInstall = await p.confirm({ message: "Claude Desktop을 자동으로 설치할까요?" });
      if (!p.isCancel(shouldInstall) && shouldInstall) {
        installClaudeDesktop();
      } else {
        p.note("https://claude.ai/download", "나중에 직접 설치해주세요.");
      }
    }
  }

  // ── STEP 2: MCP 설정 ─────────────────────────────────────────────────────
  p.log.step("MCP 서버를 설정합니다.");

  const desktopReady = !isLinux && isClaudeDesktopInstalled();

  const targets = await p.multiselect({
    message: "설치 대상을 선택하세요 (스페이스바로 선택, 엔터로 확인)",
    options: [
      desktopReady
        ? { value: "desktop", label: "Claude Desktop" }
        : { value: "desktop", label: "Claude Desktop", hint: "미설치 상태 - 설치 후 다시 실행하세요" },
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

  const mcpEntry = {
    command: findNpxPath(),
    args: ["-y", "redash-mcp"],
    env: {
      REDASH_URL: (redashUrl as string).replace(/\/$/, ""),
      REDASH_API_KEY: apiKey as string,
    },
  };

  const s = p.spinner();

  if ((targets as string[]).includes("desktop")) {
    if (desktopReady) {
      s.start("Claude Desktop 설정 중...");
      writeDesktopConfig(mcpEntry);
      s.stop("Claude Desktop 설정 완료");
    } else {
      p.log.warn("Claude Desktop이 설치되어 있지 않아 해당 설정을 건너뜁니다.");
    }
  }

  if ((targets as string[]).includes("cli")) {
    s.start("Claude Code (CLI) 설정 중...");
    writeClaudeCodeConfig(mcpEntry);
    s.stop("Claude Code (CLI) 설정 완료");
  }

  p.outro("설치가 완료되었습니다. Claude를 재시작하면 redash-mcp를 사용할 수 있습니다.");
}
