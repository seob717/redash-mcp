import { readFile, writeFile } from "node:fs/promises";
import { ensureConfigDir, getDataSourcePath } from "./config.js";
import { redashFetch } from "../redash-client.js";
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
      const match = await compareQueryResults(dataSourceId, testCase.groundTruthSql, generatedSql);
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
    if (relevant.length === 0) return 0;
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
): Promise<{ isMatch: boolean; details: string }> {
  const [gtResult, genResult] = await Promise.all([
    executeQuery(dataSourceId, groundTruthSql),
    executeQuery(dataSourceId, generatedSql),
  ]);

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

  const gtSorted = sortRows(gtResult.rows, gtResult.columns);
  const genSorted = sortRows(genResult.rows, genResult.columns);

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

async function executeQuery(
  dataSourceId: number,
  sql: string,
): Promise<{ columns: string[]; rows: any[] }> {
  const res = await redashFetch("/query_results", {
    method: "POST",
    body: JSON.stringify({ data_source_id: dataSourceId, query: sql, max_age: 0 }),
  });

  let result;
  if (res.job) {
    for (let i = 0; i < 30; i++) {
      const job = await redashFetch(`/jobs/${res.job.id}`);
      if (job.job.status === 3) {
        result = await redashFetch(`/query_results/${job.job.query_result_id}`);
        break;
      }
      if (job.job.status === 4) {
        throw new Error(`Query failed: ${job.job.error}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!result) throw new Error("Query timed out");
  } else {
    result = res;
  }

  const qr = result.query_result;
  return {
    columns: qr.data.columns.map((c: any) => c.name),
    rows: qr.data.rows,
  };
}

function sortRows(rows: any[], columns: string[]): string[] {
  return rows
    .map((row) => columns.map((c) => String(row[c] ?? "")).join("|"))
    .sort();
}

export function formatEvalResults(run: EvalRun): string {
  const lines = [
    `## Evaluation Results (${run.timestamp})`,
    "",
    `**Overall Accuracy**: ${(run.accuracy.overall * 100).toFixed(1)}% (${run.results.filter((r) => r.match).length}/${run.results.length})`,
    `- Simple: ${(run.accuracy.simple * 100).toFixed(1)}%`,
    `- Medium: ${(run.accuracy.medium * 100).toFixed(1)}%`,
    `- Complex: ${(run.accuracy.complex * 100).toFixed(1)}%`,
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
