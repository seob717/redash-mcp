# Multi-Client Setup Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npx redash-mcp setup` registers the server for Cursor, Gemini CLI, and Codex CLI in addition to Claude Desktop / Claude Code, with per-target failure isolation; README (en/ko/ja) gains compatibility badges and per-client install docs.

**Architecture:** Each client with an official CLI (`claude`, `gemini`, `codex`) is registered via `execFileSync` remove-then-add (idempotent, 3.1.7 pattern); clients without one (Claude Desktop, Cursor) get a documented JSON config merge via a shared `writeJsonConfig` helper. Pure arg-builder functions are exported and unit-tested; the wizard loops over selected targets with try/catch so one failure no longer aborts the rest.

**Tech Stack:** TypeScript (ESM, strict), @clack/prompts, vitest, esbuild bundle.

**Spec:** `docs/superpowers/specs/2026-07-06-multi-client-setup-design.md`

## Global Constraints

- No new runtime dependencies.
- Node >= 20, ESM (`"type": "module"`), imports of local files end in `.js`.
- All CLI invocations use `execFileSync` (never a shell) so API keys pass safely.
- Server name is always `redash-mcp` in every client.
- Verified-on-machine arg orders (do not reorder):
  - gemini: `mcp add -s user -e K=V … <name> <command> <args…>` (env flags before name is safe — verified empirically 2026-07-06)
  - codex: `mcp add <name> --env K=V … -- <command> <args…>`
  - claude: `mcp add --scope user <name> -e K=V … -- <command> <args…>` (name BEFORE `-e`; variadic `-e` swallows the name otherwise)
- Target version: 3.2.0. README changes must be applied to README.md, README.ko.md, README.ja.md.
- Run `npm run typecheck && npx vitest run` before every commit.

---

### Task 1: Gemini CLI arg builders

**Files:**
- Modify: `src/setup.ts`
- Test: `tests/setup-clients.test.ts` (create)

**Interfaces:**
- Produces: `export type McpEntry = { command: string; args: string[]; env: Record<string, string> }`, `export function buildGeminiMcpAddArgs(mcpEntry: McpEntry): string[]`, `export function buildGeminiMcpRemoveArgs(): string[]` — Tasks 2–5 import these from `../src/setup.js` / use them in `src/setup.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/setup-clients.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/setup-clients.test.ts`
Expected: FAIL — `buildGeminiMcpAddArgs` is not exported / not a function.

- [ ] **Step 3: Write minimal implementation**

In `src/setup.ts`, directly above `export function buildClaudeMcpAddArgs`, add:

```typescript
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
```

Also change `buildClaudeMcpAddArgs`'s parameter type from its inline object type to `McpEntry`:

```typescript
export function buildClaudeMcpAddArgs(mcpEntry: McpEntry): string[] {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run typecheck && npx vitest run`
Expected: all tests pass (existing 41 + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/setup.ts tests/setup-clients.test.ts
git commit -m "feat(setup): add Gemini CLI mcp add/remove arg builders"
```

---

### Task 2: Codex CLI arg builders

**Files:**
- Modify: `src/setup.ts`
- Test: `tests/setup-clients.test.ts`

**Interfaces:**
- Consumes: `McpEntry` from Task 1.
- Produces: `export function buildCodexMcpAddArgs(mcpEntry: McpEntry): string[]`, `export function buildCodexMcpRemoveArgs(): string[]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/setup-clients.test.ts` (extend the import at the top to include the two new functions):

```typescript
import {
  buildGeminiMcpAddArgs,
  buildGeminiMcpRemoveArgs,
  buildCodexMcpAddArgs,
  buildCodexMcpRemoveArgs,
} from "../src/setup.js";
```

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/setup-clients.test.ts`
Expected: FAIL — `buildCodexMcpAddArgs` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/setup.ts`, below `buildGeminiMcpRemoveArgs`, add:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run typecheck && npx vitest run`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/setup.ts tests/setup-clients.test.ts
git commit -m "feat(setup): add Codex CLI mcp add/remove arg builders"
```

---

### Task 3: Shared JSON config helper (Claude Desktop + Cursor)

**Files:**
- Modify: `src/setup.ts`
- Test: `tests/setup-clients.test.ts`

**Interfaces:**
- Consumes: `McpEntry` from Task 1.
- Produces: `export function writeJsonConfig(configPath: string, mcpEntry: McpEntry): void`, `function getCursorConfigPath(): string` (module-private, returns `~/.cursor/mcp.json`). Task 4 wires both.

- [ ] **Step 1: Write the failing test**

Append to `tests/setup-clients.test.ts` (add the node imports at the top of the file):

```typescript
import path from "node:path";
import os from "node:os";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { beforeEach, afterEach } from "vitest";
```

Extend the `../src/setup.js` import with `writeJsonConfig`, then append:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/setup-clients.test.ts`
Expected: FAIL — `writeJsonConfig` is not exported.

- [ ] **Step 3: Implement by generalizing setupDesktop**

In `src/setup.ts`, REPLACE the whole `function setupDesktop(mcpEntry: any) { … }` with:

```typescript
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
```

Next to `getDesktopConfigPath`, add:

```typescript
function getCursorConfigPath(): string {
  return path.join(os.homedir(), ".cursor", "mcp.json");
}
```

In `main()`, replace the call `setupDesktop(mcpEntry);` with `writeJsonConfig(getDesktopConfigPath(), mcpEntry);` (Task 4 restructures this block anyway; the goal here is just to keep the wizard compiling with `setupDesktop` gone).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run typecheck && npx vitest run`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/setup.ts tests/setup-clients.test.ts
git commit -m "refactor(setup): generalize desktop JSON merge into writeJsonConfig for Cursor reuse"
```

---

### Task 4: Wizard wiring — 5 targets with per-target failure isolation

**Files:**
- Modify: `src/setup.ts`

**Interfaces:**
- Consumes: everything produced by Tasks 1–3, plus existing `buildClaudeMcpAddArgs` / `buildClaudeMcpRemoveArgs` / `getDesktopConfigPath` / `findNpxPath`.
- Produces: `registerViaCli(bin: string, removeArgs: string[], addArgs: string[]): void` (module-private); reworked `main()`. No test file changes (interactive glue — covered by typecheck, existing suite, and Task 5 e2e).

- [ ] **Step 1: Replace setupClaudeCode with a generic registerViaCli**

In `src/setup.ts`, REPLACE the whole `function setupClaudeCode(mcpEntry: any) { … }` with:

```typescript
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
```

- [ ] **Step 2: Rework main() target selection and execution**

In `main()`, replace the `p.multiselect` options array with:

```typescript
    options: [
      { value: "desktop", label: "Claude Desktop" },
      { value: "cli", label: "Claude Code (CLI)" },
      { value: "cursor", label: "Cursor" },
      { value: "gemini", label: "Gemini CLI" },
      { value: "codex", label: "Codex CLI" },
    ],
```

Replace everything in `main()` from `const s = p.spinner();` down to (and including) the `p.outro(…)` line with:

```typescript
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
      s.stop(`${label} failed`, 1);
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
```

Type the `mcpEntry` literal as `McpEntry` (`const mcpEntry: McpEntry = { … }`).

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: clean typecheck, all tests pass, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/setup.ts
git commit -m "feat(setup): register Cursor, Gemini CLI, and Codex CLI targets with per-target failure isolation"
```

---

### Task 5: E2E verification on this machine

**Files:** none (verification only). gemini and codex CLIs are installed at `/usr/local/bin`; real env values live in `~/.claude.json` under `mcpServers["redash-mcp"].env`.

- [ ] **Step 1: Run the real registration flow twice (idempotency)**

```bash
npx tsx -e "
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { buildGeminiMcpAddArgs, buildGeminiMcpRemoveArgs, buildCodexMcpAddArgs, buildCodexMcpRemoveArgs, writeJsonConfig } from './src/setup.ts';

const claudeCfg = JSON.parse(readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8'));
const src = claudeCfg.mcpServers['redash-mcp'];
const entry = { command: src.command, args: src.args, env: src.env };

for (const round of [1, 2]) {
  try { execFileSync('gemini', buildGeminiMcpRemoveArgs(), { stdio: 'pipe' }); } catch {}
  execFileSync('gemini', buildGeminiMcpAddArgs(entry), { stdio: 'pipe' });
  try { execFileSync('codex', buildCodexMcpRemoveArgs(), { stdio: 'pipe' }); } catch {}
  execFileSync('codex', buildCodexMcpAddArgs(entry), { stdio: 'pipe' });
  writeJsonConfig(path.join(os.homedir(), '.cursor', 'mcp.json'), entry);
  console.log('round', round, 'OK');
}
"
```

Expected: `round 1 OK` and `round 2 OK` (round 2 proves remove-then-add idempotency).

- [ ] **Step 2: Verify each client sees the server**

```bash
gemini mcp list 2>/dev/null | grep redash-mcp
codex mcp list | grep redash-mcp
python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.cursor/mcp.json')))['mcpServers']['redash-mcp']['command'])"
```

Expected: gemini lists `redash-mcp: /usr/local/bin/npx -y redash-mcp (stdio)`; codex lists a `redash-mcp` row with both env keys; python prints `/usr/local/bin/npx`. (gemini may show "Disconnected" in sandboxed list checks — the entry existing with correct command/env is the pass criterion; connectivity was already proven via Claude Code.)

- [ ] **Step 3: No commit** — nothing changed in the repo. If any step failed, stop and fix the corresponding task before proceeding.

---

### Task 6: README (en/ko/ja) badges + per-client install docs + keywords

**Files:**
- Modify: `README.md`, `README.ko.md`, `README.ja.md`, `package.json`

- [ ] **Step 1: Badges (all three READMEs)**

Directly after the Glama badge line (line 7 in each file), insert:

```markdown
[![Claude](https://img.shields.io/badge/Claude-Compatible-D97757?logo=claude&logoColor=white)](https://github.com/seob717/redash-mcp#installation)
[![Cursor](https://img.shields.io/badge/Cursor-Compatible-111111)](https://github.com/seob717/redash-mcp#installation)
[![Gemini CLI](https://img.shields.io/badge/Gemini_CLI-Compatible-4285F4?logo=googlegemini&logoColor=white)](https://github.com/seob717/redash-mcp#installation)
[![Codex CLI](https://img.shields.io/badge/Codex_CLI-Compatible-412991?logo=openai&logoColor=white)](https://github.com/seob717/redash-mcp#installation)
```

- [ ] **Step 2: Generalize the intro line**

`README.md` — replace the `> MCP server that connects…` line with:

```markdown
> MCP server that connects [Redash](https://redash.io) to Claude, Cursor, Gemini CLI, Codex, and any MCP client — query data, manage dashboards, and run SQL with natural language.
```

`README.ko.md` — replace the equivalent `>` intro line with:

```markdown
> [Redash](https://redash.io)를 Claude, Cursor, Gemini CLI, Codex 등 모든 MCP 클라이언트에 연결하는 MCP 서버 — 자연어로 데이터를 조회하고, 대시보드를 관리하고, SQL을 실행합니다.
```

`README.ja.md` — replace the equivalent `>` intro line with:

```markdown
> [Redash](https://redash.io)を Claude・Cursor・Gemini CLI・Codex などあらゆる MCP クライアントに接続する MCP サーバー — 自然言語でデータを照会し、ダッシュボードを管理し、SQL を実行します。
```

- [ ] **Step 3: Update the "One-command setup" bullet and Auto Setup paragraph (each language, matching its existing tone)**

In `README.md` "Why redash-mcp?" replace the One-command setup bullet with:

```markdown
- **⚡ One-command setup** — `npx redash-mcp setup` configures Claude Desktop / Claude Code / Cursor / Gemini CLI / Codex CLI for you. No hand-editing JSON.
```

In `README.md` Installation → Auto Setup, replace "The setup wizard will guide you through configuring Claude Desktop, Claude Code (CLI), or both." with:

```markdown
The setup wizard will guide you through configuring Claude Desktop, Claude Code (CLI), Cursor, Gemini CLI, and Codex CLI — pick any combination.
```

Apply the same two edits to `README.ko.md` / `README.ja.md` on the corresponding lines (same section positions; translate: ko "설정 마법사가 Claude Desktop, Claude Code (CLI), Cursor, Gemini CLI, Codex CLI 중 원하는 조합을 골라 설정해줍니다."; ja "セットアップウィザードが Claude Desktop・Claude Code (CLI)・Cursor・Gemini CLI・Codex CLI を任意の組み合わせで設定します。").

- [ ] **Step 4: Fix stale manual section 2-B and add 2-C/2-D/2-E (each language)**

In `README.md` Manual Setup, REPLACE the whole `#### 2-B. Claude Code (CLI)` block (which still shows the obsolete `~/.claude/settings.json` method — the bug fixed in 3.1.6) with:

````markdown
#### 2-B. Claude Code (CLI)

```bash
claude mcp add --scope user redash-mcp \
  -e REDASH_URL=https://your-redash-instance.com \
  -e REDASH_API_KEY=your_api_key_here \
  -- npx -y redash-mcp
```

#### 2-C. Cursor

Open `~/.cursor/mcp.json` (create it if missing) and add:

```json
{
  "mcpServers": {
    "redash-mcp": {
      "command": "npx",
      "args": ["-y", "redash-mcp"],
      "env": {
        "REDASH_URL": "https://your-redash-instance.com",
        "REDASH_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

#### 2-D. Gemini CLI

```bash
gemini mcp add -s user \
  -e REDASH_URL=https://your-redash-instance.com \
  -e REDASH_API_KEY=your_api_key_here \
  redash-mcp npx -y redash-mcp
```

#### 2-E. Codex CLI

```bash
codex mcp add redash-mcp \
  --env REDASH_URL=https://your-redash-instance.com \
  --env REDASH_API_KEY=your_api_key_here \
  -- npx -y redash-mcp
```
````

Apply the same replacement in `README.ko.md` / `README.ja.md` at their `#### 2-B` blocks. Code blocks are identical; the only prose line translates as — ko: `` `~/.cursor/mcp.json` 파일을 열고(없으면 생성) 다음을 추가합니다: ``; ja: `` `~/.cursor/mcp.json` を開き（なければ作成）、以下を追加します: ``.

- [ ] **Step 5: package.json keywords**

In `package.json`, extend keywords:

```json
  "keywords": [
    "mcp",
    "redash",
    "sql",
    "bi",
    "dashboard",
    "model-context-protocol",
    "claude",
    "cursor",
    "gemini-cli",
    "codex"
  ],
```

- [ ] **Step 6: Verify and commit**

Run: `npm run typecheck && npx vitest run`
Visually check one README render: `grep -n "2-B\|2-C\|2-D\|2-E\|Compatible" README.md | head -20`

```bash
git add README.md README.ko.md README.ja.md package.json
git commit -m "docs: multi-client badges and install docs (Cursor, Gemini CLI, Codex CLI); fix stale Claude Code manual setup"
```

---

### Task 7: Release 3.2.0

**Files:**
- Modify: `package.json`, `package-lock.json`, `manifest.json`, `server.json`

- [ ] **Step 1: Bump versions**

```bash
npm version 3.2.0 --no-git-tag-version
sed -i '' 's/"version": "3.1.7"/"version": "3.2.0"/g' manifest.json server.json
grep -n '"version"' package.json manifest.json server.json
```

Expected: all four occurrences read 3.2.0.

- [ ] **Step 2: Build, test, pack-check**

```bash
npm run build && npx vitest run && npm pack --dry-run 2>&1 | tail -6
```

Expected: tests pass; tarball says version 3.2.0.

- [ ] **Step 3: Commit, tag, push**

```bash
git add package.json package-lock.json manifest.json server.json
git commit -m "chore(v3.2.0): bump version for multi-client setup support"
git tag v3.2.0
git pull --rebase && git push && git push origin v3.2.0
```

- [ ] **Step 4: npm publish (USER-GATED)**

The user publishes with their 2FA token: `npm publish`. Verify afterwards:

```bash
npm view redash-mcp version
```

Expected: `3.2.0`.

- [ ] **Step 5: GitHub release (ASK USER FIRST)**

After explicit user confirmation, rebuild the mcpb and publish the release:

```bash
npx -y @anthropic-ai/mcpb pack
gh release create v3.2.0 redash-mcp.mcpb --repo seob717/redash-mcp \
  --title "v3.2.0 - Multi-Client Setup (Cursor, Gemini CLI, Codex CLI)" \
  --notes "setup wizard now registers redash-mcp for Cursor, Gemini CLI, and Codex CLI in addition to Claude Desktop / Claude Code; per-target failure isolation; README badges and per-client install docs. Full Changelog: https://github.com/seob717/redash-mcp/compare/v3.1.7...v3.2.0"
```
