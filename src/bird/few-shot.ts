import { readFile, writeFile } from "node:fs/promises";
import { ensureConfigDir, getDataSourcePath } from "./config.js";
import { tokenize } from "./tokenize.js";
import type { FewShotExample } from "./types.js";

export async function loadExamples(dataSourceId: number): Promise<FewShotExample[]> {
  try {
    const raw = await readFile(getDataSourcePath("few-shot", dataSourceId), "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.examples ?? [];
  } catch {
    return [];
  }
}

export async function saveExamples(dataSourceId: number, examples: FewShotExample[]): Promise<void> {
  await ensureConfigDir();
  const data = { dataSourceId, examples };
  await writeFile(getDataSourcePath("few-shot", dataSourceId), JSON.stringify(data, null, 2), "utf-8");
}

export async function addExample(dataSourceId: number, example: Omit<FewShotExample, "id" | "createdAt">): Promise<FewShotExample> {
  const examples = await loadExamples(dataSourceId);
  const newExample: FewShotExample = {
    ...example,
    id: `ex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  examples.push(newExample);
  await saveExamples(dataSourceId, examples);
  return newExample;
}

export async function removeExample(dataSourceId: number, exampleId: string): Promise<boolean> {
  const examples = await loadExamples(dataSourceId);
  const filtered = examples.filter((e) => e.id !== exampleId);
  if (filtered.length === examples.length) return false;
  await saveExamples(dataSourceId, filtered);
  return true;
}

export function findRelevantExamples(
  question: string,
  prunedTableNames: string[],
  allExamples: FewShotExample[],
  maxCount: number,
): FewShotExample[] {
  if (allExamples.length === 0) return [];

  const questionTokens = tokenize(question);

  const scored = allExamples.map((example) => {
    let score = 0;

    const tableOverlap = example.tables.filter((t) =>
      prunedTableNames.some((pt) => pt.toLowerCase() === t.toLowerCase()),
    ).length;
    score += tableOverlap * 3;

    const exampleTokens = new Set(tokenize(`${example.question} ${example.tags.join(" ")}`));
    const keywordOverlap = questionTokens.filter((t) => exampleTokens.has(t)).length;
    score += keywordOverlap;

    return { example, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCount)
    .map((s) => s.example);
}

export function formatExamplesForPrompt(examples: FewShotExample[]): string {
  if (examples.length === 0) return "";

  const lines = ["## Similar query examples:\n"];
  examples.forEach((ex, i) => {
    lines.push(`### Example ${i + 1}: "${ex.question}"`);
    lines.push("```sql");
    lines.push(ex.sql);
    lines.push("```");
    if (ex.notes) {
      lines.push(`> Note: ${ex.notes}`);
    }
    lines.push("");
  });
  return lines.join("\n");
}

