import type { PrunedTable, FewShotExample } from "./types.js";
import { tokenize } from "./tokenize.js";

export interface SchemaTable {
  name: string;
  columns: Array<{ name: string; type: string }>;
}

export function pruneSchema(
  question: string,
  fullSchema: SchemaTable[],
  fewShotExamples: FewShotExample[],
  topK: number,
  keywordMap?: Record<string, string[]>,
): PrunedTable[] {
  const tokens = tokenize(question);
  if (tokens.length === 0) {
    return fullSchema.slice(0, topK).map((t) => ({
      name: t.name,
      columns: t.columns,
      score: 0,
    }));
  }

  const fewShotTableSet = new Set<string>();
  for (const ex of fewShotExamples) {
    for (const t of ex.tables) {
      fewShotTableSet.add(t.toLowerCase());
    }
  }

  const expandedTokens = expandTokens(tokens, keywordMap);

  const scored = fullSchema.map((table) => {
    const score = scoreTable(table, expandedTokens, fewShotTableSet);
    return {
      name: table.name,
      columns: table.columns,
      score,
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function expandTokens(tokens: string[], keywordMap?: Record<string, string[]>): string[] {
  if (!keywordMap) return tokens;
  const expanded = [...tokens];
  for (const token of tokens) {
    // Array.isArray also guards against prototype-chain hits for tokens
    // like "constructor" on a plain object map.
    const direct = keywordMap[token];
    if (Array.isArray(direct)) {
      expanded.push(...direct);
      continue;
    }
    for (const [keyword, mappings] of Object.entries(keywordMap)) {
      if (Array.isArray(mappings) && (token.includes(keyword) || keyword.includes(token))) {
        expanded.push(...mappings);
      }
    }
  }
  return [...new Set(expanded)];
}

function scoreTable(
  table: SchemaTable,
  expandedTokens: string[],
  fewShotTables: Set<string>,
): number {
  let score = 0;
  const tableLower = table.name.toLowerCase();

  for (const token of expandedTokens) {
    if (tableLower.includes(token)) {
      score += 3;
    }
    else if (tableLower.replace(/_/g, "").includes(token)) {
      score += 1;
    }
  }

  for (const col of table.columns) {
    const colLower = col.name.toLowerCase();
    for (const token of expandedTokens) {
      if (colLower.includes(token)) {
        score += 1;
        break;
      }
    }
  }

  if (fewShotTables.has(tableLower)) {
    score += 2;
  }

  return score;
}

export function formatPrunedSchema(tables: PrunedTable[]): string {
  const lines = ["## Relevant tables:\n"];
  for (const table of tables) {
    lines.push(`### ${table.name}`);
    if (table.columns.length > 0) {
      lines.push("| Column | Type |");
      lines.push("| --- | --- |");
      for (const col of table.columns) {
        lines.push(`| ${col.name} | ${col.type ?? "unknown"} |`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}
