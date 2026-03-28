import { fetchSchema } from "../redash-client.js";
import { loadConfig } from "./config.js";
import { loadExamples, findRelevantExamples, formatExamplesForPrompt } from "./few-shot.js";
import { pruneSchema, formatPrunedSchema } from "./schema-pruning.js";
import { assessComplexity } from "./complexity.js";
import { getEffectiveMap } from "./keyword-map.js";
import type { SmartQueryResponse } from "./types.js";

export async function handleSmartQuery(params: {
  question: string;
  data_source_id: number;
  context?: string;
}): Promise<SmartQueryResponse> {
  const { question, data_source_id, context } = params;
  const config = await loadConfig();

  const fullSchema = await fetchSchema(data_source_id);

  const allExamples = config.bird.fewShot.enabled
    ? await loadExamples(data_source_id)
    : [];

  const keywordMap = await getEffectiveMap(data_source_id);

  let prunedTables;
  if (config.bird.schemaPruning.enabled) {
    prunedTables = pruneSchema(
      context ? `${question} ${context}` : question,
      fullSchema,
      allExamples,
      config.bird.schemaPruning.topK,
      keywordMap,
    );
  } else {
    prunedTables = fullSchema.slice(0, 10).map((t: any) => ({
      name: t.name,
      columns: t.columns ?? [],
      score: 0,
    }));
  }

  if (!context) {
    const clarifications = detectVagueness(question, prunedTables);
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
    ? assessComplexity(context ? `${question} ${context}` : question, prunedTables)
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

function detectVagueness(
  question: string,
  prunedTables: Array<{ name: string; score: number }>,
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

  const wordCount = question.trim().split(/\s+/).length;
  if (wordCount < 4) {
    clarifications.push("Could you provide more details about what data you need?");
  }

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

  return clarifications;
}
