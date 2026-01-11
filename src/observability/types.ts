export interface EvalTrace {
  id: string;
  evalId: string;
  startedAt: string;
  completedAt: string;
  duration: number;
  
  status: 'success' | 'partial' | 'failed';
  
  introspection: IntrospectionTrace;
  analysis: AnalysisTrace;
  generation: GenerationTrace;
  execution: ExecutionTrace;
  
  errors: TraceError[];
}

export interface IntrospectionTrace {
  filesAnalyzed: string[];
  totalFunctions: number;
  totalClasses: number;
  duration: number;
}

export interface AnalysisTrace {
  promptTokens: number;
  completionTokens: number;
  toolCalls: ToolCall[];
  questionsAsked: Question[];
  decisions: Decision[];
}

export interface GenerationTrace {
  scenariosGenerated: number;
  filesWritten: string[];
}

export interface ExecutionTrace {
  testsPassed: number;
  testsFailed: number;
  testsSkipped: number;
  failures: TestFailure[];
}

export interface ToolCall {
  timestamp: string;
  tool: string;
  input: unknown;
  output: unknown;
  duration: number;
}

export interface Question {
  id: string;
  timestamp: string;
  question: string;
  options?: string[];
  answer?: string;
  defaultAnswer?: string;
}

export interface Decision {
  timestamp: string;
  type: 'include' | 'exclude' | 'prioritize' | 'question';
  subject: string;
  reasoning: string;
  confidence: number;
}

export interface TestFailure {
  scenarioId: string;
  testName: string;
  error: string;
  stack?: string;
  expected?: unknown;
  actual?: unknown;
}

export interface TraceError {
  timestamp: string;
  message: string;
  stack?: string;
  context?: string;
}

export interface TraceEvent {
  timestamp: string;
  type: 'tool_start' | 'tool_end' | 'question' | 'decision' | 'error' | 'info';
  data: unknown;
}

export interface TraceListItem {
  id: string;
  evalId: string;
  startedAt: string;
  status: EvalTrace['status'];
  duration: number;
  testsPassed: number;
  testsFailed: number;
}
