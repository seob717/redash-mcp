# Anthropic Connectors Directory Submission

Prepared answers for the [Anthropic Connectors Directory form](https://forms.gle/tyiAZvch1kDADKoP9).

---

## Basic Information

| Field | Value |
|-------|-------|
| **Server Name** | redash-mcp |
| **Version** | 3.0.0 |
| **Author / Publisher** | seob717 |
| **License** | MIT |
| **GitHub URL** | https://github.com/seob717/redash-mcp |
| **npm URL** | https://www.npmjs.com/package/redash-mcp |
| **Privacy Policy URL** | https://github.com/seob717/redash-mcp#privacy-policy |
| **Support / Issues URL** | https://github.com/seob717/redash-mcp/issues |

---

## Short Description (1-2 sentences)

MCP server that connects Redash to Claude AI -- query data, manage dashboards, and run SQL with natural language. Supports 20+ tools covering data sources, schema exploration, saved queries, dashboards, alerts, and SQL safety guards.

---

## Long Description

redash-mcp is a Model Context Protocol (MCP) server that gives Claude full access to a Redash BI instance. It enables users to interact with their data using natural language instead of writing SQL or navigating the Redash UI manually.

### Key Capabilities

- **Schema Exploration**: List data sources, browse tables with keyword search, and inspect column names and types.
- **SQL Execution**: Run arbitrary SQL queries against any connected data source and get structured results.
- **Saved Query Management**: List, view, create, update, fork, and archive saved queries.
- **Dashboard Management**: List and inspect dashboards, create new ones, and add visualization widgets.
- **Alerting**: List, view, and create alerts based on query results.
- **SQL Safety Guard**: Blocks dangerous operations (DROP, TRUNCATE, ALTER TABLE) and warns about risky patterns (SELECT *, missing WHERE/LIMIT, PII column access). Configurable as off/warn/strict.
- **Query Cache**: In-memory caching with configurable TTL and memory limits to reduce redundant API calls.
- **BIRD SQL Methodology**: Intelligent query generation with few-shot examples, keyword mapping, and feedback loops for higher SQL accuracy.

### Tools (20+)

| Category | Tools |
|----------|-------|
| Data Sources | `list_data_sources` |
| Schema | `list_tables`, `get_table_columns` |
| Query | `run_query`, `smart_query` |
| Saved Queries | `list_queries`, `get_query`, `get_query_result`, `create_query`, `update_query`, `fork_query`, `archive_query` |
| Dashboards | `list_dashboards`, `get_dashboard`, `create_dashboard`, `add_widget` |
| Alerts | `list_alerts`, `get_alert`, `create_alert` |
| BIRD SQL | `get_bird_config`, `manage_few_shot_examples`, `manage_keyword_map`, `submit_query_feedback`, `evaluate_queries` |

---

## Category Suggestion

**Business Intelligence / Data Analytics**

Alternative categories: Database, SQL, Dashboards

---

## Usage Examples

### Example 1: Query data with natural language

**Prompt**: "How many new users signed up this month?"

**Tool flow**:
1. `list_data_sources` -- Identify the target data source
2. `smart_query` -- Analyze the question, auto-select the User table, provide SQL generation guidance
3. `run_query` -- Execute the generated SQL

**Result**: "There were 18,197 new signups this month."

### Example 2: Complex business questions

**Prompt**: "What percentage of last week's new users made a purchase?"

**Tool flow**:
1. `smart_query` -- Analyze the question, auto-select User and Payment tables, provide JOIN query guidance
2. `run_query` -- Execute the SQL

**Result**: "Out of 1,204 new users last week, 312 made a purchase (25.9%)."

### Example 3: Create a query and dashboard

**Prompt**: "Create a monthly revenue trend query and add it to a dashboard"

**Tool flow**:
1. `smart_query` -- Analyze revenue-related tables
2. `create_query` -- Save the "Monthly Revenue Trend" query
3. `create_dashboard` -- Create a "Revenue Dashboard"
4. `get_query` -- Get the visualization ID from the saved query
5. `add_widget` -- Add the chart widget to the dashboard

**Result**: "Created 'Revenue Dashboard' with the monthly revenue trend chart."

---

## Installation Instructions

### Recommended (Auto Setup)

```bash
npx redash-mcp setup
```

The setup wizard guides you through configuring Claude Desktop, Claude Code (CLI), or both.

### Shell Script Install

```bash
curl -fsSL https://raw.githubusercontent.com/seob717/redash-mcp/main/install.sh | bash
```

### Manual Setup (Claude Desktop)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

### Manual Setup (Claude Code CLI)

Add to `~/.claude/settings.json`:

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

---

## Test Credentials (for Anthropic review)

> **TODO**: Fill these in before submitting.

| Variable | Value |
|----------|-------|
| `REDASH_URL` | `https://server-production-9bfc.up.railway.app` |
| `REDASH_API_KEY` | `j2K5CnijxL8TZkptOeycKREmpr88ei0UWy92SsFn` |

---

## Required Environment Variables

| Variable | Description |
|----------|-------------|
| `REDASH_URL` | Redash instance URL (e.g. `https://redash.example.com`) |
| `REDASH_API_KEY` | Redash user API key |

## Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDASH_SAFETY_MODE` | `warn` | SQL safety level: `off` / `warn` / `strict` |
| `REDASH_AUTO_LIMIT` | `0` | Auto-append LIMIT N to queries (0 = disabled) |
| `REDASH_MCP_CACHE_TTL` | `300` | Query cache TTL in seconds (0 = disabled) |
| `REDASH_MCP_CACHE_MAX_MB` | `50` | Max memory for query cache in MB |

---

## Additional Notes

- **Runtime**: Node.js >= 18
- **Transport**: stdio (standard MCP transport)
- **Data handling**: All data stays local. No intermediate servers. Queries and results are delivered only to the local MCP client via the MCP protocol.
- **Manifest version**: 0.3 (per manifest.json)
