import type { ComplexityAssessment, PrunedTable } from "./types.js";

export function assessComplexity(
  question: string,
  prunedTables: PrunedTable[],
): ComplexityAssessment {
  let score = 0;
  const hints: string[] = [];
  const reasons: string[] = [];
  const q = question.toLowerCase();

  const relevantTables = prunedTables.filter((t) => t.score > 0).length;
  if (relevantTables > 1) {
    score += (relevantTables - 1) * 2;
    reasons.push(`${relevantTables} tables involved`);
  }

  const joinKeywords = ["join", "combine", "relate", "between tables", "연결", "결합", "조인"];
  if (joinKeywords.some((kw) => q.includes(kw))) {
    score += 2;
    reasons.push("explicit join requested");
    hints.push("Verify JOIN conditions match the correct foreign keys.");
  }

  const subqueryKeywords = [
    "for each", "among those", "within", "nested", "sub",
    "중에서", "각각", "그중", "해당하는",
  ];
  if (subqueryKeywords.some((kw) => q.includes(kw))) {
    score += 2;
    reasons.push("subquery likely needed");
    hints.push("Consider using CTEs for readability.");
  }

  const windowKeywords = [
    "ranking", "rank", "running total", "cumulative", "previous",
    "percentile", "top n", "nth",
    "순위", "누적", "이전", "상위",
  ];
  if (windowKeywords.some((kw) => q.includes(kw))) {
    score += 3;
    reasons.push("window functions may be needed");
    hints.push("Use window functions (ROW_NUMBER, RANK, LAG/LEAD) as appropriate.");
  }

  const pivotKeywords = [
    "compare across", "breakdown by", "pivot", "crosstab",
    "비교", "교차", "피벗", "대비",
  ];
  if (pivotKeywords.some((kw) => q.includes(kw))) {
    score += 2;
    reasons.push("cross-comparison or pivoting needed");
    hints.push("Consider CASE WHEN for pivot-style queries.");
  }

  const timeCompareKeywords = [
    "year over year", "month over month", "yoy", "mom",
    "growth rate", "change rate", "trend",
    "전년", "전월", "증감", "추이", "변화율", "성장률",
  ];
  if (timeCompareKeywords.some((kw) => q.includes(kw))) {
    score += 2;
    reasons.push("time-based comparison needed");
    hints.push("Use LAG() or self-join for period-over-period comparisons.");
  }

  const ratioKeywords = [
    "ratio", "rate", "conversion", "percentage", "proportion",
    "비율", "전환율", "퍼센트", "점유율",
  ];
  if (ratioKeywords.some((kw) => q.includes(kw))) {
    score += 1;
    reasons.push("ratio calculation involved");
  }

  let level: "simple" | "medium" | "complex";
  if (score <= 2) {
    level = "simple";
  } else if (score <= 5) {
    level = "medium";
  } else {
    level = "complex";
  }

  if (level === "simple" && hints.length === 0) {
    hints.push("Straightforward query. Focus on correct column names and filter values.");
  }
  if (level === "medium" && hints.length === 0) {
    hints.push("Moderate complexity. Double-check JOIN conditions and GROUP BY columns.");
  }
  if (level === "complex" && hints.length === 0) {
    hints.push("Complex query. Consider breaking into CTEs for clarity and correctness.");
  }

  return {
    level,
    reasoning: reasons.length > 0 ? reasons.join("; ") : "single table with basic filtering",
    hints,
  };
}
