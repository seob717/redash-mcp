import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { handleSmartQuery } from "./smart-query.js";
import { loadExamples, addExample, removeExample } from "./few-shot.js";
import { recordFeedback, loadFeedback } from "./feedback.js";
import { loadTestSuite, addTestCase, removeTestCase, runEvaluation, formatEvalResults } from "./evaluation.js";
import { loadConfig, getConfigDir } from "./config.js";
import { getEffectiveMap, addMappings, removeMappings, resetMappings, loadKeywordMap, DEFAULT_KEYWORD_MAP } from "./keyword-map.js";

export function registerBirdTools(server: McpServer): void {
  const enabled = process.env.REDASH_BIRD_ENABLED === "true";
  if (!enabled) return;

  server.tool(
    "smart_query",
    "BIRD SQL-based intelligent query tool. Analyzes natural-language questions to (1) extract relevant schema, (2) match similar few-shot examples, (3) assess complexity, (4) request clarification for ambiguous questions. Call this tool before run_query. For a new data source, first inspect the schema with list_tables, then register keyword-to-table mappings via manage_keyword_map to significantly improve accuracy.",
    {
      data_source_id: z.number().describe("Data source ID (from list_data_sources)"),
      question: z.string().describe("Natural-language question (e.g., 'How many payments were completed last month?')"),
      context: z.string().optional().describe("User's answer to a previous clarification question (for multi-turn)"),
    },
    async ({ data_source_id, question, context }) => {
      const result = await handleSmartQuery({ question, data_source_id, context });

      if (result.action === "clarify") {
        const text = [
          "## Clarification needed\n",
          "Before generating SQL, I need more information:\n",
          ...(result.clarificationQuestions?.map((q, i) => `${i + 1}. ${q}`) ?? []),
          "\nPlease provide answers, then call smart_query again with the `context` parameter containing your answers.",
        ].join("\n");
        return { content: [{ type: "text", text }] };
      }

      if (result.action === "explain") {
        return {
          content: [{ type: "text", text: result.explanation ?? "Cannot generate SQL for this question." }],
        };
      }

      const parts: string[] = [];

      if (result.schema) {
        parts.push(result.schema);
      }

      if (result.fewShotExamples) {
        parts.push(result.fewShotExamples);
      }

      if (result.complexity) {
        parts.push(`## Complexity: ${result.complexity.level}\n`);
      }

      if (result.guidance) {
        parts.push(`## Guidance\n${result.guidance}`);
      }

      parts.push("\n---\nUse the schema and examples above to generate SQL, then execute with `run_query`.");

      return { content: [{ type: "text", text: parts.join("\n") }] };
    },
  );

  server.tool(
    "manage_few_shot_examples",
    "Manage few-shot examples (list/add/remove). Register domain-specific examples to improve SQL accuracy.",
    {
      data_source_id: z.number().describe("Data source ID"),
      action: z.enum(["list", "add", "remove"]).describe("Action to perform"),
      example: z
        .object({
          question: z.string().describe("Natural-language question"),
          sql: z.string().describe("Correct SQL"),
          tables: z.array(z.string()).describe("List of table names used"),
          tags: z.array(z.string()).optional().describe("Tags (e.g., payments, date-filter)"),
          notes: z.string().optional().describe("Domain knowledge notes (e.g., payment status values are paid, pending...)"),
        })
        .optional()
        .describe("Example to add (required when action=add)"),
      example_id: z.string().optional().describe("Example ID to remove (required when action=remove)"),
    },
    async ({ data_source_id, action, example, example_id }) => {
      if (action === "list") {
        const examples = await loadExamples(data_source_id);
        if (examples.length === 0) {
          return { content: [{ type: "text", text: "No few-shot examples registered." }] };
        }
        const text = examples
          .map(
            (e) =>
              `**[${e.id}]** ${e.question}\n\`\`\`sql\n${e.sql}\n\`\`\`\nTables: ${e.tables.join(", ")} | Tags: ${e.tags.join(", ")} | Source: ${e.source}`,
          )
          .join("\n\n---\n\n");
        return { content: [{ type: "text", text: `Total ${examples.length} example(s):\n\n${text}` }] };
      }

      if (action === "add") {
        if (!example) {
          return { content: [{ type: "text", text: "The example parameter is required." }] };
        }
        const added = await addExample(data_source_id, {
          question: example.question,
          sql: example.sql,
          tables: example.tables,
          tags: example.tags ?? [],
          notes: example.notes ?? "",
          source: "manual",
        });
        return {
          content: [{ type: "text", text: `Few-shot example added. (ID: ${added.id})` }],
        };
      }

      if (action === "remove") {
        if (!example_id) {
          return { content: [{ type: "text", text: "The example_id parameter is required." }] };
        }
        const removed = await removeExample(data_source_id, example_id);
        return {
          content: [
            {
              type: "text",
              text: removed ? `Example ${example_id} has been removed.` : `Example ${example_id} not found.`,
            },
          ],
        };
      }

      return { content: [{ type: "text", text: "Invalid action" }] };
    },
  );

  server.tool(
    "submit_query_feedback",
    "Submit feedback on generated SQL. Incorrect SQL is automatically classified and may be promoted to a few-shot example.",
    {
      data_source_id: z.number().describe("Data source ID"),
      question: z.string().describe("Original natural-language question"),
      generated_sql: z.string().describe("Generated SQL"),
      correct_sql: z.string().optional().describe("Correct SQL (provide when rating=down for automatic learning)"),
      rating: z.enum(["up", "down"]).describe("Rating: up (correct) or down (incorrect)"),
    },
    async ({ data_source_id, question, generated_sql, correct_sql, rating }) => {
      const entry = await recordFeedback(data_source_id, {
        question,
        generatedSql: generated_sql,
        correctSql: correct_sql,
        rating,
      });

      const parts = [`Feedback recorded. (ID: ${entry.id})`];
      if (entry.errorType) {
        parts.push(`Error type: ${entry.errorType}`);
      }
      if (entry.promotedToFewShot) {
        parts.push("Repeated errors of the same type — auto-promoted to few-shot example.");
      }

      return { content: [{ type: "text", text: parts.join("\n") }] };
    },
  );

  server.tool(
    "evaluate_queries",
    "Manage SQL accuracy evaluation. Add/list test cases, run evaluations, and view results.",
    {
      data_source_id: z.number().describe("Data source ID"),
      action: z.enum(["list_tests", "add_test", "remove_test", "run", "results"]).describe("Action to perform"),
      test_case: z
        .object({
          question: z.string().describe("Natural-language question"),
          ground_truth_sql: z.string().describe("Ground-truth SQL"),
          difficulty: z.enum(["simple", "medium", "complex"]).describe("Difficulty level"),
          tags: z.array(z.string()).optional().describe("Tags"),
        })
        .optional()
        .describe("Test case to add (required when action=add_test)"),
      test_case_id: z.string().optional().describe("Test case ID to remove (required when action=remove_test)"),
      generated_sqls: z
        .array(
          z.object({
            test_case_id: z.string().describe("Test case ID"),
            generated_sql: z.string().describe("Generated SQL"),
          }),
        )
        .optional()
        .describe("List of SQL to evaluate (required when action=run)"),
    },
    async ({ data_source_id, action, test_case, test_case_id, generated_sqls }) => {
      if (action === "list_tests") {
        const store = await loadTestSuite(data_source_id);
        if (store.testCases.length === 0) {
          return { content: [{ type: "text", text: "No test cases registered." }] };
        }
        const text = store.testCases
          .map(
            (tc) =>
              `**[${tc.id}]** ${tc.question}\nDifficulty: ${tc.difficulty} | Tags: ${tc.tags.join(", ")}\n\`\`\`sql\n${tc.groundTruthSql}\n\`\`\``,
          )
          .join("\n\n---\n\n");
        return { content: [{ type: "text", text: `Total ${store.testCases.length} test case(s):\n\n${text}` }] };
      }

      if (action === "add_test") {
        if (!test_case) {
          return { content: [{ type: "text", text: "The test_case parameter is required." }] };
        }
        const added = await addTestCase(data_source_id, {
          question: test_case.question,
          groundTruthSql: test_case.ground_truth_sql,
          difficulty: test_case.difficulty,
          tags: test_case.tags ?? [],
        });
        return {
          content: [{ type: "text", text: `Test case added. (ID: ${added.id})` }],
        };
      }

      if (action === "remove_test") {
        if (!test_case_id) {
          return { content: [{ type: "text", text: "The test_case_id parameter is required." }] };
        }
        const removed = await removeTestCase(data_source_id, test_case_id);
        return {
          content: [
            {
              type: "text",
              text: removed ? `Test case ${test_case_id} has been removed.` : `Test case ${test_case_id} not found.`,
            },
          ],
        };
      }

      if (action === "run") {
        if (!generated_sqls || generated_sqls.length === 0) {
          return { content: [{ type: "text", text: "The generated_sqls parameter is required." }] };
        }
        const run = await runEvaluation(
          data_source_id,
          generated_sqls.map((gs) => ({
            testCaseId: gs.test_case_id,
            generatedSql: gs.generated_sql,
          })),
        );
        return { content: [{ type: "text", text: formatEvalResults(run) }] };
      }

      if (action === "results") {
        const store = await loadTestSuite(data_source_id);
        if (store.runs.length === 0) {
          return { content: [{ type: "text", text: "No evaluation runs found." }] };
        }
        const lastRun = store.runs[store.runs.length - 1];
        return { content: [{ type: "text", text: formatEvalResults(lastRun) }] };
      }

      return { content: [{ type: "text", text: "Invalid action" }] };
    },
  );

  server.tool(
    "manage_keyword_map",
    "Manage keyword-to-table-name mappings. After inspecting the schema with list_tables, register domain-specific mappings to improve smart_query table-matching accuracy. e.g., {\"revenue\": [\"payment\"], \"creator\": [\"creator\"]}",
    {
      data_source_id: z.number().describe("Data source ID"),
      action: z.enum(["list", "add", "remove", "reset"]).describe("Action to perform"),
      mappings: z
        .record(z.array(z.string()))
        .optional()
        .describe("Mappings to add (required when action=add). e.g., {\"revenue\": [\"payment\", \"billing\"]}"),
      keywords: z
        .array(z.string())
        .optional()
        .describe("Keywords to remove (required when action=remove). e.g., [\"revenue\", \"order\"]"),
    },
    async ({ data_source_id, action, mappings, keywords }) => {
      if (action === "list") {
        const effective = await getEffectiveMap(data_source_id);
        const custom = await loadKeywordMap(data_source_id);
        const defaultCount = Object.keys(DEFAULT_KEYWORD_MAP).length;
        const customCount = Object.keys(custom).length;

        const lines = [
          `## Keyword Map (Data Source ${data_source_id})\n`,
          `Default: ${defaultCount} | Custom: ${customCount} | Total: ${Object.keys(effective).length}\n`,
        ];

        if (customCount > 0) {
          lines.push("### Custom mappings:");
          for (const [ko, en] of Object.entries(custom)) {
            lines.push(`- **${ko}** → ${en.join(", ")}`);
          }
          lines.push("");
        }

        lines.push("### All effective mappings:");
        for (const [ko, en] of Object.entries(effective)) {
          const isCustom = ko in custom;
          lines.push(`- ${isCustom ? "**" : ""}${ko}${isCustom ? "** (custom)" : ""} → ${en.join(", ")}`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      if (action === "add") {
        if (!mappings || Object.keys(mappings).length === 0) {
          return { content: [{ type: "text", text: "The mappings parameter is required. e.g., {\"revenue\": [\"payment\"]}" }] };
        }
        const updated = await addMappings(data_source_id, mappings);
        const added = Object.keys(mappings);
        return {
          content: [
            {
              type: "text",
              text: `${added.length} keyword mapping(s) added/updated: ${added.join(", ")}`,
            },
          ],
        };
      }

      if (action === "remove") {
        if (!keywords || keywords.length === 0) {
          return { content: [{ type: "text", text: "The keywords parameter is required." }] };
        }
        await removeMappings(data_source_id, keywords);
        return {
          content: [{ type: "text", text: `${keywords.length} custom keyword(s) removed: ${keywords.join(", ")}` }],
        };
      }

      if (action === "reset") {
        await resetMappings(data_source_id);
        return {
          content: [{ type: "text", text: "Custom mappings have been reset. Only default mappings will be used." }],
        };
      }

      return { content: [{ type: "text", text: "Invalid action" }] };
    },
  );

  server.tool(
    "get_bird_config",
    "View BIRD SQL configuration and status.",
    {},
    async () => {
      const config = await loadConfig();
      const configDir = getConfigDir();

      const lines = [
        "## BIRD SQL Configuration\n",
        `Config directory: \`${configDir}\`\n`,
        "### Settings:",
        `- Schema Pruning: ${config.bird.schemaPruning.enabled ? "ON" : "OFF"} (Top-K: ${config.bird.schemaPruning.topK})`,
        `- Few-shot Examples: ${config.bird.fewShot.enabled ? "ON" : "OFF"} (Max per query: ${config.bird.fewShot.maxExamplesPerQuery})`,
        `- Feedback Loop: ${config.bird.feedback.enabled ? "ON" : "OFF"} (Auto-promote threshold: ${config.bird.feedback.autoPromoteThreshold})`,
        `- Complexity Assessment: ${config.bird.complexity.enabled ? "ON" : "OFF"}`,
        "",
        `Edit \`${configDir}/config.json\` to customize settings.`,
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
