import { readFile, writeFile } from "node:fs/promises";
import { ensureConfigDir, getConfigDir } from "./config.js";
import path from "node:path";

const DEFAULT_KEYWORD_MAP: Record<string, string[]> = {};

function getMapPath(dataSourceId: number): string {
  return path.join(getConfigDir(), "keyword-map", `${dataSourceId}.json`);
}

export async function loadKeywordMap(dataSourceId: number): Promise<Record<string, string[]>> {
  try {
    const raw = await readFile(getMapPath(dataSourceId), "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.mappings ?? {};
  } catch {
    return {};
  }
}

async function saveKeywordMap(dataSourceId: number, mappings: Record<string, string[]>): Promise<void> {
  await ensureConfigDir();
  const data = {
    dataSourceId,
    mappings,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(getMapPath(dataSourceId), JSON.stringify(data, null, 2), "utf-8");
}

export async function addMappings(
  dataSourceId: number,
  newMappings: Record<string, string[]>,
): Promise<Record<string, string[]>> {
  const existing = await loadKeywordMap(dataSourceId);
  for (const [key, values] of Object.entries(newMappings)) {
    const existingValues = existing[key] ?? [];
    existing[key] = [...new Set([...existingValues, ...values])];
  }
  await saveKeywordMap(dataSourceId, existing);
  return existing;
}

export async function removeMappings(
  dataSourceId: number,
  keywords: string[],
): Promise<Record<string, string[]>> {
  const existing = await loadKeywordMap(dataSourceId);
  for (const key of keywords) {
    delete existing[key];
  }
  await saveKeywordMap(dataSourceId, existing);
  return existing;
}

export async function resetMappings(dataSourceId: number): Promise<void> {
  await saveKeywordMap(dataSourceId, {});
}

export async function getEffectiveMap(dataSourceId: number): Promise<Record<string, string[]>> {
  const custom = await loadKeywordMap(dataSourceId);
  const merged: Record<string, string[]> = { ...DEFAULT_KEYWORD_MAP };
  for (const [key, values] of Object.entries(custom)) {
    const existing = merged[key] ?? [];
    merged[key] = [...new Set([...existing, ...values])];
  }
  return merged;
}

export { DEFAULT_KEYWORD_MAP };
