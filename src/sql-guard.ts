export type SafetyMode = "off" | "warn" | "strict";

export interface SafetyResult {
  blocked: boolean;
  warnings: string[];
  message: string;
  modifiedQuery?: string;
}

interface GuardConfig {
  mode: SafetyMode;
  disablePii: boolean;
  disableCost: boolean;
  autoLimit: number;
}

function getConfig(): GuardConfig {
  const raw = process.env.REDASH_SAFETY_MODE ?? "warn";
  const mode: SafetyMode = ["off", "warn", "strict"].includes(raw) ? (raw as SafetyMode) : "warn";
  return {
    mode,
    disablePii: process.env.REDASH_SAFETY_DISABLE_PII === "true",
    disableCost: process.env.REDASH_SAFETY_DISABLE_COST === "true",
    autoLimit: parseInt(process.env.REDASH_AUTO_LIMIT ?? "0", 10) || 0,
  };
}

function normalizeForAnalysis(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function hasWhere(sql: string): boolean {
  return /\bWHERE\b/.test(sql);
}

function hasLimit(sql: string): boolean {
  return /\bLIMIT\b/.test(sql);
}

function isSelect(sql: string): boolean {
  return /^\s*(SELECT|WITH)\b/i.test(sql);
}

function injectLimit(sql: string, limit: number): string {
  if (/\bLIMIT\b/i.test(sql)) return sql;
  if (!isSelect(sql)) return sql;
  return `${sql.trimEnd()} LIMIT ${limit}`;
}

export function analyzeQuery(sql: string): SafetyResult {
  const config = getConfig();

  if (config.mode === "off") {
    return { blocked: false, warnings: [], message: "" };
  }

  const upper = normalizeForAnalysis(sql);
  const warnings: string[] = [];
  let modifiedQuery: string | undefined;

  if (/\bDROP\s+(TABLE|DATABASE|SCHEMA|VIEW|INDEX|FUNCTION)\b/.test(upper)) {
    return {
      blocked: true,
      warnings: [],
      message:
        "🚫 Query blocked.\n\nReason: DROP statements permanently delete data/schema.\nRule: DESTRUCTIVE / DROP\n\nSet REDASH_SAFETY_MODE=off to disable this check.",
    };
  }

  if (/\bTRUNCATE\b/.test(upper)) {
    return {
      blocked: true,
      warnings: [],
      message:
        "🚫 Query blocked.\n\nReason: TRUNCATE deletes all data from the table.\nRule: DESTRUCTIVE / TRUNCATE",
    };
  }

  if (/\bALTER\s+TABLE\b/.test(upper)) {
    return {
      blocked: true,
      warnings: [],
      message:
        "🚫 Query blocked.\n\nReason: ALTER TABLE modifies schema and requires prior coordination.\nRule: DESTRUCTIVE / ALTER_TABLE",
    };
  }

  if (/\b(GRANT|REVOKE)\b/.test(upper)) {
    return {
      blocked: true,
      warnings: [],
      message:
        "🚫 Query blocked.\n\nReason: GRANT/REVOKE permission changes are not allowed.\nRule: DESTRUCTIVE / PRIVILEGE_CHANGE",
    };
  }

  if (/\bDELETE\s+FROM\b/.test(upper) && !hasWhere(upper)) {
    return {
      blocked: true,
      warnings: [],
      message:
        "🚫 Query blocked.\n\nReason: DELETE without WHERE clause will delete all rows.\nRule: DESTRUCTIVE / DELETE_WITHOUT_WHERE\n\nSafe example:\n  DELETE FROM orders WHERE created_at < '2024-01-01'",
    };
  }

  if (/\bUPDATE\b/.test(upper) && /\bSET\b/.test(upper) && !hasWhere(upper)) {
    return {
      blocked: true,
      warnings: [],
      message:
        "🚫 Query blocked.\n\nReason: UPDATE without WHERE clause will modify all rows.\nRule: DESTRUCTIVE / UPDATE_WITHOUT_WHERE\n\nSafe example:\n  UPDATE orders SET status = 'cancelled' WHERE created_at < '2024-01-01'",
    };
  }

  if (/\bDELETE\s+FROM\b/.test(upper)) {
    warnings.push("[DESTRUCTIVE] DELETE query detected. Please verify the WHERE clause.");
  }
  if (/\bUPDATE\b/.test(upper) && /\bSET\b/.test(upper)) {
    warnings.push("[DESTRUCTIVE] UPDATE query detected. Please verify the WHERE clause.");
  }

  if (!config.disableCost && isSelect(sql)) {
    const hasSelectStar = /SELECT\s+\*/.test(upper) || /SELECT\s+[\w.]+\.\*/.test(upper);
    const noWhere = !hasWhere(upper);
    const noLimit = !hasLimit(upper);

    if (hasSelectStar) {
      warnings.push(
        "[COST] SELECT * detected. Specify only needed columns to reduce scan costs."
      );
    }
    if (noWhere) {
      warnings.push(
        "[COST] No WHERE clause. Consider adding date or condition filters."
      );
    }
    if (noLimit) {
      if (config.autoLimit > 0) {
        modifiedQuery = injectLimit(sql, config.autoLimit);
        warnings.push(
          `[COST] No LIMIT clause — auto-appended LIMIT ${config.autoLimit}. Specify an explicit LIMIT if you need all rows.`
        );
      } else {
        warnings.push(
          "[COST] No LIMIT clause. Full table scans on large tables may incur significant costs."
        );
      }
    }

    if (config.mode === "strict") {
      const costWarnings = warnings.filter((w) => w.startsWith("[COST]"));
      if (costWarnings.length > 0) {
        return {
          blocked: true,
          warnings: [],
          message: `🚫 Query blocked (strict mode).\n\n${costWarnings.join("\n")}\n\nSet REDASH_SAFETY_MODE=warn to allow with warnings.`,
        };
      }
    }
  }

  if (!config.disablePii) {
    const piiPatterns = [
      "EMAIL",
      "PHONE",
      "PASSWORD",
      "PASSWD",
      "SSN",
      "SOCIAL_SECURITY",
      "CREDIT_CARD",
      "CARD_NUMBER",
    ];
    const matched = piiPatterns.filter((k) => upper.includes(k));
    if (matched.length > 0) {
      warnings.push(
        `[PII] Sensitive data columns detected: ${matched.join(", ")}. Please verify your data privacy compliance.`
      );
    }

    if (config.mode === "strict") {
      const piiWarnings = warnings.filter((w) => w.startsWith("[PII]"));
      if (piiWarnings.length > 0) {
        return {
          blocked: true,
          warnings: [],
          message: `🚫 Query blocked (strict mode).\n\n${piiWarnings.join("\n")}\n\nSet REDASH_SAFETY_MODE=warn to allow with warnings.`,
        };
      }
    }
  }

  const message =
    warnings.length > 0
      ? `⚠️ Safety warnings (query will still execute)\n\n${warnings.join("\n")}\n\n---`
      : "";

  return { blocked: false, warnings, message, modifiedQuery };
}
