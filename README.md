# redash-mcp

[![npm version](https://img.shields.io/npm/v/redash-mcp.svg)](https://www.npmjs.com/package/redash-mcp)
[![Downloads](https://img.shields.io/npm/dm/redash-mcp.svg)](https://www.npmjs.com/package/redash-mcp)
[![Node](https://img.shields.io/node/v/redash-mcp.svg)](https://nodejs.org)
[![Glama](https://glama.ai/mcp/servers/seob717/redash-mcp/badges/score.svg)](https://glama.ai/mcp/servers/seob717/redash-mcp)
[![Claude](https://img.shields.io/badge/Claude-Compatible-D97757?logo=claude&logoColor=white)](https://github.com/seob717/redash-mcp#installation)
[![Cursor](https://img.shields.io/badge/Cursor-Compatible-111111)](https://github.com/seob717/redash-mcp#installation)
[![Gemini CLI](https://img.shields.io/badge/Gemini_CLI-Compatible-4285F4?logo=googlegemini&logoColor=white)](https://github.com/seob717/redash-mcp#installation)
[![Codex CLI](https://img.shields.io/badge/Codex_CLI-Compatible-412991?logo=openai&logoColor=white)](https://github.com/seob717/redash-mcp#installation)

English | [한국어](README.ko.md) | [日本語](README.ja.md)

> MCP server that connects [Redash](https://redash.io) to Claude, Cursor, Gemini CLI, Codex, and any MCP client — query data, build charts and dashboards, and run SQL with natural language.

[Install](#installation) · [Tools](#tools) · [Env](#environment-variables) · [Examples](#usage-examples) · [Troubleshooting](#troubleshooting) · [Privacy](#privacy-policy)

## What's new in 3.5

- **`create_visualization`** — create line / column / area / pie / scatter charts or counters on a saved query. If the query has been run, column names are checked against its latest result, so a typo returns an error instead of an empty chart.
- **Dashboard auto-layout** — `add_widget` places new widgets below existing ones; half-width widgets pair up side by side (previously they all overlapped at the top-left).

Full history: [Releases](https://github.com/seob717/redash-mcp/releases)

## Why redash-mcp?

Built for letting an LLM touch **production** data safely:

- **🛡️ SQL Safety Guard** — blocks `DROP`/`TRUNCATE`/`ALTER` and `DELETE`/`UPDATE` without `WHERE`; `strict`/`warn`/`off` modes, PII detection, and auto-`LIMIT`.
- **🧠 BIRD Smart Query** — analyzes the question, auto-selects tables, and guides SQL generation ([BIRD text-to-SQL](https://bird-bench.github.io/)). Optional Claude Haiku fallback.
- **📊 End-to-end** — query, save, chart, dashboards, and alerts — 25 tools.
- **⚡ One-command setup** — `npx redash-mcp setup` configures Claude Desktop / Claude Code / Cursor / Gemini CLI / Codex CLI.
- **🔒 Fully local** — talks directly to your Redash. API key and results never leave your machine.

## Installation

**Requirements:** Node.js 20+ and a Redash API key (Redash → Profile → **Edit Profile** → **API Key**).

```bash
npx redash-mcp setup
```

The wizard configures any combination of Claude Desktop, Claude Code, Cursor, Gemini CLI, and Codex CLI.

Alternatively, install Node.js, Claude Desktop, and the MCP config in one go:

```bash
curl -fsSL https://raw.githubusercontent.com/seob717/redash-mcp/main/install.sh | bash
```

<details>
<summary><b>Manual setup</b></summary>

- **Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Cursor** — `~/.cursor/mcp.json` (create it if missing)

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

Fully quit and restart Claude Desktop after saving.

**Claude Code**

```bash
claude mcp add --scope user redash-mcp \
  -e REDASH_URL=https://your-redash-instance.com \
  -e REDASH_API_KEY=your_api_key_here \
  -- npx -y redash-mcp
```

**Gemini CLI**

```bash
gemini mcp add -s user \
  -e REDASH_URL=https://your-redash-instance.com \
  -e REDASH_API_KEY=your_api_key_here \
  redash-mcp npx -y redash-mcp
```

**Codex CLI**

```bash
codex mcp add redash-mcp \
  --env REDASH_URL=https://your-redash-instance.com \
  --env REDASH_API_KEY=your_api_key_here \
  -- npx -y redash-mcp
```

</details>

## Tools

| Category | Tools |
|---|---|
| Data sources & schema | `list_data_sources`, `list_tables`, `get_table_columns` |
| Query | `run_query` — execute SQL and return results |
| Saved queries | `list_queries`, `get_query`, `get_query_result` (with parameter values), `create_query`, `update_query`, `fork_query`, `archive_query` |
| Charts | `create_visualization` — line / column / area / pie / scatter / counter |
| Dashboards | `list_dashboards`, `get_dashboard`, `create_dashboard`, `add_widget` (auto-layout) |
| Alerts | `list_alerts`, `get_alert`, `create_alert` |
| Smart Query (BIRD) | `smart_query`, `get_bird_config`, `evaluate_queries`, `submit_query_feedback`, `manage_few_shot_examples`, `manage_keyword_map` |

### SQL Safety Guard

Applies to ad-hoc SQL run through `run_query`. Saved queries executed with `get_query_result` are not checked, so give the Redash data source a read-only DB account.

- **Always blocked** (unless `REDASH_SAFETY_MODE=off`): `DROP`, `TRUNCATE`, `ALTER TABLE`, `GRANT/REVOKE`, `DELETE/UPDATE` without `WHERE`
- **Warned (`warn`) / blocked (`strict`)**: `SELECT *`, queries without `WHERE` or `LIMIT`, PII column access
- **Auto-LIMIT**: appends `LIMIT N` when `REDASH_AUTO_LIMIT` is set

Details: [docs/sql-safety-guard.md](docs/sql-safety-guard.md). Query results are also cached in memory (see `REDASH_MCP_CACHE_*` below).

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `REDASH_URL` | **required** | Redash instance URL (e.g. `https://redash.example.com`) |
| `REDASH_API_KEY` | **required** | Redash user API key |
| `REDASH_SAFETY_MODE` | `warn` | SQL safety level: `off` / `warn` / `strict` |
| `REDASH_SAFETY_DISABLE_PII` | `false` | Disable PII detection |
| `REDASH_SAFETY_DISABLE_COST` | `false` | Disable cost warnings |
| `REDASH_AUTO_LIMIT` | `0` | Auto-append `LIMIT N` to queries without one (0 = off) |
| `REDASH_DEFAULT_MAX_AGE` | `0` | Redash cache TTL in seconds |
| `REDASH_MCP_CACHE_TTL` | `300` | MCP query cache TTL in seconds (0 = off) |
| `REDASH_MCP_CACHE_MAX_MB` | `50` | Max memory for the MCP query cache, in MB |
| `REDASH_MCP_CONFIG_DIR` | `~/.redash-mcp` | Where BIRD few-shot, feedback, eval, and keyword-map data live |
| `REDASH_BIRD_ENABLED` | `true` | `false` disables the BIRD smart query tools |
| `REDASH_HTTP_TIMEOUT_SECS` | `30` | Per-request HTTP timeout against the Redash API |
| `ANTHROPIC_API_KEY` | — | Enables the Claude Haiku fallback for table selection in `smart_query` |

## Usage Examples

Just ask in natural language:

- "How many new users signed up this month?" → `smart_query` picks the tables → `run_query`
- "What percentage of last week's new users made a purchase?" → `smart_query` guides the JOIN → `run_query`
- "Create an alert when daily signups drop below 100" → `create_alert`

**Build a dashboard:** "Save a monthly revenue query, chart it as a line, and put it on a new Revenue dashboard."

1. `create_query` — save "Monthly Revenue"
2. `get_query_result` — run it once so the chart columns can be checked
3. `create_visualization` — `type: "line"`, `x_column: "month"`, `y_columns: ["revenue"]`
4. `create_dashboard` — create "Revenue"
5. `add_widget` — place the chart; more widgets stack below or pair side by side

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npx` not found (macOS GUI apps) | Run `which npx` and use the full path as `command` |
| "Authentication failed" | Check `REDASH_API_KEY` — it must be a user API key |
| "Unable to connect to the Redash server" | Check `REDASH_URL` (base URL with `https://`, without `/api`) and network/VPN |
| "The query timed out" | Simplify the query or pass a larger `timeout_secs` to `run_query` / `get_query_result`; raise `REDASH_HTTP_TIMEOUT_SECS` for slow API responses |
| Query blocked by the safety guard | Add `WHERE`/`LIMIT`; in `strict` mode, switch to `REDASH_SAFETY_MODE=warn` to get warnings instead |
| Tools don't show up | Fully restart the client after editing its config |

## Development

```bash
npm install
npm run dev     # run from source (tsx)
npm test        # vitest
npm run build   # typecheck + bundle to dist/
```

## Privacy Policy

redash-mcp is a **local MCP server** that talks directly to your Redash instance. No intermediate servers are involved.

| Item | Description |
|------|-------------|
| **Redash API Key** | Stored only as a local environment variable (`REDASH_API_KEY`). Never transmitted externally. |
| **Query content & results** | Delivered only to the local MCP client via the MCP protocol. |
| **BIRD SQL settings** | Stored only in local files (`~/.redash-mcp/`): few-shot examples, keyword maps, and feedback. |
| **LLM Fallback** | Only when `ANTHROPIC_API_KEY` is set, `smart_query` sends table names, column names, and the question text to the Anthropic API. Query results and row data are never transmitted. |

We do not sell or share user data with third parties.

**Retention:** config files stay in `~/.redash-mcp/` until you delete them; the query cache is in-memory and cleared on shutdown; the schema cache is in-memory with a 10-minute TTL.

**Contact:** inquiries and security reports via [GitHub Issues](https://github.com/seob717/redash-mcp/issues).

## Disclaimer

redash-mcp is an unofficial, community-built integration and is **not affiliated with, endorsed by, or sponsored by Redash**. "Redash" is a trademark of its respective owners and is used here only to describe compatibility. This project communicates with Redash solely through its public REST API.

## License

MIT
