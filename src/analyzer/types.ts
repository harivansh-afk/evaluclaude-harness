export interface EvalSpec {
  version: '1.0';
  repo: {
    name: string;
    languages: string[];
    analyzedAt: string;
  };
  scenarios: EvalScenario[];
  grading: {
    deterministic: DeterministicGrade[];
    rubrics: RubricGrade[];
  };
  metadata: {
    generatedBy: string;
    totalTokens: number;
    questionsAsked: number;
    confidence: 'low' | 'medium' | 'high';
  };
}

export interface EvalScenario {
  id: string;
  name: string;
  description: string;
  target: {
    module: string;
    function: string;
    type: 'function' | 'method' | 'class';
  };
  category: 'unit' | 'integration' | 'edge-case' | 'negative';
  priority: 'critical' | 'high' | 'medium' | 'low';
  setup?: {
    fixtures: string[];
    mocks: MockSpec[];
  };
  input: {
    args: Record<string, unknown>;
    kwargs?: Record<string, unknown>;
  };
  assertions: Assertion[];
  tags: string[];
}

export interface MockSpec {
  target: string;
  returnValue?: unknown;
  sideEffect?: string;
}

export type Assertion =
  | EqualsAssertion
  | ContainsAssertion
  | ThrowsAssertion
  | TypeAssertion
  | MatchesAssertion
  | TruthyAssertion
  | CustomAssertion
  | LLMRubricAssertion;

export interface LLMRubricAssertion extends BaseAssertion {
  type: 'llm-rubric';
  rubric: string;
  criteria: string[];
  passingThreshold?: number;
}

export interface BaseAssertion {
  description?: string;
}

export interface EqualsAssertion extends BaseAssertion {
  type: 'equals';
  expected: unknown;
  path?: string;
}

export interface ContainsAssertion extends BaseAssertion {
  type: 'contains';
  value: unknown;
  path?: string;
}

export interface ThrowsAssertion extends BaseAssertion {
  type: 'throws';
  errorType?: string;
  messageContains?: string;
}

export interface TypeAssertion extends BaseAssertion {
  type: 'typeof';
  expected: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'undefined';
  path?: string;
}

export interface MatchesAssertion extends BaseAssertion {
  type: 'matches';
  pattern: string;
  path?: string;
}

export interface TruthyAssertion extends BaseAssertion {
  type: 'truthy' | 'falsy';
  path?: string;
}

export interface CustomAssertion {
  type: 'custom';
  description: string;
  check: string;
}

export interface DeterministicGrade {
  scenarioId: string;
  check: 'pass' | 'fail' | 'error';
  score: number;
}

export interface RubricGrade {
  scenarioId: string;
  criteria: string;
  maxScore: number;
}

export const EVAL_SPEC_JSON_SCHEMA = {
  type: 'object',
  properties: {
    version: { type: 'string', const: '1.0' },
    repo: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        languages: { type: 'array', items: { type: 'string' } },
        analyzedAt: { type: 'string' },
      },
      required: ['name', 'languages', 'analyzedAt'],
      additionalProperties: false,
    },
    scenarios: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          target: {
            type: 'object',
            properties: {
              module: { type: 'string' },
              function: { type: 'string' },
              type: { type: 'string', enum: ['function', 'method', 'class'] },
            },
            required: ['module', 'function', 'type'],
            additionalProperties: false,
          },
          category: { type: 'string', enum: ['unit', 'integration', 'edge-case', 'negative'] },
          priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          setup: {
            type: 'object',
            properties: {
              fixtures: { type: 'array', items: { type: 'string' } },
              mocks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    target: { type: 'string' },
                    returnValue: {},
                    sideEffect: { type: 'string' },
                  },
                  required: ['target'],
                  additionalProperties: false,
                },
              },
            },
            required: ['fixtures', 'mocks'],
            additionalProperties: false,
          },
          input: {
            type: 'object',
            properties: {
              args: { type: 'object' },
              kwargs: { type: 'object' },
            },
            required: ['args'],
            additionalProperties: false,
          },
          assertions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                expected: {},
                value: {},
                path: { type: 'string' },
                errorType: { type: 'string' },
                messageContains: { type: 'string' },
                pattern: { type: 'string' },
                description: { type: 'string' },
                check: { type: 'string' },
                rubric: { type: 'string' },
                criteria: { type: 'array', items: { type: 'string' } },
                passingThreshold: { type: 'number' },
              },
              required: ['type'],
              additionalProperties: false,
            },
          },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'name', 'description', 'target', 'category', 'priority', 'input', 'assertions', 'tags'],
        additionalProperties: false,
      },
    },
    grading: {
      type: 'object',
      properties: {
        deterministic: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              scenarioId: { type: 'string' },
              check: { type: 'string', enum: ['pass', 'fail', 'error'] },
              score: { type: 'number' },
            },
            required: ['scenarioId', 'check', 'score'],
            additionalProperties: false,
          },
        },
        rubrics: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              scenarioId: { type: 'string' },
              criteria: { type: 'string' },
              maxScore: { type: 'number' },
            },
            required: ['scenarioId', 'criteria', 'maxScore'],
            additionalProperties: false,
          },
        },
      },
      required: ['deterministic', 'rubrics'],
      additionalProperties: false,
    },
    metadata: {
      type: 'object',
      properties: {
        generatedBy: { type: 'string' },
        totalTokens: { type: 'number' },
        questionsAsked: { type: 'number' },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['generatedBy', 'totalTokens', 'questionsAsked', 'confidence'],
      additionalProperties: false,
    },
  },
  required: ['version', 'repo', 'scenarios', 'grading', 'metadata'],
  additionalProperties: false,
} as const;
