export interface PromptfooConfig {
  description?: string;
  providers: PromptfooProvider[];
  prompts: string[];
  tests: PromptfooTest[];
  defaultTest?: PromptfooDefaultTest;
  outputPath?: string;
}

export interface PromptfooProvider {
  id: string;
  label?: string;
  config?: Record<string, unknown>;
}

export interface PromptfooTest {
  description?: string;
  vars?: Record<string, unknown>;
  assert?: PromptfooAssertion[];
  options?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface PromptfooAssertion {
  type: string;
  value?: unknown;
  threshold?: number;
  weight?: number;
  provider?: string;
}

export interface PromptfooDefaultTest {
  assert?: PromptfooAssertion[];
  options?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface PromptfooResult {
  version: number;
  timestamp: string;
  results: PromptfooTestResult[];
  stats: {
    successes: number;
    failures: number;
    tokenUsage: {
      total: number;
      prompt: number;
      completion: number;
    };
  };
}

export interface PromptfooTestResult {
  prompt: {
    raw: string;
    label: string;
  };
  vars: Record<string, unknown>;
  response: {
    output: string;
    tokenUsage?: {
      total: number;
      prompt: number;
      completion: number;
    };
  };
  gradingResult: {
    pass: boolean;
    score: number;
    reason?: string;
    componentResults?: Array<{
      pass: boolean;
      score: number;
      reason: string;
      assertion: PromptfooAssertion;
    }>;
  };
  success: boolean;
  error?: string;
}

export interface EvalConfig {
  specPath: string;
  testDir: string;
  outputDir: string;
  framework: 'pytest' | 'vitest' | 'jest';
  uiPort: number;
  watch: boolean;
}
