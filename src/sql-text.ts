/**
 * Literal-aware SQL text helpers shared by the safety guard and the result cache.
 * A single scanner splits SQL into code and string-literal segments so that
 * comment stripping and case folding never touch literal contents.
 */

interface Segment {
  text: string;
  literal: boolean;
}

function segmentSql(sql: string): Segment[] {
  const segments: Segment[] = [];
  let code = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      code += " ";
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      code += " ";
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      segments.push({ text: code, literal: false });
      code = "";
      let lit = ch;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) {
            lit += ch + ch;
            j += 2;
            continue;
          }
          lit += ch;
          j += 1;
          break;
        }
        lit += sql[j];
        j += 1;
      }
      segments.push({ text: lit, literal: true });
      i = j;
      continue;
    }
    code += ch;
    i += 1;
  }
  if (code) segments.push({ text: code, literal: false });
  return segments;
}

/** Removes comments while leaving string literals (and everything else) intact. */
export function stripSqlComments(sql: string): string {
  return segmentSql(sql)
    .map((s) => s.text)
    .join("");
}

/**
 * Normalized form for keyword analysis: comments removed, literal contents
 * blanked (so data values can never match SQL keywords or PII patterns),
 * whitespace collapsed, uppercased.
 */
export function normalizeForAnalysis(sql: string): string {
  return segmentSql(sql)
    .map((s) => (s.literal ? "'?'" : s.text))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Normalized form for cache keys: comments removed and code case-folded,
 * but literal contents preserved verbatim so queries that differ only in
 * their data values never share a key.
 */
export function normalizeCacheKey(sql: string): string {
  return segmentSql(sql)
    .map((s) => (s.literal ? s.text : s.text.replace(/\s+/g, " ").toLowerCase()))
    .join("")
    .trim();
}
