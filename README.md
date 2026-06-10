# redash-mcp

[![npm version](https://img.shields.io/npm/v/redash-mcp.svg)](https://www.npmjs.com/package/redash-mcp)
[![Downloads](https://img.shields.io/npm/dm/redash-mcp.svg)](https://www.npmjs.com/package/redash-mcp)
[![Node](https://img.shields.io/node/v/redash-mcp.svg)](https://nodejs.org)
[![smithery badge](https://smithery.ai/badge/dev-seob717/redash-mcp)](https://smithery.ai/servers/dev-seob717/redash-mcp)

<a href="https://www.producthunt.com/products/redash-mcp?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-redash-mcp" target="_blank" rel="noopener noreferrer"><img alt="redash-mcp - Let Claude query your Redash safely — with SQL guardrails | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1168656&amp;theme=light&amp;t=1781110407784"></a>

English | [한국어](README.ko.md) | [日本語](README.ja.md)

> MCP server that connects [Redash](https://redash.io) to Claude AI — query data, manage dashboards, and run SQL with natural language.

[Why](#why-redash-mcp) · [Features](#features) · [Install](#installation) · [Env](#environment-variables) · [Examples](#usage-examples) · [Privacy](#privacy-policy)

![redash-mcp demo — Claude explores Redash tables, charts revenue by category, then the SQL safety guard blocks a PII export](docs/demo.gif)

---

## Why redash-mcp?

There are several Redash MCP servers. This one is built for letting an LLM touch **production** data safely:

- **🛡️ SQL Safety Guard** — blocks `DROP`/`TRUNCATE`/`ALTER` and `DELETE`/`UPDATE` without `WHERE`; `strict`/`warn`/`off` modes, PII detection, and auto-`LIMIT`. Hand Claude your real Redash without flinching.
- **🧠 BIRD Smart Query** — analyzes the question, auto-selects the right tables, and guides SQL generation (based on the [BIRD text-to-SQL](https://bird-bench.github.io/) methodology). Optional Claude Haiku fallback for table selection.
- **⚡ One-command setup** — `npx redash-mcp setup` configures Claude Desktop / Claude Code for you. No hand-editing JSON.
- **🔒 Fully local** — talks directly to your Redash instance. API key and query results never leave your machine.
- **📊 End-to-end** — query, save, fork, dashboards, widgets, and alerts — 20+ tools across 6 categories.

---

## Features

### Tools

| Category | Tool | Description |
|---|---|---|
| Data Sources | `list_data_sources` | List connected data sources |
| Schema | `list_tables` | List tables (supports keyword search) |
| Schema | `get_table_columns` | Get column names and types |
| Smart Query | `smart_query` | Analyze a question, auto-select tables, guide SQL generation (BIRD) |
| Smart Query | `get_bird_config` | Inspect the active BIRD smart-query configuration |
| Smart Query | `evaluate_queries` | Evaluate generated SQL against expected results |
| Smart Query | `submit_query_feedback` | Record feedback to improve future table selection |
| Smart Query | `manage_few_shot_examples` | Add/list BIRD few-shot examples |
| Smart Query | `manage_keyword_map` | Add/list keyword→table mappings |
| Query | `run_query` | Execute SQL and return results |
| Saved Queries | `list_queries` | List saved queries |
| Saved Queries | `get_query` | Get query details (SQL, visualizations) |
| Saved Queries | `get_query_result` | Run a saved query and get results |
| Saved Queries | `create_query` | Save a new query |
| Saved Queries | `update_query` | Update a saved query |
| Saved Queries | `fork_query` | Fork a saved query |
| Saved Queries | `archive_query` | Archive (delete) a query |
| Dashboards | `list_dashboards` | List dashboards |
| Dashboards | `get_dashboard` | Get dashboard details and widgets |
| Dashboards | `create_dashboard` | Create a new dashboard |
| Dashboards | `add_widget` | Add a visualization widget to a dashboard |
| Alerts | `list_alerts` | List alerts |
| Alerts | `get_alert` | Get alert details |
| Alerts | `create_alert` | Create a new alert |

### SQL Safety Guard

Protects your database from dangerous queries:

- **Blocked always**: `DROP`, `TRUNCATE`, `ALTER TABLE`, `GRANT/REVOKE`, `DELETE/UPDATE` without `WHERE`
- **Warned (warn mode)** / **Blocked (strict mode)**: `SELECT *`, queries without `WHERE` or `LIMIT`, PII column access
- **Auto-LIMIT**: Automatically appends `LIMIT N` when `REDASH_AUTO_LIMIT` is set

### Query Cache

Results are cached in-memory to reduce redundant API calls:

- TTL: configurable via `REDASH_MCP_CACHE_TTL` (default: 300s)
- Max memory: configurable via `REDASH_MCP_CACHE_MAX_MB` (default: 50MB)

---

## Installation

### Auto Setup (Recommended)

```bash
npx redash-mcp setup
```

The setup wizard will guide you through configuring Claude Desktop, Claude Code (CLI), or both.

### Shell Script Install

Installs Node.js, Claude Desktop, and MCP config all at once:

```bash
curl -fsSL https://raw.githubusercontent.com/seob717/redash-mcp/main/install.sh | bash
```

### Manual Setup

#### 1. Get your Redash API Key

Go to Redash → Profile (top right) → **Edit Profile** → Copy **API Key**

#### 2-A. Claude Desktop

Open `~/Library/Application Support/Claude/claude_desktop_config.json` and add:

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

#### 2-B. Claude Code (CLI)

Open `~/.claude/settings.json` and add:

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

> **macOS**: If `npx` is not found, run `which npx` to get the full path and use that instead.

---

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `REDASH_URL` | Redash instance URL (e.g. `https://redash.example.com`) |
| `REDASH_API_KEY` | Redash user API key |

### Optional

| Variable | Default | Description |
|---|---|---|
| `REDASH_SAFETY_MODE` | `warn` | SQL safety level: `off` / `warn` / `strict` |
| `REDASH_SAFETY_DISABLE_PII` | `false` | Disable PII detection |
| `REDASH_SAFETY_DISABLE_COST` | `false` | Disable cost warnings |
| `REDASH_AUTO_LIMIT` | `0` | Auto-append `LIMIT N` to queries without one (0 = disabled) |
| `REDASH_DEFAULT_MAX_AGE` | `0` | Redash cache TTL in seconds |
| `REDASH_MCP_CACHE_TTL` | `300` | MCP query cache TTL in seconds (0 = disabled) |
| `REDASH_MCP_CACHE_MAX_MB` | `50` | Max memory for MCP query cache in MB |
| `REDASH_MCP_CONFIG_DIR` | `~/.redash-mcp` | Directory for BIRD few-shot, feedback, eval, keyword-map data |
| `REDASH_BIRD_ENABLED` | `true` | Set to `false` to disable BIRD smart query tools |
| `REDASH_HTTP_TIMEOUT_SECS` | `30` | Per-request HTTP timeout against the Redash API |
| `ANTHROPIC_API_KEY` | — | If set, BIRD smart_query falls back to Claude Haiku for table selection when keyword scoring fails |

---

## Usage Examples

Just ask Claude in natural language:

- "Show me the columns in the users table"
- "Run a query to get order counts for the last 7 days"
- "List all saved queries"
- "Show widgets in the revenue dashboard"
- "Create an alert when daily signups drop below 100"

### Example 1: Query data with natural language

> **Prompt**: "How many new users signed up this month?"

**Tool flow:**
1. `list_data_sources` → Identify the target data source
2. `smart_query` → Analyze the question, auto-select the `User` table, provide SQL generation guidance
3. `run_query` → Execute the generated SQL

**Result:**
```
There were 18,197 new signups this month.
```

### Example 2: Complex business questions

> **Prompt**: "What percentage of last week's new users made a purchase?"

**Tool flow:**
1. `smart_query` → Analyze the question, auto-select `User` and `Payment` tables, provide JOIN query guidance
2. `run_query` → Execute the SQL

**Result:**
```
Out of 1,204 new users last week, 312 made a purchase (25.9%).
```

### Example 3: Create a query and dashboard

> **Prompt**: "Create a monthly revenue trend query and add it to a dashboard"

**Tool flow:**
1. `smart_query` → Analyze revenue-related tables
2. `create_query` → Save the "Monthly Revenue Trend" query
3. `create_dashboard` → Create a "Revenue Dashboard"
4. `get_query` → Get the visualization ID from the saved query
5. `add_widget` → Add the chart widget to the dashboard

**Result:**
```
Created "Revenue Dashboard" with the monthly revenue trend chart.
View in Redash: https://your-redash.com/dashboard/monthly-revenue
```

---

## Privacy Policy

### Data Collection and Processing

redash-mcp is a **local MCP server** that communicates directly with your Redash instance. No intermediate servers are involved.

| Item | Description |
|------|-------------|
| **Redash API Key** | Stored only as a local environment variable (`REDASH_API_KEY`). Never transmitted externally. |
| **Query content & results** | Delivered only to the local MCP client (Claude Desktop/Code) via the MCP protocol. |
| **BIRD SQL settings** | Stored only in local files (`~/.redash-mcp/`). Includes few-shot examples, keyword maps, and feedback. |
| **LLM Fallback** | When `ANTHROPIC_API_KEY` is set, only table name lists are sent to the Anthropic API. Query data and results are never transmitted. |

### Third-Party Sharing

We do not sell or share user data with third parties. When the LLM Fallback feature is active, only table name lists are sent to the Anthropic API, and only when the user has explicitly configured an `ANTHROPIC_API_KEY`.

### Data Retention

- **Config files**: Stored locally in `~/.redash-mcp/` (user can delete at any time)
- **Query cache**: In-memory only, cleared on server shutdown
- **Schema cache**: In-memory only, auto-expires after 10-minute TTL

### Contact

For inquiries and security reports: [GitHub Issues](https://github.com/seob717/redash-mcp/issues)

---

## Disclaimer

redash-mcp is an unofficial, community-built integration and is **not affiliated with, endorsed by, or sponsored by Redash**. "Redash" is a trademark of its respective owners and is used here only to describe compatibility. This project communicates with Redash solely through its public REST API.

## License

MIT © seob717
