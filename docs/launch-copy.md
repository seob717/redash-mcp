# Launch & Promotion Copy

Ready-to-paste copy for promoting `redash-mcp` across channels. Tone: concise, builder-to-builder, no hype.

---

## Product Hunt

**Name:** redash-mcp

**Tagline (60 char max):**
> Let Claude query your Redash safely — with SQL guardrails

Alternates:
- Natural-language SQL on your Redash, with safety guards
- Give Claude read access to Redash without the fear

**Description:**
> redash-mcp is an MCP server that connects Redash to Claude (Desktop & Code). Ask questions in plain language and Claude runs SQL, builds dashboards, and sets alerts through your Redash instance.
>
> What makes it different: a built-in SQL Safety Guard blocks destructive queries (DROP/TRUNCATE/ALTER, DELETE/UPDATE without WHERE), flags `SELECT *` and missing LIMIT, and detects PII columns — with strict/warn/off modes. So you can point an LLM at production data without holding your breath.
>
> It also ships BIRD-based smart query (auto-selects the right tables for a question), an in-memory cache, and a one-command setup wizard (`npx redash-mcp setup`). Fully local — your API key and query results never leave your machine.
>
> 20+ tools across data sources, schema, queries, dashboards, and alerts. MIT licensed.

**First comment (maker):**
> Hi PH 👋 I built this because I wanted to ask Claude "how many users signed up this week?" against our Redash — but didn't want an LLM one hallucinated query away from `DROP TABLE`. So the core of redash-mcp is the safety layer: it refuses destructive SQL and warns on expensive/PII queries before anything runs.
>
> It's fully local (no middleman server), works with Claude Desktop and Claude Code, and sets up in one command. Would love feedback on the safety rules and which Redash workflows you'd want next.

**Topics/tags:** Developer Tools, Artificial Intelligence, SQL, Open Source

---

## Show HN / Hacker News

**Title:**
> Show HN: Redash MCP server that blocks destructive SQL before an LLM runs it

**Body:**
> I wanted to let Claude answer data questions against our Redash, but giving an LLM SQL access to production made me nervous. So redash-mcp wraps Redash's API with a safety layer: it blocks DROP/TRUNCATE/ALTER and DELETE/UPDATE without WHERE, warns on `SELECT *` / missing LIMIT, and flags PII columns. Modes are strict/warn/off.
>
> Beyond safety it does natural-language querying (BIRD-style table auto-selection), saved queries, dashboards, widgets, and alerts — 20+ tools. It's a local stdio MCP server, so the API key and results stay on your machine. One-command setup for Claude Desktop / Claude Code.
>
> Repo: https://github.com/seob717/redash-mcp
> npm: npx redash-mcp setup
>
> Happy to answer questions about the safety rules or the BIRD table-selection approach.

---

## Reddit (r/dataengineering, r/Redash, r/ClaudeAI)

**Title:**
> I built an MCP server so Claude can query Redash — with guardrails against destructive SQL

**Body:**
> Sharing a tool I made: redash-mcp connects Redash to Claude (Desktop/Code) so you can ask data questions in natural language. The part I cared most about is safety — it blocks `DROP`/`TRUNCATE`/`ALTER` and unscoped `DELETE`/`UPDATE`, warns on `SELECT *` and missing `LIMIT`, and detects PII columns. strict/warn/off modes.
>
> It also auto-selects relevant tables for a question (BIRD method), and can create saved queries, dashboards, widgets, and alerts. Fully local — nothing leaves your machine except the calls to your own Redash.
>
> Setup is one command: `npx redash-mcp setup`. MIT licensed. Repo: https://github.com/seob717/redash-mcp
>
> Feedback welcome, especially on the safety ruleset.

(Reddit etiquette: check each subreddit's self-promo rules; engage in comments, don't drop-and-leave.)

---

## X / Twitter

> Gave Claude access to our Redash — but an LLM one bad query from `DROP TABLE` made me nervous.
>
> So redash-mcp has a SQL safety guard: blocks destructive queries, warns on SELECT */no-LIMIT, flags PII. strict/warn/off.
>
> Natural-language SQL + dashboards + alerts. Local. One command.
>
> https://github.com/seob717/redash-mcp

---

## LinkedIn

> I open-sourced redash-mcp — an MCP server that lets Claude query and manage Redash in natural language.
>
> The hard part of connecting an LLM to a BI tool isn't the queries — it's trust. So the core feature is a SQL safety guard that blocks destructive statements (DROP/TRUNCATE/ALTER, unscoped DELETE/UPDATE), warns on expensive scans, and detects PII columns before anything executes.
>
> It runs fully locally, sets up in one command, and covers 20+ operations across queries, dashboards, and alerts. MIT licensed.
>
> 👉 https://github.com/seob717/redash-mcp

---

## awesome-mcp-servers entry (Databases category)

```
- [seob717/redash-mcp](https://github.com/seob717/redash-mcp) 📇 🏠 - Connect Redash to Claude — natural-language SQL with safety guards (blocks DROP/TRUNCATE, PII detection), BIRD-based smart table selection, plus saved queries, dashboards, widgets, and alerts.
```

Legend: 📇 = TypeScript, 🏠 = Local Service.

---

## Distribution checklist

- [ ] GitHub topics set (done)
- [ ] npm keywords + description updated (done — publish to apply)
- [ ] README "Why" + comparison section (done)
- [ ] MCP Registry (registry.modelcontextprotocol.io) — published via server.json
- [ ] Anthropic MCP Directory — submitted (issue #1)
- [ ] PulseMCP — verify listing metadata/icon
- [ ] awesome-mcp-servers (punkpeye) — PR
- [ ] Glama.ai — claim/submit server
- [ ] Smithery — submit
- [ ] mcp.so — submit
- [ ] Product Hunt — launch
- [ ] Show HN — post
- [ ] Reddit (r/dataengineering, r/Redash, r/ClaudeAI)
- [ ] Demo GIF in README (natural-language query → chart)
