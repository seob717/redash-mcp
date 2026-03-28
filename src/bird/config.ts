import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { BirdConfig } from "./types.js";

const DEFAULT_CONFIG: BirdConfig = {
  bird: {
    enabled: true,
    schemaPruning: {
      enabled: true,
      topK: 7,
      includeSampleValues: true,
      maxSampleValues: 5,
    },
    fewShot: {
      enabled: true,
      maxExamplesPerQuery: 3,
    },
    feedback: {
      enabled: true,
      autoPromoteThreshold: 3,
    },
    complexity: {
      enabled: true,
    },
  },
};

export function getConfigDir(): string {
  return process.env.REDASH_MCP_CONFIG_DIR || path.join(os.homedir(), ".redash-mcp");
}

export async function ensureConfigDir(): Promise<void> {
  const dir = getConfigDir();
  for (const sub of ["", "few-shot", "feedback", "eval", "keyword-map"]) {
    const p = path.join(dir, sub);
    if (!existsSync(p)) {
      await mkdir(p, { recursive: true });
    }
  }
}

export function getDataSourcePath(subdir: string, dataSourceId: number): string {
  return path.join(getConfigDir(), subdir, `${dataSourceId}.json`);
}

export async function loadConfig(): Promise<BirdConfig> {
  const configPath = path.join(getConfigDir(), "config.json");
  try {
    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return deepMerge(DEFAULT_CONFIG, parsed) as BirdConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: BirdConfig): Promise<void> {
  await ensureConfigDir();
  const configPath = path.join(getConfigDir(), "config.json");
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object"
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
