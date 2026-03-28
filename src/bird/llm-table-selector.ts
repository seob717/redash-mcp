import Anthropic from "@anthropic-ai/sdk";
import type { SchemaTable } from "./schema-pruning.js";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  client = new Anthropic({ apiKey });
  return client;
}

export function isLLMAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Uses Claude Haiku to select relevant tables from a list based on a natural language question.
 * Returns table names that are likely relevant to the question.
 */
export async function selectTablesWithLLM(
  question: string,
  fullSchema: SchemaTable[],
  topK: number,
): Promise<string[]> {
  const anthropic = getClient();
  if (!anthropic) return [];

  try {
    const tableList = fullSchema
      .map((t) => {
        const cols = (t.columns ?? []).map((c) => c.name).join(", ");
        return `- ${t.name} (${cols})`;
      })
      .join("\n");

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Given this database schema, select the ${topK} most relevant tables for the question.

Question: ${question}

Tables:
${tableList}

Reply with ONLY a JSON array of table names, e.g. ["User", "Order"]. No explanation.`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\[.*\]/s);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((name: unknown): name is string =>
      typeof name === "string" && fullSchema.some((t) => t.name === name),
    );
  } catch {
    return [];
  }
}
