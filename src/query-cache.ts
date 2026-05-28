import { createHash } from "crypto";

interface CacheEntry {
  result: any;
  ts: number;
  size: number;
}

const cache = new Map<string, CacheEntry>();
let totalSizeBytes = 0;

const MAX_CACHE_TTL_SECS = 86400;
const MAX_CACHE_SIZE_MB = 1024;

function getCacheTtlMs(): number {
  const ttl = parseInt(process.env.REDASH_MCP_CACHE_TTL ?? "300", 10);
  if (!Number.isFinite(ttl) || ttl < 0) return 300 * 1000;
  return Math.min(ttl, MAX_CACHE_TTL_SECS) * 1000;
}

function getMaxSizeBytes(): number {
  const mb = parseInt(process.env.REDASH_MCP_CACHE_MAX_MB ?? "50", 10);
  if (!Number.isFinite(mb) || mb <= 0) return 50 * 1024 * 1024;
  return Math.min(mb, MAX_CACHE_SIZE_MB) * 1024 * 1024;
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

function purgeExpired(ttl: number): void {
  if (ttl === 0) return;
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.ts > ttl) {
      totalSizeBytes -= entry.size;
      cache.delete(key);
    }
  }
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

  // Touch entry to maintain LRU order via insertion-order Map semantics.
  cache.delete(key);
  cache.set(key, entry);
  return entry.result;
}

export function setCached(dataSourceId: number, sql: string, result: any): void {
  const ttl = getCacheTtlMs();
  if (ttl === 0) return;

  const maxSize = getMaxSizeBytes();
  const size = roughSize(result);

  if (size > maxSize * 0.2) return;

  purgeExpired(ttl);

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
