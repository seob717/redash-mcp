import { readFile, writeFile } from "node:fs/promises";
import { ensureConfigDir, getDataSourcePath } from "./config.js";
import { executeSql } from "../redash-client.js";
import { analyzeQuery } from "../sql-guard.js";
import type { EvalTestCase, EvalRun, EvalRunResult } from "./types.js";

interface EvalStore {
  dataSourceId: number;
  testCases: EvalTestCase[];
  runs: EvalRun[];
}

export async function loadTestSuite(dataSourceId: number): Promise<EvalStore> {
  try {
    const raw = await readFile(getDataSourcePath("eval", dataSourceId), "utf-8");
    return JSON.parse(raw);
  } catch {
    return { dataSourceId, testCases: [], runs: [] };
  }
}

async function saveTestSuite(dataSourceId: number, store: EvalStore): Promise<void> {
  await ensureConfigDir();
  await writeFile(getDataSourcePath("eval", dataSourceId), JSON.stringify(store, null, 2), "utf-8");
}

export async function addTestCase(
  dataSourceId: number,
  testCase: Omit<EvalTestCase, "id">,
): Promise<EvalTestCase> {
  const store = await loadTestSuite(dataSourceId);
  const newCase: EvalTestCase = {
    ...testCase,
    id: `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  };
  store.testCases.push(newCase);
  await saveTestSuite(dataSourceId, store);
  return newCase;
}

export async function removeTestCase(dataSourceId: number, testCaseId: string): Promise<boolean> {
  const store = await loadTestSuite(dataSourceId);
  const filtered = store.testCases.filter((tc) => tc.id !== testCaseId);
  if (filtered.length === store.testCases.length) return false;
  store.testCases = filtered;
  await saveTestSuite(dataSourceId, store);
  return true;
}

export async function runEvaluation(
  dataSourceId: number,
  generatedSqls: Array<{ testCaseId: string; generatedSql: string }>,
  timeoutSecs = 30,
): Promise<EvalRun> {
  const store = await loadTestSuite(dataSourceId);
  const results: EvalRunResult[] = [];

  for (const { testCaseId, generatedSql } of generatedSqls) {
    const testCase = store.testCases.find((tc) => tc.id === testCaseId);
    if (!testCase) {
      results.push({
        testCaseId,
        generatedSql,
        match: false,
        details: "Test case not found",
      });
      continue;
    }

    try {
      const match = await compareQueryResults(dataSourceId, testCase.groundTruthSql, generatedSql, timeoutSecs);
      results.push({
        testCaseId,
        generatedSql,
        match: match.isMatch,
        details: match.details,
      });
    } catch (err: any) {
      results.push({
        testCaseId,
        generatedSql,
        match: false,
        details: `Execution error: ${err.message}`,
      });
    }
  }

  const matchCount = results.filter((r) => r.match).length;
  const total = results.length;

  const byDifficulty = (level: string) => {
    const relevant = generatedSqls
      .map((gs) => ({
        ...gs,
        testCase: store.testCases.find((tc) => tc.id === gs.testCaseId),
      }))
      .filter((gs) => gs.testCase?.difficulty === level);
    // null = no test cases at this level, distinct from 0% accuracy.
    if (relevant.length === 0) return null;
    const matches = relevant.filter((gs) =>
      results.find((r) => r.testCaseId === gs.testCaseId)?.match,
    ).length;
    return matches / relevant.length;
  };

  const run: EvalRun = {
    runId: `run_${Date.now()}`,
    timestamp: new Date().toISOString(),
    results,
    accuracy: {
      overall: total > 0 ? matchCount / total : 0,
      simple: byDifficulty("simple"),
      medium: byDifficulty("medium"),
      complex: byDifficulty("complex"),
    },
  };

  store.runs.push(run);
  if (store.runs.length > 10) {
    store.runs = store.runs.slice(-10);
  }
  await saveTestSuite(dataSourceId, store);

  return run;
}

async function compareQueryResults(
  dataSourceId: number,
  groundTruthSql: string,
  generatedSql: string,
  timeoutSecs: number,
): Promise<{ isMatch: boolean; details: string }> {
  const [gtResult, genResult] = await Promise.all([
    executeGuarded(dataSourceId, groundTruthSql, timeoutSecs),
    executeGuarded(dataSourceId, generatedSql, timeoutSecs),
  ]);

  return compareResults(gtResult, genResult);
}

export function compareResults(
  gtResult: { columns: string[]; rows: any[] },
  genResult: { columns: string[]; rows: any[] },
): { isMatch: boolean; details: string } {
  const gtCols = new Set(gtResult.columns);
  const genCols = new Set(genResult.columns);
  if (gtCols.size !== genCols.size || ![...gtCols].every((c) => genCols.has(c))) {
    return {
      isMatch: false,
      details: `Column mismatch: expected [${[...gtCols].join(", ")}], got [${[...genCols].join(", ")}]`,
    };
  }

  if (gtResult.rows.length !== genResult.rows.length) {
    return {
      isMatch: false,
      details: `Row count mismatch: expected ${gtResult.rows.length}, got ${genResult.rows.length}`,
    };
  }

  // Serialize both sides in the ground-truth column order so a different
  // SELECT order is not scored as a data mismatch.
  const gtSorted = sortRows(gtResult.rows, gtResult.columns);
  const genSorted = sortRows(genResult.rows, gtResult.columns);

  for (let i = 0; i < gtSorted.length; i++) {
    if (gtSorted[i] !== genSorted[i]) {
      return {
        isMatch: false,
        details: `Data mismatch at row ${i + 1}`,
      };
    }
  }

  return { isMatch: true, details: "Exact match" };
}

// Evaluation runs raw SQL from test cases, so it goes through the same
// safety guard as run_query (block only — no query rewriting, since results
// must be compared exactly).
async function executeGuarded(
  dataSourceId: number,
  sql: string,
  timeoutSecs: number,
): Promise<{ columns: string[]; rows: any[] }> {
  const guard = analyzeQuery(sql);
  if (guard.blocked) {
    throw new Error(`Blocked by SQL safety guard: ${guard.message.replace(/\s+/g, " ").trim()}`);
  }
  return executeSql(dataSourceId, sql, { maxAge: 0, timeoutSecs });
}

function sortRows(rows: any[], columns: string[]): string[] {
  return rows
    .map((row) => columns.map((c) => String(row[c] ?? "")).join("|"))
    .sort();
}

export function formatEvalResults(run: EvalRun): string {
  const pct = (v: number | null) =>
    v === null ? "N/A (no test cases)" : `${(v * 100).toFixed(1)}%`;
  const lines = [
    `## Evaluation Results (${run.timestamp})`,
    "",
    `**Overall Accuracy**: ${(run.accuracy.overall * 100).toFixed(1)}% (${run.results.filter((r) => r.match).length}/${run.results.length})`,
    `- Simple: ${pct(run.accuracy.simple)}`,
    `- Medium: ${pct(run.accuracy.medium)}`,
    `- Complex: ${pct(run.accuracy.complex)}`,
    "",
  ];

  const failures = run.results.filter((r) => !r.match);
  if (failures.length > 0) {
    lines.push("### Failed Cases:");
    for (const f of failures) {
      lines.push(`- **${f.testCaseId}**: ${f.details}`);
    }
  }

  return lines.join("\n");
}
