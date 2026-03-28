export interface FewShotExample {
  id: string;
  question: string;
  sql: string;
  tables: string[];
  tags: string[];
  notes: string;
  source: "manual" | "feedback";
  createdAt: string;
}

export interface FeedbackEntry {
  id: string;
  question: string;
  generatedSql: string;
  correctSql?: string;
  rating: "up" | "down";
  errorType?: string;
  promotedToFewShot: boolean;
  createdAt: string;
}

export interface EvalTestCase {
  id: string;
  question: string;
  groundTruthSql: string;
  difficulty: "simple" | "medium" | "complex";
  tags: string[];
}

export interface EvalRunResult {
  testCaseId: string;
  generatedSql: string;
  match: boolean;
  details?: string;
}

export interface EvalRun {
  runId: string;
  timestamp: string;
  results: EvalRunResult[];
  accuracy: {
    overall: number;
    simple: number;
    medium: number;
    complex: number;
  };
}

export interface PrunedTable {
  name: string;
  columns: Array<{ name: string; type: string }>;
  score: number;
}

export interface ComplexityAssessment {
  level: "simple" | "medium" | "complex";
  reasoning: string;
  hints: string[];
}

export type SmartQueryAction = "clarify" | "generate" | "explain";

export interface SmartQueryResponse {
  action: SmartQueryAction;
  schema?: string;
  fewShotExamples?: string;
  complexity?: ComplexityAssessment;
  clarificationQuestions?: string[];
  explanation?: string;
  guidance?: string;
}

export interface BirdConfig {
  bird: {
    enabled: boolean;
    schemaPruning: {
      enabled: boolean;
      topK: number;
      includeSampleValues: boolean;
      maxSampleValues: number;
    };
    fewShot: {
      enabled: boolean;
      maxExamplesPerQuery: number;
    };
    feedback: {
      enabled: boolean;
      autoPromoteThreshold: number;
    };
    complexity: {
      enabled: boolean;
    };
  };
}
