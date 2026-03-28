import { readFile, writeFile } from "node:fs/promises";
import { ensureConfigDir, getDataSourcePath, loadConfig } from "./config.js";
import { addExample } from "./few-shot.js";
import type { FeedbackEntry } from "./types.js";

export async function loadFeedback(dataSourceId: number): Promise<FeedbackEntry[]> {
  try {
    const raw = await readFile(getDataSourcePath("feedback", dataSourceId), "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.entries ?? [];
  } catch {
    return [];
  }
}

async function saveFeedback(dataSourceId: number, entries: FeedbackEntry[]): Promise<void> {
  await ensureConfigDir();
  const data = { dataSourceId, entries };
  await writeFile(getDataSourcePath("feedback", dataSourceId), JSON.stringify(data, null, 2), "utf-8");
}

export async function recordFeedback(
  dataSourceId: number,
  entry: Omit<FeedbackEntry, "id" | "createdAt" | "promotedToFewShot" | "errorType">,
): Promise<FeedbackEntry> {
  const entries = await loadFeedback(dataSourceId);

  const errorType = entry.rating === "down" && entry.correctSql
    ? classifyError(entry.generatedSql, entry.correctSql)
    : undefined;

  const newEntry: FeedbackEntry = {
    ...entry,
    id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    errorType,
    promotedToFewShot: false,
    createdAt: new Date().toISOString(),
  };

  entries.push(newEntry);
  await saveFeedback(dataSourceId, entries);

  if (newEntry.rating === "down" && newEntry.correctSql && newEntry.errorType) {
    const config = await loadConfig();
    if (config.bird.feedback.enabled) {
      const sameErrorCount = entries.filter(
        (e) => e.errorType === newEntry.errorType && e.rating === "down" && !e.promotedToFewShot,
      ).length;

      if (sameErrorCount >= config.bird.feedback.autoPromoteThreshold) {
        await promoteToFewShot(dataSourceId, newEntry);
        newEntry.promotedToFewShot = true;
        await saveFeedback(dataSourceId, entries);
      }
    }
  }

  return newEntry;
}

export function classifyError(generatedSql: string, correctSql: string): string {
  const genTables = extractTables(generatedSql);
  const correctTables = extractTables(correctSql);
  const genColumns = extractColumns(generatedSql);
  const correctColumns = extractColumns(correctSql);

  const tableDiff = symmetricDifference(genTables, correctTables);
  if (tableDiff.size > 0) {
    return "wrong_table";
  }

  const colDiff = symmetricDifference(genColumns, correctColumns);
  if (colDiff.size > 0) {
    const genJoins = extractJoins(generatedSql);
    const correctJoins = extractJoins(correctSql);
    if (genJoins !== correctJoins) {
      return "wrong_join";
    }
    return "wrong_column";
  }

  const genWhere = extractWhere(generatedSql);
  const correctWhere = extractWhere(correctSql);
  if (genWhere !== correctWhere) {
    return "wrong_filter";
  }

  const genGroup = extractGroupBy(generatedSql);
  const correctGroup = extractGroupBy(correctSql);
  if (genGroup !== correctGroup) {
    return "wrong_aggregation";
  }

  return "other";
}

async function promoteToFewShot(dataSourceId: number, entry: FeedbackEntry): Promise<void> {
  if (!entry.correctSql) return;

  const tables = [...extractTables(entry.correctSql)];
  await addExample(dataSourceId, {
    question: entry.question,
    sql: entry.correctSql,
    tables,
    tags: [entry.errorType ?? "correction"],
    notes: `Auto-promoted from feedback. Original error: ${entry.errorType}`,
    source: "feedback",
  });
}

function extractTables(sql: string): Set<string> {
  const tables = new Set<string>();
  const normalized = sql.toLowerCase().replace(/\s+/g, " ");

  const fromMatch = normalized.match(/\bfrom\s+(\w+)/g);
  if (fromMatch) {
    for (const m of fromMatch) {
      const t = m.replace(/^from\s+/i, "").trim();
      if (t && !SQL_KEYWORDS.has(t)) tables.add(t);
    }
  }

  const joinMatch = normalized.match(/\bjoin\s+(\w+)/g);
  if (joinMatch) {
    for (const m of joinMatch) {
      const t = m.replace(/^join\s+/i, "").trim();
      if (t && !SQL_KEYWORDS.has(t)) tables.add(t);
    }
  }

  return tables;
}

function extractColumns(sql: string): Set<string> {
  const columns = new Set<string>();
  const normalized = sql.toLowerCase().replace(/\s+/g, " ");

  const selectMatch = normalized.match(/select\s+(.*?)\s+from/);
  if (selectMatch) {
    const cols = selectMatch[1].split(",").map((c) => c.trim().replace(/.*\bas\b\s*/i, ""));
    for (const c of cols) {
      if (c !== "*") columns.add(c.replace(/.*\./, ""));
    }
  }

  return columns;
}

function extractWhere(sql: string): string {
  const normalized = sql.toLowerCase().replace(/\s+/g, " ");
  const match = normalized.match(/\bwhere\s+(.*?)(?:\bgroup\b|\border\b|\blimit\b|\bhaving\b|$)/);
  return match ? match[1].trim() : "";
}

function extractGroupBy(sql: string): string {
  const normalized = sql.toLowerCase().replace(/\s+/g, " ");
  const match = normalized.match(/\bgroup\s+by\s+(.*?)(?:\border\b|\blimit\b|\bhaving\b|$)/);
  return match ? match[1].trim() : "";
}

function extractJoins(sql: string): string {
  const normalized = sql.toLowerCase().replace(/\s+/g, " ");
  const matches = normalized.match(/\bjoin\s+.*?\bon\s+.*?(?=\bjoin\b|\bwhere\b|\bgroup\b|\border\b|\blimit\b|$)/g);
  return matches ? matches.sort().join("; ") : "";
}

function symmetricDifference(a: Set<string>, b: Set<string>): Set<string> {
  const diff = new Set<string>();
  for (const item of a) if (!b.has(item)) diff.add(item);
  for (const item of b) if (!a.has(item)) diff.add(item);
  return diff;
}

const SQL_KEYWORDS = new Set([
  "select", "from", "where", "join", "inner", "left", "right", "outer",
  "cross", "on", "and", "or", "not", "in", "exists", "between", "like",
  "is", "null", "true", "false", "as", "case", "when", "then", "else",
  "end", "group", "by", "order", "having", "limit", "offset", "union",
  "all", "distinct", "set", "values", "into", "insert", "update", "delete",
]);
