export interface Rubric {
  name: string;
  description: string;
  criteria: RubricCriterion[];
  passingThreshold: number;
}

export interface RubricCriterion {
  name: string;
  description: string;
  weight: number;
  examples?: {
    good: string;
    bad: string;
  };
}

export interface RubricGradingResult {
  pass: boolean;
  score: number;
  reason: string;
  criterionScores: CriterionScore[];
}

export interface CriterionScore {
  name: string;
  score: number;
  feedback: string;
}

export interface GradeRequest {
  output: string;
  rubric: string | Rubric;
  context?: Record<string, unknown>;
}

export interface GraderOptions {
  model?: string;
  maxTokens?: number;
  rubricsDir?: string;
}

export interface CalibrationExample {
  input: string;
  expectedScore: number;
  expectedFeedback?: string[];
}

export interface CalibrationSet {
  rubric: string;
  examples: CalibrationExample[];
}

export interface CalibrationResult {
  agreement: number;
  drift: number[];
  needsAdjustment: boolean;
  details: {
    example: CalibrationExample;
    actualScore: number;
    difference: number;
  }[];
}
