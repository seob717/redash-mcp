import { normalizeForAnalysis, stripSqlComments } from "./sql-text.js";

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

const MAX_AUTO_LIMIT = 1000000;

function getConfig(): GuardConfig {
  const raw = process.env.REDASH_SAFETY_MODE ?? "warn";
  const mode: SafetyMode = ["off", "warn", "strict"].includes(raw) ? (raw as SafetyMode) : "warn";
  const parsedLimit = parseInt(process.env.REDASH_AUTO_LIMIT ?? "0", 10);
  const autoLimit = !Number.isFinite(parsedLimit) || parsedLimit <= 0
    ? 0
    : Math.min(parsedLimit, MAX_AUTO_LIMIT);
  return {
    mode,
    disablePii: process.env.REDASH_SAFETY_DISABLE_PII === "true",
    disableCost: process.env.REDASH_SAFETY_DISABLE_COST === "true",
    autoLimit,
  };
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

// LIMIT goes on its own line so a trailing `-- comment` cannot swallow it.
function injectLimit(sql: string, limit: number): string {
  const base = sql.trimEnd().replace(/;+\s*$/, "");
  return `${base}\nLIMIT ${limit}`;
}

const OFF_HINT = "\n\nSet REDASH_SAFETY_MODE=off to disable this check.";

interface BlockRule {
  rule: string;
  matches: (upper: string) => boolean;
  reason: string;
  example?: string;
}

const BLOCK_RULES: BlockRule[] = [
  {
    rule: "DESTRUCTIVE / DROP",
    matches: (u) => /\bDROP\s+(TABLE|DATABASE|SCHEMA|VIEW|INDEX|FUNCTION)\b/.test(u),
    reason: "DROP statements permanently delete data/schema.",
  },
  {
    rule: "DESTRUCTIVE / TRUNCATE",
    matches: (u) => /\bTRUNCATE\b/.test(u),
    reason: "TRUNCATE deletes all data from the table.",
  },
  {
    rule: "DESTRUCTIVE / ALTER_TABLE",
    matches: (u) => /\bALTER\s+TABLE\b/.test(u),
    reason: "ALTER TABLE modifies schema and requires prior coordination.",
  },
  {
    rule: "DESTRUCTIVE / PRIVILEGE_CHANGE",
    matches: (u) => /\b(GRANT|REVOKE)\b/.test(u),
    reason: "GRANT/REVOKE permission changes are not allowed.",
  },
  {
    rule: "DESTRUCTIVE / DELETE_WITHOUT_WHERE",
    matches: (u) => /\bDELETE\s+FROM\b/.test(u) && !hasWhere(u),
    reason: "DELETE without WHERE clause will delete all rows.",
    example: "DELETE FROM orders WHERE created_at < '2024-01-01'",
  },
  {
    rule: "DESTRUCTIVE / UPDATE_WITHOUT_WHERE",
    matches: (u) => /\bUPDATE\b/.test(u) && /\bSET\b/.test(u) && !hasWhere(u),
    reason: "UPDATE without WHERE clause will modify all rows.",
    example: "UPDATE orders SET status = 'cancelled' WHERE created_at < '2024-01-01'",
  },
];

export function analyzeQuery(sql: string): SafetyResult {
  const config = getConfig();

  if (config.mode === "off") {
    return { blocked: false, warnings: [], message: "" };
  }

  const upper = normalizeForAnalysis(sql);
  const warnings: string[] = [];
  let modifiedQuery: string | undefined;

  for (const rule of BLOCK_RULES) {
    if (rule.matches(upper)) {
      const example = rule.example ? `\n\nSafe example:\n  ${rule.example}` : "";
      return {
        blocked: true,
        warnings: [],
        message: `🚫 Query blocked.\n\nReason: ${rule.reason}\nRule: ${rule.rule}${example}${OFF_HINT}`,
      };
    }
  }

  if (/\bDELETE\s+FROM\b/.test(upper)) {
    warnings.push("[DESTRUCTIVE] DELETE query detected. Please verify the WHERE clause.");
  }
  if (/\bUPDATE\b/.test(upper) && /\bSET\b/.test(upper)) {
    warnings.push("[DESTRUCTIVE] UPDATE query detected. Please verify the WHERE clause.");
  }

  if (!config.disableCost && isSelect(stripSqlComments(sql))) {
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
