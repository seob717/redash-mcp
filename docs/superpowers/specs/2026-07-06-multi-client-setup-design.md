# Multi-Client Setup Support — Design

**Date:** 2026-07-06
**Target version:** 3.2.0 (minor — new feature)
**Status:** Approved

## Goal

`npx redash-mcp setup` registers the server not only for Claude Desktop / Claude Code,
but also for Cursor, Gemini CLI, and Codex CLI. README (en/ko/ja) advertises the
compatibility with badges and per-client install instructions.

ChatGPT (web/desktop) is **out of scope**: it only supports remote HTTP MCP connectors,
which would require an HTTP transport and hosted deployment.

## Design Principle

Use each client's **official CLI command** where one exists; merge the **documented
config file** where one doesn't.

| Target | Method | Idempotency |
|---|---|---|
| Claude Desktop | merge `claude_desktop_config.json` (existing) | JSON key overwrite |
| Claude Code | `claude mcp add --scope user` (existing, 3.1.6/3.1.7) | remove-then-add |
| Cursor | merge `~/.cursor/mcp.json` (same schema as Desktop) | JSON key overwrite |
| Gemini CLI | `gemini mcp add -s user -e K=V redash-mcp <npx> -y redash-mcp` | `gemini mcp remove -s user redash-mcp` first (ignore failure) |
| Codex CLI | `codex mcp add redash-mcp --env K=V -- <npx> -y redash-mcp` | `codex mcp remove redash-mcp` first (ignore failure) |

Notes discovered during design:
- `gemini mcp add` defaults to **project** scope — `-s user` must be explicit.
- Codex has a single global config (`~/.codex/config.toml`), no scope flag.
- All CLI invocations use `execFileSync` (no shell) so API keys with special
  characters pass safely.

## Changes

### 1. `src/setup.ts`

- Multiselect gains three options: Cursor, Gemini CLI, Codex CLI (5 total).
- Generalize `setupDesktop` into a `writeJsonConfig(configPath, mcpEntry)` helper
  shared by Claude Desktop and Cursor (`~/.cursor/mcp.json`).
- New exported pure arg builders (testable without mocks), following the existing
  `buildClaudeMcpAddArgs` pattern:
  - `buildGeminiMcpAddArgs(entry)` / `buildGeminiMcpRemoveArgs()`
  - `buildCodexMcpAddArgs(entry)` / `buildCodexMcpRemoveArgs()`
- CLI-based targets follow the 3.1.7 pattern: remove-then-add, capture stderr,
  failure message includes a copy-pasteable manual command.

**Partial-failure handling (behavior change):** today one failing target crashes the
whole wizard after earlier targets already succeeded. With 5 targets this gets worse,
so each selected target runs in its own try/catch; failures are logged with
`p.log.error` (including the manual fallback command) and the wizard continues.
The outro summarizes configured vs failed targets. Exit code is non-zero if any
selected target failed.

### 2. README (en / ko / ja, kept in sync)

- Static shields badges: Claude · Cursor · Gemini CLI · Codex "Compatible".
- Intro line generalized from "connects Redash to Claude AI" to mention
  Claude, Cursor, Gemini CLI, Codex.
- Install section: setup wizard now lists 5 targets; add a manual-setup snippet per
  client (JSON for Desktop/Cursor, one-line command for Claude Code/Gemini/Codex).

### 3. Metadata / Release

- `package.json` keywords += `cursor`, `gemini-cli`, `codex`.
- `manifest.json` / `server.json` untouched except version sync.
- Version bump to 3.2.0 across the usual 4 files; tag `v3.2.0`; GitHub release with
  rebuilt `.mcpb`; npm publish (user-run, 2FA token).

## Testing & Verification

- Vitest on all new arg builders (extend `tests/setup-claude-code.test.ts` pattern;
  Gemini test pins the explicit `-s user`, Codex test pins `--` before the command).
- E2E on this machine (gemini + codex installed): register → verify listed
  (`gemini mcp list`, `codex mcp list`) → re-run to prove idempotency.
- Cursor: run the wizard path, then inspect `~/.cursor/mcp.json` contents.
- Full suite + typecheck + `npm pack --dry-run` before release.

## Out of Scope

- ChatGPT remote connector (HTTP transport, hosted deployment, auth design).
- Windows path handling beyond what exists today (`~/.cursor/mcp.json` resolves via
  `os.homedir()` on all platforms; Gemini/Codex CLIs own their config locations).
- Auto-detecting installed clients to filter the multiselect.
