import { createHash } from "crypto";

interface CacheEntry {
  result: any;
  ts: number;
  size: number;
}

const cache = new Map<string, CacheEntry>();
let totalSizeBytes = 0;

function getCacheTtlMs(): number {
  const ttl = parseInt(process.env.REDASH_MCP_CACHE_TTL ?? "300", 10);
  return (isNaN(ttl) ? 300 : ttl) * 1000;
}

function getMaxSizeBytes(): number {
  const mb = parseInt(process.env.REDASH_MCP_CACHE_MAX_MB ?? "50", 10);
  return (isNaN(mb) ? 50 : mb) * 1024 * 1024;
}

function normalizeSQL(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function makeCacheKey(dataSourceId: number, sql: string): string {
  return createHash("sha256")
    .update(`${dataSourceId}:${normalizeSQL(sql)}`)
    .digest("hex");
}

function roughSize(obj: any): number {
  return JSON.stringify(obj).length * 2;
}

export function getCached(dataSourceId: number, sql: string): any | null {
  const ttl = getCacheTtlMs();
  if (ttl === 0) return null;

  const key = makeCacheKey(dataSourceId, sql);
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.ts > ttl) {
    totalSizeBytes -= entry.size;
    cache.delete(key);
    return null;
  }

  return entry.result;
}

export function setCached(dataSourceId: number, sql: string, result: any): void {
  const ttl = getCacheTtlMs();
  if (ttl === 0) return;

  const maxSize = getMaxSizeBytes();
  const size = roughSize(result);

  if (size > maxSize * 0.2) return;

  while (totalSizeBytes + size > maxSize && cache.size > 0) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    const old = cache.get(oldestKey)!;
    totalSizeBytes -= old.size;
    cache.delete(oldestKey);
  }

  const key = makeCacheKey(dataSourceId, sql);
  const existing = cache.get(key);
  if (existing) totalSizeBytes -= existing.size;

  cache.set(key, { result, ts: Date.now(), size });
  totalSizeBytes += size;
}

export function getCacheStats(): { entries: number; sizeMb: string; ttlSecs: number } {
  return {
    entries: cache.size,
    sizeMb: (totalSizeBytes / 1024 / 1024).toFixed(2),
    ttlSecs: getCacheTtlMs() / 1000,
  };
}
