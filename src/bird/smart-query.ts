import { fetchSchema } from "../redash-client.js";
import { loadConfig } from "./config.js";
import { loadExamples, findRelevantExamples, formatExamplesForPrompt } from "./few-shot.js";
import { pruneSchema, formatPrunedSchema, type SchemaTable } from "./schema-pruning.js";
import { assessComplexity } from "./complexity.js";
import { getEffectiveMap } from "./keyword-map.js";
import { isLLMAvailable, selectTablesWithLLM } from "./llm-table-selector.js";
import type { PrunedTable, SmartQueryResponse } from "./types.js";

export async function handleSmartQuery(params: {
  question: string;
  data_source_id: number;
  context?: string;
}): Promise<SmartQueryResponse> {
  const { question, data_source_id, context } = params;
  const config = await loadConfig();

  // The schema fetch and the local JSON reads are independent — load them in parallel.
  const [schemaResult, allExamples, keywordMap] = await Promise.all([
    fetchSchema(data_source_id).then(
      (schema) => ({ ok: true as const, schema }),
      (e: any) => ({ ok: false as const, message: String(e?.message ?? e) }),
    ),
    config.bird.fewShot.enabled ? loadExamples(data_source_id) : Promise.resolve([]),
    getEffectiveMap(data_source_id),
  ]);
  if (!schemaResult.ok) {
    return { action: "explain", explanation: `Schema fetch failed: ${schemaResult.message}` };
  }
  const fullSchema: SchemaTable[] = schemaResult.schema;

  const combinedQuestion = context ? `${question} ${context}` : question;

  const scoringEnabled = config.bird.schemaPruning.enabled;
  let prunedTables: PrunedTable[];
  if (scoringEnabled) {
    prunedTables = pruneSchema(
      combinedQuestion,
      fullSchema,
      allExamples,
      config.bird.schemaPruning.topK,
      keywordMap,
    );
  } else {
    prunedTables = fullSchema.slice(0, 10).map((t) => ({
      name: t.name,
      columns: t.columns,
      score: 0,
    }));
  }

  // LLM fallback: when token matching fails to find relevant tables
  const maxScore = Math.max(...prunedTables.map((t) => t.score), 0);
  if (scoringEnabled && maxScore === 0 && isLLMAvailable()) {
    const llmSelected = await selectTablesWithLLM(
      combinedQuestion,
      fullSchema,
      config.bird.schemaPruning.topK,
    );
    if (llmSelected.length > 0) {
      // Preserve the LLM's ranking as descending scores; a uniform score
      // would trip the "too many tables tied" vagueness check.
      const rank = new Map(llmSelected.map((name, i) => [name, llmSelected.length - i]));
      prunedTables = fullSchema
        .filter((t) => rank.has(t.name))
        .map((t) => ({
          name: t.name,
          columns: t.columns,
          score: rank.get(t.name)!,
        }));
    }
  }

  if (prunedTables.length === 0) {
    return {
      action: "explain",
      explanation: "No tables were found in this data source's schema, so SQL cannot be generated. Verify the data source with list_tables.",
    };
  }

  if (!context) {
    const clarifications = detectVagueness(question, prunedTables, scoringEnabled);
    if (clarifications.length > 0) {
      return {
        action: "clarify",
        clarificationQuestions: clarifications,
      };
    }
  }

  const prunedTableNames = prunedTables.map((t) => t.name);
  const matchedExamples = findRelevantExamples(
    question,
    prunedTableNames,
    allExamples,
    config.bird.fewShot.maxExamplesPerQuery,
  );

  const complexity = config.bird.complexity.enabled
    ? assessComplexity(combinedQuestion, prunedTables)
    : undefined;

  const guidanceParts: string[] = [];
  if (context) {
    guidanceParts.push(`User clarification: ${context}`);
  }
  if (complexity) {
    guidanceParts.push(`Difficulty: ${complexity.level} (${complexity.reasoning})`);
    if (complexity.hints.length > 0) {
      guidanceParts.push(`Hints: ${complexity.hints.join(". ")}`);
    }
  }

  return {
    action: "generate",
    schema: formatPrunedSchema(prunedTables),
    fewShotExamples: formatExamplesForPrompt(matchedExamples),
    complexity,
    guidance: guidanceParts.join("\n"),
  };
}

export function detectVagueness(
  question: string,
  prunedTables: Array<{ name: string; score: number }>,
  scored: boolean,
): string[] {
  const clarifications: string[] = [];
  const q = question.toLowerCase();

  const timeKeywords = [
    "recent", "lately", "last", "previous", "this",
    "최근", "지난", "이번", "저번", "올해", "작년",
  ];
  const timeSpecifiers = [
    "day", "week", "month", "year", "quarter", "hour",
    "일", "주", "월", "년", "분기", "시간",
    /\d{4}[-\/]\d{1,2}/, /\d{1,2}[-\/]\d{1,2}/,
  ];

  const hasTimeKeyword = timeKeywords.some((kw) => q.includes(kw));
  const hasTimeSpecifier = timeSpecifiers.some((spec) =>
    spec instanceof RegExp ? spec.test(q) : q.includes(spec),
  );

  if (hasTimeKeyword && !hasTimeSpecifier) {
    clarifications.push("Which specific time period? (e.g., last 7 days, last month, 2025-01-01 ~ 2025-03-31)");
  }

  const trimmed = question.trim();
  const wordCount = trimmed.split(/\s+/).length;
  const hasCJK = /[ㄱ-힝]/.test(trimmed);
  const tooShort = hasCJK
    ? trimmed.replace(/\s+/g, "").length < 6
    : wordCount < 4;
  if (tooShort) {
    clarifications.push("Could you provide more details about what data you need?");
  }

  // Score-based checks only make sense when table scoring actually ran.
  if (scored) {
    const maxScore = Math.max(...prunedTables.map((t) => t.score), 0);
    if (maxScore === 0 && prunedTables.length > 0) {
      clarifications.push(
        "I couldn't identify which tables are relevant. Could you mention specific entities (e.g., users, orders, payments)?",
      );
    }

    if (maxScore > 0) {
      const topTables = prunedTables.filter((t) => t.score === maxScore);
      if (topTables.length > 3) {
        clarifications.push(
          `Multiple tables match your question (${topTables.slice(0, 5).map((t) => t.name).join(", ")}). Could you be more specific about which data you need?`,
        );
      }
    }
  }

  return clarifications;
}
