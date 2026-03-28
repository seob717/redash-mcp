import type { PrunedTable, FewShotExample } from "./types.js";

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
  const tokens = tokenizeQuestion(question);
  if (tokens.length === 0) {
    return fullSchema.slice(0, topK).map((t) => ({
      name: t.name,
      columns: t.columns ?? [],
      score: 0,
    }));
  }

  const fewShotTableSet = new Set<string>();
  for (const ex of fewShotExamples) {
    for (const t of ex.tables) {
      fewShotTableSet.add(t.toLowerCase());
    }
  }

  const scored = fullSchema.map((table) => {
    const score = scoreTable(table, tokens, fewShotTableSet, keywordMap);
    return {
      name: table.name,
      columns: table.columns ?? [],
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
    if (keywordMap[token]) {
      expanded.push(...keywordMap[token]);
      continue;
    }
    for (const [keyword, mappings] of Object.entries(keywordMap)) {
      if (token.includes(keyword) || keyword.includes(token)) {
        expanded.push(...mappings);
      }
    }
  }
  return [...new Set(expanded)];
}

function scoreTable(
  table: SchemaTable,
  tokens: string[],
  fewShotTables: Set<string>,
  keywordMap?: Record<string, string[]>,
): number {
  let score = 0;
  const tableLower = table.name.toLowerCase();
  const expandedTokens = expandTokens(tokens, keywordMap);

  for (const token of expandedTokens) {
    if (tableLower.includes(token)) {
      score += 3;
    }
    else if (tableLower.replace(/_/g, "").includes(token)) {
      score += 1;
    }
  }

  for (const col of table.columns ?? []) {
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

function tokenizeQuestion(question: string): string[] {
  const STOP_WORDS = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "need",
    "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
    "and", "but", "or", "not", "no", "so",
    "me", "my", "i", "you", "your", "we", "our", "they", "their",
    "it", "its", "this", "that", "what", "which", "how", "where", "when", "why",
    "show", "give", "tell", "get", "find", "list", "display", "many", "much",
    "select", "count", "sum", "avg", "all", "each", "every",
    "의", "가", "이", "은", "는", "을", "를", "에", "에서", "와", "과",
    "도", "로", "으로", "만", "까지", "부터",
    "좀", "해줘", "알려줘", "보여줘", "해", "하는", "된", "인", "수",
    "총", "전체", "모든", "몇", "얼마나",
  ]);

  return question
    .toLowerCase()
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}
